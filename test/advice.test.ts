import { describe, expect, it } from "vitest";
import { advise, medianPer1000, mediansByPlatform } from "@/lib/advice";

const ids = (r: ReturnType<typeof advise>) => r.steps.map((s) => s.id);

describe("advise", () => {
  it("a profile without a coin is told to create one, and gets no holder advice", () => {
    const r = advise({ socials: { twitter: 5000 }, holders: null, medianPer1000: 2 });
    expect(ids(r)).toEqual(["no-coin", "link"]);
    expect(r.per1000).toBeNull();
  });

  it("no linked accounts at all is its own step, not a list of four", () => {
    const r = advise({ socials: {}, holders: 3, medianPer1000: 2 });
    expect(ids(r)).toEqual(["link-all", "first", "reason"]);
    expect(r.reach).toBe(0);
  });

  it("names exactly the accounts that aren't linked", () => {
    const r = advise({ socials: { twitter: 64_175, farcaster: 292_097, instagram: null, tiktok: null }, holders: 6131, medianPer1000: 2 });
    expect(r.steps.find((s) => s.id === "link")?.title).toBe("Link Instagram and TikTok");
  });

  it("under ten holders: first holders from people who know you, not conversion math", () => {
    const r = advise({ socials: { twitter: 120_000, farcaster: 0, instagram: 0, tiktok: 0 }, holders: 4, medianPer1000: 2 });
    expect(ids(r)).toEqual(["first", "reason"]);
  });

  it("below the median: the tip follows the largest platform", () => {
    const x = advise({ socials: { twitter: 100_000, farcaster: 2_000, instagram: 0, tiktok: 0 }, holders: 50, medianPer1000: 2 });
    const gap = x.steps.find((s) => s.id === "gap")!;
    expect(gap.title).toBe("0.50 holders per 1,000 followers, against a median of 2.0");
    expect(gap.body).toMatch(/on X, where most people don't have a crypto wallet/);
    const f = advise({ socials: { twitter: 1_000, farcaster: 50_000, instagram: 0, tiktok: 0 }, holders: 20, medianPer1000: 2 });
    expect(f.steps.find((s) => s.id === "gap")!.body).toMatch(/already have a wallet in the app/);
  });

  it("above the median: reach, not conversion", () => {
    const r = advise({ socials: { twitter: 0, farcaster: 10_000, instagram: 0, tiktok: 0 }, holders: 300, medianPer1000: 2 });
    expect(ids(r)).toEqual(["ahead", "reason"]);
    expect(r.per1000).toBe(30);
  });
});

describe("medianPer1000", () => {
  it("skips thin coins and tiny audiences, and takes the middle", () => {
    const rows = [
      { holders: 10, socials: { twitter: 10_000 } },   // 1.0
      { holders: 30, socials: { twitter: 10_000 } },   // 3.0
      { holders: 20, socials: { farcaster: 10_000 } }, // 2.0
      { holders: 5, socials: { twitter: 10_000 } },    // under ten holders: skipped
      { holders: 500, socials: { twitter: 500 } },     // audience under 1,000: skipped
    ];
    expect(medianPer1000(rows)).toBe(2);
    expect(medianPer1000([])).toBe(0);
  });
});

describe("compared with creators on the same platform", () => {
  const socials = { twitter: 50_000, farcaster: null, instagram: null, tiktok: null };
  it("uses the platform's median when enough creators share it", () => {
    const a = advise({ socials, holders: 250, medianPer1000: 18, platformMedians: { twitter: { median: 7, n: 40 } } });
    const s = a.steps.find((x) => x.id === "ahead" || x.id === "gap")!;
    expect(s.id).toBe("gap"); // 5 per 1,000 is under X's 7
    expect(s.title).toContain("for creators whose biggest audience is on X");
  });
  it("falls back to the overall median when the platform has too few creators", () => {
    const a = advise({ socials, holders: 250, medianPer1000: 18, platformMedians: { twitter: { median: 7, n: 3 } } });
    const s = a.steps.find((x) => x.id === "ahead" || x.id === "gap")!;
    expect(s.title).toContain("median of 18");
    expect(s.title).not.toContain("biggest audience");
  });
  it("groups coins by their largest audience", () => {
    const rows = [
      { holders: 30, socials: { twitter: 10_000, farcaster: 1_000, instagram: null, tiktok: null } },
      { holders: 60, socials: { twitter: 500, farcaster: 2_000, instagram: null, tiktok: null } },
    ];
    const m = mediansByPlatform(rows);
    expect(m.twitter).toEqual({ median: 3, n: 1 });
    expect(m.farcaster).toEqual({ median: 30, n: 1 });
  });
});
