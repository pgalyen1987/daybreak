// A coin's day, as a scoreboard.
//
// Everything a creator wants each morning is already in the collector's tables; it was just spread
// across four panels as analysis. This turns it into a position and a direction: what the coin paid
// its creator, whether holders came or went, how long that has been true, and where it stands among
// the coins we track.
//
// TWO HONESTY RULES SHAPE ALL OF IT, because a scoreboard invites trust that analysis does not.
//
// 1. TODAY IS NOT A FULL DAY. `coin_reward_daily.day` is a UTC date, so the newest row holds however
//    much of today has happened. Comparing a partial day against a whole one manufactures a decline
//    every morning and a record every evening, so today is reported separately and labelled, and
//    every comparison, streak and rank uses COMPLETE days only.
//
// 2. A STREAK COUNTS DAYS WE MEASURED, NOT DAYS THAT PASSED. The collector can miss a day, and a
//    run of gains either side of a gap is not a run. A missing day ends the count rather than being
//    skipped over, and every result says how many days were actually examined, so a young number
//    reads as young rather than as a stall.
//
// The pure functions below hold all of that reasoning and are what the tests exercise; the exported
// query functions only fetch rows and hand them over.
import { open } from "./db";

const DAY = 86_400_000;
export const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Today in UTC: the partial day the tables are still filling. */
export const utcToday = () => dayStr(Date.now());
/** The calendar day before `day`, as a UTC date string. */
export const dayBefore = (day: string) => dayStr(Date.parse(day + "T00:00:00Z") - DAY);

const has = (table: string) =>
  !!open().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);

/** One day of creator payouts for a coin. `partial` marks the day still in progress. */
export type EarningDay = { day: string; usd: number; payouts: number; partial: boolean };
/** A day's holder total for a coin, with how much of the holder list was actually captured. */
export type HolderDay = { day: string; total: number; captured: number };

// ── the reasoning, as pure functions ──────────────────────────────────────────────────────────

/**
 * Yesterday against the day before: the only earnings comparison that is like-for-like.
 * `series` is newest-first and may contain today. Null-ish when two complete days aren't there.
 */
export function compareDays(series: EarningDay[]) {
  const complete = series.filter((s) => !s.partial);
  const partial = series.find((s) => s.partial) ?? null;
  if (complete.length < 2) return { ready: false as const, complete: complete.length, partial };
  const [last, prev] = complete;
  return {
    ready: true as const,
    last,
    prev,
    partial,
    change: last.usd - prev.usd,
    // A ratio against zero is not a percentage, it is a divide-by-zero wearing one.
    ratio: prev.usd > 0 ? last.usd / prev.usd : null,
  };
}

/**
 * How many complete days in a row, ending at the newest one, the coin paid its creator something.
 * A gap in the record breaks the run: days we did not measure are not days that earned.
 */
export function runOfEarningDays(series: EarningDay[]) {
  const complete = series.filter((s) => !s.partial); // newest first
  if (!complete.length) return { days: 0, looked: 0 };
  let run = 0;
  let expect = complete[0].day;
  for (const row of complete) {
    if (row.day !== expect) break;
    if (row.usd <= 0) break;
    run++;
    expect = dayBefore(row.day);
  }
  return { days: run, looked: complete.length };
}

/**
 * How many consecutive days the holder count did not fall, ending at the newest day.
 *
 * READS `total`, NOT `captured`, and the difference matters. The collector caps the per-wallet
 * capture at 500 rows, so on @visualizevalue a day reads total 13,171 / captured 500 — and an
 * earlier version of this required captured >= total, which silently excluded every coin with more
 * than 500 holders and returned "0 days of 0 looked at" for the largest creators on the board.
 * `total` is the coin's holder count and is right either way; the completeness of the wallet LIST
 * only constrains churn (who arrived and who left), which is a different question.
 *
 * A gap in the record still breaks the run, for the same reason as the earnings streak.
 *
 * Flat counts as holding: for a coin with a handful of holders, "nobody left" is the same news as
 * "somebody arrived", and breaking the run on a flat day would make the number mostly noise.
 */
export function runOfHolderDays(rows: HolderDay[]) {
  const days = rows.filter((r) => Number.isFinite(r.total) && r.total > 0); // newest first
  if (days.length < 2) return { days: 0, looked: days.length };
  let run = 0;
  for (let i = 0; i < days.length - 1; i++) {
    const newer = days[i], older = days[i + 1];
    if (Date.parse(newer.day + "T00:00:00Z") - Date.parse(older.day + "T00:00:00Z") !== DAY) break;
    if (newer.total < older.total) break;
    run++;
  }
  return { days: run, looked: days.length };
}

/**
 * A coin's place in a descending list of earners, with the population, because "12th" means nothing
 * on its own. A coin absent from the list has no place rather than a last place.
 */
export function placeIn(rows: { coin: string; usd: number }[], address: string) {
  if (!rows.length) return null;
  const i = rows.findIndex((r) => r.coin.toLowerCase() === address.toLowerCase());
  return { place: i < 0 ? null : i + 1, of: rows.length, usd: i < 0 ? 0 : rows[i].usd, top: rows[0].usd };
}

// ── the queries ───────────────────────────────────────────────────────────────────────────────

/**
 * A coin's creator payouts, newest first, over the last `days` calendar days.
 *
 * `since` is the first day the rewards collector ever recorded, when that is later than the window
 * asked for — so a "7 days" label never claims a week of history we do not have.
 */
export function earningDays(address: string, days = 14): { series: EarningDay[]; since: string | null } {
  if (!has("coin_reward_daily")) return { series: [], since: null };
  const d = open();
  const from = dayStr(Date.now() - days * DAY);
  const today = utcToday();
  const rows = d
    .prepare(
      `SELECT day, SUM(creator_usd) AS usd, SUM(events) AS payouts
         FROM coin_reward_daily WHERE coin = ? AND day >= ? GROUP BY day ORDER BY day DESC`,
    )
    .all(address, from) as { day: string; usd: number | null; payouts: number | null }[];
  const first = (d.prepare("SELECT MIN(day) AS day FROM coin_reward_daily").get() as { day: string | null }).day;
  return {
    series: rows.map((r) => ({ day: r.day, usd: Number(r.usd || 0), payouts: Number(r.payouts || 0), partial: r.day === today })),
    since: first && first > from ? first : null,
  };
}

/** Net holder totals per day, newest first. */
export function holderDays(address: string, days = 14): HolderDay[] {
  if (!has("holder_meta")) return [];
  const from = dayStr(Date.now() - days * DAY);
  return open()
    .prepare("SELECT day, total, captured FROM holder_meta WHERE address = ? AND day >= ? ORDER BY day DESC")
    .all(address, from) as HolderDay[];
}

/**
 * Where a coin stands by creator payouts over the last `days` complete days, among the tracked
 * coins paid anything in the same window.
 *
 * Coins that earned nothing are excluded on purpose: ranking above a coin that had no trades is not
 * a standing worth printing.
 */
export function earningRank(address: string, days = 7) {
  if (!has("coin_reward_daily")) return null;
  const from = dayStr(Date.now() - days * DAY);
  const rows = open()
    .prepare(
      `SELECT r.coin AS coin, SUM(r.creator_usd) AS usd
         FROM coin_reward_daily r JOIN coins c ON c.address = r.coin
        WHERE r.day >= ? AND r.day < ? GROUP BY r.coin HAVING usd > 0 ORDER BY usd DESC`,
    )
    .all(from, utcToday()) as { coin: string; usd: number }[];
  const p = placeIn(rows, address);
  return p && { ...p, days };
}

/** Everything the scoreboard needs for one coin, in one call. */
export function coinDay(address: string) {
  const { series, since } = earningDays(address, 30);
  return {
    earnings: compareDays(series),
    since,
    series: series.slice(0, 14),
    earningStreak: runOfEarningDays(series),
    holderStreak: runOfHolderDays(holderDays(address, 30)),
    rank: earningRank(address, 7),
  };
}
