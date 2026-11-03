// Needs TEST_DATABASE_URL (a throwaway database) in the environment or .env.local.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

try { process.loadEnvFile(".env.local"); } catch { /* CI sets it directly */ }
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("scan limits", { timeout: 60_000 }, () => {
  let db: typeof import("../src/lib/db");
  let scans: typeof import("../src/lib/scans");
  let userId: string;
  const start = (repo: string) => scans.startManualScan({ userId, repoFullName: repo, repoUrl: `https://github.com/${repo}.git` });

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    db = await import("../src/lib/db");
    scans = await import("../src/lib/scans");
  });

  beforeEach(async () => {
    await db.sql()`truncate users, jobs, worker_heartbeats cascade`;
    [{ id: userId }] = await db.sql()<{ id: string }[]>`
      insert into users (github_id, github_login) values (${Math.floor(Math.random() * 1e9)}, 'tester') returning id`;
  });

  afterAll(async () => { await db?.sql().end({ timeout: 5 }); });

  it("simultaneous requests can't get past the free limit", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => start(`acme/app-${i}`)));
    expect(results.filter((r) => "scan" in r)).toHaveLength(1);
    const [{ n }] = await db.sql()<{ n: number }[]>`select count(*)::int as n from scans where user_id = ${userId}`;
    expect(n).toBe(1);
  });

  it("asking twice for the same repo returns the scan already running", async () => {
    const [a, b] = await Promise.all([start("acme/app"), start("acme/app")]);
    expect("scan" in a && "scan" in b && a.scan.id === b.scan.id).toBe(true);
  });

  it("a cancelled scan doesn't use up the free scan", async () => {
    const first = await start("acme/app");
    expect("scan" in first).toBe(true);
    if ("scan" in first) await scans.cancelScan(first.scan.id, userId);
    expect("scan" in (await start("acme/other"))).toBe(true);
  });

  it("a finished free scan uses it up", async () => {
    const first = await start("acme/app");
    if ("scan" in first) await db.sql()`update scans set status = 'completed' where id = ${first.scan.id}`;
    expect("scan" in (await start("acme/other"))).toBe(false);
  });
});
