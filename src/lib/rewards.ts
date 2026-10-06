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
// The hooks have several deployed versions, so logs are fetched by event topic across all addresses
// and then kept only when a Zora hook emitted them: any contract can emit the same event naming any
// coin, wallet and amount, for a cent of gas. Pure decoding and aggregation here; scripts/collect.ts
// fetches and stores.

export const MARKET_TOPIC = "0x35b5031218696db1dfd903223a47f38e66a1998e14a942a5d60fddaa49a685fc";
export const CREATOR_TOPIC = "0xea92473287be4e55f8279d0b8395a45960a217ae2f1a76ac9cae84af58a751ed";
export const ZORA_TOKEN = "0x1111111111166b7fe7bd91427724b487980afc69";
export const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const WETH = "0x4200000000000000000000000000000000000006";
export const ETH = "0x0000000000000000000000000000000000000000"; // a native-ETH pool's currency word
/** Chainlink's ETH / USD feed on Base (8 decimals; description() reads "ETH / USD"), and its
 *  latestRoundData() selector. */
export const CHAINLINK_ETH_USD = "0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70";
export const LATEST_ROUND_DATA = "0xfeaf968c";
export const ROLES = ["creator", "platform", "trade", "protocol", "doppler"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  creator: "Creators", platform: "Platform referrers", trade: "Trade referrers", protocol: "Protocol", doppler: "Doppler",
};

/** Zora's coin factory on Base and its zoraHookRegistry() selector: the registry it names lists Zora's
 *  hooks, and getHookAddresses() (selector below) returns them. */
export const COIN_FACTORY = "0x777777751622c0d3258f214f9df38e35bf45baf3";
export const ZORA_HOOK_REGISTRY = "0xa6de70b4";
export const GET_HOOK_ADDRESSES = "0xafeb348f";
/** Older Zora hooks the registry leaves out, which still pay on coins that never moved to a newer one.
 *  Each checked on 2026-09-30 (pay-week 6965b8f): Zora's API gives it as the pool hook of coins it lists.
 *    0x9278…1040 CreatorCoinHook, 0x9b47…d040 ContentCoinHook, 0xfff8…9040 CreatorCoinHook.
 *  An emitter on neither list is dropped, and the run's note names it, so a new hook shows up there. */
export const HOOKS_BEFORE_REGISTRY = [
  "0x9278f6e55ce58519c79dc1ab0ad3b29ea7821040",
  "0x9b47e436e216b2cb54d6f24154f86d946098d040",
  "0xfff800b76768da8ab6aab527021e4a6a91219040",
];

export type RawLog = { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string };

export type Reward = {
  tx: string; logIndex: number; block: number; kind: "market" | "creator"; coin: string; currency: string;
  recipients: Record<Role, string | null>;
  amounts: Record<Role, number>; // in currency units (18 decimals, or 6 for USDC); coin-side amounts are ignored (zero so far)
};

const ZERO = ETH;
const word = (data: string, i: number) => data.slice(2 + i * 64, 2 + (i + 1) * 64);
const addr = (data: string, i: number) => { const a = "0x" + word(data, i).slice(24); return a === ZERO ? null : a; };
// Full precision: cutting to 6 decimals stored 829 of 1,522 WETH payouts in a day as exactly 0.
const units = (data: string, i: number, decimals: number) => Number(BigInt("0x" + (word(data, i) || "0"))) / 10 ** decimals;

/** The addresses in an address[] returned by eth_call (offset, length, then one word each), lowercased. */
export function addressList(hex: string): string[] {
  const d = hex.replace(/^0x/, "");
  if (d.length < 128) return [];
  const n = parseInt(d.slice(64, 128), 16);
  if (!(n > 0) || d.length < 128 + n * 64) return [];
  return Array.from({ length: n }, (_, i) => "0x" + d.slice(128 + i * 64 + 24, 128 + (i + 1) * 64).toLowerCase());
}

/** The hook registry's address from zoraHookRegistry()'s one-word reply, lowercased, or null when the
 *  reply isn't an address word (a revert, an empty reply) or names the zero address. */
export function registryAddress(reply: string): string | null {
  if (!/^0x0{24}[0-9a-f]{40}$/i.test(reply)) return null;
  const a = "0x" + reply.slice(26).toLowerCase();
  return /^0x0{40}$/.test(a) ? null : a;
}

/** The contracts whose payout events count: the hooks Zora's registry lists plus the older ones it leaves
 *  out, lowercased. Null when the registry listed none: the run then reads nothing, since without the
 *  list every emitter, forged ones included, would look the same. */
export function trustedEmitters(listed: string[]): Set<string> | null {
  return listed.length ? new Set([...listed.map((a) => a.toLowerCase()), ...HOOKS_BEFORE_REGISTRY]) : null;
}

/** A rewards run failed when it had block ranges to read and got through none, as every run did from
 *  14:50 UTC on 2026-10-05. It then exits 1 so the workflow's warning fires. An error after some reads
 *  (a later range, a name lookup) doesn't fail the run: the cursor moved and the next run resumes there. */
export function readFailed(run: { ranges: number; from: number; to: number }): boolean {
  return run.ranges > 0 && run.to === run.from;
}

/** A payout from a log, or null when it isn't one: another event, too short, or emitted by a contract
 *  that isn't one of Zora's hooks (`hooks`, lowercased). */
export function decodeReward(log: RawLog, hooks: Set<string>): Reward | null {
  if (!hooks.has(String(log.address).toLowerCase())) return null;
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

/** USD per ETH from latestRoundData()'s return words, or null when the answer isn't positive or the
 *  round is more than 3 hours old: an unpriced payout beats a wrongly priced one. */
export function parseLatestRound(hex: string, now: number): number | null {
  const d = hex.replace(/^0x/, "");
  if (d.length < 5 * 64) return null;
  const answer = BigInt("0x" + d.slice(64, 128)); // int256: a set top bit is negative
  const updatedAt = Number(BigInt("0x" + d.slice(192, 256))) * 1000;
  if (answer <= 0n || answer >> 255n) return null;
  if (now - updatedAt > 3 * 3_600_000) return null;
  return Number(answer) / 1e8;
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
