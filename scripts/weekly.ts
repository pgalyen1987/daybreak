// This week's numbers for the weekly Daybreak post (the distribution kit turns them into text).
// Aggregates only: no creator is named, since a post that points at someone's small holder count
// isn't a kindness. Prints JSON. Run: DATA_DIR=... npx tsx scripts/weekly.ts
import { open } from "../src/lib/db";
import { leads, stats } from "../src/lib/queries";
import { rewardsSummary, tags } from "../src/lib/zora-queries";

const db = open();
const WEEK = 7 * 86_400_000;
const now = Date.now();
const s = stats();
const all = leads(1);
const top = leads().slice(0, 10);

const week = db.prepare("SELECT ts, usd FROM swaps WHERE ts >= ?").all(now - WEEK) as { ts: number; usd: number }[];
const byHour = new Map<string, number>();
for (const t of week) {
  const d = new Date(t.ts);
  const k = `${d.getUTCDay()}|${d.getUTCHours()}`;
  byHour.set(k, (byHour.get(k) || 0) + t.usd);
}
const busiest = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const newCoins = (db.prepare("SELECT COUNT(*) AS n FROM coins WHERE first_seen >= ?").get(now - WEEK) as { n: number }).n;

// Wednesday's post: who Zora paid (roles only, no wallet named); Friday's: tags, which are topics, not people
const r = rewardsSummary(7);
const rewards = r && r.total > 0 ? {
  since: r.earliest, totalUsd: Math.round(r.total), payouts: r.payouts, pricedShare: r.payouts ? r.priced / r.payouts : 0,
  share: Object.fromEntries(Object.entries(r.byRole).map(([k, v]) => [k, v / r.total])),
} : null;
const tl = tags();
const tagStats = tl.length ? {
  count: tl.length, volume24hUsd: Math.round(tl.reduce((a, t) => a + t.volume24h, 0)), thin: tl.filter((t) => t.holders < 5).length,
  top: [...tl].sort((a, b) => b.volume24h - a.volume24h).slice(0, 3).map((t) => ({ tag: t.symbol, usd: Math.round(t.volume24h) })),
} : null;

console.log(JSON.stringify({
  rewards, tags: tagStats,
  coins: s.coins,
  withAudience: all.length,
  newCoins,
  trades: week.length,
  volumeUsd: Math.round(week.reduce((a, t) => a + t.usd, 0)),
  top10Followers: top.reduce((a, r) => a + r.reach, 0),
  top10Holders: top.reduce((a, r) => a + r.holders, 0),
  busiest: busiest ? { day: DAYS[Number(busiest[0].split("|")[0])], hourUtc: Number(busiest[0].split("|")[1]) } : null,
}));
