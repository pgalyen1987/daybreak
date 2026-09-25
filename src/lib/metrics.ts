// Pure metric functions. Everything here is deterministic and unit-tested; the collector and the
// pages only feed data in and render what comes out.

/**
 * A creator's Farcaster follow count, as Daybreak counted it from the hub (see lib/follows.ts).
 * Nothing here takes a follower number from Zora: Zora's is a cache that does not move, and on
 * @jacob it reads 292,097 against the 478,377 follow records the protocol holds.
 */
export const MIN_FOLLOWS = 1_000;

/**
 * Below this many measured creators the gap score must not be shown.
 *
 * The score is a percentile inside the measured set, so with four creators counted "100" means
 * "the worst of four" while reading like "the largest gap on Zora". That is a number nobody can
 * stand behind, and the count climbs over the first hours of collection, so the pages check this
 * and print the raw holders-per-1,000 instead until the set is big enough to rank inside.
 */
export const MIN_RANKED = 15;

/** Holders per 1,000 Farcaster follows. The only conversion figure the site quotes. */
export function per1000(holders: number, follows: number): number | null {
  if (follows <= 0) return null;
  return (holders / follows) * 1000;
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

export type GapInput = { id: string; holders: number; follows: number };
export type GapRow = { id: string; holders: number; follows: number; per1000: number; score: number };

/**
 * Social-to-onchain gap. A creator scores high when a lot of people follow them on Farcaster and,
 * compared with every other creator we have measured, few of them hold the coin.
 *   score = 100 x (1 - percentile of holders-per-1,000-follows) x size weight
 *   size weight = log10(follows) / 6, capped at 1 (a million follows is full weight)
 *
 * Two things this deliberately does not do. It does not mix platforms: an X follower count and a
 * Farcaster follow count are different measurements of different things and ranking them in one
 * table compares neither. And it does not subtract holders from followers to report "not yet
 * holding" — holders are not a subset of followers, so that difference counts nothing real. The
 * number of followers who genuinely do not hold is the follower diff, which names them.
 */
export function gapScores(rows: GapInput[]): GapRow[] {
  const base = rows
    .map((r) => {
      const p = per1000(r.holders, r.follows);
      return p === null || r.follows < MIN_FOLLOWS ? null : { id: r.id, holders: r.holders, follows: r.follows, per1000: p };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const sorted = base.map((r) => r.per1000).sort((a, b) => a - b);
  return base
    .map((r) => ({ ...r, score: Math.round(100 * (1 - percentileRank(sorted, r.per1000)) * Math.min(1, Math.log10(r.follows) / 6)) }))
    .sort((a, b) => b.score - a.score || b.follows - a.follows);
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
