import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoinAvatar } from "@/components/CoinAvatar";
import { ProspectList } from "@/components/ProspectList";
import { rank } from "@/lib/prospects";
import { audience, audienceHandles, complete, conversion, coverage } from "@/lib/audience";
import { int, plural, zoraUrl } from "@/lib/format";
import { Ago } from "@/components/Ago";

export const dynamicParams = false;

// `output: export` rejects a dynamic route whose generateStaticParams comes back empty ("missing
// generateStaticParams()"), and the diffs are collector output that a fresh checkout does not have
// — so a build that ran before the first collection used to fail here. One placeholder keeps the
// route legal; once any diff exists the placeholder is not generated at all.
const PLACEHOLDER = "not-built-yet";
export function generateStaticParams() {
  const handles = audienceHandles();
  return (handles.length ? handles : [PLACEHOLDER]).map((handle) => ({ handle }));
}

export function generateMetadata({ params }: { params: { handle: string } }): Metadata {
  const a = audience(params.handle);
  if (!a) return { title: "No follower diff yet", robots: { index: false } };
  return {
    title: `Who follows @${a.handle} and doesn't hold`,
    alternates: { canonical: `/audience/${a.handle}/` },
    description: `${complete(a) ? "" : "At least "}${int(a.counts.prospects)} people follow @${a.handle} on Farcaster, publish a wallet, and do not hold ${a.symbol ? `$${a.symbol}` : "their coin"}. Ranked by what they already buy.`,
  };
}

export default function AudiencePage({ params }: { params: { handle: string } }) {
  const a = audience(params.handle);
  if (!a) {
    if (params.handle !== PLACEHOLDER) notFound();
    return (
      <section>
        <p className="kicker">The gap, by name</p>
        <h1>No follower diff has been built yet</h1>
        <p className="lede">
          The hourly collector writes one per creator. Run <code>tsx scripts/audience.ts &lt;handle&gt;</code> locally, or
          wait for the next scheduled run. <Link href="/audience/">Back to the list</Link>.
        </p>
      </section>
    );
  }
  const c = a.counts;
  const cov = coverage(a);
  const whole = complete(a);
  const atLeast = whole ? "" : "At least ";
  const conv = conversion(a);
  const noWallet = c.checked - c.withWallet;

  // The owner of this site has one Farcaster follower and a two-holder coin, so the first person
  // to use it on themselves sees nothing. Inventing a few plausible rows to fill the page would be
  // the easiest fix available and the worst: a tool about honest numbers cannot open with fake
  // ones. So when there is nothing, the page says there is nothing, explains exactly what it would
  // show, and points at a creator who actually has an audience — someone else's real data, marked
  // as someone else's.
  const empty = c.followersTotal === 0 ? "no-followers" : c.withWallet === 0 ? "no-wallets" : c.prospects === 0 ? "all-hold" : null;
  if (empty) return (
    <>
      <section>
        <p className="kicker">The gap, by name</p>
        <div className="coinhead">
          <CoinAvatar src={a.image ?? a.avatar} label={a.handle} address={a.coin ?? "0x000000"} size={56} />
          <div>
            <h1>
              {empty === "no-followers" ? `Nobody follows @${a.handle} on Farcaster yet`
                : empty === "no-wallets" ? `No follower of @${a.handle} publishes a wallet`
                : `Everyone who follows @${a.handle} and publishes a wallet already holds`}
            </h1>
            <p className="note">
              Farcaster <a href={`https://farcaster.xyz/${a.fcUsername}`} target="_blank" rel="noopener noreferrer">@{a.fcUsername}</a>
              {a.coin && <> · <a href={zoraUrl(a.coin)} target="_blank" rel="noopener noreferrer">the coin on Zora</a></>}
              {" · "}<Ago ts={a.generatedAt} />
            </p>
          </div>
        </div>
        <p className="lede">
          {empty === "no-followers"
            ? "There is no list to subtract from, so there is no list. This page is not broken and there is nothing hidden behind a sign-up: an empty follower list produces an empty page, and the alternative — a few plausible-looking names to show what it could do — would make every other number here worth less."
            : empty === "no-wallets"
              ? `${plural(c.followersTotal, "person", "people")} ${c.followersTotal === 1 ? "follows" : "follow"} this account and not one of them has verified an Ethereum address on Farcaster. Without a wallet a follower cannot be placed on either side of the diff, so nothing can honestly be said about them.`
              : `All ${int(c.withWallet)} of the followers with a verified wallet are already in the holder list. That is the outcome this page exists to produce, so there is no work left on it — the remaining ${int(c.holders - c.alreadyHold)} holders arrived some other way.`}
        </p>
      </section>

      <section className="panel">
        <h2>What was actually checked</h2>
        <div className="facts">
          <div><b className="num">{int(c.followersTotal)}</b>signed follows on the hub</div>
          <div><b className="num">{int(c.withWallet)}</b>publish a wallet</div>
          <div><b className="num">{int(c.holders)}</b>holders of the coin</div>
          <div><b className="num">{int(c.alreadyHold)}</b>hold and follow</div>
        </div>
      </section>

      <section className="panel">
        <h2>What would be here</h2>
        <p className="note">
          One row per person who follows and does not hold, best first, each with the reasons it is ranked where it is:
          how many other Zora coins their wallet holds and what they are worth, whether they hold coins that this coin&apos;s
          own holders hold, how recently they followed, and whether the wallet has a Zora profile. Every row comes with a
          draft message addressed to that person, which opens in your own composer — nothing is ever sent for you.
        </p>
        <p className="note">
          A worked example on a creator who has an audience: <Link href="/audience/jacob/">who follows @jacob and doesn&apos;t hold</Link>.
          Those are their real numbers, not a demo.
        </p>
        <p className="note"><Link href="/audience/">Other creators</Link> · <Link href="/method/">How every number here is worked out</Link></p>
      </section>
    </>
  );

  return (
    <>
      <section>
        <p className="kicker">The gap, by name</p>
        <div className="coinhead">
          <CoinAvatar src={a.image ?? a.avatar} label={a.handle} address={a.coin ?? "0x000000"} size={56} />
          <div>
            <h1>{atLeast}{plural(c.prospects, "person", "people")} {c.prospects === 1 ? "follows" : "follow"} @{a.handle} and {c.prospects === 1 ? "doesn’t" : "don’t"} hold{a.symbol ? ` $${a.symbol}` : ""}</h1>
            <p className="note">
              Farcaster <a href={`https://farcaster.xyz/${a.fcUsername}`} target="_blank" rel="noopener noreferrer">@{a.fcUsername}</a>
              {a.coin && <> · <a href={zoraUrl(a.coin)} target="_blank" rel="noopener noreferrer">the coin on Zora</a></>}
              {" · "}<Ago ts={a.generatedAt} />
            </p>
          </div>
        </div>
        <p className="lede">
          Every one of them publishes a verified Ethereum address, so we know they are not holders — not a guess from a
          follower count. {a.top.length === 1 ? "The one we found is" : `The best ${int(a.top.length)} are`} below, ranked by what they already buy.
          {!whole && ` Only ${Math.round(cov * 100)}% of the follower list has been resolved to wallets so far, so this count is over that part of it and will grow: it is a floor, not a total.`}
        </p>
      </section>

      <section className="panel">
        <h2>What was actually checked</h2>
        <div className="facts">
          <div><b className="num">{int(c.followersTotal)}</b>signed follow{c.followersTotal === 1 ? "" : "s"} on the hub</div>
          <div><b className="num">{int(c.checked)}</b>resolved to a profile</div>
          <div><b className="num">{int(c.withWallet)}</b>publish{c.withWallet === 1 ? "es" : ""} a wallet</div>
          <div><b className="num">{int(c.alreadyHold)}</b>already hold</div>
          <div><b className="num">{whole ? "" : "≥"}{int(c.prospects)}</b>follow{c.prospects === 1 ? "s" : ""}, {c.prospects === 1 ? "doesn’t" : "don’t"} hold</div>
        </div>
        <div className="cover" aria-hidden="true">
          <span className="cover-bar"><i style={{ width: `${Math.round(cov * 100)}%` }} /></span>
        </div>
        <p className="note">
          Coverage: {Math.round(cov * 100)}% of the follower list checked ({int(c.checked)} of {int(c.followersTotal)}).
          {" "}{int(noWallet)} followers publish no wallet at all, so nothing can be said about them either way.
        </p>
        <p className="note">
          <b>The conversion this implies:</b> {(conv * 100).toFixed(2)}% of the followers with a wallet {whole ? "" : "that we have checked so far "}hold the coin
          ({int(c.alreadyHold)} of {int(c.withWallet)}). Put the other way, {int(c.alreadyHold)} of the coin&apos;s
          {" "}{int(c.holders)} holders follow on Farcaster — the rest arrived some other way.
        </p>
        <p className="note">
          <b>Where this can be wrong.</b> A follower is only counted as a holder when one of the wallets they
          <em> verified on Farcaster</em> is in the holder list. Anyone who bought from a wallet they never verified
          looks like a prospect here, so {int(c.prospects)} is an upper bound and a few rows will be people who
          already hold. It cuts the other way too: {int(c.holders - c.alreadyHold)} of the coin&apos;s holders were not
          matched to a follower, and there is no way to tell apart &ldquo;does not follow&rdquo; from &ldquo;bought with an
          unverified wallet&rdquo;.
        </p>
        <details className="why">
          <summary>{c.claimedFarcaster != null ? "Three sources disagree about the follower count" : "Two sources disagree about the follower count"}</summary>
          <p className="note">
            The Farcaster hub holds {int(c.followersTotal)} signed, unrevoked follow message{c.followersTotal === 1 ? "" : "s"} for this account.
            {c.apiFollowerCount != null && <> Farcaster&apos;s own app reports {int(c.apiFollowerCount)}, which is a filtered figure it does not explain.</>}
            {c.claimedFarcaster != null && <> Zora&apos;s profile carries {int(c.claimedFarcaster)}, which is a cache: we compared 60 of Zora&apos;s follower fields across 39 creators with the values it served three days earlier and not one had changed.</>}
            {" "}This page, and every follower number on this site, counts the hub — it is the only one of the three that
            is defined, free to check, and able to hand over <em>who</em>, and a name is the thing you can act on.
            Treat the total as a ceiling. <Link href="/method/">The full comparison.</Link>
          </p>
        </details>
      </section>

      <section className="panel">
        <h2>How the list is ranked</h2>
        <p className="note">A score you cannot read is not worth trusting, so here is all of it. Every part is capped, and each row says which ones fired.</p>
        <ul className="signals">
          <li><b>Buys Zora coins</b><span>up to 40</span><p className="note">How many other Zora coins their wallet holds. Someone who has bought before is the whole point.</p></li>
          <li><b>Holds real value</b><span>up to 20</span><p className="note">What those holdings are worth in dollars. Separates a collector from a dust wallet.</p></li>
          <li><b>Same taste</b><span>up to 25</span><p className="note">They hold coins that <em>this coin&apos;s holders</em> hold. Learnt from a sample of real holders, not guessed.</p></li>
          <li><b>Followed recently</b><span>up to 10</span><p className="note">Full marks inside a month, nothing after a year. A fresh follower is still paying attention.</p></li>
          <li><b>On Zora already</b><span>up to 5</span><p className="note">Their wallet has a real Zora profile, so a coin page means something to them.</p></li>
        </ul>
        <p className="note">
          <b>How the shortlist was chosen.</b> Scoring {plural(c.prospects, "person", "people")} one at a time would mean a
          balance lookup each, so the shortlist is picked first on the two signals that are free once the holder lists are
          in — shared taste, then how recently they followed — and only the shortlist gets the exact balance lookup that
          produces the score. So this is the best of a strong shortlist, not a sort of everyone.
        </p>
        {a.taste.length > 0 && (
          <p className="note">
            What this audience collects, learnt from a sample of {a.symbol ? `$${a.symbol}` : "the coin"}&apos;s own holders:{" "}
            {a.taste.slice(0, 10).map((t) => t.symbol).filter(Boolean).join(", ")}.
            {" "}{int(c.withSharedTaste)} of the people who don&apos;t hold already own at least one of them.
            {" "}Each of those coins is read down to its largest few thousand holders, not to the very bottom, so
            someone holding a small amount of one is missed: treat this as a floor.
            {a.tasteMissed ? ` ${a.tasteMissed} of the lists could not be read on the last run, which lowers it further.` : ""}
          </p>
        )}
        {a.tasteSkipped?.length ? (
          <p className="note">
            Ignored as too widely held to mean anything: {a.tasteSkipped.map((t) => `${t.symbol} (${int(t.holders)} holders)`).join(", ")}.
            A coin almost everyone was given says nothing about what someone chooses to buy.
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>The worklist</h2>
        <p className="note">
          One step per person. Nothing is sent for you: the draft opens in your own composer and you decide whether to
          send it. Casting at hundreds of strangers is spam and it is your account that pays for it — work down the list.
        </p>
        <ProspectList people={rank(a.top, { symbol: a.symbol, coin: a.coin, handle: a.handle })} />
      </section>

      <p className="note">
        <Link href="/audience/">Other creators</Link> · <Link href="/method/">How every number here is worked out</Link>
      </p>
    </>
  );
}
