import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeSampleRepo } from "../scripts/make-sample-repo";
import { ScanRejected } from "../src/scanner/errors";
import { parseGitHubRepo } from "../src/scanner/sandbox";
import type { Step } from "../src/scanner/types";
import { runScanInChild, ScanStopped } from "../src/worker/scan-runner";

const realPath = process.env.PATH;
const dirs: string[] = [];
const jobDirs = () => readdirSync(os.tmpdir()).filter((d) => d.startsWith("seaproof-job-"));
const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

afterEach(() => {
  process.env.PATH = realPath;
  delete process.env.DATABASE_URL;
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

function tempDir() {
  const d = mkdtempSync(path.join(os.tmpdir(), "seaproof-test-"));
  dirs.push(d);
  return d;
}

function sample(name: "secure-app" | "insecure-app" = "secure-app") {
  const { dir } = makeSampleRepo(name);
  dirs.push(dir);
  return { source: { kind: "local" as const, path: dir } };
}

/** Replace Gitleaks with a script. The scan runs it as a child of the scan process. */
function fakeGitleaks(script: string) {
  const bin = tempDir();
  writeFileSync(path.join(bin, "gitleaks"), `#!/bin/sh\n[ "$1" = "--version" ] && exit 0\n${script}\n`);
  chmodSync(path.join(bin, "gitleaks"), 0o755);
  process.env.PATH = `${bin}:${realPath}`;
}

async function waitFor(check: () => boolean, ms = 20_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("running a scan in its own process", { timeout: 120_000 }, () => {
  it("returns the same result and reports progress", async () => {
    const seen: Step[][] = [];
    const r = await runScanInChild(sample(), { timeoutMs: 110_000, onProgress: (s) => { seen.push(s); } });
    expect(r.productionReady).toBe(true);
    expect(r.score).toBe(100);
    expect(seen.at(-1)?.find((s) => s.key === "report")?.status).toBe("done");
  });

  it("keeps the worker's secrets away from the scan and everything it starts", async () => {
    process.env.DATABASE_URL = "postgres://should-not-leak";
    const out = path.join(tempDir(), "env.txt");
    fakeGitleaks(`env > "${out}"\nexit 2`);
    await runScanInChild(sample(), { timeoutMs: 110_000 });
    const seen = readFileSync(out, "utf8");
    expect(seen).toContain("PATH=");
    expect(seen).not.toContain("should-not-leak");
  });

  it("stops a scan that runs too long, along with everything it started", async () => {
    const pidFile = path.join(tempDir(), "pid");
    fakeGitleaks(`echo $$ > "${pidFile}"\nexec sleep 300`);
    const e = await runScanInChild(sample(), { timeoutMs: 15_000 }).catch((x) => x);
    expect(e).toBeInstanceOf(ScanRejected);
    expect(e.message).toMatch(/too long/);
    const pid = Number(readFileSync(pidFile, "utf8"));
    await waitFor(() => !isAlive(pid));
  });

  it("can be cancelled while it runs", async () => {
    const pidFile = path.join(tempDir(), "pid");
    fakeGitleaks(`echo $$ > "${pidFile}"\nexec sleep 300`);
    const ac = new AbortController();
    const running = runScanInChild(sample(), { timeoutMs: 110_000, signal: ac.signal });
    await waitFor(() => existsSync(pidFile));
    const pid = Number(readFileSync(pidFile, "utf8"));
    ac.abort("canceled");
    await expect(running).rejects.toBeInstanceOf(ScanStopped);
    await waitFor(() => !isAlive(pid));
  });

  it("survives the scan process crashing, and reports it as temporary", async () => {
    fakeGitleaks(`kill -9 $PPID\nsleep 300`);
    const e = await runScanInChild(sample(), { timeoutMs: 110_000 }).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(ScanRejected);
    expect(e).not.toBeInstanceOf(ScanStopped);
  });

  it("passes on problems the user has to fix", async () => {
    const e = await runScanInChild({ source: { kind: "local", path: "/nonexistent/seaproof" } }, { timeoutMs: 60_000 }).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    const rejected = await runScanInChild({ source: { kind: "github", repo: parseGitHubRepo("seaproof-test/none")!, ref: "-x" } }, { timeoutMs: 60_000 }).catch((x) => x);
    expect(rejected).toBeInstanceOf(ScanRejected);
  });

  it("always removes its temporary files", async () => {
    const before = jobDirs();
    fakeGitleaks(`kill -9 $PPID\nsleep 300`);
    await runScanInChild(sample(), { timeoutMs: 110_000 }).catch(() => {});
    process.env.PATH = realPath;
    await runScanInChild(sample(), { timeoutMs: 110_000 });
    expect(jobDirs().filter((d) => !before.includes(d))).toEqual([]);
  });
});
