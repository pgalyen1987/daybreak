// Ranking the people who follow a creator but do not hold their coin.
//
// A list of 40,000 names is another dashboard. What makes it worth reading is the order, so every
// signal here is one a creator could check by hand, and `reasons()` says each one in words next to
// the row. Nothing is weighted by a number the reader cannot see.

/**
 * What we know about one person who follows and does not hold. These are facts, and they are what
 * gets published — the score, the wording and the suggested action are all derived from them when
 * the page renders, so changing how this reads never means crawling half a million followers again.
 */
export type ProspectFacts = {
  fid: number;
  username: string | null;
  display: string | null;
  pfp: string | null;
  /** Farcaster epoch seconds (seconds since 2021-01-01) of the follow. */
  followedAt: number;
  /** How many Zora coins any of their wallets holds — proof they buy, not just browse. */
  zoraCoins: number;
  /** What those holdings are worth, in dollars. */
  zoraUsd: number;
  /** Coins they hold that this creator's holders also hold: the same taste, not just any buyer. */
  sharedCoins: string[];
  /** Their Zora handle, when the wallet has a real profile (not a 0x1234...abcd placeholder). */
  zoraHandle: string | null;
};

/**
 * The same person during the crawl, when the wallet is still needed. The wallet is how the diff is
 * computed and is deliberately never published: everything here is already public, but printing a
 * ranked list of named people *next to their addresses* builds a targeting list.
 */
export type Prospect = ProspectFacts & { addresses: string[] };

export type Scored = ProspectFacts & { score: number; reasons: string[]; action: Action };

export type Action = { kind: "cast" | "reply" | "profile"; label: string; text?: string; url: string };

/** Farcaster's epoch starts at 2021-01-01T00:00:00Z. */
export const FC_EPOCH = 1609459200_000;
export const followedAtMs = (t: number) => FC_EPOCH + t * 1000;

/**
 * The score is a sum of plainly-stated parts, each capped so no single one runs away:
 *
 *  - buys Zora coins        0-40   log-scaled on how many coins they hold
 *  - holds real value       0-20   log-scaled on the dollar value of those holdings
 *  - same taste             0-25   coins they hold that this coin's holders also hold
 *  - followed recently      0-10   full marks inside a month, nothing after a year
 *  - reachable on Zora       0-5   has a Zora profile, so the coin page means something to them
 */
export function score(p: ProspectFacts, now = Date.now()): number {
  const cap = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const buys = p.zoraCoins > 0 ? cap(40 * (Math.log10(p.zoraCoins + 1) / Math.log10(21)), 40) : 0;
  const value = p.zoraUsd > 0 ? cap(20 * (Math.log10(p.zoraUsd + 1) / Math.log10(1001)), 20) : 0;
  const taste = cap(25 * (p.sharedCoins.length / 3), 25);
  const days = (now - followedAtMs(p.followedAt)) / 86_400_000;
  const recent = p.followedAt > 0 ? cap(10 * (1 - (days - 30) / 335), 10) : 0;
  const zora = p.zoraHandle ? 5 : 0;
  return Math.round((buys + value + taste + recent + zora) * 10) / 10;
}

/** The same parts, in words, so the order is arguable rather than magic. */
export function reasons(p: ProspectFacts, now = Date.now()): string[] {
  const out: string[] = [];
  if (p.zoraCoins > 0) out.push(`holds ${p.zoraCoins} other Zora coin${p.zoraCoins === 1 ? "" : "s"}`);
  if (p.zoraUsd >= 1) out.push(`$${p.zoraUsd < 100 ? p.zoraUsd.toFixed(0) : Math.round(p.zoraUsd).toLocaleString()} of Zora coins held`);
  if (p.sharedCoins.length) out.push(`also holds ${p.sharedCoins.slice(0, 3).join(", ")}, which your holders hold`);
  const days = Math.floor((now - followedAtMs(p.followedAt)) / 86_400_000);
  if (p.followedAt > 0 && days <= 90) out.push(days <= 1 ? "followed you today" : `followed you ${days} days ago`);
  if (p.zoraHandle) out.push(`on Zora as @${p.zoraHandle}`);
  if (!out.length) out.push("follows you, has a wallet, has not bought");
  return out;
}

/**
 * One next step per person, never taken automatically. A cast is drafted and handed to the
 * creator to send: mass-casting at strangers is spam, and it is their account that pays for it.
 */
export function action(p: ProspectFacts, ctx: { symbol: string | null; coin: string | null; handle: string }): Action {
  const at = p.username ? `@${p.username}` : null;
  const coinUrl = ctx.coin ? `https://zora.co/coin/base:${ctx.coin}` : `https://zora.co/@${ctx.handle}`;
  if (!at) return { kind: "profile", label: "Open their profile", url: `https://farcaster.xyz/~/profiles/${p.fid}` };
  const mine = ctx.symbol ? `$${ctx.symbol}` : "my coin";
  // Written the way a person would write it: one specific reason, no pitch, no call to action that
  // sounds like a campaign. These go out under the creator's own name, so they have to read like it.
  const [kind, text]: ["cast" | "reply", string] = p.sharedCoins.length
    ? ["cast", `${at} you're holding $${p.sharedCoins[0]}, so you're already in this corner of Zora. ${mine} is mine, if you want a look.`]
    : p.zoraCoins > 0
      ? ["cast", `${at} you collect on Zora already — ${mine} is mine, if it's your kind of thing.`]
      : ["reply", `${at} thanks for the follow. I have a coin on Zora, ${mine}; holders get the first look at what I make.`];
  return { kind, label: `Draft a ${kind === "cast" ? "cast" : "reply"} to ${at}`, text: fit(text), url: composeUrl(fit(text), coinUrl) };
}

/** A cast is 320 *bytes*, not characters, and a long handle plus a long symbol can pass it. */
export const BYTES = 320;
export const byteLength = (s: string) => new TextEncoder().encode(s).length;
export function fit(text: string, max = BYTES): string {
  if (byteLength(text) <= max) return text;
  let out = text;
  while (byteLength(`${out}\u2026`) > max && out.length) out = out.slice(0, -1);
  return `${out.replace(/[\s,.\u2014-]+$/, "")}\u2026`;
}

function composeUrl(text: string, embed: string) {
  return `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(embed)}`;
}

/** Score, explain and attach an action to every prospect, best first. */
export function rank(list: ProspectFacts[], ctx: { symbol: string | null; coin: string | null; handle: string }, now = Date.now()): Scored[] {
  return list
    .map((p) => ({ ...p, score: score(p, now), reasons: reasons(p, now), action: action(p, ctx) }))
    .sort((a, b) => b.score - a.score || b.zoraUsd - a.zoraUsd || a.fid - b.fid);
}
