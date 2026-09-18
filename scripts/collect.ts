// Collector. Run modes (default: all):
//   tsx scripts/collect.ts snapshots   coin stats for the tracked universe + creator follower counts
//   tsx scripts/collect.ts swaps       new trades since the last stored one, per coin
//   tsx scripts/collect.ts holders     today's holder set per coin (all holders if small, else the top N)
// Environment: DATA_DIR (sqlite location), ZORA_API_KEY (optional, raises rate limits),
//   PAGES_PER_LIST (default 10 -> up to 200 coins per list), CONCURRENCY (default 3).
import { open } from "../src/lib/db";
import { holders, pool, profileSocials, recentSwaps, universe } from "../src/lib/zora";

const PAGES_PER_LIST = Number(process.env.PAGES_PER_LIST || 10);
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const SWAP_LOOKBACK_MS = 7 * 24 * 3600 * 1000; // first fetch for a coin goes back a week
const SWAP_MAX_PAGES = Number(process.env.SWAP_MAX_PAGES || 25); // 500 trades per coin per run
const HOLDER_FULL_LIMIT = 500; // coins with at most this many holders get a complete snapshot
const HOLDER_TOP_PAGES = 25; // otherwise the top 500 by balance

const db = open();
const now = Date.now();
const day = new Date(now).toISOString().slice(0, 10);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

function startRun(kind: string) {
  return Number(db.prepare("INSERT INTO runs (kind, started) VALUES (?, ?)").run(kind, Date.now()).lastInsertRowid);
}
function endRun(id: number, items: number, errors: number, note = "") {
  db.prepare("UPDATE runs SET finished = ?, items = ?, errors = ?, note = ? WHERE id = ?").run(Date.now(), items, errors, note, id);
}

async function snapshots() {
  const run = startRun("snapshots");
  const coins = await universe(PAGES_PER_LIST);
  log(`universe: ${coins.length} creator coins`);
  const upCoin = db.prepare(`INSERT INTO coins (address, symbol, name, coin_type, creator_address, creator_handle, created_at, first_seen, last_seen, total_supply)
    VALUES (@address, @symbol, @name, @coinType, @creatorAddress, @creatorHandle, @createdAt, @now, @now, @totalSupply)
    ON CONFLICT(address) DO UPDATE SET symbol=excluded.symbol, name=excluded.name, creator_handle=excluded.creator_handle, last_seen=excluded.last_seen, total_supply=excluded.total_supply`);
  const snap = db.prepare(`INSERT OR REPLACE INTO coin_snapshots (address, ts, holders, market_cap, volume_24h, total_volume, price_usd, mcap_delta_24h)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    for (const c of coins) {
      upCoin.run({ ...c, now });
      snap.run(c.address, now, c.uniqueHolders, c.marketCap, c.volume24h, c.totalVolume, c.priceUsd, c.marketCapDelta24h);
    }
  })();

  // Follower counts change slowly; refresh a creator at most once every 20 hours.
  const fresh = new Set((db.prepare("SELECT handle FROM social_snapshots WHERE ts > ?").all(now - 20 * 3600 * 1000) as { handle: string }[]).map((r) => r.handle));
  const handles = [...new Set(coins.map((c) => c.creatorHandle).filter((h): h is string => !!h))].filter((h) => !fresh.has(h));
  log(`profiles to refresh: ${handles.length}`);
  const ins = db.prepare(`INSERT OR REPLACE INTO social_snapshots (handle, ts, twitter, farcaster, instagram, tiktok, twitter_user, farcaster_user, instagram_user, tiktok_user)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let errors = 0, done = 0;
  await pool(handles, CONCURRENCY, async (h) => {
    try {
      const s = await profileSocials(h);
      if (s) ins.run(h, now, s.twitter, s.farcaster, s.instagram, s.tiktok, s.handles.twitter, s.handles.farcaster, s.handles.instagram, s.handles.tiktok);
    } catch (e) { errors++; log("profile error", h, String(e).slice(0, 120)); }
    if (++done % 50 === 0) log(`profiles ${done}/${handles.length}`);
  });
  endRun(run, coins.length, errors, `${handles.length} profiles`);
}

async function swaps() {
  const run = startRun("swaps");
  const coins = db.prepare("SELECT address FROM coins WHERE last_seen > ?").all(now - 3 * 24 * 3600 * 1000) as { address: string }[];
  const last = db.prepare("SELECT MAX(ts) AS ts FROM swaps WHERE address = ?");
  const cover = db.prepare("INSERT OR IGNORE INTO swap_coverage (address, since) VALUES (?, ?)");
  const ins = db.prepare("INSERT OR IGNORE INTO swaps (id, address, ts, side, usd, coin_amount, trader, tx) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  let total = 0, errors = 0, done = 0;
  await pool(coins, CONCURRENCY, async ({ address }) => {
    try {
      const lastTs = (last.get(address) as { ts: number | null }).ts;
      const since = lastTs ?? now - SWAP_LOOKBACK_MS;
      const rows = await recentSwaps(address, since, SWAP_MAX_PAGES);
      // First fetch: coverage starts at the lookback, unless the page cap stopped us earlier.
      if (lastTs === null) cover.run(address, rows.length >= SWAP_MAX_PAGES * 20 ? Math.min(...rows.map((r) => r.ts)) : since);
      db.transaction(() => { for (const s of rows) ins.run(s.id, address, s.ts, s.side, s.usd, s.coinAmount, s.trader, s.tx); })();
      total += rows.length;
    } catch (e) { errors++; log("swaps error", address, String(e).slice(0, 120)); }
    if (++done % 50 === 0) log(`swaps ${done}/${coins.length}, ${total} new`);
  });
  endRun(run, total, errors, `${coins.length} coins`);
  log(`swaps: ${total} new across ${coins.length} coins, ${errors} errors`);
}

async function holderSets() {
  const run = startRun("holders");
  const done = new Set((db.prepare("SELECT address FROM holder_meta WHERE day = ?").all(day) as { address: string }[]).map((r) => r.address));
  const coins = (db.prepare(`SELECT c.address, s.holders FROM coins c
      JOIN coin_snapshots s ON s.address = c.address AND s.ts = (SELECT MAX(ts) FROM coin_snapshots WHERE address = c.address)
      WHERE c.last_seen > ?`).all(now - 3 * 24 * 3600 * 1000) as { address: string; holders: number }[])
    .filter((c) => !done.has(c.address));
  const ins = db.prepare("INSERT OR REPLACE INTO holder_snapshots (address, day, wallet, balance) VALUES (?, ?, ?, ?)");
  const meta = db.prepare("INSERT OR REPLACE INTO holder_meta (address, day, total, captured) VALUES (?, ?, ?, ?)");
  let errors = 0, n = 0;
  await pool(coins, CONCURRENCY, async (c) => {
    try {
      const pages = c.holders <= HOLDER_FULL_LIMIT ? Math.ceil(HOLDER_FULL_LIMIT / 20) : HOLDER_TOP_PAGES;
      const h = await holders(c.address, pages);
      db.transaction(() => {
        for (const r of h.rows) ins.run(c.address, day, r.wallet, r.balance);
        meta.run(c.address, day, h.total, h.rows.length);
      })();
    } catch (e) { errors++; log("holders error", c.address, String(e).slice(0, 120)); }
    if (++n % 25 === 0) log(`holders ${n}/${coins.length}`);
  });
  endRun(run, coins.length, errors);
  log(`holders: ${coins.length} coins, ${errors} errors`);
}

async function main() {
  const mode = process.argv[2] ?? "all";
  const t0 = Date.now();
  if (mode === "snapshots" || mode === "all") await snapshots();
  if (mode === "swaps" || mode === "all") await swaps();
  if (mode === "holders" || mode === "all") await holderSets();
  log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
