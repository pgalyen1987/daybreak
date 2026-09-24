// Pull swap history for a RANDOM sample of every Zora coin ever launched.
//
// This is the piece that fixes the bias, and it matters more than any strategy on top of it.
//
// Every Zora number so far came from the explore endpoints, which list what is notable TODAY.
// That is a winners' bracket: the coins that died are absent, so measured returns are optimistic
// and no amount of careful statistics on that sample repairs it. scanner/zora_universe.py reads
// the factory's own creation logs instead - 8,085 coins in 14 days, the graveyard included.
//
// A RANDOM sample of that list is unbiased by construction. Take 500 coins uniformly, pull
// whatever history each has, and the distribution that comes back is the real one: mostly coins
// that launched and never traded, which is exactly the part the explore endpoints hide.
//
// Output is one JSON file of {coin, swaps[]} that the backtest and the Freqtrade converter both
// read, so the expensive API pass happens once.
//
//   tsx scripts/sample-universe.ts 500 ~/trader/zora_sample.json
import * as fs from "fs";
import * as path from "path";
import { swaps } from "../src/lib/zora-screen";

type Coin = { coin: string; currency: string; creator: string; kind: string; block: number };

async function main() {
  const want = Number(process.argv[2] ?? 500);
  const out = (process.argv[3] ?? "~/trader/zora_sample.json").replace("~", process.env.HOME ?? "~");
  const src = path.join(process.env.HOME ?? ".", "trader", "zora_coins.json");

  const all: Coin[] = JSON.parse(fs.readFileSync(src, "utf8"));
  console.log(`universe ${all.length} coins from factory creation logs`);

  // Deterministic shuffle so a re-run samples the same coins and results stay comparable.
  let seed = 20260924;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pool = [...all];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, want);

  const rows: any[] = [];
  let traded = 0, totalSwaps = 0, done = 0;
  for (const c of picked) {
    // 3 pages is plenty: the whole point is that most of these have almost no history, and the
    // handful that are busy get revisited by the screen anyway.
    const h = await swaps(c.coin, 3);
    rows.push({ coin: c.coin, kind: c.kind, currency: c.currency, block: c.block, swaps: h });
    if (h.length) { traded++; totalSwaps += h.length; }
    if (++done % 50 === 0) console.log(`  ${done}/${picked.length}  ${traded} have traded`);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(rows));

  // The headline fact about Zora, which the explore endpoints cannot show you.
  const counts = rows.map((r) => r.swaps.length).sort((a, b) => a - b);
  const pct = (p: number) => counts[Math.floor(counts.length * p)] ?? 0;
  console.log(`\n${picked.length} sampled, ${traded} ever traded (${(100 * traded / picked.length).toFixed(1)}%)`);
  console.log(`${totalSwaps} swaps total; per-coin median ${pct(0.5)}, p90 ${pct(0.9)}, p99 ${pct(0.99)}, max ${counts[counts.length - 1]}`);
  console.log(`coins with 12+ swaps (enough to replay): ${counts.filter((x) => x >= 12).length}`);
  console.log(`\nwrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
