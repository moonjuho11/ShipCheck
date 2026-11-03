// Runs the real worker as a real process against a real database, then breaks things.
// Needs TEST_DATABASE_URL (a throwaway database) in the environment or .env.local.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSampleRepo } from "../scripts/make-sample-repo";

try { process.loadEnvFile(".env.local"); } catch { /* CI sets it directly */ }
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const realGitleaks = () => execFileSync("which", ["gitleaks"], { encoding: "utf8" }).trim();
const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe.skipIf(!url)("the scan worker", { timeout: 120_000 }, () => {
  let db: typeof import("../src/lib/db");
  let scans: typeof import("../src/lib/scans");
  let queue: typeof import("../src/lib/queue");
  let userId: string;
  const dirs: string[] = [];
  const workers: ChildProcess[] = [];
  const realPath = process.env.PATH;

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = await import("../src/lib/db");
    scans = await import("../src/lib/scans");
    queue = await import("../src/lib/queue");
  });

  beforeEach(async () => {
    await db.sql()`truncate users, jobs, worker_heartbeats cascade`;
    [{ id: userId }] = await db.sql()<{ id: string }[]>`
      insert into users (github_id, github_login) values (${Math.floor(Math.random() * 1e9)}, 'tester') returning id`;
  });

  afterEach(async () => {
    workers.splice(0).forEach((w) => w.kill("SIGKILL"));
    await new Promise((r) => setTimeout(r, 100));
    dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
    process.env.PATH = realPath;
  });

  afterAll(async () => { await db?.sql().end({ timeout: 5 }); });

  function tempDir() {
    const d = mkdtempSync(path.join(os.tmpdir(), "seaproof-test-"));
    dirs.push(d);
    return d;
  }

  /** A worker with short timers, and optionally a misbehaving Gitleaks ahead of the real one. */
  function startWorker(opts: { gitleaks?: string; env?: Record<string, string> } = {}) {
    let PATH = realPath!;
    if (opts.gitleaks) {
      const bin = tempDir();
      writeFileSync(path.join(bin, "gitleaks"), `#!/bin/sh\n[ "$1" = "--version" ] && exit 0\n${opts.gitleaks}\n`);
      chmodSync(path.join(bin, "gitleaks"), 0o755);
      PATH = `${bin}:${realPath}`;
    }
    const worker = spawn(process.execPath, ["--import", "tsx", "src/worker/index.ts"], {
      env: { ...process.env, PATH, DATABASE_URL: url, SEAPROOF_ALLOW_LOCAL_REPOS: "1", WORKER_CONCURRENCY: "1", WORKER_POLL_MS: "100", WORKER_HEARTBEAT_MS: "200", WORKER_STALE_SECONDS: "2", WORKER_RETRY_BASE_SECONDS: "1", ...opts.env },
      stdio: "inherit",
    });
    workers.push(worker);
    return worker;
  }

  const exited = (w: ChildProcess) => new Promise<number | null>((r) => w.once("exit", (code) => r(code)));

  async function newScan(repoUrl?: string) {
    let target = repoUrl;
    if (!target) {
      const { dir } = makeSampleRepo("secure-app");
      dirs.push(dir);
      target = `file://${dir}`;
    }
    return scans.createScan({ userId, repoFullName: `local/${randomBytes(3).toString("hex")}`, repoUrl: target });
  }

  const read = async (id: string) => (await scans.getScan(id))!;
  const jobOf = async (id: string) => (await db.sql()<{ id: string; status: string; attempts: number; locked_by: string | null; last_error: string | null }[]>`select id, status, attempts, locked_by, last_error from jobs where scan_id = ${id}`)[0];

  async function waitUntil(what: string, check: () => boolean | Promise<boolean>, ms = 90_000) {
    const end = Date.now() + ms;
    while (!(await check())) {
      if (Date.now() > end) throw new Error(`timed out waiting until ${what}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const finished = (id: string) => waitUntil("the scan finished", async () => ["completed", "failed", "canceled"].includes((await read(id)).status));

  /** Hangs on the first run, works normally from then on. Writes its pid so tests can check on it. */
  function hangFirstTime(dir: string) {
    return `if [ -f "${dir}/ran" ]; then exec "${realGitleaks()}" "$@"; fi\ntouch "${dir}/ran"\necho $$ > "${dir}/pid"\nexec sleep 300`;
  }

  it("runs a scan to completion and shows it's online", async () => {
    startWorker();
    const scan = await newScan();
    await finished(scan.id);
    const done = await read(scan.id);
    expect(done.status).toBe("completed");
    expect(done.production_ready).toBe(true);
    expect((await jobOf(scan.id)).status).toBe("done");
    expect((await queue.queueHealth()).workersOnline).toBe(1);
  });

  it("recovers a scan when its worker is killed outright, leaving nothing running", async () => {
    const d = tempDir();
    const first = startWorker({ gitleaks: hangFirstTime(d) });
    const scan = await newScan();
    await waitUntil("the scan is hanging", () => existsSync(`${d}/pid`));
    const hung = Number(readFileSync(`${d}/pid`, "utf8"));
    first.kill("SIGKILL");
    await waitUntil("the orphaned scan is gone", () => !isAlive(hung), 10_000);

    startWorker({ gitleaks: hangFirstTime(d) });
    await finished(scan.id);
    expect((await read(scan.id)).status).toBe("completed");
    expect((await jobOf(scan.id)).attempts).toBe(2);
  });

  it("hands a scan back on shutdown without using up an attempt", async () => {
    const d = tempDir();
    const first = startWorker({ gitleaks: hangFirstTime(d), env: { WORKER_DRAIN_MS: "0" } });
    const scan = await newScan();
    await waitUntil("the scan is hanging", () => existsSync(`${d}/pid`));
    const exit = exited(first);
    first.kill("SIGTERM");
    expect(await exit).toBe(0);

    const job = await jobOf(scan.id);
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);
    const waiting = await read(scan.id);
    expect(waiting.status).toBe("queued");
    expect(waiting.steps.every((s) => s.status === "pending")).toBe(true);

    startWorker({ gitleaks: hangFirstTime(d) });
    await finished(scan.id);
    expect((await read(scan.id)).status).toBe("completed");
    expect((await jobOf(scan.id)).attempts).toBe(1);
  });

  it("finishes the scan it's on when it has time to drain", async () => {
    const worker = startWorker({ gitleaks: `sleep 2\nexec "${realGitleaks()}" "$@"`, env: { WORKER_DRAIN_MS: "60000" } });
    const scan = await newScan();
    await waitUntil("the scan is running", async () => (await read(scan.id)).status === "running");
    const exit = exited(worker);
    worker.kill("SIGTERM");
    expect(await exit).toBe(0);
    expect((await read(scan.id)).status).toBe("completed");
  });

  it("retries after a temporary failure, and the user never sees a failed scan", async () => {
    const d = tempDir();
    startWorker({ gitleaks: `if [ -f "${d}/ran" ]; then exec "${realGitleaks()}" "$@"; fi\ntouch "${d}/ran"\nkill -9 $PPID` });
    const scan = await newScan();
    await finished(scan.id);
    expect((await read(scan.id)).status).toBe("completed");
    expect((await jobOf(scan.id)).attempts).toBe(2);
  });

  it("gives up after three tries with a friendly message", async () => {
    startWorker({ gitleaks: `kill -9 $PPID` });
    const scan = await newScan();
    await finished(scan.id);
    const failed = await read(scan.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/try again/i);
    expect(failed.error).not.toMatch(/process|SIGKILL|died/);
    const job = await jobOf(scan.id);
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(queue.MAX_ATTEMPTS);
    expect(job.last_error).toMatch(/died/);
  });

  it("doesn't retry a problem only the user can fix", async () => {
    startWorker();
    const scan = await newScan("https://evil.example/a/b");
    await finished(scan.id);
    const failed = await read(scan.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/doesn't look like a GitHub repository/);
    expect((await jobOf(scan.id)).attempts).toBe(1);
  });

  it("stops a running scan when the user cancels, then takes the next job", async () => {
    const d = tempDir();
    startWorker({ gitleaks: hangFirstTime(d) });
    const scan = await newScan();
    await waitUntil("the scan is hanging", () => existsSync(`${d}/pid`));
    const hung = Number(readFileSync(`${d}/pid`, "utf8"));

    expect(await scans.cancelScan(scan.id, userId)).toBe(true);
    expect((await read(scan.id)).status).toBe("canceled");
    await waitUntil("the scan process is gone", () => !isAlive(hung), 10_000);
    await waitUntil("the job is closed", async () => (await jobOf(scan.id)).status === "failed");
    expect((await read(scan.id)).status).toBe("canceled");

    const next = await newScan();
    await finished(next.id);
    expect((await read(next.id)).status).toBe("completed");
  });

  it("cancelling a queued scan means it never runs", async () => {
    const scan = await newScan();
    expect(await scans.cancelScan(scan.id, userId)).toBe(true);
    startWorker();
    await new Promise((r) => setTimeout(r, 2_000));
    expect((await read(scan.id)).status).toBe("canceled");
    expect((await jobOf(scan.id)).attempts).toBe(0);
  });

  it("only lets the owner cancel, and only while the scan is live", async () => {
    const scan = await newScan();
    expect(await scans.cancelScan(scan.id, "00000000-0000-0000-0000-000000000000")).toBe(false);
    expect((await read(scan.id)).status).toBe("queued");
    await db.sql()`update scans set status = 'completed' where id = ${scan.id}`;
    expect(await scans.cancelScan(scan.id, userId)).toBe(false);
  });

  it("a worker that lost its job stops scanning and can't change it", async () => {
    const d = tempDir();
    startWorker({ gitleaks: hangFirstTime(d) });
    const scan = await newScan();
    await waitUntil("the scan is hanging", () => existsSync(`${d}/pid`));
    const hung = Number(readFileSync(`${d}/pid`, "utf8"));
    await db.sql()`update jobs set locked_by = 'someone-else', locked_at = now() + interval '1 hour' where scan_id = ${scan.id}`;
    await waitUntil("the scan process is gone", () => !isAlive(hung), 10_000);
    await new Promise((r) => setTimeout(r, 500));
    const job = await jobOf(scan.id);
    expect(job.status).toBe("running");
    expect(job.locked_by).toBe("someone-else");
    expect((await read(scan.id)).status).toBe("running");
  });

  it("won't save results for a job this worker no longer owns", async () => {
    const scan = await newScan();
    const job = (await queue.claimJob("worker-a"))!;
    await scans.markRunning(scan.id, []);
    const result = { findings: [], score: 100, productionReady: true, counts: { critical: 0, high: 0, medium: 0, low: 0 }, meta: { tools: {}, filesScanned: 1, aiReviewedFiles: [], notes: [] } };
    expect(await scans.completeScan(scan.id, result, [], { id: job.id, workerId: "worker-b" })).toBe(false);
    expect((await read(scan.id)).status).toBe("running");
    expect(await scans.completeScan(scan.id, result, [], { id: job.id, workerId: "worker-a" })).toBe(true);
    expect((await read(scan.id)).status).toBe("completed");
  });

  it("fails a scan whose workers keep dying, and says which PR check to close", async () => {
    const scan = await scans.createScan({ userId, repoFullName: "acme/app", repoUrl: "https://github.com/acme/app.git", trigger: "pr", checkRunId: 7, installationId: 9 });
    await db.sql()`update jobs set status = 'running', locked_by = 'gone', locked_at = now() - interval '1 hour', attempts = ${queue.MAX_ATTEMPTS} where scan_id = ${scan.id}`;
    await scans.markRunning(scan.id, []);
    const { requeued, dead } = await queue.reapStaleJobs(60);
    expect(requeued).toEqual([]);
    expect(dead.map((d) => [d.id, String(d.check_run_id), String(d.installation_id)])).toEqual([[scan.id, "7", "9"]]);
    expect((await read(scan.id)).status).toBe("failed");
  });

  it("leaves a healthy job alone", async () => {
    const scan = await newScan();
    await queue.claimJob("worker-a");
    expect(await queue.reapStaleJobs(60)).toEqual({ requeued: [], dead: [] });
    expect((await jobOf(scan.id)).status).toBe("running");
  });

  it("says where a queued scan stands", async () => {
    const first = await newScan();
    const second = await newScan();
    expect(await queue.queueStatus(first.id)).toEqual({ ahead: 0, workersOnline: 0 });
    await queue.workerSeen("w1");
    expect(await queue.queueStatus(second.id)).toEqual({ ahead: 1, workersOnline: 1 });
  });
});
