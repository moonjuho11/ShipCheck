import type Anthropic from "@anthropic-ai/sdk";
import { checkAuth } from "./checks/auth";
import { checkDatabase } from "./checks/database";
import { checkDependencies } from "./checks/dependencies";
import { checkInput } from "./checks/input";
import { checkLiveSite } from "./checks/live-site";
import { checkProduction } from "./checks/production";
import { checkSecrets } from "./checks/secrets";
import { hasBinary } from "./exec";
import { buildContext } from "./files";
import { aiReview } from "./llm";
import { dedupe, enrich } from "./rules";
import { cloneGitHub, copyLocal, type ParsedRepo, type Sandbox } from "./sandbox";
import { score } from "./score";
import { SEVERITIES, type Finding, type RawFinding, type ScanResult, type Step, type StepKey } from "./types";

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

export interface ScanInput {
  source: { kind: "github"; repo: ParsedRepo; token?: string; ref?: string } | { kind: "local"; path: string };
  siteUrl?: string | null;
  anthropicApiKey?: string;
  anthropicClient?: Anthropic;
  model?: string;
  /** Called whenever a progress step changes. */
  onProgress?: (steps: Step[]) => Promise<void> | void;
  /** Force tools off (tests use this to exercise fallbacks). */
  tools?: { gitleaks?: boolean; semgrep?: boolean };
}

export async function runScan(input: ScanInput): Promise<ScanResult> {
  const ai = !!(input.anthropicApiKey || input.anthropicClient);
  const steps = initialSteps({ siteUrl: input.siteUrl, ai });
  const notes: string[] = [];
  const tools: ScanResult["meta"]["tools"] = {};
  const set = async (key: StepKey, status: Step["status"], detail?: string) => {
    const s = steps.find((x) => x.key === key)!;
    s.status = status;
    if (detail !== undefined) s.detail = detail;
    await input.onProgress?.(steps.map((x) => ({ ...x })));
  };
  const stage = async <T>(key: StepKey, fn: () => Promise<T>, detail?: (r: T) => string | undefined): Promise<T | undefined> => {
    await set(key, "running");
    try {
      const r = await fn();
      await set(key, "done", detail?.(r));
      return r;
    } catch (e) {
      await set(key, "failed", "This check hit an error and was skipped.");
      notes.push(`${STEP_LABELS[key]}: ${(e as Error).message}`);
      return undefined;
    }
  };

  let sandbox: Sandbox | undefined;
  const raw: RawFinding[] = [];
  try {
    await set("clone", "running");
    try {
      sandbox = input.source.kind === "github"
        ? await cloneGitHub(input.source.repo, { token: input.source.token, ref: input.source.ref })
        : await copyLocal(input.source.path);
    } catch (e) {
      await set("clone", "failed", (e as Error).message);
      throw e;
    }
    const ctx = await buildContext(sandbox.dir);
    await set("clone", "done", `${ctx.files.length} files read`);

    const [useGitleaks, useSemgrep] = await Promise.all([
      input.tools?.gitleaks === false ? false : hasBinary("gitleaks"),
      input.tools?.semgrep === false ? false : hasBinary("semgrep"),
    ]);

    const sec = await stage("secrets", () => checkSecrets(ctx, { useGitleaks }), (r) => (r.gitleaks === "missing" ? "Gitleaks not installed — used built-in detectors" : undefined));
    if (sec) { raw.push(...sec.findings); tools.gitleaks = sec.gitleaks; }

    const db = await stage("database", async () => checkDatabase(ctx));
    if (db) raw.push(...db);

    const auth = await stage("auth", async () => checkAuth(ctx));
    if (auth) raw.push(...auth);

    const inp = await stage("input", () => checkInput(ctx, { useSemgrep }), (r) => (r.semgrep === "missing" ? "Semgrep not installed — used built-in patterns" : undefined));
    if (inp) { raw.push(...inp.findings); tools.semgrep = inp.semgrep; }

    const deps = await stage("dependencies", () => checkDependencies(ctx), (r) => (r.osv === "failed" ? "Couldn't reach the vulnerability database" : r.depCount ? `${r.depCount} packages checked` : "No packages found"));
    if (deps) { raw.push(...deps.findings); tools.osv = deps.osv; }

    if (input.siteUrl) {
      const live = await stage("live_site", () => checkLiveSite(input.siteUrl!), (r) => r.note);
      if (live) { raw.push(...live.findings); if (live.note) notes.push(live.note); }
    }

    const prod = await stage("production", async () => checkProduction(ctx));
    if (prod) raw.push(...prod);

    let findings: Finding[] = dedupe(raw.map(enrich));
    let aiReviewedFiles: string[] = [];
    if (ai) {
      await set("ai_review", "running");
      const r = await aiReview(ctx, findings, { apiKey: input.anthropicApiKey, client: input.anthropicClient, model: input.model });
      findings = r.findings;
      aiReviewedFiles = r.reviewedFiles;
      tools.ai = r.status === "ok" ? "ok" : r.status === "skipped" ? "skipped" : "failed";
      if (r.note) notes.push(r.note);
      await set("ai_review", r.status === "ok" ? "done" : r.status === "skipped" ? "skipped" : "failed", r.status === "ok" ? `${r.reviewedFiles.length} files reviewed` : r.note);
    }

    await set("report", "running");
    findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || (a.file || "").localeCompare(b.file || "") || (a.line || 0) - (b.line || 0));
    const s = score(findings);
    // If a core check crashed we can't vouch for the app, whatever the score says.
    const incomplete = steps.some((x) => x.status === "failed" && x.key !== "ai_review");
    if (incomplete) notes.push("Some checks couldn't run, so this scan can't certify the app as production ready.");
    await set("report", "done");
    return {
      findings, score: s.score, productionReady: s.productionReady && !incomplete, counts: s.counts,
      meta: { tools, filesScanned: ctx.files.length, aiReviewedFiles, commitSha: sandbox.commitSha, notes },
    };
  } finally {
    // Always delete the code, even if the scan failed.
    await sandbox?.cleanup();
  }
}
