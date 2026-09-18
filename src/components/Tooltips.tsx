"use client";
import { useEffect, useRef } from "react";

/** One tooltip for every chart: any element with data-tip shows it on hover or keyboard focus. */
export function Tooltips() {
  const tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tip.current!;
    const show = (text: string, x: number, y: number) => {
      el.textContent = text; el.hidden = false;
      el.style.left = Math.max(8, Math.min(x + 12, window.innerWidth - el.offsetWidth - 8)) + "px";
      el.style.top = y + 14 + "px";
    };
    const hide = () => { el.hidden = true; };
    const target = (e: Event) => (e.target as Element | null)?.closest?.("[data-tip]") as HTMLElement | null;
    const move = (e: MouseEvent) => { const t = target(e); if (t) show(t.dataset.tip!, e.clientX, e.clientY); else hide(); };
    const focus = (e: FocusEvent) => { const t = target(e); if (t) { const r = t.getBoundingClientRect(); show(t.dataset.tip!, r.right, r.top); } };
    document.addEventListener("mousemove", move);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("focusin", focus); document.removeEventListener("focusout", hide); };
  }, []);
  return <div ref={tip} className="tip" hidden role="status" />;
}
