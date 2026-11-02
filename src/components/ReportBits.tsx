import type { Severity } from "@/scanner/types";
import { SEV, SeverityIcon } from "./ui";

export function scoreColor(score: number) {
  return score >= 80 ? "#3ee88f" : score >= 50 ? "#f2cf4a" : "#ff5c5c";
}

/** Thin ring with a soft glow in the score's colour. */
export function ScoreRing({ score, size = 148 }: { score: number; size?: number }) {
  const r = 54, c = 2 * Math.PI * r, color = scoreColor(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div aria-hidden className="absolute inset-4 rounded-full blur-2xl" style={{ background: color, opacity: 0.18 }} />
      <svg viewBox="0 0 120 120" className="relative h-full w-full -rotate-90 overflow-visible">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="4" />
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * 2 * Math.PI;
          return <line key={i} x1={60 + 46 * Math.cos(a)} y1={60 + 46 * Math.sin(a)} x2={60 + 48 * Math.cos(a)} y2={60 + 48 * Math.sin(a)} stroke="rgb(255 255 255 / 0.12)" strokeWidth="0.6" />;
        })}
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${Math.max(0.5, (score / 100) * c)} ${c}`} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[44px] leading-none font-medium tracking-tighter text-ink tabular-nums">{score}</span>
        <span className="mt-1 font-mono text-[10px] tracking-widest text-ink-4">/ 100</span>
      </div>
    </div>
  );
}

export function ReadyBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-signal/10 px-3 py-1 text-[13px] font-medium text-signal ring-1 ring-signal/30 ring-inset">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M8 1.5 2.8 3.6v4c0 3.3 2.2 5.6 5.2 6.9 3-1.3 5.2-3.6 5.2-6.9v-4L8 1.5Z" /><path d="m5.6 8 1.7 1.7 3.2-3.4" strokeLinecap="round" /></svg>
      Production Ready
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full bg-crit/10 px-3 py-1 text-[13px] font-medium text-crit ring-1 ring-crit/30 ring-inset">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-crit" />
      Not ready to launch yet
    </span>
  );
}

export function CountTiles({ counts }: { counts: Record<Severity, number> }) {
  return (
    <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-line bg-line">
      {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
        <div key={s} className="bg-panel px-3 py-2.5">
          <div className="flex items-center gap-1.5"><SeverityIcon severity={s} className="h-3 w-3" /><span className="text-[11px] text-ink-3">{SEV[s].label}</span></div>
          <div className={`mt-1 text-2xl font-medium tracking-tight tabular-nums ${counts[s] ? "text-ink" : "text-ink-4"}`}>{counts[s]}</div>
        </div>
      ))}
    </div>
  );
}
