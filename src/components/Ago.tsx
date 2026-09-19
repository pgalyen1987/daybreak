"use client";
import { useEffect, useState } from "react";
import { ago } from "@/lib/format";

/** "12 min ago", worked out in the reader's browser: the page itself is built once an hour. */
export function Ago({ ts }: { ts: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    tick(1);
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return <time dateTime={new Date(ts).toISOString()} suppressHydrationWarning>{ago(ts)}</time>;
}
