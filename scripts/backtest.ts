// Does the screen's signal predict anything? An event study on real swap history.
//
// Waiting days for a paper record is slow when every Zora coin already carries its own price
// series in getCoinSwaps. This replays that history hour by hour and asks the only question that
// matters: when the signal fires at hour H, what happens between H and H+k, compared with the
// hours in the SAME coins when it does not fire.
//
// THE TWO WAYS THIS KIND OF TEST LIES, AND WHAT IS DONE ABOUT THEM:
//
//  1. Lookahead. Features at hour H are computed from swaps strictly BEFORE H, and the outcome
//     from swaps strictly after. Nothing in the feature window can see the return window. This
//     is enforced in one place (`featuresAt`) rather than trusted.
//
//  2. Survivorship. The universe comes from Zora's explore endpoints, which list coins that are
//     notable TODAY - so it over-represents things that went up, and any "average return" from
//     it is meaningless. The fix is not to quote an average: it is to compare signal-hours
//     against non-signal-hours WITHIN THE SAME COINS. Both samples inherit the same bias, so the
//     difference between them is close to honest even though neither level is.
//
// Prices here are last-trade prices, which are not executable. Round-trip cost is applied
// afterwards as a separate, measured haircut (2.4% to 25.3% at $20, per roundtrip.ts) rather
// than being smuggled into the signal.
import { swaps, universe, LISTS, type Swap } from "../src/lib/zora-screen";

const HOUR = 3600e3;

type Feat = { move: number; buyShare: number; realUsd: number; swaps: number; wallets: number; biggest: number };

/** Everything the screen knows at time `at`, using only trades strictly before it. */
function featuresAt(hist: Swap[], at: number): (Feat & { px: number }) | null {
  const day = hist.filter((s) => s.ts < at && s.ts >= at - 24 * HOUR);
  if (day.length < 8) return null;
  const hour = day.filter((s) => s.ts >= at - HOUR);
  const older = day.filter((s) => s.ts < at - HOUR);
  if (!hour.length || !older.length) return null;
  const px = hour[hour.length - 1].px;
  const hourUsd = hour.reduce((a, s) => a + s.usd, 0);
  return {
    px,
    move: px / older[older.length - 1].px - 1,
    buyShare: hour.reduce((a, s) => a + (s.side === "BUY" ? s.usd : 0), 0) / Math.max(hourUsd, 1e-9),
    realUsd: day.reduce((a, s) => a + s.usd, 0),
    swaps: day.length,
    wallets: new Set(hour.map((s) => s.who)).size,
    biggest: Math.max(...day.map((s) => s.usd)),
  };
}

/** Last trade price at or before `at`, or null if the coin had not traded yet. */
function priceAt(hist: Swap[], at: number): number | null {
  let px: number | null = null;
  for (const s of hist) { if (s.ts > at) break; px = s.px; }
  return px;
}

function stats(xs: number[]) {
  if (!xs.length) return { n: 0, mean: 0, median: 0, win: 0, p90: 0 };
  const s = [...xs].sort((a, b) => a - b);
  return {
    n: xs.length,
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
    median: s[Math.floor(s.length / 2)],
    win: xs.filter((x) => x > 0).length / xs.length,
    p90: s[Math.floor(s.length * 0.9)],
  };
}

const show = (label: string, s: ReturnType<typeof stats>) =>
  console.log(`  ${label.padEnd(26)} n=${String(s.n).padStart(5)}  ` +
    `median ${(s.median * 100).toFixed(1).padStart(7)}%  mean ${(s.mean * 100).toFixed(1).padStart(8)}%  ` +
    `win ${(s.win * 100).toFixed(0).padStart(3)}%  p90 ${(s.p90 * 100).toFixed(0).padStart(6)}%`);

async function main() {
  const pages = Number(process.argv[2] ?? 4);
  const horizons = [1, 4, 24];

  const coins = await universe(LISTS, pages);
  console.log(`universe ${coins.length} coins (explore endpoints - survivorship-biased by`);
  console.log(`construction, which is why only the signal-vs-rest DIFFERENCE is reported)\n`);

  // Pull each coin's history once. This is the expensive part.
  const hists = new Map<string, Swap[]>();
  for (const c of coins) {
    // 20 pages, not 12: the first run replayed only 8 of 118 coins, and a thin history is the
    // very thing being studied - truncating it biases the sample toward the quietest coins.
    const h = await swaps(c.address, 20);
    if (h.length >= 12) hists.set(c.address, h);
  }
  console.log(`${hists.size} coins have enough history to replay\n`);

  // fired[k] / rest[k] hold forward returns for signal and non-signal hours at each horizon.
  const fired: Record<number, number[]> = {}, rest: Record<number, number[]> = {};
  for (const k of horizons) { fired[k] = []; rest[k] = []; }
  let hoursTested = 0, signals = 0;

  for (const [addr, hist] of hists) {
    const t0 = hist[0].ts, tN = hist[hist.length - 1].ts;
    for (let at = t0 + 24 * HOUR; at <= tN; at += HOUR) {
      const f = featuresAt(hist, at);
      if (!f) continue;
      hoursTested++;
      // The live screen's thresholds, exactly.
      const isSignal = f.move > 0.05 && f.buyShare >= 0.6 && f.realUsd >= 200 && f.biggest >= 20;
      if (isSignal) signals++;
      for (const k of horizons) {
        const then = priceAt(hist, at + k * HOUR);
        // Require a trade AFTER the horizon, or the "price" is just the last stale print and
        // every dead coin scores a flat 0% instead of being excluded.
        if (then == null || tN < at + k * HOUR) continue;
        (isSignal ? fired[k] : rest[k]).push(then / f.px - 1);
      }
    }
  }

  console.log(`${hoursTested} coin-hours replayed, ${signals} of them signals ` +
              `(${(100 * signals / Math.max(hoursTested, 1)).toFixed(1)}%)\n`);
  for (const k of horizons) {
    console.log(`forward ${k}h:`);
    show("signal fired", stats(fired[k]));
    show("no signal (same coins)", stats(rest[k]));
    const d = stats(fired[k]).median - stats(rest[k]).median;
    console.log(`  -> median edge from the signal: ${(d * 100).toFixed(2)}%`);
    for (const cost of [0.024, 0.114, 0.253]) {
      const net = stats(fired[k]).median - cost;
      console.log(`     net of a ${(cost * 100).toFixed(1)}% round trip: ${(net * 100).toFixed(1)}%` +
                  (net > 0 ? "  <- clears" : ""));
    }
    console.log();
  }
  console.log("Read the DIFFERENCE, not the levels: both rows come from the same biased universe,");
  console.log("so the gap between them is the part that survives the bias.");
}

main().catch((e) => { console.error(e); process.exit(1); });
