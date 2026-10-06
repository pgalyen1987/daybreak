/** @type {import('next').NextConfig} */
// Static export: the site is plain files on GitHub Pages, rebuilt every hour by the collector
// workflow (.github/workflows/daybreak.yml) from the SQLite file it keeps between runs.
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // better-sqlite3 is a native module; keep it out of the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Next 15 renders 8 pages at once per worker (14 rendered one). Each coin's two share images fetch
  // the coin's art from Zora's CDN with an 8 s limit, and at 8 at once a cold build lost the art on 9
  // to 15 more cards than Next 14 did. One at a time, as before.
  experimental: { staticGenerationMaxConcurrency: 1 },
};
export default nextConfig;
