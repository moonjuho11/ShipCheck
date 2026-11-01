import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isCode, isTestFile } from "./files";
import { buildFixPrompt, fingerprintOf } from "./rules";
import { discoverRoutes, discoverServerActions } from "./routes";
import { findSecrets, mask } from "./secret-patterns";
import type { Category, Finding, ScanContext, Severity } from "./types";

export const DEFAULT_MODEL = "claude-opus-5-5";
const CHAR_BUDGET = 160_000; // ~45k tokens of code
const MAX_FILE_CHARS = 30_000;
const SEV_WEIGHT: Record<Severity, number> = { critical: 8, high: 5, medium: 2, low: 1 };

// Findings Claude may mark as false positives: heuristic ones only. Leaked secrets,
// vulnerable packages and live-site results are facts, not opinions.
const DISMISSABLE = new Set<Category>(["auth", "input", "production"]);

const CATEGORIES = ["secrets", "database", "auth", "input", "dependencies", "live_site", "production"] as const;
const SEVS = ["critical", "high", "medium", "low"] as const;

const OutputSchema = z.object({
  updates: z.array(z.object({
    ref: z.string(),
    verdict: z.enum(["confirmed", "false_positive", "unsure"]),
    explanation: z.string(),
    why_it_matters: z.string(),
    fix_steps: z.string(),
  })),
  new_findings: z.array(z.object({
    category: z.enum(CATEGORIES),
    severity: z.enum(SEVS),
    title: z.string(),
    file: z.string(),
    line: z.number().int(),
    explanation: z.string(),
    why_it_matters: z.string(),
    fix_steps: z.string(),
  })),
});
type Output = z.infer<typeof OutputSchema>;

const str = { type: "string" } as const;
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["updates", "new_findings"],
  properties: {
    updates: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["ref", "verdict", "explanation", "why_it_matters", "fix_steps"],
        properties: { ref: str, verdict: { type: "string", enum: ["confirmed", "false_positive", "unsure"] }, explanation: str, why_it_matters: str, fix_steps: str },
      },
    },
    new_findings: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["category", "severity", "title", "file", "line", "explanation", "why_it_matters", "fix_steps"],
        properties: {
          category: { type: "string", enum: [...CATEGORIES] }, severity: { type: "string", enum: [...SEVS] },
          title: str, file: str, line: { type: "integer" }, explanation: str, why_it_matters: str, fix_steps: str,
        },
      },
    },
  },
};

const SYSTEM = `You are a senior application-security reviewer helping a non-technical founder whose app was built with AI coding tools (Lovable, Bolt, Cursor, Replit, v0). They are about to launch.

You receive (1) a list of findings from automated scanners, each with a ref like F3, and (2) the riskiest source files with line numbers.

Your jobs:
1. For each finding located in the files you were given, decide: "confirmed" (real problem), "false_positive" (the code is actually safe — explain why briefly), or "unsure". Then rewrite its explanation for this specific code.
2. Look for additional serious problems the scanners missed, especially: missing login/ownership checks (one user reading or changing another user's data by changing an ID), admin features without an admin check, trusting user IDs or prices sent from the browser, missing input validation on server routes, secrets used in browser code, and payment/webhook logic that can be faked. Only report issues you can point to in the code you were given, with the exact file path and line number. Do not repeat issues already in the findings list. Prefer a few high-confidence findings over many speculative ones; it is fine to return none.

Writing rules (very important):
- Write for someone who has never written code. No jargon. If a technical word is unavoidable, explain it in a few plain words.
- "explanation": 1–3 sentences on what is wrong in THIS code.
- "why_it_matters": 1–2 sentences on what could realistically happen (data leak, surprise bill, account takeover…).
- "fix_steps": numbered steps (1., 2., 3.) written as instructions to an AI coding agent that will edit this codebase. Be specific: name files, functions and the exact change. Keep existing behaviour for legitimate users.
- Titles: short, plain English, e.g. "Anyone can delete other people's projects".
- Severity: critical = anyone on the internet can take over accounts, read/modify all data, or spend money; high = serious data exposure or abuse with little effort; medium = needs specific conditions or limited impact; low = hygiene.`;

function numbered(content: string): string {
  return content.split("\n").map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join("\n");
}

/** Redact anything that looks like a secret before code leaves our servers. */
function redactSecrets(content: string): string {
  let out = content;
  for (const m of findSecrets(content)) out = out.split(m.secret).join(`[REDACTED ${m.kind}: ${mask(m.secret)}]`);
  return out;
}

export function pickRiskyFiles(ctx: ScanContext, findings: Finding[]): string[] {
  const score = new Map<string, number>();
  const bump = (p: string, n: number) => score.set(p, (score.get(p) || 0) + n);
  for (const f of findings) if (f.file && ctx.byPath.has(f.file)) bump(f.file, SEV_WEIGHT[f.severity]);
  for (const r of discoverRoutes(ctx.files)) bump(r.file, 3);
  for (const a of discoverServerActions(ctx.files)) bump(a.file, 3);
  for (const f of ctx.files) {
    if (/(^|\/)(middleware|proxy)\.(t|j)s$|auth|session|supabase\/functions\//i.test(f.path) && isCode(f.path)) bump(f.path, 2);
  }
  const ranked = [...score.entries()]
    .filter(([p]) => {
      const f = ctx.byPath.get(p)!;
      return f && (isCode(f.path) || f.path.endsWith(".sql") || f.path.endsWith(".rules")) && !isTestFile(p) && f.content.length <= MAX_FILE_CHARS;
    })
    .sort((a, b) => b[1] - a[1]);
  const out: string[] = [];
  let total = 0;
  for (const [p] of ranked) {
    const len = ctx.byPath.get(p)!.content.length;
    if (total + len > CHAR_BUDGET) continue;
    out.push(p);
    total += len;
  }
  return out;
}

export interface AiReviewResult { findings: Finding[]; reviewedFiles: string[]; status: "ok" | "skipped" | "refused" | "failed"; note?: string; }

export async function aiReview(ctx: ScanContext, findings: Finding[], opts: { apiKey?: string; model?: string; client?: Anthropic } = {}): Promise<AiReviewResult> {
  if (!opts.apiKey && !opts.client) return { findings, reviewedFiles: [], status: "skipped" };
  const files = pickRiskyFiles(ctx, findings);
  if (!files.length) return { findings, reviewedFiles: [], status: "skipped" };

  const refs = new Map<string, Finding>();
  findings.forEach((f, i) => refs.set(`F${i + 1}`, f));
  const findingList = [...refs.entries()].map(([ref, f]) =>
    `${ref} [${f.severity}] ${f.ruleId} — ${f.title}${f.file ? ` @ ${f.file}${f.line ? `:${f.line}` : ""}` : ""}`).join("\n");
  const stack = [...ctx.project.stack].join(", ") || "unknown";
  const fileBlocks = files.map((p) => `<file path="${p}">\n${numbered(redactSecrets(ctx.byPath.get(p)!.content))}\n</file>`).join("\n\n");
  const userMsg = `Project stack: ${stack}\n\nScanner findings:\n${findingList || "(none)"}\n\nFiles to review:\n\n${fileBlocks}\n\nAre there security bugs in this code? Return the JSON described in your instructions.`;

  const client = opts.client || new Anthropic({ apiKey: opts.apiKey, maxRetries: 3, timeout: 10 * 60_000 });
  let parsed: Output;
  try {
    const stream = client.beta.messages.stream({
      model: opts.model || DEFAULT_MODEL,
      max_tokens: 32_000,
      betas: ["server-side-fallback-2026-07-01"],
      // A security review can occasionally trip the cyber-safety classifier;
      // "default" re-runs a declined request on Anthropic's recommended fallback model.
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: JSON_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") return { findings, reviewedFiles: files, status: "refused", note: "The AI reviewer declined this request; showing scanner results only." };
    if (msg.stop_reason === "max_tokens") return { findings, reviewedFiles: files, status: "failed", note: "The AI review was too long and was cut off; showing scanner results only." };
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    parsed = OutputSchema.parse(JSON.parse(text));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { findings, reviewedFiles: [], status: "failed", note: "AI review skipped: the Anthropic API key was rejected." };
    if (e instanceof Anthropic.RateLimitError) return { findings, reviewedFiles: [], status: "failed", note: "AI review skipped: rate limited by the AI provider." };
    if (e instanceof Anthropic.APIError) return { findings, reviewedFiles: [], status: "failed", note: `AI review failed (${e.status ?? "network"}).` };
    return { findings, reviewedFiles: files, status: "failed", note: "AI review returned an unreadable answer; showing scanner results only." };
  }
  return { ...applyReview(ctx, findings, refs, files, parsed), reviewedFiles: files, status: "ok" };
}

/** Merge Claude's answer into the findings. Exported for tests. */
export function applyReview(ctx: ScanContext, findings: Finding[], refs: Map<string, Finding>, files: string[], out: Output): { findings: Finding[] } {
  const reviewed = new Set(files);
  const dismissed = new Set<Finding>();
  for (const u of out.updates) {
    const f = refs.get(u.ref);
    if (!f || !f.file || !reviewed.has(f.file)) continue;
    if (u.verdict === "false_positive" && DISMISSABLE.has(f.category) && f.source !== "osv") { dismissed.add(f); continue; }
    if (u.verdict === "unsure") continue;
    const vars = { file: f.file, line: f.line ? String(f.line) : "" };
    if (u.explanation.trim()) f.explanation = u.explanation.trim().slice(0, 1200);
    if (u.why_it_matters.trim()) f.whyItMatters = u.why_it_matters.trim().slice(0, 1200);
    if (u.fix_steps.trim()) f.fixPrompt = buildFixPrompt(f.explanation, u.fix_steps.trim(), vars).slice(0, 3000);
  }
  const kept = findings.filter((f) => !dismissed.has(f));
  const added: Finding[] = [];
  for (const n of out.new_findings.slice(0, 10)) {
    const file = ctx.byPath.get(n.file);
    if (!file || !reviewed.has(n.file)) continue; // must point at code we actually sent
    const lines = file.content.split("\n").length;
    const line = Math.min(Math.max(1, n.line), lines);
    const dup = kept.concat(added).some((f) => f.file === n.file && f.category === n.category && Math.abs((f.line || 0) - line) <= 3);
    if (dup) continue;
    added.push({
      ruleId: `llm.${n.category}`, category: n.category, severity: n.severity,
      title: n.title.trim().slice(0, 140), explanation: n.explanation.trim().slice(0, 1200), whyItMatters: n.why_it_matters.trim().slice(0, 1200),
      fixPrompt: buildFixPrompt(n.explanation.trim(), n.fix_steps.trim(), { file: n.file, line: String(line) }).slice(0, 3000),
      file: n.file, line, source: "llm", fingerprint: fingerprintOf(["llm", n.file, n.category, n.title.toLowerCase()]),
    });
  }
  return { findings: [...kept, ...added] };
}
