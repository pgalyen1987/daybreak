import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardFromUrl, LeaderboardView } from "@/components/LeaderboardView";
import { MINS, type Boards } from "@/lib/leaderboard";
import { leads, MIN_HOLDERS } from "@/lib/queries";
import { followCoverage } from "@/lib/follows";

export const metadata: Metadata = { title: "Gap leaderboard", description: "Zora creators ranked by how many of their Farcaster follows hold their creator coin, counted from the hub.", alternates: { canonical: "/leaderboard/" } };

// Built once an hour as a static page: every filter's rows ship with it and the browser picks
// by the URL. The default view is in the HTML, so the table reads without JavaScript.
export default function Leaderboard() {
  const boards: Boards = Object.fromEntries(MINS.map((m) => [String(m), leads(m).map((r) => ({
    address: r.address, handle: r.handle, symbol: r.symbol, image: r.image, score: r.score,
    followCount: r.followCount,
    holders: r.holders, per1000: r.per1000, marketCap: r.marketCap,
  }))]));
  const cov = followCoverage();
  return (
    <Suspense fallback={<LeaderboardView boards={boards} defaultMin={MIN_HOLDERS} coverage={cov} />}>
      <LeaderboardFromUrl boards={boards} defaultMin={MIN_HOLDERS} coverage={cov} />
    </Suspense>
  );
}
