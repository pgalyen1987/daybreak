import { describe, expect, it } from "vitest";
import { churn, gapScores, per1000, percentileRank, volumePatterns } from "@/lib/metrics";
import { usd } from "@/lib/format";

describe("per1000", () => {
  it("is holders per thousand Farcaster follows", () => {
    // @jacob on 2026-09-21: 6,131 holders against the 478,377 follow records the hub holds
    expect(per1000(6_131, 478_377)).toBeCloseTo(12.82, 2);
  });
  it("is null without a count", () => {
    expect(per1000(10, 0)).toBeNull();
  });
});

describe("percentileRank", () => {
  it("counts values below plus half the ties", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(0.625);
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
    expect(percentileRank([1, 2, 3, 4], 9)).toBe(1);
    expect(percentileRank([5, 5, 5, 5], 5)).toBe(0.5);
  });
});

describe("gapScores", () => {
  const rows = [
    { id: "big-audience-few-holders", holders: 500, follows: 1_000_000 },   // 0.5 per 1k
    { id: "big-audience-many-holders", holders: 200_000, follows: 1_000_000 }, // 200 per 1k
    { id: "small-audience", holders: 100, follows: 50_000 },                // 2 per 1k
    { id: "too-small", holders: 1, follows: 300 },                          // under MIN_FOLLOWS
    { id: "never-counted", holders: 900, follows: 0 },
  ];
  const out = gapScores(rows);
  it("drops creators without a meaningful count", () => {
    expect(out.map((r) => r.id)).not.toContain("too-small");
    expect(out.map((r) => r.id)).not.toContain("never-counted");
  });
  it("ranks a large audience with a low rate first", () => {
    expect(out[0].id).toBe("big-audience-few-holders");
    expect(out.at(-1)!.id).toBe("big-audience-many-holders");
  });
  it("at an equal rate, the bigger audience scores higher", () => {
    const eq = gapScores([
      { id: "a", holders: 10, follows: 10_000 },
      { id: "b", holders: 1_000, follows: 1_000_000 },
      { id: "c", holders: 900, follows: 10_000 },
    ]);
    const a = eq.find((r) => r.id === "a")!, b = eq.find((r) => r.id === "b")!;
    expect(a.per1000).toBe(b.per1000);
    expect(b.score).toBeGreaterThan(a.score);
  });
  it("ranks a lower rate above a higher one at the same size", () => {
    const small = out.find((r) => r.id === "small-audience")!;
    const many = out.find((r) => r.id === "big-audience-many-holders")!;
    expect(small.score).toBeGreaterThan(many.score);
  });
  it("does not report followers minus holders: they are not the same set", () => {
    expect(out[0]).not.toHaveProperty("untapped");
  });
  it("keeps scores in 0..100", () => {
    for (const r of out) { expect(r.score).toBeGreaterThanOrEqual(0); expect(r.score).toBeLessThanOrEqual(100); }
  });
});

describe("churn", () => {
  it("counts exits and entries between snapshots", () => {
    const c = churn(["a", "b", "c", "d"], ["b", "c", "e"]);
    expect(c).toMatchObject({ before: 4, after: 3, exited: 2, entered: 1, churnRate: 0.5, retention: 0.5 });
  });
  it("handles an empty first snapshot", () => {
    expect(churn([], ["a"]).churnRate).toBe(0);
  });
});

describe("volumePatterns", () => {
  const t = (iso: string) => Date.parse(iso);
  const swaps = [
    { ts: t("2026-09-14T15:10:00Z"), side: "BUY" as const, usd: 100, trader: "w1" }, // Monday 15h
    { ts: t("2026-09-14T15:40:00Z"), side: "SELL" as const, usd: 40, trader: "w2" },
    { ts: t("2026-09-15T03:00:00Z"), side: "BUY" as const, usd: 60, trader: "w1" }, // Tuesday 3h
  ];
  const v = volumePatterns(swaps);
  it("splits flow by side", () => {
    expect(v).toMatchObject({ totalUsd: 200, buyUsd: 160, sellUsd: 40, netFlowUsd: 120, buys: 2, sells: 1, traders: 2 });
    expect(v.buyShare).toBeCloseTo(0.8);
  });
  it("buckets by UTC hour and weekday", () => {
    expect(v.byHour[15]).toBe(140);
    expect(v.byHour[3]).toBe(60);
    expect(v.byWeekday[1]).toBe(140);
    expect(v.byWeekday[2]).toBe(60);
    expect(v.grid[2][3]).toBe(60);
    expect(v.grid[1][15]).toBe(140);
  });
  it("measures concentration", () => {
    expect(v.topTraderShare).toBeCloseTo(0.8);
    expect(v.top5Share).toBe(1);
  });
});

describe("usd", () => {
  it("shows cents under a dollar, a real minus, and compacts large amounts", () => {
    expect(usd(0)).toBe("$0");
    expect(usd(0.4321)).toBe("$0.43");
    expect(usd(-5.2)).toBe("−$5");
    expect(usd(25432)).toBe("$25,432");
    expect(usd(1_500_000)).toBe("$1.5M");
  });
});
