import { describe, expect, it } from "vitest";
import {
  compareDays,
  dayBefore,
  placeIn,
  runOfEarningDays,
  runOfHolderDays,
  type EarningDay,
  type HolderDay,
} from "@/lib/today";

/** Newest-first earning days, the shape the queries return. */
const e = (day: string, usd: number, partial = false): EarningDay => ({ day, usd, payouts: usd ? 3 : 0, partial });
const h = (day: string, total: number, captured = total): HolderDay => ({ day, total, captured });

describe("comparing days", () => {
  it("compares the two newest COMPLETE days, never the partial one", () => {
    // If today's part-day were compared against yesterday's whole one, every morning would read as
    // a collapse. Today is carried separately instead.
    const r = compareDays([e("2026-09-25", 4, true), e("2026-09-24", 100), e("2026-09-23", 80)]);
    expect(r.ready).toBe(true);
    if (!r.ready) return;
    expect(r.last.day).toBe("2026-09-24");
    expect(r.prev.day).toBe("2026-09-23");
    expect(r.change).toBe(20);
    expect(r.ratio).toBeCloseTo(1.25);
    expect(r.partial?.day).toBe("2026-09-25");
  });

  it("is not ready when only one complete day exists", () => {
    const r = compareDays([e("2026-09-25", 4, true), e("2026-09-24", 100)]);
    expect(r.ready).toBe(false);
    if (r.ready) return;
    expect(r.complete).toBe(1);
  });

  it("reports no ratio against a zero day rather than an infinity", () => {
    const r = compareDays([e("2026-09-24", 50), e("2026-09-23", 0)]);
    expect(r.ready).toBe(true);
    if (!r.ready) return;
    expect(r.change).toBe(50);
    expect(r.ratio).toBeNull();
  });
});

describe("earning streak", () => {
  it("counts consecutive complete days that paid something", () => {
    const r = runOfEarningDays([e("2026-09-25", 1, true), e("2026-09-24", 5), e("2026-09-23", 2), e("2026-09-22", 7)]);
    expect(r.days).toBe(3);
    expect(r.looked).toBe(3);
  });

  it("stops at a day that earned nothing", () => {
    expect(runOfEarningDays([e("2026-09-24", 5), e("2026-09-23", 0), e("2026-09-22", 7)]).days).toBe(1);
  });

  it("a GAP in the record breaks the run instead of being skipped", () => {
    // 09-23 was never collected. A run either side of a hole is not a run of three.
    const r = runOfEarningDays([e("2026-09-24", 5), e("2026-09-22", 7), e("2026-09-21", 9)]);
    expect(r.days).toBe(1);
  });

  it("is zero, not an error, with nothing to look at", () => {
    expect(runOfEarningDays([])).toEqual({ days: 0, looked: 0 });
    expect(runOfEarningDays([e("2026-09-25", 3, true)])).toEqual({ days: 0, looked: 0 });
  });
});

describe("holder run", () => {
  it("counts days the holder count did not fall", () => {
    const r = runOfHolderDays([h("2026-09-25", 120), h("2026-09-24", 118), h("2026-09-23", 118), h("2026-09-22", 110)]);
    expect(r.days).toBe(3); // flat counts as holding
  });

  it("stops on a fall", () => {
    expect(runOfHolderDays([h("2026-09-25", 100), h("2026-09-24", 120), h("2026-09-23", 110)]).days).toBe(0);
  });

  it("counts a capped capture, because `total` is the count and `captured` is only the list", () => {
    // The collector caps the per-wallet capture at 500 rows, so every coin above 500 holders reads
    // total 13,171 / captured 500. Requiring captured >= total here excluded the whole top of the
    // board and reported "0 of 0" for the biggest creators. The holder TOTAL is right either way.
    const big: HolderDay[] = [
      { day: "2026-09-25", total: 13171, captured: 500 },
      { day: "2026-09-24", total: 13159, captured: 500 },
      { day: "2026-09-23", total: 13156, captured: 500 },
    ];
    const r = runOfHolderDays(big);
    expect(r.days).toBe(2);
    expect(r.looked).toBe(3);
  });

  it("a GAP in the record breaks the holder run too", () => {
    const r = runOfHolderDays([h("2026-09-25", 120), h("2026-09-23", 118), h("2026-09-22", 117)]);
    expect(r.days).toBe(0);
  });

  it("needs two days before it says anything", () => {
    expect(runOfHolderDays([h("2026-09-25", 120)])).toEqual({ days: 0, looked: 1 });
  });
});

describe("place in a ranking", () => {
  const rows = [
    { coin: "0xAAA", usd: 90 },
    { coin: "0xBBB", usd: 40 },
    { coin: "0xCCC", usd: 5 },
  ];

  it("gives the place, the population and the leader", () => {
    expect(placeIn(rows, "0xbbb")).toEqual({ place: 2, of: 3, usd: 40, top: 90 });
  });

  it("matches regardless of address case", () => {
    expect(placeIn(rows, "0xAAA")?.place).toBe(1);
    expect(placeIn(rows, "0xaaa")?.place).toBe(1);
  });

  it("gives a coin that earned nothing NO place rather than last place", () => {
    const p = placeIn(rows, "0xZZZ");
    expect(p?.place).toBeNull();
    expect(p?.of).toBe(3);
  });

  it("is null when nobody earned anything", () => {
    expect(placeIn([], "0xAAA")).toBeNull();
  });
});

describe("dayBefore", () => {
  it("steps back one UTC day, across a month boundary", () => {
    expect(dayBefore("2026-09-25")).toBe("2026-09-24");
    expect(dayBefore("2026-09-01")).toBe("2026-08-31");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
  });
});
