import type { Metadata } from "next";
import Link from "next/link";
import { CoinCheck } from "@/components/CoinCheck";
import { medianPer1000, MIN_PEERS, per1000Text } from "@/lib/advice";
import { miniappMeta } from "@/lib/embed";
import { allCoins } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Check your coin",
  description: "Enter a Zora handle: its Farcaster follows counted live against its creator coin's holders, how that compares with the creators Daybreak has counted, and what to do next.",
  alternates: { canonical: "/check/" },
  other: miniappMeta("/embed.png", "/check/", "Check your coin"),
};

// The median ships with the page, taken at build time over the creators whose Farcaster follows
// the collector has counted. The lookup itself runs in the visitor's browser, against Zora's public
// API and a public Farcaster node, so it works for any creator and stores nothing.
export default function CheckPage() {
  const coins = allCoins();
  const { median, n } = medianPer1000(coins.map((c) => ({ holders: c.holders, follows: c.follows?.follows ?? null })));
  const haveMedian = n >= MIN_PEERS;
  return (
    <>
      <section>
        <p className="kicker">For creators</p>
        <h1>How many of your Farcaster followers hold your coin?</h1>
        <p className="lede">
          Enter your Zora handle. Your coin&apos;s holders come from Zora; the follower number is counted here and now, by walking
          a public Farcaster node for every signed follow of your account — about a second per two thousand of them.
          {haveMedian
            ? ` The median across the ${n} creators counted so far is ${per1000Text(median)} holders per 1,000 follows — provisional while the collector works through the rest, and it will move.`
            : ` Once ${MIN_PEERS} creators have been counted there will be a median to compare you with; ${n} so far, so there isn't one yet.`}
        </p>
      </section>
      <CoinCheck medianPer1000={median} medianN={n} tracked={coins.map((c) => c.address)} />
      <p className="note">
        There used to be a second line here comparing Farcaster-led creators with X-led ones. It came from follower counts
        Zora carries for linked accounts, and those turned out to be a cache that does not move: 60 of them across 39 creators,
        identical to the person three days apart, and out by 1.6x against the protocol on the one platform where the answer
        can be checked. A comparison between two numbers nobody can date is not a comparison, so it is gone rather than
        footnoted. <Link href="/method/">What each number here counts.</Link>
      </p>
    </>
  );
}
