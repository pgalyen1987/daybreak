import type { MetadataRoute } from "next";

// Makes Daybreak installable as an app (Chrome and Edge offer "Install" in the address bar; on a
// phone, "Add to Home Screen"). The Farcaster mini app is separate: public/.well-known once signed.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daybreak: analytics for Zora creator coins",
    short_name: "Daybreak",
    description: "Where each Zora creator's audience is, what their coin earns, and what to do next.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
