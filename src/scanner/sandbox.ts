import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ScanRejected } from "./errors";
import { run } from "./exec";

import { type ParsedRepo } from "./repo-url";

export { parseGitHubRepo, type ParsedRepo } from "./repo-url";

/** Files a repo could use to hide its own problems from our scanners. */
const SCANNER_CONFIG = [".gitleaks.toml", ".gitleaksignore", ".semgrepignore", ".semgrep.yml", ".semgrep.yaml", ".semgrep"];

/** How many commits we search for secrets that were deleted from the current code. */
export const HISTORY_DEPTH = 500;
const MAX_REPO_KB = 1_000_000;

export interface Sandbox { dir: string; commitSha?: string; historyCapped?: boolean; cleanup: () => Promise<void>; }

async function makeDir(): Promise<Sandbox> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "seaproof-repo-"));
  return { dir, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

async function finish(sb: Sandbox) {
  for (const f of SCANNER_CONFIG) await fs.rm(path.join(sb.dir, f), { recursive: true, force: true });
}

const SAFE_GIT = ["-c", "core.hooksPath=/dev/null", "-c", "core.symlinks=false", "-c", "core.fsmonitor=false", "-c", "protocol.file.allow=never", "-c", "submodule.recurse=false", "-c", "advice.detachedHead=false"];

const AUTH_FAILURE = /not found|could not read username|authentication failed|403/;

/** Best effort: GitHub's size figure lets us refuse a giant repo before downloading it. */
async function refuseIfHuge(repo: ParsedRepo, token?: string) {
  const res = await fetch(`https://api.github.com/repos/${repo.fullName}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "seaproof", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const info = res?.ok ? ((await res.json().catch(() => null)) as { size?: number } | null) : null;
  if ((info?.size ?? 0) > MAX_REPO_KB) throw new ScanRejected("This repository is too big for us to scan (over 1 GB). Remove large files from it, or scan a smaller repository.");
}

/** Git's error text is for our logs. ScanRejected is for problems the user can act on. */
function fetchError(stderr: string, ref?: string): Error {
  const msg = stderr.toLowerCase();
  if (msg.includes("couldn't find remote ref")) {
    return new ScanRejected(ref ? `We couldn't find the branch or commit "${ref}" in that repository.` : "We couldn't find any code in that repository. If it's empty, push your code and scan again.");
  }
  if (AUTH_FAILURE.test(msg)) return new ScanRejected("We couldn't open that repository. If it's private, connect your GitHub account with private repo access.");
  return new Error(`git fetch failed: ${stderr.trim().slice(0, 200)}`);
}

/**
 * Shallow-fetch a GitHub repo into a fresh temp dir. Never runs hooks, never follows
 * symlinks, never fetches submodules or LFS blobs. The token is passed through
 * environment-based git config (not argv, not the URL).
 */
export async function cloneGitHub(repo: ParsedRepo, opts: { token?: string; ref?: string } = {}): Promise<Sandbox> {
  const sb = await makeDir();
  try {
    await refuseIfHuge(repo, opts.token);
    const anonymous: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1", GIT_ASKPASS: "/bin/false" };
    const env = { ...anonymous };
    if (opts.token) {
      const basic = Buffer.from(`x-access-token:${opts.token}`).toString("base64");
      Object.assign(env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `http.https://github.com/.extraHeader`, GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}` });
    }
    const git = (args: string[], timeoutMs = 60_000, useEnv = env) => run("git", [...SAFE_GIT, ...args], { cwd: sb.dir, env: useEnv, timeoutMs });
    await git(["init", "-q", "."]);
    await git(["remote", "add", "origin", repo.cloneUrl]);
    const ref = opts.ref || "HEAD";
    if (ref.startsWith("-")) throw new ScanRejected("That branch name isn't valid.");
    const fetchArgs = ["fetch", "-q", "--no-tags", "--no-recurse-submodules", `--depth=${HISTORY_DEPTH}`, "origin", ref];
    let fetched = await git(fetchArgs, 240_000);
    // A revoked or expired token shouldn't stop us reading a public repo.
    if (fetched.code !== 0 && opts.token && AUTH_FAILURE.test(fetched.stderr.toLowerCase())) fetched = await git(fetchArgs, 240_000, anonymous);
    if (fetched.code !== 0) throw fetchError(fetched.stderr, opts.ref);
    const co = await git(["checkout", "-q", "FETCH_HEAD"], 120_000);
    if (co.code !== 0) throw new Error(`git checkout failed: ${co.stderr.trim().slice(0, 200)}`);
    sb.commitSha = (await git(["rev-parse", "HEAD"])).stdout.trim();
    sb.historyCapped = Number((await git(["rev-list", "--count", "HEAD"])).stdout.trim()) >= HISTORY_DEPTH;
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
