import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkLiveSite } from "../src/scanner/checks/live-site";
import { assertPublicUrl, BlockedTargetError, isPrivateIp } from "../src/scanner/net";

// Assembled at runtime so the repo never contains a key-shaped string.
const FAKE_STRIPE = ["sk", "live", "Zq8vN3kP0aLmT7rYbW2cXe5dGh9JsU4f"].join("_");

function insecureServer() {
  return http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin) { res.setHeader("access-control-allow-origin", origin); res.setHeader("access-control-allow-credentials", "true"); }
    switch (req.url) {
      case "/":
        res.setHeader("content-type", "text/html");
        return res.end(`<html><head><title>TaskPal</title><script src="/assets/app.js"></script></head><body>hi</body></html>`);
      case "/assets/app.js":
        res.setHeader("content-type", "application/javascript");
        return res.end(`const stripe="${FAKE_STRIPE}";console.log(stripe);\n//# sourceMappingURL=app.js.map`);
      case "/assets/app.js.map":
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ version: 3, sources: ["src/App.tsx"], sourcesContent: ["secret code"] }));
      case "/.env":
        res.setHeader("content-type", "text/plain");
        return res.end("DATABASE_URL=postgres://x\nSTRIPE_SECRET_KEY=redacted\n");
      case "/admin":
        res.setHeader("content-type", "text/html");
        return res.end("<html><head><title>Admin</title></head><body><h1>All users</h1><table>…</table></body></html>");
      default:
        res.statusCode = 404;
        return res.end("not found");
    }
  });
}

// A well-configured single-page app: every unknown path returns index.html (200).
function secureSpaServer() {
  return http.createServer((req, res) => {
    res.setHeader("content-security-policy", "default-src 'self'; frame-ancestors 'none'");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("x-frame-options", "DENY");
    if (req.url === "/assets/app.js") { res.setHeader("content-type", "application/javascript"); return res.end("console.log('hello')"); }
    if (req.url?.endsWith(".map")) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", "text/html");
    res.end(`<html><head><title>Notely</title><script src="/assets/app.js"></script></head><body><div id="root"></div></body></html>`);
  });
}

const servers: http.Server[] = [];
let badUrl = "", goodUrl = "";

beforeAll(async () => {
  process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS = "1";
  for (const [make, set] of [[insecureServer, (u: string) => (badUrl = u)], [secureSpaServer, (u: string) => (goodUrl = u)]] as const) {
    const s = make();
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
    servers.push(s);
    set(`http://127.0.0.1:${(s.address() as AddressInfo).port}/`);
  }
});
afterAll(() => {
  delete process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS;
  servers.forEach((s) => s.close());
});

describe("live site checks", () => {
  it("finds missing headers, source maps, secrets in bundles, open CORS and exposed paths", async () => {
    const { findings } = await checkLiveSite(badUrl);
    const ids = findings.map((f) => `${f.ruleId}${f.vars?.path ? " " + f.vars.path : ""}`);
    expect(ids).toEqual(expect.arrayContaining([
      "live.missing-headers",
      "live.source-maps /assets/app.js.map",
      "live.secret-in-bundle /assets/app.js",
      "live.cors-reflect",
      "live.exposed-path /.env",
      "live.exposed-path /admin",
    ]));
    const bundle = findings.find((f) => f.ruleId === "live.secret-in-bundle")!;
    expect(bundle.evidence).not.toContain(FAKE_STRIPE);
    expect(bundle.severity).toBe("critical");
  });

  it("does not raise false alarms on a well-configured single-page app", async () => {
    const { findings } = await checkLiveSite(goodUrl);
    expect(findings.map((f) => f.ruleId)).toEqual([]);
  });
});

describe("SSRF protection", () => {
  it("recognises private and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "104.20.23.154", "2606:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it("refuses internal targets and non-http schemes", async () => {
    const prev = process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS;
    delete process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS;
    try {
      for (const u of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://localhost:3000", "file:///etc/passwd", "http://user:pass@example.com", "http://[::1]/", "http://metadata.google.internal/"]) {
        await expect(assertPublicUrl(u), u).rejects.toBeInstanceOf(BlockedTargetError);
      }
    } finally {
      if (prev) process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS = prev;
    }
  });
});
