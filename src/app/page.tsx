import Link from "next/link";
import { GapMap } from "@/components/charts";
import { compact, int } from "@/lib/format";
import { Ago } from "@/components/Ago";
import { leads, stats, MIN_HOLDERS } from "@/lib/queries";
import { MIN_RANKED } from "@/lib/metrics";
import { followCoverage } from "@/lib/follows";
import type { Metadata } from "next";
import { CoinAvatar } from "@/components/CoinAvatar";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const SITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Daybreak",
  url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/`,
  description: "Analytics for Zora creator coins: which creators' Farcaster audiences haven't found their coin yet, plus holder churn and trading patterns.",
  publisher: { "@type": "Organization", name: "Rebel Studios Software", url: "https://rebelstudiossoftware.com" },
};

export default function Home() {
  const rows = leads();
  const s = stats();
  const ranked = rows.length >= MIN_RANKED;
  // Ordering by a score the page refuses to print would be the same claim made quietly. Until
  // there are enough creators to rank inside, the list is ordered by the raw rate instead.
  const top = (ranked ? rows : [...rows].sort((a, b) => a.per1000 - b.per1000)).slice(0, 10);
  const hot = new Set(top.map((r) => r.address));
  const cov = followCoverage();
  const points = rows.map((r) => ({ key: r.address, label: "@" + (r.handle ?? r.symbol), follows: r.followCount, holders: r.holders, score: r.score, hot: hot.has(r.address), image: r.image }));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE) }} />
      <section>
        <p className="kicker">The gap map</p>
        <h1>Where the audience is, and where the holders aren&apos;t</h1>
        <p className="lede">
          Every Zora creator whose Farcaster follows we have counted — 1,000+ of them, and at least {MIN_HOLDERS} holders.
          Dots low and to the right are followed by a lot of people and held by few: audiences that haven&apos;t found the
          coin yet. {ranked ? "The ten largest gaps are highlighted." : "The ten with the fewest holders per 1,000 follows are highlighted."}
        </p>
        <p className="note">
          Across is <b>Farcaster follows</b>, counted by walking the public hub ourselves — {cov.measured} of the {cov.linked} tracked
          creators with a linked Farcaster account so far. It is not the follower number on a Zora profile: that one is a cache that
          does not move, and on @jacob it reads 292,097 where the protocol holds 478,377 follow records.
          {" "}<Link href="/method/">What the count includes, and what it can&apos;t say.</Link>
        </p>
        <p className="lede">Are you a creator? <Link href="/check/">Check your own coin</Link>: it works for any Zora profile and says what to do next.
          Also here: <Link href="/rewards/">who Zora pays on every trade</Link> and <Link href="/tags/">what its tags are worth</Link>.</p>
      </section>
      <section className="panel">
        {points.length ? (
          <>
            <GapMap points={points} labelKeys={top.slice(0, 3).map((r) => r.address)} />
            <div className="legend" aria-hidden="true">
              <span><i style={{ background: "var(--gap)" }} />{ranked ? "Ten largest gaps" : "Ten fewest per 1,000"}</span>
              <span><i style={{ background: "var(--rest)" }} />Other creators</span>
              <span>Dashed lines: 10, 1 and 0.1 holders per 1,000 follows</span>
            </div>
          </>
        ) : (
          <>
            <h2>Nothing to plot yet</h2>
            <p className="note">
              This map used to be drawn on the follower numbers Zora carries. Those turned out to be a cache that does not
              move — 60 fields across 39 creators, identical three days apart — so they were taken out rather than
              plotted with a footnote. What replaces them is a count we take ourselves, by walking the public Farcaster
              hub for every signed follow of a creator&apos;s account. It costs seconds for a small account and minutes for
              a large one, so the collector works through the list a few per hour and this map fills in as it goes:
              {" "}{cov.measured} of {cov.linked} counted. There is nothing to show until a creator has been counted, so
              nothing is shown.
            </p>
            <p className="note">
              Meanwhile the parts that never depended on a follower count are live: <Link href="/leaderboard/">holders and
              market caps</Link>, <Link href="/rewards/">what Zora pays out on every trade</Link>, and
              {" "}<Link href="/tags/">what its tags are worth</Link>.
            </p>
          </>
        )}
      </section>
      <section className="split">
        <div className="panel home-gaps">
          <h2>{ranked ? "Largest gaps right now" : "Fewest holders per 1,000 follows"}</h2>
          <div className="tablewrap" style={{ border: 0 }}>
            <table className="sheet" style={{ minWidth: 0 }}>
              <thead><tr><th className="l">#</th><th className="l">Creator</th><th>Follows</th><th>Holders</th><th>{ranked ? "Score" : "Per 1k"}</th></tr></thead>
              <tbody>
                {top.map((r, i) => (
                  <tr key={r.address}>
                    <td className="rank l">{i + 1}</td>
                    <td className="l"><Link href={`/coin/${r.address}`} className="who"><CoinAvatar src={r.image} label={r.handle ?? r.symbol} address={r.address} size={28} /><b>@{r.handle ?? r.symbol}</b></Link></td>
                    <td>{compact(r.followCount)}</td>
                    <td>{int(r.holders)}</td>
                    <td className="score">{ranked ? r.score : r.per1000.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/leaderboard">Full leaderboard →</Link>
        </div>
        <div className="panel">
          <h2>{ranked ? "What the score means" : "Why there is no score yet"}</h2>
          <p className="note" style={{ color: "var(--ink)" }}>
            {ranked ? (
              <>Holders per 1,000 Farcaster follows, ranked against every other creator we have counted, then weighted by size so a
              300,000-follow gap outranks a 3,000-follow one. One graph, one measurement, taken by us — never a follower number
              copied from somewhere that will not say when it was taken.</>
            ) : (
              <>The score is a creator&apos;s place among all the others, so it needs others. {cov.measured} counted is not enough to
              rank inside — &ldquo;100&rdquo; would only mean &ldquo;worst of {cov.measured}&rdquo; while reading like
              &ldquo;the largest gap on Zora&rdquo;. Until {MIN_RANKED} creators are counted the table shows the raw rate instead,
              which is true at any sample size.</>
            )}
          </p>
          <div className="facts">
            <div><b className="num">{int(s.coins)}</b>creator coins tracked</div>
            <div><b className="num">{int(cov.measured)}</b>creators counted</div>
            <div><b className="num">{int(s.trades)}</b>trades recorded</div>
          </div>
          <p className="note">Updated {s.lastSnapshot ? <Ago ts={s.lastSnapshot} /> : "not yet"}. <Link href="/method">How the numbers work</Link></p>
        </div>
      </section>
    </>
  );
}
