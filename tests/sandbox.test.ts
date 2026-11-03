import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScanRejected } from "../src/scanner/errors";
import { cloneGitHub, parseGitHubRepo } from "../src/scanner/sandbox";

const repo = parseGitHubRepo("acme/app")!;
const realPath = process.env.PATH;
const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.PATH = realPath;
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

/** A stand-in `git`: `fetch` runs the given shell snippet, everything else succeeds. */
function fakeGit(onFetch: string, other = "exit 0") {
  const bin = mkdtempSync(path.join(os.tmpdir(), "seaproof-testbin-"));
  dirs.push(bin);
  writeFileSync(path.join(bin, "git"), `#!/bin/sh\ncase "$*" in\n  *" fetch "*) ${onFetch} ;;\n  *) ${other} ;;\nesac\nexit 0\n`);
  chmodSync(path.join(bin, "git"), 0o755);
  process.env.PATH = `${bin}:${realPath}`;
  vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
}

const failFetch = (stderr: string) => fakeGit(`echo "${stderr}" >&2; exit 128`);

describe("downloading a repository", () => {
  it.each([
    ["remote: Repository not found.", /couldn't open that repository/],
    ["fatal: could not read Username for 'https://github.com': terminal prompts disabled", /couldn't open that repository/],
    ["fatal: couldn't find remote ref HEAD", /couldn't find any code/],
  ])("explains %s and doesn't retry it", async (stderr, message) => {
    failFetch(stderr);
    const e = await cloneGitHub(repo).catch((x) => x);
    expect(e).toBeInstanceOf(ScanRejected);
    expect(e.message).toMatch(message);
  });

  it("names the missing branch when a specific one was asked for", async () => {
    failFetch("fatal: couldn't find remote ref refs/heads/nope");
    const e = await cloneGitHub(repo, { ref: "nope" }).catch((x) => x);
    expect(e).toBeInstanceOf(ScanRejected);
    expect(e.message).toMatch(/couldn't find the branch or commit "nope"/);
  });

  it("treats a network failure as temporary", async () => {
    failFetch("fatal: unable to access 'https://github.com/acme/app.git/': Could not resolve host: github.com");
    const e = await cloneGitHub(repo).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(ScanRejected);
  });

  it("falls back to anonymous access when a stored token no longer works", async () => {
    fakeGit(`if [ -n "$GIT_CONFIG_COUNT" ]; then echo "fatal: Authentication failed" >&2; exit 128; fi`);
    const sb = await cloneGitHub(repo, { token: "revoked" });
    dirs.push(sb.dir);
    expect(sb.dir).toBeTruthy();
  });

  it("refuses a repository GitHub reports as too big, before downloading it", async () => {
    fakeGit(`echo "should not fetch" >&2; exit 128`);
    vi.stubGlobal("fetch", async () => Response.json({ size: 5_000_000 }));
    const e = await cloneGitHub(repo).catch((x) => x);
    expect(e).toBeInstanceOf(ScanRejected);
    expect(e.message).toMatch(/too big/);
  });

  it("carries on if GitHub can't say how big the repository is", async () => {
    fakeGit("exit 0");
    const sb = await cloneGitHub(repo);
    dirs.push(sb.dir);
    expect(sb.dir).toBeTruthy();
  });

  it("flags when history was cut off at the commit limit", async () => {
    fakeGit("exit 0", `case "$*" in *rev-list*) echo 500 ;; esac; exit 0`);
    const sb = await cloneGitHub(repo);
    dirs.push(sb.dir);
    expect(sb.historyCapped).toBe(true);
  });

  it("doesn't flag a repository with fewer commits than the limit", async () => {
    fakeGit("exit 0", `case "$*" in *rev-list*) echo 12 ;; esac; exit 0`);
    const sb = await cloneGitHub(repo);
    dirs.push(sb.dir);
    expect(sb.historyCapped).toBe(false);
  });
});
