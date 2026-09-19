import { thumb } from "@/lib/images";

/** A coin's art as a rounded square, the way Zora lists coins. Without art, its initial on a tint
 *  taken from the address, so the same coin always gets the same colour. Decorative: the name sits
 *  beside it. */
export function CoinAvatar({ src, label, address, size = 32 }: { src: string | null | undefined; label: string; address: string; size?: number }) {
  const url = thumb(src, size);
  const hue = parseInt(address.slice(2, 8), 16) % 360;
  // the initial sits underneath: art that fails to load later leaves it showing, not an empty box
  return (
    <span className="avatar ph" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 50% 32%)` }}>
      {label.replace(/^[@$#]/, "").slice(0, 1).toUpperCase() || "?"}
      {url && <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" />}
    </span>
  );
}
