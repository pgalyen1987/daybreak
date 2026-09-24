// Zora's public coins API over plain HTTP. No key, and `access-control-allow-origin: *`, so every
// call here also works from the browser — which is what lets a static site do this work live.
// List endpoints hand back 20 rows a page whatever `count` asks for.
const API = process.env.ZORA_API || "https://api-sdk.zora.engineering";

// Without a key this API rate-limits hard: a few parallel holder walks and it answers 429 to
// almost everything. A short backoff turns that into silently missing data — a coin whose holder
// list "failed" looks the same as one with no overlap. So 429 gets its own, much more patient
// path, and the caller is told when a walk came back short rather than being handed a quiet lie.
export class RateLimited extends Error {}

export async function api(path: string, tries = 8): Promise<any> {
  let wait = 700;
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${API}${path}`, { headers: process.env.ZORA_API_KEY ? { "api-key": process.env.ZORA_API_KEY } : {} });
      if (r.ok) return await r.json();
      if (r.status === 429) {
        const after = Number(r.headers.get("retry-after"));
        const pause = Number.isFinite(after) && after > 0 ? after * 1000 : Math.min(wait * 2, 30_000);
        if (i >= tries) throw new RateLimited(`zora 429 after ${tries} tries: ${path}`);
        await new Promise((r) => setTimeout(r, pause + Math.random() * 500));
        wait = Math.min(wait * 2, 30_000);
        continue;
      }
      if (i >= tries) throw new Error(`zora ${r.status} ${path}`);
    } catch (e) { if (i >= tries) throw e; }
    await new Promise((r) => setTimeout(r, wait + Math.random() * 250));
    wait = Math.min(wait * 2, 15_000);
  }
}

export type SocialAcct = { username: string | null; followers: number | null } | null;
export type ZProfile = {
  handle: string; avatar: string | null; coin: string | null;
  socials: { twitter: SocialAcct; farcaster: SocialAcct; instagram: SocialAcct; tiktok: SocialAcct };
};

/** A Zora profile: its creator coin, and the follower counts it claims for each linked account. */
export async function profile(identifier: string): Promise<ZProfile | null> {
  const p = (await api(`/profile?identifier=${encodeURIComponent(identifier)}`))?.profile;
  if (!p) return null;
  const s = p.socialAccounts ?? {};
  const acct = (k: string): SocialAcct => (s[k] ? { username: s[k].username ?? null, followers: s[k].followerCount ?? null } : null);
  return {
    handle: p.handle || identifier,
    avatar: p.avatar?.previewImage?.small ?? null,
    coin: p.creatorCoin?.address?.toLowerCase() ?? null,
    socials: { twitter: acct("twitter"), farcaster: acct("farcaster"), instagram: acct("instagram"), tiktok: acct("tiktok") },
  };
}

export type ZCoin = { address: string; symbol: string | null; name: string | null; holders: number; image: string | null };

export async function coin(address: string): Promise<ZCoin | null> {
  const t = (await api(`/coin?address=${address}&chain=8453`))?.zora20Token;
  return t ? { address, symbol: t.symbol ?? null, name: t.name ?? null, holders: Number(t.uniqueHolders ?? 0), image: t.mediaContent?.previewImage?.small ?? null } : null;
}

/** Every holder wallet of a coin. 20 a page, so a 6,000-holder coin costs ~300 calls. */
export async function allHolders(address: string, o: { onPage?: (p: number, n: number, total: number) => void; maxPages?: number } = {}) {
  const { onPage, maxPages = 2000 } = o;
  const wallets = new Set<string>();
  let after: string | undefined, total = 0, pages = 0, complete = false;
  for (; pages < maxPages; pages++) {
    const j = await api(`/coinHolders?address=${address}&chainId=8453&count=20${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    const c = j?.zora20Token?.tokenBalances;
    if (!c) break;
    total = Number(c.count ?? total);
    for (const e of c.edges ?? []) wallets.add(String(e.node.ownerAddress).toLowerCase());
    onPage?.(pages + 1, wallets.size, total);
    if (!c.pageInfo?.hasNextPage || !c.pageInfo.endCursor) { complete = true; break; }
    after = c.pageInfo.endCursor;
  }
  // `complete` false means the walk stopped at maxPages, not at the end of the list
  return { wallets, total, complete };
}

export type Balances = { count: number; coins: { address: string; symbol: string | null; usd: number }[]; handle: string | null; usd: number };

/** Which Zora coins a wallet holds and what they are worth: the "buys, not just browses" signal. */
export async function coinBalances(wallet: string, count = 30): Promise<Balances | null> {
  const p = (await api(`/profileBalances?identifier=${wallet}&count=${count}`))?.profile;
  const b = p?.coinBalances;
  if (!b) return null;
  const coins = (b.edges ?? []).map((e: any) => ({
    address: String(e.node.coin?.address ?? "").toLowerCase(),
    symbol: (e.node.coin?.symbol ?? e.node.coin?.name ?? null) as string | null,
    usd: Number(e.node.valuation?.marketValueUsd ?? 0),
  })).filter((c: any) => c.address);
  // a wallet with no profile comes back as its own short address, "0x55c8...2453": not a handle
  const handle = p.handle && !/^0x[0-9a-f]{4}\.\.\.[0-9a-f]{4}$/i.test(p.handle) ? p.handle : null;
  return { count: Number(b.count ?? coins.length), coins, handle, usd: coins.reduce((a: number, c: any) => a + c.usd, 0) };
}
