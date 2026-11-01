export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0f172a" />
      <path d="M16 6.5 8.5 9.6v6c0 4.9 3.2 8.6 7.5 9.9 4.3-1.3 7.5-5 7.5-9.9v-6L16 6.5Z" fill="#10b981" />
      <path d="m12.4 16.2 2.6 2.6 4.8-5.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
