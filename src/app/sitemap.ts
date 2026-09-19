import type { MetadataRoute } from "next";
import { allCoins } from "@/lib/queries";

// Written at build time like every page, so it always lists exactly the coins that have pages.
const APP = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const built = new Date();
  return [
    { url: `${APP}/`, lastModified: built, changeFrequency: "hourly", priority: 1 },
    { url: `${APP}/leaderboard/`, lastModified: built, changeFrequency: "hourly", priority: 0.8 },
    { url: `${APP}/check/`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${APP}/rewards/`, lastModified: built, changeFrequency: "hourly", priority: 0.8 },
    { url: `${APP}/tags/`, lastModified: built, changeFrequency: "hourly", priority: 0.7 },
    { url: `${APP}/method/`, changeFrequency: "monthly", priority: 0.4 },
    // No lastmod on coin pages: it would only record the hourly rebuild, and IndexNow (which reads
    // this file daily) would resend all of them every day. New coins still get submitted once.
    ...allCoins().map((c) => ({ url: `${APP}/coin/${c.address}/`, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
