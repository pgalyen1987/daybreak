import type { MetadataRoute } from "next";
import { allCoins } from "@/lib/queries";

// Written at build time like every page, so it always lists exactly the coins that have pages.
const APP = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const built = new Date();
  return [
    { url: `${APP}/`, lastModified: built, changeFrequency: "hourly", priority: 1 },
    { url: `${APP}/leaderboard/`, lastModified: built, changeFrequency: "hourly", priority: 0.8 },
    { url: `${APP}/method/`, changeFrequency: "monthly", priority: 0.4 },
    ...allCoins().map((c) => ({ url: `${APP}/coin/${c.address}/`, lastModified: built, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
