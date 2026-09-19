"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { compact, int, PLATFORM, usd } from "@/lib/format";
import { MINS, SORTS, type Boards, type SortKey } from "@/lib/leaderboard";
import { CoinAvatar } from "@/components/CoinAvatar";

type View = { sort: SortKey; platform: string | null; min: number };

const METER_MAX = 10; // holders per 1k; anything above fills the bar

function parse(get: (k: string) => string | null, defaultMin: number): View {
  const s = get("sort");
  const p = get("platform");
  const m = Number(get("min"));
  return {
    sort: (s && s in SORTS ? s : "score") as SortKey,
    platform: p && p in PLATFORM ? p : null,
    min: (MINS as readonly number[]).includes(m) ? m : defaultMin,
  };
}

export function LeaderboardFromUrl({ boards, defaultMin }: { boards: Boards; defaultMin: number }) {
  const params = useSearchParams();
  return <LeaderboardView boards={boards} defaultMin={defaultMin} view={parse((k) => params.get(k), defaultMin)} />;
}

export function LeaderboardView({ boards, defaultMin, view }: { boards: Boards; defaultMin: number; view?: View }) {
  const { sort, platform, min } = view ?? { sort: "score" as SortKey, platform: null, min: defaultMin };
  let rows = boards[String(min)] ?? [];
  if (platform) rows = rows.filter((r) => r.platform === platform);
  const asc = sort === "conversion";
  rows = [...rows].sort((a, b) => (asc ? a[sort] - b[sort] : b[sort] - a[sort]));
  const q = (patch: Partial<Record<keyof View, string | null>>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { sort, platform, min: min === defaultMin ? null : String(min), ...patch };
    for (const [k, v] of Object.entries(cur)) if (v && !(k === "sort" && v === "score")) p.set(k, v);
    const s = p.toString();
    return s ? `/leaderboard/?${s}` : "/leaderboard/";
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
        {MINS.map((m) => <Link key={m} href={q({ min: m === defaultMin ? null : String(m) })} aria-current={min === m ? "true" : undefined}>{m}</Link>)}
      </div>
      <div className="tablewrap">
        <table className="sheet">
          <thead>
            <tr>
              <th className="l">#</th><th className="l">Creator</th>
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <th key={k} scope="col" className={`c-${k}`} aria-sort={sort === k ? (asc ? "ascending" : "descending") : undefined}><Link href={q({ sort: k })} aria-current={sort === k ? "true" : undefined}>{SORTS[k]}</Link></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.address}>
                <td className="rank l">{i + 1}</td>
                <td className="l"><Link href={`/coin/${r.address}/`} className="who"><CoinAvatar src={r.image} label={r.handle ?? r.symbol} address={r.address} /><b>@{r.handle ?? r.symbol}</b><span>${r.symbol}</span></Link></td>
                <td className="score">{r.score}</td>
                <td className="c-reach">{compact(r.reach)}<span className="plat">{PLATFORM[r.platform ?? ""] ?? ""}</span></td>
                <td className="c-holders">{int(r.holders)}</td>
                <td className="c-conversion">
                  <span className="meter">{(r.conversion * 1000).toFixed(2)}
                    <svg viewBox="0 0 84 8" aria-hidden="true"><rect width="84" height="8" rx="4" fill="var(--faint)" /><rect width={Math.max(2, Math.min(84, (84 * r.conversion * 1000) / METER_MAX))} height="8" rx="4" fill="var(--accent)" /></svg>
                  </span>
                </td>
                <td className="c-untapped">{compact(r.untapped)}</td>
                <td className="c-marketCap">{usd(r.marketCap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Not financial advice. A gap means an audience hasn&apos;t bought in; it doesn&apos;t mean it will.</p>
    </>
  );
}
