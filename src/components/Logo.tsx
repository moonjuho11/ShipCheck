/** ShipCheck mark: a launch arrow that resolves into a check. */
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sc-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cf5b7" />
          <stop offset="1" stopColor="#22c773" />
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6.5" fill="#101113" stroke="rgb(255 255 255 / 0.14)" strokeWidth="1.5" />
      <path d="M6.5 12.6 10.3 16.3 17.6 7.7" fill="none" stroke="url(#sc-g)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
