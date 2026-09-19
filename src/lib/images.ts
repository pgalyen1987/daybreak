// Coin art comes from Zora's image CDN, which resizes on request: the API hands out 600px previews,
// and a 40px avatar at that size would cost the leaderboard megabytes. Asking the CDN for twice the
// displayed size keeps them sharp on high-density screens at a few KB each.
export function thumb(url: string | null | undefined, px: number): string | null {
  if (!url) return null;
  if (/choicecdn\.com\/-\/rs:fit:\d+:\d+\//.test(url)) return url.replace(/rs:fit:\d+:\d+/, `rs:fill:${px * 2}:${px * 2}`);
  return url;
}
