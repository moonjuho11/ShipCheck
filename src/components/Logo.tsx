/**
 * ShipCheck mark: a solid rounded square cut by two slits — one from the right,
 * one from the left — which leaves a stepped "S". One path, monochrome, works at 16px.
 */
export const LOGO_PATH =
  "M9.5 3h13A6.5 6.5 0 0 1 29 9.5v13a6.5 6.5 0 0 1-6.5 6.5h-13A6.5 6.5 0 0 1 3 22.5v-13A6.5 6.5 0 0 1 9.5 3Z" +
  "M11 9.6h18V13H11Z" +
  "M3 19h18v3.4H3Z";

export function Logo({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d={LOGO_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
      <Logo />
      ShipCheck
    </span>
  );
}
