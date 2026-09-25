// Free Farcaster reads from the public Snapchain node: no key, no account, and the node sends
// `access-control-allow-origin: *`, so these run in the visitor's browser as well as in the
// collector. That is what lets a static site count a follower list for itself instead of
// repeating a number somebody else will not explain.
//
// The node answers from several shards and its pageToken walks them unevenly, so a page can repeat
// what an earlier one held and the tail keeps handing back a token long after the last new row.
// Every walk here stops on a stall — N pages that add nobody — never on the token alone. Trusting
// the token alone reads the same tail for hundreds of pages and looks like progress: counting
// @jacob converged at 478,377 by page 240 and the node was still paging at 400.
export const HUB = process.env.NEXT_PUBLIC_FARCASTER_HUB || process.env.FARCASTER_HUB || "https://snap.farcaster.xyz:3381";

/**
 * Pages in a row that may add nobody before a walk is called finished.
 *
 * Every walk of the hub shares this, so the follow count on the map can never drift from the
 * follower list the diff subtracts from. Measured on @jacob: the count settled at 478,377 on page
 * 244 and the node was still handing back tokens at page 400 — but the first run of four dud pages
 * also began at 244, which leaves a stop-at-4 with no margin at all. Eight costs four extra pages,
 * about four seconds, and buys room for the shards to page unevenly in the middle of a list.
 */
export const STALL_PAGES = 8;

export async function hubGet(path: string, tries = 4): Promise<any | null> {
  let wait = 500;
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${HUB}${path}`);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      if (i >= tries) throw new Error(`hub ${r.status} ${path}`);
    } catch (e) { if (i >= tries) throw e; }
    await new Promise((r) => setTimeout(r, wait + Math.random() * 200));
    wait = Math.min(wait * 2, 8000);
  }
}

/** An fname or ENS name to its fid, straight from the hub's username proofs. */
export async function fidForName(name: string): Promise<number | null> {
  const j = await hubGet(`/v1/userNameProofByName?name=${encodeURIComponent(name)}`);
  return typeof j?.fid === "number" ? j.fid : null;
}

export type FollowWalk = { count: number; pages: number; converged: boolean };

/**
 * How many signed, unrevoked follow records the hub holds for an account.
 *
 * This is the only follower number Daybreak quotes, because it is the only one we count ourselves
 * and anyone can repeat with curl. It is not what a Farcaster client shows — Warpcast reports
 * 92,145 for @jacob where the hub holds 478,377 — and it is not Zora's cached 292,097. See
 * lib/follows.ts for the three numbers side by side and why this is the one.
 *
 * `converged` false means the walk hit `maxPages`, so `count` is a floor, not a total. The browser
 * passes a small cap on purpose: a page is about 2,000 records and a second, so counting one of
 * the largest accounts live would take minutes.
 */
export async function countFollows(target: number, o: { stallPages?: number; maxPages?: number; onPage?: (p: number, n: number) => void } = {}): Promise<FollowWalk> {
  const { stallPages = STALL_PAGES, maxPages = 1200, onPage } = o;
  const seen = new Set<number>();
  let token = "", pages = 0, stall = 0;
  for (; pages < maxPages; pages++) {
    const j = await hubGet(`/v1/linksByTargetFid?target_fid=${target}&link_type=follow&pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    if (!j) break;
    const before = seen.size;
    for (const m of j.messages ?? []) {
      if (m.data?.type !== "MESSAGE_TYPE_LINK_ADD" || m.data?.linkBody?.targetFid !== target) continue;
      seen.add(m.data.fid);
    }
    stall = seen.size === before ? stall + 1 : 0;
    onPage?.(pages + 1, seen.size);
    token = j.nextPageToken ?? "";
    if (!token || stall >= stallPages) return { count: seen.size, pages: pages + 1, converged: true };
  }
  return { count: seen.size, pages, converged: false };
}
