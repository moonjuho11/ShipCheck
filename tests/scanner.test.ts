import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSampleRepo } from "../scripts/make-sample-repo";
import { runScan } from "../src/scanner";
import type { Finding, ScanResult } from "../src/scanner/types";

// Every planted problem in samples/insecure-app, as [ruleId, file].
const EXPECTED: Record<string, [string, string | undefined][]> = {
  secrets: [
    ["secrets.committed-secret", ".env"],           // Stripe live key, service-role JWT, AWS, DB password
    ["secrets.committed-secret", "src/lib/ai.ts"],  // hard-coded OpenAI key
    ["secrets.env-file-committed", ".env"],
    ["secrets.env-not-gitignored", ".gitignore"],
    ["secrets.public-env-secret", ".env"],          // NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
    ["secrets.history-secret", "config/deploy.ts"], // GitHub token deleted in a later commit
  ],
  database: [
    ["db.rls-disabled", "supabase/migrations/20240101000000_init.sql"],   // invoices
    ["db.open-policy", "supabase/migrations/20240101000000_init.sql"],    // profiles using(true)
    ["db.firebase-open-rules", "firestore.rules"],                         // test mode
    ["db.service-role-in-client", "src/components/AdminPanel.tsx"],
  ],
  auth: [
    ["auth.unprotected-route", "src/app/api/admin/users/route.ts"],
    ["auth.idor", "src/app/api/invoices/[id]/route.ts"],
    ["auth.server-action-no-auth", "src/app/actions.ts"],
    ["auth.webhook-unverified", "src/app/api/stripe-webhook/route.ts"],
  ],
  input: [
    ["input.sql-injection", "src/app/api/search/route.ts"],
    ["input.nosql-injection", "server/legacy.js"],
    ["input.command-injection", "server/legacy.js"],
    ["input.xss", "src/components/Comment.tsx"],
    ["input.ssrf", "server/legacy.js"],
    ["input.unvalidated-upload", "src/app/api/upload/route.ts"],
  ],
  dependencies: [
    ["deps.vulnerable", "package-lock.json"],
  ],
  production: [
    ["prod.no-error-handling", "src/app/api/search/route.ts"],
    ["prod.no-rate-limit-auth", "src/app/api/login/route.ts"],
    ["prod.no-rate-limit-payment", "src/app/api/checkout/route.ts"],
    ["prod.no-backups", undefined],
  ],
};

const has = (r: ScanResult, ruleId: string, file?: string) => r.findings.some((f) => f.ruleId === ruleId && (file === undefined || f.file === file));

let insecure: ScanResult;
let secure: ScanResult;
let secrets: Record<string, string>;
const dirs: string[] = [];

beforeAll(async () => {
  const bad = makeSampleRepo("insecure-app");
  const good = makeSampleRepo("secure-app");
  dirs.push(bad.dir, good.dir);
  secrets = bad.secrets;
  [insecure, secure] = await Promise.all([
    runScan({ source: { kind: "local", path: bad.dir } }),
    runScan({ source: { kind: "local", path: good.dir } }),
  ]);
});
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("insecure sample app", () => {
  for (const [category, expected] of Object.entries(EXPECTED)) {
    it(`finds every planted ${category} problem`, () => {
      const missing = expected.filter(([rule, file]) => !has(insecure, rule, file));
      expect(missing).toEqual([]);
    });
  }

  it("uses the real scanners (Gitleaks, Semgrep, OSV)", () => {
    expect(insecure.meta.tools).toMatchObject({ gitleaks: "ok", semgrep: "ok", osv: "ok" });
  });

  it("flags the famous Next.js middleware-bypass version as critical", () => {
    const next = insecure.findings.find((f) => f.ruleId === "deps.vulnerable" && f.title.includes('"next"'));
    expect(next?.severity).toBe("critical");
    expect(next?.fixPrompt).toMatch(/Upgrade `next` to version \d+/);
  });

  it("caps transitive dependency problems at medium", () => {
    const qs = insecure.findings.find((f) => f.ruleId === "deps.vulnerable" && f.title.includes('"qs"'));
    expect(qs?.severity).toBe("medium");
  });

  it("does not flag the Supabase anon key (it is public by design)", () => {
    const envLine3 = insecure.findings.filter((f) => f.file === ".env" && f.line === 3);
    expect(envLine3).toEqual([]);
    expect(insecure.findings.some((f) => f.evidence && secrets.__SUPABASE_ANON_JWT__.startsWith(f.evidence.split("•")[0]) && f.line === 3)).toBe(false);
  });

  it("does not flag the safe todos table or the public search route", () => {
    expect(insecure.findings.some((f) => f.ruleId === "db.rls-disabled" && f.title.includes("todos"))).toBe(false);
    expect(insecure.findings.some((f) => f.ruleId === "auth.unprotected-route" && f.file?.includes("search"))).toBe(false);
  });

  it("never stores a full secret", () => {
    const blob = JSON.stringify(insecure.findings);
    for (const s of Object.values(secrets)) expect(blob).not.toContain(s);
  });

  it("gives every finding plain-English text and a copy-paste fix prompt with a location", () => {
    for (const f of insecure.findings) {
      expect(f.title.length).toBeGreaterThan(10);
      expect(f.explanation.length).toBeGreaterThan(20);
      expect(f.whyItMatters.length).toBeGreaterThan(20);
      expect(f.fixPrompt).toMatch(/^Fix a security problem in my app\./);
      expect(f.fixPrompt).toMatch(/Please:\n1\./);
      if (f.file) expect(f.fixPrompt).toContain(f.file);
    }
  });

  it("scores it as not production ready", () => {
    expect(insecure.productionReady).toBe(false);
    expect(insecure.score).toBeLessThan(50);
    expect(insecure.counts.critical).toBeGreaterThan(5);
  });
});

describe("secure sample app", () => {
  it("has no findings and is production ready", () => {
    expect(secure.findings.map((f: Finding) => `${f.ruleId} ${f.file}`)).toEqual([]);
    expect(secure.productionReady).toBe(true);
    expect(secure.score).toBe(100);
  });
});

describe("without Gitleaks or Semgrep installed", () => {
  it("still catches the worst problems with built-in detectors", async () => {
    const { dir } = makeSampleRepo("insecure-app");
    dirs.push(dir);
    const r = await runScan({ source: { kind: "local", path: dir }, tools: { gitleaks: false, semgrep: false } });
    expect(r.meta.tools.gitleaks).toBe("skipped");
    for (const [rule, file] of [
      ["secrets.committed-secret", "src/lib/ai.ts"],
      ["input.sql-injection", "src/app/api/search/route.ts"],
      ["input.xss", "src/components/Comment.tsx"],
      ["input.command-injection", "server/legacy.js"],
      ["input.nosql-injection", "server/legacy.js"],
    ]) expect(has(r, rule, file), `${rule} ${file}`).toBe(true);
  });
});

describe("progress steps", () => {
  it("reports each step in order and skips live/AI when not configured", async () => {
    const { dir } = makeSampleRepo("secure-app");
    dirs.push(dir);
    const snapshots: string[][] = [];
    await runScan({ source: { kind: "local", path: dir }, onProgress: (s) => { snapshots.push(s.map((x) => `${x.key}:${x.status}`)); } });
    const last = snapshots.at(-1)!;
    expect(last).toContain("live_site:skipped");
    expect(last).toContain("ai_review:skipped");
    expect(last.filter((x) => x.endsWith(":done")).length).toBe(8);
    expect(snapshots.some((s) => s.includes("secrets:running"))).toBe(true);
  });
});
