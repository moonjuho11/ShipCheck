import { randomBytes } from "node:crypto";
import { BlockedTargetError, safeFetch, type SafeResponse } from "../net";
import { findSecrets, mask } from "../secret-patterns";
import type { RawFinding, Severity } from "../types";

export function normalizeSiteUrl(input: string): string {
  const s = input.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

const EVIL_ORIGIN = "https://seaproof-cors-test.example";

const PROBES: { path: string; what: string; severity: Severity; looksReal: (r: SafeResponse) => boolean }[] = [
  { path: "/.env", what: "your secrets file (.env)", severity: "critical", looksReal: (r) => /^\s*[A-Z_][A-Z0-9_]*\s*=/m.test(r.body) && !/<html/i.test(r.body) },
  { path: "/.git/config", what: "your Git repository data", severity: "critical", looksReal: (r) => /\[core\]/.test(r.body) },
  { path: "/backup.sql", what: "a database backup file", severity: "critical", looksReal: (r) => /CREATE TABLE|INSERT INTO/i.test(r.body) },
  { path: "/dump.sql", what: "a database backup file", severity: "critical", looksReal: (r) => /CREATE TABLE|INSERT INTO/i.test(r.body) },
  { path: "/admin", what: "an admin area", severity: "high", looksReal: (r) => !looksLikeLogin(r.body) },
  { path: "/api/admin", what: "an admin API", severity: "high", looksReal: (r) => !looksLikeLogin(r.body) },
  { path: "/api/admin/users", what: "an admin API listing users", severity: "high", looksReal: (r) => !looksLikeLogin(r.body) },
  { path: "/dashboard/admin", what: "an admin area", severity: "high", looksReal: (r) => !looksLikeLogin(r.body) },
  { path: "/api/debug", what: "a debug endpoint", severity: "high", looksReal: () => true },
  { path: "/debug", what: "a debug page", severity: "medium", looksReal: () => true },
  { path: "/api/test", what: "a test endpoint", severity: "medium", looksReal: () => true },
  { path: "/phpinfo.php", what: "a server diagnostics page", severity: "high", looksReal: (r) => /phpinfo|PHP Version/i.test(r.body) },
  { path: "/server-status", what: "a server status page", severity: "medium", looksReal: (r) => /Apache Server Status|Server uptime/i.test(r.body) },
  { path: "/actuator/env", what: "a server configuration endpoint", severity: "critical", looksReal: (r) => /propertySources|activeProfiles/.test(r.body) },
];

function looksLikeLogin(body: string) {
  return /log\s?in|sign\s?in|password|unauthori[sz]ed|forbidden|access denied|not authenticated/i.test(body);
}

const norm = (b: string) => b.replace(/\s+/g, " ").replace(/[0-9a-f]{16,}/gi, "").trim();

function sameAsFallback(r: SafeResponse, baseline: SafeResponse | null): boolean {
  if (!baseline || baseline.status !== r.status) return false;
  const a = norm(r.body), b = norm(baseline.body);
  if (a === b) return true;
  const title = (s: string) => s.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  return !!title(a) && title(a) === title(b) && Math.abs(a.length - b.length) / Math.max(1, b.length) < 0.05;
}

async function tryFetch(url: string, opts: Parameters<typeof safeFetch>[1] = {}): Promise<SafeResponse | null> {
  try { return await safeFetch(url, opts); } catch (e) { if (e instanceof BlockedTargetError) throw e; return null; }
}

function scriptUrls(html: string, base: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) urls.add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*rel=["'](?:modulepreload|preload)["'][^>]*href=["']([^"']+\.m?js[^"']*)["']/gi)) urls.add(m[1]);
  const origin = new URL(base).origin;
  return [...urls]
    .map((u) => { try { return new URL(u, base).toString(); } catch { return null; } })
    .filter((u): u is string => !!u && new URL(u).origin === origin)
    .slice(0, 15);
}

const HEADER_CHECKS: { name: string; label: string; ok: (h: Headers) => boolean; weight: Severity }[] = [
  { name: "Strict-Transport-Security", label: "Strict-Transport-Security (always use HTTPS)", ok: (h) => !!h.get("strict-transport-security"), weight: "medium" },
  { name: "Content-Security-Policy", label: "Content-Security-Policy (blocks injected scripts)", ok: (h) => !!h.get("content-security-policy"), weight: "medium" },
  { name: "X-Frame-Options", label: "X-Frame-Options or CSP frame-ancestors (stops clickjacking)", ok: (h) => !!h.get("x-frame-options") || /frame-ancestors/i.test(h.get("content-security-policy") || ""), weight: "low" },
  { name: "X-Content-Type-Options", label: "X-Content-Type-Options: nosniff", ok: (h) => (h.get("x-content-type-options") || "").toLowerCase() === "nosniff", weight: "low" },
  { name: "Referrer-Policy", label: "Referrer-Policy (keeps private URLs private)", ok: (h) => !!h.get("referrer-policy"), weight: "low" },
];

export async function checkLiveSite(siteUrl: string): Promise<{ findings: RawFinding[]; note?: string }> {
  const findings: RawFinding[] = [];
  const input = new URL(normalizeSiteUrl(siteUrl));
  const httpsUrl = `https://${input.host}/`;
  const httpUrl = `http://${input.host}/`;
  const local = input.protocol === "http:" && process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS === "1" && process.env.NODE_ENV !== "production";

  // 1) HTTPS
  let home = local ? await tryFetch(input.toString(), { follow: true }) : await tryFetch(httpsUrl, { follow: true });
  if (!home && !local) {
    const plain = await tryFetch(httpUrl, { follow: true });
    if (!plain) return { findings, note: `We couldn't reach ${input.host}, so live-site checks were skipped.` };
    findings.push({ ruleId: "live.no-https", source: "live", vars: { url: httpUrl } });
    home = plain;
  } else if (!local) {
    const plain = await tryFetch(httpUrl, { follow: false });
    if (plain && plain.status >= 200 && plain.status < 300) findings.push({ ruleId: "live.https-not-enforced", source: "live", vars: { url: httpUrl } });
  }
  if (!home) return { findings, note: `We couldn't reach ${input.host}, so live-site checks were skipped.` };
  const base = home.url;
  const origin = new URL(base).origin;

  // 2) Security headers
  const missing = HEADER_CHECKS.filter((c) => !c.ok(home!.headers) && !(c.name === "Strict-Transport-Security" && base.startsWith("http:")));
  if (missing.length) {
    findings.push({
      ruleId: "live.missing-headers", source: "live", severity: missing.some((m) => m.weight === "medium") ? "medium" : "low",
      vars: { list: missing.map((m) => m.label).join("; ") }, evidence: missing.map((m) => m.name).join(", "),
    });
  }

  // 3) JS bundles: secrets + source maps
  let sourceMapReported = false;
  const secretKeys = new Set<string>();
  const scripts = scriptUrls(home.body, base);
  for (const [i, s] of scripts.entries()) {
    const js = await tryFetch(s, { maxBytes: 4_000_000, timeoutMs: 15_000 });
    if (!js || js.status !== 200) continue;
    const pathOnly = new URL(s).pathname;
    for (const m of findSecrets(js.body)) {
      const k = m.kind + m.secret;
      if (secretKeys.has(k)) continue;
      secretKeys.add(k);
      findings.push({ ruleId: "live.secret-in-bundle", source: "live", severity: m.severity === "critical" ? "critical" : "high", evidence: mask(m.secret), key: k.slice(0, 40), vars: { kind: m.kind, path: pathOnly } });
    }
    if (!sourceMapReported) {
      const ref = js.body.match(/\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m)?.[1];
      const candidates = ref && !ref.startsWith("data:") ? [new URL(ref, s).toString()] : i < 3 ? [`${s.split("?")[0]}.map`] : [];
      for (const c of candidates) {
        const map = await tryFetch(c, { maxBytes: 200_000 });
        if (map && map.status === 200 && /^\s*\{/.test(map.body) && /"sources"\s*:/.test(map.body)) {
          findings.push({ ruleId: "live.source-maps", source: "live", vars: { path: new URL(c).pathname } });
          sourceMapReported = true;
          break;
        }
      }
    }
  }

  // 4) CORS
  let corsReported = false;
  for (const p of ["/", "/api", "/api/health", "/api/user", "/api/me"]) {
    if (corsReported) break;
    const r = await tryFetch(origin + p, { headers: { origin: EVIL_ORIGIN } });
    if (!r) continue;
    const acao = r.headers.get("access-control-allow-origin");
    const creds = (r.headers.get("access-control-allow-credentials") || "").toLowerCase() === "true";
    if (acao === EVIL_ORIGIN && (creds || p.startsWith("/api"))) {
      findings.push({ ruleId: "live.cors-reflect", source: "live", severity: creds ? "high" : "medium", vars: { url: origin + p } });
      corsReported = true;
    } else if (acao === "*" && /json/i.test(r.headers.get("content-type") || "") && p.startsWith("/api")) {
      findings.push({ ruleId: "live.cors-wildcard", source: "live", vars: { url: origin + p } });
      corsReported = true;
    }
  }

  // 5) Exposed private paths (compared to a random 404 to avoid single-page-app false alarms)
  const baseline = await tryFetch(`${origin}/seaproof-${randomBytes(6).toString("hex")}`);
  for (const probe of PROBES) {
    const r = await tryFetch(origin + probe.path, { maxBytes: 300_000 });
    if (!r || r.status !== 200 || sameAsFallback(r, baseline) || !probe.looksReal(r)) continue;
    findings.push({ ruleId: "live.exposed-path", source: "live", severity: probe.severity, key: probe.path, vars: { path: probe.path, url: origin + probe.path, what: probe.what } });
  }
  return { findings };
}
