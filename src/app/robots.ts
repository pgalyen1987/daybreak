import type { MetadataRoute } from "next";

const APP = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
// a static export needs metadata routes marked static (Next 15 refuses the build otherwise)
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }], sitemap: `${APP}/sitemap.xml` };
}
