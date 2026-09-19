"use client";
import { useState } from "react";

/** Post buttons for a page: Farcaster first (the link opens as a mini app in the feed), then X,
 *  Bluesky and a copy. The text arrives written; the person sharing can still edit it. `quiet` keeps
 *  them all secondary where the page has its own main action (a coin page's Buy on Zora). */
export function ShareBar({ text, url, preview, quiet }: { text: string; url: string; preview?: string; quiet?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  return (
    <div className="sharebar">
      {preview && <img className="sharecard" src={preview} alt="The card your post will show" width={600} height={315} loading="lazy" />}
      <div className="sharebtns">
        <a className={quiet ? "btn ghost" : "btn"} href={`https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Share on Farcaster</a>
        <a className="btn ghost" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">X</a>
        <a className="btn ghost" href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">Bluesky</a>
        <button type="button" className="btn ghost" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
      </div>
    </div>
  );
}
