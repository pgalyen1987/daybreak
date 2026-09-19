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
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
};
export default nextConfig;
