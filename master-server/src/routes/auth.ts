/**
 * /v1/auth/* — регистрация, логин, refresh, logout.
 *
 * Защиты:
 * - Argon2id hashing
 * - dummy-verify против user-enumeration через timing
 * - generic error на login (не отличаем "неверный пароль" от "юзер не найден")
 * - rate-limit per IP (fastify-rate-limit)
 * - block после N failed логинов за окно
 * - refresh token rotation + reuse detection (revoke family)
 * - audit_log на все события
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as repo from '../db/repo.ts';
import { hashPassword, verifyPassword, dummyVerify } from '../auth/password.ts';
import {
  ACCESS_TTL_SEC, REFRESH_TTL_SEC,
  generateRefreshToken, hashRefreshToken, generateFamilyId
} from '../auth/tokens.ts';

const RegisterSchema = z.object({
  email:        z.string().email().max(254),
  password:     z.string().min(12).max(128),
  display_name: z.string().min(1).max(80).optional()
});

const LoginSchema = z.object({
  email:    z.string().email().max(254),
  password: z.string().min(1).max(128)
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(20).max(512)
});

const LogoutSchema = z.object({
  refresh_token: z.string().min(20).max(512).optional()
});

const FAILED_LOGIN_WINDOW_SEC = 15 * 60; // 15 минут
const FAILED_LOGIN_THRESHOLD  = 10;       // 10 неудач за окно → блок IP на час

function ip(req: FastifyRequest): string {
  return (req.headers['x-real-ip'] as string)
    || (req.headers['x-forwarded-for'] as string || '').split(',')[0]?.trim()
    || req.ip;
}

function ua(req: FastifyRequest): string | null {
  return (req.headers['user-agent'] as string) || null;
}

export async function authRoutes(app: FastifyInstance) {

  // --- POST /v1/auth/register ----------------------------------------------
  app.post('/v1/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } }
  }, async (req, reply) => {
    const parse = RegisterSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'validation', issues: parse.error.flatten() });
    }
    const { email, password, display_name } = parse.data;

    const existing = await repo.getUserByEmail(email);
    if (existing) {
      // Анти-enumeration: возвращаем общую ошибку, не "email already taken"
      // (компромисс с UX — для удобства решено сообщить честно. NIST 800-63B позволяет, поскольку
      // регистрация — публичный action, и rate-limit защищает от массового перебора.)
      await repo.logEvent('auth.register.duplicate_email', { ip: ip(req), user_agent: ua(req), metadata: { email } });
      return reply.code(409).send({ error: 'email_already_registered' });
    }

    const password_hash = await hashPassword(password);
    const user = await repo.createUser(email, password_hash, display_name);

    await repo.logEvent('auth.register.ok', { user_id: user.id, ip: ip(req), user_agent: ua(req) });

    return reply.code(201).send({
      user: { id: user.id, email: user.email, display_name: user.display_name }
    });
  });

  // --- POST /v1/auth/login -------------------------------------------------
  app.post('/v1/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } }
  }, async (req, reply) => {
    const reqIp = ip(req);

    // IP-level brute-force защита
    const failedCount = await repo.countFailedLogins(reqIp, FAILED_LOGIN_WINDOW_SEC);
    if (failedCount >= FAILED_LOGIN_THRESHOLD) {
      await repo.logEvent('auth.login.ip_blocked', { ip: reqIp, user_agent: ua(req), metadata: { failed: failedCount } });
      return reply.code(429).send({ error: 'too_many_failed_attempts' });
    }

    const parse = LoginSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'validation', issues: parse.error.flatten() });
    }
    const { email, password } = parse.data;

    const user = await repo.getUserByEmail(email);
    if (!user) {
      await dummyVerify();    // ensure constant time
      await repo.logLoginAttempt(email, reqIp, false);
      await repo.logEvent('auth.login.failed', { ip: reqIp, user_agent: ua(req), metadata: { reason: 'no_user' } });
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    if (user.is_blocked) {
      await repo.logLoginAttempt(email, reqIp, false);
      await repo.logEvent('auth.login.failed', { user_id: user.id, ip: reqIp, metadata: { reason: 'blocked' } });
      return reply.code(403).send({ error: 'account_blocked' });
    }

    const ok = await verifyPassword(user.password_hash, password);
    if (!ok) {
      await repo.logLoginAttempt(email, reqIp, false);
      await repo.logEvent('auth.login.failed', { user_id: user.id, ip: reqIp, metadata: { reason: 'wrong_password' } });
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    // Success → issue tokens
    const familyId = generateFamilyId();
    const refresh = generateRefreshToken();
    const refreshHash = hashRefreshToken(refresh);
    const expires = new Date(Date.now() + REFRESH_TTL_SEC * 1000);
    await repo.storeRefreshToken(refreshHash, user.id, familyId, expires, ua(req), reqIp);

    const access = await reply.jwtSign(
      { sub: user.id, role: user.is_admin ? 'admin' : 'user' },
      { expiresIn: `${ACCESS_TTL_SEC}s` }
    );

    await repo.logLoginAttempt(email, reqIp, true);
    await repo.logEvent('auth.login.ok', { user_id: user.id, ip: reqIp, user_agent: ua(req) });

    return {
      access_token: access,
      access_expires_in: ACCESS_TTL_SEC,
      refresh_token: refresh,
      refresh_expires_in: REFRESH_TTL_SEC,
      user: { id: user.id, email: user.email, display_name: user.display_name, is_admin: user.is_admin }
    };
  });

  // --- POST /v1/auth/refresh -----------------------------------------------
  app.post('/v1/auth/refresh', {
    config: { rateLimit: { max: 30, timeWindow: '5 minutes' } }
  }, async (req, reply) => {
    const parse = RefreshSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'validation' });

    const tokenHash = hashRefreshToken(parse.data.refresh_token);
    const row = await repo.getRefreshToken(tokenHash);

    if (!row) {
      await repo.logEvent('auth.refresh.invalid', { ip: ip(req), user_agent: ua(req) });
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }

    // Reuse detection — токен уже revoked, но кто-то им пользуется ⇒ компрометация
    if (row.revoked_at) {
      await repo.revokeFamilyTokens(row.family_id);
      await repo.logEvent('auth.refresh.reuse_detected', {
        user_id: row.user_id, ip: ip(req), user_agent: ua(req),
        metadata: { family_id: row.family_id }
      });
      return reply.code(401).send({ error: 'token_reuse_detected' });
    }

    if (row.expires_at < new Date()) {
      return reply.code(401).send({ error: 'refresh_token_expired' });
    }

    const user = await repo.getUserById(row.user_id);
    if (!user || user.is_blocked) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    // Rotate: revoke old + issue new in same family
    await repo.revokeRefreshToken(tokenHash);
    const newRefresh = generateRefreshToken();
    const newHash = hashRefreshToken(newRefresh);
    const newExpires = new Date(Date.now() + REFRESH_TTL_SEC * 1000);
    await repo.storeRefreshToken(newHash, user.id, row.family_id, newExpires, ua(req), ip(req));

    const access = await reply.jwtSign(
      { sub: user.id, role: user.is_admin ? 'admin' : 'user' },
      { expiresIn: `${ACCESS_TTL_SEC}s` }
    );

    await repo.logEvent('auth.refresh.ok', { user_id: user.id, ip: ip(req) });

    return {
      access_token: access,
      access_expires_in: ACCESS_TTL_SEC,
      refresh_token: newRefresh,
      refresh_expires_in: REFRESH_TTL_SEC
    };
  });

  // --- POST /v1/auth/logout ------------------------------------------------
  app.post('/v1/auth/logout', async (req, reply) => {
    const parse = LogoutSchema.safeParse(req.body);
    if (parse.success && parse.data.refresh_token) {
      const tokenHash = hashRefreshToken(parse.data.refresh_token);
      const row = await repo.getRefreshToken(tokenHash);
      if (row && !row.revoked_at) {
        await repo.revokeRefreshToken(tokenHash);
        await repo.logEvent('auth.logout', { user_id: row.user_id, ip: ip(req) });
      }
    }
    return { status: 'ok' };
  });
}
