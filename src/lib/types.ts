import type { Severity, Step } from "@/scanner/types";

export interface UserRow {
  id: string;
  github_id: string;
  github_login: string;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
  github_token_enc: string | null;
  github_scopes: string;
  stripe_customer_id: string | null;
}

export interface ScanRow {
  id: string;
  user_id: string;
  repo_full_name: string;
  repo_url: string;
  repo_ref: string | null;
  commit_sha: string | null;
  site_url: string | null;
  status: "queued" | "running" | "completed" | "failed";
  steps: Step[];
  score: number | null;
  production_ready: boolean | null;
  counts: Partial<Record<Severity, number>>;
  trigger: "manual" | "pr";
  pr_number: number | null;
  check_run_id: string | null;
  installation_id: string | null;
  share_token: string;
  is_public: boolean;
  error: string | null;
  meta: { tools?: Record<string, string>; filesScanned?: number; aiReviewedFiles?: string[]; notes?: string[] };
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface FindingRow {
  id: string;
  scan_id: string;
  category: string;
  rule_id: string;
  severity: Severity;
  title: string;
  explanation: string;
  why_it_matters: string;
  fix_prompt: string;
  file_path: string | null;
  line: number | null;
  source: string;
  evidence: string | null;
  fingerprint: string;
}
