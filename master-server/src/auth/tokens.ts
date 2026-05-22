/**
 * Токены:
 * - Access token  — JWT HS256, TTL 15 минут, содержит { sub: userId, role }
 * - Refresh token — opaque 64-байтовый random, TTL 30 дней, хранится в БД как SHA-256
 *
 * Refresh token rotation:
 * - При каждом /refresh старый помечается revoked, выпускается новый
 * - Если revoked-токен пытаются использовать ещё раз — это signal compromised
 *   → revoke всё family (все токены этого family_id)
 */
import crypto from 'node:crypto';

export const ACCESS_TTL_SEC  = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;
export const API_KEY_PREFIX  = 'alfa_pk_';

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');  // ~64 char
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateApiKey(): string {
  return API_KEY_PREFIX + crypto.randomBytes(24).toString('hex');
}

export function generateFamilyId(): string {
  return crypto.randomUUID();
}

/**
 * Загружаем JWT secret. Приоритет:
 * 1. process.env.JWT_SECRET
 * 2. dev-fallback (только NODE_ENV != production)
 *
 * В production без JWT_SECRET — фатально (kill процесс).
 */
export function loadJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET env var required in production (≥32 chars)');
  }
  // Dev fallback
  return 'dev_jwt_secret_DO_NOT_USE_IN_PRODUCTION_dev_jwt_secret_DO_NOT_USE_IN_PROD';
}
