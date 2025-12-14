import Database from "better-sqlite3";

export const db = new Database("gcab.db");

// Core tables
db.exec(`
CREATE TABLE IF NOT EXISTS players (
  address TEXT PRIMARY KEY,
  last_seen_utc INTEGER NOT NULL,
  energy_balance INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS energy_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  address TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  meta TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mint_log (
  day TEXT PRIMARY KEY,
  minted_at INTEGER NOT NULL
);

-- SIWE-lite sessions / nonces (your current style: nonce-only)
CREATE TABLE IF NOT EXISTS sessions (
  address TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sidekicks (your current model)
CREATE TABLE IF NOT EXISTS sidekicks (
  owner TEXT PRIMARY KEY,
  sidekick TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Holders cache (EOA-only filtering via is_contract flag)
CREATE TABLE IF NOT EXISTS holders_cache (
  address TEXT PRIMARY KEY,
  balance_raw TEXT NOT NULL,
  balance_num REAL NOT NULL,
  is_contract INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_holders_cache_balance ON holders_cache(balance_num DESC);
CREATE INDEX IF NOT EXISTS idx_sidekicks_updated ON sidekicks(updated_at DESC);
`);
