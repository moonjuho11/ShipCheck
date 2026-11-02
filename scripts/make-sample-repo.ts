// Materialise samples/<name> into a real git repo with freshly generated FAKE keys.
//   npm run sample:make -- insecure-app /tmp/taskpal
// The insecure repo gets two commits: the second deletes a file holding a token,
// so the "secret in Git history" check has something to find.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const alnum = (n: number) => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; return Array.from(randomBytes(n), (b) => c[b % c.length]).join(""); };
const upper = (n: number) => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; return Array.from(randomBytes(n), (b) => c[b % c.length]).join(""); };
const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role: string) => [b64u({ alg: "HS256", typ: "JWT" }), b64u({ iss: "supabase", ref: "abcdefghijklmnop", role, iat: 1700000000, exp: 2000000000 }), randomBytes(32).toString("base64url")].join(".");

// Assembled at runtime so this script itself never contains a key-shaped string.
export function fakeSecrets(): Record<string, string> {
  return {
    __STRIPE_LIVE_KEY__: ["sk", "live", alnum(32)].join("_"),
    __OPENAI_KEY__: ["sk", "proj", alnum(20) + "T3Blbk" + "FJ" + alnum(24)].join("-"),
    __SUPABASE_SERVICE_JWT__: jwt("service_role"),
    __SUPABASE_ANON_JWT__: jwt("anon"),
    __AWS_KEY_ID__: "AKIA" + upper(16),
    __AWS_SECRET__: alnum(40),
    __GITHUB_PAT__: "ghp" + "_" + alnum(36),
  };
}

function fill(dir: string, secrets: Record<string, string>) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== ".git") fill(p, secrets); continue; }
    let c = readFileSync(p, "utf8");
    const before = c;
    for (const [k, v] of Object.entries(secrets)) c = c.split(k).join(v);
    if (c !== before) writeFileSync(p, c);
  }
}

export function makeSampleRepo(sample: string, dest?: string): { dir: string; secrets: Record<string, string> } {
  const src = path.join(process.cwd(), "samples", sample);
  if (!existsSync(src)) throw new Error(`No sample named ${sample}`);
  const out = dest || path.join(os.tmpdir(), `seaproof-sample-${sample}-${randomBytes(3).toString("hex")}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const secrets = fakeSecrets();
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=sample@seaproof.dev", "-c", "user.name=Seaproof Sample", "-c", "commit.gpgsign=false", ...a], { cwd: out, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  if (sample === "insecure-app") {
    mkdirSync(path.join(out, "config"), { recursive: true });
    writeFileSync(path.join(out, "config", "deploy.ts"), `export const GITHUB_TOKEN = "${secrets.__GITHUB_PAT__}";\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "initial deploy script");
    rmSync(path.join(out, "config"), { recursive: true, force: true });
  }
  cpSync(src, out, { recursive: true });
  fill(out, secrets);
  git("add", "-A");
  git("commit", "-q", "-m", sample === "insecure-app" ? "build TaskPal with AI" : "initial commit");
  return { dir: out, secrets };
}

if (process.argv[1]?.endsWith("make-sample-repo.ts")) {
  const [sample = "insecure-app", dest] = process.argv.slice(2);
  console.log(makeSampleRepo(sample, dest).dir);
}
