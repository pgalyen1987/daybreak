// Zora's trading rewards, read from Base's logs. Every trade on a Zora v4 coin pays a fee that the
// coin's hook splits and announces in one of two events (checked against Zora's API on 2026-09-19:
// recipients and currency match the coin's payoutRecipient, platformReferrer and pool currency):
//
//   market  0x35b50312…  coin, currency, creator, platform referrer, trade referrer, protocol,
//                        doppler, then (currency, coin) amounts for each of the five, no indexed args
//   creator 0xea924732…  coin (indexed), currency, creator, protocol, creator amount, protocol amount
//
// A creator coin's hook announces each payout twice: the market event, then at logIndex+1 a creator
// event repeating the creator and protocol amounts, for ONE transfer (tx 0x720b9ac6…0b27: one ZORA
// transfer of 0.064019 to the creator at log 335, market event 338, creator event 339). pairTwins()
// keeps one. Older creator-coin hooks emit the creator event alone, and that one counts.
//
// The hooks have several deployed versions, so logs are fetched by event topic across all
// addresses. Pure decoding and aggregation here; scripts/collect.ts fetches and stores.

export const MARKET_TOPIC = "0x35b5031218696db1dfd903223a47f38e66a1998e14a942a5d60fddaa49a685fc";
export const CREATOR_TOPIC = "0xea92473287be4e55f8279d0b8395a45960a217ae2f1a76ac9cae84af58a751ed";
export const ZORA_TOKEN = "0x1111111111166b7fe7bd91427724b487980afc69";
export const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const ROLES = ["creator", "platform", "trade", "protocol", "doppler"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  creator: "Creators", platform: "Platform referrers", trade: "Trade referrers", protocol: "Protocol", doppler: "Doppler",
};

export type RawLog = { topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string };

export type Reward = {
  tx: string; logIndex: number; block: number; kind: "market" | "creator"; coin: string; currency: string;
  recipients: Record<Role, string | null>;
  amounts: Record<Role, number>; // in currency units (18 decimals, or 6 for USDC); coin-side amounts are ignored (zero so far)
};

const ZERO = "0x0000000000000000000000000000000000000000";
const word = (data: string, i: number) => data.slice(2 + i * 64, 2 + (i + 1) * 64);
const addr = (data: string, i: number) => { const a = "0x" + word(data, i).slice(24); return a === ZERO ? null : a; };
const units = (data: string, i: number, decimals: number) => {
  const v = BigInt("0x" + (word(data, i) || "0"));
  const scale = 10n ** BigInt(Math.max(0, decimals - 6)); // keep 6 decimals, then float
  return Number(v / scale) / 10 ** Math.min(decimals, 6);
};

export function decodeReward(log: RawLog): Reward | null {
  const t0 = log.topics[0]?.toLowerCase();
  const base = { tx: log.transactionHash, logIndex: parseInt(log.logIndex, 16), block: parseInt(log.blockNumber, 16) };
  if (t0 === MARKET_TOPIC && (log.data.length - 2) / 64 >= 17) {
    const currency = addr(log.data, 1) ?? ZERO;
    const dec = currency === USDC ? 6 : 18;
    return {
      ...base, kind: "market", coin: addr(log.data, 0) ?? ZERO, currency,
      recipients: { creator: addr(log.data, 2), platform: addr(log.data, 3), trade: addr(log.data, 4), protocol: addr(log.data, 5), doppler: addr(log.data, 6) },
      amounts: { creator: units(log.data, 7, dec), platform: units(log.data, 9, dec), trade: units(log.data, 11, dec), protocol: units(log.data, 13, dec), doppler: units(log.data, 15, dec) },
    };
  }
  if (t0 === CREATOR_TOPIC && log.topics[1] && (log.data.length - 2) / 64 >= 5) {
    const currency = addr(log.data, 0) ?? ZERO;
    const dec = currency === USDC ? 6 : 18;
    return {
      ...base, kind: "creator", coin: "0x" + log.topics[1].slice(26), currency,
      recipients: { creator: addr(log.data, 1), platform: null, trade: null, protocol: addr(log.data, 2), doppler: null },
      amounts: { creator: units(log.data, 3, dec), platform: 0, trade: 0, protocol: units(log.data, 4, dec), doppler: 0 },
    };
  }
  return null;
}

/** Each payout once, in chain order. A creator event that repeats the market event logged just before
 *  it (same tx and coin, the next log, same creator and amount) is the same payment announced twice,
 *  and is dropped. A creator event on its own (older hooks) stays. */
export function pairTwins(rs: Reward[]): Reward[] {
  const out: Reward[] = [];
  for (const r of [...rs].sort((a, b) => a.block - b.block || a.logIndex - b.logIndex)) {
    const prev = out[out.length - 1];
    if (r.kind === "creator" && prev && prev.kind === "market" && prev.tx === r.tx && prev.coin === r.coin && prev.logIndex === r.logIndex - 1
      && prev.currency === r.currency && prev.recipients.creator === r.recipients.creator && prev.amounts.creator === r.amounts.creator) continue;
    out.push(r);
  }
  return out;
}

/** The first UTC day (YYYY-MM-DD) whose totals a collector that starts reading at `ts` writes in full:
 *  the day after the one `ts` falls in, which earlier runs may have written to as well. */
export function firstFullDay(ts: number): string {
  const d = new Date(ts);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString().slice(0, 10);
}

/** ZORA's dollar price from any coin priced against it: USD per coin / ZORA per coin. */
export function zoraUsd(priceInUsdc: number, priceInPoolToken: number): number | null {
  return priceInUsdc > 0 && priceInPoolToken > 0 ? priceInUsdc / priceInPoolToken : null;
}

/** Base makes a block every 2 seconds, so one block's time dates every other block. */
export function blockTime(block: number, refBlock: number, refTs: number): number {
  return refTs - (refBlock - block) * 2000;
}

/** Block ranges of at most `size`, from `from` to `to` inclusive. */
export function chunks(from: number, to: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = from; a <= to; a += size) out.push([a, Math.min(to, a + size - 1)]);
  return out;
}

/** Blocks per eth_getLogs call. Base's public RPC refuses a wider span since 2026-10-05 ("eth_getLogs
 *  is limited to a 500 range": blocks 52209468-52209968 answer, 52209468-52209969 is refused). The
 *  collector asked for 1,500 and read nothing from 14:50 UTC that day on, while every run passed. */
export const LOG_RANGE = 500;
/** Calls per run: 90,000 blocks (50 hours), the reach a run had at 1,500 blocks a call. */
export const LOG_CALLS = 180;

/** The block ranges one run reads: from the block after `cursor` up to `head`, at most LOG_CALLS of them. */
export function logRanges(cursor: number, head: number): [number, number][] {
  return chunks(cursor + 1, head, LOG_RANGE).slice(0, LOG_CALLS);
}

/** Payouts read up to more than 3 hours ago mean the reader is stuck, not slow (it runs hourly). */
export const STALE_AFTER_MS = 3 * 3_600_000;
export function readerStale(readTo: number | null, now: number): boolean {
  return readTo == null || now - readTo > STALE_AFTER_MS;
}
