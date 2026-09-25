import { describe, expect, it } from "vitest";
import { advise, medianPer1000, MIN_PEERS } from "@/lib/advice";
import { complete, coverage } from "@/lib/audience";

const ids = (r: ReturnType<typeof advise>) => r.steps.map((s) => s.id);
const base = { medianPer1000: 2, medianN: MIN_PEERS };

describe("advise", () => {
  it("a profile without a coin is told to create one, and gets no holder advice", () => {
    const r = advise({ ...base, follows: 5_000, farcasterLinked: true, holders: null });
    expect(ids(r)).toEqual(["no-coin"]);
    expect(r.per1000).toBeNull();
  });

  it("no Farcaster account is the first thing to fix: it is the only countable audience", () => {
    const r = advise({ ...base, follows: null, farcasterLinked: false, holders: 3 });
    expect(ids(r)).toEqual(["link-farcaster", "first", "reason"]);
  });

  it("a linked account we have not walked yet says so instead of showing a number", () => {
    const r = advise({ ...base, follows: null, farcasterLinked: true, holders: 40 });
    expect(ids(r)).toContain("not-counted");
    expect(r.per1000).toBeNull();
  });

  it("names the platforms that cannot be counted from a free source", () => {
    const r = advise({ ...base, follows: 292_097, farcasterLinked: true, unmeasurable: ["X", "Instagram"], holders: 6131 });
    expect(r.steps.find((s) => s.id === "unmeasurable")?.title).toBe("X and Instagram can't be measured here");
  });

  it("under ten holders: first holders from people who know you, not conversion math", () => {
    const r = advise({ ...base, follows: 120_000, farcasterLinked: true, holders: 4 });
    expect(ids(r)).toEqual(["first", "reason"]);
  });

  it("below the median, the rate is named as holders per 1,000 follows", () => {
    const r = advise({ ...base, follows: 100_000, farcasterLinked: true, holders: 50 });
    const gap = r.steps.find((s) => s.id === "gap")!;
    expect(gap.title).toBe("0.50 holders per 1,000 Farcaster follows, against a median of 2.0 across the 15 creators we've counted");
  });

  it("above the median: reach, not conversion", () => {
    const r = advise({ ...base, follows: 10_000, farcasterLinked: true, holders: 300 });
    expect(ids(r)).toEqual(["ahead", "reason"]);
    expect(r.per1000).toBe(30);
  });

  it("a count that hit its cap yields no rate at all: a floor is not a denominator", () => {
    const r = advise({ ...base, follows: 80_000, followsConverged: false, farcasterLinked: true, holders: 400 });
    expect(r.per1000).toBeNull();
    expect(ids(r)).not.toContain("gap");
    expect(ids(r)).not.toContain("ahead");
  });

  it("declines to compare against a median taken over too few creators", () => {
    const r = advise({ follows: 100_000, farcasterLinked: true, holders: 50, medianPer1000: 2, medianN: MIN_PEERS - 1 });
    expect(ids(r)).not.toContain("gap");
    expect(ids(r)).toEqual(["reason"]);
  });
});

describe("medianPer1000", () => {
  it("skips thin coins and uncounted creators, and takes the middle", () => {
    const rows = [
      { holders: 10, follows: 10_000 },   // 1.0
      { holders: 30, follows: 10_000 },   // 3.0
      { holders: 20, follows: 10_000 },   // 2.0
      { holders: 5, follows: 10_000 },    // under ten holders: skipped
      { holders: 500, follows: 500 },     // under 1,000 follows: skipped
      { holders: 40, follows: null },     // never counted: skipped, not guessed at
    ];
    expect(medianPer1000(rows)).toEqual({ median: 2, n: 3 });
  });
  it("reports n so a page can decline to print a median of nothing", () => {
    expect(medianPer1000([])).toEqual({ median: 0, n: 0 });
  });
});

// The follower diff counts over the followers resolved so far, not over the follower list, so a
// page built during an early collection run must not print its count as a total.
describe("audience coverage", () => {
  const a = (followersTotal: number, checked: number) =>
    ({ counts: { followersTotal, checked } }) as unknown as Parameters<typeof complete>[0];
  it("a fully resolved list may be stated as a total", () => {
    expect(coverage(a(478_377, 478_377))).toBe(1);
    expect(complete(a(478_377, 478_377))).toBe(true);
  });
  it("an early run is a floor, not a total", () => {
    expect(complete(a(478_377, 20_000))).toBe(false);
    expect(coverage(a(478_377, 20_000))).toBeCloseTo(0.0418, 4);
  });
  it("no followers at all is not silently complete", () => {
    expect(coverage(a(0, 0))).toBe(0);
    expect(complete(a(0, 0))).toBe(false);
  });
});

describe("a Farcaster name Zora has but the hub does not", () => {
  it("blames the stale link, not a missing count", () => {
    const r = advise({ follows: null, farcasterLinked: true, farcasterUnresolved: true, holders: 40, medianPer1000: 2, medianN: MIN_PEERS });
    expect(r.steps.map((s) => s.id)).toContain("stale-name");
    expect(r.steps.map((s) => s.id)).not.toContain("not-counted");
  });
});
