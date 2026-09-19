// Each coin's share card, written at build time to /coin/<address>/embed.png: the 3:2 card a Farcaster
// cast shows for a coin page (the mini-app embed), with that coin's own numbers. A route
// (not opengraph-image.tsx) so the static export writes a real .png: Pages serves extension-less
// files as octet-stream, which link-preview crawlers refuse. The drawing is in lib/card.tsx.
import { coinCard } from "@/lib/card";
import { allCoins } from "@/lib/queries";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return allCoins().map((c) => ({ address: c.address }));
}

export function GET(_req: Request, { params }: { params: { address: string } }) {
  return coinCard(params.address, 800);
}
