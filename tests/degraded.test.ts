import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSampleRepo } from "../scripts/make-sample-repo";
import { runScan, type ScanInput } from "../src/scanner";
import { resetBinaryCache } from "../src/scanner/exec";
import type { Step } from "../src/scanner/types";

// The secure sample scores 100 on a full scan, so in every test below the
// degraded check is the only thing that can take "production ready" away.
const dirs: string[] = [];
const realPath = process.env.PATH;

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.PATH = realPath;
  resetBinaryCache();
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

async function scanSecureApp(extra: Partial<ScanInput> = {}, prepare?: (dir: string) => void) {
  const { dir } = makeSampleRepo("secure-app");
  dirs.push(dir);
  prepare?.(dir);
  const steps: Partial<Record<Step["key"], Step>> = {};
  const result = await runScan({ source: { kind: "local", path: dir }, onProgress: (s) => { for (const x of s) steps[x.key] = x; }, ...extra });
  return { result, steps, notes: result.meta.notes.join(" ") };
}

function tempBin() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "seaproof-testbin-"));
  dirs.push(dir);
  return dir;
}

/** Put a broken copy of a scanner first on PATH: it starts, then exits with an error. */
function breakTool(name: string) {
  const bin = tempBin();
  writeFileSync(path.join(bin, name), "#!/bin/sh\nexit 2\n");
  chmodSync(path.join(bin, name), 0o755);
  process.env.PATH = `${bin}:${realPath}`;
  resetBinaryCache();
}

/** A PATH with only these tools on it, so anything else counts as not installed. */
function onlyTools(...names: string[]) {
  const bin = tempBin();
  for (const n of names) symlinkSync(execFileSync("which", [n], { encoding: "utf8" }).trim(), path.join(bin, n));
  process.env.PATH = bin;
  resetBinaryCache();
}

describe("a scan that couldn't fully check the app is never certified", { timeout: 120_000 }, () => {
  it("still certifies the secure sample when every check ran", async () => {
    const { result } = await scanSecureApp();
    expect(result.productionReady).toBe(true);
  });

  it("when the vulnerability database is unreachable", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 400 }));
    const { result, steps, notes } = await scanSecureApp();
    expect(result.meta.tools.osv).toBe("failed");
    expect(steps.dependencies?.status).toBe("failed");
    expect(result.productionReady).toBe(false);
    expect(notes).toMatch(/vulnerability database/);
  });

  it("when the details of a known vulnerability can't be fetched", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (!url.endsWith("/v1/querybatch")) return new Response("", { status: 400 });
      const { queries } = JSON.parse(String(init?.body)) as { queries: unknown[] };
      return Response.json({ results: queries.map((_, i) => (i === 0 ? { vulns: [{ id: "GHSA-details-unavailable" }] } : {})) });
    });
    const { result, steps } = await scanSecureApp();
    expect(result.findings.map((f) => f.ruleId)).toContain("deps.vulnerable");
    expect(steps.dependencies?.status).toBe("failed");
    expect(result.productionReady).toBe(false);
  });

  it("when Gitleaks crashes", async () => {
    breakTool("gitleaks");
    const { result, steps, notes } = await scanSecureApp();
    expect(result.meta.tools.gitleaks).toBe("failed");
    expect(steps.secrets?.status).toBe("failed");
    expect(result.productionReady).toBe(false);
    expect(notes).toMatch(/old commits/);
  });

  it("when Gitleaks isn't installed", async () => {
    onlyTools("git", "semgrep");
    const { result, steps } = await scanSecureApp();
    expect(result.meta.tools.gitleaks).toBe("missing");
    expect(steps.secrets?.status).toBe("failed");
    expect(result.productionReady).toBe(false);
  });

  it("when Semgrep crashes", async () => {
    breakTool("semgrep");
    const { result, steps, notes } = await scanSecureApp();
    expect(result.meta.tools.semgrep).toBe("failed");
    expect(steps.input?.status).toBe("failed");
    expect(result.productionReady).toBe(false);
    expect(notes).toMatch(/basic check/);
  });

  it("when Semgrep isn't installed", async () => {
    onlyTools("git", "gitleaks");
    const { result, steps } = await scanSecureApp();
    expect(result.meta.tools.semgrep).toBe("missing");
    expect(steps.input?.status).toBe("failed");
    expect(result.productionReady).toBe(false);
  });

  it("when the live site asked for can't be reached", async () => {
    process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS = "1";
    try {
      const { result, steps, notes } = await scanSecureApp({ siteUrl: "http://127.0.0.1:1/" });
      expect(steps.live_site?.status).toBe("failed");
      expect(result.productionReady).toBe(false);
      expect(notes).toMatch(/couldn't reach/);
    } finally {
      delete process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS;
    }
  });

  it("when the repo is too big to read completely", async () => {
    const { result, notes } = await scanSecureApp({}, (dir) => {
      mkdirSync(path.join(dir, "notes"));
      for (let i = 0; i < 8_001; i++) writeFileSync(path.join(dir, "notes", `n${i}.txt`), "x");
    });
    expect(result.productionReady).toBe(false);
    expect(notes).toMatch(/too big/);
  });
});

describe("progress updates", { timeout: 120_000 }, () => {
  it("can fail without failing the scan or any check", async () => {
    const { dir } = makeSampleRepo("secure-app");
    dirs.push(dir);
    const result = await runScan({ source: { kind: "local", path: dir }, onProgress: () => { throw new Error("database blip"); } });
    expect(result.productionReady).toBe(true);
    expect(result.meta.notes).toEqual([]);
  });
});
