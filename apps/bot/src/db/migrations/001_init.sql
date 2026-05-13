-- 001_init.sql — schema for SIR Discord role bot
-- See plan: C:\Users\nilga\.claude\plans\i-want-to-implement-twinkling-meadow.md

CREATE TABLE IF NOT EXISTS users (
  discord_id      TEXT PRIMARY KEY,
  linked_at       INTEGER NOT NULL,
  last_tier       TEXT,
  last_total_wei  TEXT NOT NULL DEFAULT '0',
  last_refreshed  INTEGER,
  pending_refresh INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wallets (
  wallet_address TEXT PRIMARY KEY COLLATE NOCASE,
  discord_id     TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  verified_at    INTEGER NOT NULL,
  label          TEXT
);
CREATE INDEX IF NOT EXISTS idx_wallets_discord ON wallets(discord_id);

CREATE TABLE IF NOT EXISTS verification_nonces (
  nonce        TEXT PRIMARY KEY,
  discord_id   TEXT NOT NULL,
  issued_at    INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  consumed_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_nonces_discord ON verification_nonces(discord_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_nonces_expiry ON verification_nonces(expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS balance_cache (
  wallet_address TEXT NOT NULL COLLATE NOCASE,
  chain_id       INTEGER NOT NULL,
  balance_wei    TEXT NOT NULL,
  fetched_at     INTEGER NOT NULL,
  PRIMARY KEY (wallet_address, chain_id)
);

CREATE TABLE IF NOT EXISTS verify_attempts (
  discord_id   TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts ON verify_attempts(discord_id, attempted_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
