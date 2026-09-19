// Collector. Run modes (default: all):
//   tsx scripts/collect.ts snapshots   coin stats for the tracked universe + creator follower counts
//   tsx scripts/collect.ts swaps       new trades since the last stored one, per coin
//   tsx scripts/collect.ts holders     today's holder set per coin (all holders if small, else the top N)
//   tsx scripts/collect.ts rewards     every Zora trading-reward payout since the last run, from Base's logs
//   tsx scripts/collect.ts trends      trend coins (Zora's tags): stats hourly, holder sets of the busiest daily
// Environment: DATA_DIR (sqlite location), ZORA_API_KEY (optional, raises rate limits),
//   PAGES_PER_LIST (default 10 -> up to 200 coins per list), CONCURRENCY (default 3),
//   HOLDER_MAX_COINS (holder sets fetched per run; default all), BASE_RPC_URL (default Base's public RPC).
import { open } from "../src/lib/db";
import { chunks, blockTime, decodeReward, ROLES, USDC, ZORA_TOKEN, MARKET_TOPIC, CREATOR_TOPIC, zoraUsd, type RawLog, type Reward } from "../src/lib/rewards";
import { coinQuote, holders, pool, profileHandle, profileSocials, recentSwaps, trendUniverse, universe } from "../src/lib/zora";
import { thumb } from "../src/lib/images";

const PAGES_PER_LIST = Number(process.env.PAGES_PER_LIST || 10);
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const SWAP_LOOKBACK_MS = 7 * 24 * 3600 * 1000; // first fetch for a coin goes back a week
const SWAP_MAX_PAGES = Number(process.env.SWAP_MAX_PAGES || 25); // 500 trades per coin per run
const HOLDER_FULL_LIMIT = 500; // coins with at most this many holders get a complete snapshot
const HOLDER_TOP_PAGES = 25; // otherwise the top 500 by balance
// Coins per run whose holders are fetched. The hourly workflow caps it so one run can't outlast
// its time limit; coins done today are skipped, so the day's first runs share the work.
const HOLDER_MAX_COINS = Number(process.env.HOLDER_MAX_COINS || Infinity);

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
  const upCoin = db.prepare(`INSERT INTO coins (address, symbol, name, coin_type, creator_address, creator_handle, created_at, first_seen, last_seen, total_supply, image)
    VALUES (@address, @symbol, @name, @coinType, @creatorAddress, @creatorHandle, @createdAt, @now, @now, @totalSupply, @image)
    ON CONFLICT(address) DO UPDATE SET symbol=excluded.symbol, name=excluded.name, creator_handle=excluded.creator_handle, last_seen=excluded.last_seen, total_supply=excluded.total_supply,
      image=COALESCE(excluded.image, coins.image),
      image_ok=CASE WHEN excluded.image IS NOT NULL AND excluded.image IS NOT coins.image THEN NULL ELSE coins.image_ok END`);
  const snap = db.prepare(`INSERT OR REPLACE INTO coin_snapshots (address, ts, holders, market_cap, volume_24h, total_volume, price_usd, mcap_delta_24h)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    for (const c of coins) {
      upCoin.run({ ...c, now });
      snap.run(c.address, now, c.uniqueHolders, c.marketCap, c.volume24h, c.totalVolume, c.priceUsd, c.marketCapDelta24h);
    }
  })();
  // Some coin art points at a source that's gone (Zora's CDN answers 500), which would show as a
  // broken request on every page. Each image is fetched once, as the small thumb the pages use.
  const unchecked = db.prepare("SELECT address, image FROM coins WHERE image IS NOT NULL AND image_ok IS NULL").all() as { address: string; image: string }[];
  const mark = db.prepare("UPDATE coins SET image_ok = ? WHERE address = ?");
  let dead = 0;
  for (let i = 0; i < unchecked.length; i += 8) {
    const batch = unchecked.slice(i, i + 8);
    const oks = await Promise.all(batch.map(async (c) => {
      try {
        const r = await fetch(thumb(c.image, 32)!, { signal: AbortSignal.timeout(10000) });
        return r.ok && (r.headers.get("content-type") || "").startsWith("image/");
      } catch { return null; } // a timeout says nothing about the image: check again next run
    }));
    batch.forEach((c, j) => { if (oks[j] !== null) { mark.run(oks[j] ? 1 : 0, c.address); if (!oks[j]) dead++; } });
  }
  if (unchecked.length) log(`images: checked ${unchecked.length}, ${dead} unavailable`);

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
    .filter((c) => !done.has(c.address))
    .slice(0, HOLDER_MAX_COINS);
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

// --- rewards ---------------------------------------------------------------------------------
const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const REWARD_CHUNK = 1500;       // blocks per eth_getLogs call (an hour is 1,800; ~400 payouts)
const REWARD_MAX_CHUNKS = 60;    // per run, so a long gap catches up over several runs
const REWARD_BACKFILL = 43_200;  // the first run starts a day back
const PRICE_FETCH_MAX = 60;      // unknown currencies priced per run; the rest wait for the next
const NAME_FETCH_MAX = 40;       // wallets given a Zora handle per run

async function rpc<T>(method: string, params: unknown[], tries = 4): Promise<T> {
  let wait = 1000;
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(`${method}: ${j.error.message}`);
      return j.result as T;
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((ok) => setTimeout(ok, wait));
      wait *= 2;
    }
  }
}
const hex = (n: number) => "0x" + n.toString(16);

/** USD per unit of each currency: USDC is 1, ZORA via any coin priced in it, creator coins from our
 *  snapshots or a recent price, else the API (capped per run). Unknown stays null (counted unpriced). */
async function unitPrices(currencies: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const tracked = db.prepare(`SELECT s.price_usd AS usd FROM coin_snapshots s WHERE s.address = ? ORDER BY ts DESC LIMIT 1`);
  const cached = db.prepare("SELECT usd FROM prices WHERE address = ? AND ts > ?");
  const save = db.prepare("INSERT OR REPLACE INTO prices (address, usd, ts) VALUES (?, ?, ?)");
  let fetched = 0;
  for (const c of currencies) {
    if (c === USDC) { out.set(c, 1); continue; }
    if (c === ZORA_TOKEN) {
      const hit = cached.get(c, now - 3_600_000) as { usd: number | null } | undefined;
      if (hit) { out.set(c, hit.usd); continue; }
      // any tracked creator coin is priced in ZORA; take the biggest
      const ref = db.prepare(`SELECT c.address FROM coins c JOIN coin_snapshots s ON s.address = c.address
        WHERE s.ts = (SELECT MAX(ts) FROM coin_snapshots) ORDER BY s.market_cap DESC LIMIT 1`).get() as { address: string } | undefined;
      const q = ref ? await coinQuote(ref.address).catch(() => null) : null;
      const fresh = q && q.poolCurrency === ZORA_TOKEN ? zoraUsd(q.usd ?? 0, q.inPool ?? 0) : null;
      // a failed lookup falls back to the last price we had (prune keeps a week) rather than $0
      const usd = fresh ?? (db.prepare("SELECT usd FROM prices WHERE address = ? AND usd IS NOT NULL").get(c) as { usd: number } | undefined)?.usd ?? null;
      if (fresh != null) save.run(c, fresh, now);
      out.set(c, usd); continue;
    }
    const t = tracked.get(c) as { usd: number | null } | undefined;
    if (t?.usd) { out.set(c, t.usd); continue; }
    const hit = cached.get(c, now - 6 * 3_600_000) as { usd: number | null } | undefined;
    if (hit) { out.set(c, hit.usd); continue; }
    if (fetched >= PRICE_FETCH_MAX) { out.set(c, null); continue; }
    fetched++;
    const q = await coinQuote(c).catch(() => null);
    save.run(c, q?.usd ?? null, now);
    out.set(c, q?.usd ?? null);
  }
  return out;
}

async function rewards() {
  const run = startRun("rewards");
  const head = parseInt(await rpc<string>("eth_blockNumber", []), 16) - 5; // a few blocks back from the tip
  const ref = await rpc<{ timestamp: string }>("eth_getBlockByNumber", [hex(head), false]);
  const refTs = parseInt(ref.timestamp, 16) * 1000;
  const cur = db.prepare("SELECT value FROM cursors WHERE name = 'rewards'").get() as { value: number } | undefined;
  const ranges = chunks((cur?.value ?? head - REWARD_BACKFILL) + 1, head, REWARD_CHUNK).slice(0, REWARD_MAX_CHUNKS);
  const decoded: Reward[] = [];
  let errors = 0, last = cur?.value ?? head - REWARD_BACKFILL;
  for (const [a, b] of ranges) {
    try {
      const logs = await rpc<RawLog[]>("eth_getLogs", [{ fromBlock: hex(a), toBlock: hex(b), topics: [[MARKET_TOPIC, CREATOR_TOPIC]] }]);
      for (const l of logs) { const r = decodeReward(l); if (r) decoded.push(r); }
      last = b;
    } catch (e) { errors++; log("rewards error", a, b, String(e).slice(0, 120)); break; } // resume from here next run
  }
  const prices = await unitPrices([...new Set(decoded.map((r) => r.currency))]);
  const ins = db.prepare(`INSERT OR IGNORE INTO rewards (tx, log_index, block, ts, kind, coin, currency, creator, platform, trade, protocol, doppler,
      creator_amt, platform_amt, trade_amt, protocol_amt, doppler_amt, unit_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const daily = db.prepare(`INSERT INTO reward_daily (day, role, recipient, usd, events, unpriced) VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(day, role, recipient) DO UPDATE SET usd = usd + excluded.usd, events = events + 1, unpriced = unpriced + excluded.unpriced`);
  const roleDaily = db.prepare(`INSERT INTO reward_role_daily (day, role, usd, events, unpriced) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(day, role) DO UPDATE SET usd = usd + excluded.usd, events = events + 1, unpriced = unpriced + excluded.unpriced`);
  const coinDaily = db.prepare(`INSERT INTO coin_reward_daily (day, coin, creator_usd, events, unpriced) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(day, coin) DO UPDATE SET creator_usd = creator_usd + excluded.creator_usd, events = events + 1, unpriced = unpriced + excluded.unpriced`);
  let added = 0;
  db.transaction(() => {
    for (const r of decoded) {
      const ts = blockTime(r.block, head, refTs), unit = prices.get(r.currency) ?? null;
      const x = ins.run(r.tx, r.logIndex, r.block, ts, r.kind, r.coin, r.currency, r.recipients.creator, r.recipients.platform, r.recipients.trade,
        r.recipients.protocol, r.recipients.doppler, r.amounts.creator, r.amounts.platform, r.amounts.trade, r.amounts.protocol, r.amounts.doppler, unit);
      if (!x.changes) continue; // seen before: already in the daily totals
      added++;
      const d = new Date(ts).toISOString().slice(0, 10), unpriced = unit == null ? 1 : 0;
      coinDaily.run(d, r.coin, unit == null ? 0 : r.amounts.creator * unit, unpriced);
      for (const role of ROLES) {
        const who = r.recipients[role];
        if (!who || !(r.amounts[role] > 0)) continue;
        const usd = unit == null ? 0 : r.amounts[role] * unit;
        daily.run(d, role, who, usd, unpriced);
        roleDaily.run(d, role, usd, unpriced);
      }
    }
    db.prepare("INSERT OR REPLACE INTO cursors (name, value) VALUES ('rewards', ?)").run(last);
  })();

  // Handles for the wallets the page will list: the top earners of the week in each role
  const since = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const top = db.prepare(`SELECT recipient FROM reward_daily WHERE day >= ? AND role = ? GROUP BY recipient ORDER BY SUM(usd) DESC LIMIT 15`);
  const known = db.prepare("SELECT 1 FROM names WHERE address = ? AND ts > ?");
  const want = [...new Set(["creator", "platform", "trade"].flatMap((role) => (top.all(since, role) as { recipient: string }[]).map((x) => x.recipient)))]
    .filter((a) => !known.get(a, now - 7 * 86_400_000)).slice(0, NAME_FETCH_MAX);
  const saveName = db.prepare("INSERT OR REPLACE INTO names (address, handle, ts) VALUES (?, ?, ?)");
  await pool(want, CONCURRENCY, async (a) => { try { saveName.run(a, await profileHandle(a), now); } catch { errors++; } });
  endRun(run, added, errors, `blocks to ${last}`);
  log(`rewards: ${added} new payouts from ${ranges.length} block ranges (to ${last}), ${[...prices.values()].filter((v) => v == null).length} currencies unpriced, ${want.length} names, ${errors} errors`);
}

// --- trends (tags) ---------------------------------------------------------------------------
const TREND_PAGES = Number(process.env.TREND_PAGES || 5);   // up to 100 per list
const TREND_HOLDER_COINS = 15;                               // busiest tags get a daily holder set, for overlap

async function trends() {
  const run = startRun("trends");
  const list = await trendUniverse(TREND_PAGES);
  const up = db.prepare(`INSERT INTO trends (address, symbol, name, created_at, creator_address, first_seen, last_seen, image)
      VALUES (@address, @symbol, @name, @createdAt, @creatorAddress, @now, @now, @image)
      ON CONFLICT(address) DO UPDATE SET symbol=excluded.symbol, name=excluded.name, last_seen=excluded.last_seen, image=COALESCE(excluded.image, trends.image)`);
  const snap = db.prepare("INSERT OR REPLACE INTO trend_snapshots (address, ts, holders, market_cap, volume_24h, total_volume) VALUES (?, ?, ?, ?, ?, ?)");
  db.transaction(() => { for (const t of list) { up.run({ ...t, now }); snap.run(t.address, now, t.uniqueHolders, t.marketCap, t.volume24h, t.totalVolume); } })();
  // holder sets once a day for the busiest tags (they're small, so each is complete)
  const done = new Set((db.prepare("SELECT address FROM holder_meta WHERE day = ?").all(day) as { address: string }[]).map((r) => r.address));
  const busiest = [...list].sort((a, b) => b.volume24h - a.volume24h).slice(0, TREND_HOLDER_COINS).filter((t) => !done.has(t.address));
  const ins = db.prepare("INSERT OR REPLACE INTO holder_snapshots (address, day, wallet, balance) VALUES (?, ?, ?, ?)");
  const meta = db.prepare("INSERT OR REPLACE INTO holder_meta (address, day, total, captured) VALUES (?, ?, ?, ?)");
  let errors = 0;
  await pool(busiest, CONCURRENCY, async (t) => {
    try {
      const h = await holders(t.address, HOLDER_TOP_PAGES);
      db.transaction(() => { for (const r of h.rows) ins.run(t.address, day, r.wallet, r.balance); meta.run(t.address, day, h.total, h.rows.length); })();
    } catch (e) { errors++; log("trend holders error", t.symbol, String(e).slice(0, 120)); }
  });
  endRun(run, list.length, errors);
  log(`trends: ${list.length} tags, ${busiest.length} holder sets, ${errors} errors`);
}

async function main() {
  const mode = process.argv[2] ?? "all";
  const t0 = Date.now();
  if (mode === "snapshots" || mode === "all") await snapshots();
  if (mode === "swaps" || mode === "all") await swaps();
  if (mode === "holders" || mode === "all") await holderSets();
  if (mode === "rewards" || mode === "all") await rewards();
  if (mode === "trends" || mode === "all") await trends();
  log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
