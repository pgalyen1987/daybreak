"use client";
// The worklist. Not a table of names: a queue of people, each with the evidence for why they are
// worth a message and exactly one thing to do about it. Nothing is ever sent from here — the draft
// opens in the creator's own composer and they press send.
import { useMemo, useState } from "react";
import type { Scored } from "@/lib/prospects";
import { CoinAvatar } from "@/components/CoinAvatar";

type Filter = "all" | "taste" | "buyers" | "fresh";
const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: "all", label: "Everyone", hint: "every follower who does not hold" },
  { id: "taste", label: "Same taste", hint: "holds a coin your holders hold" },
  { id: "buyers", label: "Proven buyers", hint: "already holds Zora coins" },
  { id: "fresh", label: "Followed recently", hint: "followed in the last 90 days" },
];

const FC_EPOCH = 1609459200_000;
const daysSince = (t: number) => (t > 0 ? Math.floor((Date.now() - (FC_EPOCH + t * 1000)) / 86_400_000) : Infinity);

export function ProspectList({ people }: { people: Scored[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const shown = useMemo(() => people.filter((p) => {
    if (filter === "taste") return p.sharedCoins.length > 0;
    if (filter === "buyers") return p.zoraCoins > 0;
    if (filter === "fresh") return daysSince(p.followedAt) <= 90;
    return true;
  }), [people, filter]);

  async function copy(p: Scored) {
    if (!p.action.text) return;
    try { await navigator.clipboard.writeText(p.action.text); setCopied(p.fid); setTimeout(() => setCopied(null), 1600); } catch { /* clipboard blocked */ }
  }

  return (
    <>
      <div className="filters" role="group" aria-label="Filter the list">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} title={f.hint}>
            {f.label}
          </button>
        ))}
        <span className="note">{shown.length} shown</span>
      </div>

      <p className="sr-live" role="status" aria-live="polite">{copied ? "Draft copied to the clipboard" : ""}</p>
      <ol className="worklist">
        {shown.map((p, i) => (
          <li key={p.fid} className="prospect">
            <span className="prospect-rank num">{i + 1}</span>
            <CoinAvatar src={p.pfp} label={p.username ?? String(p.fid)} address={`0x${p.fid.toString(16).padStart(6, "0")}`} size={40} />
            <div className="prospect-who">
              <a href={p.username ? `https://farcaster.xyz/${p.username}` : `https://farcaster.xyz/~/profiles/${p.fid}`}
                 target="_blank" rel="noopener noreferrer"><b>{p.username ? `@${p.username}` : `fid ${p.fid}`}</b></a>
              {p.display && p.display !== p.username && <span className="prospect-name">{p.display}</span>}
              <ul className="chips">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
            <div className="prospect-score" title="Score out of 100, from the signals listed on this page">
              <b className="num" aria-label={`Score ${p.score} out of 100`}>{p.score}</b>
              <i aria-hidden="true"><span style={{ width: `${Math.min(100, p.score)}%` }} /></i>
            </div>
            <div className="prospect-do">
              {p.action.text ? (
                <button type="button" className="btn ghost" onClick={() => setOpen(open === p.fid ? null : p.fid)} aria-expanded={open === p.fid}>
                  {open === p.fid ? "Hide draft" : "Draft"}
                </button>
              ) : (
                <a className="btn ghost" href={p.action.url} target="_blank" rel="noopener noreferrer">Profile</a>
              )}
            </div>
            {open === p.fid && p.action.text && (
              <div className="draft">
                <p className="draft-text">{p.action.text}</p>
                <div className="draft-do">
                  <button type="button" className="btn ghost" onClick={() => copy(p)}>{copied === p.fid ? "Copied" : "Copy"}</button>
                  <a className="btn" href={p.action.url} target="_blank" rel="noopener noreferrer">Open in composer</a>
                  <span className="note">Opens Farcaster with this text. You press send.</span>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!shown.length && <p className="note">No one in this list matches that filter.</p>}
    </>
  );
}
