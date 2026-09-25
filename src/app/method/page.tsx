import Link from "next/link";
import type { Metadata } from "next";
import { MIN_HOLDERS, POOL_MANAGER } from "@/lib/queries";
import { MIN_FOLLOWS, MIN_RANKED } from "@/lib/metrics";

export const metadata: Metadata = { title: "How the numbers work", description: "Definitions, data sources and limits for every metric on Daybreak.", alternates: { canonical: "/method/" } };

export default function Method() {
  return (
    <article className="prose">
      <div>
        <p className="kicker">Method</p>
        <h1>How the numbers work</h1>
      </div>
      <p>Coin stats, holder lists and individual trades come from Zora&apos;s public coins API. Trading rewards are read from Base&apos;s own logs. Follower numbers come from neither: we count them ourselves, from a public Farcaster node, because the counts Zora carries turned out not to be countable — see below.</p>

      <h2>Which coins</h2>
      <p>Creator coins that appear in Zora&apos;s most valuable, trending, or top-volume creator lists. Stats refresh every hour; follow counts are re-walked stalest-first within each run&apos;s time budget.</p>

      <h2>Audience: what a follower number here means</h2>
      <p>One thing, always: <b>signed, unrevoked follow records held by the Farcaster protocol</b> for the account a creator has linked on Zora. We walk a public Snapchain node, page through every follow of that account and count the distinct signers. Anyone can repeat it with <code>curl</code>. It is always called &ldquo;Farcaster follows&rdquo; and never &ldquo;followers&rdquo;, because those are not the same claim.</p>
      <p><b>It is a ceiling.</b> Farcaster&apos;s own app shows a smaller number, because it filters the accounts it does not consider real, and the gap is large and not constant: @jacob 478,377 against 92,145, @manuee 2,966 against 1,476. We checked what the difference is made of by sampling 400 of @jacob&apos;s 478,377 followers at random and asking the hub about each: 99.8% had a username, 98.8% had a profile picture, and none were empty. They are registered accounts with profiles, not blank shells — but how many are still reading is not something we can measure, and neither the hub nor Farcaster publishes the rule. So read this as an upper bound on an audience, not a headcount of people paying attention. We show the protocol&apos;s number because it is the one that is defined, free, checkable, and able to say <em>who</em>.</p>
      <p><b>Only Farcaster.</b> X charges per call for follower access and we don&apos;t spend money on data; Instagram and TikTok publish neither a follower list nor a wallet. So a creator whose audience is on those platforms has no audience number here at all, rather than a borrowed one. Their linked handles are shown, their follower counts are not.</p>

      <h2>Why Zora&apos;s follower numbers aren&apos;t used</h2>
      <p>Every Zora profile carries a follower count for each linked account, and this site was built on them. They do not hold up, and we can now say by how much, because on 21 September 2026 we counted the Farcaster side ourselves for <b>every one of the 104 tracked creators</b> who has a Farcaster account linked.</p>
      <p>Of the 96 that also carry a number from Zora, <b>five are within 5% of the truth</b>. Sixty-five are out by more than half again. Eleven are out by more than three times, six by more than five, and the worst — @kitty4d, where Zora says 11 — by <b>thirty-two times</b>. Not one is too high: every single number Zora carries is at or below the real count, which is what a snapshot that has never been refreshed looks like on accounts that have only grown.</p>
      <p>They also do not move. We compared 60 of those counts, across 39 creators, with the values Zora had served three days earlier: <b>not one had changed</b> — on accounts from 46 followers to 1.9 million. So they are a cache taken at some moment Zora does not publish, and the drift since is different for every account and invisible from outside.</p>
      <p>Five of the hundred and four, with the third source alongside:</p>
      <table className="sheet"><thead><tr><th className="l">Creator</th><th>Zora&apos;s profile</th><th>Farcaster&apos;s app</th><th>Follow records on the hub</th></tr></thead><tbody>
        <tr><td className="l">@jacob</td><td>292,097</td><td>92,145</td><td>478,377</td></tr>
        <tr><td className="l">@balajis.eth</td><td>186,832</td><td>60,670</td><td>304,164</td></tr>
        <tr><td className="l">@crypticpoet</td><td>12,169</td><td>5,998</td><td>34,941</td></tr>
        <tr><td className="l">@kitty4d</td><td>11</td><td>210</td><td>351</td></tr>
        <tr><td className="l">@manuee</td><td>2,789</td><td>1,476</td><td>2,966</td></tr>
      </tbody></table>
      <h2>What the old numbers said, and what they say now</h2>
      <p>This is the correction, on the site&apos;s own creators. The middle column is what this page showed before 21 September 2026; the right is the same coin&apos;s holders against a follow count we walked ourselves.</p>
      <table className="sheet"><thead><tr><th className="l">Creator</th><th className="l">What it was ranked on</th><th>Holders per 1,000, before</th><th>After</th></tr></thead><tbody>
        <tr><td className="l">@jacob</td><td className="l">Zora&apos;s 292,097 Farcaster followers</td><td>20.99</td><td>12.82</td></tr>
        <tr><td className="l">@jessepollak</td><td className="l">Zora&apos;s 385,658 Farcaster followers</td><td>165.65</td><td>100.69</td></tr>
        <tr><td className="l">@shl0ms</td><td className="l">Zora&apos;s 86,525 <em>X</em> followers</td><td>26.40</td><td>109.25</td></tr>
        <tr><td className="l">@balajis</td><td className="l">Zora&apos;s 1,915,619 <em>X</em> followers</td><td>10.67</td><td>67.21</td></tr>
        <tr><td className="l">@realgarrytan</td><td className="l">Zora&apos;s 979,097 <em>X</em> followers</td><td>19.31</td><td>1,536.48</td></tr>
      </tbody></table>
      <p>The last row is the clearest case of what was wrong. @realgarrytan&apos;s coin has 18,911 holders and he has about 12,000 Farcaster follows, so more people hold the coin than follow him there — the buyers came from an audience nobody can count for nothing. Dividing those 18,911 holders by an X follower count produced 19.31, which reads like a conversion rate and is not one: the numerator and the denominator were counting different people. It put him near the top of a list of &ldquo;audiences that haven&apos;t found the coin&rdquo;.</p>

      <p>Every metric that stood on those numbers has been rebuilt on the count we take ourselves, or removed. What went: the cross-platform audience figure (a creator&apos;s largest linked account, which put an X follower count and a Farcaster follow count in one ranking as if they measured the same thing); &ldquo;not yet holding&rdquo;, which was followers minus holders, a subtraction between two sets where neither contains the other; and the per-platform medians on the check page, which compared four incomparable populations.</p>

      <h2>Gap score</h2>
      <p>Holders per 1,000 Farcaster follows, ranked against every other creator we have counted, then weighted by size (a million follows is full weight). A high score means a lot of people follow and, relative to everyone else, few of them hold. Creators with fewer than {MIN_FOLLOWS.toLocaleString("en-US")} follows or fewer than {MIN_HOLDERS} holders are left out: a tiny audience or a coin nobody holds isn&apos;t a useful lead.</p>
      <p>The score is a percentile inside the measured set, so it needs a set. Below {MIN_RANKED} counted creators the pages show the raw rate instead and say why — with four creators counted, a score of 100 would mean &ldquo;worst of four&rdquo; while reading like &ldquo;the largest gap on Zora&rdquo;.</p>
      <p>A creator we have not counted yet is simply absent, not ranked on a guess. Counting one account takes from about five seconds to several minutes, so the hourly collector works through the list within a time budget and coverage climbs; every page that shows a ranking also shows how many creators are in it.</p>

      <h2>Volume and trades</h2>
      <p>Summed from individual trades, each valued at the trade&apos;s own currency price in USDC. This can differ from the 24-hour volume on Zora&apos;s site, which is calculated on a slightly delayed window.</p>

      <h2>Holder churn</h2>
      <p>The share of yesterday&apos;s holders who no longer hold today. For coins with up to 500 holders we compare every holder; above that, the top 500 by balance, and the page says so.</p>

      <h2>Concentration</h2>
      <p>The ten largest wallets&apos; share of total supply. The Uniswap v4 pool contract ({POOL_MANAGER.slice(0, 6)}…{POOL_MANAGER.slice(-4)}) holds each coin&apos;s trading liquidity, so it&apos;s reported separately rather than counted as a holder.</p>

      <h2>Trading rewards</h2>
      <p>Every trade on a Zora coin pays a fee that the coin&apos;s contract splits on the spot and announces in an event on Base. We read those events for every Zora coin, each hour, from the last block we saw: one event carries the five-way split (creator, the app that created the coin, the app that routed the trade, the protocol and Doppler), and a second carries the creator and protocol shares on creator-coin trades. Payouts come in ZORA or in a creator coin; we value ZORA from any coin priced in it and creator coins at their price when the payout was recorded. Payouts in a currency we couldn&apos;t price yet count as $0, and the page says what share that is. A wallet shows its Zora handle when it has a profile.</p>

      <h2>Tags</h2>
      <p>A Zora tag has its own coin (a trend coin). We take every tag in Zora&apos;s trending, most traded, newest and most valuable tag lists each hour, and once a day the holders of the 15 most traded, which is where shared holders come from. Zora&apos;s public API doesn&apos;t say how many posts carry a tag, so growth is measured in holders and trading.</p>

      <h2>Checking a coin</h2>
      <p>The <Link href="/check/">Check your coin</Link> page runs entirely in your browser, against two keyless, CORS-open sources: Zora&apos;s coins API for the profile and the coin, and a public Farcaster node for the follow count. Nothing is stored and nothing is sent to us. The count is walked live, in front of you, with the running total on screen — it is capped at 40 pages, about 80,000 follow records, because past that a browser walk takes minutes; an account that hits the cap is reported as &ldquo;over N&rdquo; and no rate is derived from it, since a rate off a floor is an upper bound printed as a measurement. Its median is holders per 1,000 follows across the counted creators with at least 1,000 follows and 10 holders, and the page declines to print it until there are {MIN_RANKED} of them.</p>

      <h2>Who follows and doesn&apos;t hold</h2>
      <p>The <Link href="/audience/">follower diff</Link> is the one page here built on something other than Zora. A Farcaster profile publishes <em>verified Ethereum addresses</em>, signed by the wallet itself, and a Zora holder list is a set of Ethereum addresses — so the two can be subtracted. We walk the public Snapchain node for every signed follow of the creator&apos;s account, resolve each follower to their verified wallets, pull the coin&apos;s full holder list from Zora, and the people in the first set and not the second are the list.</p>
      <p>Resolving a follower costs one request each, and a large account has hundreds of thousands of them, so the answers are kept in a shared index and topped up every hour. Each page says how much of its follower list has been resolved so far; the rest is genuinely unknown, not assumed. A follower who publishes no wallet cannot be placed on either side and is counted separately.</p>
      <p>Ranking uses only things you could check by hand: how many other Zora coins the wallet holds and what they are worth, whether they hold coins that <em>this coin&apos;s</em> holders hold (learnt by sampling real holders, not guessed), how recently they followed, and whether the wallet has a Zora profile. Every part is capped, and each row lists the ones that applied. Drafts are written for you; nothing is ever sent for you.</p>
      <p>The match is only as good as what people verify. A follower counts as a holder only when a wallet they verified on Farcaster is in the holder list, so anyone who bought from a wallet they never verified is counted as a prospect: the &ldquo;follows and doesn&apos;t hold&rdquo; figure is an upper bound. The same gap explains why most holders are not matched to a follower — some of them simply never linked the wallet they bought with, and that is indistinguishable from never having followed.</p>
      <p>This works for Farcaster and nowhere else. Instagram and TikTok publish neither a follower list nor a wallet, so the best anyone could do there is put two numbers side by side. X charges per call for follower access, and we don&apos;t spend money on data.</p>

      <h2>Limits</h2>
      <ul>
        <li>Follow counts are a ceiling, not a headcount: dormant accounts are included, and how many is unknown. Farcaster&apos;s own filtered number is roughly a third of ours on large accounts and two thirds on small ones.</li>
        <li>A creator whose audience is on X, Instagram or TikTok has no audience figure here at all. That is a real gap in coverage, not a judgement about them.</li>
        <li>A count is as fresh as its last walk. Every page that prints one says when it was taken.</li>
        <li>Holder counts include wallets of any size, including dust.</li>
        <li>This is analytics, not advice. A gap means an audience hasn&apos;t bought in; it doesn&apos;t mean it will.</li>
      </ul>
      <p className="note">Daybreak is built by Rebel Studios and isn&apos;t affiliated with Zora.</p>
    </article>
  );
}
