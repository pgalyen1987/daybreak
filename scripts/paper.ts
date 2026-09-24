// Paper-trade the Zora screen, honestly, until it has earned the right to touch real money.
//
// The owner's bar is "prove it makes money". This is the proof harness, and it is built so that a
// flattering result is hard to produce by accident:
//
//   * ENTRY AND EXIT ARE REAL QUOTES, not list prices. A buy quote says how many coins $20 of ETH
//     actually gets; a sell quote of exactly that many coins says what comes back. Fees, spread
//     and our own price impact are therefore inside every number, in both directions. Marking a
//     position at the last trade price - which is what a price feed gives you - would quietly
//     book the 2-25% round trip as profit.
//   * THE JOURNAL IS APPEND-ONLY. Nothing is ever rewritten, so a losing signal cannot be tidied
//     away later, and the file is the whole evidence.
//   * NO EXIT RULE IS COMMITTED TO YET. Each open signal is re-marked on every scan, so what
//     accumulates is a price PATH. Any holding rule can then be tested against the same recorded
//     data afterwards, instead of picking the rule that happens to flatter the first few trades.
//
//   tsx scripts/paper.ts scan      # screen, open new signals, re-mark every open one
//   tsx scripts/paper.ts report    # what the record says so far
import * as fs from "fs";
import * as path from "path";
import { screen, buyQuote, sellQuote, DEFAULTS, type Candidate } from "../src/lib/zora-screen";

const BOOK = process.env.ZORA_BOOK ?? path.join(process.env.HOME ?? ".", "trader", "zora_paper.jsonl");
const SIZE_USD = Number(process.env.SIZE_USD ?? 20);
const ETH_USD = Number(process.env.ETH_USD ?? 2648);
/** Don't re-enter a coin we already hold an open signal in. */
const REENTRY_MS = 24 * 3600e3;
/** Stop marking a signal after this long; it is decided by then. */
const MAX_AGE_MS = 48 * 3600e3;

type Rec = Record<string, any> & { k: string; t: number };

function read(): Rec[] {
  try {
    return fs.readFileSync(BOOK, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

function append(r: Rec) {
  fs.mkdirSync(path.dirname(BOOK), { recursive: true });
  fs.appendFileSync(BOOK, JSON.stringify(r) + "\n");
}

async function scan() {
  const now = Date.now();
  const book = read();
  const wei = BigInt(Math.floor((SIZE_USD / ETH_USD) * 1e18));

  // ---- re-mark every still-live signal first, so a scan that later throws still records marks
  const opens = book.filter((r) => r.k === "open");
  let marked = 0;
  for (const o of opens) {
    if (now - o.t > MAX_AGE_MS) continue;
    const back = await sellQuote(o.coin, BigInt(o.coins));
    if (back == null) continue;
    append({ k: "mark", t: now, coin: o.coin, openT: o.t, backWei: back.toString(),
             pnlPct: Number(back) / Number(BigInt(o.entryWei)) - 1 });
    marked++;
  }

  // ---- then look for anything new
  const { rows, cut, scanned } = await screen({ ...DEFAULTS, sizeUsd: SIZE_USD }, ETH_USD);
  append({ k: "scan", t: now, scanned, found: rows.length, cut, marked });

  let opened = 0;
  for (const r of rows as Candidate[]) {
    const held = opens.find((o) => o.coin === r.addr && now - o.t < REENTRY_MS);
    if (held) continue;
    const coins = await buyQuote(r.addr, wei);
    if (!coins || coins === 0n) continue;
    append({ k: "open", t: now, coin: r.addr, sym: r.sym, entryWei: wei.toString(),
             coins: coins.toString(), sizeUsd: SIZE_USD, cost: r.cost, move: r.move,
             buyShare: r.buyShare, mc: r.mc, realUsd: r.realUsd, wallets: r.wallets });
    opened++;
  }
  console.log(`${new Date(now).toISOString().slice(0, 16)}  scanned ${scanned}, ` +
              `signals ${rows.length}, opened ${opened}, re-marked ${marked}  ` +
              `rejects ${JSON.stringify(cut)}`);
  for (const r of rows as Candidate[]) {
    console.log(`   ${r.sym.slice(0, 16).padEnd(16)} move ${(r.move * 100).toFixed(0)}%  ` +
                `round trip ${(r.cost * 100).toFixed(1)}%  mcap $${r.mc.toFixed(0)}`);
  }
}

function report() {
  const book = read();
  const scans = book.filter((r) => r.k === "scan");
  const opens = book.filter((r) => r.k === "open");
  const marks = book.filter((r) => r.k === "mark");
  if (!scans.length) { console.log("no scans recorded yet"); return; }

  const first = scans[0].t, last = scans[scans.length - 1].t;
  const hours = (last - first) / 3600e3;
  console.log(`${scans.length} scans over ${hours.toFixed(1)}h, ${opens.length} signals, ${marks.length} marks`);
  console.log(`signal rate: ${(opens.length / Math.max(hours, 1e-9)).toFixed(2)}/hour\n`);
  if (!opens.length) {
    const tot: Record<string, number> = {};
    for (const s of scans) for (const [k, v] of Object.entries(s.cut ?? {})) tot[k] = (tot[k] ?? 0) + (v as number);
    console.log("nothing has fired. cumulative rejection reasons:", JSON.stringify(tot));
    console.log("\nThat is a result, not a bug - but if one stage holds ~everything, it is the");
    console.log("threshold to question first.");
    return;
  }

  // What every candidate exit rule needs: the path, not a single later price.
  console.log("signal                 age   best    worst    last   (net of the real round trip)");
  const finals: number[] = [];
  for (const o of opens) {
    const ms = marks.filter((m) => m.coin === o.coin && m.openT === o.t).sort((a, b) => a.t - b.t);
    if (!ms.length) { console.log(`${String(o.sym).slice(0, 18).padEnd(18)}  (no marks yet)`); continue; }
    const p = ms.map((m) => m.pnlPct as number);
    const age = (ms[ms.length - 1].t - o.t) / 3600e3;
    finals.push(p[p.length - 1]);
    console.log(`${String(o.sym).slice(0, 18).padEnd(18)} ${age.toFixed(1).padStart(5)}h ` +
                `${(Math.max(...p) * 100).toFixed(1).padStart(7)}% ${(Math.min(...p) * 100).toFixed(1).padStart(7)}% ` +
                `${(p[p.length - 1] * 100).toFixed(1).padStart(7)}%`);
  }
  if (finals.length) {
    const wins = finals.filter((x) => x > 0).length;
    const mean = finals.reduce((a, b) => a + b, 0) / finals.length;
    console.log(`\nheld-to-last-mark: ${wins}/${finals.length} positive, mean ${(mean * 100).toFixed(2)}%`);
    console.log(`on $${SIZE_USD} a trade that is $${(mean * SIZE_USD).toFixed(2)} per signal`);
    console.log("\nThis is a paper record of real quotes. It is NOT yet evidence of an edge:");
    console.log("a handful of signals over a couple of days is a sample, not a result.");
  }
}

const mode = process.argv[2] ?? "scan";
(mode === "report" ? Promise.resolve(report()) : scan()).catch((e) => { console.error(e); process.exit(1); });
