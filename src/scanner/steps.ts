import type { Step, StepKey } from "./types";

export const STEP_LABELS: Record<StepKey, string> = {
  clone: "Making a private, temporary copy of your code",
  secrets: "Looking for leaked passwords and API keys",
  database: "Checking who can read and change your database",
  auth: "Checking that private pages and APIs need a login",
  input: "Testing how your app handles what people type and upload",
  dependencies: "Checking your packages for known security holes",
  live_site: "Checking your live website",
  production: "Checking launch basics: errors, rate limits, backups",
  ai_review: "Having AI double-check the riskiest files",
  report: "Writing your report",
};

export function initialSteps(opts: { siteUrl?: string | null; ai: boolean }): Step[] {
  return (Object.keys(STEP_LABELS) as StepKey[]).map((key) => ({
    key, label: STEP_LABELS[key],
    status: (key === "live_site" && !opts.siteUrl) || (key === "ai_review" && !opts.ai) ? "skipped" : "pending",
    detail: key === "live_site" && !opts.siteUrl ? "No website address given" : key === "ai_review" && !opts.ai ? "AI review is not configured" : undefined,
  }));
}
