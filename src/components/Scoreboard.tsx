// The coin's day, at the top of its page.
//
// Everything below this on the page is analysis — shapes, distributions, churn — which answers
// "what is going on" but not "am I ahead". This answers the second one first: what the coin paid
// its creator, which way that moved, how long the run is, and where it stands.
//
// It stays legible when there is nothing to say. A coin with no payouts recorded gets a sentence
// explaining that, not a row of zeroes: a zero reads as a result, and "we have not measured this
// yet" is not a result.
import Link from "next/link";
import { usd } from "@/lib/format";
import type { coinDay } from "@/lib/today";

const shortDay = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A day-by-day bar strip. Deliberately unlabelled: the numbers are stated above it in words. */
function Spark({ series }: { series: { day: string; usd: number; partial: boolean }[] }) {
  const days = [...series].reverse(); // oldest to newest, the way a timeline reads
  const max = Math.max(...days.map((d) => d.usd), 0);
  if (!max) return null;
  return (
    <div className="spark" role="img" aria-label={`Creator payouts per day, ${shortDay(days[0].day)} to ${shortDay(days[days.length - 1].day)}, highest ${usd(max)}`}>
      {days.map((d) => (
        <span key={d.day} title={`${shortDay(d.day)}: ${usd(d.usd)}${d.partial ? " so far" : ""}`}>
          {/* A day that earned nothing still gets a visible sliver, so a gap is distinguishable
              from a day that was never collected (which has no bar at all). */}
          <i style={{ height: `${Math.max(3, Math.round((d.usd / max) * 100))}%`, opacity: d.partial ? 0.45 : 1 }} />
        </span>
      ))}
    </div>
  );
}

export function Scoreboard({ day, symbol }: { day: ReturnType<typeof coinDay>; symbol: string }) {
  const { earnings, earningStreak, holderStreak, rank, series, since } = day;

  if (!earnings.ready) {
    return (
      <section className="panel">
        <h2>The day</h2>
        <p className="note">
          {earnings.complete === 0
            ? `No trade payouts have been recorded for $${symbol} yet.`
            : `Only one full day of payouts has been recorded for $${symbol} so far, so there is nothing to compare it with.`}
          {earnings.partial && earnings.partial.usd > 0 && ` Today so far: ${usd(earnings.partial.usd)}.`}{" "}
          Payouts are read from the coin&apos;s own contract{since ? `, and only since ${shortDay(since)}` : ""}.{" "}
          <Link href="/rewards/">How the fee is split.</Link>
        </p>
      </section>
    );
  }

  const up = earnings.change > 0;
  const flat = earnings.change === 0;
  return (
    <section className="panel board">
      <div className="board-head">
        <h2>The day</h2>
        <p className="note" style={{ margin: 0 }}>
          {shortDay(earnings.last.day)} was the last full day{since ? `; recorded since ${shortDay(since)}` : ""}
        </p>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile-k">Paid to the creator, {shortDay(earnings.last.day)}</span>
          <b className="tile-v num">{usd(earnings.last.usd)}</b>
          <span className={`delta ${flat ? "" : up ? "is-up" : "is-down"}`}>
            {flat ? "same as the day before" : `${up ? "+" : "−"}${usd(Math.abs(earnings.change))} on ${shortDay(earnings.prev.day)}`}
          </span>
        </div>

        <div className="tile">
          <span className="tile-k">So far today</span>
          <b className="tile-v num">{earnings.partial ? usd(earnings.partial.usd) : usd(0)}</b>
          <span className="delta">
            {earnings.partial ? `${earnings.partial.payouts} payout${earnings.partial.payouts === 1 ? "" : "s"}, day in progress` : "nothing recorded yet today"}
          </span>
        </div>

        <div className="tile">
          <span className="tile-k">Paid every day for</span>
          <b className="tile-v num">{earningStreak.days}<small> {earningStreak.days === 1 ? "day" : "days"}</small></b>
          <span className="delta">
            {earningStreak.looked ? `of ${earningStreak.looked} full ${earningStreak.looked === 1 ? "day" : "days"} on record` : "no full days on record"}
          </span>
        </div>

        <div className="tile">
          <span className="tile-k">Holders held or grew for</span>
          <b className="tile-v num">{holderStreak.days}<small> {holderStreak.days === 1 ? "day" : "days"}</small></b>
          <span className="delta">
            {holderStreak.looked ? `of ${holderStreak.looked} ${holderStreak.looked === 1 ? "day" : "days"} counted` : "not counted yet"}
          </span>
        </div>
      </div>

      <Spark series={series} />

      {rank && (
        <p className="note">
          {rank.place
            ? <>Over the last {rank.days} <b style={{ color: "var(--ink)" }}>full</b> days this coin paid its creator {usd(rank.usd)} — <b style={{ color: "var(--ink)" }}>{rank.place} of {rank.of}</b> tracked coins that were paid anything at all. The highest was {usd(rank.top)}.</>
            : <>This coin was not paid anything in the last {rank.days} full days. {rank.of} tracked coins were; the highest took {usd(rank.top)}.</>}
          {" "}Today is left out because it is not finished, so this runs a little behind the seven-day
          total below. Coins with no payouts are left out of the comparison rather than ranked below.
        </p>
      )}
    </section>
  );
}
