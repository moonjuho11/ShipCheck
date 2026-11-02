import path from "node:path";
import { run } from "../exec";
import { isCode, isTestFile, lineOf } from "../files";
import type { RawFinding, ScanContext, Severity } from "../types";

const RULES_DIR = path.join(process.cwd(), "src", "scanner", "semgrep", "rules");

interface SemgrepResult {
  check_id: string;
  path: string;
  start: { line: number };
  extra: { metadata?: { seaproof_rule?: string; seaproof_severity?: Severity } };
}

async function runSemgrep(ctx: ScanContext): Promise<RawFinding[]> {
  const res = await run("semgrep", [
    "scan", "--config", RULES_DIR, "--json", "--metrics=off", "--disable-version-check", "--quiet",
    "--timeout", "30", "--max-target-bytes", "1000000", "--jobs", "2", ctx.root,
  ], { timeoutMs: 300_000, env: { ...process.env, SEMGREP_SEND_METRICS: "off" } });
  // 0 = no findings, 1 = findings; anything else is a real error.
  if (res.code > 1) throw new Error(`semgrep failed: ${res.stderr.slice(0, 300)}`);
  const json = JSON.parse(res.stdout) as { results: SemgrepResult[] };
  return json.results
    .filter((r) => r.extra.metadata?.seaproof_rule)
    .map((r) => {
      const file = path.relative(ctx.root, path.resolve(ctx.root, r.path)).split(path.sep).join("/");
      return {
        ruleId: r.extra.metadata!.seaproof_rule!, source: "semgrep" as const, file, line: r.start.line,
        severity: r.extra.metadata!.seaproof_severity, key: `${r.check_id.split(".").pop()}:${r.start.line}`,
      };
    })
    .filter((f) => !isTestFile(f.file));
}

/** Small regex fallback so a scan still catches the worst cases when Semgrep isn't installed. */
function regexFallback(ctx: ScanContext): RawFinding[] {
  const checks: [string, RegExp][] = [
    ["input.sql-injection", /\.(query|execute|raw|unsafe)\s*\(\s*`[^`]*\$\{/g],
    ["input.sql-injection", /\$(queryRawUnsafe|executeRawUnsafe)\s*\(/g],
    ["input.nosql-injection", /\.(find|findOne|updateOne|deleteOne|deleteMany)\s*\(\s*req\.(body|query)\s*[,)]/g],
    ["input.command-injection", /\bexec(Sync)?\s*\(\s*`[^`]*\$\{/g],
    ["input.xss", /dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:\s*(?!DOMPurify|sanitize|JSON\.stringify|["'`])/g],
    ["input.code-eval", /\beval\s*\(\s*(?!["'`])/g],
    ["input.ssrf", /\bfetch\s*\(\s*req\.(query|body|params)\./g],
  ];
  const out: RawFinding[] = [];
  for (const f of ctx.files) {
    if (!isCode(f.path) || isTestFile(f.path)) continue;
    for (const [ruleId, re] of checks) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.content))) out.push({ ruleId, source: "analyzer", file: f.path, line: lineOf(f.content, m.index), key: `${ruleId}:${m.index}` });
    }
  }
  return out;
}

const UPLOAD_RE = /formData\(\)|\.get\(\s*['"](file|files|image|avatar|upload|photo|attachment)['"]\s*\)|multer\s*\(|upload\.(single|array|fields)\s*\(|\.storage\s*\.\s*from\([^)]*\)\s*\.upload\s*\(|formidable|busboy|\.uploadBytes\s*\(|uploadBytesResumable/;
const UPLOAD_CALL_RE = /\.upload\s*\(|uploadBytes|multer\s*\(|writeFile|putObject|PutObjectCommand/;
const VALIDATES_RE = /\.type\b|mimetype|mime_type|fileFilter|allowedTypes|ALLOWED_|accept\s*:|content-?type|\.size\b|fileSize|maxFileSize|limits\s*:/i;
const USER_FILENAME_RE = /\$\{\s*\w+\.(name|originalname|filename)\s*\}|\+\s*\w+\.(name|originalname)\b|\.upload\(\s*\w+\.name\b/;

export function checkUploads(ctx: ScanContext): RawFinding[] {
  const out: RawFinding[] = [];
  for (const f of ctx.files) {
    if (!isCode(f.path) || isTestFile(f.path)) continue;
    if (!UPLOAD_RE.test(f.content) || !UPLOAD_CALL_RE.test(f.content)) continue;
    if (VALIDATES_RE.test(f.content)) continue;
    const m = UPLOAD_CALL_RE.exec(f.content)!;
    out.push({ ruleId: "input.unvalidated-upload", source: "analyzer", file: f.path, line: lineOf(f.content, m.index), vars: { userName: USER_FILENAME_RE.test(f.content) ? "1" : "" } });
  }
  return out;
}

export async function checkInput(ctx: ScanContext, opts: { useSemgrep: boolean }): Promise<{ findings: RawFinding[]; semgrep: "ok" | "missing" | "failed" | "skipped" }> {
  const findings: RawFinding[] = [...checkUploads(ctx)];
  let semgrep: "ok" | "missing" | "failed" | "skipped" = "skipped";
  if (opts.useSemgrep) {
    try {
      findings.push(...(await runSemgrep(ctx)));
      semgrep = "ok";
    } catch (e) {
      semgrep = (e as { code?: string }).code === "ENOENT" ? "missing" : "failed";
    }
  }
  if (semgrep !== "ok") findings.push(...regexFallback(ctx));
  return { findings, semgrep };
}
