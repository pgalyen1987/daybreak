// SQLite store. One file, WAL mode. In production it travels between hourly workflow runs as a
// release asset (see .github/workflows/daybreak.yml); DATA_DIR moves it.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

let db: Database.Database | null = null;

export function open(file = path.join(DATA_DIR, "coinlens.sqlite")): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

export function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS coins (
      address TEXT PRIMARY KEY, symbol TEXT, name TEXT, coin_type TEXT,
      creator_address TEXT, creator_handle TEXT, created_at TEXT,
      first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coin_snapshots (
      address TEXT NOT NULL, ts INTEGER NOT NULL,
      holders INTEGER, market_cap REAL, volume_24h REAL, total_volume REAL, price_usd REAL, mcap_delta_24h REAL,
      PRIMARY KEY (address, ts)
    );
    CREATE TABLE IF NOT EXISTS social_snapshots (
      handle TEXT NOT NULL, ts INTEGER NOT NULL,
      twitter INTEGER, farcaster INTEGER, instagram INTEGER, tiktok INTEGER,
      twitter_user TEXT, farcaster_user TEXT, instagram_user TEXT, tiktok_user TEXT,
      PRIMARY KEY (handle, ts)
    );
    CREATE TABLE IF NOT EXISTS swaps (
      id TEXT PRIMARY KEY, address TEXT NOT NULL, ts INTEGER NOT NULL,
      side TEXT NOT NULL, usd REAL NOT NULL, coin_amount REAL, trader TEXT, tx TEXT
    );
    CREATE INDEX IF NOT EXISTS swaps_by_coin ON swaps (address, ts);
    CREATE TABLE IF NOT EXISTS holder_snapshots (
      address TEXT NOT NULL, day TEXT NOT NULL, wallet TEXT NOT NULL, balance TEXT NOT NULL,
      PRIMARY KEY (address, day, wallet)
    );
    CREATE TABLE IF NOT EXISTS holder_meta (
      address TEXT NOT NULL, day TEXT NOT NULL, total INTEGER NOT NULL, captured INTEGER NOT NULL,
      PRIMARY KEY (address, day)
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, started INTEGER NOT NULL,
      finished INTEGER, items INTEGER, errors INTEGER, note TEXT
    );
  `);
  const cols = (d.prepare("PRAGMA table_info(coins)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("total_supply")) d.exec("ALTER TABLE coins ADD COLUMN total_supply REAL");
  d.exec("CREATE TABLE IF NOT EXISTS swap_coverage (address TEXT PRIMARY KEY, since INTEGER NOT NULL)");
  // Trading rewards (lib/rewards.ts): raw payouts for a week, per-recipient daily totals kept longer
  d.exec(`
    CREATE TABLE IF NOT EXISTS rewards (
      tx TEXT NOT NULL, log_index INTEGER NOT NULL, block INTEGER NOT NULL, ts INTEGER NOT NULL,
      kind TEXT NOT NULL, coin TEXT NOT NULL, currency TEXT NOT NULL,
      creator TEXT, platform TEXT, trade TEXT, protocol TEXT, doppler TEXT,
      creator_amt REAL, platform_amt REAL, trade_amt REAL, protocol_amt REAL, doppler_amt REAL,
      unit_usd REAL,
      PRIMARY KEY (tx, log_index)
    );
    CREATE INDEX IF NOT EXISTS rewards_by_ts ON rewards (ts);
    CREATE INDEX IF NOT EXISTS rewards_by_coin ON rewards (coin, ts);
    CREATE TABLE IF NOT EXISTS reward_daily (
      day TEXT NOT NULL, role TEXT NOT NULL, recipient TEXT NOT NULL,
      usd REAL NOT NULL, events INTEGER NOT NULL, unpriced INTEGER NOT NULL,
      PRIMARY KEY (day, role, recipient)
    );
    CREATE TABLE IF NOT EXISTS cursors (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS prices (address TEXT PRIMARY KEY, usd REAL, ts INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS names (address TEXT PRIMARY KEY, handle TEXT, ts INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS trends (
      address TEXT PRIMARY KEY, symbol TEXT, name TEXT, created_at TEXT, creator_address TEXT,
      first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trend_snapshots (
      address TEXT NOT NULL, ts INTEGER NOT NULL,
      holders INTEGER, market_cap REAL, volume_24h REAL, total_volume REAL,
      PRIMARY KEY (address, ts)
    );
  `);
}
