/**
 * ShipCheck mark: a stepped "S" — three blocks joined at their corners like a
 * staircase — leaning forward 10°. Monochrome; reads down to 16px.
 */
const BLOCKS = "M3 3H29V10H3ZM3 10H9V13H3ZM9 13H23V19H9ZM23 19H29V22H23ZM3 22H29V29H3Z";
const ROUNDED = "M9 3H23A6 6 0 0 1 29 9V23A6 6 0 0 1 23 29H9A6 6 0 0 1 3 23V9A6 6 0 0 1 9 3Z";
const LEAN = "translate(16 16) skewX(-10) translate(-16 -16)";

/** Standalone SVG markup (favicon, brand exports). */
export function logoSvg(fill: string, extra = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${extra}<clipPath id="sc-logo"><path d="${ROUNDED}"/></clipPath><g transform="${LEAN}"><path clip-path="url(#sc-logo)" fill="${fill}" d="${BLOCKS}"/></g></svg>`;
}

export function Logo({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {/* Every instance uses identical geometry, so a shared id is safe. */}
      <clipPath id="sc-logo"><path d={ROUNDED} /></clipPath>
      <g transform={LEAN}>
        <path clipPath="url(#sc-logo)" fill="currentColor" d={BLOCKS} />
      </g>
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
