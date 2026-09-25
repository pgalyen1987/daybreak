// Shared by the leaderboard page (built on the server) and its table (filtered in the browser).
// "Not yet holding" used to be here, as followers minus holders. It is gone: holders are not a
// subset of followers, so that subtraction counts nothing real. The honest version of it is the
// follower diff, which names the people who follow and do not hold.
export const SORTS = { score: "Gap score", followCount: "Farcaster follows", holders: "Holders", per1000: "Holders per 1k follows", marketCap: "Market cap" } as const;
export type SortKey = keyof typeof SORTS;
export const MINS = [1, 10, 100] as const;

export type Row = {
  address: string; handle: string | null; symbol: string; image: string | null; score: number;
  /** Signed, unrevoked follow records on the Farcaster hub, counted by Daybreak. Always a
   *  finished walk: a count that hit its page cap is a floor and leads() leaves it off. */
  followCount: number;
  holders: number; per1000: number; marketCap: number;
};
/** Rows per minimum-holder setting: the gap score is a rank within the set, so each set is scored on its own. */
export type Boards = Record<string, Row[]>;
