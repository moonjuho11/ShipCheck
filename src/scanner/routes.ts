import { isCode, isTestFile, lineOf } from "./files";
import type { RepoFile } from "./types";

export interface Route {
  file: string;
  /** Public-facing path, e.g. /api/invoices/[id] */
  route: string;
  methods: string[];
  /** Source text of the handler(s) (whole file for Next.js, one handler for Express). */
  body: string;
  line: number;
  kind: "next-app" | "next-pages" | "express" | "edge-function";
}

export interface ServerAction { file: string; fn: string; body: string; line: number; }

export const AUTH_RE = /getServerSession|getSession\s*\(|\bauth\s*\(\s*\)|currentUser\s*\(|getUser\s*\(|requireUser|requireAuth|requireAdmin|requireSession|withAuth|isAuthenticated|ensureAuth|verifyToken|jwt\.verify|jwtVerify|getToken\s*\(|getAuth\s*\(|clerkClient|validateRequest|verifyIdToken|verifySession|getCurrentUser|getLoggedInUser|req\.user\b|ctx\.user\b|locals\.user|status:\s*401|\b401\b|Unauthorized|UNAUTHORIZED/;
export const DATA_RE = /\.from\s*\(|\.rpc\s*\(|prisma\.|\bdb\.|\bpool\.query|\.query\s*\(|\bsql`|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(|\.findMany|\.findFirst|\.findUnique|\.findOne|\.find\s*\(|\.findById|collection\s*\(|getDocs|setDoc|addDoc|deleteDoc|stripe\.|resend\.|sendEmail|\.execute\s*\(|\.storage\./;
export const PUBLIC_ROUTE_RE = /(^|\/)(login|log-in|signin|sign-in|signup|sign-up|register|auth|oauth|callback|forgot|reset|verify|otp|magic|logout|health|healthz|status|ping|og|sitemap|robots|manifest|public|webhooks?|stripe-webhook|contact|newsletter|subscribe)(\/|$|\.)/i;
export const WEBHOOK_RE = /webhook/i;
export const SENSITIVE_PATH_RE = /admin|user|account|profile|invoice|order|billing|payment|private|me\b|settings|team|member|customer|message|document|file|note/i;
export const SERVICE_ROLE_RE = /service_role|SERVICE_ROLE|serviceRole|SUPABASE_SECRET_KEY|supabaseAdmin|adminClient|createAdminClient/;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function appRoutePath(p: string): string | null {
  const m = p.match(/(?:^|\/)app\/(.*?)\/?route\.(?:m|c)?[jt]sx?$/);
  if (!m) return null;
  const segs = m[1].split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
  return "/" + segs.join("/");
}

function pagesApiPath(p: string): string | null {
  const m = p.match(/(?:^|\/)pages\/(api\/.*)\.(?:m|c)?[jt]sx?$/);
  if (!m) return null;
  return "/" + m[1].replace(/\/index$/, "");
}

export function discoverRoutes(files: RepoFile[]): Route[] {
  const routes: Route[] = [];
  for (const f of files) {
    if (!isCode(f.path) || isTestFile(f.path)) continue;
    const app = appRoutePath(f.path);
    if (app) {
      const methods = METHODS.filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\s*=|export\\s*\\{[^}]*\\b${m}\\b`).test(f.content));
      if (methods.length) {
        const first = f.content.search(new RegExp(`export\\s+(async\\s+)?(function|const)\\s+(${methods.join("|")})\\b`));
        routes.push({ file: f.path, route: app, methods, body: f.content, line: lineOf(f.content, Math.max(0, first)), kind: "next-app" });
      }
      continue;
    }
    const pages = pagesApiPath(f.path);
    if (pages) {
      const found = METHODS.filter((m) => new RegExp(`method\\s*===?\\s*['"]${m}['"]|case\\s+['"]${m}['"]`).test(f.content));
      routes.push({ file: f.path, route: pages, methods: found.length ? found : ["ANY"], body: f.content, line: 1, kind: "next-pages" });
      continue;
    }
    if (/(^|\/)supabase\/functions\/[^/]+\/index\.ts$/.test(f.path)) {
      const name = f.path.split("/").slice(-2)[0];
      routes.push({ file: f.path, route: `/functions/v1/${name}`, methods: ["ANY"], body: f.content, line: 1, kind: "edge-function" });
      continue;
    }
    // Express / Koa-router / Hono style: app.get("/path", ...)
    const re = /\b(app|router|server|api)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    const matches = [...f.content.matchAll(re)];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const end = i + 1 < matches.length ? matches[i + 1].index! : f.content.length;
      const body = f.content.slice(m.index!, end);
      routes.push({ file: f.path, route: m[3], methods: [m[2].toUpperCase()], body, line: lineOf(f.content, m.index!), kind: "express" });
    }
  }
  return routes;
}

/** True if a Next.js middleware/proxy file appears to enforce auth on /api routes. */
export function middlewareProtectsApi(files: RepoFile[]): boolean {
  const mw = files.find((f) => /^(src\/)?(middleware|proxy)\.(t|j)s$/.test(f.path));
  if (!mw) return false;
  const c = mw.content;
  const enforces = /clerkMiddleware|authMiddleware|withAuth|NextAuth|auth\s*\(\s*\)|getToken|jwtVerify/.test(c) && /redirect|401|Unauthorized|protect\s*\(/.test(c);
  if (!enforces) return false;
  const matcher = c.match(/matcher\s*:\s*(\[[\s\S]*?\]|['"`][^'"`]*['"`])/)?.[1];
  return !matcher || /api|\(\.\*\)|\/\(\(\?!/.test(matcher);
}

export function discoverServerActions(files: RepoFile[]): ServerAction[] {
  const out: ServerAction[] = [];
  for (const f of files) {
    if (!isCode(f.path) || isTestFile(f.path)) continue;
    const fileLevel = /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*["']use server["']/.test(f.content);
    if (!fileLevel && !/["']use server["']/.test(f.content)) continue;
    const re = fileLevel
      ? /export\s+(?:default\s+)?async\s+function\s+(\w+)\s*\(|export\s+const\s+(\w+)\s*=\s*async\s*\(/g
      : /async\s+function\s+(\w+)\s*\([^)]*\)\s*\{\s*["']use server["']/g;
    const matches = [...f.content.matchAll(re)];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const end = i + 1 < matches.length ? matches[i + 1].index! : f.content.length;
      out.push({ file: f.path, fn: m[1] || m[2], body: f.content.slice(m.index!, end), line: lineOf(f.content, m.index!) });
    }
  }
  return out;
}
