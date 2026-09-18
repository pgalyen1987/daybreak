// Runs the collector on a schedule next to the web server:
//   every hour at :05   snapshots + swaps
//   daily at 02:20 UTC  holder sets (churn is day-over-day)
// Each run is a child process, so a slow or failed run never takes the site down, and runs never overlap.
import { spawn } from "node:child_process";

let busy = false;
function run(mode: string) {
  if (busy) { console.log(`[scheduler] skip ${mode}: previous run still going`); return; }
  busy = true;
  const t0 = Date.now();
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/collect.ts", mode], { stdio: "inherit", env: process.env });
  child.on("exit", (code) => { busy = false; console.log(`[scheduler] ${mode} exited ${code} after ${Math.round((Date.now() - t0) / 1000)}s`); });
}

let lastHour = -1, lastDay = "";
function tick() {
  const now = new Date();
  const hourKey = now.getUTCHours();
  const day = now.toISOString().slice(0, 10);
  if (now.getUTCMinutes() >= 5 && hourKey !== lastHour) { lastHour = hourKey; run("snapshots"); setTimeout(() => run("swaps"), 90_000); }
  if (now.getUTCHours() === 2 && now.getUTCMinutes() >= 20 && day !== lastDay) { lastDay = day; setTimeout(() => run("holders"), 5 * 60_000); }
}

console.log("[scheduler] started");
if (process.env.COLLECT_ON_BOOT !== "0") run("all"); // fill an empty volume right away
setInterval(tick, 60_000);
