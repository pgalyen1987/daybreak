// Server-rendered SVG charts. Colors come from CSS tokens so both themes work; hover text rides on
// data-tip and is shown by <Tooltips/>.
import { compact, int, usd } from "@/lib/format";

type Pt = { key: string; label: string; reach: number; holders: number; score: number; hot: boolean };

/** Every creator as a dot: followers across, holders up, both log scales, with conversion diagonals. */
export function GapMap({ points, labelKeys }: { points: Pt[]; labelKeys: string[] }) {
  const W = 900, H = 420, L = 74, R = 76, T = 12, B = 40;
  const xs = points.map((p) => p.reach), ys = points.map((p) => p.holders);
  const x0 = 3, x1 = Math.max(6, Math.ceil(Math.log10(Math.max(...xs, 1e6)) * 10) / 10);
  const y0 = 1, y1 = Math.max(4, Math.ceil(Math.log10(Math.max(...ys, 1e4))));
  const X = (v: number) => L + ((W - L - R) * (Math.log10(v) - x0)) / (x1 - x0);
  const Y = (v: number) => T + ((H - T - B) * (y1 - Math.log10(v))) / (y1 - y0);
  const ordered = [...points].sort((a, b) => Number(a.hot) - Number(b.hot)); // highlighted dots on top
  const byKey = new Map(points.map((p) => [p.key, p]));
  return (
    <svg className="chart map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Creators plotted by followers and coin holders on log scales">
      <defs><clipPath id="gm-clip"><rect x={L} y={T} width={W - L - R} height={H - T - B} /></clipPath></defs>
      {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map((e) => (
        <g key={`y${e}`}>
          <line x1={L} x2={W - R} y1={Y(10 ** e)} y2={Y(10 ** e)} stroke="var(--grid)" />
          <text x={L - 8} y={Y(10 ** e) + 4} textAnchor="end">{compact(10 ** e)}</text>
        </g>
      ))}
      {Array.from({ length: Math.floor(x1) - x0 + 1 }, (_, i) => x0 + i).map((e) => (
        <g key={`x${e}`}>
          <line x1={X(10 ** e)} x2={X(10 ** e)} y1={T} y2={H - B} stroke="var(--grid)" />
          <text x={X(10 ** e)} y={H - B + 16} textAnchor="middle">{compact(10 ** e)}</text>
        </g>
      ))}
      <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle">Followers (largest linked account)</text>
      <text className="ytitle" x={14} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>Holders</text>
      {([[0.01, "10 per 1k"], [0.001, "1 per 1k"], [0.0001, "0.1 per 1k"]] as const).map(([rate, label]) => {
        const xa = 10 ** x0, xb = 10 ** x1, yEnd = Y(xb * rate);
        return (
          <g key={label}>
            <line x1={X(xa)} y1={Y(xa * rate)} x2={X(xb)} y2={Y(xb * rate)} stroke="var(--muted)" strokeOpacity={0.45} strokeDasharray="4 5" clipPath="url(#gm-clip)" />
            {yEnd > T + 6 && yEnd < H - B - 4 && <text className="diag" x={W - R + 6} y={yEnd + 4}>{label}</text>}
          </g>
        );
      })}
      {ordered.map((p) => (
        <circle key={p.key} className={p.hot ? "hot" : "rest"} cx={X(p.reach)} cy={Y(Math.max(p.holders, 10 ** y0))} r={p.hot ? 6 : 4.5}
          fill={p.hot ? "var(--gap)" : "var(--rest)"} fillOpacity={p.hot ? 1 : 0.8} stroke="var(--card)" strokeWidth={2}
          tabIndex={0} data-tip={`${p.label}  ${compact(p.reach)} followers · ${int(p.holders)} holders · score ${p.score}`} />
      ))}
      {labelKeys.map((k) => {
        const p = byKey.get(k);
        if (!p) return null;
        const nearRight = X(p.reach) > W - R - 130; // keep clear of the diagonal labels on the right edge
        return <text key={k} className="strong plabel" x={X(p.reach) + (nearRight ? -10 : 10)} y={Y(p.holders) + 4} textAnchor={nearRight ? "end" : "start"}>{p.label}</text>;
      })}
    </svg>
  );
}

/** Daily dollar volume: buys above the line, sells below. */
export function FlowBars({ daily }: { daily: { day: string; buy: number; sell: number; trades: number }[] }) {
  const W = 1000, H = 230, L = 84, R = 12, T = 18, B = 30;
  const step = (v: number) => { if (v <= 0) return 100; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; };
  const top = step(Math.max(...daily.map((d) => d.buy), 1)), bot = step(Math.max(...daily.map((d) => d.sell), 1));
  const y = (v: number) => T + ((H - T - B) * (top - v)) / (top + bot);
  const bw = (W - L - R) / daily.length;
  const peak = daily.reduce((a, b) => (b.buy > a.buy ? b : a), daily[0]);
  return (
    <div className="scrollx"><svg className="chart wide" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily buy and sell volume in US dollars">
      {[top, 0, -bot].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--muted)" : "var(--grid)"} />
          <text x={L - 8} y={y(v) + 4} textAnchor="end">{v === 0 ? "$0" : (v < 0 ? "−" : "") + usd(Math.abs(v))}</text>
        </g>
      ))}
      {daily.map((d, i) => {
        const x = L + i * bw + bw * 0.22, w = bw * 0.56;
        const date = new Date(d.day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
        return (
          <g key={d.day} tabIndex={0} data-tip={`${date}  buys ${usd(d.buy)} · sells ${usd(d.sell)} · ${d.trades} trades`}>
            <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
            {d.buy > 0 && <rect x={x} y={y(d.buy)} width={w} height={Math.max(1, y(0) - y(d.buy) - 1)} rx={3} fill="var(--buy)" />}
            {d.sell > 0 && <rect x={x} y={y(0) + 1} width={w} height={Math.max(1, y(-d.sell) - y(0) - 1)} rx={3} fill="var(--sell)" />}
            <text x={x + w / 2} y={H - 6} textAnchor="middle">{date}</text>
          </g>
        );
      })}
      {peak && peak.buy > 0 && (
        <text className="strong" x={L + daily.indexOf(peak) * bw + bw / 2} y={y(peak.buy) - 6} textAnchor="middle">{usd(peak.buy)}</text>
      )}
    </svg></div>
  );
}

/** Dollar volume by weekday and UTC hour. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const L = 38, T = 4, c = 18, g = 2;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], order = [1, 2, 3, 4, 5, 6, 0];
  const max = Math.max(...grid.flat(), 1);
  const fill = (v: number) => (v <= 0 ? "var(--heat-0)" : `var(--heat-${Math.min(4, 1 + Math.floor(3.999 * Math.sqrt(v / max)))})`);
  const W = L + 24 * (c + g), H = T + 7 * (c + g) + 18;
  return (
    <svg className="chart heat" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dollar volume by weekday and hour, UTC">
      {order.map((wd, r) => (
        <g key={wd}>
          <text x={L - 6} y={T + r * (c + g) + c * 0.72} textAnchor="end">{days[r]}</text>
          {grid[wd].map((v, h) => (
            <rect key={h} x={L + h * (c + g)} y={T + r * (c + g)} width={c} height={c} rx={3} fill={fill(v)}
              {...(v > 0 ? { tabIndex: 0, "data-tip": `${days[r]} ${String(h).padStart(2, "0")}:00 UTC · ${usd(v)}` } : {})} />
          ))}
        </g>
      ))}
      {[0, 6, 12, 18, 23].map((h) => <text key={h} x={L + h * (c + g) + c / 2} y={H - 2} textAnchor="middle">{String(h).padStart(2, "0")}h</text>)}
    </svg>
  );
}

/** Holders over time from the hourly snapshots. */
export function HolderLine({ series }: { series: { ts: number; holders: number }[] }) {
  if (series.length < 2) return <p className="note">Holder history starts with our first snapshot; the line appears after the next hourly update.</p>;
  const W = 1000, H = 180, L = 84, R = 14, T = 14, B = 28;
  const t0 = series[0].ts, t1 = series.at(-1)!.ts;
  const lo = Math.min(...series.map((s) => s.holders)), hi = Math.max(...series.map((s) => s.holders));
  const pad = Math.max(1, Math.round((hi - lo) * 0.15));
  const y0 = Math.max(0, lo - pad), y1 = hi + pad;
  const X = (t: number) => L + ((W - L - R) * (t - t0)) / Math.max(1, t1 - t0);
  const Y = (v: number) => T + ((H - T - B) * (y1 - v)) / Math.max(1, y1 - y0);
  const d = series.map((s, i) => `${i ? "L" : "M"}${X(s.ts).toFixed(1)},${Y(s.holders).toFixed(1)}`).join(" ");
  const last = series.at(-1)!;
  return (
    <div className="scrollx"><svg className="chart wide" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Holders over time">
      {[y0, y1].map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end">{int(v)}</text></g>
      ))}
      <path d={`${d} L${X(t1)},${H - B} L${X(t0)},${H - B} Z`} fill="var(--buy)" fillOpacity={0.1} />
      <path d={d} fill="none" stroke="var(--buy)" strokeWidth={2} />
      <circle cx={X(last.ts)} cy={Y(last.holders)} r={4} fill="var(--buy)" stroke="var(--card)" strokeWidth={2} />
      {series.map((s) => <rect key={s.ts} x={X(s.ts) - 4} y={T} width={8} height={H - T - B} fill="transparent" tabIndex={-1} data-tip={`${new Date(s.ts).toISOString().slice(0, 16).replace("T", " ")} UTC · ${int(s.holders)} holders`} />)}
      <text x={L} y={H - 4}>{new Date(t0).toISOString().slice(0, 10)}</text>
      <text x={W - R} y={H - 4} textAnchor="end">{new Date(t1).toISOString().slice(0, 10)}</text>
    </svg></div>
  );
}
