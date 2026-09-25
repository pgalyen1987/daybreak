import { describe, expect, it } from "vitest";
import { action, BYTES, byteLength, fit, FC_EPOCH, followedAtMs, rank, reasons, score, type Prospect } from "@/lib/prospects";

const NOW = Date.parse("2026-09-21T00:00:00Z");
const daysAgo = (d: number) => Math.round((NOW - d * 86_400_000 - FC_EPOCH) / 1000);

const base = (o: Partial<Prospect> = {}): Prospect => ({
  fid: 1, username: "someone", display: null, pfp: null, addresses: ["0xabc"],
  followedAt: daysAgo(10), zoraCoins: 0, zoraUsd: 0, sharedCoins: [], zoraHandle: null, ...o,
});
const ctx = { symbol: "JACOB", coin: "0xcoin", handle: "jacob" };

describe("followedAtMs", () => {
  it("reads Farcaster's epoch, which starts at 2021-01-01", () => {
    expect(followedAtMs(0)).toBe(Date.parse("2021-01-01T00:00:00Z"));
    expect(followedAtMs(86_400)).toBe(Date.parse("2021-01-02T00:00:00Z"));
  });
});

describe("score", () => {
  it("is zero-ish for a follower with no wallet history and an old follow", () => {
    expect(score(base({ followedAt: daysAgo(900) }), NOW)).toBe(0);
  });

  it("ranks a proven buyer above someone who has never bought", () => {
    const buyer = score(base({ zoraCoins: 12, zoraUsd: 400 }), NOW);
    const never = score(base(), NOW);
    expect(buyer).toBeGreaterThan(never);
  });

  it("caps each part so one signal cannot run away", () => {
    const huge = score(base({ zoraCoins: 5000, zoraUsd: 10_000_000, sharedCoins: ["A", "B", "C", "D", "E", "F"], zoraHandle: "x", followedAt: daysAgo(0) }), NOW);
    expect(huge).toBeLessThanOrEqual(100);
  });

  it("values shared taste over raw coin count", () => {
    const taste = score(base({ zoraCoins: 2, sharedCoins: ["A", "B", "C"] }), NOW);
    const bulk = score(base({ zoraCoins: 8 }), NOW);
    expect(taste).toBeGreaterThan(bulk);
  });

  it("fades the recency bonus out over a year", () => {
    const fresh = score(base({ followedAt: daysAgo(5) }), NOW);
    const stale = score(base({ followedAt: daysAgo(400) }), NOW);
    expect(fresh).toBeGreaterThan(stale);
    expect(stale).toBe(0);
  });

  it("gives no recency credit when the follow has no timestamp", () => {
    expect(score(base({ followedAt: 0 }), NOW)).toBe(0);
  });
});

describe("reasons", () => {
  it("says every signal that fired, in words", () => {
    const r = reasons(base({ zoraCoins: 3, zoraUsd: 250, sharedCoins: ["BANANA"], zoraHandle: "nina" }), NOW);
    expect(r.join(" ")).toContain("holds 3 other Zora coins");
    expect(r.join(" ")).toContain("$250");
    expect(r.join(" ")).toContain("BANANA");
    expect(r.join(" ")).toContain("@nina");
  });

  it("never leaves a row unexplained", () => {
    expect(reasons(base({ followedAt: daysAgo(900) }), NOW)).toEqual(["follows you, has a wallet, has not bought"]);
  });

  it("uses the singular for one coin", () => {
    expect(reasons(base({ zoraCoins: 1 }), NOW)[0]).toBe("holds 1 other Zora coin");
  });
});

describe("action", () => {
  it("leads with the shared coin when there is one", () => {
    const a = action(base({ sharedCoins: ["BANANA"] }), ctx);
    expect(a.kind).toBe("cast");
    expect(a.text).toContain("BANANA");
    expect(a.url).toContain("farcaster.xyz/~/compose");
  });

  it("keeps every draft inside a cast, which is 320 bytes not characters", () => {
    const long = base({ username: "a".repeat(200), sharedCoins: ["B".repeat(120)] });
    const a = action(long, { symbol: "S".repeat(60), coin: "0xcoin", handle: "jacob" });
    expect(byteLength(a.text!)).toBeLessThanOrEqual(BYTES);
  });

  it("measures the limit in bytes, so multi-byte characters count for more", () => {
    expect(byteLength("é")).toBe(2);
    expect(byteLength("🙂")).toBe(4);
    const emoji = "🙂".repeat(200);
    expect(byteLength(fit(emoji))).toBeLessThanOrEqual(BYTES);
  });

  it("leaves a short draft exactly as written", () => {
    expect(fit("short enough")).toBe("short enough");
  });

  it("ends a trimmed draft on an ellipsis rather than mid-punctuation", () => {
    const t = fit(`${"word ".repeat(100)}`);
    expect(t.endsWith("\u2026")).toBe(true);
    expect(t).not.toMatch(/[ ,.]\u2026$/);
  });

  it("falls back to a profile link when the person has no username to address", () => {
    const a = action(base({ username: null }), ctx);
    expect(a.kind).toBe("profile");
    expect(a.url).toContain("/profiles/1");
    expect(a.text).toBeUndefined();
  });

  it("drafts, and only drafts - the url is a compose link, never a send", () => {
    for (const p of [base({ sharedCoins: ["X"] }), base({ zoraCoins: 5 }), base()]) {
      const a = action(p, ctx);
      if (a.kind !== "profile") expect(a.url.startsWith("https://farcaster.xyz/~/compose?")).toBe(true);
    }
  });

  it("embeds the coin, so the draft carries somewhere to buy", () => {
    expect(decodeURIComponent(action(base({ zoraCoins: 5 }), ctx).url)).toContain("zora.co/coin/base:0xcoin");
  });
});

describe("rank", () => {
  it("puts the strongest evidence first and explains each row", () => {
    const out = rank([
      base({ fid: 1, username: "cold" }),
      base({ fid: 2, username: "buyer", zoraCoins: 9, zoraUsd: 800 }),
      base({ fid: 3, username: "same-taste", zoraCoins: 4, zoraUsd: 200, sharedCoins: ["A", "B", "C"] }),
    ], ctx, NOW);
    expect(out.map((p) => p.username)).toEqual(["same-taste", "buyer", "cold"]);
    expect(out.every((p) => p.reasons.length > 0 && p.action.url)).toBe(true);
    expect(out[0].score).toBeGreaterThan(out[2].score);
  });
});
