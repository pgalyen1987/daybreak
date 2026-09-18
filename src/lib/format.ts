export const compact = (n: number) =>
  (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(Math.round(n))).replace(/\.0(?=[KM])/, "");
export const usd = (n: number) => "$" + (n >= 1e5 ? compact(n) : Math.round(n).toLocaleString("en-US"));
export const int = (n: number) => Math.round(n).toLocaleString("en-US");
export const pct = (x: number, digits = 0) => (x * 100).toFixed(digits) + "%";
export const PLATFORM: Record<string, string> = { twitter: "X", farcaster: "Farcaster", instagram: "Instagram", tiktok: "TikTok" };
export const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
export const zoraUrl = (address: string) => `https://zora.co/coin/base:${address}`;
