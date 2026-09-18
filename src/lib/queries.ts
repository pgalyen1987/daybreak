// Read-side queries for the pages. Everything is computed from the collector's tables at request
// time; SQLite is fast enough for a few hundred coins and keeps one source of truth.
import { open } from "./db";
import { churn, gapScores, reach, volumePatterns, type Socials, type Swap } from "./metrics";

export const MIN_HOLDERS = 10; // coins below this are too thin to call a lead

export type CoinRow = {
  address: string; symbol: string; name: string; handle: string | null; holders: number;
  marketCap: number; volume24h: number; mcapDelta24h: number; priceUsd: number | null; ts: number;
  socials: Socials; socialUsers: Record<string, string | null>;
};

type Raw = {
  address: string; symbol: string; name: string; handle: string | null; holders: number; market_cap: number;
  volume_24h: number; mcap_delta_24h: number; price_usd: number | null; ts: number;
  twitter: number | null; farcaster: number | null; instagram: number | null; tiktok: number | null;
  twitter_user: string | null; farcaster_user: string | null; instagram_user: string | null; tiktok_user: string | null;
};

const LATEST = `
  SELECT c.address, c.symbol, c.name, c.creator_handle AS handle, s.holders, s.market_cap, s.volume_24h, s.mcap_delta_24h, s.price_usd, s.ts,
         so.twitter, so.farcaster, so.instagram, so.tiktok, so.twitter_user, so.farcaster_user, so.instagram_user, so.tiktok_user
  FROM coins c
  JOIN coin_snapshots s ON s.address = c.address AND s.ts = (SELECT MAX(ts) FROM coin_snapshots WHERE address = c.address)
  LEFT JOIN social_snapshots so ON so.handle = c.creator_handle AND so.ts = (SELECT MAX(ts) FROM social_snapshots WHERE handle = c.creator_handle)`;

function toRow(r: Raw): CoinRow {
  return {
    address: r.address, symbol: r.symbol, name: r.name, handle: r.handle, holders: r.holders,
    marketCap: r.market_cap, volume24h: r.volume_24h, mcapDelta24h: r.mcap_delta_24h, priceUsd: r.price_usd, ts: r.ts,
    socials: { twitter: r.twitter, farcaster: r.farcaster, instagram: r.instagram, tiktok: r.tiktok },
    socialUsers: { twitter: r.twitter_user, farcaster: r.farcaster_user, instagram: r.instagram_user, tiktok: r.tiktok_user },
  };
}

export function allCoins(): CoinRow[] {
  return (open().prepare(LATEST).all() as Raw[]).map(toRow);
}

export function coinByAddress(address: string): CoinRow | null {
  const r = open().prepare(`${LATEST} WHERE c.address = ?`).get(address.toLowerCase()) as Raw | undefined;
  return r ? toRow(r) : null;
}

export type Lead = CoinRow & { reach: number; platform: string | null; conversion: number; untapped: number; score: number };

/** The gap leaderboard: every coin with a linked audience and at least MIN_HOLDERS holders, best leads first. */
export function leads(minHolders = MIN_HOLDERS): Lead[] {
  const coins = allCoins().filter((c) => c.holders >= minHolders);
  const byId = new Map(coins.map((c) => [c.address, c]));
  return gapScores(coins.map((c) => ({ id: c.address, holders: c.holders, socials: c.socials })))
    .map((g) => ({ ...byId.get(g.id)!, reach: g.reach, platform: g.platform, conversion: g.conversion, untapped: g.untapped, score: g.score }));
}

export function stats() {
  const d = open();
  const one = <T,>(sql: string) => d.prepare(sql).get() as T;
  return {
    coins: one<{ n: number }>("SELECT COUNT(*) AS n FROM coins").n,
    trades: one<{ n: number }>("SELECT COUNT(*) AS n FROM swaps").n,
    lastSnapshot: one<{ ts: number | null }>("SELECT MAX(ts) AS ts FROM coin_snapshots").ts,
    lastTrade: one<{ ts: number | null }>("SELECT MAX(ts) AS ts FROM swaps").ts,
  };
}

/** Trades for one coin over the last `days` days, and how far back our record for it goes. */
export function coinTrades(address: string, days = 7) {
  const d = open();
  const since = Date.now() - days * 86_400_000;
  const swaps = d.prepare("SELECT ts, side, usd, trader FROM swaps WHERE address = ? AND ts >= ? ORDER BY ts").all(address, since) as Swap[];
  const cov = d.prepare("SELECT since FROM swap_coverage WHERE address = ?").get(address) as { since: number } | undefined;
  const first = cov?.since ?? (d.prepare("SELECT MIN(ts) AS ts FROM swaps WHERE address = ?").get(address) as { ts: number | null }).ts;
  const daily = new Map<string, { buy: number; sell: number; trades: number }>();
  for (let i = days - 1; i >= 0; i--) daily.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), { buy: 0, sell: 0, trades: 0 });
  for (const s of swaps) {
    const e = daily.get(new Date(s.ts).toISOString().slice(0, 10));
    if (!e) continue;
    if (s.side === "BUY") e.buy += s.usd; else e.sell += s.usd;
    e.trades++;
  }
  return { patterns: volumePatterns(swaps), daily: [...daily.entries()].map(([day, v]) => ({ day, ...v })), historySince: first };
}

/** Holder counts over time from the hourly snapshots. */
export function holderSeries(address: string) {
  return open().prepare("SELECT ts, holders, market_cap AS marketCap FROM coin_snapshots WHERE address = ? ORDER BY ts").all(address) as { ts: number; holders: number; marketCap: number }[];
}

/** Day-over-day churn from the daily holder sets. Null until two days are recorded. */
export function holderChurn(address: string) {
  const d = open();
  const days = (d.prepare("SELECT day, total, captured FROM holder_meta WHERE address = ? ORDER BY day DESC LIMIT 2").all(address) as { day: string; total: number; captured: number }[]);
  if (days.length < 2) return { ready: false as const, days: days.map((x) => x.day) };
  const [today, prev] = days;
  const set = (day: string) => (d.prepare("SELECT wallet FROM holder_snapshots WHERE address = ? AND day = ?").all(address, day) as { wallet: string }[]).map((r) => r.wallet);
  const complete = today.captured >= today.total && prev.captured >= prev.total;
  return { ready: true as const, from: prev.day, to: today.day, complete, captured: today.captured, total: today.total, ...churn(set(prev.day), set(today.day)) };
}

// Uniswap v4 PoolManager on Base. It holds every coin's trading liquidity, so it tops most holder
// lists; counting it as a holder would make every coin look whale-dominated.
export const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";

/** Share of total supply held by the 10 largest wallets, with the liquidity pool reported separately. */
export function topHolderShare(address: string) {
  const d = open();
  const meta = d.prepare("SELECT day, total FROM holder_meta WHERE address = ? ORDER BY day DESC LIMIT 1").get(address) as { day: string; total: number } | undefined;
  const supply = (d.prepare("SELECT total_supply AS s FROM coins WHERE address = ?").get(address) as { s: number | null } | undefined)?.s;
  if (!meta || !supply) return null;
  const rows = d.prepare("SELECT wallet, balance FROM holder_snapshots WHERE address = ? AND day = ?").all(address, meta.day) as { wallet: string; balance: string }[];
  const tokens = (b: string) => Number(BigInt(b) / 10n ** 12n) / 1e6; // wei -> whole tokens
  const pool = rows.filter((r) => r.wallet === POOL_MANAGER).reduce((a, r) => a + tokens(r.balance), 0);
  const bal = rows.filter((r) => r.wallet !== POOL_MANAGER).map((r) => tokens(r.balance)).sort((a, b) => b - a);
  const top10 = bal.slice(0, 10).reduce((a, b) => a + b, 0);
  return { day: meta.day, top10Share: top10 / supply, poolShare: pool / supply, holdersCaptured: bal.length, holdersTotal: meta.total };
}

export { reach };
