// The site's share image (public/og.png): the gap map itself, drawn from the database, in the
// site's dark theme. Writes an HTML page; distribution-kit/bin/render-html.py turns it
// into the 1200x630 PNG. Run: npx tsx scripts/og-card.ts > /tmp/og.html
// EMBED=1 draws the 3:2 card Farcaster shows for the mini app embed (public/embed.png, 1200x800).
import { leads, stats } from "../src/lib/queries";

const EMBED = process.env.EMBED === "1";
const PAGE_H = EMBED ? 800 : 630;
const rows = leads();
const s = stats();
const W = 560, H = EMBED ? 560 : 430, L = 20, B = 20;
const x0 = 3, x1 = 7, y0 = 1, y1 = 4.3;
const X = (v: number) => L + ((W - L - 10) * (Math.log10(Math.max(v, 1000)) - x0)) / (x1 - x0);
const Y = (v: number) => 10 + ((H - B - 10) * (y1 - Math.log10(Math.max(v, 10)))) / (y1 - y0);
const top = new Set(rows.slice(0, 10).map((r) => r.address));
const dots = [...rows].sort((a, b) => Number(top.has(a.address)) - Number(top.has(b.address))).map((r) => {
  const hot = top.has(r.address);
  return `<circle cx="${X(r.reach).toFixed(1)}" cy="${Y(r.holders).toFixed(1)}" r="${hot ? 7.5 : 5}" fill="${hot ? "#6f86ff" : "#5a5a66"}" fill-opacity="${hot ? 1 : 0.8}" stroke="#131316" stroke-width="2"/>`;
}).join("");
const diag = [0.01, 0.001, 0.0001].map((rate) => {
  const a = 10 ** x0, b = 10 ** x1;
  return `<line x1="${X(a)}" y1="${Y(a * rate)}" x2="${X(b)}" y2="${Y(b * rate)}" stroke="#a1a1aa" stroke-opacity=".3" stroke-dasharray="4 6"/>`;
}).join("");

console.log(`<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:${PAGE_H}px;background:#0b0b0c;color:#f4f4f5;font-family:Geist,sans-serif}
  .wrap{display:grid;grid-template-columns:540px 1fr;height:100%;padding:56px 56px ${EMBED ? 88 : 48}px;box-sizing:border-box;gap:28px;align-items:${EMBED ? "center" : "stretch"}}
  .brand{display:flex;align-items:center;gap:12px;font:600 30px/1 Geist,sans-serif;letter-spacing:-.03em}
  h1{font:600 52px/1.04 Geist,sans-serif;margin:40px 0 18px;letter-spacing:-.045em}
  p{font-size:23px;line-height:1.45;color:#a1a1aa;margin:0}
  .facts{display:flex;gap:40px;margin-top:40px;font:400 17px/1.3 Geist,sans-serif;color:#a1a1aa}
  .facts b{display:block;font-size:34px;color:#f4f4f5;font-weight:600;letter-spacing:-.03em}
  .map{background:#131316;border:1px solid #26262c;border-radius:24px;display:grid;place-items:center;${EMBED ? "height:620px" : ""}}
  .foot{position:absolute;left:56px;bottom:40px;font:500 17px Geist,sans-serif;color:#a1a1aa}
</style></head><body><div class="wrap">
  <div>
    <div class="brand"><svg width="36" height="36" viewBox="0 0 24 24"><defs><radialGradient id="o" cx="38%" cy="42%" r="78%"><stop offset="0" stop-color="#fff1d6"/><stop offset=".38" stop-color="#ff9d6e"/><stop offset=".68" stop-color="#f25ca8"/><stop offset="1" stop-color="#3b5bff"/></radialGradient><clipPath id="s"><rect width="24" height="17.2"/></clipPath></defs><circle cx="12" cy="15.5" r="9.5" fill="url(#o)" clip-path="url(#s)"/><rect x="1.5" y="18.6" width="21" height="2.2" rx="1.1" fill="#f4f4f5"/></svg>Daybreak</div>
    <h1>Whose audience hasn't found their coin yet</h1>
    <p>Free analytics for Zora creator coins: the follower-to-holder gap, holder churn and trading patterns.</p>
    <div class="facts"><div><b>${s.coins.toLocaleString("en-US")}</b>coins tracked</div><div><b>hourly</b>from Zora's data</div></div>
  </div>
  <div class="map"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${diag}${dots}</svg></div>
</div><div class="foot">daybreak.rebelstudiossoftware.com</div></body></html>`);
