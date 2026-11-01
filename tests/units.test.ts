import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { analyzeFirebaseRules, analyzeSupabaseSql } from "../src/scanner/checks/database";
import { cmpVersion } from "../src/scanner/checks/dependencies";
import { detectProject } from "../src/scanner/files";
import { aiReview } from "../src/scanner/llm";
import { enrich } from "../src/scanner/rules";
import { parseGitHubRepo } from "../src/scanner/sandbox";
import { score } from "../src/scanner/score";
import { findSecrets } from "../src/scanner/secret-patterns";
import type { ScanContext } from "../src/scanner/types";

describe("score", () => {
  it("is 100 and production ready with nothing found", () => {
    expect(score([])).toMatchObject({ score: 100, productionReady: true });
  });
  it("caps at 49 with any critical and 74 with any high", () => {
    expect(score([{ severity: "critical" }]).score).toBe(49);
    expect(score([{ severity: "high" }]).score).toBe(74);
    expect(score([{ severity: "high" }]).productionReady).toBe(false);
  });
  it("allows a few low/medium issues to still pass", () => {
    const r = score([{ severity: "medium" }, { severity: "medium" }, { severity: "low" }]);
    expect(r).toMatchObject({ score: 93, productionReady: true });
  });
  it("never goes below 0", () => {
    expect(score(Array(50).fill({ severity: "critical" })).score).toBe(0);
  });
});

describe("parseGitHubRepo", () => {
  it("accepts common forms", () => {
    for (const u of ["https://github.com/Acme/my-app", "github.com/Acme/my-app.git", "Acme/my-app", "https://github.com/Acme/my-app/tree/main/src"]) {
      expect(parseGitHubRepo(u), u).toMatchObject({ fullName: "acme/my-app", cloneUrl: "https://github.com/Acme/my-app.git" });
    }
  });
  it("rejects anything that could reach git as a flag, path or other host", () => {
    for (const u of ["--upload-pack=touch /tmp/x", "https://evil.com/a/b", "../../etc/passwd", "file:///etc", "a/..", "-x/y", "owner/repo;rm -rf /", "https://github.com/a"]) {
      expect(parseGitHubRepo(u), u).toBeNull();
    }
  });
});

describe("Supabase SQL analysis", () => {
  it("handles quoted names, IF NOT EXISTS, comments and later RLS migrations", () => {
    const f = analyzeSupabaseSql([
      { path: "supabase/migrations/1.sql", content: `create table if not exists "public"."posts" (id int);\n-- alter table posts enable row level security;\ncreate table private.secret (id int);` },
      { path: "supabase/migrations/2.sql", content: `create table public.comments (id int);\nalter table only public.comments enable row level security;\ncreate policy p on comments for select using ( true );` },
    ]);
    expect(f.map((x) => `${x.ruleId}:${x.vars?.table}`).sort()).toEqual(["db.open-read-policy:comments", "db.rls-disabled:posts"]);
  });
  it("ignores policies that only apply to the service role", () => {
    expect(analyzeSupabaseSql([{ path: "a.sql", content: "create table t(id int); alter table t enable row level security; create policy x on t for all to service_role using (true);" }])).toEqual([]);
  });
});

describe("Firebase rules", () => {
  it("flags open rules but not authenticated rules", () => {
    expect(analyzeFirebaseRules([{ path: "firestore.rules", content: "match /{d=**} { allow read, write: if true; }" }])).toHaveLength(1);
    expect(analyzeFirebaseRules([{ path: "firestore.rules", content: "match /{d=**} { allow read, write: if request.auth != null; }" }])).toHaveLength(0);
    expect(analyzeFirebaseRules([{ path: "database.rules.json", content: '{"rules":{".read":true,".write":false}}' }])).toHaveLength(1);
  });
});

describe("secret detection", () => {
  it("ignores Firebase web config keys and placeholder DB URLs", () => {
    const key = "AIza" + "SyD3x4mpleK3yThatIsThirtyFiveCh";
    expect(findSecrets(`const firebaseConfig = { apiKey: "${key}aaaa", authDomain: "x.firebaseapp.com" }`)).toEqual([]);
    expect(findSecrets("DATABASE_URL=postgres://postgres:postgres@localhost:5432/app")).toEqual([]);
    expect(findSecrets("postgres://user:<password>@db.example.com/app")).toEqual([]);
  });
});

describe("version compare", () => {
  it("orders semver-ish versions", () => {
    expect(cmpVersion("14.2.25", "14.10.0")).toBeLessThan(0);
    expect(cmpVersion("4.17.21", "4.17.15")).toBeGreaterThan(0);
    expect(cmpVersion("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("AI review merge", () => {
  const routeFile = { path: "src/app/api/projects/[id]/route.ts", content: "export async function DELETE(req, { params }) {\n  const user = await getUser();\n  await db.project.delete({ where: { id: params.id } });\n  return Response.json({ ok: true });\n}\n// key: " + ["sk", "live", "abcdefghijklmnopqrstuvwxyz123456"].join("_") };
  const ctx: ScanContext = { root: "/tmp/x", files: [routeFile], byPath: new Map([[routeFile.path, routeFile]]), project: detectProject([]), hasGitHistory: false };

  function fakeClient(answer: object, capture: { prompt?: string }): Anthropic {
    return {
      beta: { messages: { stream: (params: { messages: { content: string }[] }) => {
        capture.prompt = params.messages[0].content;
        return { finalMessage: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(answer) }] }) };
      } } },
    } as unknown as Anthropic;
  }

  it("rewrites explanations, dismisses heuristic false positives only, adds grounded findings and redacts secrets", async () => {
    const idor = enrich({ ruleId: "auth.idor", source: "analyzer", file: routeFile.path, line: 3 });
    const errors = enrich({ ruleId: "prod.no-error-handling", source: "analyzer", file: routeFile.path, line: 1, vars: { route: "/api/projects/[id]" } });
    const secret = enrich({ ruleId: "secrets.committed-secret", source: "analyzer", file: routeFile.path, line: 6, vars: { kind: "Stripe secret key" } });
    const capture: { prompt?: string } = {};
    const r = await aiReview(ctx, [idor, errors, secret], {
      client: fakeClient({
        updates: [
          { ref: "F1", verdict: "confirmed", explanation: "Any logged-in user can delete any project.", why_it_matters: "People can wipe each other's work.", fix_steps: "1. Add userId: user.id to the where clause." },
          { ref: "F2", verdict: "false_positive", explanation: "x", why_it_matters: "x", fix_steps: "x" },
          { ref: "F3", verdict: "false_positive", explanation: "x", why_it_matters: "x", fix_steps: "x" }, // secrets can't be dismissed
        ],
        new_findings: [
          { category: "input", severity: "medium", title: "Project IDs are not validated", file: routeFile.path, line: 40, explanation: "e", why_it_matters: "w", fix_steps: "1. s" },
          { category: "auth", severity: "high", title: "Hallucinated file", file: "src/nope.ts", line: 1, explanation: "e", why_it_matters: "w", fix_steps: "1. s" },
        ],
      }, capture),
    });
    expect(r.status).toBe("ok");
    const ids = r.findings.map((f) => f.ruleId);
    expect(ids).toContain("auth.idor");
    expect(ids).not.toContain("prod.no-error-handling");
    expect(ids).toContain("secrets.committed-secret");
    expect(r.findings.find((f) => f.ruleId === "auth.idor")!.explanation).toBe("Any logged-in user can delete any project.");
    expect(r.findings.find((f) => f.ruleId === "auth.idor")!.fixPrompt).toContain("1. Add userId: user.id");
    const added = r.findings.filter((f) => f.source === "llm");
    expect(added).toHaveLength(1);
    expect(added[0].line).toBe(6); // clamped to the file length
    expect(capture.prompt).toContain("[REDACTED Stripe secret key");
    expect(capture.prompt).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("falls back to scanner results when the model refuses", async () => {
    const f = enrich({ ruleId: "auth.idor", source: "analyzer", file: routeFile.path, line: 3 });
    const client = { beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: "refusal", content: [] }) }) } } } as unknown as Anthropic;
    const r = await aiReview(ctx, [f], { client });
    expect(r.status).toBe("refused");
    expect(r.findings).toEqual([f]);
  });
});
