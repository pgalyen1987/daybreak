// Thin, retrying wrappers over the Zora coins API. Every list endpoint returns at most 20 items per
// page, so everything here pages with cursors and backs off on rate limits.
import {
  getCoinHolders, getCoinSwaps, getExploreTopVolumeCreators24h, getMostValuableCreatorCoins,
  getProfile, getTrendingCreators, setApiKey,
} from "@zoralabs/coins-sdk";

if (process.env.ZORA_API_KEY) setApiKey(process.env.ZORA_API_KEY);

export const CHAIN = 8453; // Base

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Call fn, retrying on thrown errors, API errors and rate limits with exponential backoff. */
export async function withRetry<T extends { data?: unknown; error?: unknown }>(fn: () => Promise<T>, label: string, tries = 5): Promise<T> {
  let wait = 800;
  for (let i = 1; ; i++) {
    try {
      const r = await fn();
      if (r.data !== undefined && r.data !== null) return r;
      if (i >= tries) throw new Error(`${label}: ${JSON.stringify(r.error ?? "no data").slice(0, 200)}`);
    } catch (e) {
      if (i >= tries) throw e;
    }
    await sleep(wait + Math.random() * 300);
    wait = Math.min(wait * 2, 15_000);
  }
}

export type ListCoin = {
  address: string; symbol: string; name: string; coinType: string; createdAt: string;
  creatorAddress: string; creatorHandle: string | null;
  uniqueHolders: number; marketCap: number; volume24h: number; totalVolume: number;
  marketCapDelta24h: number; priceUsd: number | null;
};

function toListCoin(n: any): ListCoin {
  return {
    address: String(n.address).toLowerCase(),
    symbol: n.symbol ?? "",
    name: n.name ?? "",
    coinType: n.coinType ?? "",
    createdAt: n.createdAt ?? "",
    creatorAddress: String(n.creatorAddress ?? "").toLowerCase(),
    creatorHandle: n.creatorProfile?.handle ?? null,
    uniqueHolders: Number(n.uniqueHolders ?? 0),
    marketCap: Number(n.marketCap ?? 0),
    volume24h: Number(n.volume24h ?? 0),
    totalVolume: Number(n.totalVolume ?? 0),
    marketCapDelta24h: Number(n.marketCapDelta24h ?? 0),
    priceUsd: n.tokenPrice?.priceInUsdc != null ? Number(n.tokenPrice.priceInUsdc) : null,
  };
}

const LISTS = {
  mostValuable: getMostValuableCreatorCoins,
  trending: getTrendingCreators,
  topVolume24h: getExploreTopVolumeCreators24h,
} as const;

/** Page through one explore list, up to maxPages x 20 coins. */
export async function exploreList(name: keyof typeof LISTS, maxPages: number): Promise<ListCoin[]> {
  const out: ListCoin[] = [];
  let after: string | undefined;
  for (let p = 0; p < maxPages; p++) {
    const r: any = await withRetry(() => (LISTS[name] as any)({ count: 20, after }), `list ${name}`);
    const list = r.data?.exploreList;
    for (const e of list?.edges ?? []) out.push(toListCoin(e.node));
    if (!list?.pageInfo?.hasNextPage || !list.pageInfo.endCursor) break;
    after = list.pageInfo.endCursor;
  }
  return out;
}

/** The creator-coin universe we track: the union of the three creator lists, creator coins only. */
export async function universe(pagesPerList: number): Promise<ListCoin[]> {
  const byAddr = new Map<string, ListCoin>();
  for (const name of Object.keys(LISTS) as (keyof typeof LISTS)[]) {
    for (const c of await exploreList(name, pagesPerList)) {
      if (c.coinType === "CREATOR" && !byAddr.has(c.address)) byAddr.set(c.address, c);
    }
  }
  return [...byAddr.values()];
}

export type SocialCounts = {
  twitter: number | null; farcaster: number | null; instagram: number | null; tiktok: number | null;
  handles: Record<string, string | null>;
};

export async function profileSocials(handle: string): Promise<SocialCounts | null> {
  const r: any = await withRetry(() => getProfile({ identifier: handle }) as any, `profile ${handle}`);
  const s = r.data?.profile?.socialAccounts;
  if (!s) return null;
  const pick = (k: string) => (s[k]?.followerCount != null ? Number(s[k].followerCount) : null);
  return {
    twitter: pick("twitter"), farcaster: pick("farcaster"), instagram: pick("instagram"), tiktok: pick("tiktok"),
    handles: { twitter: s.twitter?.username ?? null, farcaster: s.farcaster?.username ?? null, instagram: s.instagram?.username ?? null, tiktok: s.tiktok?.username ?? null },
  };
}

export type SwapRow = { id: string; ts: number; side: "BUY" | "SELL"; usd: number; coinAmount: number; trader: string; tx: string };

function toSwap(n: any): SwapRow | null {
  if (n.activityType !== "BUY" && n.activityType !== "SELL") return null;
  const amt = Number(n.currencyAmountWithPrice?.currencyAmount?.amountDecimal ?? 0);
  const px = Number(n.currencyAmountWithPrice?.priceUsdc ?? 0);
  return {
    id: n.id,
    ts: Date.parse(n.blockTimestamp),
    side: n.activityType,
    usd: amt * px, // currency amount x that currency's USDC price
    coinAmount: Number(BigInt(n.coinAmount ?? "0") / 10n ** 12n) / 1e6, // 18 decimals, kept to 6
    trader: String(n.senderAddress ?? "").toLowerCase(),
    tx: n.transactionHash ?? "",
  };
}

/** Newest-first swaps, stopping at the first one at or before `sinceTs` (or after maxPages). */
export async function recentSwaps(address: string, sinceTs: number, maxPages: number): Promise<SwapRow[]> {
  const out: SwapRow[] = [];
  let after: string | undefined;
  for (let p = 0; p < maxPages; p++) {
    const r: any = await withRetry(() => getCoinSwaps({ address, chain: CHAIN, first: 20, after }) as any, `swaps ${address}`);
    const conn = r.data?.zora20Token?.swapActivities;
    let reachedOld = false;
    for (const e of conn?.edges ?? []) {
      const s = toSwap(e.node);
      if (!s) continue;
      if (s.ts <= sinceTs) { reachedOld = true; break; }
      out.push(s);
    }
    if (reachedOld || !conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

/** Holders by balance, largest first, up to maxPages x 20. Returns the total count too. */
export async function holders(address: string, maxPages: number): Promise<{ total: number; rows: { wallet: string; balance: string }[] }> {
  const rows: { wallet: string; balance: string }[] = [];
  let total = 0;
  let after: string | undefined;
  for (let p = 0; p < maxPages; p++) {
    const r: any = await withRetry(() => getCoinHolders({ address, chainId: CHAIN, count: 20, after }) as any, `holders ${address}`);
    const conn = r.data?.zora20Token?.tokenBalances;
    total = Number(conn?.count ?? total);
    for (const e of conn?.edges ?? []) rows.push({ wallet: String(e.node.ownerAddress).toLowerCase(), balance: String(e.node.balance) });
    if (!conn?.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return { total, rows };
}

/** Run tasks with a small concurrency limit. */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}
