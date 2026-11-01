import { isClientFile, isCode, lineOf } from "../files";
import type { RawFinding, ScanContext } from "../types";

function stripSqlComments(sql: string): string {
  // Replace comments with spaces so character offsets (and line numbers) stay the same.
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length));
}

const ident = String.raw`(?:"?(\w+)"?\.)?"?(\w+)"?`;

export function analyzeSupabaseSql(files: { path: string; content: string }[]): RawFinding[] {
  const findings: RawFinding[] = [];
  const tables = new Map<string, { file: string; line: number }>();
  const rls = new Set<string>();
  const dropped = new Set<string>();

  const sqlFiles = files.filter((f) => f.path.endsWith(".sql")).sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sqlFiles) {
    const sql = stripSqlComments(f.content);
    for (const m of sql.matchAll(new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${ident}`, "gi"))) {
      const schema = (m[1] || "public").toLowerCase();
      if (schema !== "public") continue;
      const t = m[2].toLowerCase();
      if (!tables.has(t)) tables.set(t, { file: f.path, line: lineOf(f.content, m.index!) });
      dropped.delete(t);
    }
    for (const m of sql.matchAll(new RegExp(String.raw`alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?${ident}\s+enable\s+row\s+level\s+security`, "gi"))) {
      rls.add(m[2].toLowerCase());
    }
    for (const m of sql.matchAll(new RegExp(String.raw`drop\s+table\s+(?:if\s+exists\s+)?${ident}`, "gi"))) {
      dropped.add(m[2].toLowerCase());
    }
    // Policies: create policy "name" on table [as permissive] [for X] [to roles] [using (...)] [with check (...)];
    for (const m of sql.matchAll(new RegExp(String.raw`create\s+policy\s+(?:"[^"]*"|\w+)\s+on\s+${ident}([^;]*);`, "gi"))) {
      const table = m[2].toLowerCase();
      const body = m[3];
      const action = (body.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1] || "all").toLowerCase();
      const roles = body.match(/\bto\s+([\w\s,]+?)(?=\busing\b|\bwith\b|$)/i)?.[1]?.toLowerCase() || "public";
      if (/service_role/.test(roles) && !/anon|authenticated|public/.test(roles)) continue;
      const openUsing = /\busing\s*\(\s*true\s*\)/i.test(body);
      const openCheck = /\bwith\s+check\s*\(\s*true\s*\)/i.test(body);
      if (!openUsing && !openCheck) continue;
      const line = lineOf(f.content, m.index!);
      if (action === "select") {
        findings.push({ ruleId: "db.open-read-policy", source: "analyzer", file: f.path, line, vars: { table } });
      } else {
        const verb = action === "all" ? "read, change and delete anything" : action === "insert" ? "add rows" : action === "update" ? "edit any row" : "delete any row";
        findings.push({ ruleId: "db.open-policy", source: "analyzer", file: f.path, line, key: `${table}:${action}`, vars: { table, action: verb } });
      }
    }
  }
  for (const [t, loc] of tables) {
    if (rls.has(t) || dropped.has(t)) continue;
    findings.push({ ruleId: "db.rls-disabled", source: "analyzer", file: loc.file, line: loc.line, vars: { table: t } });
  }
  return findings;
}

export function analyzeFirebaseRules(files: { path: string; content: string }[]): RawFinding[] {
  const out: RawFinding[] = [];
  for (const f of files) {
    if (/(^|\/)(firestore|storage)\.rules$/.test(f.path) || f.path.endsWith(".rules")) {
      const c = f.content;
      const test = /allow\s+[\w\s,]*:\s*if\s+request\.time\s*<\s*timestamp\.date\s*\(/.exec(c);
      if (test) { out.push({ ruleId: "db.firebase-open-rules", source: "analyzer", file: f.path, line: lineOf(c, test.index), vars: { mode: "test" } }); continue; }
      const open = /allow\s+(?:read\s*,\s*write|write\s*,\s*read|write|read|create|update|delete)\s*(?::\s*if\s+true\s*)?;/.exec(c);
      if (open) out.push({ ruleId: "db.firebase-open-rules", source: "analyzer", file: f.path, line: lineOf(c, open.index), vars: { mode: "open" } });
    }
    if (/(^|\/)database\.rules\.json$/.test(f.path)) {
      try {
        const rules = JSON.parse(f.content)?.rules ?? {};
        const isOpen = (v: unknown) => v === true || v === "true";
        if (isOpen(rules[".read"]) || isOpen(rules[".write"])) out.push({ ruleId: "db.firebase-open-rules", source: "analyzer", file: f.path, line: 1, vars: { mode: "open" } });
      } catch { /* ignore invalid json */ }
    }
  }
  return out;
}

const SERVICE_ROLE = /service_role|SERVICE_ROLE|serviceRole|SUPABASE_SECRET_KEY|sb_secret_/;

export function checkDatabase(ctx: ScanContext): RawFinding[] {
  const findings: RawFinding[] = [];
  if (ctx.project.stack.has("supabase") || ctx.files.some((f) => f.path.endsWith(".sql"))) {
    findings.push(...analyzeSupabaseSql(ctx.files.filter((f) => /(^|\/)supabase\/migrations\/|(^|\/)(migrations?|db|sql|database)\//.test(f.path) || f.path.endsWith("schema.sql"))));
  }
  findings.push(...analyzeFirebaseRules(ctx.files));

  for (const f of ctx.files) {
    if (isCode(f.path) && isClientFile(f, ctx.project)) {
      const m = SERVICE_ROLE.exec(f.content);
      if (m) findings.push({ ruleId: "db.service-role-in-client", source: "analyzer", file: f.path, line: lineOf(f.content, m.index) });
      const admin = /from\s+["']firebase-admin["']|require\(\s*["']firebase-admin["']\s*\)/.exec(f.content);
      if (admin) findings.push({ ruleId: "db.service-role-in-client", source: "analyzer", file: f.path, line: lineOf(f.content, admin.index), key: "firebase-admin" });
    }
    if (f.path.endsWith(".json") && /"type"\s*:\s*"service_account"/.test(f.content) && /"private_key"\s*:\s*"-----BEGIN/.test(f.content)) {
      findings.push({ ruleId: "db.firebase-service-account", source: "analyzer", file: f.path, line: 1 });
    }
  }
  return findings;
}
