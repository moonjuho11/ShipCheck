export type Severity = "critical" | "high" | "medium" | "low";
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export type Category = "secrets" | "database" | "auth" | "input" | "dependencies" | "live_site" | "production";
export type Source = "gitleaks" | "semgrep" | "analyzer" | "osv" | "live" | "llm";

/** What a check emits. The rule catalog turns it into plain English. */
export interface RawFinding {
  ruleId: string;
  source: Source;
  file?: string;
  line?: number;
  /** Already-redacted hint (never raw secrets or code). */
  evidence?: string;
  /** Values interpolated into the rule's title / explanation / fix prompt. */
  vars?: Record<string, string>;
  /** Override the rule's default severity. */
  severity?: Severity;
  /** Extra key so multiple findings of the same rule in the same file stay distinct. */
  key?: string;
}

export interface Finding {
  ruleId: string;
  category: Category;
  severity: Severity;
  title: string;
  explanation: string;
  whyItMatters: string;
  fixPrompt: string;
  file?: string;
  line?: number;
  source: Source;
  evidence?: string;
  fingerprint: string;
}

export interface RepoFile {
  path: string; // posix, relative to repo root
  content: string;
}

export interface ProjectInfo {
  /** e.g. next, vite, express, supabase, firebase, prisma, drizzle, mongoose, stripe, clerk, nextauth */
  stack: Set<string>;
  packageJson?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
}

export interface ScanContext {
  root: string;
  files: RepoFile[];
  byPath: Map<string, RepoFile>;
  project: ProjectInfo;
  hasGitHistory: boolean;
}

export type StepKey =
  | "clone" | "secrets" | "database" | "auth" | "input" | "dependencies"
  | "live_site" | "production" | "ai_review" | "report";

export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface Step {
  key: StepKey;
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface ScanResult {
  findings: Finding[];
  score: number;
  productionReady: boolean;
  counts: Record<Severity, number>;
  meta: {
    tools: Record<string, "ok" | "missing" | "failed" | "skipped">;
    filesScanned: number;
    aiReviewedFiles: string[];
    commitSha?: string;
    notes: string[];
  };
}
