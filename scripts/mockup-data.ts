// One-off: pull real numbers out of the collector's databases for the design mockups.
//   tsx scripts/mockup-data.ts <main.sqlite> <trades.sqlite> <coin-symbol> > mockup.json
import Database from "better-sqlite3";
import { gapScores, volumePatterns, type Swap } from "../src/lib/metrics";

const [mainPath, tradesPath, symbol] = process.argv.slice(2);
const main = new Database(mainPath, { readonly: true });
const trades = new Database(tradesPath, { readonly: true });

type Row = { address: string; symbol: string; handle: string; holders: number; market_cap: number; volume_24h: number;
  twitter: number | null; farcaster: number | null; instagram: number | null; tiktok: number | null };

const rows = main.prepare(`
  SELECT c.address, c.symbol, c.creator_handle AS handle, s.holders, s.market_cap, s.volume_24h,
         so.twitter, so.farcaster, so.instagram, so.tiktok
  FROM coins c
  JOIN coin_snapshots s ON s.address = c.address AND s.ts = (SELECT MAX(ts) FROM coin_snapshots WHERE address = c.address)
  JOIN social_snapshots so ON so.handle = c.creator_handle AND so.ts = (SELECT MAX(ts) FROM social_snapshots WHERE handle = c.creator_handle)
`).all() as Row[];

const byId = new Map(rows.map((r) => [r.address, r]));
const MIN_HOLDERS = 10; // a coin nobody holds is not a useful lead
const scored = gapScores(rows.filter((r) => r.holders >= MIN_HOLDERS).map((r) => ({ id: r.address, holders: r.holders, socials: r })));
const leaderboard = scored.slice(0, 10).map((g) => {
  const r = byId.get(g.id)!;
  return { symbol: r.symbol, handle: r.handle, holders: g.holders, reach: g.reach, platform: g.platform,
    per1k: Math.round(g.conversion * 1000 * 100) / 100, untapped: g.untapped, score: g.score, marketCap: Math.round(r.market_cap) };
});
const scatter = scored.map((g) => ({ h: byId.get(g.id)!.handle, reach: g.reach, holders: g.holders, score: g.score }));

const coin = trades.prepare("SELECT address, symbol, creator_handle AS handle FROM coins WHERE symbol = ?").get(symbol) as { address: string; symbol: string; handle: string };
const swaps = trades.prepare("SELECT ts, side, usd, trader FROM swaps WHERE address = ? ORDER BY ts").all(coin.address) as Swap[];
const vp = volumePatterns(swaps);
const days = new Map<string, { buy: number; sell: number }>();
for (const s of swaps) {
  const d = new Date(s.ts).toISOString().slice(0, 10);
  const e = days.get(d) ?? { buy: 0, sell: 0 };
  if (s.side === "BUY") e.buy += s.usd; else e.sell += s.usd;
  days.set(d, e);
}
const coinSnap = main.prepare(`SELECT holders, market_cap, volume_24h FROM coin_snapshots WHERE address = ? ORDER BY ts DESC LIMIT 1`).get(coin.address) as { holders: number; market_cap: number; volume_24h: number } | undefined;

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  tracked: rows.length,
  withAudience: scored.length,
  leaderboard, scatter,
  coin: {
    symbol: coin.symbol, handle: coin.handle, ...coinSnap,
    trades: swaps.length, traders: vp.traders, totalUsd: Math.round(vp.totalUsd), buyShare: vp.buyShare,
    topTraderShare: vp.topTraderShare, top5Share: vp.top5Share,
    daily: [...days.entries()].map(([d, v]) => ({ d, buy: Math.round(v.buy), sell: Math.round(v.sell) })),
    grid: vp.grid.map((r) => r.map((v) => Math.round(v))),
  },
}));
