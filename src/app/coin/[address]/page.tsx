import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlowBars, Heatmap, HolderLine } from "@/components/charts";
import { miniappMeta } from "@/lib/embed";
import { compact, int, pct, PLATFORM, usd, zoraUrl } from "@/lib/format";
import { allCoins, coinByAddress, coinTrades, holderChurn, holderSeries, leads, reach, topHolderShare } from "@/lib/queries";
import { coinCreatorEarnings } from "@/lib/zora-queries";
import { CoinAvatar } from "@/components/CoinAvatar";
import { ShareBar } from "@/components/ShareBar";

// One page per tracked coin, written at build time.
export const dynamicParams = false;
export function generateStaticParams() {
  return allCoins().map((c) => ({ address: c.address }));
}

export function generateMetadata({ params }: { params: { address: string } }): Metadata {
  const c = coinByAddress(params.address);
  if (!c) return { title: "Coin not found" };
  const name = `@${c.handle ?? c.symbol}`;
  const card = `/coin/${c.address}/card.png`;
  return {
    title: `$${c.symbol} holders, churn and trading`,
    alternates: { canonical: `/coin/${c.address}/` },
    description: `${name}'s Zora creator coin: ${int(c.holders)} holders, trading patterns, holder churn and how much of their audience holds it.`,
    openGraph: { images: [{ url: card, width: 1200, height: 630 }] },
    // a cast of this page shows this coin's own 3:2 card
    other: miniappMeta(`/coin/${c.address}/embed.png`, `/coin/${c.address}/`, `$${c.symbol} on Daybreak`.slice(0, 32)),
    twitter: { card: "summary_large_image", images: [card] },
  };
}

export default function CoinPage({ params }: { params: { address: string } }) {
  const c = coinByAddress(params.address);
  if (!c) notFound();
  const lead = leads(1).find((l) => l.address === c.address);
  const aud = reach(c.socials);
  const t = coinTrades(c.address, 7);
  const p = t.patterns;
  const churn = holderChurn(c.address);
  const conc = topHolderShare(c.address);
  const series = holderSeries(c.address);
  const earned = coinCreatorEarnings(c.address, 7);
  const quiet = p.totalUsd < 1; // a chart of cents is noise: say so instead
  const socials = Object.entries(c.socials).filter(([, v]) => v != null && v > 0) as [string, number][];
  // A creator sharing their own coin's page is the cheapest reach Daybreak gets; the text is the
  // page's own numbers, nothing added.
  const pageUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/coin/${c.address}/`;
  const shareText = `$${c.symbol} on Zora: ${int(c.holders)} holders${aud.total > 0 ? ` from ${compact(aud.total)} ${PLATFORM[aud.platform ?? ""] ?? ""} followers` : ""}. Holder churn, trading and the audience gap on Daybreak:`
  return (
    <>
      <section style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", alignItems: "end", justifyContent: "space-between" }}>
        <div className="coinhead">
          <CoinAvatar src={c.image} label={c.symbol} address={c.address} size={72} />
          <div>
          <p className="kicker">Creator coin</p>
          <h1>${c.symbol}</h1>
          <p className="lede">@{c.handle ?? "unknown"}{c.name && c.name !== c.symbol ? ` · ${c.name}` : ""}</p>
          <ShareBar text={shareText} url={pageUrl} quiet />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn" href={zoraUrl(c.address)} target="_blank" rel="noopener noreferrer">Buy on Zora</a>
          <Link className="btn ghost" href="/leaderboard">Leaderboard</Link>
        </div>
      </section>

      <section className="panel">
        <div className="facts">
          <div><b>{int(c.holders)}</b>holders</div>
          <div><b>{usd(c.marketCap)}</b>market cap</div>
          <div><b>{usd(p.totalUsd)}</b>volume, 7 days</div>
          <div><b>{int(p.traders)}</b>traders, 7 days</div>
          {earned && <div><b>{usd(earned.usd)}</b><Link href="/rewards">paid to the creator</Link>, {earned.since ? `since ${new Date(earned.since + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "7 days"}</div>}
          {lead && <div><b style={{ color: "var(--gap)" }}>{lead.score}</b>gap score</div>}
        </div>
      </section>

      <section className="split">
        <div className="panel">
          <h2>Audience and holders</h2>
          {aud.total > 0 ? (
            <>
              <div className="facts">
                <div><b>{compact(aud.total)}</b>followers on {PLATFORM[aud.platform ?? ""]}</div>
                <div><b>{((c.holders / aud.total) * 1000).toFixed(2)}</b>holders per 1,000 followers</div>
                <div><b>{compact(Math.max(0, aud.total - c.holders))}</b>not yet holding</div>
              </div>
              <p className="note">Linked accounts: {socials.map(([k, v]) => `${PLATFORM[k]} ${compact(v)}`).join(" · ")}. Audience uses the largest one, since followers overlap.</p>
            </>
          ) : <p className="note">This creator hasn&apos;t linked a social account on Zora, so there&apos;s no audience to compare with.</p>}
        </div>
        <div className="panel">
          <h2>Holder churn</h2>
          {churn.ready ? (
            <>
              <div className="facts">
                <div><b>{pct(churn.churnRate, 1)}</b>left since {churn.from}</div>
                <div><b>{int(churn.exited)}</b>wallets out</div>
                <div><b>{int(churn.entered)}</b>wallets in</div>
              </div>
              <p className="note">{churn.complete ? "Across every holder." : `Across the top ${int(churn.captured)} holders by balance (of ${int(churn.total)}), so a wallet dropping out of the top ${int(churn.captured)} counts as leaving.`}</p>
            </>
          ) : <p className="note">Churn compares one day&apos;s holders with the next. The first daily snapshot is in; churn appears after the second.</p>}
          {conc && <p className="note">Top 10 wallets hold {pct(conc.top10Share, 1)} of supply; the trading pool holds {pct(conc.poolShare, 1)}.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Buys and sells, last 7 days</h2>
        {quiet ? (
          <p className="note">Barely traded this week: {usd(p.totalUsd)} across {int(p.buys + p.sells)} trade{p.buys + p.sells === 1 ? "" : "s"}. The daily chart appears once it trades.</p>
        ) : (
          <>
            <div className="legend" aria-hidden="true"><span><i style={{ background: "var(--buy)" }} />Buys</span><span><i style={{ background: "var(--sell)" }} />Sells</span></div>
            <FlowBars daily={t.daily} />
          </>
        )}
        <div className="facts">
          <div><b>{pct(p.buyShare)}</b>of volume was buying</div>
          <div><b>{usd(p.netFlowUsd)}</b>net flow</div>
          <div><b>{pct(p.top5Share)}</b>of volume from the top 5 traders</div>
          <div><b>{int(p.buys + p.sells)}</b>trades</div>
        </div>
        {t.historySince && t.historySince > Date.parse(t.daily[0].day + "T00:00:00Z") && (
          <p className="note">Our trade record for this coin starts {new Date(t.historySince).toISOString().slice(0, 16).replace("T", " ")} UTC, so earlier days may read low.</p>
        )}
      </section>

      <section className="split">
        <div className="panel">
          <h2>When it trades</h2>
          {quiet ? <p className="note">Too few trades this week to show a pattern.</p> : (
            <>
              <Heatmap grid={p.grid} />
              <p className="note">Dollar volume by weekday and hour, UTC, last 7 days.</p>
            </>
          )}
        </div>
        <div className="panel">
          <h2>Holders over time</h2>
          <HolderLine series={series} />
        </div>
      </section>
      <p className="note">Not financial advice. Numbers come from Zora&apos;s API; see <Link href="/method">how they&apos;re calculated</Link>.</p>
    </>
  );
}
