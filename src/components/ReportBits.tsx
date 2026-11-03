import type { Severity } from "@/scanner/types";
import { SEV, SeverityIcon } from "./ui";

/** The score as plain type: a large number with its scale. */
export function ScoreFigure({ score, size = "lg" }: { score: number; size?: "lg" | "xl" }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`font-semibold tracking-tight text-ink tabular-nums ${size === "xl" ? "text-7xl" : "text-6xl"}`}>{score}</span>
      <span className="text-lg text-ink-4">/ 100</span>
    </div>
  );
}

/** Verdict stated in words — no pill, no dot. */
export function ReadyBadge({ ready }: { ready: boolean }) {
  return (
    <div>
      <p className="eyebrow">Verdict</p>
      <p className="mt-1 text-[17px] font-semibold text-ink">{ready ? "Production ready" : "Not ready to launch"}</p>
    </div>
  );
}

export function CountTiles({ counts }: { counts: Record<Severity, number> }) {
  return (
    <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-line bg-line">
      {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
        <div key={s} className="bg-panel px-3 py-2.5">
          <div className="flex items-center gap-1.5"><SeverityIcon severity={s} className="h-3 w-3" /><span className="text-[12px] text-ink-3">{SEV[s].label}</span></div>
          <div className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${counts[s] ? "text-ink" : "text-ink-4"}`}>{counts[s]}</div>
        </div>
      ))}
    </div>
  );
}

/** "3 issues" / "Passed" / "Not checked" — neutral text, sans, no colour coding. */
export function AreaStatus({ count, checked = true, partial = false }: { count: number; checked?: boolean; partial?: boolean }) {
  if (!checked) return <span className="text-[13px] text-ink-4">Not checked</span>;
  if (count === 0) return <span className="text-[13px] text-ink-4">{partial ? "Not fully checked" : "Passed"}</span>;
  return <span className="text-[13px] text-ink-2 tabular-nums">{count} {count === 1 ? "issue" : "issues"}{partial ? " so far" : ""}</span>;
}
