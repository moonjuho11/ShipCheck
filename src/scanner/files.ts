import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectInfo, RepoFile, ScanContext } from "./types";

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", ".nuxt", ".svelte-kit", ".vercel", ".netlify", ".turbo", ".cache",
  "dist", "build", "out", "coverage", "vendor", "bower_components", ".venv", "venv", "__pycache__",
  ".expo", "android", "ios", "Pods", ".idea", ".vscode",
]);

// Lockfiles and bundles that are big but useful are allowed a bigger cap.
const BIG_OK = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock"]);
const MAX_FILE_BYTES = 1_000_000;
const MAX_BIG_FILE_BYTES = 15_000_000;
const MAX_FILES = 8_000;
const MAX_TOTAL_BYTES = 120_000_000;

const TEXT_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".astro",
  ".json", ".yaml", ".yml", ".toml", ".sql", ".rules", ".env", ".md", ".txt", ".html", ".py",
  ".rb", ".go", ".php", ".sh", ".prisma", ".graphql", ".lock", ".ini", ".cfg", ".conf", ".xml",
]);

function isTextCandidate(name: string): boolean {
  if (name.startsWith(".env")) return true;
  if (["Dockerfile", "Procfile", ".gitignore", "firestore.rules", "storage.rules", "database.rules.json"].includes(name)) return true;
  return TEXT_EXT.has(path.extname(name).toLowerCase());
}

/**
 * Read the repo into memory. Symlinks are skipped (a malicious repo could point
 * one at /etc/passwd), as are binaries, vendored folders and huge files.
 */
export async function readRepo(root: string): Promise<RepoFile[]> {
  const out: RepoFile[] = [];
  let total = 0;
  async function walk(dir: string) {
    if (out.length >= MAX_FILES) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= MAX_FILES || total >= MAX_TOTAL_BYTES) return;
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(abs);
        continue;
      }
      if (!e.isFile() || !isTextCandidate(e.name)) continue;
      const st = await fs.lstat(abs);
      const cap = BIG_OK.has(e.name) ? MAX_BIG_FILE_BYTES : MAX_FILE_BYTES;
      if (st.size > cap) continue;
      const buf = await fs.readFile(abs);
      if (buf.includes(0)) continue; // binary
      if (e.name.endsWith(".min.js") || e.name.endsWith(".map")) continue;
      total += buf.length;
      out.push({ path: path.relative(root, abs).split(path.sep).join("/"), content: buf.toString("utf8") });
    }
  }
  await walk(root);
  return out;
}

export function detectProject(files: RepoFile[]): ProjectInfo {
  const stack = new Set<string>();
  const pkgFile = files.find((f) => f.path === "package.json");
  let packageJson: ProjectInfo["packageJson"];
  if (pkgFile) {
    try { packageJson = JSON.parse(pkgFile.content); } catch { /* ignore */ }
  }
  const deps = { ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) };
  const has = (n: string) => Object.keys(deps).some((d) => d === n || d.startsWith(n + "/"));
  if (has("next")) stack.add("next");
  if (has("vite")) stack.add("vite");
  if (has("react-scripts")) stack.add("cra");
  if (has("express") || has("fastify") || has("koa") || has("hono")) stack.add("node-server");
  if (has("@supabase")) stack.add("supabase");
  if (has("firebase") || has("firebase-admin")) stack.add("firebase");
  if (has("prisma") || has("@prisma")) stack.add("prisma");
  if (has("drizzle-orm")) stack.add("drizzle");
  if (has("mongoose") || has("mongodb")) stack.add("mongo");
  if (has("pg") || has("postgres") || has("mysql2") || has("better-sqlite3")) stack.add("sql");
  if (has("stripe") || has("@stripe")) stack.add("stripe");
  if (has("@clerk")) stack.add("clerk");
  if (has("next-auth") || has("@auth")) stack.add("nextauth");
  if (files.some((f) => f.path.startsWith("supabase/"))) stack.add("supabase");
  if (files.some((f) => /(^|\/)(firestore|storage)\.rules$|(^|\/)database\.rules\.json$|(^|\/)firebase\.json$/.test(f.path))) stack.add("firebase");
  return { stack, packageJson };
}

export async function buildContext(root: string): Promise<ScanContext> {
  const files = await readRepo(root);
  let hasGitHistory = false;
  try { hasGitHistory = (await fs.stat(path.join(root, ".git"))).isDirectory(); } catch { /* no git */ }
  return { root, files, byPath: new Map(files.map((f) => [f.path, f])), project: detectProject(files), hasGitHistory };
}

/** 1-based line number of a character offset. */
export function lineOf(content: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index && i < content.length; i++) if (content.charCodeAt(i) === 10) n++;
  return n;
}

export const CODE_RE = /\.(m|c)?(j|t)sx?$|\.(vue|svelte|astro)$/;
export const isCode = (p: string) => CODE_RE.test(p);
export const isTestFile = (p: string) => /(^|\/)(__tests__|tests?|spec|e2e|cypress|fixtures|mocks?)\/|\.(test|spec|stories)\.[jt]sx?$/.test(p);

/** Is this file shipped to the browser? (best-effort) */
export function isClientFile(f: RepoFile, project: ProjectInfo): boolean {
  if (/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*["']use client["']/.test(f.content)) return true;
  if (project.stack.has("next")) {
    if (/(^|\/)pages\//.test(f.path) && !/(^|\/)pages\/api\//.test(f.path)) return true;
    return false; // App Router files are server components unless marked
  }
  // Vite / CRA single-page apps: everything under src/ ships to the browser.
  if ((project.stack.has("vite") || project.stack.has("cra")) && /^(src|app)\//.test(f.path) && !/(^|\/)(server|api|functions|supabase\/functions)\//.test(f.path)) return true;
  if (/\.(vue|svelte)$/.test(f.path)) return true;
  return false;
}
