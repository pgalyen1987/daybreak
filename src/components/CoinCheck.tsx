"use client";
// Check any creator's coin, not only the ones Daybreak tracks: the browser asks Zora's public API
// (it allows any origin) for the profile's linked accounts and its creator coin's holder count,
// and lib/advice turns that into the steps that apply.
import Link from "next/link";
import { useState } from "react";
import { advise, per1000Text } from "@/lib/advice";
import { compact, int, PLATFORM, zoraUrl } from "@/lib/format";
import type { Socials } from "@/lib/metrics";

const API = "https://api-sdk.zora.engineering";
const KEYCAST = "https://keycast-production.up.railway.app";

type Result = { handle: string; socials: Socials; holders: number | null; coin: string | null; symbol: string | null };

/** "@name", "name", a zora.co profile URL or a wallet address → what the profile endpoint takes. */
export function identifierFrom(input: string): string {
  const s = input.trim();
  const url = s.match(/zora\.co\/@([^/?#\s]+)/i);
  if (url) return url[1];
  return s.replace(/^@/, "");
}

async function lookup(identifier: string): Promise<Result | null> {
  const r = await fetch(`${API}/profile?identifier=${encodeURIComponent(identifier)}`);
  if (!r.ok) throw new Error(`Zora answered ${r.status}`);
  const p = (await r.json())?.profile;
  if (!p) return null;
  const s = p.socialAccounts || {};
  const count = (k: string) => (s[k] ? Number(s[k].followerCount ?? 0) : null);
  const socials: Socials = { twitter: count("twitter"), farcaster: count("farcaster"), instagram: count("instagram"), tiktok: count("tiktok") };
  const coin: string | null = p.creatorCoin?.address?.toLowerCase() ?? null;
  let holders: number | null = null, symbol: string | null = null;
  if (coin) {
    const c = await fetch(`${API}/coin?address=${coin}&chain=8453`);
    if (!c.ok) throw new Error(`Zora answered ${c.status}`);
    const t = (await c.json())?.zora20Token;
    holders = Number(t?.uniqueHolders ?? 0);
    symbol = t?.symbol ?? null;
  }
  return { handle: p.handle || identifier, socials, holders, coin, symbol };
}

export function CoinCheck({ medianPer1000, tracked }: { medianPer1000: number; tracked: string[] }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = identifierFrom(input);
    if (!id) return;
    setBusy(true); setError(null); setRes(null);
    try {
      const r = await lookup(id);
      if (!r) setError(`No Zora profile called "${id}". Check the spelling, or paste your zora.co profile link.`);
      else setRes(r);
    } catch {
      setError("Couldn't reach Zora just now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  const a = res ? advise({ socials: res.socials, holders: res.holders, medianPer1000 }) : null;
  const onDaybreak = res?.coin && tracked.includes(res.coin);
  const linked = res ? (Object.entries(res.socials).filter(([, v]) => v != null) as [string, number][]) : [];
  const coinLink = res?.coin ? zoraUrl(res.coin) : null;
  const shareText = res?.symbol ? `My creator coin on Zora: $${res.symbol}` : "";

  return (
    <>
      <form className="panel check-form" onSubmit={submit}>
        <label htmlFor="handle">Your Zora handle</label>
        <div className="check-row">
          <input id="handle" name="handle" value={input} onChange={(e) => setInput(e.target.value)} placeholder="@yourname or zora.co/@yourname"
            autoComplete="off" autoCapitalize="none" spellCheck={false} required />
          <button className="btn" type="submit" disabled={busy}>{busy ? "Checking…" : "Check"}</button>
        </div>
        <p className="note">Read from Zora&apos;s public API in your browser. Nothing is stored.</p>
      </form>

      {error && <p className="panel note" role="alert">{error}</p>}

      {res && a && (
        <>
          <section className="panel" aria-live="polite">
            <h2>@{res.handle}{res.symbol ? ` · $${res.symbol}` : ""}</h2>
            <div className="facts">
              <div><b>{res.holders == null ? "none" : int(res.holders)}</b>{res.holders == null ? "creator coin" : "holders"}</div>
              <div><b>{a.reach > 0 ? compact(a.reach) : "0"}</b>{a.platform ? `followers on ${PLATFORM[a.platform]}` : "linked followers"}</div>
              {a.per1000 != null && <div><b>{per1000Text(a.per1000)}</b>holders per 1,000 followers</div>}
            </div>
            {linked.length > 0 && <p className="note">Linked on Zora: {linked.map(([k, v]) => `${PLATFORM[k]} ${compact(v)}`).join(" · ")}. The audience figure uses the largest, since followers overlap.</p>}
          </section>

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
