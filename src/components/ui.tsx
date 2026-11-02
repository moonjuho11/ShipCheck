import type { ReactNode } from "react";
import type { Severity } from "@/scanner/types";

/** Firecrawl-style mono label: [ 01 / 07 ] · WHAT WE CHECK */
export function BracketLabel({ index, total, children, className = "" }: { index?: number; total?: number; children: ReactNode; className?: string }) {
  return (
    <div className={`label-mono flex items-center gap-2 ${className}`}>
      {index !== undefined && (
        <span>
          [ <span className="text-signal">{String(index).padStart(2, "0")}</span>
          {total !== undefined && <span className="text-ink-4"> / {String(total).padStart(2, "0")}</span>} ]
        </span>
      )}
      {index !== undefined && <span className="text-ink-4">·</span>}
      <span>{children}</span>
    </div>
  );
}

/** A small "+" registration mark used on grid intersections. */
export function Cross({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 11 11" className={`h-[11px] w-[11px] text-ink-4 ${className}`} aria-hidden>
      <path d="M5.5 0v11M0 5.5h11" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** Page section framed by vertical rails with crosshair marks at the top corners. */
export function Section({ children, className = "", id, rails = true }: { children: ReactNode; className?: string; id?: string; rails?: boolean }) {
  return (
    <section id={id} className={`relative ${rails ? "border-t border-line" : ""}`}>
      <div className={`relative mx-auto max-w-6xl ${rails ? "border-x border-line" : ""} ${className}`}>
        {rails && (
          <>
            <Cross className="absolute -top-[6px] -left-[6px] hidden sm:block" />
            <Cross className="absolute -top-[6px] -right-[6px] hidden sm:block" />
          </>
        )}
        {children}
      </div>
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export const SEV: Record<Severity, { label: string; color: string; text: string; bg: string; ring: string }> = {
  critical: { label: "Critical", color: "#ff5c5c", text: "text-crit", bg: "bg-crit/10", ring: "ring-crit/25" },
  high: { label: "High", color: "#ff9a3d", text: "text-high", bg: "bg-high/10", ring: "ring-high/25" },
  medium: { label: "Medium", color: "#f2cf4a", text: "text-med", bg: "bg-med/10", ring: "ring-med/25" },
  low: { label: "Low", color: "#5eb0ff", text: "text-low", bg: "bg-low/10", ring: "ring-low/25" },
};

/** Linear-style priority glyph: filled bars for severity. */
export function SeverityIcon({ severity, className = "h-4 w-4" }: { severity: Severity; className?: string }) {
  const c = SEV[severity].color;
  if (severity === "critical") {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-label="Critical">
        <rect x="1" y="1" width="14" height="14" rx="3.5" fill={c} />
        <path d="M8 4.2v4.6" stroke="#160606" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="11.4" r="1.05" fill="#160606" />
      </svg>
    );
  }
  const filled = severity === "high" ? 3 : severity === "medium" ? 2 : 1;
  return (
    <svg viewBox="0 0 16 16" className={className} aria-label={SEV[severity].label}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 4.5} y={10 - i * 3.5} width="3" height={4 + i * 3.5} rx="1" fill={i < filled ? c : "rgb(255 255 255 / 0.14)"} />
      ))}
    </svg>
  );
}

export function SeverityTag({ severity }: { severity: Severity }) {
  const s = SEV[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.bg} ${s.text} ${s.ring}`}>
      <SeverityIcon severity={severity} className="h-3 w-3" />
      {s.label}
    </span>
  );
}

export function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function ArrowRight({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
}

export function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m3.5 8.5 3 3 6-7" /></svg>;
}

export function LockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="3" y="7" width="10" height="7" rx="1.6" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>;
}
