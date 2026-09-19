// What a creator can do about their own numbers. Pure: give it what Zora's API says about one
// profile (linked accounts and their followers, holders of the creator coin) and the median
// conversion among the coins Daybreak tracks; get back the numbers and the steps that apply, in the
// order worth doing them. The /check page renders it; the tests pin the wording's triggers.
import { reach, type Socials } from "./metrics";
import { PLATFORM } from "./format";

export type Step = { id: string; title: string; body: string };

export type CheckInput = {
  socials: Socials;           // null or missing = not linked on Zora
  holders: number | null;     // null = the profile has no creator coin
  medianPer1000: number;      // holders per 1,000 followers, median across tracked coins
};

export const FIRST_HOLDERS = 10;
const LINKABLE = ["twitter", "farcaster", "instagram", "tiktok"] as const;

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
/** Holders per 1,000 followers as the pages print it: 18, 2.1, 0.67. */
export const per1000Text = (x: number) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2));

export function advise({ socials, holders, medianPer1000 }: CheckInput) {
  const aud = reach(socials);
  const per1000 = holders != null && aud.total > 0 ? (holders / aud.total) * 1000 : null;
  const unlinked = LINKABLE.filter((p) => socials[p] == null).map((p) => PLATFORM[p]);
  const steps: Step[] = [];

  if (holders == null) {
    steps.push({ id: "no-coin", title: "This profile has no creator coin yet",
      body: "Create it in the Zora app. Everything below is about turning your audience into holders, so it starts once the coin exists." });
  }
  if (unlinked.length === LINKABLE.length) {
    steps.push({ id: "link-all", title: "Link your social accounts on Zora",
      body: "None are linked, so Zora can't show anyone your audience, and there is nothing to compare your holders with. Add X, Farcaster, Instagram or TikTok in your Zora profile settings." });
  } else if (unlinked.length) {
    steps.push({ id: "link", title: `Link ${list(unlinked)}`,
      body: "An account that isn't linked on Zora counts as no audience there. Linking it also shows people who find your profile where else they can follow you." });
  }
  if (holders != null && holders < FIRST_HOLDERS) {
    steps.push({ id: "first", title: `Get your first ${FIRST_HOLDERS} holders from people who already know you`,
      body: "Strangers rarely buy a coin with a handful of holders. Ask the people who already follow your work, in one post that says what the coin is for and links straight to it." });
  }
  if (holders != null && holders >= FIRST_HOLDERS && per1000 != null && aud.platform) {
    const where = PLATFORM[aud.platform];
    const tip = aud.platform === "farcaster"
      ? "Most of your audience is on Farcaster, where people already have a wallet in the app, so they are the easiest to convert. Cast your coin with a line about what holding it means."
      : `Most of your audience is on ${where}, where most people don't have a crypto wallet yet. Link straight to your coin on Zora rather than a contract address, and say plainly what holding it gets them.`;
    if (per1000 < medianPer1000) {
      steps.push({ id: "gap", title: `${per1000Text(per1000)} holders per 1,000 followers, against a median of ${per1000Text(medianPer1000)}`, body: tip });
    } else {
      steps.push({ id: "ahead", title: `${per1000Text(per1000)} holders per 1,000 followers, above the median of ${per1000Text(medianPer1000)}`,
        body: `Your audience already converts better than most, so more holders come from more reach. Post where your audience is largest (${where}).` });
    }
  }
  if (holders != null) {
    steps.push({ id: "reason", title: "Give holders something",
      body: "A coin is easier to hold when it unlocks something: a post, a file, an early link. Keycast gates any of those behind holding your coin, from a Farcaster mini app." });
  }
  return { reach: aud.total, platform: aud.platform, per1000, unlinked, steps };
}

/** Median of holders per 1,000 followers over coins with a real audience and a few holders. */
export function medianPer1000(rows: { holders: number; socials: Socials }[], minReach = 1_000, minHolders = FIRST_HOLDERS) {
  const xs = rows
    .map((r) => ({ h: r.holders, a: reach(r.socials).total }))
    .filter((r) => r.a >= minReach && r.h >= minHolders)
    .map((r) => (r.h / r.a) * 1000)
    .sort((a, b) => a - b);
  if (!xs.length) return 0;
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}
