// Read-side queries for the rewards and tags pages (the collector's rewards, reward_daily, names,
// trends and trend_snapshots tables). Tables that don't exist yet read as empty.
import { open } from "./db";
import { POOL_MANAGER } from "./queries";
import { ROLES, type Role } from "./rewards";

const DAY = 86_400_000;
const has = (table: string) => !!open().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);

export type Earner = { address: string; name: string | null; usd: number; events: number; zora?: boolean; image?: string | null };

export function rewardsSummary(days = 7) {
  const d = open();
  if (!has("reward_role_daily")) return null;
  const sinceDay = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  const rows = d.prepare("SELECT role, SUM(usd) AS usd, SUM(events) AS events, SUM(unpriced) AS unpriced FROM reward_role_daily WHERE day >= ? GROUP BY role")
    .all(sinceDay) as { role: Role; usd: number; events: number; unpriced: number }[];
  if (!rows.length) return null;
  const byRole = Object.fromEntries(ROLES.map((r) => [r, Number(rows.find((x) => x.role === r)?.usd || 0)])) as Record<Role, number>;
  // every payout lands in the per-coin totals (the per-role ones skip shares that round to zero)
  const c = d.prepare("SELECT SUM(events) AS n, SUM(unpriced) AS unpriced FROM coin_reward_daily WHERE day >= ?").get(sinceDay) as { n: number | null; unpriced: number | null };
  const payouts = Number(c.n || 0), priced = payouts - Number(c.unpriced || 0);
  // a wallet's name: its Zora handle, else the handle of a tracked coin it created
  // (a wallet without a profile comes back from Zora as its own short address, "0x55c8...2453": not a name)
  const named = d.prepare(`SELECT COALESCE(
      (SELECT handle FROM names WHERE address = ? AND handle IS NOT NULL AND handle NOT LIKE '0x%...%'),
      (SELECT creator_handle FROM coins WHERE creator_address = ? AND creator_handle IS NOT NULL LIMIT 1)) AS name`);
  // a wallet's picture: the art of the tracked creator coin it created, if any
  const art = d.prepare("SELECT image FROM coins WHERE creator_address = ? AND image IS NOT NULL LIMIT 1");
  // Zora's own wallet: the protocol share's recipient, which also shows up as a platform referrer
  const zora = (d.prepare("SELECT protocol FROM rewards WHERE protocol IS NOT NULL GROUP BY protocol ORDER BY COUNT(*) DESC LIMIT 1").get() as { protocol: string } | undefined)?.protocol;
  const top = (role: Role, n = 10): Earner[] => (d.prepare(`SELECT recipient AS address, SUM(usd) AS usd, SUM(events) AS events
      FROM reward_daily WHERE day >= ? AND role = ? GROUP BY recipient ORDER BY usd DESC LIMIT ?`).all(sinceDay, role, n) as Omit<Earner, "name">[])
    .map((e) => ({ ...e, zora: e.address === zora, name: (named.get(e.address, e.address) as { name: string | null } | undefined)?.name ?? null,
      image: (art.get(e.address) as { image: string | null } | undefined)?.image ?? null }));
  const daily = d.prepare("SELECT day, role, usd FROM reward_role_daily WHERE day >= ? ORDER BY day")
    .all(new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10)) as { day: string; role: Role; usd: number }[];
  const byDay = new Map<string, Record<string, number>>();
  for (const r of daily) byDay.set(r.day, { ...(byDay.get(r.day) || {}), [r.role]: r.usd });
  const earliest = (d.prepare("SELECT MIN(day) AS day FROM reward_role_daily").get() as { day: string | null }).day;
  return {
    days, payouts, priced, byRole, earliest,
    total: ROLES.reduce((a, r) => a + byRole[r], 0),
    top: { creator: top("creator"), platform: top("platform"), trade: top("trade") },
    daily: [...byDay.entries()].map(([day, values]) => ({ day, values })),
  };
}

/** What one coin's trades paid its creator over the last `days` days (priced payouts only). */
export function coinCreatorEarnings(address: string, days = 7) {
  if (!has("coin_reward_daily")) return null;
  const r = open().prepare(`SELECT SUM(events) AS n, SUM(creator_usd) AS usd, SUM(unpriced) AS unpriced FROM coin_reward_daily WHERE coin = ? AND day >= ?`)
    .get(address, new Date(Date.now() - days * DAY).toISOString().slice(0, 10)) as { n: number | null; usd: number | null; unpriced: number | null };
  return r.n ? { payouts: r.n, usd: r.usd || 0, unpriced: r.unpriced || 0 } : null;
}

export type Tag = { address: string; symbol: string; name: string; createdAt: string | null; holders: number; marketCap: number;
  volume24h: number; holders24hAgo: number | null; ts: number; image: string | null };

export function tags(): Tag[] {
  if (!has("trends")) return [];
  const d = open();
  const rows = d.prepare(`SELECT t.address, t.symbol, t.name, t.image, t.created_at AS createdAt, s.holders, s.market_cap AS marketCap, s.volume_24h AS volume24h, s.ts,
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
