import type { Metadata } from "next";
import { MIN_HOLDERS, POOL_MANAGER } from "@/lib/queries";
import { MIN_REACH } from "@/lib/metrics";

export const metadata: Metadata = { title: "How the numbers work", description: "Definitions, data sources and limits for every metric on Daybreak.", alternates: { canonical: "/method/" } };

export default function Method() {
  return (
    <article className="prose">
      <div>
        <p className="kicker">Method</p>
        <h1>How the numbers work</h1>
      </div>
      <p>Everything here comes from Zora&apos;s public coins API: coin stats, holder lists, individual trades, and the follower counts of the social accounts each creator has linked on Zora. Nothing is scraped from other platforms.</p>

      <h2>Which coins</h2>
      <p>Creator coins that appear in Zora&apos;s most valuable, trending, or top-volume creator lists. Stats refresh every hour; follower counts refresh about once a day.</p>

      <h2>Audience</h2>
      <p>A creator&apos;s largest single linked account. The same fans often follow on several platforms, so adding the counts together would overstate reach.</p>

      <h2>Gap score</h2>
      <p>Holders per 1,000 followers, ranked against every other creator we track, then weighted by audience size (a million followers is full weight). A high score means a large audience and, relative to everyone else, few holders. Creators with fewer than {MIN_REACH.toLocaleString("en-US")} followers or fewer than {MIN_HOLDERS} holders are left out of the leaderboard: a tiny audience or a coin nobody holds isn&apos;t a useful lead.</p>

      <h2>Volume and trades</h2>
      <p>Summed from individual trades, each valued at the trade&apos;s own currency price in USDC. This can differ from the 24-hour volume on Zora&apos;s site, which is calculated on a slightly delayed window.</p>

      <h2>Holder churn</h2>
      <p>The share of yesterday&apos;s holders who no longer hold today. For coins with up to 500 holders we compare every holder; above that, the top 500 by balance, and the page says so.</p>

      <h2>Concentration</h2>
      <p>The ten largest wallets&apos; share of total supply. The Uniswap v4 pool contract ({POOL_MANAGER.slice(0, 6)}…{POOL_MANAGER.slice(-4)}) holds each coin&apos;s trading liquidity, so it&apos;s reported separately rather than counted as a holder.</p>

      <h2>Limits</h2>
      <ul>
        <li>Follower counts are whatever Zora has on file for the linked account.</li>
        <li>Holder counts include wallets of any size, including dust.</li>
        <li>This is analytics, not advice. A gap means an audience hasn&apos;t bought in; it doesn&apos;t mean it will.</li>
      </ul>
      <p className="note">Daybreak is built by Rebel Studios and isn&apos;t affiliated with Zora.</p>
    </article>
  );
}
