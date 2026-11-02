import { createHmac, createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import { safeEqual } from "./crypto";
import { env } from "./env";

const API = "https://api.github.com";
const headers = (token?: string) => ({
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "Seaproof",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

export const LOGIN_SCOPES = "read:user user:email";
export const PRIVATE_REPO_SCOPES = "read:user user:email repo";

export function authorizeUrl(state: string, scope: string) {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", env.githubClientId);
  u.searchParams.set("redirect_uri", `${env.appUrl}/api/auth/github/callback`);
  u.searchParams.set("scope", scope);
  u.searchParams.set("state", state);
  u.searchParams.set("allow_signup", "true");
  return u.toString();
}

export async function exchangeCode(code: string): Promise<{ token: string; scopes: string }> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: env.githubClientId, client_secret: env.githubClientSecret, code, redirect_uri: `${env.appUrl}/api/auth/github/callback` }),
  });
  const json = (await res.json()) as { access_token?: string; scope?: string; error_description?: string };
  if (!json.access_token) throw new Error(json.error_description || "GitHub login failed");
  return { token: json.access_token, scopes: json.scope || "" };
}

export interface GitHubUser { id: number; login: string; name: string | null; avatar_url: string; email: string | null; }

export async function getGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub /user failed (${res.status})`);
  const user = (await res.json()) as GitHubUser;
  if (!user.email) {
    const emails = await fetch(`${API}/user/emails`, { headers: headers(token) }).then((r) => (r.ok ? r.json() : [])).catch(() => []) as { email: string; primary: boolean; verified: boolean }[];
    user.email = emails.find((e) => e.primary && e.verified)?.email ?? null;
  }
  return user;
}

export type RepoAccess = { ok: true; private: boolean; defaultBranch: string } | { ok: false; reason: "not_found" | "unknown" };

/** Check we can see the repo. 404 means "missing or private without access". */
export async function checkRepoAccess(fullName: string, token?: string): Promise<RepoAccess> {
  try {
    const res = await fetch(`${API}/repos/${fullName}`, { headers: headers(token), signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unknown" };
    const j = (await res.json()) as { private: boolean; default_branch: string };
    return { ok: true, private: j.private, defaultBranch: j.default_branch };
  } catch {
    return { ok: false, reason: "unknown" };
  }
}

// ─── GitHub App (PR checks + read-only installation tokens) ───────────

export const githubAppConfigured = () => !!(env.githubAppId && env.githubAppPrivateKey);

async function appJwt(): Promise<string> {
  const key = createPrivateKey(env.githubAppPrivateKey); // accepts PKCS#1 ("BEGIN RSA PRIVATE KEY") and PKCS#8
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({}).setProtectedHeader({ alg: "RS256" }).setIssuer(env.githubAppId).setIssuedAt(now - 60).setExpirationTime(now + 9 * 60).sign(key);
}

export async function installationToken(installationId: string | number): Promise<string> {
  const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: headers(await appJwt()),
    body: JSON.stringify({ permissions: { contents: "read", checks: "write", metadata: "read" } }),
  });
  if (!res.ok) throw new Error(`GitHub installation token failed (${res.status})`);
  return ((await res.json()) as { token: string }).token;
}

export interface CheckRunUpdate {
  status?: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral";
  details_url?: string;
  output?: { title: string; summary: string; text?: string };
}

export async function createCheckRun(installationId: string | number, fullName: string, headSha: string, body: CheckRunUpdate): Promise<number> {
  const token = await installationToken(installationId);
  const res = await fetch(`${API}/repos/${fullName}/check-runs`, {
    method: "POST", headers: headers(token),
    body: JSON.stringify({ name: "Seaproof", head_sha: headSha, ...body }),
  });
  if (!res.ok) throw new Error(`GitHub create check run failed (${res.status})`);
  return ((await res.json()) as { id: number }).id;
}

export async function updateCheckRun(installationId: string | number, fullName: string, checkRunId: string | number, body: CheckRunUpdate) {
  const token = await installationToken(installationId);
  const res = await fetch(`${API}/repos/${fullName}/check-runs/${checkRunId}`, { method: "PATCH", headers: headers(token), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub update check run failed (${res.status})`);
}

export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
