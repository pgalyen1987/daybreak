// Exits 1 when the payouts on /rewards are more than 3 hours behind Base. The hourly workflow runs it
// last, after the site has shipped: on 2026-10-05 the rewards reader failed every hour from 14:50 UTC
// while each run passed, because a failed read only warns. Run: DATA_DIR=... npx tsx scripts/rewards-fresh.ts
import { readerStale, STALE_AFTER_MS } from "../src/lib/rewards";
import { rewardsReadTo } from "../src/lib/zora-queries";

const readTo = rewardsReadTo();
const at = readTo == null ? "never" : new Date(readTo).toISOString().slice(0, 16).replace("T", " ") + " UTC";
if (readerStale(readTo, Date.now())) {
  console.log(`::error::Trading-reward payouts are read up to ${at}, more than ${STALE_AFTER_MS / 3_600_000} hours behind Base, so /rewards is stale. See the Collect step's rewards log.`);
  process.exit(1);
}
console.log(`rewards: payouts read up to ${at}`);
