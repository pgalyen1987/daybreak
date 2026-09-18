// Pure metric functions. Everything here is deterministic and unit-tested; the collector and the
// pages only feed data in and render what comes out.

export type Socials = { twitter?: number | null; farcaster?: number | null; instagram?: number | null; tiktok?: number | null };

const PLATFORMS = ["twitter", "farcaster", "instagram", "tiktok"] as const;

/**
 * A creator's audience. Followers overlap heavily across platforms, so summing them overstates
 * reach; the largest single audience is the conservative figure we rank on.
 */
export function reach(s: Socials): { total: number; platform: (typeof PLATFORMS)[number] | null } {
  let best = 0;
  let platform: (typeof PLATFORMS)[number] | null = null;
  for (const p of PLATFORMS) {
    const n = s[p] ?? 0;
    if (n > best) { best = n; platform = p; }
  }
  return { total: best, platform };
}

/** Holders per follower. 0.02 means 2 holders for every 100 followers. */
export function conversion(holders: number, reachTotal: number): number | null {
  if (reachTotal <= 0) return null;
  return holders / reachTotal;
}

/** Mid-rank percentile of x in a sorted array (0..1): values below, plus half of the ties. */
export function percentileRank(sorted: number[], x: number): number {
  if (sorted.length === 0) return 0;
  const bound = (strict: boolean) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (strict ? sorted[mid] < x : sorted[mid] <= x) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const below = bound(true), upTo = bound(false);
  return (below + (upTo - below) / 2) / sorted.length;
}

export const MIN_REACH = 1_000;

export type GapInput = { id: string; holders: number; socials: Socials };
export type GapRow = { id: string; holders: number; reach: number; platform: string | null; conversion: number; untapped: number; score: number };

/**
 * Social-to-onchain gap. A creator scores high when their audience is large and the share of it
 * holding the coin is low compared with every other creator we track.
 *   score = 100 x (1 - percentile of conversion) x size weight
 *   size weight = log10(reach) / 6, capped at 1 (a million followers is full weight)
 * Creators under MIN_REACH followers are left out: a tiny audience says nothing about a gap.
 */
export function gapScores(rows: GapInput[]): GapRow[] {
  const base = rows
    .map((r) => {
      const { total, platform } = reach(r.socials);
      const c = conversion(r.holders, total);
      return c === null || total < MIN_REACH ? null : { id: r.id, holders: r.holders, reach: total, platform, conversion: c };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const sorted = base.map((r) => r.conversion).sort((a, b) => a - b);
  return base
    .map((r) => {
      const weight = Math.min(1, Math.log10(r.reach) / 6);
      const score = Math.round(100 * (1 - percentileRank(sorted, r.conversion)) * weight);
      return { ...r, untapped: Math.max(0, r.reach - r.holders), score };
    })
    .sort((a, b) => b.score - a.score || b.reach - a.reach);
}

/** Holder churn between two snapshots of the holder set. */
export function churn(before: Iterable<string>, after: Iterable<string>) {
  const a = new Set(before), b = new Set(after);
  let exited = 0, entered = 0;
  for (const w of a) if (!b.has(w)) exited++;
  for (const w of b) if (!a.has(w)) entered++;
  return {
    before: a.size,
    after: b.size,
    exited,
    entered,
    churnRate: a.size ? exited / a.size : 0,
    retention: a.size ? 1 - exited / a.size : 0,
  };
}

export type Swap = { ts: number; side: "BUY" | "SELL"; usd: number; trader: string };

/**
 * Trading shape over a window: when the volume happens (UTC hour x weekday), which way it flows,
 * and how concentrated it is. topTraderShare near 1 means one wallet is most of the volume.
 */
export function volumePatterns(swaps: Swap[]) {
  const byHour = Array(24).fill(0) as number[];
  const byWeekday = Array(7).fill(0) as number[];
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  const perTrader = new Map<string, number>();
  let buyUsd = 0, sellUsd = 0, buys = 0, sells = 0;
  for (const s of swaps) {
    const d = new Date(s.ts);
    const h = d.getUTCHours(), wd = d.getUTCDay();
    byHour[h] += s.usd; byWeekday[wd] += s.usd; grid[wd][h] += s.usd;
    perTrader.set(s.trader, (perTrader.get(s.trader) ?? 0) + s.usd);
    if (s.side === "BUY") { buyUsd += s.usd; buys++; } else { sellUsd += s.usd; sells++; }
  }
  const total = buyUsd + sellUsd;
  const traderTotals = [...perTrader.values()].sort((a, b) => b - a);
  const top5 = traderTotals.slice(0, 5).reduce((a, b) => a + b, 0);
  return {
    totalUsd: total,
    buyUsd, sellUsd, buys, sells,
    netFlowUsd: buyUsd - sellUsd,
    buyShare: total ? buyUsd / total : 0,
    traders: perTrader.size,
    topTraderShare: total ? (traderTotals[0] ?? 0) / total : 0,
    top5Share: total ? top5 / total : 0,
    byHour, byWeekday, grid,
  };
}
