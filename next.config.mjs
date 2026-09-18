/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // better-sqlite3 is a native module; keep it out of the server bundle.
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
};
export default nextConfig;
