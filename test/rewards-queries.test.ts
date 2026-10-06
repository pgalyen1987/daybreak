import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The read side of the rewards pages against a real SQLite file: daily totals written before the
// collector counted each creator-coin payout once are overstated, and must not be read.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daybreak-q-"));
let q: typeof import("@/lib/zora-queries");
let db: import("better-sqlite3").Database;
const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  process.env.DATA_DIR = dir;
  db = (await import("@/lib/db")).open();
  q = await import("@/lib/zora-queries");
  const role = db.prepare("INSERT INTO reward_role_daily (day, role, usd, events, unpriced) VALUES (?, ?, ?, ?, 0)");
  const coin = db.prepare("INSERT INTO coin_reward_daily (day, coin, creator_usd, events, unpriced) VALUES (?, '0xc0', ?, ?, 0)");
  // three overstated days, then two counted once
  for (const [d, usd] of [[5, 1000], [4, 1000], [3, 1000], [2, 10], [1, 20]] as const) { role.run(day(d), "creator", usd, 1); coin.run(day(d), usd, 1); }
});
afterAll(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("rewards queries", () => {
  it("show nothing until the collector has recorded where once-counted totals start", () => {
    expect(q.rewardsSummary(7)).toBeNull();
    expect(q.coinCreatorEarnings("0xc0", 7)).toBeNull();
  });
  it("read only the days from rewards_counted_from on", () => {
    db.prepare("INSERT INTO cursors (name, value) VALUES ('rewards_counted_from', ?)").run(Date.parse(day(2) + "T00:00:00Z"));
    const s = q.rewardsSummary(7)!;
    expect(s.total).toBe(30);
    expect(s.earliest).toBe(day(2));
    expect(s.daily.map((d) => d.day)).toEqual([day(2), day(1)]);
    expect(q.coinCreatorEarnings("0xc0", 7)).toMatchObject({ usd: 30, payouts: 2, since: day(2) });
  });
  it("read how far the payouts go, from the cursor or else the newest payout", () => {
    expect(q.rewardsReadTo()).toBeNull();
    db.prepare("INSERT INTO rewards (tx, log_index, block, ts, kind, coin, currency) VALUES ('0x1', 1, 1, 1234, 'market', '0xc0', '0xz')").run();
    expect(q.rewardsReadTo()).toBe(1234);
    db.prepare("INSERT INTO cursors (name, value) VALUES ('rewards_ts', 5678)").run();
    expect(q.rewardsReadTo()).toBe(5678);
  });
});
