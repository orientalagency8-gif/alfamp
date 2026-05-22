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
