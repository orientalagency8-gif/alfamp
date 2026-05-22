/**
 * Репозиторный слой для работы с БД.
 * Все SQL-запросы и доменная логика поверх pg-pool.
 */
import { pool } from './pool.ts';

// ============ Types ============

export interface User {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  created_at: Date;
}

export interface ApiKey {
  key: string;
  owner_id: string;
  label: string;
  created_at: Date;
  last_used: Date | null;
  revoked_at: Date | null;
}

export interface Server {
  id: string;
  api_key: string;
  name: string;
  endpoint: string;
  slots: number;
  players: number;
  tags: string[];
  region: string;
  last_heartbeat: Date;
  registered_at: Date;
  verified: boolean;
  is_demo: boolean;
  banned_at: Date | null;
}

export type PublicServer = Omit<Server, 'api_key' | 'banned_at'>;

// ============ Users ============

export async function createUser(email: string, password_hash: string, display_name?: string): Promise<User> {
  const r = await pool.query<User>(
    `INSERT INTO users(email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email.toLowerCase(), password_hash, display_name ?? null]
  );
  return r.rows[0]!;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const r = await pool.query<User>(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return r.rows[0] ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const r = await pool.query<User>(`SELECT * FROM users WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

// ============ API Keys ============

export async function createApiKey(owner_id: string, label: string, key: string): Promise<ApiKey> {
  const r = await pool.query<ApiKey>(
    `INSERT INTO api_keys(key, owner_id, label) VALUES ($1, $2, $3) RETURNING *`,
    [key, owner_id, label]
  );
  return r.rows[0]!;
}

export async function listUserApiKeys(owner_id: string): Promise<ApiKey[]> {
  const r = await pool.query<ApiKey>(
    `SELECT * FROM api_keys WHERE owner_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
    [owner_id]
  );
  return r.rows;
}

export async function validateApiKey(key: string): Promise<ApiKey | null> {
  const r = await pool.query<ApiKey>(
    `SELECT * FROM api_keys WHERE key = $1 AND revoked_at IS NULL`,
    [key]
  );
  if (!r.rows[0]) return null;
  // Update last_used asynchronously (no await)
  pool.query(`UPDATE api_keys SET last_used = NOW() WHERE key = $1`, [key]).catch(() => {});
  return r.rows[0];
}

export async function revokeApiKey(key: string, owner_id: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE api_keys SET revoked_at = NOW() WHERE key = $1 AND owner_id = $2 AND revoked_at IS NULL`,
    [key, owner_id]
  );
  return (r.rowCount ?? 0) > 0;
}

// ============ Servers ============

const HEARTBEAT_ALIVE_SEC = 60;

export interface ServerRegisterInput {
  name: string;
  endpoint: string;
  slots: number;
  tags: string[];
  region: string;
  api_key: string;
  is_demo?: boolean;
}

export async function registerServer(input: ServerRegisterInput): Promise<Server> {
  const r = await pool.query<Server>(
    `INSERT INTO servers(api_key, name, endpoint, slots, tags, region, is_demo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [input.api_key, input.name, input.endpoint, input.slots, input.tags, input.region.toUpperCase(), input.is_demo ?? false]
  );
  return r.rows[0]!;
}

export async function heartbeatServer(server_id: string, api_key: string, players: number): Promise<boolean> {
  const r = await pool.query(
    `UPDATE servers
     SET players = $3, last_heartbeat = NOW()
     WHERE id = $1 AND api_key = $2 AND banned_at IS NULL`,
    [server_id, api_key, players]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function getServer(id: string): Promise<Server | null> {
  const r = await pool.query<Server>(`SELECT * FROM servers WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function listAliveServers(): Promise<PublicServer[]> {
  const r = await pool.query<Server>(
    `SELECT * FROM servers
     WHERE banned_at IS NULL
       AND last_heartbeat > NOW() - INTERVAL '${HEARTBEAT_ALIVE_SEC} seconds'
     ORDER BY players DESC, name ASC`
  );
  return r.rows.map(stripPrivateFields);
}

export async function listUserServers(owner_id: string): Promise<Server[]> {
  const r = await pool.query<Server>(
    `SELECT s.* FROM servers s
       JOIN api_keys k ON k.key = s.api_key
      WHERE k.owner_id = $1
      ORDER BY s.last_heartbeat DESC`,
    [owner_id]
  );
  return r.rows;
}

export async function refreshDemoHeartbeats(): Promise<void> {
  await pool.query(
    `UPDATE servers
     SET last_heartbeat = NOW(),
         players = LEAST(slots, GREATEST(0, players + (FLOOR(RANDOM() * 7) - 3)::INT))
     WHERE is_demo = TRUE`
  );
}

export async function banServer(id: string, reason: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE servers SET banned_at = NOW(), ban_reason = $2 WHERE id = $1 AND banned_at IS NULL`,
    [id, reason]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function verifyServer(id: string, verified: boolean): Promise<boolean> {
  const r = await pool.query(
    `UPDATE servers SET verified = $2 WHERE id = $1`,
    [id, verified]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function pruneDeadServers(thresholdSec = 120): Promise<number> {
  // Удаляем только не-demo и не имеющие активного владельца недавно
  const r = await pool.query(
    `DELETE FROM servers
     WHERE is_demo = FALSE
       AND last_heartbeat < NOW() - INTERVAL '${thresholdSec} seconds'`
  );
  return r.rowCount ?? 0;
}

function stripPrivateFields(s: Server): PublicServer {
  const { api_key, banned_at, ...pub } = s;
  return pub;
}

// ============ Refresh Tokens ============

export interface RefreshTokenRow {
  token_hash: string;
  user_id: string;
  issued_at: Date;
  expires_at: Date;
  last_used: Date | null;
  user_agent: string | null;
  ip: string | null;
  revoked_at: Date | null;
  family_id: string;
}

export async function storeRefreshToken(
  token_hash: string,
  user_id: string,
  family_id: string,
  expires_at: Date,
  user_agent: string | null,
  ip: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens(token_hash, user_id, family_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [token_hash, user_id, family_id, expires_at, user_agent, ip]
  );
}

export async function getRefreshToken(token_hash: string): Promise<RefreshTokenRow | null> {
  const r = await pool.query<RefreshTokenRow>(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
    [token_hash]
  );
  return r.rows[0] ?? null;
}

export async function revokeRefreshToken(token_hash: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [token_hash]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Reuse detection: revoke ALL tokens in this family — обычно делается при попытке reuse */
export async function revokeFamilyTokens(family_id: string): Promise<number> {
  const r = await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
    [family_id]
  );
  return r.rowCount ?? 0;
}

export async function revokeAllUserTokens(user_id: string): Promise<number> {
  const r = await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [user_id]
  );
  return r.rowCount ?? 0;
}

export async function pruneExpiredTokens(): Promise<number> {
  const r = await pool.query(
    `DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '7 days'`
  );
  return r.rowCount ?? 0;
}

// ============ Audit Log ============

export async function logEvent(
  event: string,
  opts: {
    user_id?: string | null;
    target?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log(user_id, event, target, ip, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [opts.user_id ?? null, event, opts.target ?? null, opts.ip ?? null, opts.user_agent ?? null, JSON.stringify(opts.metadata ?? {})]
    );
  } catch (e) {
    // Audit failures must NOT break the request flow
    console.error('[audit] failed to log event:', event, e);
  }
}

// ============ Login Attempts ============

export async function logLoginAttempt(email: string | null, ip: string, success: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO login_attempts(email, ip, success) VALUES ($1, $2, $3)`,
    [email, ip, success]
  );
}

export async function countFailedLogins(ip: string, sinceSec: number): Promise<number> {
  const r = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::INT AS c FROM login_attempts
     WHERE ip = $1 AND success = FALSE AND at > NOW() - ($2 || ' seconds')::INTERVAL`,
    [ip, String(sinceSec)]
  );
  return r.rows[0]!.c;
}

// ============ Stats ============

export async function getCounts() {
  const r = await pool.query<{
    total_servers: number;
    alive_servers: number;
    total_users: number;
    total_keys: number;
  }>(
    `SELECT
        (SELECT COUNT(*)::INT FROM servers WHERE banned_at IS NULL) AS total_servers,
        (SELECT COUNT(*)::INT FROM servers WHERE banned_at IS NULL AND last_heartbeat > NOW() - INTERVAL '${HEARTBEAT_ALIVE_SEC} seconds') AS alive_servers,
        (SELECT COUNT(*)::INT FROM users WHERE is_blocked = FALSE) AS total_users,
        (SELECT COUNT(*)::INT FROM api_keys WHERE revoked_at IS NULL) AS total_keys
    `
  );
  return r.rows[0]!;
}
