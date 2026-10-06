// Each coin's share card, written at build time to /coin/<address>/card.png: when someone shares a
// coin page, the preview carries that coin's own numbers instead of the site-wide card. A route
// (not opengraph-image.tsx) so the static export writes a real .png: Pages serves extension-less
// files as octet-stream, which link-preview crawlers refuse. The drawing is in lib/card.tsx.
import { coinCard } from "@/lib/card";
import { allCoins } from "@/lib/queries";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return allCoins().map((c) => ({ address: c.address }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  return coinCard((await params).address, 630);
}
