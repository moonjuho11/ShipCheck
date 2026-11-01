import { lineOf } from "../files";
import {
  AUTH_RE, DATA_RE, PUBLIC_ROUTE_RE, SENSITIVE_PATH_RE, SERVICE_ROLE_RE, WEBHOOK_RE,
  discoverRoutes, discoverServerActions, middlewareProtectsApi, type Route,
} from "../routes";
import type { RawFinding, ScanContext } from "../types";

const WEBHOOK_VERIFY_RE = /constructEvent|constructEventAsync|webhooks\.verify|verifyWebhook|svix|new\s+Webhook\s*\(|x-hub-signature|createHmac|verifySignature|validateEvent|validateWebhook|verifyHeader|timingSafeEqual|CRON_SECRET|WEBHOOK_SECRET/;
const OWNERSHIP_RE = /\.(eq|match|filter)\s*\(\s*['"](user_id|owner_id|userId|ownerId|created_by|author_id|account_id|org_id|organization_id|team_id|profile_id|customer_id)['"]\s*,\s*(user|session|auth|ctx|currentUser|me)\b|\b(userId|ownerId|authorId|user_id|owner_id|createdById|accountId|orgId)\s*:\s*(user|session|auth|ctx|currentUser|me)\b[\w.?]*|===?\s*(user|session\.user|currentUser|me)(\?)?\.id\b|(user|session\.user|currentUser)(\?)?\.id\s*!==?|auth\.uid\(\)|where\s+[\w.]*user_id\s*=\s*\$\d/;
const ID_FROM_REQUEST_RE = /params\??\.\w*id\b|params\??\.(slug|id)\b|\{\s*params\s*\}|searchParams\.get\(\s*['"]\w*id['"]\s*\)|req\.(query|params)\.\w*id\b|req\.query\.\w+|body\.\w*[iI]d\b|ctx\.params/;
const LOOKUP_BY_ID_RE = /\.eq\s*\(\s*['"](id|uuid|\w+_id)['"]|\.(findUnique|findFirst|findById|findOne|get)\s*\(|where\s*:\s*\{\s*id|doc\s*\(\s*[^)]*,\s*\w*id|where\s+id\s*=\s*\$\d|\.match\s*\(\s*\{\s*id/;
const USER_ID_FROM_CLIENT_RE = /searchParams\.get\(\s*['"]user_?[iI]d['"]\s*\)|(req\.)?(body|query)\.user_?[iI]d\b|params\??\.user_?[iI]d\b/;

function thingFromRoute(route: string): string {
  const seg = route.split("/").filter((s) => s && !s.startsWith("[") && !s.startsWith(":") && s !== "api").pop() || "data";
  return seg.replace(/[-_]/g, " ");
}

export function checkAuth(ctx: ScanContext): RawFinding[] {
  const findings: RawFinding[] = [];
  const routes = discoverRoutes(ctx.files);
  const globallyProtected = middlewareProtectsApi(ctx.files);
  const expressGlobalAuth = ctx.files.some((f) => /\b(app|router)\.use\(\s*(['"`][^'"`]*['"`]\s*,\s*)?(requireAuth|authenticate|isAuthenticated|ensureAuth|passport\.authenticate|verifyToken|authMiddleware|clerkMiddleware|requireUser)/.test(f.content));

  for (const r of routes) {
    const isWebhook = WEBHOOK_RE.test(r.route) || (/event\.type|\btype\s*===?\s*['"](checkout|invoice|customer|payment)/.test(r.body) && /stripe|lemon|paddle|clerk|svix|github/i.test(r.body + r.route));
    if (isWebhook) {
      if (!WEBHOOK_VERIFY_RE.test(r.body) && r.methods.some((m) => m !== "GET")) {
        findings.push({ ruleId: "auth.webhook-unverified", source: "analyzer", file: r.file, line: r.line, key: r.route });
      }
      continue;
    }
    if (PUBLIC_ROUTE_RE.test(r.route)) continue;

    const hasAuth = AUTH_RE.test(r.body) || (r.kind !== "express" && globallyProtected) || (r.kind === "express" && expressGlobalAuth);
    const touchesData = DATA_RE.test(r.body);
    const usesAdminClient = SERVICE_ROLE_RE.test(r.body);
    const isAdmin = /(^|\/)admin(\/|$)/i.test(r.route);
    const mutating = r.methods.some((m) => m !== "GET");

    if (!hasAuth && touchesData) {
      const flag = mutating || usesAdminClient || isAdmin || SENSITIVE_PATH_RE.test(r.route);
      if (flag) {
        findings.push({
          ruleId: "auth.unprotected-route", source: "analyzer", file: r.file, line: r.line, key: r.route,
          severity: isAdmin || (usesAdminClient && mutating) ? "critical" : mutating || usesAdminClient ? "high" : "medium",
          vars: { route: r.route, methods: r.methods.join(", "), admin: isAdmin ? "1" : "" },
        });
      }
      continue;
    }

    if (hasAuth && touchesData) findings.push(...idorFor(r));
  }

  for (const a of discoverServerActions(ctx.files)) {
    if (!DATA_RE.test(a.body) || AUTH_RE.test(a.body)) continue;
    findings.push({ ruleId: "auth.server-action-no-auth", source: "analyzer", file: a.file, line: a.line, key: a.fn, vars: { fn: a.fn } });
  }
  return findings;
}

function idorFor(r: Route): RawFinding[] {
  const out: RawFinding[] = [];
  const dynamicRoute = /\[[^\]]+\]|:\w+/.test(r.route);
  const userIdFromClient = USER_ID_FROM_CLIENT_RE.exec(r.body);
  if (userIdFromClient && !OWNERSHIP_RE.test(r.body)) {
    out.push({
      ruleId: "auth.idor", source: "analyzer", file: r.file, line: lineOf(r.body, userIdFromClient.index) + r.line - 1, key: `${r.route}:userId`,
      severity: "high", vars: { param: userIdFromClient[0], thing: thingFromRoute(r.route) },
    });
    return out;
  }
  if ((dynamicRoute || ID_FROM_REQUEST_RE.test(r.body)) && LOOKUP_BY_ID_RE.test(r.body) && !OWNERSHIP_RE.test(r.body)) {
    const m = LOOKUP_BY_ID_RE.exec(r.body)!;
    // A user-scoped Supabase client is still protected by Row Level Security; an admin client or raw SQL is not.
    const bypassesRls = SERVICE_ROLE_RE.test(r.body) || /pool\.query|prisma\.|\bdb\.|\.findById|mongoose|\bsql`/.test(r.body);
    out.push({
      ruleId: "auth.idor", source: "analyzer", file: r.file, line: lineOf(r.body, m.index) + (r.kind === "express" ? r.line - 1 : 0), key: r.route,
      severity: bypassesRls ? "high" : "medium",
      vars: { param: r.route.match(/\[([^\]]+)\]|:(\w+)/)?.slice(1).find(Boolean) || "id", thing: thingFromRoute(r.route) },
    });
  }
  return out;
}
