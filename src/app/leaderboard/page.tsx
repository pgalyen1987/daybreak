import type { Metadata } from "next";
import Link from "next/link";
import { compact, int, PLATFORM, usd } from "@/lib/format";
import { leads, MIN_HOLDERS } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gap leaderboard", description: "Zora creators ranked by how much of their audience hasn't found their coin yet." };

const SORTS = { score: "Gap score", reach: "Audience", holders: "Holders", conversion: "Holders per 1k", untapped: "Not yet holding", marketCap: "Market cap" } as const;
type SortKey = keyof typeof SORTS;

export default function Leaderboard({ searchParams }: { searchParams: { sort?: string; platform?: string; min?: string } }) {
  const sort: SortKey = (searchParams.sort && searchParams.sort in SORTS ? searchParams.sort : "score") as SortKey;
  const platform = searchParams.platform && searchParams.platform in PLATFORM ? searchParams.platform : null;
  const min = Math.max(1, Number(searchParams.min) || MIN_HOLDERS);
  let rows = leads(min);
  if (platform) rows = rows.filter((r) => r.platform === platform);
  const asc = sort === "conversion";
  rows = [...rows].sort((a, b) => (asc ? a[sort] - b[sort] : b[sort] - a[sort]));
  const METER_MAX = 10; // holders per 1k; anything above fills the bar
  const q = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { sort, platform, min: min === MIN_HOLDERS ? null : String(min), ...patch };
    for (const [k, v] of Object.entries(cur)) if (v && !(k === "sort" && v === "score")) p.set(k, v);
    const s = p.toString();
    return s ? `/leaderboard?${s}` : "/leaderboard";
  };
  return (
    <>
      <section>
        <p className="kicker">Gap leaderboard</p>
        <h1>Creators whose audience hasn&apos;t found their coin</h1>
        <p className="lede">{rows.length} creators with 1,000+ followers and at least {min} holders. Sort by any column; lower holders per 1,000 means more of the audience still to reach.</p>
      </section>
      <div className="filters">
        <span>Audience on</span>
        <Link href={q({ platform: null })} aria-current={!platform ? "true" : undefined}>Any</Link>
        {Object.entries(PLATFORM).map(([k, v]) => <Link key={k} href={q({ platform: k })} aria-current={platform === k ? "true" : undefined}>{v}</Link>)}
        <span style={{ marginLeft: 8 }}>Min holders</span>
        {[1, 10, 100].map((m) => <Link key={m} href={q({ min: m === MIN_HOLDERS ? null : String(m) })} aria-current={min === m ? "true" : undefined}>{m}</Link>)}
      </div>
      <div className="tablewrap">
        <table className="sheet">
          <thead>
            <tr>
              <th className="l">#</th><th className="l">Creator</th>
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <th key={k} scope="col"><Link href={q({ sort: k })} aria-sort={sort === k ? (asc ? "ascending" : "descending") : undefined}>{SORTS[k]}</Link></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.address}>
                <td className="rank l">{i + 1}</td>
                <td className="l"><Link href={`/coin/${r.address}`} className="who"><b>@{r.handle ?? r.symbol}</b><span>${r.symbol}</span></Link></td>
                <td className="score">{r.score}</td>
                <td>{compact(r.reach)}<span className="plat">{PLATFORM[r.platform ?? ""] ?? ""}</span></td>
                <td>{int(r.holders)}</td>
                <td>
                  <span className="meter">{(r.conversion * 1000).toFixed(2)}
                    <svg viewBox="0 0 84 8" aria-hidden="true"><rect width="84" height="8" rx="2" fill="var(--faint)" /><rect width={Math.max(2, Math.min(84, (84 * r.conversion * 1000) / METER_MAX))} height="8" rx="2" fill="var(--buy)" /></svg>
                  </span>
                </td>
                <td>{compact(r.untapped)}</td>
                <td>{usd(r.marketCap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Not financial advice. A gap means an audience hasn&apos;t bought in; it doesn&apos;t mean it will.</p>
    </>
  );
}
