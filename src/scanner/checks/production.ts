import { isCode } from "../files";
import { DATA_RE, WEBHOOK_RE, discoverRoutes } from "../routes";
import type { RawFinding, ScanContext } from "../types";

const HANDLES_ERRORS_RE = /\btry\s*\{|\.catch\s*\(|\bif\s*\(\s*!?\s*\w*[eE]rror\b|\{\s*[^}]*\berror\b[^}]*\}\s*=\s*await|onError|withErrorHandler|errorHandler/;
const RATE_LIMIT_RE = /ratelimit|rate-limit|rateLimit|RateLimit|rate_limit|express-rate-limit|limiter|throttle|slowDown|@arcjet|arcjet|upstash|botid|turnstile|hcaptcha|recaptcha/i;
const CUSTOM_LOGIN_RE = /bcrypt|argon2|scrypt|comparePassword|verifyPassword|password_hash|passwordHash|pbkdf2/;
const AUTH_ROUTE_RE = /(^|\/)(login|log-in|signin|sign-in|signup|sign-up|register|forgot|reset|reset-password|otp|verify|magic-link|password)(\/|$)/i;
const PAYMENT_ROUTE_RE = /(^|\/)(checkout|payment|payments|pay|subscribe|subscription|billing|charge|create-payment-intent|create-checkout-session|stripe)(\/|$|-)/i;
const BACKUP_RE = /\bbackups?\b|pg_dump|point[- ]in[- ]time|\bPITR\b|snapshot/i;

export function checkProduction(ctx: ScanContext): RawFinding[] {
  const findings: RawFinding[] = [];
  const routes = discoverRoutes(ctx.files);
  const anyRateLimiting = ctx.files.some((f) => (isCode(f.path) || f.path === "package.json") && RATE_LIMIT_RE.test(f.content));

  // Error handling on routes that call the database or other services.
  let noErrorCount = 0;
  for (const r of routes) {
    if (!DATA_RE.test(r.body) || !/\bawait\b/.test(r.body) || HANDLES_ERRORS_RE.test(r.body)) continue;
    if (++noErrorCount > 8) break; // keep the report readable
    findings.push({ ruleId: "prod.no-error-handling", source: "analyzer", file: r.file, line: r.line, key: r.route, vars: { route: r.route } });
  }

  // Rate limiting on auth + payment endpoints.
  for (const r of routes) {
    if (WEBHOOK_RE.test(r.route) || r.methods.every((m) => m === "GET")) continue;
    const local = RATE_LIMIT_RE.test(r.body);
    if (local) continue;
    if (AUTH_ROUTE_RE.test(r.route) && CUSTOM_LOGIN_RE.test(r.body)) {
      findings.push({ ruleId: "prod.no-rate-limit-auth", source: "analyzer", file: r.file, line: r.line, key: r.route, vars: { route: r.route }, severity: anyRateLimiting ? "medium" : "high" });
    } else if (AUTH_ROUTE_RE.test(r.route) && !anyRateLimiting) {
      findings.push({ ruleId: "prod.no-rate-limit-auth", source: "analyzer", file: r.file, line: r.line, key: r.route, vars: { route: r.route }, severity: "medium" });
    } else if (PAYMENT_ROUTE_RE.test(r.route) && /stripe|paypal|lemonsqueezy|paddle|checkout/i.test(r.body) && !anyRateLimiting) {
      findings.push({ ruleId: "prod.no-rate-limit-payment", source: "analyzer", file: r.file, line: r.line, key: r.route, vars: { route: r.route } });
    }
  }

  // Database migrations.
  const s = ctx.project.stack;
  const db = s.has("supabase") ? "Supabase" : s.has("prisma") ? "Prisma" : s.has("drizzle") ? "Drizzle" : s.has("sql") ? "a SQL database" : null;
  if (db) {
    const hasMigrations = ctx.files.some((f) =>
      /(^|\/)(supabase\/migrations|prisma\/migrations|drizzle|migrations?|db\/migrate)\/.+\.(sql|ts|js)$/.test(f.path) || /(^|\/)schema\.sql$/.test(f.path));
    if (!hasMigrations) findings.push({ ruleId: "prod.no-migrations", source: "analyzer", vars: { db } });
  }

  // Backups (only for apps that keep data).
  if (db || s.has("firebase") || s.has("mongo")) {
    const mentionsBackups = ctx.files.some((f) => (/\.(md|txt|ya?ml|sh|json|toml)$/.test(f.path) || /(^|\/)scripts\//.test(f.path)) && f.path !== "package-lock.json" && BACKUP_RE.test(f.content));
    if (!mentionsBackups) findings.push({ ruleId: "prod.no-backups", source: "analyzer" });
  }
  return findings;
}
