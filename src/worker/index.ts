// Background worker: claims scan jobs from Postgres and runs the scanner.
//   npm run worker            (WORKER_CONCURRENCY=2 by default)
import os from "node:os";
import { fileURLToPath } from "node:url";
import { decrypt } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { githubAppConfigured, installationToken, updateCheckRun } from "@/lib/github";
import { claimJob, finishJob, reapStaleJobs, type Job } from "@/lib/queue";
import { completeScan, failScan, getScan, markRunning, updateSteps } from "@/lib/scans";
import type { ScanRow, UserRow } from "@/lib/types";
import { runScan, type ScanInput } from "@/scanner";
import { parseGitHubRepo } from "@/scanner/sandbox";
import type { ScanResult, Step } from "@/scanner/types";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 2));
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);
let stopping = false;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...a);

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
  return {
    status: "completed" as const,
    conclusion: r.productionReady ? ("success" as const) : ("failure" as const),
    details_url: url,
    output: {
      title: r.productionReady ? `Production ready — score ${r.score}/100` : `${c.critical} critical · ${c.high} high issues — score ${r.score}/100`,
      summary: [
        `**Score:** ${r.score}/100 ${r.productionReady ? "✅ Production Ready" : "❌ Not production ready"}`,
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

async function processJob(job: Job) {
  const scan = await getScan(job.scan_id);
  if (!scan || scan.status === "completed") return finishJob(job.id, true);
  const [user] = await sql()<UserRow[]>`select * from users where id = ${scan.user_id}`;
  if (!user) { await failScan(scan.id, "Account not found."); return finishJob(job.id, false, "no user"); }

  await markRunning(scan.id);
  log(`scan ${scan.id} started (${scan.repo_full_name}${scan.repo_ref ? `@${scan.repo_ref}` : ""})`);
  if (scan.check_run_id && scan.installation_id) {
    await updateCheckRun(scan.installation_id, scan.repo_full_name, scan.check_run_id, { status: "in_progress", details_url: `${env.appUrl}/scans/${scan.id}` }).catch(() => {});
  }

  let steps: Step[] = scan.steps;
  try {
    let source: ScanInput["source"];
    if (scan.repo_url.startsWith("file://")) {
      if (!env.allowLocalRepos) throw new Error("Local repositories are not allowed.");
      source = { kind: "local", path: fileURLToPath(scan.repo_url) };
    } else {
      const repo = parseGitHubRepo(scan.repo_url);
      if (!repo) throw new Error("That doesn't look like a GitHub repository address.");
      source = { kind: "github", repo, token: await cloneToken(scan, user, repo.owner), ref: scan.repo_ref ?? undefined };
    }
    const result = await runScan({
      source,
      siteUrl: scan.site_url,
      anthropicApiKey: env.anthropicApiKey || undefined,
      model: process.env.SEAPROOF_MODEL || undefined,
      onProgress: async (s) => { steps = s; await updateSteps(scan.id, s); },
    });
    await completeScan(scan.id, result, steps);
    log(`scan ${scan.id} done: score ${result.score}, ${result.findings.length} findings`);
    if (scan.check_run_id && scan.installation_id) {
      await updateCheckRun(scan.installation_id, scan.repo_full_name, scan.check_run_id, checkRunSummary(scan, result)).catch((e) => log("check run update failed", e.message));
    }
    await finishJob(job.id, true);
  } catch (e) {
    const msg = (e as Error).message || "Unknown error";
    log(`scan ${scan.id} failed:`, msg);
    const friendly = /couldn't|could not|doesn't look|not allowed|private/i.test(msg) ? msg : "Something went wrong while scanning. Please try again in a few minutes.";
    await failScan(scan.id, friendly, steps);
    if (scan.check_run_id && scan.installation_id) {
      await updateCheckRun(scan.installation_id, scan.repo_full_name, scan.check_run_id, {
        status: "completed", conclusion: "neutral", details_url: `${env.appUrl}/scans/${scan.id}`,
        output: { title: "Seaproof couldn't finish this scan", summary: friendly },
      }).catch(() => {});
    }
    await finishJob(job.id, false, msg.slice(0, 500));
  }
}

async function loop(n: number) {
  while (!stopping) {
    try {
      const job = await claimJob(`${WORKER_ID}#${n}`);
      if (!job) { await new Promise((r) => setTimeout(r, POLL_MS)); continue; }
      await processJob(job);
    } catch (e) {
      log("loop error", (e as Error).message);
      await new Promise((r) => setTimeout(r, POLL_MS * 2));
    }
  }
}

async function main() {
  log(`starting ${CONCURRENCY} lane(s) as ${WORKER_ID}`);
  const reaper = setInterval(() => reapStaleJobs().then((ids) => ids.length && log("requeued", ids)).catch(() => {}), 60_000);
  const shutdown = () => { if (!stopping) { log("finishing current scans, then exiting…"); stopping = true; } };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  await reapStaleJobs().catch(() => {});
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => loop(i)));
  clearInterval(reaper);
  await sql().end({ timeout: 5 });
  log("stopped");
}

main().catch((e) => { console.error(e); process.exit(1); });
