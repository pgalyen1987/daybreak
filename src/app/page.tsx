import Link from "next/link";
import { GapMap } from "@/components/charts";
import { compact, int, PLATFORM } from "@/lib/format";
import { Ago } from "@/components/Ago";
import { leads, stats, MIN_HOLDERS } from "@/lib/queries";

export default function Home() {
  const rows = leads();
  const s = stats();
  const top = rows.slice(0, 10);
  const hot = new Set(top.map((r) => r.address));
  const points = rows.map((r) => ({ key: r.address, label: "@" + (r.handle ?? r.symbol), reach: r.reach, holders: r.holders, score: r.score, hot: hot.has(r.address) }));
  return (
    <>
      <section>
        <p className="kicker">The gap map</p>
        <h1>Where the audience is, and where the holders aren&apos;t</h1>
        <p className="lede">
          Every Zora creator with a linked audience of 1,000+ and at least {MIN_HOLDERS} holders. Dots low and to the right have big
          followings and few holders: audiences that haven&apos;t found the coin yet. The ten largest gaps are highlighted.
        </p>
      </section>
      <section className="panel">
        <GapMap points={points} labelKeys={top.slice(0, 3).map((r) => r.address)} />
        <div className="legend" aria-hidden="true">
          <span><i style={{ background: "var(--gap)" }} />Ten largest gaps</span>
          <span><i style={{ background: "var(--rest)" }} />Other creators</span>
          <span>Dashed lines: 10, 1 and 0.1 holders per 1,000 followers</span>
        </div>
      </section>
      <section className="split">
        <div className="panel home-gaps">
          <h2>Largest gaps right now</h2>
          <div className="tablewrap" style={{ border: 0 }}>
            <table className="sheet" style={{ minWidth: 0 }}>
              <thead><tr><th className="l">#</th><th className="l">Creator</th><th>Audience</th><th>Holders</th><th>Score</th></tr></thead>
              <tbody>
                {top.map((r, i) => (
                  <tr key={r.address}>
                    <td className="rank l">{i + 1}</td>
                    <td className="l"><Link href={`/coin/${r.address}`} className="who"><b>@{r.handle ?? r.symbol}</b></Link></td>
                    <td>{compact(r.reach)}<span className="plat">{PLATFORM[r.platform ?? ""] ?? ""}</span></td>
                    <td>{int(r.holders)}</td>
                    <td className="score">{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/leaderboard">Full leaderboard →</Link>
        </div>
        <div className="panel">
          <h2>What the score means</h2>
          <p className="note" style={{ color: "var(--ink)" }}>
            Holders per 1,000 followers, compared with every other creator we track, and weighted by audience size so a million-follower
            gap outranks a small one. Audience is the creator&apos;s largest single linked account; followers overlap across platforms,
            so they aren&apos;t added up.
          </p>
          <div className="facts">
            <div><b className="num">{int(s.coins)}</b>creator coins tracked</div>
            <div><b className="num">{int(rows.length)}</b>with an audience</div>
            <div><b className="num">{int(s.trades)}</b>trades recorded</div>
          </div>
          <p className="note">Updated {s.lastSnapshot ? <Ago ts={s.lastSnapshot} /> : "not yet"}. <Link href="/method">How the numbers work</Link></p>
        </div>
      </section>
    </>
  );
}
