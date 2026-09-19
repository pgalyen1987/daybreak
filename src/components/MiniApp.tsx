"use client";
// Inside a Farcaster or Base app, Daybreak opens as a mini app: the client shows its splash until
// the page says it's ready. The SDK only loads when the page is framed (web clients) or in a
// native webview, so a plain visit never downloads it.
import { useEffect } from "react";

export function MiniApp() {
  useEffect(() => {
    const framed = window.self !== window.top || "ReactNativeWebView" in window;
    if (!framed) return;
    import("@farcaster/miniapp-sdk")
      .then(async ({ sdk }) => { if (await sdk.isInMiniApp()) await sdk.actions.ready(); })
      .catch(() => {});
  }, []);
  return null;
}
