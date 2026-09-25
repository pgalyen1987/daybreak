// Reads the diffs the collector wrote into public/audience/*.json at build time.
// There is no server here: the hourly job does the crawling, the pages are static.
import fs from "node:fs";
import path from "node:path";
import type { ProspectFacts } from "./prospects";

export type Audience = {
  handle: string; fid: number; fcUsername: string;
  coin: string | null; symbol: string | null; image: string | null; avatar: string | null;
  generatedAt: number;
  counts: {
    /** Signed follows the hub holds for this account. */
    followersTotal: number;
    /** How many of those we resolved to a wallet, which is what "coverage" means on the page. */
    checked: number;
    withWallet: number;
    holders: number;
    alreadyHold: number;
    prospects: number;
    withSharedTaste: number;
    /** What Zora's profile claims, kept so the page can show the three numbers disagreeing. */
    claimedFarcaster: number | null;
    /** What api.farcaster.xyz reports. */
    apiFollowerCount: number;
  };
  taste: { address: string; symbol: string | null; holders: number; total?: number }[];
  /** Co-held holder lists the run could not read (rate limits). Makes "same taste" an undercount. */
  tasteMissed?: number;
  /** Co-held coins ignored for being too widely held to signal anything (airdrops, farmed tokens). */
  tasteSkipped?: { symbol: string | null; holders: number }[];
  /** The shortlist, as facts. Scores, wording and actions are derived when the page renders. */
  top: ProspectFacts[];
};

const DIR = path.join(process.cwd(), "public", "audience");

/**
 * A file in this directory is collector output, written by a job that can be cut off mid-write by
 * a timeout, so "it parsed" is not enough: a half-written or foreign JSON file used to take the
 * whole build down with it (`Cannot read properties of undefined`), and in CI that means the
 * hourly publish fails and the live site goes stale for everything, not just this page. So a file
 * has to look like a diff before it is used, and one that doesn't is skipped rather than trusted.
 */
function isAudience(x: unknown): x is Audience {
  const a = x as Audience;
  return !!a && typeof a === "object"
    && typeof a.handle === "string" && typeof a.fid === "number"
    && !!a.counts && typeof a.counts.followersTotal === "number" && typeof a.counts.prospects === "number"
    && Array.isArray(a.top);
}

export function audienceHandles(): string[] {
  try {
    return fs.readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .filter((h) => audience(h) !== null)
      .sort();
  } catch { return []; }
}

export function audience(handle: string): Audience | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, `${handle}.json`), "utf8"));
    if (!isAudience(j) || j.handle !== handle) {
      console.warn(`audience: ignoring public/audience/${handle}.json — not a complete follower diff`);
      return null;
    }
    return j;
  } catch { return null; }
}

export function allAudiences(): Audience[] {
  return audienceHandles().map(audience).filter((a): a is Audience => !!a)
    .sort((a, b) => b.counts.prospects - a.counts.prospects);
}

/** What share of the follower list we have actually resolved to wallets. */
export const coverage = (a: Audience) => (a.counts.followersTotal ? a.counts.checked / a.counts.followersTotal : 0);

/**
 * Whether the page may print its counts as totals.
 *
 * `prospects` is a count over the followers resolved so far, not over the follower list, and the
 * collector resolves a budget per run — so on a large account an early run has checked a few
 * per cent and "346,224 people follow and don't hold" would really mean "14,000 of the 4% we have
 * looked at". True, and read as complete. Below this the pages say "at least".
 */
export const PARTIAL_BELOW = 0.95;
export const complete = (a: Audience) => coverage(a) >= PARTIAL_BELOW;

/**
 * Of the followers we could check, how many already hold. This is the number that says whether
 * the premise holds at all: a creator converting 0.2% of their audience has a real gap to work,
 * one converting 40% has already done the work.
 */
export const conversion = (a: Audience) => (a.counts.withWallet ? a.counts.alreadyHold / a.counts.withWallet : 0);
