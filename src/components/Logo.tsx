/** Daybreak's mark: a sun half-risen over the horizon, lit like Zora's orb (warm top, Zora blue below). */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id="db-orb" cx="38%" cy="42%" r="78%">
          <stop offset="0" stopColor="#fff1d6" />
          <stop offset=".38" stopColor="#ff9d6e" />
          <stop offset=".68" stopColor="#f25ca8" />
          <stop offset="1" stopColor="#3b5bff" />
        </radialGradient>
        <clipPath id="db-sky"><rect width="24" height="17.2" /></clipPath>
      </defs>
      <circle cx="12" cy="15.5" r="9.5" fill="url(#db-orb)" clipPath="url(#db-sky)" />
      <rect x="1.5" y="18.6" width="21" height="2.2" rx="1.1" fill="currentColor" />
    </svg>
  );
}
