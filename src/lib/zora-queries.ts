// Read-side queries for the rewards and tags pages (the collector's rewards, reward_daily, names,
// trends and trend_snapshots tables). Tables that don't exist yet read as empty.
import { open } from "./db";
import { POOL_MANAGER } from "./queries";
import { ROLES, type Role } from "./rewards";

const DAY = 86_400_000;
const has = (table: string) => !!open().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);

export type Earner = { address: string; name: string | null; usd: number; events: number; zora?: boolean };

export function rewardsSummary(days = 7) {
  const d = open();
  if (!has("rewards")) return null;
  const since = Date.now() - days * DAY;
  const totals = d.prepare(`SELECT COUNT(*) AS n, SUM(unit_usd IS NOT NULL) AS priced,
      SUM(COALESCE(unit_usd, 0) * creator_amt) AS creator, SUM(COALESCE(unit_usd, 0) * platform_amt) AS platform,
      SUM(COALESCE(unit_usd, 0) * trade_amt) AS trade, SUM(COALESCE(unit_usd, 0) * protocol_amt) AS protocol,
      SUM(COALESCE(unit_usd, 0) * doppler_amt) AS doppler, MIN(ts) AS first, MAX(ts) AS last
    FROM rewards WHERE ts >= ?`).get(since) as Record<string, number | null>;
  if (!totals.n) return null;
  const byRole = Object.fromEntries(ROLES.map((r) => [r, Number(totals[r] || 0)])) as Record<Role, number>;
  const sinceDay = new Date(since).toISOString().slice(0, 10);
  // a wallet's name: its Zora handle, else the handle of a tracked coin it created
  // (a wallet without a profile comes back from Zora as its own short address, "0x55c8...2453": not a name)
  const named = d.prepare(`SELECT COALESCE(
      (SELECT handle FROM names WHERE address = ? AND handle IS NOT NULL AND handle NOT LIKE '0x%...%'),
      (SELECT creator_handle FROM coins WHERE creator_address = ? AND creator_handle IS NOT NULL LIMIT 1)) AS name`);
  // Zora's own wallet: the protocol share's recipient, which also shows up as a platform referrer
  const zora = (d.prepare("SELECT protocol FROM rewards WHERE protocol IS NOT NULL GROUP BY protocol ORDER BY COUNT(*) DESC LIMIT 1").get() as { protocol: string } | undefined)?.protocol;
  const top = (role: Role, n = 10): Earner[] => (d.prepare(`SELECT recipient AS address, SUM(usd) AS usd, SUM(events) AS events
      FROM reward_daily WHERE day >= ? AND role = ? GROUP BY recipient ORDER BY usd DESC LIMIT ?`).all(sinceDay, role, n) as Omit<Earner, "name">[])
    .map((e) => ({ ...e, zora: e.address === zora, name: (named.get(e.address, e.address) as { name: string | null } | undefined)?.name ?? null }));
  const daily = (d.prepare(`SELECT day, role, SUM(usd) AS usd FROM reward_daily WHERE day >= ? GROUP BY day, role ORDER BY day`)
    .all(new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10)) as { day: string; role: Role; usd: number }[]);
  const days30 = new Map<string, Record<string, number>>();
  for (const r of daily) days30.set(r.day, { ...(days30.get(r.day) || {}), [r.role]: r.usd });
  const earliest = (d.prepare("SELECT MIN(day) AS day FROM reward_daily").get() as { day: string | null }).day;
  return {
    days, payouts: Number(totals.n), priced: Number(totals.priced || 0), byRole,
    total: ROLES.reduce((a, r) => a + byRole[r], 0),
    first: Number(totals.first), last: Number(totals.last), earliest,
    top: { creator: top("creator"), platform: top("platform"), trade: top("trade") },
    daily: [...days30.entries()].map(([day, values]) => ({ day, values })),
  };
}

/** What one coin's trades paid its creator over the last `days` days (priced payouts only). */
export function coinCreatorEarnings(address: string, days = 7) {
  if (!has("rewards")) return null;
  const r = open().prepare(`SELECT COUNT(*) AS n, SUM(COALESCE(unit_usd, 0) * creator_amt) AS usd, SUM(unit_usd IS NULL) AS unpriced
    FROM rewards WHERE coin = ? AND ts >= ?`).get(address, Date.now() - days * DAY) as { n: number; usd: number | null; unpriced: number | null };
  return r.n ? { payouts: r.n, usd: r.usd || 0, unpriced: r.unpriced || 0 } : null;
}

export type Tag = { address: string; symbol: string; name: string; createdAt: string | null; holders: number; marketCap: number;
  volume24h: number; holders24hAgo: number | null; ts: number };

export function tags(): Tag[] {
  if (!has("trends")) return [];
  const d = open();
  const rows = d.prepare(`SELECT t.address, t.symbol, t.name, t.created_at AS createdAt, s.holders, s.market_cap AS marketCap, s.volume_24h AS volume24h, s.ts,
      (SELECT holders FROM trend_snapshots p WHERE p.address = t.address AND p.ts <= s.ts - 23 * 3600000 ORDER BY p.ts DESC LIMIT 1) AS holders24hAgo
    FROM trends t JOIN trend_snapshots s ON s.address = t.address AND s.ts = (SELECT MAX(ts) FROM trend_snapshots WHERE address = t.address)
    WHERE s.ts >= (SELECT MAX(ts) FROM trend_snapshots) - 3 * 3600000`).all() as Tag[];
  return rows;
}

/** Pairs of the busiest tags that share holders (from the latest day's holder sets), most shared first. */
export function tagOverlap(list: Tag[], n = 8) {
  const d = open();
  const day = (d.prepare("SELECT MAX(day) AS day FROM holder_meta WHERE address IN (SELECT address FROM trends)").get() as { day: string | null }).day;
  if (!day) return { day: null, pairs: [] };
  const sets = new Map<string, Set<string>>();
  const q = d.prepare("SELECT wallet FROM holder_snapshots WHERE address = ? AND day = ? AND wallet != ?");
  for (const t of list) {
    const w = (q.all(t.address, day, POOL_MANAGER) as { wallet: string }[]).map((r) => r.wallet);
    if (w.length) sets.set(t.address, new Set(w));
  }
  const bySym = new Map(list.map((t) => [t.address, t.symbol]));
  const keys = [...sets.keys()];
  const pairs: { a: string; b: string; shared: number; smaller: number }[] = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const A = sets.get(keys[i])!, B = sets.get(keys[j])!;
    let shared = 0;
    for (const w of A) if (B.has(w)) shared++;
    if (shared >= 2) pairs.push({ a: bySym.get(keys[i])!, b: bySym.get(keys[j])!, shared, smaller: Math.min(A.size, B.size) });
  }
  return { day, pairs: pairs.sort((x, y) => y.shared - x.shared).slice(0, n) };
}
