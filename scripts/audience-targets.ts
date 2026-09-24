// Which creators the hourly run should build a follower diff for: the tracked coins whose creator
// has a Farcaster account, largest audience first. Prints one handle a line for the workflow loop.
//
//   tsx scripts/audience-targets.ts [count]
import { open } from "../src/lib/db";

const n = Number(process.argv[2] || 5);
const rows = open().prepare(`
  SELECT c.creator_handle AS handle, so.farcaster AS followers
  FROM coins c
  JOIN social_snapshots so ON so.handle = c.creator_handle
   AND so.ts = (SELECT MAX(ts) FROM social_snapshots WHERE handle = c.creator_handle)
  WHERE c.coin_type = 'CREATOR' AND c.creator_handle IS NOT NULL
    AND so.farcaster_user IS NOT NULL AND so.farcaster > 0
  GROUP BY c.creator_handle
  ORDER BY so.farcaster DESC
  LIMIT ?`).all(n) as { handle: string; followers: number }[];

for (const r of rows) console.log(r.handle);
if (!rows.length) console.error("no tracked creator has a linked Farcaster account yet");
