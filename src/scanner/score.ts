import type { Finding, Severity } from "./types";

const WEIGHT: Record<Severity, number> = { critical: 20, high: 8, medium: 3, low: 1 };
const CAP: Record<Severity, number> = { critical: 100, high: 32, medium: 15, low: 5 };

/**
 * Score out of 100. Any critical problem caps the score at 49, any high at 74,
 * so the number never looks "good" while something serious is open.
 * Production Ready = no critical, no high, and a score of at least 80.
 */
export function score(findings: Pick<Finding, "severity">[]) {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;
  let s = 100;
  for (const sev of Object.keys(counts) as Severity[]) s -= Math.min(CAP[sev], counts[sev] * WEIGHT[sev]);
  if (counts.critical) s = Math.min(s, 49);
  else if (counts.high) s = Math.min(s, 74);
  s = Math.max(0, Math.round(s));
  return { score: s, counts, productionReady: counts.critical === 0 && counts.high === 0 && s >= 80 };
}
