import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const pool = new pg.Pool({
  host:     process.env.PG_HOST     || '127.0.0.1',
  port:     Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DB       || 'alfamp',
  user:     process.env.PG_USER     || 'alfamp',
  password: process.env.PG_PASSWORD || 'alfamp',
  max:      Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

/** Прогоняет все .sql-файлы из ./migrations по очереди, отслеживая через _migrations таблицу. */
export async function runMigrations(): Promise<void> {
  // Сначала точно есть _migrations таблица — она в первом миграционном скрипте
  // На первом запуске её ещё нет, поэтому делаем CREATE отдельно
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const dir = join(__dirname, 'migrations');
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const exists = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
    if (exists.rowCount && exists.rowCount > 0) continue;
    const sql = readFileSync(join(dir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] ✓ ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ✗ ${file}:`, e);
      throw e;
    } finally {
      client.release();
    }
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const r = await pool.query('SELECT 1 AS ok');
    return r.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
