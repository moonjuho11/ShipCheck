import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../exec";
import { isCode, lineOf } from "../files";
import { classify, findSecrets, mask } from "../secret-patterns";
import type { RawFinding, ScanContext } from "../types";

interface GitleaksResult {
  RuleID: string;
  File: string;
  StartLine: number;
  Secret: string;
  Commit?: string;
  Match?: string;
}

const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const ENV_FILE = /(^|\/)\.env(\.[\w.-]+)?$/;
const ENV_TEMPLATE = /\.(example|sample|template|dist|defaults?)$/i;
const PUBLIC_PREFIX = "(?:NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|PUBLIC_|GATSBY_)";
const SECRETISH = "(?:SECRET|SERVICE_ROLE|SERVICE_KEY|PRIVATE|ADMIN_KEY|PASSWORD|PASSWD|DATABASE_URL|DB_URL|WEBHOOK_SECRET|STRIPE_SK|STRIPE_SECRET|OPENAI|ANTHROPIC|CLAUDE_API|GEMINI_API|GROQ|MISTRAL|REPLICATE|RESEND_API|SENDGRID|TWILIO_AUTH|ELEVENLABS|AWS_SECRET)";
const PUBLIC_SECRET_RE = new RegExp(`\\b${PUBLIC_PREFIX}[A-Z0-9_]*${SECRETISH}[A-Z0-9_]*\\b`, "g");

async function runGitleaks(ctx: ScanContext, mode: "dir" | "git"): Promise<GitleaksResult[]> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "seaproof-gl-"));
  const report = path.join(tmp, "report.json");
  try {
    const args = mode === "dir"
      ? ["dir", ctx.root, "--report-format", "json", "--report-path", report, "--exit-code", "0", "--no-banner", "--log-level", "error", "--max-target-megabytes", "5"]
      : ["git", ctx.root, "--report-format", "json", "--report-path", report, "--exit-code", "0", "--no-banner", "--log-level", "error"];
    const res = await run("gitleaks", args, { timeoutMs: 180_000 });
    if (res.code !== 0) throw new Error(`gitleaks ${mode} failed: ${res.stderr.slice(0, 300)}`);
    const parsed = JSON.parse(await fs.readFile(report, "utf8").catch(() => "[]")) as GitleaksResult[];
    return parsed.map((r) => ({ ...r, File: path.isAbsolute(r.File) ? path.relative(ctx.root, r.File) : r.File }));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function ignoredByGitignore(content: string, name: string): boolean {
  let ignored = false;
  for (let raw of content.split(/\r?\n/)) {
    raw = raw.trim();
    if (!raw || raw.startsWith("#")) continue;
    const neg = raw.startsWith("!");
    const pat = raw.replace(/^!/, "").replace(/^\//, "").replace(/\/$/, "").replace(/^\*\*\//, "");
    if (pat.includes("/")) continue;
    const re = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    if (re.test(name)) ignored = !neg;
  }
  return ignored;
}

export interface SecretsCheckOptions { useGitleaks: boolean }

export async function checkSecrets(ctx: ScanContext, opts: SecretsCheckOptions): Promise<{ findings: RawFinding[]; gitleaks: "ok" | "missing" | "failed" | "skipped" }> {
  const findings: RawFinding[] = [];
  const seen = new Set<string>(); // file + secret hash
  const currentSecretHashes = new Set<string>();
  const serviceAccountFiles = new Set<string>();

  // Google service-account JSON files are reported by the database check, not as a raw private key.
  for (const f of ctx.files) {
    if (f.path.endsWith(".json") && /"type"\s*:\s*"service_account"/.test(f.content) && /"private_key"/.test(f.content)) serviceAccountFiles.add(f.path);
  }

  const add = (file: string, line: number, secret: string, cls: { kind: string; severity: RawFinding["severity"]; envName?: string }) => {
    const key = `${file}\u0000${h(secret)}`;
    currentSecretHashes.add(h(secret));
    if (seen.has(key) || serviceAccountFiles.has(file)) return;
    seen.add(key);
    const testKey = cls.severity === "high" && /test/i.test(cls.kind);
    findings.push({
      ruleId: testKey ? "secrets.test-secret" : "secrets.committed-secret",
      source: "analyzer", file, line, severity: cls.severity,
      evidence: mask(secret), key: h(secret),
      vars: { kind: cls.kind, envName: cls.envName || "SECRET_KEY" },
    });
  };

  // 1) Built-in detectors over every text file we read.
  for (const f of ctx.files) {
    for (const m of findSecrets(f.content)) add(f.path, lineOf(f.content, m.index), m.secret, m);
  }

  // 2) Gitleaks (current files + git history).
  let gitleaks: "ok" | "missing" | "failed" | "skipped" = "skipped";
  if (opts.useGitleaks) {
    try {
      const dirResults = (await runGitleaks(ctx, "dir")).filter((r) => !r.File.startsWith(".git/"));
      for (const r of dirResults) {
        const fileCtx = ctx.byPath.get(r.File)?.content.slice(0, 5000) ?? "";
        const cls = classify(r.Secret, r.RuleID, fileCtx);
        if (!cls) continue;
        const before = findings.length;
        add(r.File, r.StartLine, r.Secret, cls);
        if (findings.length > before) findings[findings.length - 1].source = "gitleaks";
      }
      if (ctx.hasGitHistory) {
        const historySeen = new Set<string>();
        for (const r of await runGitleaks(ctx, "git")) {
          const hash = h(r.Secret);
          if (currentSecretHashes.has(hash) || historySeen.has(hash)) continue; // still present → already reported
          const cls = classify(r.Secret, r.RuleID);
          if (!cls) continue;
          historySeen.add(hash);
          findings.push({
            ruleId: "secrets.history-secret", source: "gitleaks", file: r.File, severity: cls.severity === "critical" ? "high" : "medium",
            evidence: mask(r.Secret), key: hash,
            vars: { kind: cls.kind, commit: (r.Commit || "").slice(0, 7) },
          });
        }
      }
      gitleaks = "ok";
    } catch (e) {
      gitleaks = (e as { code?: string }).code === "ENOENT" ? "missing" : "failed";
    }
  }

  // 3) Committed .env files with real values.
  for (const f of ctx.files) {
    const base = path.posix.basename(f.path);
    if (!ENV_FILE.test(f.path) || ENV_TEMPLATE.test(base)) continue;
    const hasPrivateValue = f.content.split(/\r?\n/).some((l) => {
      const m = l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.+)\s*$/i);
      if (!m) return false;
      const name = m[1];
      const val = m[2].replace(/^['"]|['"]$/g, "").trim();
      const isPublic = new RegExp(`^${PUBLIC_PREFIX}`).test(name);
      const looksSecret = new RegExp(SECRETISH).test(name);
      return val.length > 0 && (!isPublic || looksSecret);
    });
    if (hasPrivateValue) findings.push({ ruleId: "secrets.env-file-committed", source: "analyzer", file: f.path, line: 1 });
  }

  // 4) .gitignore doesn't cover .env
  const hasProject = ctx.files.some((f) => f.path === "package.json" || isCode(f.path));
  const gi = ctx.byPath.get(".gitignore");
  if (hasProject && (!gi || !ignoredByGitignore(gi.content, ".env"))) {
    findings.push({ ruleId: "secrets.env-not-gitignored", source: "analyzer", file: ".gitignore" });
  }

  // 5) Secrets given a "public" prefix (shipped to every browser).
  const publicNames = new Map<string, { file: string; line: number }>();
  for (const f of ctx.files) {
    if (!(isCode(f.path) || ENV_FILE.test(f.path))) continue;
    PUBLIC_SECRET_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PUBLIC_SECRET_RE.exec(f.content))) {
      const name = m[0];
      if (/PUBLISHABLE|PUBLIC_KEY$|_ANON_|SITE_KEY|CLIENT_ID$/.test(name)) continue;
      // A bare PUBLIC_ prefix only means "sent to the browser" on an env variable. Elsewhere it's just a name.
      const isEnvVar = ENV_FILE.test(f.path) || f.content.slice(Math.max(0, m.index - 4), m.index) === "env." || f.content.includes("$env/");
      if (name.startsWith("PUBLIC_") && !isEnvVar) continue;
      if (!publicNames.has(name)) publicNames.set(name, { file: f.path, line: lineOf(f.content, m.index) });
    }
  }
  for (const [name, loc] of publicNames) {
    findings.push({
      ruleId: "secrets.public-env-secret", source: "analyzer", file: loc.file, line: loc.line, key: name,
      vars: { name, suggested: name.replace(new RegExp(`^${PUBLIC_PREFIX}`), "") },
    });
  }

  return { findings, gitleaks };
}
