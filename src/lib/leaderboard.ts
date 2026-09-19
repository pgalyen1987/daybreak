// Shared by the leaderboard page (built on the server) and its table (filtered in the browser).
export const SORTS = { score: "Gap score", reach: "Audience", holders: "Holders", conversion: "Holders per 1k", untapped: "Not yet holding", marketCap: "Market cap" } as const;
export type SortKey = keyof typeof SORTS;
export const MINS = [1, 10, 100] as const;

export type Row = {
  address: string; handle: string | null; symbol: string; score: number; reach: number; platform: string | null;
  holders: number; conversion: number; untapped: number; marketCap: number;
};
/** Rows per minimum-holder setting: the gap score is a rank within the set, so each set is scored on its own. */
export type Boards = Record<string, Row[]>;
