import { fork } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ScanRejected } from "@/scanner/errors";
import type { ScanInput } from "@/scanner";
import type { ScanResult, Step } from "@/scanner/types";

/** The scan was stopped on purpose (cancelled, or the worker is shutting down). */
export class ScanStopped extends Error {}

export type ChildScanInput = Omit<ScanInput, "onProgress" | "anthropicClient">;

type ChildMessage =
  | { type: "progress"; steps: Step[] }
  | { type: "result"; result: ScanResult }
  | { type: "error"; message: string; rejected: boolean };

const CHILD = path.join(process.cwd(), "src", "worker", "scan-child.ts");
const JOB_DIR_PREFIX = "seaproof-job-";
const MEMORY_MB = Number(process.env.WORKER_SCAN_MEMORY_MB || 1024);
// All a scan needs from the environment. Anything else, like DATABASE_URL, stays out.
const CHILD_ENV = ["PATH", "HOME", "LANG", "LC_ALL", "OSV_API_URL", "SEAPROOF_ALLOW_PRIVATE_TARGETS"];

/**
 * Run a scan in its own process group with its own temp dir. The whole group is killed and
 * the temp dir removed however the scan ends, including when it crashes or hangs.
 */
export async function runScanInChild(input: ChildScanInput, opts: { timeoutMs: number; signal?: AbortSignal; onProgress?: (steps: Step[]) => void }): Promise<ScanResult> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), JOB_DIR_PREFIX));
  try {
    return await new Promise<ScanResult>((resolve, reject) => {
      const env = Object.fromEntries(CHILD_ENV.flatMap((k) => (process.env[k] ? [[k, process.env[k]]] : [])));
      const child = fork(CHILD, [], {
        execArgv: ["--import", "tsx", `--max-old-space-size=${MEMORY_MB}`],
        env: { ...env, TMPDIR: tmp, NODE_ENV: process.env.NODE_ENV },
        detached: true,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      let outcome: { result: ScanResult } | { error: Error } | undefined;
      let exitedWith: string | undefined;
      let disconnected = false;
      const killGroup = () => { try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already gone */ } };
      const stop = (error: Error) => { outcome ??= { error }; killGroup(); };
      const onAbort = () => stop(new ScanStopped(String(opts.signal?.reason)));
      const timer = setTimeout(() => stop(new ScanRejected("This repository took too long to scan, so we stopped. If it's very large, try scanning a smaller one.")), opts.timeoutMs);
      const cleanUp = () => { clearTimeout(timer); opts.signal?.removeEventListener("abort", onAbort); killGroup(); };

      // A result can still be in the pipe when "exit" fires, so wait for both.
      const settle = () => {
        if (exitedWith === undefined || !disconnected) return;
        cleanUp();
        if (!outcome) reject(new Error(`scan process died (${exitedWith})`));
        else if ("error" in outcome) reject(outcome.error);
        else resolve(outcome.result);
      };
      child.on("exit", (code, signal) => { exitedWith = String(signal ?? code); settle(); });
      child.on("disconnect", () => { disconnected = true; settle(); });
      child.on("error", (e) => { cleanUp(); reject(e); });
      child.on("message", (m: ChildMessage) => {
        if (m.type === "progress") opts.onProgress?.(m.steps);
        else if (m.type === "result") outcome ??= { result: m.result };
        else outcome ??= { error: m.rejected ? new ScanRejected(m.message) : new Error(m.message) };
      });

      if (opts.signal?.aborted) onAbort();
      else opts.signal?.addEventListener("abort", onAbort, { once: true });
      child.send(input);
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** Remove temp dirs left behind if a worker was killed outright. */
export async function sweepOldJobDirs(olderThanMs = 3_600_000) {
  const root = os.tmpdir();
  for (const name of await fs.readdir(root)) {
    if (!name.startsWith(JOB_DIR_PREFIX)) continue;
    const dir = path.join(root, name);
    const st = await fs.stat(dir).catch(() => null);
    if (st && Date.now() - st.mtimeMs > olderThanMs) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
