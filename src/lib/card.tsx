// A coin's share card, drawn from its numbers: 1200x630 for link previews (card.png) and 1200x800
// for the Farcaster mini-app embed (embed.png), which wants 3:2. Same layout; the taller one just
// has more air between the name and the facts.
import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compact, int, PLATFORM, usd } from "@/lib/format";
import { coinByAddress, holderSeries, leads, per1000 } from "@/lib/queries";
import { thumb } from "@/lib/images";


const font = (f: string) => readFileSync(path.join(process.cwd(), "src/fonts", f));
const FONTS = [
  { name: "Geist", data: font("Geist-Regular.ttf"), weight: 400 as const },
  { name: "Geist", data: font("Geist-Medium.ttf"), weight: 500 as const },
  { name: "Geist", data: font("Geist-SemiBold.ttf"), weight: 600 as const },
];
// the site's dark theme: feeds are mostly light, so a near-black card stands out in them
const INK = "#f4f4f5", MUTED = "#a1a1aa", ACCENT = "#6f86ff", BG = "#0b0b0c", CARD = "#131316", LINE = "#26262c";

/** The coin's art as a data URI for the card, or null: a slow or missing image must not fail the build. */
async function art(url: string | null): Promise<string | null> {
  const src = thumb(url, 132);
  if (!src) return null;
  try {
    const r = await fetch(src, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "image/jpeg";
    if (!/^image\/(jpeg|png|webp|gif)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}

/** Daybreak's mark, as on the site. */
const mark = (
  <svg width={34} height={34} viewBox="0 0 24 24">
    <defs>
      <radialGradient id="o" cx="38%" cy="42%" r="78%">
        <stop offset="0" stopColor="#fff1d6" /><stop offset=".38" stopColor="#ff9d6e" /><stop offset=".68" stopColor="#f25ca8" /><stop offset="1" stopColor="#3b5bff" />
      </radialGradient>
      <clipPath id="s"><rect width="24" height="17.2" /></clipPath>
    </defs>
    <circle cx="12" cy="15.5" r="9.5" fill="url(#o)" clipPath="url(#s)" />
    <rect x="1.5" y="18.6" width="21" height="2.2" rx="1.1" fill={INK} />
  </svg>
);

/** Holders over time as an SVG path, for the corner chart. */
function sparkline(series: { ts: number; holders: number }[], w: number, h: number): string | null {
  if (series.length < 2) return null;
  if (series.every((x) => x.holders === series[0].holders)) return null; // a flat line reads as broken: no chart
  const t0 = series[0].ts, t1 = series.at(-1)!.ts;
  const lo = Math.min(...series.map((s) => s.holders)), hi = Math.max(...series.map((s) => s.holders));
  const X = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w;
  const Y = (v: number) => h - ((v - lo) / Math.max(1, hi - lo)) * (h - 8) - 4;
  return series.map((s, i) => `${i ? "L" : "M"}${X(s.ts).toFixed(1)},${Y(s.holders).toFixed(1)}`).join(" ");
}

export async function coinCard(address: string, height: 630 | 800) {
  const c = coinByAddress(address)!;
  const img = await art(c.image);
  const lead = leads(1).find((l) => l.address === c.address);
  // Only from a follow count we took ourselves. When we have not counted this creator the card
  // shows market cap instead of inventing a rate out of Zora's cached follower number.
  const per1k = c.follows ? per1000(c.holders, c.follows.follows) : null;
  const line = sparkline(holderSeries(c.address), 300, 110);
  const fact = (value: string, label: string, color = INK) => (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 44 }}>
      <div style={{ fontSize: 50, fontWeight: 600, letterSpacing: -1.5, color }}>{value}</div>
      <div style={{ fontSize: 22, fontWeight: 400, color: MUTED, marginTop: 2 }}>{label}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: BG, display: "flex", flexDirection: "column", padding: "52px 64px", fontFamily: "Geist" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 600, letterSpacing: -0.8, color: INK }}>
            {mark}<span style={{ marginLeft: 12 }}>Daybreak</span>
          </div>
          <div style={{ fontSize: 21, fontWeight: 500, color: MUTED }}>Zora creator coin</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 44 }}>
          {img ? <img src={img} width={132} height={132} style={{ borderRadius: 30, marginRight: 32 }} /> : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 88, fontWeight: 600, letterSpacing: -3.5, color: INK, lineHeight: 1 }}>{`$${c.symbol.slice(0, 16)}`}</div>
            <div style={{ fontSize: 30, fontWeight: 500, color: MUTED, marginTop: 12 }}>{`@${(c.handle ?? "unknown").slice(0, 30)}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex" }}>
            {fact(int(c.holders), "holders")}
            {c.follows ? fact(compact(c.follows.follows), "Farcaster follows") : null}
            {per1k !== null ? fact(per1k.toFixed(per1k < 10 ? 2 : 0), "holders per 1k follows") : fact(usd(c.marketCap), "market cap")}
            {lead ? fact(String(lead.score), "gap score", ACCENT) : null}
          </div>
          {line ? (
            <div style={{ display: "flex", flexDirection: "column", background: CARD, border: `1px solid ${LINE}`, borderRadius: 22, padding: "16px 20px" }}>
              <div style={{ fontSize: 17, fontWeight: 500, color: MUTED, marginBottom: 8 }}>Holders over time</div>
              <svg width={300} height={110} viewBox="0 0 300 110">
                <path d={line} fill="none" stroke={ACCENT} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: 1200, height, fonts: FONTS, headers: { "content-type": "image/png" } },
  );
}
