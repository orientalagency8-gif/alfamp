-- Alfa MP — Auth tables: refresh_tokens + audit_log

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash  TEXT PRIMARY KEY,                     -- SHA-256(token) — голый токен в БД не храним
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL,
    last_used   TIMESTAMPTZ,
    user_agent  TEXT,
    ip          INET,
    revoked_at  TIMESTAMPTZ,
    family_id   UUID NOT NULL                         -- для rotation reuse detection
);
CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_family  ON refresh_tokens(family_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    event       TEXT NOT NULL,
    target      TEXT,
    ip          INET,
    user_agent  TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::JSONB,
    at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user  ON audit_log(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_at    ON audit_log(at DESC);

-- Login attempts log for rate-limiting & forensics
CREATE TABLE IF NOT EXISTS login_attempts (
    id         BIGSERIAL PRIMARY KEY,
    email      TEXT,
    ip         INET NOT NULL,
    success    BOOLEAN NOT NULL,
    at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip  ON login_attempts(ip, at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_em  ON login_attempts(email, at DESC) WHERE email IS NOT NULL;
