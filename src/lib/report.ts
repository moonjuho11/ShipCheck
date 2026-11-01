import type { Severity } from "@/scanner/types";
import type { ReportAccess } from "./plans";
import type { FindingRow, ScanRow } from "./types";

export const CATEGORY_LABELS: Record<string, { label: string; blurb: string }> = {
  secrets: { label: "Passwords & API keys", blurb: "Keys that should never be visible to anyone else" },
  database: { label: "Database safety", blurb: "Who can read and change your data" },
  auth: { label: "Login protection", blurb: "Private pages and APIs that need a login" },
  input: { label: "User input", blurb: "What happens with things people type and upload" },
  dependencies: { label: "Packages", blurb: "Third-party code with known security holes" },
  live_site: { label: "Live website", blurb: "How your deployed site is configured" },
  production: { label: "Launch basics", blurb: "Error handling, rate limits and backups" },
};

export const SEVERITY_LABELS: Record<Severity, { label: string; blurb: string }> = {
  critical: { label: "Critical", blurb: "Fix before launch — someone could take over accounts, read all your data or spend your money." },
  high: { label: "High", blurb: "Fix before launch — serious risk that's easy to abuse." },
  medium: { label: "Medium", blurb: "Fix soon — real risk, but needs specific conditions." },
  low: { label: "Low", blurb: "Good hygiene — fix when you can." },
};

export interface ReportFinding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  /** null when locked (free plan) */
  explanation: string | null;
  whyItMatters: string | null;
  fixPrompt: string | null;
  file: string | null;
  line: number | null;
  evidence: string | null;
  aiWritten: boolean;
}

export interface Report {
  access: ReportAccess;
  findings: ReportFinding[];
  bySeverity: Record<Severity, ReportFinding[]>;
}

/** Strip locked fields on the server — they are never sent to the browser. */
export function shapeReport(findings: FindingRow[], access: ReportAccess): Report {
  const full = access === "full";
  const shaped = findings.map<ReportFinding>((f) => ({
    id: f.id, severity: f.severity, category: f.category, title: f.title,
    explanation: full ? f.explanation : null,
    whyItMatters: full ? f.why_it_matters : null,
    fixPrompt: full ? f.fix_prompt : null,
    file: full ? f.file_path : null,
    line: full ? f.line : null,
    evidence: full ? f.evidence : null,
    aiWritten: f.source === "llm",
  }));
  const bySeverity: Record<Severity, ReportFinding[]> = { critical: [], high: [], medium: [], low: [] };
  for (const f of shaped) bySeverity[f.severity].push(f);
  return { access, findings: shaped, bySeverity };
}

/** What a public share link shows: score, badge and per-area counts — no titles, files or fixes. */
export function publicSummary(scan: ScanRow, findings: FindingRow[]) {
  const areas = Object.entries(CATEGORY_LABELS).map(([key, c]) => {
    const items = findings.filter((f) => f.category === key);
    const worst = (["critical", "high", "medium", "low"] as Severity[]).find((s) => items.some((f) => f.severity === s)) ?? null;
    return { key, label: c.label, blurb: c.blurb, count: items.length, worst };
  });
  return {
    repo: scan.repo_full_name, score: scan.score ?? 0, productionReady: !!scan.production_ready,
    counts: { critical: 0, high: 0, medium: 0, low: 0, ...scan.counts }, finishedAt: scan.finished_at, commitSha: scan.commit_sha, areas,
    liveChecked: !!scan.site_url,
  };
}
