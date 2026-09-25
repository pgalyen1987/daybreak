import type { Metadata } from "next";
import Link from "next/link";
import { CoinAvatar } from "@/components/CoinAvatar";
import { allAudiences, complete, conversion, coverage } from "@/lib/audience";
import { int } from "@/lib/format";

export const metadata: Metadata = {
  title: "Followers who don't hold",
  alternates: { canonical: "/audience/" },
  description: "The people who follow a Zora creator on Farcaster and do not hold their coin, by name, ranked by what they already buy.",
};

export default function AudienceIndex() {
  const all = allAudiences();
  return (
    <>
      <section>
        <p className="kicker">For creators</p>
        <h1>Your followers, minus your holders</h1>
        <p className="lede">
          A follower count tells you nothing you did not already know — and on Zora it is not even a count, it is a cache
          that does not move. This is the other list: the people who follow you and have not bought, by name, ranked by
          evidence that they would. It works because a Farcaster profile publishes verified Ethereum addresses, and a Zora
          holder list is a set of Ethereum addresses — so a follower and a holder are the same kind of thing, and can be
          subtracted.
        </p>
      </section>

      {all.length > 0 ? (
        <section className="panel">
          <h2>Creators checked so far</h2>
          <ul className="audience-index">
            {all.map((a) => (
              <li key={a.handle}>
                <Link href={`/audience/${a.handle}/`} className="who">
                  <CoinAvatar src={a.image ?? a.avatar} label={a.handle} address={a.coin ?? "0x000000"} size={40} />
                  <b>@{a.handle}</b>
                </Link>
                <span className="num">{complete(a) ? "" : "at least "}{int(a.counts.prospects)} follow, don&apos;t hold</span>
                <span className="note num">{int(a.counts.alreadyHold)} of {int(a.counts.withWallet)} wallet-holding followers bought ({(conversion(a) * 100).toFixed(2)}%){complete(a) ? "" : ` · ${Math.round(coverage(a) * 100)}% of the follower list checked so far`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="panel">
          <h2>No creator has been through this yet</h2>
          <p className="note">
            Each diff is a walk of one creator&apos;s whole follower list, so the collector builds a few an hour rather
            than all of them at once, and there is nothing here until the first one finishes. Nothing is being withheld
            and there is no sample list: a page about who really follows you would be worth nothing if it opened with
            people who don&apos;t.
          </p>
          <p className="note">
            What a finished one holds: every follower who publishes a verified Ethereum address and is not in the coin&apos;s
            holder list, by name, ranked on what their wallet already buys, each with a draft message you send yourself
            or don&apos;t. <Link href="/method/">How it is worked out.</Link>
          </p>
        </section>
      )}

      <section className="panel">
        <h2>What this cannot do</h2>
        <p className="note">
          Only Farcaster publishes the two things this needs: who follows you, and which wallets those people own.
          Instagram and TikTok publish neither — Meta will not hand over a follower list and there is no wallet on an
          Instagram profile, so the best anyone could build there is two numbers side by side, which is the thing this
          page exists to replace. X sells follower access per call, and this site does not spend money.
          A creator with no Farcaster account has no list here, whatever their following elsewhere.
        </p>
      </section>
    </>
  );
}
