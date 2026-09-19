import type { Metadata } from "next";
import Link from "next/link";
import { StackedBars } from "@/components/charts";
import { miniappMeta } from "@/lib/embed";
import { int, pct, usd } from "@/lib/format";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/rewards";
import { rewardsSummary, type Earner } from "@/lib/zora-queries";
import { CoinAvatar } from "@/components/CoinAvatar";

export const metadata: Metadata = {
  title: "Trading rewards",
  description: "What Zora pays on every trade, and to whom: creators, the apps that create coins and route trades, and the protocol. Every Zora coin, updated hourly.",
  alternates: { canonical: "/rewards/" },
  other: miniappMeta("/embed.png", "/rewards/", "Zora trading rewards"),
};

const COLOR: Record<Role, string> = { creator: "var(--s-creator)", platform: "var(--s-platform)", trade: "var(--s-trade)", protocol: "var(--s-protocol)", doppler: "var(--s-doppler)" };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const TO: Record<Role, string> = { creator: "to creators", platform: "to platform referrers", trade: "to trade referrers", protocol: "to the protocol (Zora)", doppler: "to Doppler" };

function Earners({ title, rows, note }: { title: string; rows: Earner[]; note: string }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="tablewrap" style={{ border: 0 }}>
          <table className="sheet" style={{ minWidth: 0 }}>
            <thead><tr><th className="l">#</th><th className="l">Wallet</th><th>Earned</th><th>Payouts</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.address}>
                  <td className="rank l">{i + 1}</td>
                  <td className="l"><a className="who" href={r.name ? `https://zora.co/@${r.name}` : `https://basescan.org/address/${r.address}`} target="_blank" rel="noopener noreferrer"><CoinAvatar src={r.image} label={r.name ?? r.address.slice(2)} address={r.address} size={28} />{r.name ? <b>@{r.name}</b> : <code>{short(r.address)}</code>}</a>{r.zora && <span className="plat">Zora</span>}</td>
                  <td>{usd(r.usd)}</td>
                  <td>{int(r.events)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="note">None in this window.</p>}
      <p className="note">{note}</p>
    </div>
  );
}

export default function RewardsPage() {
  const s = rewardsSummary(7);
  return (
    <>
      <section>
        <p className="kicker">Trading rewards</p>
        <h1>Who Zora pays on every trade</h1>
        <p className="lede">
          Each trade on a Zora coin pays a fee that the coin&apos;s contract splits on the spot: most to the creator, some to the app
          that created the coin (platform referrer) and the app that sent the trade (trade referrer), and the rest to the protocol and
          Doppler, the protocol behind the coins' liquidity. Every Zora coin, read from Base every hour.
        </p>
      </section>
      {!s ? <p className="panel note">The first payouts arrive with the next hourly update.</p> : (
        <>
          <section className="panel">
            <div className="facts">
              <div><b>{usd(s.total)}</b>paid, last {s.days} days</div>
              {ROLES.map((r) => <div key={r}><b>{s.total > 0 ? pct(s.byRole[r] / s.total, 1) : "0%"}</b><i className="dot" style={{ background: COLOR[r] }} />{TO[r]}</div>)}
              <div><b>{int(s.payouts)}</b>payouts</div>
            </div>
            <p className="note">
              Dollar values use each currency&apos;s price when the payout was recorded. {pct(s.priced / s.payouts, 0)} of payouts are priced; the rest were paid in
              creator coins we hadn&apos;t priced yet and count as $0 here, so totals read low. Recorded since {s.earliest}.
            </p>
          </section>
          <section className="panel">
            <h2>Per day</h2>
            <div className="legend" aria-hidden="true">{ROLES.map((r) => <span key={r}><i style={{ background: COLOR[r] }} />{ROLE_LABEL[r]}</span>)}</div>
            <StackedBars daily={s.daily} parts={ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r], color: COLOR[r] }))} />
          </section>
          <section className="split">
            <Earners title="Top creators, 7 days" rows={s.top.creator} note="The wallet a coin pays its creator share to." />
            <Earners title="Top platform referrers, 7 days" rows={s.top.platform} note="Apps credited with creating the coins that traded." />
          </section>
          <section className="split">
            <Earners title="Top trade referrers, 7 days" rows={s.top.trade} note="Apps that routed trades. Most trades name none." />
            <div className="panel">
              <h2>How this is counted</h2>
              <p className="note">
                Two events carry the payouts: one per trade with the five-way split, and one for the creator and protocol shares of
                creator-coin trades. Both are read for every Zora coin, not only the creators on the <Link href="/">gap map</Link>. Wallets show their Zora
                handle when they have a profile.
              </p>
            </div>
          </section>
        </>
      )}
      <p className="note">Not financial advice. On-chain data from Base, prices from Zora&apos;s API; see <Link href="/method">method</Link>.</p>
    </>
  );
}
