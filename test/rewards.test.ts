import { describe, expect, it } from "vitest";
import fixtures from "./fixtures-reward-logs.json";
import { blockTime, chunks, decodeReward, logRanges, readerStale, zoraUsd } from "@/lib/rewards";

// Two real logs from one Base trade (tx 0x53f27c…f195, block 51510975).
describe("decodeReward", () => {
  it("reads the five-way market split", () => {
    const r = decodeReward(fixtures.market)!;
    expect(r.kind).toBe("market");
    expect(r.coin).toBe("0x088323412518e655f7b98a9b3aa4a7021428a1d3");
    expect(r.currency).toBe("0x1111111111166b7fe7bd91427724b487980afc69"); // ZORA
    expect(r.recipients.creator).toBe("0xf4acf3edc65df843630976459ab1349a88258e6d");
    expect(r.recipients.trade).toBeNull(); // no trade referrer on this trade
    expect(r.amounts.creator).toBeCloseTo(5.740258, 5);
    expect(r.amounts.platform).toBeCloseTo(2.296103, 5);
    expect(r.amounts.protocol).toBeCloseTo(1.033246, 5);
    expect(r.amounts.doppler).toBeCloseTo(0.114805, 5);
    // the split Zora documents for content coins: 62.5 / 25 / 11.25 / 1.25
    const total = r.amounts.creator + r.amounts.platform + r.amounts.protocol + r.amounts.doppler;
    expect(r.amounts.creator / total).toBeCloseTo(0.625, 3);
    expect(r.block).toBe(51510975);
  });
  it("reads the creator-coin payout (coin in the topic)", () => {
    const r = decodeReward(fixtures.creator)!;
    expect(r.kind).toBe("creator");
    expect(r.coin).toBe("0x3177fa60b8a342cd044badf34bf820c536094656");
    expect(r.recipients.creator).toBe("0xf4acf3edc65df843630976459ab1349a88258e6d");
    expect(r.amounts.creator).toBeCloseTo(11.879451, 5);
    expect(r.amounts.creator).toBe(r.amounts.protocol);
  });
  it("ignores other events", () => {
    expect(decodeReward({ ...fixtures.market, topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"] })).toBeNull();
  });
});

describe("helpers", () => {
  it("prices ZORA from a coin priced in it", () => {
    expect(zoraUsd(0.00017468380870073, 0.0210203035553960)).toBeCloseTo(0.00831, 5);
    expect(zoraUsd(0, 1)).toBeNull();
  });
  it("dates a block two seconds per block from a reference", () => {
    expect(blockTime(100, 110, 1_000_000)).toBe(980_000);
  });
  it("splits a block range into inclusive chunks", () => {
    expect(chunks(1, 10, 4)).toEqual([[1, 4], [5, 8], [9, 10]]);
  });
});

describe("logRanges", () => {
  // Base's public RPC, measured 2026-10-05: blocks 52209468-52209968 answer, 52209468-52209969 is refused
  // ("eth_getLogs is limited to a 500 range"). The collector asked for 1,500 a call and read nothing.
  const rs = logRanges(52209467, 52209467 + 200_000);
  it("never asks for a wider span than the public RPC answers", () => {
    for (const [a, b] of rs) expect(b - a).toBeLessThanOrEqual(500);
  });
  it("starts after the cursor and leaves no gap", () => {
    expect(rs[0][0]).toBe(52209468);
    for (let i = 1; i < rs.length; i++) expect(rs[i][0]).toBe(rs[i - 1][1] + 1);
  });
  it("still reaches 50 hours of blocks a run, so one run catches up a long stall", () => {
    expect(rs.at(-1)![1] - rs[0][0] + 1).toBe(90_000);
    expect(logRanges(100, 1_000)).toEqual([[101, 600], [601, 1_000]]);
  });
});

describe("readerStale", () => {
  const now = Date.UTC(2026, 9, 5, 22, 50);
  it("flags payouts read up to more than 3 hours ago, or never", () => {
    expect(readerStale(Date.UTC(2026, 9, 5, 13, 51), now)).toBe(true); // the 10-05 stall, nine hours on
    expect(readerStale(null, now)).toBe(true);
  });
  it("lets a normal hourly lag pass", () => {
    expect(readerStale(now - 70 * 60_000, now)).toBe(false);
  });
});
