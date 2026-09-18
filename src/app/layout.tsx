import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { Tooltips } from "@/components/Tooltips";
import { Nav } from "@/components/Nav";
import "./globals.css";

const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display", display: "swap" });
const text = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-text", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

const APP = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP),
  title: { default: "Daybreak: analytics for Zora creator coins", template: "%s | Daybreak" },
  description: "Which creators' audiences haven't found their Zora coin yet, plus holder churn and trading patterns for every creator coin we track. Free, from Zora's own data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand"><b>Day<span>break</span></b><small>for Zora creator coins</small></Link>
            <Nav />
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="foot">
          <div className="wrap">
            <span>Data from the Zora coins API. Not financial advice.</span>
            <Link href="/method">How the numbers work</Link>
            <a href="https://rebelstudiossoftware.com" target="_blank" rel="noopener noreferrer">Built by Rebel Studios</a>
            <span>Not affiliated with Zora.</span>
          </div>
        </footer>
        <Tooltips />
      </body>
    </html>
  );
}
