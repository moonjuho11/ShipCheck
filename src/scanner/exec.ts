import { execFile } from "node:child_process";

export interface ExecResult { code: number; stdout: string; stderr: string; }

/** Run a binary (never a shell) with a timeout. Resolves even on non-zero exit. */
export function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; maxBuffer?: number } = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
      env: opts.env ?? process.env,
      killSignal: "SIGKILL",
    }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === "ENOENT") return reject(Object.assign(new Error(`${cmd} not installed`), { code: "ENOENT" }));
      if (err && (err as { killed?: boolean }).killed) return reject(new Error(`${cmd} timed out`));
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

let cache: Record<string, boolean> = {};
export async function hasBinary(name: string): Promise<boolean> {
  if (name in cache) return cache[name];
  try { await run(name, ["--version"], { timeoutMs: 20_000 }); cache[name] = true; }
  catch (e) { cache[name] = (e as { code?: string }).code !== "ENOENT" ? true : false; }
  return cache[name];
}
export function resetBinaryCache() { cache = {}; }
