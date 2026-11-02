// End-to-end smoke test against a running DEV server + worker (never production).
//   1. npm run dev   2. npm run worker   3. npm run sample:make -- insecure-app /tmp/taskpal
//   4. npx tsx --env-file=.env.local scripts/smoke.ts /tmp/taskpal [/tmp/notely]
// Requires SEAPROOF_ALLOW_LOCAL_REPOS=1 and SEAPROOF_ALLOW_PRIVATE_TARGETS=1 in .env.local.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import { SignJWT } from "jose";
import postgres from "postgres";
import Stripe from "stripe";

const APP = process.env.APP_URL || "http://localhost:3000";
const [taskpal, notely] = process.argv.slice(2);
if (!taskpal) throw new Error("usage: smoke.ts <insecure-repo-dir> [secure-repo-dir]");
if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
const db = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
let failures = 0;
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) failures++; };

async function session(githubId: number, login: string) {
  const [u] = await db<{ id: string }[]>`
    insert into users (github_id, github_login, name, avatar_url, github_scopes) values (${githubId}, ${login}, ${"Demo Founder"}, ${"https://avatars.githubusercontent.com/u/583231"}, 'read:user user:email')
    on conflict (github_id) do update set github_login = excluded.github_login returning id`;
  await db`delete from scans where user_id = ${u.id}`;
  await db`delete from repo_unlocks where user_id = ${u.id}`;
  await db`delete from subscriptions where user_id = ${u.id}`;
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
  return { id: u.id, cookie: `sc_session=${jwt}` };
}

const api = (path: string, cookie: string, init: RequestInit = {}) =>
  fetch(APP + path, { ...init, redirect: "manual", headers: { cookie, origin: APP, "content-type": "application/json", ...(init.headers || {}) } });

async function waitForScan(id: string, cookie: string) {
  const seen = new Set<string>();
  for (let i = 0; i < 240; i++) {
    const d = await (await api(`/api/scans/${id}`, cookie)).json();
    for (const s of d.steps) if (s.status === "running" && !seen.has(s.key)) { seen.add(s.key); console.log(`    … ${s.label}`); }
    if (d.status === "completed" || d.status === "failed") return d;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("scan timed out");
}

function insecureSite(): Promise<{ url: string; close: () => void }> {
  const key = ["sk", "live", "Zq8vN3kP0aLmT7rYbW2cXe5dGh9JsU4f"].join("_");
  const s = http.createServer((req, res) => {
    if (req.headers.origin) { res.setHeader("access-control-allow-origin", req.headers.origin); res.setHeader("access-control-allow-credentials", "true"); }
    if (req.url === "/") return res.end(`<html><head><title>TaskPal</title><script src="/app.js"></script></head></html>`);
    if (req.url === "/app.js") return res.end(`const k="${key}";\n//# sourceMappingURL=app.js.map`);
    if (req.url === "/app.js.map") return res.end(`{"version":3,"sources":["App.tsx"]}`);
    if (req.url === "/.env") return res.end("STRIPE_SECRET_KEY=x\n");
    res.statusCode = 404; res.end("nope");
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, close: () => s.close() })));
}

async function main() {
  const alice = await session(990001, "founder-demo");
  const mallory = await session(990002, "mallory");
  const site = await insecureSite();

  console.log("\n▶ Scan the insecure sample (free plan)");
  ok((await fetch(APP + "/api/scans", { method: "POST", headers: { cookie: alice.cookie, "content-type": "application/json" }, body: "{}" })).status === 403, "POST without Origin is rejected (CSRF guard)");
  ok((await fetch(APP + "/api/scans", { method: "POST", headers: { origin: APP, "content-type": "application/json" }, body: JSON.stringify({ repoUrl: "a/b" }) })).status === 401, "POST without a session is rejected");
  const res = await api("/api/scans", alice.cookie, { method: "POST", body: JSON.stringify({ repoUrl: `file://${taskpal}`, siteUrl: site.url }) });
  const { id } = await res.json();
  ok(res.status === 201 && id, `scan created (${id})`);
  const done = await waitForScan(id, alice.cookie);
  ok(done.status === "completed", `scan completed — score ${done.score}, production ready: ${done.productionReady}`);
  ok((await api(`/api/scans/${id}`, mallory.cookie)).status === 404, "another user can't read this scan");

  const [scan] = await db<{ counts: Record<string, number>; share_token: string }[]>`select counts, share_token from scans where id = ${id}`;
  const rules = (await db<{ rule_id: string }[]>`select rule_id from findings where scan_id = ${id}`).map((r) => r.rule_id);
  console.log("    counts:", scan.counts);
  for (const r of ["live.secret-in-bundle", "live.source-maps", "live.cors-reflect", "live.exposed-path", "live.missing-headers", "db.rls-disabled", "auth.idor", "input.sql-injection"]) ok(rules.includes(r), `stored finding ${r}`);
  const leaked = await db`select 1 from findings where scan_id = ${id} and (evidence ~ 'sk_live_[A-Za-z0-9]{20}' or explanation ~ 'sk_live_[A-Za-z0-9]{20}')`;
  ok(leaked.length === 0, "no full secret stored in the database");

  let html = await (await api(`/scans/${id}`, alice.cookie, { headers: { accept: "text/html" } })).text();
  ok(html.includes("Unlock the fixes"), "free report shows the unlock prompt");
  ok(!html.includes("Fix a security problem in my app"), "free report does NOT contain fix prompts in the HTML");
  ok(!html.includes("src/app/api/search/route.ts"), "free report does NOT contain file paths in the HTML");

  const second = await api("/api/scans", alice.cookie, { method: "POST", body: JSON.stringify({ repoUrl: `file://${taskpal}` }) });
  ok(second.status === 402, "second free scan this month is blocked (402)");

  console.log("\n▶ Pay $29 (simulated Stripe webhook)");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const event = { id: "evt_test", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_test_smoke", object: "checkout.session", mode: "payment", payment_status: "paid", amount_total: 2900, client_reference_id: alice.id, metadata: { userId: alice.id, plan: "repo", repo: "local/taskpal" } } } };
  const payload = JSON.stringify(event);
  ok((await fetch(APP + "/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": "t=1,v1=bad" } })).status === 400, "webhook with a bad signature is rejected");
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  ok((await fetch(APP + "/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } })).status === 200, "signed webhook accepted");
  ok((await db`select 1 from repo_unlocks where user_id = ${alice.id} and repo_full_name = 'local/taskpal'`).length === 1, "repo unlock recorded");
  html = await (await api(`/scans/${id}`, alice.cookie)).text();
  ok(html.includes("Fix a security problem in my app"), "unlocked report now includes fix prompts");

  console.log("\n▶ Share + badge");
  const share = await (await api(`/api/scans/${id}/share`, alice.cookie, { method: "POST", body: JSON.stringify({ public: true }) })).json();
  ok(share.public === true, "report made public");
  const pub = await (await fetch(`${APP}/r/${scan.share_token}`)).text();
  ok(pub.includes("Not ready to launch") && !pub.includes("route.ts") && !pub.includes("Fix a security problem"), "public page shows the verdict but no files or fixes");
  const badge1 = await (await fetch(`${APP}/api/badge/${scan.share_token}`)).text();
  ok(badge1.includes("badge needs Pro"), "badge requires Pro");
  await db`insert into subscriptions (user_id, stripe_subscription_id, status, current_period_end) values (${alice.id}, ${"sub_smoke_" + alice.id.slice(0, 8)}, 'active', now() + interval '30 days')`;
  const badge2 = await (await fetch(`${APP}/api/badge/${scan.share_token}`)).text();
  ok(badge2.includes("not verified"), "failing app gets a neutral 'not verified' badge");

  if (notely) {
    console.log("\n▶ Pro: scan the secure sample");
    const r2 = await (await api("/api/scans", alice.cookie, { method: "POST", body: JSON.stringify({ repoUrl: `file://${notely}` }) })).json();
    const d2 = await waitForScan(r2.id, alice.cookie);
    ok(d2.status === "completed" && d2.productionReady === true, `secure sample is Production Ready (score ${d2.score})`);
    const s2 = await (await api(`/api/scans/${r2.id}/share`, alice.cookie, { method: "POST", body: JSON.stringify({ public: true }) })).json();
    const badge3 = await (await fetch(`${APP}/api/badge/${s2.shareToken}`)).text();
    ok(badge3.includes("production ready ✓"), "passing Pro app gets the green badge");
  }

  console.log("\n▶ GitHub App webhook");
  const body = JSON.stringify({ action: "created", installation: { id: 4242, account: { login: "founder-demo", id: 990001 } }, sender: { id: 990001, login: "founder-demo" } });
  ok((await fetch(APP + "/api/github/webhook", { method: "POST", body, headers: { "x-github-event": "installation", "x-hub-signature-256": "sha256=bad" } })).status === 401, "GitHub webhook with a bad signature is rejected");
  if (process.env.GITHUB_APP_WEBHOOK_SECRET) {
    const sig = "sha256=" + createHmac("sha256", process.env.GITHUB_APP_WEBHOOK_SECRET).update(body).digest("hex");
    ok((await fetch(APP + "/api/github/webhook", { method: "POST", body, headers: { "x-github-event": "installation", "x-hub-signature-256": sig } })).status === 200, "signed installation webhook accepted");
    ok((await db`select 1 from github_installations where installation_id = 4242 and user_id = ${alice.id}`).length === 1, "installation linked to the user");
    await db`delete from github_installations where installation_id = 4242`;
  }

  site.close();
  console.log(`\n${failures ? `✗ ${failures} check(s) failed` : "✓ all smoke checks passed"}`);
  console.log(`Report: ${APP}/scans/${id}\nSession cookie for screenshots: ${alice.cookie.slice(0, 24)}…`);
  await db.end();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.end(); process.exit(1); });
