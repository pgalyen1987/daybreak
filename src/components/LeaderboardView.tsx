"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { compact, int, usd } from "@/lib/format";
import { MINS, SORTS, type Boards, type SortKey } from "@/lib/leaderboard";
import { MIN_RANKED } from "@/lib/metrics";
import { CoinAvatar } from "@/components/CoinAvatar";

type View = { sort: SortKey; min: number };

const METER_MAX = 10; // holders per 1,000 follows; anything above fills the bar

function parse(get: (k: string) => string | null, defaultMin: number): View {
  const s = get("sort");
  const m = Number(get("min"));
  return {
    sort: (s && s in SORTS ? s : "score") as SortKey,
    min: (MINS as readonly number[]).includes(m) ? m : defaultMin,
  };
}

export function LeaderboardFromUrl({ boards, defaultMin, coverage }: { boards: Boards; defaultMin: number; coverage: { measured: number; linked: number } }) {
  const params = useSearchParams();
  return <LeaderboardView boards={boards} defaultMin={defaultMin} coverage={coverage} view={parse((k) => params.get(k), defaultMin)} />;
}

export function LeaderboardView({ boards, defaultMin, view, coverage }: { boards: Boards; defaultMin: number; view?: View; coverage: { measured: number; linked: number } }) {
  const requested = view?.sort ?? "score";
  const min = view?.min ?? defaultMin;
  let rows = boards[String(min)] ?? [];
  // The gap score is a percentile inside the counted set, so below MIN_RANKED creators it would
  // read as a verdict on Zora while meaning "worst of nine". The column is dropped rather than
  // shown with a caveat, and the board falls back to the raw rate, which is true at any size.
  const ranked = rows.length >= MIN_RANKED;
  const sort: SortKey = !ranked && requested === "score" ? "per1000" : requested;
  const columns = (Object.keys(SORTS) as SortKey[]).filter((k) => ranked || k !== "score");
  const asc = sort === "per1000";
  rows = [...rows].sort((a, b) => (asc ? a[sort] - b[sort] : b[sort] - a[sort]));
  const q = (patch: Partial<Record<keyof View, string | null>>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { sort: requested, min: min === defaultMin ? null : String(min), ...patch };
    for (const [k, v] of Object.entries(cur)) if (v && !(k === "sort" && v === "score")) p.set(k, v);
    const s = p.toString();
    return s ? `/leaderboard/?${s}` : "/leaderboard/";
  };
  return (
    <>
      <section>
        <p className="kicker">Gap leaderboard</p>
        <h1>Creators whose audience hasn&apos;t found their coin</h1>
        <p className="lede">
          {rows.length} creators with 1,000+ Farcaster follows and at least {min} holders. Sort by any column;
          fewer holders per 1,000 follows means more of the audience still to reach.
        </p>
        {!ranked && (
          <p className="note">
            No gap score yet. It is a creator&apos;s rank among all the others, so with {rows.length} counted a top score would
            mean &ldquo;worst of {rows.length}&rdquo; while reading like &ldquo;the largest gap on Zora&rdquo;. The board is
            sorted by the raw rate until {MIN_RANKED} creators have been counted.
          </p>
        )}
        <p className="note">
          Follows are signed follow records on the Farcaster hub, counted by Daybreak — not the follower number on
          a Zora profile, which is a cache that does not move. A creator we have not counted yet is not on this
          board: {coverage.measured} of the {coverage.linked} tracked creators with a linked Farcaster account have
          been counted so far. <Link href="/method/">How, and what the count includes.</Link>
        </p>
        {rows.some((r) => r.per1000 > 1000) && (
          <p className="note">
            A rate above 1,000 means the coin has more holders than the creator has Farcaster follows. That is not an
            error and it is not a conversion over 100%: holders are not a subset of followers, and those buyers arrived
            through an audience nobody can count for free. It is a sign the Farcaster number is the wrong lens on that
            creator, not that they have converted everyone.
          </p>
        )}
      </section>
      <div className="filters">
        <span>Min holders</span>
        {MINS.map((m) => <Link key={m} href={q({ min: m === defaultMin ? null : String(m) })} aria-current={min === m ? "true" : undefined}>{m}</Link>)}
      </div>
      <div className="tablewrap">
        <table className="sheet">
          <thead>
            <tr>
              <th className="l">#</th><th className="l">Creator</th>
              {columns.map((k) => (
                <th key={k} scope="col" className={`c-${k}`} aria-sort={sort === k ? (asc ? "ascending" : "descending") : undefined}><Link href={q({ sort: k })} aria-current={sort === k ? "true" : undefined}>{SORTS[k]}</Link></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.address}>
                <td className="rank l">{i + 1}</td>
                <td className="l"><Link href={`/coin/${r.address}/`} className="who"><CoinAvatar src={r.image} label={r.handle ?? r.symbol} address={r.address} /><b>@{r.handle ?? r.symbol}</b><span>${r.symbol}</span></Link></td>
                {ranked && <td className="score">{r.score}</td>}
                <td className="c-followCount">{compact(r.followCount)}</td>
                <td className="c-holders">{int(r.holders)}</td>
                <td className="c-per1000">
                  <span className="meter">{r.per1000.toFixed(2)}
                    <svg viewBox="0 0 84 8" aria-hidden="true"><rect width="84" height="8" rx="4" fill="var(--faint)" /><rect width={Math.max(2, Math.min(84, (84 * r.per1000) / METER_MAX))} height="8" rx="4" fill="var(--accent)" /></svg>
                  </span>
                </td>
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
