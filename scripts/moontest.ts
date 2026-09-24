// Do Zora's moonshots have anything to trade against?
//
// The pitch for buying a runner is that it went up a lot and you could have been on it. That has
// two halves and only the first one is ever quoted. This checks the second: for each of the
// biggest 24h gainers, it adds up every BUY and SELL the API will show for that coin and compares
// the total with the volume the API advertises for the same coin.
//
// The number that decides whether a trade exists is not the gain. It is the largest single trade
// anybody has managed, because that is the demonstrated depth - if the biggest fill in the coin's
// history is $3, a $20 order is the market, and the exit is worse than the entry.
import { getCoinSwaps } from "@zoralabs/coins-sdk";

const CHAIN = 8453;

type Real = { swaps: number; usd: number; biggest: number; traders: number; buyUsd: number; sellUsd: number };

async function realTrading(address: string): Promise<Real> {
  let after: string | undefined;
  let swaps = 0, usd = 0, biggest = 0, buyUsd = 0, sellUsd = 0;
  const traders = new Set<string>();
  for (let p = 0; p < 40; p++) {
    let r: any;
    try {
      r = await getCoinSwaps({ address, chain: CHAIN, first: 20, after });
    } catch { break; }
    const conn = r?.data?.zora20Token?.swapActivities;
    const edges = conn?.edges ?? [];
    if (!edges.length) break;
    for (const e of edges) {
      const n = e.node;
      if (n.activityType !== "BUY" && n.activityType !== "SELL") continue;
      const v = Number(n.currencyAmountWithPrice?.currencyAmount?.amountDecimal ?? 0)
              * Number(n.currencyAmountWithPrice?.priceUsdc ?? 0);
      swaps++; usd += v; biggest = Math.max(biggest, v);
      if (n.activityType === "BUY") buyUsd += v; else sellUsd += v;
      traders.add(String(n.senderAddress ?? "").toLowerCase());
    }
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return { swaps, usd, biggest, traders: traders.size, buyUsd, sellUsd };
}

async function main() {
  const want = Number(process.argv[2] ?? 20);
  const lists = (process.argv[3] ?? "TOP_GAINERS,TOP_VOLUME_24H").split(",");
  const seen = new Map<string, any>();
  for (const listType of lists) {
    let after = "";
    while (seen.size < want * lists.length) {
      const url = `https://api-sdk.zora.engineering/explore?listType=${listType}&count=20${after ? `&after=${after}` : ""}`;
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) break;
      const j: any = await r.json();
      const edges = j?.exploreList?.edges ?? [];
      if (!edges.length) break;
      for (const e of edges) if (!seen.has(e.node.address)) seen.set(e.node.address, { ...e.node, listType });
      const pi = j?.exploreList?.pageInfo;
      if (!pi?.hasNextPage || !pi?.endCursor) break;
      after = pi.endCursor;
      if (seen.size >= want) break;
    }
  }

  const coins = [...seen.values()].filter((c) => {
    const mc = Number(c.marketCap || 0), d = Number(c.marketCapDelta24h || 0);
    return mc > 0 && d > 0 && (d / Math.max(mc - d, 1e-9)) > 0.5;   // up at least 50% in 24h
  }).slice(0, want);

  console.log(`${coins.length} coins up >50% in 24h\n`);
  console.log("symbol           gain%     mcap$   API vol24h$   REAL traded$  swaps  wallets  biggest fill$");
  const rows: any[] = [];
  for (const c of coins) {
    const mc = Number(c.marketCap || 0), d = Number(c.marketCapDelta24h || 0);
    const gain = d / Math.max(mc - d, 1e-9) * 100;
    const real = await realTrading(c.address);
    rows.push({ sym: c.symbol, gain, mc, api: Number(c.volume24h || 0), real });
    console.log(
      `${String(c.symbol ?? "").slice(0, 15).padEnd(15)} ` +
      `${(gain > 9999 ? gain.toExponential(1) : gain.toFixed(0)).padStart(8)} ` +
      `${mc.toFixed(0).padStart(9)} ` +
      `${Number(c.volume24h || 0).toFixed(0).padStart(13)} ` +
      `${real.usd.toFixed(2).padStart(14)} ` +
      `${String(real.swaps).padStart(6)} ` +
      `${String(real.traders).padStart(8)} ` +
      `${real.biggest.toFixed(2).padStart(14)}`);
  }

  // The verdict, in the only terms that matter for a $20 account.
  const tradeable = rows.filter((r) => r.real.biggest >= 20);
  const medBiggest = rows.map((r) => r.real.biggest).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0;
  console.log(`\nmedian biggest-ever fill: $${(medBiggest ?? 0).toFixed(2)}`);
  console.log(`coins where anyone has EVER filled $20 or more: ${tradeable.length} of ${rows.length}`);
  const overstated = rows.filter((r) => r.api > r.real.usd * 10).length;
  console.log(`coins whose advertised volume24h is >10x their own swap history: ${overstated} of ${rows.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
