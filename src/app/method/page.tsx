import Link from "next/link";
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
      <p>Creator coins that appear in Zora&apos;s most valuable, trending, or top-volume creator lists. Stats refresh every hour. Follower counts are the ones Zora has on file for each linked account, and Zora doesn&apos;t keep them current: we re-read them daily, and of the 447 creators read on two or more days between Sep 18 and Oct 5, 2026, not one count changed. Treat them as a rough size.</p>

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

      <h2>Trading rewards</h2>
      <p>Every trade on a Zora coin pays a fee that the coin&apos;s contract splits on the spot and announces in an event on Base. We read those events for every Zora coin, each hour, from the last block we saw: one event carries the five-way split (creator, the app that created the coin, the app that routed the trade, the protocol and Doppler), and a second carries the creator and protocol shares on creator-coin trades. A creator coin&apos;s contract announces one payment in both events, so when the second repeats the first (same trade, same coin, same creator and amount) it is counted once. Daily totals stored before that rule counted those payments twice and left ETH payouts at $0, so they aren&apos;t shown. Payouts come in the currency of the coin&apos;s pool: mostly ZORA, then ETH, USDC and creator coins. We value ZORA from any coin priced in it, ETH at Chainlink&apos;s ETH/USD price on Base (no older than three hours), USDC at $1, and creator coins at their price when the payout was recorded. Payouts in a currency we couldn&apos;t price count as $0, and the page says what share that is. A wallet shows its Zora handle when it has a profile.</p>

      <h2>Tags</h2>
      <p>A Zora tag has its own coin (a trend coin). We take every tag in Zora&apos;s trending, most traded, newest and most valuable tag lists each hour, and once a day the holders of the 15 most traded, which is where shared holders come from. Zora&apos;s public API doesn&apos;t say how many posts carry a tag, so growth is measured in holders and trading.</p>

      <h2>Checking a coin</h2>
      <p>The <Link href="/check/">Check your coin</Link> page asks Zora&apos;s public API from your browser, so it works for any profile and nothing is stored. Its median is holders per 1,000 followers across the creators on the gap map with at least 1,000 followers and 10 holders.</p>

      <h2>Limits</h2>
      <ul>
        <li>Follower counts are whatever Zora has on file for the linked account, and they don&apos;t change (see Which coins).</li>
        <li>Holder counts include wallets of any size, including dust.</li>
        <li>This is analytics, not advice. A gap means an audience hasn&apos;t bought in; it doesn&apos;t mean it will.</li>
      </ul>
      <p className="note">Daybreak is built by Rebel Studios and isn&apos;t affiliated with Zora.</p>
    </article>
  );
}
