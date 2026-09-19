import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardFromUrl, LeaderboardView } from "@/components/LeaderboardView";
import { MINS, type Boards } from "@/lib/leaderboard";
import { leads, MIN_HOLDERS } from "@/lib/queries";

export const metadata: Metadata = { title: "Gap leaderboard", description: "Zora creators ranked by how much of their audience hasn't found their coin yet." };

// Built once an hour as a static page: every filter's rows ship with it and the browser picks
// by the URL. The default view is in the HTML, so the table reads without JavaScript.
export default function Leaderboard() {
  const boards: Boards = Object.fromEntries(MINS.map((m) => [String(m), leads(m).map((r) => ({
    address: r.address, handle: r.handle, symbol: r.symbol, score: r.score, reach: r.reach, platform: r.platform,
    holders: r.holders, conversion: r.conversion, untapped: r.untapped, marketCap: r.marketCap,
  }))]));
  return (
    <Suspense fallback={<LeaderboardView boards={boards} defaultMin={MIN_HOLDERS} />}>
      <LeaderboardFromUrl boards={boards} defaultMin={MIN_HOLDERS} />
    </Suspense>
  );
}
