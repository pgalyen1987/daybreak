import type { Metadata } from "next";
import Link from "next/link";
import { miniappMeta } from "@/lib/embed";
import { int, usd } from "@/lib/format";
import { tagOverlap, tags, type Tag } from "@/lib/zora-queries";

export const metadata: Metadata = {
  title: "Tags",
  description: "Zora's tags have their own coins. Every tag's trading, holders and growth, updated hourly, and which tags share holders.",
  alternates: { canonical: "/tags/" },
  other: miniappMeta("/embed.png", "/tags/", "Zora tags on Daybreak"),
};

const zoraTag = (t: Tag) => `https://zora.co/coin/base:${t.address}`;
const growth = (t: Tag) => (t.holders24hAgo == null ? null : t.holders - t.holders24hAgo);

function TagTable({ rows, show }: { rows: Tag[]; show: "volume" | "growth" | "age" }) {
  return (
    <div className="tablewrap" style={{ border: 0 }}>
      <table className="sheet" style={{ minWidth: 0 }}>
        <thead><tr><th className="l">Tag</th><th>24h volume</th><th>Holders</th><th>{show === "age" ? "Created" : "Holders, 24h"}</th><th>Market cap</th></tr></thead>
        <tbody>
          {rows.map((t) => {
            const g = growth(t);
            return (
              <tr key={t.address}>
                <td className="l"><a className="who" href={zoraTag(t)} target="_blank" rel="noopener noreferrer"><b>#{t.symbol}</b></a></td>
                <td>{usd(t.volume24h)}</td>
                <td>{int(t.holders)}</td>
                <td>{show === "age" ? (t.createdAt ?? "").slice(0, 10) : g == null ? "–" : `${g > 0 ? "+" : ""}${int(g)}`}</td>
                <td>{usd(t.marketCap)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TagsPage() {
  const all = tags();
  const busiest = [...all].sort((a, b) => b.volume24h - a.volume24h);
  const growing = all.filter((t) => (growth(t) ?? 0) > 0).sort((a, b) => (growth(b) ?? 0) - (growth(a) ?? 0));
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  // most new tags never trade; the ones that do come first
  const fresh = all.filter((t) => (t.createdAt ?? "") >= weekAgo).sort((a, b) => b.volume24h - a.volume24h || b.holders - a.holders || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const volume = all.reduce((a, t) => a + t.volume24h, 0);
  const thin = all.filter((t) => t.holders < 5).length;
  const overlap = tagOverlap(busiest.slice(0, 15));
  const hasHistory = all.some((t) => t.holders24hAgo != null);
  return (
    <>
      <section>
        <p className="kicker">Tags</p>
        <h1>What Zora&apos;s tags are worth</h1>
        <p className="lede">
          On Zora a tag groups posts and has a coin of its own (Zora calls them trend coins). This is every tag in Zora&apos;s trending,
          most traded, newest and most valuable lists, updated hourly: what trades, what&apos;s gaining holders, and which tags share them.
        </p>
      </section>
      {!all.length ? <p className="panel note">The first tag snapshot arrives with the next hourly update.</p> : (
        <>
          <section className="panel">
            <div className="facts">
              <div><b>{int(all.length)}</b>tags tracked</div>
              <div><b>{usd(volume)}</b>traded, 24 hours</div>
              <div><b>{int(thin)}</b>with fewer than 5 holders</div>
              <div><b>{int(fresh.length)}</b>new this week</div>
            </div>
            <p className="note">Tag coins are small next to creator coins: most volume sits in a handful of tags, and many tags have one or two holders. Zora&apos;s public API doesn&apos;t give a post count per tag, so growth here is holders and trading.</p>
          </section>
          <section className="panel">
            <h2>Most traded, 24 hours</h2>
            <TagTable rows={busiest.slice(0, 15)} show="growth" />
          </section>
          <section className="split">
            <div className="panel">
              <h2>Gaining holders</h2>
              {growing.length ? <TagTable rows={growing.slice(0, 10)} show="growth" /> : <p className="note">{hasHistory ? "No tag gained holders in the last 24 hours." : "Growth needs a day of hourly snapshots; it fills in tomorrow."}</p>}
            </div>
            <div className="panel">
              <h2>New this week, most traded first</h2>
              {fresh.length ? <TagTable rows={fresh.slice(0, 10)} show="age" /> : <p className="note">No tag in these lists was created this week.</p>}
            </div>
          </section>
          <section className="panel">
            <h2>Tags that share holders</h2>
            {overlap.pairs.length ? (
              <ul className="pairs">
                {overlap.pairs.map((p) => <li key={p.a + p.b}><b>#{p.a}</b> and <b>#{p.b}</b>: {int(p.shared)} holders in common ({Math.round((p.shared / p.smaller) * 100)}% of the smaller tag)</li>)}
              </ul>
            ) : <p className="note">{overlap.day ? "No two of the busiest tags share more than one holder." : "Holder sets for the busiest tags are taken once a day; the first is on its way."}</p>}
            {overlap.day && <p className="note">From the {overlap.day} holder sets of the 15 most traded tags, leaving out the trading pool.</p>}
          </section>
        </>
      )}
      <p className="note">Not financial advice. Data from Zora&apos;s API; see <Link href="/method">method</Link>.</p>
    </>
  );
}
