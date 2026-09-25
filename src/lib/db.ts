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
  if (!cols.includes("image")) d.exec("ALTER TABLE coins ADD COLUMN image TEXT");
  // 1 = Zora's CDN serves the image, 0 = it can't (a dead source), null = not checked yet
  if (!cols.includes("image_ok")) d.exec("ALTER TABLE coins ADD COLUMN image_ok INTEGER");
  d.exec("CREATE TABLE IF NOT EXISTS swap_coverage (address TEXT PRIMARY KEY, since INTEGER NOT NULL)");
  // Trading rewards (lib/rewards.ts): raw payouts for a day, daily totals per
  // wallet and per coin for 35, per role for good
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
    CREATE TABLE IF NOT EXISTS reward_role_daily (
      day TEXT NOT NULL, role TEXT NOT NULL, usd REAL NOT NULL, events INTEGER NOT NULL, unpriced INTEGER NOT NULL,
      PRIMARY KEY (day, role)
    );
    CREATE TABLE IF NOT EXISTS coin_reward_daily (
      day TEXT NOT NULL, coin TEXT NOT NULL, creator_usd REAL NOT NULL, events INTEGER NOT NULL, unpriced INTEGER NOT NULL,
      PRIMARY KEY (day, coin)
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
  // Farcaster identities, cached for good. Resolving a follower to a wallet is one call per fid,
  // and a large account has hundreds of thousands of followers — far more than an hourly run can
  // do. So the answers are kept: each run tops the index up by a budget, coverage climbs, and the
  // index is shared by every creator (Zora's Farcaster audience overlaps heavily with itself).
  //
  // UNRESOLVED — this table has no ceiling, and the file it lives in is downloaded and uploaded
  // on every hourly run. Measured on 2026-09-21: 296 bytes per fid with the profile columns, 180
  // without. At the workflow's AUDIENCE_BUDGET of 20,000 a run that is ~142 MB a day and ~1 GB a
  // week, moved 24 times a day inside a 55-minute job. @jacob's follower list alone is 142 MB.
  // It needs a cap or a different store before the diffs run unattended for long; dropping the
  // profile columns only buys 39%, so it is a design change, not a tweak.
  d.exec(`
    CREATE TABLE IF NOT EXISTS fids (
      fid INTEGER PRIMARY KEY, username TEXT, display TEXT, pfp TEXT,
      wallets INTEGER NOT NULL, checked INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fid_wallets (
      fid INTEGER NOT NULL, address TEXT NOT NULL,
      PRIMARY KEY (fid, address)
    );
    CREATE INDEX IF NOT EXISTS fid_wallets_by_address ON fid_wallets (address);
  `);
  // Farcaster follow counts Daybreak counts for itself, by walking the public hub. Zora's profile
  // carries a follower number too, but it is a cache that does not move: on 2026-09-21 we compared
  // 60 follower fields across 39 tracked creators with the values Zora served three days earlier
  // and not one had changed, on accounts from 46 followers to 1.9M. Where the count could be
  // checked it was also wrong — @jacob's Zora figure of 292,097 against 478,377 follow records on
  // the hub. So nothing on this site is ranked on Zora's number any more; it is ranked on this
  // table, and a creator who is not in it is left out rather than guessed at.
  //   converged = the walk settled on a total. 0 = it hit its page cap, so the count is a floor.
  d.exec(`
    CREATE TABLE IF NOT EXISTS fc_follows (
      handle TEXT PRIMARY KEY, fid INTEGER NOT NULL, username TEXT,
      follows INTEGER NOT NULL, converged INTEGER NOT NULL, pages INTEGER NOT NULL, ts INTEGER NOT NULL
    );
  `);
  const tcols = (d.prepare("PRAGMA table_info(trends)").all() as { name: string }[]).map((c) => c.name);
  if (!tcols.includes("image")) d.exec("ALTER TABLE trends ADD COLUMN image TEXT");
}
