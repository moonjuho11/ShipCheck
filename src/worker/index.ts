// Background worker: claims scan jobs from Postgres and runs each scan in its own process.
//   npm run worker            (WORKER_CONCURRENCY=2 by default)
import { randomBytes } from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { decrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { githubAppConfigured, installationToken, updateCheckRun } from "@/lib/github";
import { claimJob, DIED_MESSAGE, finishJob, heartbeat, MAX_ATTEMPTS, reapStaleJobs, requeueJob, workerGone, workerSeen, type Job, type JobOwner } from "@/lib/queue";
import { completeScan, failScan, getScan, markRunning, updateSteps } from "@/lib/scans";
import type { ScanRow, UserRow } from "@/lib/types";
import type { ScanInput } from "@/scanner";
import { ScanRejected } from "@/scanner/errors";
import { hasBinary } from "@/scanner/exec";
import { parseGitHubRepo } from "@/scanner/repo-url";
import { initialSteps } from "@/scanner/steps";
import type { ScanResult, Step } from "@/scanner/types";
import { runScanInChild, ScanStopped, sweepOldJobDirs } from "./scan-runner";

// The random part means a restarted worker with the same hostname and pid can't pass for the old one.
const WORKER_ID = `${os.hostname()}:${process.pid}:${randomBytes(3).toString("hex")}`;
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 2));
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);
const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS || 10_000);
const STALE_SECONDS = Number(process.env.WORKER_STALE_SECONDS || 120);
const SCAN_TIMEOUT_MS = Number(process.env.WORKER_SCAN_TIMEOUT_MS || 15 * 60_000);
const RETRY_BASE_SECONDS = Number(process.env.WORKER_RETRY_BASE_SECONDS || 30);
// How long a SIGTERM gives running scans to finish. Railway waits 300s before killing us.
const DRAIN_MS = Number(process.env.WORKER_DRAIN_MS ?? 240_000);

let stopping = false;
const running = new Set<AbortController>();

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pick the least-privileged token that can read the repo, scoped to the scan's owner. */
async function cloneToken(scan: ScanRow, user: UserRow, owner: string): Promise<string | undefined> {
  if (githubAppConfigured()) {
    const installationId = scan.installation_id ?? (await sql()<{ installation_id: string }[]>`
      select installation_id from github_installations
      where user_id = ${user.id} and lower(account_login) = ${owner.toLowerCase()} limit 1`)[0]?.installation_id;
    if (installationId) {
      try { return await installationToken(installationId); } catch (e) { log("installation token failed", (e as Error).message); }
    }
  }
  if (user.github_token_enc) {
    try { return decrypt(user.github_token_enc); } catch { /* key rotated — fall through to anonymous */ }
  }
  return undefined;
}

function checkRunSummary(scan: ScanRow, r: ScanResult) {
  const url = `${env.appUrl}/scans/${scan.id}`;
  const c = r.counts;
  // Nothing serious found but not every check finished: that's "unknown", not a failing PR.
  const unknown = !r.productionReady && !c.critical && !c.high;
  return {
    status: "completed" as const,
    conclusion: r.productionReady ? ("success" as const) : unknown ? ("neutral" as const) : ("failure" as const),
    details_url: url,
    output: {
      title: r.productionReady ? `Production ready — score ${r.score}/100` : unknown ? `Couldn't check everything — score ${r.score}/100` : `${c.critical} critical · ${c.high} high issues — score ${r.score}/100`,
      summary: [
        `**Score:** ${r.score}/100 ${r.productionReady ? "✅ Production Ready" : unknown ? "⚠️ Some checks couldn't finish" : "❌ Not production ready"}`,
        ``,
        `| Critical | High | Medium | Low |`,
        `|---|---|---|---|`,
        `| ${c.critical} | ${c.high} | ${c.medium} | ${c.low} |`,
        ``,
        `[Open the full report with fix prompts](${url})`,
      ].join("\n"),
    },
  };
}

function closeCheckRun(scan: Pick<ScanRow, "id" | "repo_full_name" | "check_run_id" | "installation_id">, summary: string) {
  if (!scan.check_run_id || !scan.installation_id) return Promise.resolve();
  return updateCheckRun(scan.installation_id, scan.repo_full_name, scan.check_run_id, {
    status: "completed", conclusion: "neutral", details_url: `${env.appUrl}/scans/${scan.id}`,
    output: { title: "Seaproof couldn't finish this scan", summary },
  }).catch((e) => log("check run update failed", e.message));
}

/** Results are expensive to redo, so ride out a short database outage instead of throwing them away. */
async function persist<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= 6) throw e;
      log(`database write failed, retrying (${attempt}):`, (e as Error).message);
      await sleep(500 * 2 ** attempt);
    }
  }
}

async function processJob(job: Job, workerId: string) {
  const owner: JobOwner = { id: job.id, workerId };
  const scan = await getScan(job.scan_id);
  if (!scan || scan.status === "completed" || scan.status === "canceled") return finishJob(owner, true);
  const [user] = await sql()<UserRow[]>`select * from users where id = ${scan.user_id}`;
  if (!user) { await failScan(scan.id, "Account not found."); return finishJob(owner, false, "no user"); }

  let steps: Step[] = initialSteps({ siteUrl: scan.site_url, ai: !!env.anthropicApiKey });
  if (!(await markRunning(scan.id, steps))) return finishJob(owner, true);
  log(`scan ${scan.id} started (${scan.repo_full_name}${scan.repo_ref ? `@${scan.repo_ref}` : ""}), attempt ${job.attempts}`);
  if (scan.check_run_id && scan.installation_id) {
    await updateCheckRun(scan.installation_id, scan.repo_full_name, scan.check_run_id, { status: "in_progress", details_url: `${env.appUrl}/scans/${scan.id}` }).catch(() => {});
  }

  const control = new AbortController();
  running.add(control);
  const beat = setInterval(() => {
    heartbeat(owner).then((state) => { if (state !== "ok") control.abort(state); }).catch((e) => log("heartbeat failed", e.message));
  }, HEARTBEAT_MS);

  try {
    let source: ScanInput["source"];
    if (scan.repo_url.startsWith("file://")) {
      if (!env.allowLocalRepos) throw new ScanRejected("Local repositories are not allowed.");
      source = { kind: "local", path: fileURLToPath(scan.repo_url) };
    } else {
      const repo = parseGitHubRepo(scan.repo_url);
      if (!repo) throw new ScanRejected("That doesn't look like a GitHub repository address.");
      source = { kind: "github", repo, token: await cloneToken(scan, user, repo.owner), ref: scan.repo_ref ?? undefined };
    }
    const result = await runScanInChild(
      { source, siteUrl: scan.site_url, anthropicApiKey: env.anthropicApiKey || undefined, model: process.env.SEAPROOF_MODEL || undefined },
      { timeoutMs: SCAN_TIMEOUT_MS, signal: control.signal, onProgress: (s) => { steps = s; updateSteps(scan.id, s).catch((e) => log("progress update failed", e.message)); } },
    );
    if (!(await persist(() => completeScan(scan.id, result, steps, owner)))) return log(`scan ${scan.id} finished, but it was cancelled or moved to another worker`);
    log(`scan ${scan.id} done: score ${result.score}, ${result.findings.length} findings`);
    if (scan.check_run_id && scan.installation_id) {
      await updateCheckRun(scan.installation_id, scan.repo_full_name, scan.check_run_id, checkRunSummary(scan, result)).catch((e) => log("check run update failed", e.message));
    }
  } catch (e) {
    const msg = (e as Error).message || "Unknown error";
    if (e instanceof ScanStopped) {
      const reason = control.signal.reason;
      log(`scan ${scan.id} stopped: ${reason}`);
      if (reason === "shutdown") await requeueJob(owner, { delaySeconds: 0, refundAttempt: true });
      if (reason === "canceled") { await finishJob(owner, false, "canceled"); await closeCheckRun(scan, "This scan was canceled."); }
      return;
    }
    const rejected = e instanceof ScanRejected;
    if (!rejected && job.attempts < MAX_ATTEMPTS) {
      const delaySeconds = RETRY_BASE_SECONDS * 4 ** (job.attempts - 1);
      log(`scan ${scan.id} hit a temporary problem, retrying in ${delaySeconds}s:`, msg);
      return await requeueJob(owner, { delaySeconds, error: msg.slice(0, 500) });
    }
    log(`scan ${scan.id} failed:`, msg);
    const friendly = rejected ? msg : "Something went wrong while scanning. Please try again in a few minutes.";
    await failScan(scan.id, friendly, steps);
    await closeCheckRun(scan, friendly);
    await finishJob(owner, false, msg.slice(0, 500));
  } finally {
    clearInterval(beat);
    running.delete(control);
  }
}

async function loop(n: number) {
  const workerId = `${WORKER_ID}#${n}`;
  while (!stopping) {
    try {
      const job = await claimJob(workerId);
      if (!job) { await sleep(POLL_MS); continue; }
      await processJob(job, workerId);
    } catch (e) {
      // Anything left unfinished here is picked up again by the reaper once the heartbeat stops.
      log("loop error", (e as Error).message);
      await sleep(POLL_MS * 2);
    }
  }
}

async function reap() {
  const { requeued, dead } = await reapStaleJobs(STALE_SECONDS);
  if (requeued.length) log("requeued", requeued);
  for (const scan of dead) {
    log(`scan ${scan.id} failed: workers kept dying`);
    await closeCheckRun(scan, DIED_MESSAGE);
  }
}

async function main() {
  log(`starting ${CONCURRENCY} lane(s) as ${WORKER_ID}`);
  await sql()`select 1`; // fail fast and visibly if the database is unreachable or misconfigured
  for (const tool of ["git", "gitleaks", "semgrep"]) {
    if (!(await hasBinary(tool))) log(`WARNING: ${tool} isn't installed, so no scan from this worker can be certified`);
  }
  await sweepOldJobDirs().catch((e) => log("temp cleanup failed", e.message));

  const seen = () => workerSeen(WORKER_ID).catch((e) => log("check-in failed", e.message));
  await seen();
  const presence = setInterval(seen, HEARTBEAT_MS);
  const reaper = setInterval(() => reap().catch((e) => log("reaper failed", e.message)), Math.min(60_000, STALE_SECONDS * 500));

  const stopAll = () => running.forEach((c) => c.abort("shutdown"));
  const shutdown = () => {
    if (stopping) return stopAll(); // a second signal means now
    log(`finishing current scans (up to ${DRAIN_MS / 1000}s), then exiting…`);
    stopping = true;
    setTimeout(stopAll, DRAIN_MS).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await reap().catch((e) => log("reaper failed", e.message));
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => loop(i)));
  clearInterval(reaper);
  clearInterval(presence);
  await workerGone(WORKER_ID).catch(() => {});
  await sql().end({ timeout: 5 });
  log("stopped");
}

main().catch((e) => { console.error(e); process.exit(1); });
