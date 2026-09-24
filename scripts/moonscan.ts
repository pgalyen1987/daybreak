// Was the moon detectable while it was still enterable?
//
// Not "can we predict which coin moons" - nobody can, and a scanner that claims to is selling
// something. The smaller, testable question: once a coin HAS started moving, how long is the
// window between the move being visible and the move being over, and is there enough depth in
// that window to get $20 in and back out again.
//
// Reconstructs a price series from the coin's own swap history (usd / coinAmount per trade, which
// is what the trader actually paid) and buckets it, so the shape of the run is measured rather
// than remembered. Reuses src/lib/zora.ts for the paging and backoff.
//
//   tsx scripts/moonscan.ts <coin address> [hours back] [bucket minutes]
import { recentSwaps, type SwapRow } from "../src/lib/zora";

type Bucket = {
  t: number; first: number; last: number; hi: number; lo: number;
  buyUsd: number; sellUsd: number; buys: number; sells: number; traders: Set<string>;
};

function bucketise(swaps: SwapRow[], minutes: number): Bucket[] {
  const span = minutes * 60_000;
  const by = new Map<number, Bucket>();
  // oldest first: a price series read newest-first reports every run upside down
  for (const s of [...swaps].sort((a, b) => a.ts - b.ts)) {
    if (!(s.coinAmount > 0) || !(s.usd > 0)) continue;   // a zero leg carries no price
    const px = s.usd / s.coinAmount;
    const k = Math.floor(s.ts / span) * span;
    let b = by.get(k);
    if (!b) {
      b = { t: k, first: px, last: px, hi: px, lo: px, buyUsd: 0, sellUsd: 0, buys: 0, sells: 0, traders: new Set() };
      by.set(k, b);
    }
    b.last = px;
    b.hi = Math.max(b.hi, px);
    b.lo = Math.min(b.lo, px);
    b.traders.add(s.trader);
    if (s.side === "BUY") { b.buyUsd += s.usd; b.buys++; } else { b.sellUsd += s.usd; b.sells++; }
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
}

async function main() {
  const addr = process.argv[2];
  const hours = Number(process.argv[3] ?? 48);
  const mins = Number(process.argv[4] ?? 30);
  if (!addr) { console.error("usage: moonscan <coin address> [hours] [bucket minutes]"); process.exit(1); }

  const since = Date.now() - hours * 3600_000;
  const swaps = await recentSwaps(addr, since, 400);
  if (swaps.length === 0) { console.log("no swaps in window"); return; }
  const buckets = bucketise(swaps, mins);
  const open = buckets[0].first;
  const peak = Math.max(...buckets.map((b) => b.hi));
  const peakAt = buckets.find((b) => b.hi === peak)!;

  console.log(`${addr}  ${swaps.length} swaps over ${hours}h in ${mins}m buckets`);
  console.log(`open ${open.toExponential(3)}  peak ${peak.toExponential(3)}  = ${(peak / open).toFixed(1)}x\n`);
  console.log("time (UTC)        price      vs open   buy $     sell $   trades  wallets");
  for (const b of buckets) {
    const when = new Date(b.t).toISOString().slice(5, 16).replace("T", " ");
    const mult = b.last / open;
    console.log(
      `${when}  ${b.last.toExponential(2)}  ${mult >= 100 ? mult.toFixed(0) + "x" : mult.toFixed(2) + "x"}`.padEnd(46) +
      `${b.buyUsd.toFixed(0).padStart(9)} ${b.sellUsd.toFixed(0).padStart(9)} ` +
      `${String(b.buys + b.sells).padStart(6)} ${String(b.traders.size).padStart(7)}` +
      (b.t === peakAt.t ? "   <- peak" : ""));
  }

  // THE ONLY NUMBER THAT MATTERS: how long you had between the move being obvious and the top.
  // A signal that fires at +50% is worthless if the top is nine minutes later, and it is a real
  // trade if the top is four hours later. Measured, not assumed.
  for (const trigger of [1.5, 2, 5]) {
    const fired = buckets.find((b) => b.last / open >= trigger);
    if (!fired) { console.log(`\nnever reached ${trigger}x`); continue; }
    const window = (peakAt.t - fired.t) / 3600_000;
    const left = peak / fired.last;
    const depth = buckets.filter((b) => b.t >= fired.t && b.t <= peakAt.t).reduce((s, b) => s + b.buyUsd + b.sellUsd, 0);
    console.log(`\nat ${trigger}x (${new Date(fired.t).toISOString().slice(11, 16)} UTC): ` +
      `${window.toFixed(1)}h to the peak, ${left.toFixed(1)}x still on the table, ` +
      `$${depth.toFixed(0)} traded in that window`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
