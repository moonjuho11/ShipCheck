import { initialSteps } from "@/scanner/steps";
import type { ScanResult, Step } from "@/scanner/types";
import { sql } from "./db";
import { env } from "./env";
import { enqueue } from "./queue";
import type { FindingRow, ScanRow } from "./types";

export interface NewScan {
  userId: string;
  repoFullName: string;
  repoUrl: string;
  siteUrl?: string | null;
  ref?: string | null;
  trigger?: "manual" | "pr";
  prNumber?: number | null;
  checkRunId?: number | null;
  installationId?: number | null;
}

export async function createScan(s: NewScan): Promise<ScanRow> {
  const steps = initialSteps({ siteUrl: s.siteUrl, ai: !!env.anthropicApiKey });
  return sql().begin(async (tx) => {
    const [row] = await tx<ScanRow[]>`
      insert into scans (user_id, repo_full_name, repo_url, site_url, repo_ref, trigger, pr_number, check_run_id, installation_id, steps)
      values (${s.userId}, ${s.repoFullName}, ${s.repoUrl}, ${s.siteUrl ?? null}, ${s.ref ?? null}, ${s.trigger ?? "manual"},
              ${s.prNumber ?? null}, ${s.checkRunId ?? null}, ${s.installationId ?? null}, ${tx.json(steps as never)})
      returning *`;
    await enqueue(tx, row.id);
    return row;
  });
}

export async function getScan(id: string): Promise<ScanRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await sql()<ScanRow[]>`select * from scans where id = ${id}`;
  return row ?? null;
}

export async function getScanByShareToken(token: string): Promise<ScanRow | null> {
  if (!/^[0-9a-f]{24}$/.test(token)) return null;
  const [row] = await sql()<ScanRow[]>`select * from scans where share_token = ${token} and is_public = true and status = 'completed'`;
  return row ?? null;
}

export async function listScans(userId: string, limit = 50): Promise<ScanRow[]> {
  return sql()<ScanRow[]>`select * from scans where user_id = ${userId} order by created_at desc limit ${limit}`;
}

export async function getFindings(scanId: string): Promise<FindingRow[]> {
  return sql()<FindingRow[]>`
    select * from findings where scan_id = ${scanId}
    order by array_position(array['critical','high','medium','low'], severity), file_path nulls last, line nulls last`;
}

export async function markRunning(scanId: string) {
  await sql()`update scans set status = 'running', started_at = coalesce(started_at, now()), error = null where id = ${scanId}`;
}

export async function updateSteps(scanId: string, steps: Step[]) {
  await sql()`update scans set steps = ${sql().json(steps as never)} where id = ${scanId}`;
}

export async function completeScan(scanId: string, r: ScanResult, steps: Step[]) {
  await sql().begin(async (tx) => {
    await tx`delete from findings where scan_id = ${scanId}`;
    if (r.findings.length) {
      const rows = r.findings.map((f) => ({
        scan_id: scanId, category: f.category, rule_id: f.ruleId, severity: f.severity, title: f.title,
        explanation: f.explanation, why_it_matters: f.whyItMatters, fix_prompt: f.fixPrompt,
        file_path: f.file ?? null, line: f.line ?? null, source: f.source, evidence: f.evidence ?? null, fingerprint: f.fingerprint,
      }));
      await tx`insert into findings ${tx(rows)}`;
    }
    await tx`
      update scans set status = 'completed', score = ${r.score}, production_ready = ${r.productionReady},
        counts = ${tx.json(r.counts as never)}, commit_sha = coalesce(${r.meta.commitSha ?? null}, commit_sha),
        meta = ${tx.json(r.meta as never)}, steps = ${tx.json(steps as never)}, finished_at = now()
      where id = ${scanId}`;
  });
}

export async function failScan(scanId: string, message: string, steps?: Step[]) {
  if (steps) await updateSteps(scanId, steps);
  await sql()`update scans set status = 'failed', error = ${message.slice(0, 500)}, finished_at = now() where id = ${scanId}`;
}

export async function setPublic(scanId: string, isPublic: boolean) {
  await sql()`update scans set is_public = ${isPublic} where id = ${scanId}`;
}

/**
 * For the badge: the share token proves the owner opted in, but the badge always
 * reflects the LATEST completed scan of that repo, so it can't stay green after a failing rescan.
 */
export async function latestScanForBadge(token: string): Promise<ScanRow | null> {
  const s = await getScanByShareToken(token);
  if (!s) return null;
  const [latest] = await sql()<ScanRow[]>`
    select * from scans where user_id = ${s.user_id} and repo_full_name = ${s.repo_full_name} and status = 'completed'
    order by finished_at desc limit 1`;
  return latest ?? s;
}
