// The screen: which Zora coins are moving AND could actually be traded by an account this size.
//
// Three filters, in this order, because each one is cheaper than the next and kills most of what
// the next would have to look at:
//
//   1. REAL TRADES, NOT ADVERTISED VOLUME. Measured 2026-09-24: BBS was the day's top gainer at
//      +13,236% with an advertised volume24h of $1,721,341, and its entire swap history was 35
//      trades totalling $17, largest fill $2.29. The advertised figure is not trustworthy and the
//      swap history is, so the swap history decides.
//   2. A MOVE THAT IS STILL RUNNING. Price now against price a few hours ago, from the coin's own
//      trades, plus who is on which side of it in the last hour. A coin that has already turned
//      over into selling is a coin somebody else is exiting through us.
//   3. A ROUND TRIP WE SURVIVE. A real buy quote and a real sell quote of what that buy returns.
//      Measured the same day, same $20 size: 2.4% on one coin, 25.3% on another that looked very
//      similar from the list endpoints. This is the number that decides whether a move is worth
//      anything to us, and it cannot be guessed from market cap or volume.
//
// Nothing here signs or sends. It ranks, and it prints its working.
import { createQuote, getCoinSwaps } from "@zoralabs/coins-sdk";

const CHAIN = 8453;
const ME = "0x3950F353c0a3e6E44C28021370F69753ccE19253";
const SLIP = 0.01;
const ETH_USD = Number(process.env.ETH_USD ?? 2648);

type Swap = { ts: number; side: "BUY" | "SELL"; usd: number; px: number; who: string };

async function swaps(address: string, maxPages = 12): Promise<Swap[]> {
  const out: Swap[] = [];
  let after: string | undefined;
  for (let p = 0; p < maxPages; p++) {
    let r: any;
    try { r = await getCoinSwaps({ address, chain: CHAIN, first: 20, after }); } catch { break; }
    const conn = r?.data?.zora20Token?.swapActivities;
    const edges = conn?.edges ?? [];
    if (!edges.length) break;
    for (const e of edges) {
      const n = e.node;
      if (n.activityType !== "BUY" && n.activityType !== "SELL") continue;
      const amt = Number(n.currencyAmountWithPrice?.currencyAmount?.amountDecimal ?? 0);
      const cpx = Number(n.currencyAmountWithPrice?.priceUsdc ?? 0);
      const coin = Number(BigInt(n.coinAmount ?? "0") / 10n ** 12n) / 1e6;
      if (!(coin > 0)) continue;
      const usd = amt * cpx;
      out.push({ ts: Date.parse(n.blockTimestamp), side: n.activityType, usd, px: usd / coin, who: String(n.senderAddress ?? "").toLowerCase() });
    }
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Expected output, with the protective haircut removed - see roundtrip.ts for the measurement. */
async function expectOut(sell: any, buy: any, amountIn: bigint): Promise<bigint | null> {
  try {
    const q: any = await createQuote({ sell, buy, amountIn, slippage: SLIP, sender: ME } as any);
    const out = q?.quote?.amountOut;
    if (out == null) return null;
    return BigInt(Math.floor(Number(BigInt(out)) / (1 - Number(q?.quote?.slippage ?? SLIP))));
  } catch { return null; }
}

async function roundTripCost(coin: string, ethIn: number): Promise<number | null> {
  const wei = BigInt(Math.floor(ethIn * 1e18));
  const got = await expectOut({ type: "eth" }, { type: "erc20", address: coin }, wei);
  if (!got || got === 0n) return null;
  const back = await expectOut({ type: "erc20", address: coin }, { type: "eth" }, got);
  if (!back) return null;
  return 1 - Number(back) / Number(wei);
}

async function universe(lists: string[], pagesEach: number) {
  const seen = new Map<string, any>();
  for (const listType of lists) {
    let after = "";
    for (let p = 0; p < pagesEach; p++) {
      const url = `https://api-sdk.zora.engineering/explore?listType=${listType}&count=20${after ? `&after=${after}` : ""}`;
      let j: any;
      try { const r = await fetch(url, { headers: { accept: "application/json" } }); if (!r.ok) break; j = await r.json(); } catch { break; }
      const edges = j?.exploreList?.edges ?? [];
      if (!edges.length) break;
      for (const e of edges) if (!seen.has(e.node.address)) seen.set(e.node.address, e.node);
      const pi = j?.exploreList?.pageInfo;
      if (!pi?.hasNextPage || !pi?.endCursor) break;
      after = pi.endCursor;
    }
  }
  return [...seen.values()];
}

async function main() {
  const sizeUsd = Number(process.argv[2] ?? 20);
  const ethIn = sizeUsd / ETH_USD;
  const all = await universe(["TOP_GAINERS", "TOP_VOLUME_24H", "LAST_TRADED", "MOST_VALUABLE"], 3);
  console.log(`universe ${all.length} coins; screening at $${sizeUsd.toFixed(2)}\n`);

  const now = Date.now();
  const rows: any[] = [];
  // A screen that prints "nothing" is indistinguishable from a screen that is broken, so it
  // counts what it rejected and why. Every one of these stages has been a bug at least once.
  const cut: Record<string, number> = { mcap: 0, thin: 0, small: 0, nohour: 0, falling: 0, noquote: 0 };
  for (const c of all) {
    const mc = Number(c.marketCap || 0);
    if (!(mc > 500)) { cut.mcap++; continue; }       // a pool too small to hold a $20 order at all
    const s = await swaps(c.address, 8);
    const day = s.filter((x) => x.ts > now - 24 * 3600e3);
    if (day.length < 8) { cut.thin++; continue; }    // not a market, just a few prints
    const realUsd = day.reduce((t, x) => t + x.usd, 0);
    const biggest = Math.max(...day.map((x) => x.usd));
    if (realUsd < 200 || biggest < sizeUsd) { cut.small++; continue; } // nobody our size filled here

    const hour = day.filter((x) => x.ts > now - 3600e3);
    const older = day.filter((x) => x.ts <= now - 3600e3);
    if (!hour.length || !older.length) { cut.nohour++; continue; }
    const pxNow = hour[hour.length - 1].px;
    const pxWas = older[older.length - 1].px;
    const move = pxNow / pxWas - 1;
    const buyShare = hour.reduce((t, x) => t + (x.side === "BUY" ? x.usd : 0), 0) / Math.max(hour.reduce((t, x) => t + x.usd, 0), 1e-9);
    if (move <= 0.05 || buyShare < 0.6) { cut.falling++; continue; }  // only rising, on net buying

    const cost = await roundTripCost(c.address, ethIn);
    if (cost == null) { cut.noquote++; continue; }
    rows.push({ sym: c.symbol, addr: c.address, mc, move, buyShare, realUsd, biggest,
                wallets: new Set(hour.map((x) => x.who)).size, cost });
  }

  rows.sort((a, b) => (b.move - b.cost) - (a.move - a.cost));
  console.log("rejected:", JSON.stringify(cut), "\n");
  if (!rows.length) { console.log("nothing passed all three filters."); return; }
  console.log("symbol           mcap$   1h move  buy%  24h real$  big fill$  wallets/h  round trip  edge");
  for (const r of rows) {
    console.log(
      `${String(r.sym ?? "").slice(0, 15).padEnd(15)} ${r.mc.toFixed(0).padStart(8)} ` +
      `${(r.move * 100).toFixed(0).padStart(8)}% ${(r.buyShare * 100).toFixed(0).padStart(5)}% ` +
      `${r.realUsd.toFixed(0).padStart(10)} ${r.biggest.toFixed(0).padStart(10)} ` +
      `${String(r.wallets).padStart(10)} ${(r.cost * 100).toFixed(1).padStart(10)}% ` +
      `${((r.move - r.cost) * 100).toFixed(0).padStart(5)}%`);
  }
  console.log("\nedge = this hour's move minus the measured round trip. It is NOT a forecast:");
  console.log("it says the move so far would have covered its own costs, not that it continues.");
}

main().catch((e) => { console.error(e); process.exit(1); });
