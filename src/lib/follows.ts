// The one follower number this site is allowed to use, and why it is that one.
//
// Three sources answer "how many followers does this creator have?" and they disagree, badly:
//
//   @jacob          Zora's profile 292,097 · Farcaster's own client 92,145 · the hub 478,377
//   @balajis.eth    Zora's profile 186,832 · Farcaster's own client 60,670 · the hub 304,164
//   @crypticpoet    Zora's profile  12,169 · Farcaster's own client  5,998 · the hub  34,941
//   @manuee         Zora's profile   2,789 · Farcaster's own client  1,476 · the hub   2,966
//
// Zora's number is a cache. We compared 60 follower fields across 39 tracked creators with the
// values Zora served three days earlier: not one had moved, on accounts from 46 followers to 1.9
// million. It is a copy of something, taken at a moment Zora does not publish, and how far it has
// drifted is different for every account (1.06x on @manuee, 2.87x on @crypticpoet). A number whose
// error you cannot bound is not a number you can rank people on, so the site no longer does.
//
// Farcaster's own client reports a filtered count: it drops accounts it does not consider real.
// That may well be the better answer to "how big is your audience", but it is a black box, it has
// no CORS headers so a static site cannot read it in the browser, and it cannot be checked.
//
// The hub count is every signed, unrevoked `follow` record the protocol holds for the account.
// We walk a public Snapchain node and count the distinct signers ourselves. It is the largest of
// the three and it is a ceiling, not a headcount — some of those accounts are dormant, and the
// gap to the client's number is roughly how many. But it is the only one that is defined, free,
// reproducible with curl by anyone who doubts it, and able to say *who*. So it is the one we use,
// it is always labelled "Farcaster follows" rather than "followers", and the ceiling is stated
// wherever it is shown.
import { open } from "./db";

export type FollowCount = {
  handle: string;
  fid: number;
  username: string | null;
  /** Distinct unrevoked follow records on the hub. A ceiling: dormant accounts are in it. */
  follows: number;
  /** False when the walk hit its page cap, which makes `follows` a floor instead of a total. */
  converged: boolean;
  ts: number;
};

type Raw = { handle: string; fid: number; username: string | null; follows: number; converged: number; ts: number };
const toCount = (r: Raw): FollowCount => ({ ...r, converged: !!r.converged });

/** Every creator whose follow count we have measured ourselves. */
export function allFollowCounts(d = open()): Map<string, FollowCount> {
  const rows = d.prepare("SELECT handle, fid, username, follows, converged, ts FROM fc_follows").all() as Raw[];
  return new Map(rows.map((r) => [r.handle, toCount(r)]));
}

export function followCountFor(handle: string, d = open()): FollowCount | null {
  const r = d.prepare("SELECT handle, fid, username, follows, converged, ts FROM fc_follows WHERE handle = ?").get(handle) as Raw | undefined;
  return r ? toCount(r) : null;
}

export function saveFollowCount(c: { handle: string; fid: number; username: string | null; follows: number; converged: boolean; pages: number }, d = open()) {
  d.prepare(`INSERT INTO fc_follows (handle, fid, username, follows, converged, pages, ts) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(handle) DO UPDATE SET fid=excluded.fid, username=excluded.username, follows=excluded.follows,
                                               converged=excluded.converged, pages=excluded.pages, ts=excluded.ts`)
    .run(c.handle, c.fid, c.username, c.follows, c.converged ? 1 : 0, c.pages, Date.now());
}

/** How much of the tracked universe we have measured, for the coverage line the pages must show. */
export function followCoverage(d = open()) {
  const measured = (d.prepare("SELECT COUNT(*) AS n FROM fc_follows").get() as { n: number }).n;
  const linked = (d.prepare(`
    SELECT COUNT(DISTINCT so.handle) AS n FROM social_snapshots so
    WHERE so.farcaster_user IS NOT NULL
      AND so.ts = (SELECT MAX(ts) FROM social_snapshots WHERE handle = so.handle)`).get() as { n: number }).n;
  const oldest = (d.prepare("SELECT MIN(ts) AS ts FROM fc_follows").get() as { ts: number | null }).ts;
  return { measured, linked, oldest };
}
