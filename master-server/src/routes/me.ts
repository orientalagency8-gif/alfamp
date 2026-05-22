/**
 * /v1/me/* — защищённые ручки текущего юзера:
 * - GET    /v1/me                  — текущий пользователь
 * - GET    /v1/me/api-keys         — мои API-ключи
 * - POST   /v1/me/api-keys         — создать новый API-ключ
 * - DELETE /v1/me/api-keys/:key    — revoke ключ
 * - GET    /v1/me/servers          — мои зарегистрированные серверы
 * - DELETE /v1/me/servers/:id      — удалить свой сервер
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as repo from '../db/repo.ts';
import { generateApiKey } from '../auth/tokens.ts';

const CreateApiKeySchema = z.object({
  label: z.string().min(1).max(64)
});

export async function meRoutes(app: FastifyInstance) {

  app.get('/v1/me', { preHandler: [app.requireAuth] }, async (req) => {
    const u = req.currentUser!;
    return {
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      is_admin: u.is_admin,
      created_at: u.created_at
    };
  });

  app.get('/v1/me/api-keys', { preHandler: [app.requireAuth] }, async (req) => {
    const keys = await repo.listUserApiKeys(req.currentUser!.id);
    return {
      keys: keys.map(k => ({
        key: k.key,             // показываем полный ключ только владельцу
        label: k.label,
        created_at: k.created_at,
        last_used: k.last_used
      })),
      count: keys.length
    };
  });

  app.post('/v1/me/api-keys', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const parse = CreateApiKeySchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'validation', issues: parse.error.flatten() });

    const userId = req.currentUser!.id;
    const userKeys = await repo.listUserApiKeys(userId);
    if (userKeys.length >= 20) {
      return reply.code(429).send({ error: 'too_many_keys', limit: 20 });
    }

    const key = generateApiKey();
    await repo.createApiKey(userId, parse.data.label, key);
    await repo.logEvent('api_key.created', { user_id: userId, target: key, metadata: { label: parse.data.label } });

    return reply.code(201).send({
      key,
      label: parse.data.label,
      created_at: new Date().toISOString(),
      warning: 'Save this key — мы его больше не покажем целиком'
    });
  });

  app.delete<{ Params: { key: string } }>('/v1/me/api-keys/:key', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const userId = req.currentUser!.id;
    const ok = await repo.revokeApiKey(req.params.key, userId);
    if (!ok) return reply.code(404).send({ error: 'not_found_or_already_revoked' });
    await repo.logEvent('api_key.revoked', { user_id: userId, target: req.params.key });
    return { status: 'ok' };
  });

  app.get('/v1/me/servers', { preHandler: [app.requireAuth] }, async (req) => {
    const servers = await repo.listUserServers(req.currentUser!.id);
    return { servers, count: servers.length };
  });

  app.delete<{ Params: { id: string } }>('/v1/me/servers/:id', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const userId = req.currentUser!.id;
    // Проверяем что сервер принадлежит юзеру
    const all = await repo.listUserServers(userId);
    const owned = all.find(s => s.id === req.params.id);
    if (!owned) return reply.code(404).send({ error: 'not_found' });

    await repo.banServer(req.params.id, 'deleted_by_owner');
    await repo.logEvent('server.deleted', { user_id: userId, target: req.params.id });
    return { status: 'ok' };
  });
}
