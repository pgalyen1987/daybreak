// Free Farcaster reads for the collector. The browser-safe half — the node client, the fname
// lookup and the follow count — lives in src/lib/hub-public.ts so the /check page can run the same
// walk in the visitor's browser; this file adds the parts only the collector needs.
export { HUB, hubGet, fidForName, countFollows, STALL_PAGES } from "../src/lib/hub-public";
import { hubGet, STALL_PAGES } from "../src/lib/hub-public";

/** Every fid that follows `target`, with the Farcaster-epoch second the follow was signed. */
export async function followers(target: number, o: { onPage?: (p: number, n: number) => void; stallPages?: number; maxPages?: number } = {}) {
  const { onPage, stallPages = STALL_PAGES, maxPages = 4000 } = o;
  const out = new Map<number, number>();
  let token = "", pages = 0, stall = 0;
  for (; pages < maxPages; pages++) {
    const j = await hubGet(`/v1/linksByTargetFid?target_fid=${target}&link_type=follow&pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    if (!j) break;
    const before = out.size;
    for (const m of j.messages ?? []) {
      if (m.data?.type !== "MESSAGE_TYPE_LINK_ADD" || m.data?.linkBody?.targetFid !== target) continue;
      if (!out.has(m.data.fid)) out.set(m.data.fid, m.data.timestamp ?? 0);
    }
    stall = out.size === before ? stall + 1 : 0;
    onPage?.(pages + 1, out.size);
    token = j.nextPageToken ?? "";
    if (!token || stall >= stallPages) break;
  }
  return out;
}

/** The verified Ethereum addresses on a profile: the bridge from a follower to a wallet. */
export async function verifiedAddresses(fid: number): Promise<string[]> {
  const j = await hubGet(`/v1/verificationsByFid?fid=${fid}`);
  const out: string[] = [];
  for (const m of j?.messages ?? []) {
    const b = m.data?.verificationAddAddressBody;
    if (b?.protocol === "PROTOCOL_ETHEREUM" && b.address) out.push(String(b.address).toLowerCase());
  }
  return out;
}

export type UserData = { username?: string; display?: string; pfp?: string; bio?: string };
const USER_KEY: Record<string, keyof UserData> = {
  USER_DATA_TYPE_USERNAME: "username", USER_DATA_TYPE_DISPLAY: "display",
  USER_DATA_TYPE_PFP: "pfp", USER_DATA_TYPE_BIO: "bio",
};

export async function userData(fid: number): Promise<UserData> {
  const j = await hubGet(`/v1/userDataByFid?fid=${fid}`);
  const out: UserData = {};
  for (const m of j?.messages ?? []) {
    const b = m.data?.userDataBody;
    const k = USER_KEY[b?.type];
    if (k && b.value) out[k] = b.value;
  }
  return out;
}

/** Run tasks with a fixed concurrency. */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
