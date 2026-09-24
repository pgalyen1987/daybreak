// The Zora screen, as a library, so the CLI and the paper trader run the SAME code.
//
// When the screen lived in scripts/hunt.ts and the paper trader had its own copy, the two would
// have drifted the first time a threshold was tuned, and the paper record would then be evidence
// about a screen nobody runs. One implementation, two callers.
//
// Everything here is a read. createQuote signs nothing and works from any sender address.
import { createQuote, getCoinSwaps } from "@zoralabs/coins-sdk";

export const CHAIN = 8453;
export const SLIP = 0.01;
/** Quotes need a sender; this one is never signed for. */
export const QUOTE_SENDER = "0x3950F353c0a3e6E44C28021370F69753ccE19253";

export type Swap = { ts: number; side: "BUY" | "SELL"; usd: number; px: number; who: string };

export async function swaps(address: string, maxPages = 8): Promise<Swap[]> {
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
      out.push({ ts: Date.parse(n.blockTimestamp), side: n.activityType, usd, px: usd / coin,
                 who: String(n.senderAddress ?? "").toLowerCase() });
    }
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/**
 * Expected output of a swap.
 *
 * `quote.amountOut` is the SLIPPAGE-ADJUSTED MINIMUM, not the expected output - measured on
 * 2026-09-24, same coin and size and block: slippage 0.01 gave 1635084369952675838594091 and
 * slippage 0.25 gave 1239229643818457909657920, a ratio of exactly (1-0.25)/(1-0.01). Dividing
 * each by (1 - slippage) recovers the same expected output to within 0.04%. Taking amountOut at
 * face value on both legs of a round trip charges a fictional cost of 1-(1-s)^2 before the pool
 * is consulted at all, which is how an early version of this concluded Zora cost 45-55% to trade.
 */
export async function expectOut(sell: any, buy: any, amountIn: bigint): Promise<bigint | null> {
  try {
    const q: any = await createQuote({ sell, buy, amountIn, slippage: SLIP, sender: QUOTE_SENDER } as any);
    const out = q?.quote?.amountOut;
    if (out == null) return null;
    return BigInt(Math.floor(Number(BigInt(out)) / (1 - Number(q?.quote?.slippage ?? SLIP))));
  } catch { return null; }
}

export const buyQuote = (coin: string, wei: bigint) =>
  expectOut({ type: "eth" }, { type: "erc20", address: coin }, wei);
export const sellQuote = (coin: string, amount: bigint) =>
  expectOut({ type: "erc20", address: coin }, { type: "eth" }, amount);

/** Fraction of the input lost to a buy immediately followed by a sell. */
export async function roundTripCost(coin: string, ethIn: number): Promise<number | null> {
  const wei = BigInt(Math.floor(ethIn * 1e18));
  const got = await buyQuote(coin, wei);
  if (!got || got === 0n) return null;
  const back = await sellQuote(coin, got);
  if (!back) return null;
  return 1 - Number(back) / Number(wei);
}

export async function universe(lists: string[], pagesEach = 3): Promise<any[]> {
  const seen = new Map<string, any>();
  for (const listType of lists) {
    let after = "";
    for (let p = 0; p < pagesEach; p++) {
      const url = `https://api-sdk.zora.engineering/explore?listType=${listType}&count=20${after ? `&after=${after}` : ""}`;
      let j: any;
      try {
        const r = await fetch(url, { headers: { accept: "application/json" } });
        if (!r.ok) break;
        j = await r.json();
      } catch { break; }
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

export const LISTS = ["TOP_GAINERS", "TOP_VOLUME_24H", "LAST_TRADED", "MOST_VALUABLE"];

export type Candidate = {
  sym: string; addr: string; mc: number; move: number; buyShare: number;
  realUsd: number; biggest: number; wallets: number; cost: number; px: number;
};

export type Thresholds = {
  sizeUsd: number; minMcap: number; minSwaps: number; minRealUsd: number;
  minMove: number; minBuyShare: number; maxCost: number;
};

export const DEFAULTS: Thresholds = {
  sizeUsd: 20, minMcap: 500, minSwaps: 8, minRealUsd: 200,
  minMove: 0.05, minBuyShare: 0.6, maxCost: 0.35,
};

/**
 * Screen the universe. Returns candidates plus a rejection funnel.
 *
 * The funnel is not a nicety: a screen that prints nothing is indistinguishable from a screen
 * that is broken, and this one legitimately returns nothing most of the time.
 */
export async function screen(t: Thresholds = DEFAULTS, ethUsd = 2648) {
  const all = await universe(LISTS);
  const ethIn = t.sizeUsd / ethUsd;
  const now = Date.now();
  const rows: Candidate[] = [];
  const cut: Record<string, number> = { mcap: 0, thin: 0, small: 0, nohour: 0, falling: 0, noquote: 0, pricey: 0 };

  for (const c of all) {
    const mc = Number(c.marketCap || 0);
    if (!(mc > t.minMcap)) { cut.mcap++; continue; }
    const s = await swaps(c.address);
    const day = s.filter((x) => x.ts > now - 24 * 3600e3);
    if (day.length < t.minSwaps) { cut.thin++; continue; }
    const realUsd = day.reduce((a, x) => a + x.usd, 0);
    const biggest = Math.max(...day.map((x) => x.usd));
    // "Nobody our size has ever been filled here" is a harder fact than any volume figure.
    if (realUsd < t.minRealUsd || biggest < t.sizeUsd) { cut.small++; continue; }

    const hour = day.filter((x) => x.ts > now - 3600e3);
    const older = day.filter((x) => x.ts <= now - 3600e3);
    if (!hour.length || !older.length) { cut.nohour++; continue; }
    const px = hour[hour.length - 1].px;
    const move = px / older[older.length - 1].px - 1;
    const buyShare = hour.reduce((a, x) => a + (x.side === "BUY" ? x.usd : 0), 0)
                   / Math.max(hour.reduce((a, x) => a + x.usd, 0), 1e-9);
    if (move <= t.minMove || buyShare < t.minBuyShare) { cut.falling++; continue; }

    const cost = await roundTripCost(c.address, ethIn);
    if (cost == null) { cut.noquote++; continue; }
    if (cost > t.maxCost) { cut.pricey++; continue; }

    rows.push({ sym: String(c.symbol ?? ""), addr: c.address, mc, move, buyShare,
                realUsd, biggest, wallets: new Set(hour.map((x) => x.who)).size, cost, px });
  }
  rows.sort((a, b) => (b.move - b.cost) - (a.move - a.cost));
  return { rows, cut, scanned: all.length };
}
