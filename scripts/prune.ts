// Keeps the database small enough to carry between workflow runs (it lives as a release asset):
// holder sets for 8 days (churn needs two), trades for 30 (pages show 7), hourly coin snapshots
// for 45 days and one a day before that. Then VACUUM so the file actually shrinks.
import { open } from "../src/lib/db";

const DAY = 86_400_000;
const db = open();
const now = Date.now();
const before = (days: number) => now - days * DAY;
const dayStr = (days: number) => new Date(before(days)).toISOString().slice(0, 10);

const r1 = db.prepare("DELETE FROM holder_snapshots WHERE day < ?").run(dayStr(8)).changes;
const r2 = db.prepare("DELETE FROM holder_meta WHERE day < ?").run(dayStr(30)).changes;
const r3 = db.prepare("DELETE FROM swaps WHERE ts < ?").run(before(30)).changes;
db.prepare("UPDATE swap_coverage SET since = MAX(since, ?)").run(before(30));
const r4 = db.prepare(`DELETE FROM coin_snapshots WHERE ts < ? AND ts NOT IN (
    SELECT MIN(ts) FROM coin_snapshots WHERE ts < ? GROUP BY address, ts / ${DAY})`).run(before(45), before(45)).changes;
const r5 = db.prepare("DELETE FROM runs WHERE started < ?").run(before(30)).changes;
// rewards: raw payouts for 8 days (pages read 7), per-recipient daily totals for a year
const r6 = db.prepare("DELETE FROM rewards WHERE ts < ?").run(before(8)).changes;
const r7 = db.prepare("DELETE FROM reward_daily WHERE day < ?").run(dayStr(400)).changes;
db.prepare("DELETE FROM prices WHERE ts < ?").run(before(7));
// tags: like coin snapshots, hourly for 45 days and one a day before that
const r8 = db.prepare(`DELETE FROM trend_snapshots WHERE ts < ? AND ts NOT IN (
    SELECT MIN(ts) FROM trend_snapshots WHERE ts < ? GROUP BY address, ts / ${DAY})`).run(before(45), before(45)).changes;
db.pragma("wal_checkpoint(TRUNCATE)");
db.exec("VACUUM");
console.log(`pruned: ${r1} holder rows, ${r2} holder days, ${r3} trades, ${r4} snapshots, ${r5} runs, ${r6} payouts, ${r7} payout days, ${r8} tag snapshots`);
