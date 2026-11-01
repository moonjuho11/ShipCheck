import type { RawFinding, ScanContext, Severity } from "../types";

export interface Dep { name: string; version: string; ecosystem: "npm" | "PyPI"; direct: boolean; dev: boolean; file: string; }

const OSV = process.env.OSV_API_URL || "https://api.osv.dev";

// ─── Lockfile parsing ──────────────────────────────────────────────

function parsePackageLock(content: string, file: string): Dep[] {
  const lock = JSON.parse(content);
  const root = lock.packages?.[""] ?? {};
  const directNames = new Set([...Object.keys(root.dependencies || {}), ...Object.keys(root.devDependencies || {}), ...Object.keys(lock.dependencies || {}).filter(() => !lock.packages)]);
  const out: Dep[] = [];
  if (lock.packages) {
    for (const [key, v] of Object.entries<{ version?: string; dev?: boolean; link?: boolean }>(lock.packages)) {
      if (!key || !v.version || v.link) continue;
      const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
      const isTop = key === `node_modules/${name}`;
      out.push({ name, version: v.version, ecosystem: "npm", direct: isTop && directNames.has(name), dev: !!v.dev, file });
    }
  } else if (lock.dependencies) {
    const walk = (deps: Record<string, { version: string; dev?: boolean; dependencies?: Record<string, unknown> }>, top: boolean) => {
      for (const [name, v] of Object.entries(deps)) {
        if (v.version && /^\d/.test(v.version)) out.push({ name, version: v.version, ecosystem: "npm", direct: top, dev: !!v.dev, file });
        if (v.dependencies) walk(v.dependencies as never, false);
      }
    };
    walk(lock.dependencies, true);
  }
  return out;
}

function parsePnpmLock(content: string, file: string, direct: Set<string>): Dep[] {
  const out: Dep[] = [];
  // v9: "  lodash@4.17.15:" / "  '@scope/x@1.0.0':"; v6: "  /lodash@4.17.15:"; v5: "  /lodash/4.17.15:"
  const re = /^ {2}'?\/?((?:@[^/@\s']+\/)?[^/@\s:']+)[@/](\d[^:(\s']*)/gm;
  for (const m of content.matchAll(re)) out.push({ name: m[1], version: m[2], ecosystem: "npm", direct: direct.has(m[1]), dev: false, file });
  return out;
}

function parseYarnLock(content: string, file: string, direct: Set<string>): Dep[] {
  const out: Dep[] = [];
  const re = /^"?((?:@[^@\s"]+\/)?[^@\s",]+)@[^\n]*:\n(?:[ \t]+[^\n]*\n)*?[ \t]+version:?\s+"?([^"\s]+)"?/gm;
  for (const m of content.matchAll(re)) out.push({ name: m[1], version: m[2], ecosystem: "npm", direct: direct.has(m[1]), dev: false, file });
  return out;
}

function parseRequirements(content: string, file: string): Dep[] {
  const out: Dep[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*==\s*([0-9][^\s;#]*)/);
    if (m) out.push({ name: m[1].toLowerCase(), version: m[2], ecosystem: "PyPI", direct: true, dev: false, file });
  }
  return out;
}

export function collectDependencies(ctx: ScanContext): { deps: Dep[]; noLockfile: boolean } {
  const deps: Dep[] = [];
  const pkg = ctx.project.packageJson;
  const directNpm = new Set([...Object.keys(pkg?.dependencies || {}), ...Object.keys(pkg?.devDependencies || {})]);
  const lock = ctx.byPath.get("package-lock.json") || ctx.byPath.get("npm-shrinkwrap.json");
  const pnpm = ctx.byPath.get("pnpm-lock.yaml");
  const yarn = ctx.byPath.get("yarn.lock");
  const bun = ctx.byPath.get("bun.lock") || ctx.files.find((f) => f.path === "bun.lockb");
  try {
    if (lock) deps.push(...parsePackageLock(lock.content, lock.path));
    else if (pnpm) deps.push(...parsePnpmLock(pnpm.content, pnpm.path, directNpm));
    else if (yarn) deps.push(...parseYarnLock(yarn.content, yarn.path, directNpm));
  } catch { /* malformed lockfile → fall back to package.json below */ }
  const noLockfile = !!pkg && !lock && !pnpm && !yarn && !bun;
  if (pkg && deps.length === 0) {
    // Best effort: exact or caret/tilde versions straight from package.json.
    for (const [name, spec] of Object.entries({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) })) {
      const v = String(spec).match(/^[\^~=v]?(\d+\.\d+\.\d+[^\s]*)$/)?.[1];
      if (v) deps.push({ name, version: v, ecosystem: "npm", direct: true, dev: !!pkg.devDependencies?.[name], file: "package.json" });
    }
  }
  for (const f of ctx.files) if (/(^|\/)requirements[\w-]*\.txt$/.test(f.path)) deps.push(...parseRequirements(f.content, f.path));
  // Dedupe name@version, preferring "direct" entries.
  const map = new Map<string, Dep>();
  for (const d of deps) {
    const k = `${d.ecosystem}:${d.name}@${d.version}`;
    const prev = map.get(k);
    if (!prev || (d.direct && !prev.direct)) map.set(k, d);
  }
  return { deps: [...map.values()], noLockfile };
}

// ─── OSV ───────────────────────────────────────────────────────────

interface OsvVuln {
  id: string;
  summary?: string;
  aliases?: string[];
  withdrawn?: string;
  database_specific?: { severity?: string };
  affected?: { package?: { name: string; ecosystem: string }; ranges?: { type: string; events: { introduced?: string; fixed?: string }[] }[] }[];
}

const vulnCache = new Map<string, OsvVuln>();

async function fetchJson<T>(url: string, init?: RequestInit, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (res.ok) return (await res.json()) as T;
      lastErr = new Error(`${url} → ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  throw lastErr;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

export function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const pb = b.split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

function osvSeverity(v: OsvVuln): Severity {
  const s = (v.database_specific?.severity || "").toUpperCase();
  if (s === "CRITICAL") return "critical";
  if (s === "HIGH") return "high";
  if (s === "LOW") return "low";
  return "medium";
}

function fixedVersionFor(v: OsvVuln, dep: Dep): string | undefined {
  for (const a of v.affected || []) {
    if (a.package?.name?.toLowerCase() !== dep.name.toLowerCase()) continue;
    for (const r of a.ranges || []) {
      if (r.type !== "SEMVER" && r.type !== "ECOSYSTEM") continue;
      const fixes = r.events.map((e) => e.fixed).filter((x): x is string => !!x && cmpVersion(x, dep.version) > 0).sort(cmpVersion);
      if (fixes.length) return fixes[0];
    }
  }
  return undefined;
}

const RANK: Severity[] = ["critical", "high", "medium", "low"];
const worse = (a: Severity, b: Severity) => (RANK.indexOf(a) <= RANK.indexOf(b) ? a : b);
const cap = (s: Severity, max: Severity) => (RANK.indexOf(s) < RANK.indexOf(max) ? max : s);

export async function checkDependencies(ctx: ScanContext): Promise<{ findings: RawFinding[]; osv: "ok" | "failed" | "skipped"; depCount: number }> {
  const { deps, noLockfile } = collectDependencies(ctx);
  const findings: RawFinding[] = [];
  if (noLockfile) findings.push({ ruleId: "deps.no-lockfile", source: "analyzer", file: "package.json" });
  if (!deps.length) return { findings, osv: "skipped", depCount: 0 };

  try {
    const hits: { dep: Dep; ids: string[] }[] = [];
    for (let i = 0; i < deps.length; i += 500) {
      const chunk = deps.slice(i, i + 500);
      const res = await fetchJson<{ results: { vulns?: { id: string }[] }[] }>(`${OSV}/v1/querybatch`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries: chunk.map((d) => ({ package: { name: d.name, ecosystem: d.ecosystem }, version: d.version })) }),
      });
      res.results.forEach((r, j) => { if (r.vulns?.length) hits.push({ dep: chunk[j], ids: r.vulns.map((v) => v.id) }); });
    }
    const ids = [...new Set(hits.flatMap((h) => h.ids))].filter((id) => !vulnCache.has(id)).slice(0, 400);
    await pool(ids, 10, async (id) => {
      try { vulnCache.set(id, await fetchJson<OsvVuln>(`${OSV}/v1/vulns/${encodeURIComponent(id)}`)); } catch { /* use what we have */ }
    });

    const perPackage: RawFinding[] = [];
    for (const { dep, ids: vids } of hits) {
      const vulns = vids.map((id) => vulnCache.get(id) ?? ({ id } as OsvVuln)).filter((v) => !v.withdrawn);
      if (!vulns.length) continue;
      let sev: Severity = "low";
      let fixed: string | undefined;
      for (const v of vulns) {
        sev = worse(sev, osvSeverity(v));
        const f = fixedVersionFor(v, dep);
        if (f && (!fixed || cmpVersion(f, fixed) > 0)) fixed = f;
      }
      // Transitive and dev-only packages are real but less urgent.
      if (dep.dev) sev = cap(sev, "low");
      else if (!dep.direct) sev = cap(sev, "medium");
      const top = [...vulns].sort((a, b) => RANK.indexOf(osvSeverity(a)) - RANK.indexOf(osvSeverity(b)))[0];
      perPackage.push({
        ruleId: "deps.vulnerable", source: "osv", file: dep.file, severity: sev, key: `${dep.name}@${dep.version}`,
        evidence: vulns.slice(0, 5).map((v) => v.aliases?.find((a) => a.startsWith("CVE-")) || v.id).join(", ") + (vulns.length > 5 ? ` +${vulns.length - 5} more` : ""),
        vars: { pkg: dep.name, version: dep.version, count: String(vulns.length), fixed: fixed || "", direct: dep.direct ? "1" : "", summary: (top.summary || "").slice(0, 160) },
      });
    }
    perPackage.sort((a, b) => RANK.indexOf(a.severity!) - RANK.indexOf(b.severity!) || Number(!!b.vars?.direct) - Number(!!a.vars?.direct));
    const directOnes = perPackage.filter((f) => f.vars?.direct);
    const transitive = perPackage.filter((f) => !f.vars?.direct).slice(0, 15);
    findings.push(...directOnes, ...transitive);
    return { findings, osv: "ok", depCount: deps.length };
  } catch {
    return { findings, osv: "failed", depCount: deps.length };
  }
}
