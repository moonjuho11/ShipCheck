import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./exec";

import { type ParsedRepo } from "./repo-url";

export { parseGitHubRepo, type ParsedRepo } from "./repo-url";

/** Files a repo could use to hide its own problems from our scanners. */
const SCANNER_CONFIG = [".gitleaks.toml", ".gitleaksignore", ".semgrepignore", ".semgrep.yml", ".semgrep.yaml", ".semgrep"];

export interface Sandbox { dir: string; commitSha?: string; cleanup: () => Promise<void>; }

async function makeDir(): Promise<Sandbox> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "seaproof-repo-"));
  return { dir, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

async function finish(sb: Sandbox) {
  for (const f of SCANNER_CONFIG) await fs.rm(path.join(sb.dir, f), { recursive: true, force: true });
}

const SAFE_GIT = ["-c", "core.hooksPath=/dev/null", "-c", "core.symlinks=false", "-c", "core.fsmonitor=false", "-c", "protocol.file.allow=never", "-c", "submodule.recurse=false", "-c", "advice.detachedHead=false"];

/**
 * Shallow-fetch a GitHub repo into a fresh temp dir. Never runs hooks, never follows
 * symlinks, never fetches submodules or LFS blobs. The token is passed through
 * environment-based git config (not argv, not the URL).
 */
export async function cloneGitHub(repo: ParsedRepo, opts: { token?: string; ref?: string; depth?: number } = {}): Promise<Sandbox> {
  const sb = await makeDir();
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1", GIT_ASKPASS: "/bin/false" };
    if (opts.token) {
      const basic = Buffer.from(`x-access-token:${opts.token}`).toString("base64");
      Object.assign(env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `http.https://github.com/.extraHeader`, GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}` });
    }
    const git = (args: string[], timeoutMs = 60_000) => run("git", [...SAFE_GIT, ...args], { cwd: sb.dir, env, timeoutMs });
    await git(["init", "-q", "."]);
    await git(["remote", "add", "origin", repo.cloneUrl]);
    const ref = opts.ref || "HEAD";
    if (ref.startsWith("-")) throw new Error("Invalid ref");
    const fetch = await git(["fetch", "-q", "--no-tags", "--no-recurse-submodules", `--depth=${opts.depth ?? 30}`, "origin", ref], 240_000);
    if (fetch.code !== 0) {
      const msg = fetch.stderr.toLowerCase();
      if (/not found|repository .* not found|could not read username|authentication failed|403/.test(msg)) {
        throw new Error("We couldn't open that repository. If it's private, connect your GitHub account with private repo access.");
      }
      throw new Error(`Couldn't download the repository (${fetch.stderr.trim().slice(0, 200)})`);
    }
    const co = await git(["checkout", "-q", "FETCH_HEAD"], 120_000);
    if (co.code !== 0) throw new Error(`Couldn't check out the code (${co.stderr.trim().slice(0, 200)})`);
    sb.commitSha = (await git(["rev-parse", "HEAD"])).stdout.trim();
    await finish(sb);
    return sb;
  } catch (e) {
    await sb.cleanup();
    throw e;
  }
}

/** Copy a local folder (dev tools / tests) into a sandbox so we never modify the original. */
export async function copyLocal(src: string): Promise<Sandbox> {
  const sb = await makeDir();
  try {
    await fs.cp(src, sb.dir, {
      recursive: true, verbatimSymlinks: true,
      filter: (p) => !/(^|[\\/])node_modules([\\/]|$)/.test(path.relative(src, p)),
    });
    const head = await run("git", ["rev-parse", "HEAD"], { cwd: sb.dir }).catch(() => null);
    if (head?.code === 0) sb.commitSha = head.stdout.trim();
    await finish(sb);
    return sb;
  } catch (e) {
    await sb.cleanup();
    throw e;
  }
}
