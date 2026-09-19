// The site's share image (public/og.png): the gap map itself, drawn from the database, in the
// dark "night map" palette. Writes an HTML page; distribution-kit/bin/render-html.py turns it
// into the 1200x630 PNG. Run: npx tsx scripts/og-card.ts > /tmp/og.html
import { leads, stats } from "../src/lib/queries";

const rows = leads();
const s = stats();
const W = 560, H = 430, L = 20, B = 20;
const x0 = 3, x1 = 7, y0 = 1, y1 = 4.3;
const X = (v: number) => L + ((W - L - 10) * (Math.log10(Math.max(v, 1000)) - x0)) / (x1 - x0);
const Y = (v: number) => 10 + ((H - B - 10) * (y1 - Math.log10(Math.max(v, 10)))) / (y1 - y0);
const top = new Set(rows.slice(0, 10).map((r) => r.address));
const dots = [...rows].sort((a, b) => Number(top.has(a.address)) - Number(top.has(b.address))).map((r) => {
  const hot = top.has(r.address);
  return `<circle cx="${X(r.reach).toFixed(1)}" cy="${Y(r.holders).toFixed(1)}" r="${hot ? 7 : 5}" fill="${hot ? "#c08628" : "#5b7fc4"}" fill-opacity="${hot ? 1 : 0.75}" stroke="#141b2d" stroke-width="2"/>`;
}).join("");
const diag = [0.01, 0.001, 0.0001].map((rate) => {
  const a = 10 ** x0, b = 10 ** x1;
  return `<line x1="${X(a)}" y1="${Y(a * rate)}" x2="${X(b)}" y2="${Y(b * rate)}" stroke="#8d97ac" stroke-opacity=".35" stroke-dasharray="4 6"/>`;
}).join("");

console.log(`<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@112,800&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:630px;background:#0e1422;color:#e7ebf3;font-family:"IBM Plex Sans",sans-serif}
  .wrap{display:grid;grid-template-columns:540px 1fr;height:100%;padding:56px 56px 48px;box-sizing:border-box;gap:28px}
  .brand{font:800 30px/1 Archivo,sans-serif;font-stretch:115%;letter-spacing:.02em;text-transform:uppercase}
  .brand span{color:#c08628}
  h1{font:800 50px/1.05 Archivo,sans-serif;font-stretch:112%;margin:40px 0 18px;letter-spacing:-.01em}
  p{font-size:23px;line-height:1.45;color:#aab3c5;margin:0}
  .facts{display:flex;gap:34px;margin-top:40px;font:500 16px/1.3 "IBM Plex Mono",monospace;color:#8d97ac}
  .facts b{display:block;font-size:30px;color:#e7ebf3;font-weight:500}
  .map{background:#141b2d;border:1px solid #25304a;border-radius:12px;display:grid;place-items:center}
  .foot{position:absolute;left:56px;bottom:40px;font:500 16px "IBM Plex Mono",monospace;color:#8d97ac}
</style></head><body><div class="wrap">
  <div>
    <div class="brand">Day<span>break</span></div>
    <h1>Whose audience hasn't found their coin yet</h1>
    <p>Free analytics for Zora creator coins: the follower-to-holder gap, holder churn and trading patterns.</p>
    <div class="facts"><div><b>${s.coins.toLocaleString("en-US")}</b>coins tracked</div><div><b>hourly</b>from Zora's data</div></div>
  </div>
  <div class="map"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${diag}${dots}</svg></div>
</div><div class="foot">daybreak.rebelstudiossoftware.com</div></body></html>`);
