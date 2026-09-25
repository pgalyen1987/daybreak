// What a creator can do about their own numbers. Pure: give it the holder count of their creator
// coin and the Farcaster follow count we counted from the hub, plus the median across the creators
// Daybreak has measured; get back the numbers and the steps that apply, in the order worth doing
// them. The /check page renders it; the tests pin the wording's triggers.
//
// There used to be a second input here: the follower counts Zora carries for a creator's linked X,
// Instagram and TikTok accounts, and a median per platform. Both are gone. Zora's counts are a
// cache that does not move — 60 fields across 39 creators, identical three days apart — and a
// median taken across four platforms' numbers compares measurements of four different things. One
// graph, counted by us, or nothing.
import { per1000 as ratio } from "./metrics";

export type Step = { id: string; title: string; body: string };

export type CheckInput = {
  /** Farcaster follow records on the hub, counted by us. null = not counted (or no account). */
  follows: number | null;
  /** False when the count hit its page cap, so `follows` is a floor rather than a total. */
  followsConverged?: boolean;
  /** Whether the Zora profile links a Farcaster account at all. */
  farcasterLinked: boolean;
  /** The linked Farcaster name exists on Zora but the hub has no proof for it (Zora's copy is stale). */
  farcasterUnresolved?: boolean;
  /** Accounts linked on Zora that cannot be counted from any free, public source. */
  unmeasurable?: string[];
  holders: number | null;     // null = the profile has no creator coin
  medianPer1000: number;      // holders per 1,000 Farcaster follows, median across measured creators
  medianN: number;            // how many creators that median is taken over
};

/** Below this many measured creators the median is noise and the pages must not quote it. */
export const MIN_PEERS = 15;

export const FIRST_HOLDERS = 10;

/** Holders per 1,000 follows as the pages print it: 18, 2.1, 0.67. */
export const per1000Text = (x: number) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2));

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function advise({ follows, followsConverged = true, farcasterLinked, farcasterUnresolved = false, unmeasurable = [], holders, medianPer1000, medianN }: CheckInput) {
  // A rate off a floor is not a rate: if the walk stopped early the denominator is "at least this
  // many", so the quotient would be an upper bound printed as a measurement. Show nothing instead.
  const per1000 = holders != null && follows != null && followsConverged ? ratio(holders, follows) : null;
  const haveMedian = medianN >= MIN_PEERS && medianPer1000 > 0;
  const steps: Step[] = [];

  if (holders == null) {
    steps.push({ id: "no-coin", title: "This profile has no creator coin yet",
      body: "Create it in the Zora app. Everything below is about turning your audience into holders, so it starts once the coin exists." });
  }
  if (!farcasterLinked) {
    steps.push({ id: "link-farcaster", title: "Link your Farcaster account on Zora",
      body: "Farcaster is the only audience anyone can count without paying for it, and the only one where a follower can be matched to a wallet. Without it nobody — including you — can say how much of your audience holds your coin, only guess." });
  } else if (farcasterUnresolved) {
    steps.push({ id: "stale-name", title: "The Farcaster name on your Zora profile no longer exists",
      body: "The hub has no registration for it, which usually means the name was changed after Zora recorded it — Zora's copy of your account details does not refresh. Re-link Farcaster in your Zora profile settings and the count will work. Until then there is nothing to count, so nothing is shown." });
  } else if (follows == null) {
    steps.push({ id: "not-counted", title: "We haven't counted this account yet",
      body: "The count is a walk of the public Farcaster hub and it takes seconds to minutes per creator, so it runs through the tracked list a few at a time. Until it reaches you there is no honest number to show, so there isn't one." });
  }
  if (unmeasurable.length) {
    steps.push({ id: "unmeasurable", title: `${list(unmeasurable)} can't be measured here`,
      body: "X charges for follower access and Instagram and TikTok publish neither a follower list nor a wallet. Zora carries a follower number for them, but it is a cache that does not move, so quoting it would be inventing a number. Nothing on this page is based on it." });
  }
  if (holders != null && holders < FIRST_HOLDERS) {
    steps.push({ id: "first", title: `Get your first ${FIRST_HOLDERS} holders from people who already know you`,
      body: "Strangers rarely buy a coin with a handful of holders. Ask the people who already follow your work, in one post that says what the coin is for and links straight to it." });
  }
  if (holders != null && holders >= FIRST_HOLDERS && per1000 != null && haveMedian) {
    const tip = "Your audience is on Farcaster, where people already have a wallet in the app, so they are the easiest to convert. Cast your coin with a line about what holding it means — then work the follower diff, which names the ones who follow you and haven't bought.";
    const of = ` across the ${medianN} creators we've counted`;
    if (per1000 < medianPer1000) {
      steps.push({ id: "gap", title: `${per1000Text(per1000)} holders per 1,000 Farcaster follows, against a median of ${per1000Text(medianPer1000)}${of}`, body: tip });
    } else {
      steps.push({ id: "ahead", title: `${per1000Text(per1000)} holders per 1,000 Farcaster follows, above the median of ${per1000Text(medianPer1000)}${of}`,
        body: "Your audience already converts better than most of the creators we've counted, so more holders come from more reach rather than more pitching." });
    }
  }
  if (holders != null) {
    steps.push({ id: "reason", title: "Give holders something",
      body: "A coin is easier to hold when it unlocks something: a post, a file, an early link. Keycast gates any of those behind holding your coin, from a Farcaster mini app." });
  }
  return { follows, followsConverged, per1000, steps };
}

/**
 * Median holders per 1,000 Farcaster follows across the creators whose follows we have counted.
 * Returns the count it was taken over too, because a median over four creators is not a median
 * and the pages have to be able to decline to print it.
 */
export function medianPer1000(rows: { holders: number; follows: number | null }[], minFollows = 1_000, minHolders = FIRST_HOLDERS) {
  const xs = rows
    .filter((r): r is { holders: number; follows: number } => r.follows != null && r.follows >= minFollows && r.holders >= minHolders)
    .map((r) => (r.holders / r.follows) * 1000)
    .sort((a, b) => a - b);
  if (!xs.length) return { median: 0, n: 0 };
  const m = xs.length >> 1;
  return { median: xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2, n: xs.length };
}
