// Each coin's share card, written at build time to /coin/<address>/card.png: when someone shares a
// coin page, the preview carries that coin's own numbers instead of the site-wide card. A route
// (not opengraph-image.tsx) so the static export writes a real .png: Pages serves extension-less
// files as octet-stream, which link-preview crawlers refuse.
import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compact, int, PLATFORM, usd } from "@/lib/format";
import { allCoins, coinByAddress, holderSeries, leads, reach } from "@/lib/queries";

const size = { width: 1200, height: 630 };
export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return allCoins().map((c) => ({ address: c.address }));
}

const font = (f: string) => readFileSync(path.join(process.cwd(), "src/fonts", f));
const FONTS = [
  { name: "Archivo", data: font("Archivo-ExtraBold.ttf"), weight: 800 as const },
  { name: "Plex", data: font("IBMPlexSans-SemiBold.ttf"), weight: 600 as const },
  { name: "Mono", data: font("IBMPlexMono-Medium.ttf"), weight: 500 as const },
];
const INK = "#e7ebf3", MUTED = "#8d97ac", GOLD = "#c08628", BLUE = "#5b8def", BG = "#0e1422", CARD = "#141b2d", LINE = "#25304a";

/** Holders over time as an SVG path, for the corner chart. */
function sparkline(series: { ts: number; holders: number }[], w: number, h: number): string | null {
  if (series.length < 2) return null;
  const t0 = series[0].ts, t1 = series.at(-1)!.ts;
  const lo = Math.min(...series.map((s) => s.holders)), hi = Math.max(...series.map((s) => s.holders));
  const X = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w;
  const Y = (v: number) => h - ((v - lo) / Math.max(1, hi - lo)) * (h - 8) - 4;
  return series.map((s, i) => `${i ? "L" : "M"}${X(s.ts).toFixed(1)},${Y(s.holders).toFixed(1)}`).join(" ");
}

export function GET(_req: Request, { params }: { params: { address: string } }) {
  const c = coinByAddress(params.address)!;
  const lead = leads(1).find((l) => l.address === c.address);
  const aud = reach(c.socials);
  const per1k = aud.total > 0 ? (c.holders / aud.total) * 1000 : null;
  const line = sparkline(holderSeries(c.address), 380, 120);
  const fact = (value: string, label: string, color = INK) => (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 56 }}>
      <div style={{ fontFamily: "Mono", fontSize: 46, color }}>{value}</div>
      <div style={{ fontFamily: "Plex", fontSize: 22, color: MUTED, marginTop: 4 }}>{label}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: BG, display: "flex", flexDirection: "column", padding: "52px 64px", fontFamily: "Plex" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontFamily: "Archivo", fontSize: 28, color: INK }}>
            DAY<span style={{ color: GOLD }}>BREAK</span>
          </div>
          <div style={{ fontFamily: "Mono", fontSize: 20, color: MUTED }}>Zora creator coin</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
          <div style={{ fontFamily: "Archivo", fontSize: 92, color: INK, lineHeight: 1 }}>{`$${c.symbol.slice(0, 18)}`}</div>
          <div style={{ fontFamily: "Mono", fontSize: 30, color: MUTED, marginTop: 12 }}>{`@${(c.handle ?? "unknown").slice(0, 30)}`}</div>
        </div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex" }}>
            {fact(int(c.holders), "holders")}
            {aud.total > 0 ? fact(compact(aud.total), `followers on ${PLATFORM[aud.platform ?? ""] ?? "social"}`) : null}
            {per1k !== null ? fact(per1k.toFixed(per1k < 10 ? 2 : 0), "holders per 1k") : fact(usd(c.marketCap), "market cap")}
            {lead ? fact(String(lead.score), "gap score", GOLD) : null}
          </div>
          {line ? (
            <div style={{ display: "flex", flexDirection: "column", background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontFamily: "Mono", fontSize: 16, color: MUTED, marginBottom: 6 }}>holders over time</div>
              <svg width={380} height={120} viewBox="0 0 380 120">
                <path d={line} fill="none" stroke={BLUE} strokeWidth={3} />
              </svg>
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...size, fonts: FONTS, headers: { "content-type": "image/png" } },
  );
}
