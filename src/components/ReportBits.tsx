import type { Severity } from "@/scanner/types";

export const SEV_STYLE: Record<Severity, { pill: string; dot: string; ring: string; text: string }> = {
  critical: { pill: "bg-red-50 text-red-700 ring-red-600/20", dot: "bg-red-500", ring: "border-red-200", text: "text-red-700" },
  high: { pill: "bg-orange-50 text-orange-700 ring-orange-600/20", dot: "bg-orange-500", ring: "border-orange-200", text: "text-orange-700" },
  medium: { pill: "bg-amber-50 text-amber-800 ring-amber-600/20", dot: "bg-amber-400", ring: "border-amber-200", text: "text-amber-800" },
  low: { pill: "bg-sky-50 text-sky-700 ring-sky-600/20", dot: "bg-sky-400", ring: "border-sky-200", text: "text-sky-700" },
};

export function SeverityPill({ severity }: { severity: Severity }) {
  const s = SEV_STYLE[severity];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${s.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{severity}</span>;
}

export function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums text-slate-900">{score}</span>
        <span className="text-xs font-medium text-slate-500">out of 100</span>
      </div>
    </div>
  );
}

export function ReadyBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path d="M10 1.7 3.3 4.4v5.1c0 4.3 2.8 7.4 6.7 8.8 3.9-1.4 6.7-4.5 6.7-8.8V4.4L10 1.7Zm-1 11.6L5.8 10l1.1-1.1L9 11l4.2-4.2 1.1 1.1L9 13.3Z" /></svg>
      Production Ready
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3.5 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path d="M10 1.7a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6Zm.9 12.5H9.1v-1.8h1.8v1.8Zm0-3.4H9.1V5.6h1.8v5.2Z" /></svg>
      Not ready to launch yet
    </span>
  );
}

export function CountTiles({ counts }: { counts: Record<Severity, number> }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
        <div key={s} className={`rounded-xl border bg-white px-3 py-2 text-center ${SEV_STYLE[s].ring}`}>
          <div className={`text-2xl font-bold tabular-nums ${counts[s] ? SEV_STYLE[s].text : "text-slate-300"}`}>{counts[s]}</div>
          <div className="text-xs font-medium capitalize text-slate-500">{s}</div>
        </div>
      ))}
    </div>
  );
}
