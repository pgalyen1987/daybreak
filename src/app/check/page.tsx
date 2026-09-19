import type { Metadata } from "next";
import { CoinCheck } from "@/components/CoinCheck";
import { medianPer1000, per1000Text } from "@/lib/advice";
import { miniappMeta } from "@/lib/embed";
import { allCoins } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Check your coin",
  description: "Enter a Zora handle: its linked audience against its creator coin's holders, how that compares with Zora's top creators, and what to do next.",
  alternates: { canonical: "/check/" },
  other: miniappMeta("/embed.png", "/check/", "Check your coin"),
};

// The median is fixed at build time (hourly) from the coins Daybreak tracks; the lookup itself
// runs in the visitor's browser against Zora's public API, so it covers any creator.
export default function CheckPage() {
  const coins = allCoins();
  const median = medianPer1000(coins);
  return (
    <>
      <section>
        <p className="kicker">For creators</p>
        <h1>How much of your audience holds your coin?</h1>
        <p className="lede">
          Enter your Zora handle to see your followers next to your holders, how that compares with Zora&apos;s top creators
          (a median of {per1000Text(median)} holders per 1,000 followers), and the next step that fits your numbers.
        </p>
      </section>
      <CoinCheck medianPer1000={median} tracked={coins.map((c) => c.address)} />
    </>
  );
}
