// The diff: who follows a creator on Farcaster and does not hold their Zora coin.
//
//   tsx scripts/audience.ts <zora-handle|@fc-username> [options]
//
//     --limit N        followers to resolve to wallets (default: all)
//     --top N          people given an exact balance lookup (default 250)
//     --taste N        holders sampled to learn what this audience collects (default 250)
//     --tasteCoins N   co-held coins whose holder lists get pulled (default 15)
//     --tastePages N   pages of each of those (default 150 = the top 3,000 holders)
//     --tasteMaxHolders N  ignore co-held coins bigger than this (default 100000: airdrops, not taste)
//     --budget N       new fids to resolve this run (default 40000); coverage climbs each run
//     --no-db          skip the shared identity index in the sqlite file
//     --cache FILE     reuse or store the resolved follower rows
//     --holderCache F  reuse/store the coin's holder wallets
//     --out FILE       where the JSON goes (default public/audience/<handle>.json)
//
// Why this is buildable at all: a Farcaster profile publishes verified Ethereum addresses, and a
// Zora holder list is a set of Ethereum addresses. That single overlap is what turns "292,000
// followers" into named people. Every call below is free and keyless.
//
// The expensive step is deliberately not per-follower. Ranking wants to know whether someone buys
// Zora coins, and asking that per follower would be ~350,000 calls. Instead the taste map is learnt
// once from a sample of the creator's own holders, the holder lists of the coins they most overlap
// with are pulled whole (tens of calls), and the prospect list falls out as set arithmetic. Only
// the final shortlist costs one call each.
import fs from "node:fs/promises";
import path from "node:path";
import { followers, pool, userData, verifiedAddresses, type UserData } from "./hub";
import { allHolders, coin, coinBalances, profile } from "./zora-public";
import { rank, type Prospect } from "../src/lib/prospects";
import { lookup, save, storedHolders, type Identity } from "../src/lib/fids";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const num = (n: string, d: number) => Number(opt(n, String(d))) || d;
const LIMIT = Number(opt("limit", "0")) || Infinity;
const TASTE_SAMPLE = num("taste", 250), TASTE_COINS = num("tasteCoins", 15), TOP = num("top", 250);
const TASTE_PAGES = num("tastePages", 150);    // 20 holders a page: the top 3,000 of each co-held coin
const TASTE_MAX_HOLDERS = num("tasteMaxHolders", 100_000); // above this a coin is distribution, not taste
const CACHE = opt("cache"), HCACHE = opt("holderCache"), OUT = opt("out");
const BUDGET = num("budget", 40_000);          // new fids resolved per run: the rest wait for the next one
const USE_DB = !args.includes("--no-db");      // the shared identity index in data/coinlens.sqlite
if (!target) { console.error("usage: tsx scripts/audience.ts <zora-handle|@fc-username>"); process.exit(1); }

const log = (...a: unknown[]) => console.log(...a);
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");
const exists = (f: string) => fs.stat(f).then(() => true, () => false);

async function main() {
  const input = target!;
  // ── 1. who ─────────────────────────────────────────────────────────────────────────────────────
  let handle = input.replace(/^@/, "");
  let zora = null as Awaited<ReturnType<typeof profile>>;
  let fcUser = handle;
  if (!input.startsWith("@")) {
    zora = await profile(handle);
    if (zora) { handle = zora.handle; fcUser = zora.socials.farcaster?.username ?? handle; }
  }
  const fcu = (await fetch(`https://api.farcaster.xyz/v2/user-by-username?username=${encodeURIComponent(fcUser)}`)
    .then((r) => r.json()).catch(() => null))?.result?.user;
  if (!fcu) { console.error(`No Farcaster account "@${fcUser}" — a creator with no Farcaster has no follower list to diff.`); process.exit(2); }
  const fid: number = fcu.fid;
  const coinAddr = zora?.coin ?? null;
  const c = coinAddr ? await coin(coinAddr) : null;

  log(`\n=== ${handle} ===`);
  log(`Farcaster @${fcu.username} (fid ${fid}) · api.farcaster.xyz reports ${fcu.followerCount.toLocaleString()} followers`);
  if (zora) log(`Zora @${zora.handle} · its profile claims ${zora.socials.farcaster?.followers?.toLocaleString() ?? "no"} Farcaster followers`);
  log(`Coin ${c ? `$${c.symbol} ${coinAddr} · ${c.holders.toLocaleString()} holders` : "none"}`);

  // ── 2. followers, resolved to wallets ──────────────────────────────────────────────────────────
  type Row = [fid: number, ts: number, addrs: string[], username: string | null, display: string | null, pfp: string | null];
  let resolved: Row[];
  let followersTotal = 0;

  if (CACHE && await exists(CACHE)) {
    // an ad-hoc run against a file someone already crawled
    const j = JSON.parse(await fs.readFile(CACHE, "utf8"));
    resolved = j.rows ?? j;
    followersTotal = j.total ?? resolved.length;
    log(`\nfollowers: ${resolved.length.toLocaleString()} reused from ${CACHE}`);
  } else {
    // the follower list is cheap to walk (about 80s for half a million), so it is never stored
    const t0 = Date.now();
    const fol = await followers(fid, { onPage: (p, n) => { if (p % 50 === 0) log(`  ...${n.toLocaleString()} followers`); } });
    const edges: [number, number][] = [...fol.entries()];
    followersTotal = edges.length;
    log(`followers: ${followersTotal.toLocaleString()} signed follows in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

    // identities: read the shared index first, and pay only for what is missing — bounded, so an
    // hourly run finishes. Coverage climbs each run instead of the job timing out on run one.
    const cached = USE_DB ? lookup(edges.map((e) => e[0])) : new Map<number, Identity>();
    const tsOf = new Map(edges);
    resolved = [...cached.values()].map((i) => [i.fid, tsOf.get(i.fid) ?? 0, i.wallets, i.username, i.display, i.pfp] as Row);
    const missing = edges.filter(([f]) => !cached.has(f)).map(([f]) => f);
    const todo = missing.slice(0, LIMIT === Infinity ? BUDGET : Math.min(BUDGET, LIMIT));
    if (cached.size) log(`  ${cached.size.toLocaleString()} known already · ${missing.length.toLocaleString()} unknown · resolving ${todo.length.toLocaleString()} this run`);
    else log(`resolving ${todo.length.toLocaleString()} of ${missing.length.toLocaleString()} to wallets...`);
    if (todo.length) {
      const t1 = Date.now();
      const fresh: Identity[] = [];
      let done = 0;
      await pool(todo, 28, async (f) => {
        const [addrs, ud] = await Promise.all([verifiedAddresses(f).catch(() => [] as string[]), userData(f).catch((): UserData => ({}))]);
        const id: Identity = { fid: f, username: ud.username ?? null, display: ud.display ?? null, pfp: ud.pfp ?? null, wallets: addrs };
        fresh.push(id);
        resolved.push([f, tsOf.get(f) ?? 0, addrs, id.username, id.display, id.pfp]);
        if (++done % 25_000 === 0) log(`  ${done.toLocaleString()} · ${((Date.now() - t1) / 1000).toFixed(0)}s`);
      });
      if (USE_DB) save(fresh);
      log(`resolved ${todo.length.toLocaleString()} in ${((Date.now() - t1) / 1000).toFixed(0)}s`);
    }
  }

  const byWallet = new Map<string, Row>();
  let withWallet = 0;
  for (const r of resolved) if (r[2]?.length) { withWallet++; for (const a of r[2]) byWallet.set(a, r); }
  log(`  ${withWallet.toLocaleString()} of ${resolved.length.toLocaleString()} (${pct(withWallet, resolved.length)}) publish a verified Ethereum address`);

  // ── 3. holders ─────────────────────────────────────────────────────────────────────────────────
  if (!coinAddr) { console.error("\nNo creator coin on this Zora profile: nothing to diff against."); process.exit(3); }
  let holderSet: Set<string>;
  if (HCACHE && await exists(HCACHE)) {
    holderSet = new Set<string>(JSON.parse(await fs.readFile(HCACHE, "utf8")));
    log(`holders: ${holderSet.size.toLocaleString()} reused from ${HCACHE}`);
  } else {
    const t = Date.now();
    holderSet = (await allHolders(coinAddr, { onPage: (p, n, tot) => { if (p % 50 === 0) log(`  ...${n}/${tot} holders`); } })).wallets;
    log(`holders: ${holderSet.size.toLocaleString()} wallets in ${((Date.now() - t) / 1000).toFixed(0)}s`);
    if (HCACHE) await fs.writeFile(HCACHE, JSON.stringify([...holderSet]));
  }

  // ── 4. the diff ────────────────────────────────────────────────────────────────────────────────
  const alreadyHold = new Set<number>();
  for (const w of holderSet) { const r = byWallet.get(w); if (r) alreadyHold.add(r[0]); }
  const prospectRows = resolved.filter((r) => r[2]?.length && !alreadyHold.has(r[0]));
  log(`\n── the diff ──`);
  log(`followers checked         ${resolved.length.toLocaleString()}${followersTotal > resolved.length ? ` of ${followersTotal.toLocaleString()}` : ""}`);
  log(`with a verified wallet    ${withWallet.toLocaleString()} (${pct(withWallet, resolved.length)})`);
  log(`already hold the coin     ${alreadyHold.size.toLocaleString()} (${pct(alreadyHold.size, withWallet)} of followers with a wallet)`);
  log(`FOLLOW, DO NOT HOLD       ${prospectRows.length.toLocaleString()}`);
  log(`holders who follow        ${alreadyHold.size.toLocaleString()} of ${holderSet.size.toLocaleString()} holders (${pct(alreadyHold.size, holderSet.size)})`);

  // ── 5. taste: what these holders collect, and which prospects collect it too ────────────────────
  const sample = [...holderSet].sort(() => 0.5 - Math.random()).slice(0, TASTE_SAMPLE);
  log(`\nlearning taste from ${sample.length} of this coin's holders...`);
  const freq = new Map<string, { symbol: string | null; n: number }>();
  await pool(sample, 4, async (w) => {
    const b = await coinBalances(w, 30).catch(() => null);
    for (const co of b?.coins ?? []) {
      if (co.address === coinAddr) continue;
      const e = freq.get(co.address) ?? { symbol: co.symbol, n: 0 };
      e.n++; freq.set(co.address, e);
    }
  });
  const bySymbol = new Map<string, { address: string; symbol: string | null; holders: number; total?: number }>();
  for (const [address, v] of [...freq.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const key = (v.symbol ?? address).toLowerCase();       // distinct addresses often share a symbol
    if (!bySymbol.has(key)) bySymbol.set(key, { address, symbol: v.symbol, holders: v.n });
  }
  const taste = [...bySymbol.values()].sort((a, b) => b.holders - a.holders).slice(0, TASTE_COINS);

  // A coin with a million holders is not a taste. Airdropped and farmed tokens turn up in almost
  // everyone's balances, so "you both hold it" says nothing about whether this person buys what
  // this creator makes — it would just float the same mass-distributed wallets to the top of every
  // creator's list. Anything bigger than TASTE_MAX_HOLDERS is dropped before the overlap is taken.
  log(`  most co-held: ${taste.slice(0, 8).map((t) => `${t.symbol}(${t.holders})`).join(" ") || "none"}`);

  // Pulling these holder lists is what prices "same taste" for every prospect at once, so it earns
  // its keep — but done serially it is the slowest step in the run. Four at a time, and each list
  // is capped: the question is whether someone is in it, and the top few thousand settle that.
  const shared = new Map<number, string[]>();
  let tasteMissed = 0;
  const tasteSkipped: { symbol: string | null; holders: number }[] = [];
  await pool(taste, 2, async (t) => {
    // the collector already snapshots the holders of every coin it tracks, and these co-held coins
    // are mostly those same coins: reading the snapshot costs nothing and skips ~150 API calls
    const size = (await coin(t.address).catch(() => null))?.holders ?? 0;
    if (size > TASTE_MAX_HOLDERS) {
      tasteSkipped.push({ symbol: t.symbol, holders: size });
      log(`  ${t.symbol}: ${size.toLocaleString()} holders — too widely held to mean anything, skipped`);
      return;
    }
    t.total = size;
    const stored = USE_DB ? storedHolders(t.address) : null;
    const h = stored
      ? { wallets: stored, total: stored.size, complete: true, stored: true }
      : await allHolders(t.address, { maxPages: TASTE_PAGES }).then((r) => ({ ...r, stored: false })).catch((e) => {
          tasteMissed++;                              // a skipped list is missing evidence, not "no overlap"
          log(`  ${t.symbol}: could not read the holder list (${String(e).slice(0, 60)})`);
          return null;
        });
    if (!h) return;
    let hits = 0;
    for (const w of h.wallets) {
      const r = byWallet.get(w);
      if (!r || alreadyHold.has(r[0])) continue;
      const arr = shared.get(r[0]) ?? [];
      if (t.symbol && !arr.includes(t.symbol)) arr.push(t.symbol);
      shared.set(r[0], arr); hits++;
    }
    log(`  ${t.symbol}: ${h.wallets.size.toLocaleString()}${h.total > h.wallets.size ? ` of ${h.total.toLocaleString()}` : ""} holders${h.stored ? " (from today's snapshot)" : ""}, ${hits.toLocaleString()} follow ${handle} without holding`);
  });
  log(`prospects who already hold a coin this audience holds: ${shared.size.toLocaleString()}${tasteMissed ? ` (${tasteMissed} of ${taste.length} co-held lists unreadable this run — an undercount)` : ""}`);

  // ── 6. rank, price only the shortlist ──────────────────────────────────────────────────────────
  const pre: Prospect[] = prospectRows.map((r) => ({
    fid: r[0], followedAt: r[1], addresses: r[2], username: r[3], display: r[4], pfp: r[5],
    sharedCoins: shared.get(r[0]) ?? [], zoraCoins: 0, zoraUsd: 0, zoraHandle: null,
  }));
  pre.sort((a, b) => b.sharedCoins.length - a.sharedCoins.length || b.followedAt - a.followedAt);
  const shortlist = pre.slice(0, TOP);
  log(`\npricing the top ${shortlist.length} with an exact balance lookup...`);
  await pool(shortlist, 4, async (p) => {
    for (const a of p.addresses.slice(0, 3)) {
      const b = await coinBalances(a, 30).catch(() => null);
      if (!b) continue;
      p.zoraCoins = Math.max(p.zoraCoins, b.count);
      p.zoraUsd += b.usd;
      p.zoraHandle = p.zoraHandle ?? b.handle;
    }
  });
  const ranked = rank(shortlist, { symbol: c?.symbol ?? null, coin: coinAddr, handle });

  log(`\n── top 15 ──`);
  ranked.slice(0, 15).forEach((p, i) => {
    log(`${String(i + 1).padStart(2)}. @${p.username ?? `fid:${p.fid}`}  score ${p.score}`);
    log(`    ${p.reasons.join(" · ")}`);
    log(`    -> ${p.action.label}${p.action.text ? `: "${p.action.text}"` : ""}`);
  });

  const out = {
    handle, fid, fcUsername: fcu.username, coin: coinAddr, symbol: c?.symbol ?? null, image: c?.image ?? null,
    avatar: zora?.avatar ?? null, generatedAt: Date.now(),
    counts: {
      followersTotal, checked: resolved.length, withWallet, holders: holderSet.size,
      alreadyHold: alreadyHold.size, prospects: prospectRows.length, withSharedTaste: shared.size,
      claimedFarcaster: zora?.socials.farcaster?.followers ?? null, apiFollowerCount: fcu.followerCount,
    },
    taste: taste.filter((t) => !tasteSkipped.some((k) => k.symbol === t.symbol)), tasteMissed, tasteSkipped,
    // facts only: the wallet did its job in the diff and is not published, and the score, wording
    // and action are derived at render time so changing them never means crawling again
    top: shortlist.map(({ addresses, ...p }) => p),
  };
  const file = OUT ?? path.join("public", "audience", `${handle}.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(out));
  log(`\nwrote ${file} (${ranked.length} ranked people)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
