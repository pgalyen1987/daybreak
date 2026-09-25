"use client";
// Check any creator's coin, not only the ones Daybreak tracks: the browser asks Zora's public API
// (it allows any origin) for the profile's linked accounts and its creator coin's holder count,
// and lib/advice turns that into the steps that apply.
import Link from "next/link";
import { useState } from "react";
import { advise, per1000Text } from "@/lib/advice";
import { compact, int, PLATFORM, zoraUrl } from "@/lib/format";
import { countFollows, fidForName } from "@/lib/hub-public";
import { CoinAvatar } from "@/components/CoinAvatar";
import { ShareBar } from "@/components/ShareBar";

const API = "https://api-sdk.zora.engineering";
const KEYCAST = "https://keycast-production.up.railway.app";

// A hub page is about 2,000 follow records and about a second. 40 pages counts an 80,000-follow
// account in well under a minute; past that the honest answer in a browser is "more than 80,000",
// not a wrong total and not a spinner that never ends.
const BROWSER_MAX_PAGES = 40;

type Result = {
  handle: string; holders: number | null; coin: string | null; symbol: string | null; image: string | null;
  /** Linked account handles from Zora. The follower counts alongside them are deliberately unread. */
  linked: Partial<Record<string, string>>;
  /** What we counted on the hub ourselves, or null when there is no Farcaster account to count. */
  follows: number | null;
  followsConverged: boolean;
  /** Zora names a Farcaster account the hub has never heard of: its copy of the name is stale. */
  farcasterUnresolved: boolean;
};

/** "@name", "name", a zora.co profile URL or a wallet address → what the profile endpoint takes. */
export function identifierFrom(input: string): string {
  const s = input.trim();
  const url = s.match(/zora\.co\/@([^/?#\s]+)/i);
  if (url) return url[1];
  return s.replace(/^@/, "");
}

/**
 * Everything the page needs, read live in the browser from two keyless, CORS-open sources: Zora's
 * coins API for the profile and the coin, and a public Farcaster hub for the follow count.
 *
 * Zora also serves a `followerCount` next to each linked account and this deliberately ignores it.
 * That number is a cache that does not move — we compared 60 of them across 39 creators with the
 * values served three days earlier and not one had changed — and where it could be checked it was
 * wrong, 292,097 against 478,377 real follow records for @jacob. So the count is taken here,
 * from the protocol, in front of you, and the page says how far it got.
 */
async function lookup(identifier: string, onCount: (n: number) => void): Promise<Result | null> {
  const r = await fetch(`${API}/profile?identifier=${encodeURIComponent(identifier)}`);
  if (!r.ok) throw new Error(`Zora answered ${r.status}`);
  const p = (await r.json())?.profile;
  if (!p) return null;
  const s = p.socialAccounts || {};
  const linked: Partial<Record<string, string>> = {};
  for (const k of ["twitter", "farcaster", "instagram", "tiktok"]) if (s[k]?.username) linked[k] = s[k].username;
  const coin: string | null = p.creatorCoin?.address?.toLowerCase() ?? null;
  let holders: number | null = null, symbol: string | null = null;
  let image: string | null = p.avatar?.previewImage?.small ?? null;
  if (coin) {
    const c = await fetch(`${API}/coin?address=${coin}&chain=8453`);
    if (!c.ok) throw new Error(`Zora answered ${c.status}`);
    const t = (await c.json())?.zora20Token;
    holders = Number(t?.uniqueHolders ?? 0);
    symbol = t?.symbol ?? null;
    image = t?.mediaContent?.previewImage?.small ?? image;
  }
  let follows: number | null = null, followsConverged = true, farcasterUnresolved = false;
  if (linked.farcaster) {
    const fid = await fidForName(linked.farcaster).catch(() => null);
    if (fid) {
      const w = await countFollows(fid, { maxPages: BROWSER_MAX_PAGES, onPage: (_, n) => onCount(n) });
      follows = w.count;
      followsConverged = w.converged;
    } else {
      // Zora's copy of the linked username is as stale as its follower counts: the name it has
      // may have been changed since. Say that, rather than reporting no audience.
      farcasterUnresolved = true;
    }
  }
  return { handle: p.handle || identifier, holders, coin, symbol, image, linked, follows, followsConverged, farcasterUnresolved };
}


/** A post in the numbers' own words, true whoever shares it: the creator or someone looking them up. */
function checkShareText(res: Result, a: NonNullable<ReturnType<typeof advise>>, median: number, medianN: number): string {
  const head = `$${res.symbol} on Zora: ${res.holders == null ? "no" : int(res.holders)} holders`;
  if (!res.follows) return `${head}. How many of your Farcaster followers hold your coin?`;
  const over = res.followsConverged ? "" : "over ";
  const rate = a.per1000 != null ? `, ${per1000Text(a.per1000)} per 1,000` : "";
  const vs = a.per1000 != null && medianN > 0 ? ` (median across ${medianN} creators Daybreak has counted: ${per1000Text(median)})` : "";
  return `${head} from ${over}${compact(res.follows)} Farcaster follows${rate}${vs}. How does your coin compare?`;
}

export function CoinCheck({ medianPer1000, medianN, tracked }: { medianPer1000: number; medianN: number; tracked: string[] }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [counted, setCounted] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = identifierFrom(input);
    if (!id) return;
    setBusy(true); setError(null); setRes(null); setCounted(null);
    try {
      const r = await lookup(id, setCounted);
      if (!r) setError(`No Zora profile called "${id}". Check the spelling, or paste your zora.co profile link.`);
      else setRes(r);
    } catch {
      setError("Couldn't reach Zora or the Farcaster hub just now. Try again in a minute.");
    } finally {
      setBusy(false); setCounted(null);
    }
  }

  const a = res ? advise({
    follows: res.follows, followsConverged: res.followsConverged,
    farcasterLinked: !!res.linked.farcaster, farcasterUnresolved: res.farcasterUnresolved,
    unmeasurable: (["twitter", "instagram", "tiktok"] as const).filter((k) => res.linked[k]).map((k) => PLATFORM[k]),
    holders: res.holders, medianPer1000, medianN,
  }) : null;
  const onDaybreak = res?.coin && tracked.includes(res.coin);
  const linked = res ? (Object.entries(res.linked) as [string, string][]) : [];
  const coinLink = res?.coin ? zoraUrl(res.coin) : null;
  const shareText = res?.symbol ? `My creator coin on Zora: $${res.symbol}` : "";

  return (
    <>
      <form className="panel check-form" onSubmit={submit}>
        <label htmlFor="handle">Your Zora handle</label>
        <div className="check-row">
          <input id="handle" name="handle" value={input} onChange={(e) => setInput(e.target.value)} placeholder="@yourname or zora.co/@yourname"
            autoComplete="off" autoCapitalize="none" spellCheck={false} required />
          <button className="btn" type="submit" disabled={busy}>{busy ? "Counting…" : "Check"}</button>
        </div>
        <p className="note" aria-live="polite">
          {busy && counted != null
            ? `Walking the Farcaster hub: ${int(counted)} follow records so far…`
            : "Read in your browser from Zora's public API and a public Farcaster node. Nothing is stored, and the follow count is walked live rather than taken from Zora's cached follower number."}
        </p>
      </form>

      {error && <p className="panel note" role="alert">{error}</p>}

      {res && a && (
        <>
          <section className="panel" aria-live="polite">
            <div className="who"><CoinAvatar src={res.image} label={res.handle} address={res.coin ?? "0x000000"} size={44} /><h2>@{res.handle}{res.symbol ? ` · $${res.symbol}` : ""}</h2></div>
            <div className="facts">
              <div><b>{res.holders == null ? "none" : int(res.holders)}</b>{res.holders == null ? "creator coin" : "holders"}</div>
              {res.follows != null && <div><b>{res.followsConverged ? "" : "over "}{compact(res.follows)}</b>Farcaster follows</div>}
              {a.per1000 != null && <div><b>{per1000Text(a.per1000)}</b>holders per 1,000 follows</div>}
            </div>
            {linked.length > 0 && <p className="note">Linked on Zora: {linked.map(([k, v]) => `${PLATFORM[k]} @${v}`).join(" · ")}.</p>}
            {res.follows != null && (
              <p className="note">
                {res.followsConverged
                  ? `Counted just now by walking a public Farcaster node for every signed, unrevoked follow of @${res.linked.farcaster}. It is a ceiling — dormant accounts are in it, and Farcaster's own app shows a smaller, filtered number — but it is a count, not a copy of one.`
                  : `Stopped at ${int(res.follows)}: this account has more follow records than a browser should walk, so that figure is a floor and no rate is shown from it. Daybreak counts the tracked creators properly on the server.`}
              </p>
            )}
          </section>

          {res.coin && res.symbol && (
            <section className="panel">
              <h2>Share these numbers</h2>
              <p className="note">{onDaybreak ? "The post carries a card with the coin's art and these numbers; on Farcaster it opens Daybreak right in the feed." : "The post links to this check, so anyone can look up their own coin."}</p>
              <ShareBar text={checkShareText(res, a, medianPer1000, medianN)} url={onDaybreak ? `${location.origin}/coin/${res.coin}/` : `${location.origin}/check/`}
                preview={onDaybreak ? `/coin/${res.coin}/card.png` : undefined} />
            </section>
          )}

          <section className="panel">
            <h2>What to do next</h2>
            <ol className="steps">
              {a.steps.map((s) => (
                <li key={s.id}>
                  <b>{s.title}</b>
                  <p className="note">{s.body}</p>
                  {s.id === "first" && coinLink && (
                    <p className="share">Post it:{" "}
                      <a href={`https://farcaster.xyz/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(coinLink)}`} target="_blank" rel="noopener noreferrer">Farcaster</a>{" · "}
                      <a href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(coinLink)}`} target="_blank" rel="noopener noreferrer">X</a>{" · "}
                      <a href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${shareText} ${coinLink}`)}`} target="_blank" rel="noopener noreferrer">Bluesky</a>
                    </p>
                  )}
                  {s.id === "reason" && <p className="share"><a href={res.coin ? `${KEYCAST}/?coin=${res.coin}` : KEYCAST} target="_blank" rel="noopener noreferrer">Set up a holder perk on Keycast</a></p>}
                </li>
              ))}
            </ol>
          </section>

          {res.coin && (
            <p className="note">
              {onDaybreak
                ? <>Daybreak records this coin&apos;s holders every hour: <Link href={`/coin/${res.coin}/`}>see them over time</Link>, then check again after you post.</>
                : <>Daybreak records holders hourly for coins in Zora&apos;s most valuable, trending and most traded lists; this one isn&apos;t in them yet, so check back here after you post.</>}
            </p>
          )}
        </>
      )}
    </>
  );
}
