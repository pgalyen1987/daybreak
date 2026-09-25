// The Farcaster identity index: fid -> verified wallets, username, avatar.
//
// This is the part that makes the diff possible on an hourly job with no server. Resolving one
// follower costs one call; a creator with 478,000 followers costs 478,000. Nobody can do that
// every hour — but nobody has to do it twice. The index is written once per fid and shared by
// every creator, so the first large account pays for the crowd and the next one mostly reads.
//
// The follower list itself is NOT cached: walking the hub for half a million follows takes about
// eighty seconds, and storing it would add millions of rows to a file that travels between runs.
// Only the expensive half is kept.
import type { Database } from "better-sqlite3";
import { open } from "./db";

export type Identity = { fid: number; username: string | null; display: string | null; pfp: string | null; wallets: string[] };

/** Which of these fids the index already knows, so a run only pays for the rest. */
export function known(fids: number[], d: Database = open()): Set<number> {
  const out = new Set<number>();
  const q = d.prepare("SELECT fid FROM fids WHERE fid = ?");
  for (const f of fids) if (q.get(f)) out.add(f);
  return out;
}

/** Everything the index holds for these fids. */
export function lookup(fids: number[], d: Database = open()): Map<number, Identity> {
  const out = new Map<number, Identity>();
  const meta = d.prepare("SELECT fid, username, display, pfp FROM fids WHERE fid = ?");
  const wal = d.prepare("SELECT address FROM fid_wallets WHERE fid = ?");
  for (const f of fids) {
    const m = meta.get(f) as Omit<Identity, "wallets"> | undefined;
    if (!m) continue;
    out.set(f, { ...m, wallets: (wal.all(f) as { address: string }[]).map((r) => r.address) });
  }
  return out;
}

/** Record a batch of resolved identities. A fid with no wallet is still recorded, so it is not re-asked. */
export function save(rows: Identity[], d: Database = open()) {
  const meta = d.prepare("INSERT INTO fids (fid, username, display, pfp, wallets, checked) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(fid) DO UPDATE SET username = excluded.username, display = excluded.display, pfp = excluded.pfp, wallets = excluded.wallets, checked = excluded.checked");
  const wal = d.prepare("INSERT OR IGNORE INTO fid_wallets (fid, address) VALUES (?, ?)");
  const now = Date.now();
  d.transaction(() => {
    for (const r of rows) {
      meta.run(r.fid, r.username, r.display, r.pfp, r.wallets.length, now);
      for (const a of r.wallets) wal.run(r.fid, a);
    }
  })();
}

/**
 * The holder wallets the collector already stored for a coin today, if it tracks that coin.
 *
 * The follower diff needs the holder lists of the coins its audience co-holds, and those are
 * overwhelmingly the same popular creator coins from one creator to the next — which the hourly
 * collector is already snapshotting. Reading them here instead of re-walking Zora's API is the
 * difference between a step that fits in the hourly run and one that does not. Note the collector
 * only keeps every holder for small coins and the top 500 by balance for large ones, so a hit here
 * is shallower than a fresh crawl: good enough to answer "is this person in it", and an undercount.
 */
export function storedHolders(address: string, d: Database = open()): Set<string> | null {
  const day = (d.prepare("SELECT MAX(day) AS day FROM holder_snapshots WHERE address = ?").get(address) as { day: string | null }).day;
  if (!day) return null;
  const rows = d.prepare("SELECT wallet FROM holder_snapshots WHERE address = ? AND day = ?").all(address, day) as { wallet: string }[];
  return rows.length ? new Set(rows.map((r) => r.wallet)) : null;
}

/** How much of the index is filled in, for the honest coverage line on the page. */
export function indexSize(d: Database = open()) {
  const fids = (d.prepare("SELECT COUNT(*) AS n FROM fids").get() as { n: number }).n;
  const wallets = (d.prepare("SELECT COUNT(*) AS n FROM fid_wallets").get() as { n: number }).n;
  return { fids, wallets };
}
