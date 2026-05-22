-- Alfa MP — Initial schema
-- Tables: users, api_keys, servers

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
    is_blocked    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));

CREATE TABLE IF NOT EXISTS api_keys (
    key         TEXT PRIMARY KEY,
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used   TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS servers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key         TEXT NOT NULL REFERENCES api_keys(key) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    endpoint        TEXT NOT NULL,
    slots           INT  NOT NULL CHECK (slots > 0 AND slots <= 1024),
    players         INT  NOT NULL DEFAULT 0 CHECK (players >= 0),
    tags            TEXT[] NOT NULL DEFAULT '{}',
    region          CHAR(2) NOT NULL,
    last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    is_demo         BOOLEAN NOT NULL DEFAULT FALSE,
    banned_at       TIMESTAMPTZ,
    ban_reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_servers_heartbeat ON servers(last_heartbeat DESC);
CREATE INDEX IF NOT EXISTS idx_servers_api_key   ON servers(api_key);
CREATE INDEX IF NOT EXISTS idx_servers_region    ON servers(region);

-- Idempotent migration tracking
CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
