// Can $20 get in AND back out?
//
// Every number Zora advertises about a coin describes the way in. The gain, the volume, the
// market cap - all of them are quoted from the buy side, and all of them are compatible with a
// position you cannot close. This asks the other half, and it asks it the only honest way: get a
// real quote to buy the coin with ETH, then a real quote to sell exactly what that first quote
// says you would receive, and see how much of the ETH comes back.
//
// Nothing is signed and nothing is sent. createQuote is a read. The number it produces is the
// round trip cost - spread, both pool fees, and the price impact of being the size we are - and
// it is the floor under every strategy: a coin that loses 40% on a round trip has to rise 67%
// before we are even, whatever the chart did yesterday.
import { createQuote } from "@zoralabs/coins-sdk";

const ME = "0x3950F353c0a3e6E44C28021370F69753ccE19253" as const;   // read-only: quotes need a sender, not a signature

type Leg = { out: bigint } | { err: string };

// `quote.amountOut` IS THE SLIPPAGE-ADJUSTED MINIMUM, NOT THE EXPECTED OUTPUT.
//
// Measured, after a first version of this file reported a 45-55% round-trip cost that was mostly
// its own slippage setting counted twice. Same coin, same size, same block:
//   slippage 0.01 -> 1635084369952675838594091
//   slippage 0.25 -> 1239229643818457909657920
// The ratio is 0.758, i.e. exactly (1-0.25)/(1-0.01). Dividing each by (1 - slippage) recovers
// 1.6516e24 and 1.6523e24 - the same expected output to within 0.04%. So the honest read is
// amountOut / (1 - slippage), and quoting at 25% on both legs had been charging a fictional
// 0.75 x 0.75 = 56% before the pool was consulted at all.
const SLIP = 0.01;

async function quote(sell: any, buy: any, amountIn: bigint): Promise<Leg> {
  try {
    const q: any = await createQuote({ sell, buy, amountIn, slippage: SLIP, sender: ME } as any);
    const out = q?.quote?.amountOut ?? q?.amountOut ?? q?.quote?.buyAmount;
    if (out === undefined || out === null) return { err: "no amountOut in quote" };
    // undo the protective haircut so what is left is the pool's own price, fees and impact
    const expected = Number(BigInt(out)) / (1 - Number(q?.quote?.slippage ?? SLIP));
    return { out: BigInt(Math.floor(expected)) };
  } catch (e: any) {
    return { err: String(e?.message ?? e).slice(0, 90) };
  }
}

export async function roundTrip(coin: string, ethIn: number): Promise<string> {
  const wei = BigInt(Math.floor(ethIn * 1e18));
  const buy = await quote({ type: "eth" }, { type: "erc20", address: coin }, wei);
  if ("err" in buy) return `buy failed: ${buy.err}`;
  if (buy.out === 0n) return "buy quoted zero";
  const sell = await quote({ type: "erc20", address: coin }, { type: "eth" }, buy.out);
  if ("err" in sell) return `bought ${buy.out} but SELL failed: ${sell.err}`;
  const back = Number(sell.out) / 1e18;
  const keep = back / ethIn;
  return `in ${ethIn} ETH -> ${buy.out} coin -> ${back.toFixed(6)} ETH   keep ${(keep * 100).toFixed(1)}%  ` +
    `(round trip costs ${((1 - keep) * 100).toFixed(1)}%, needs +${((1 / keep - 1) * 100).toFixed(1)}% to break even)`;
}

async function main() {
  const coins = process.argv.slice(2);
  if (!coins.length) { console.error("usage: roundtrip <coin address> [more...]"); process.exit(1); }
  // Three sizes, because depth is the whole question: if the cost climbs steeply from $2 to $20,
  // the pool is thin and the chart is describing trades nobody our size could make.
  for (const c of coins) {
    console.log(`\n${c}`);
    for (const eth of [0.00075, 0.0025, 0.0075]) {
      console.log(`  $${(eth * 2648).toFixed(2).padStart(6)}  ${await roundTrip(c, eth)}`);
    }
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
