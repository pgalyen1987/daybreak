import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Link from "next/link";
import { Tooltips } from "@/components/Tooltips";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { MiniApp } from "@/components/MiniApp";
import { Analytics } from "@/components/Analytics";
import { miniappMeta } from "@/lib/embed";
import "./globals.css";

// Geist: the closest open grotesk to Zora's own type, so Daybreak reads as part of the same world.

const APP = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP),
  title: { default: "Daybreak: analytics for Zora creator coins", template: "%s | Daybreak" },
  description: "Which creators' audiences haven't found their Zora coin yet, plus holder churn and trading patterns for every creator coin we track. Free, from Zora's own data.",
  // the gap map itself, drawn from the data by scripts/og-card.ts
  openGraph: { images: [{ url: "/og.png", width: 1200, height: 630, alt: "Daybreak's gap map of Zora creator coins" }], siteName: "Daybreak" },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  // A cast linking the site shows the 3:2 gap-map card with a button that opens it as a mini app;
  // coin pages set their own (lib/embed.ts).
  other: miniappMeta("/embed.png", "/"),
};

// browser chrome matches the page in either theme
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <MiniApp />
        <Analytics />
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand"><Logo /><b>Daybreak</b><small>for Zora creator coins</small></Link>
            <Nav />
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="foot">
          <div className="wrap">
            <span>Data from the Zora coins API. Not financial advice.</span>
            <Link href="/method">How the numbers work</Link>
            <a href="https://rebelstudiossoftware.com" target="_blank" rel="noopener noreferrer">Built by Rebel Studios</a>
            <a href="https://rebelstudiossoftware.com/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
            <span>Not affiliated with Zora.</span>
          </div>
        </footer>
        <Tooltips />
      </body>
    </html>
  );
}
