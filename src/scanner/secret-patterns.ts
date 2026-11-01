import type { Severity } from "./types";

export interface SecretMatch {
  kind: string;
  severity: Severity;
  secret: string;
  index: number;
  envName?: string;
}

interface Pattern { kind: string; re: RegExp; severity: Severity; envName?: string; check?: (s: string, ctx: string) => SecretMatch["severity"] | null | { kind: string; severity: Severity } }

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch { return null; }
}

const LOCAL_DB_HOST = /@(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|mysql|mongo|host\.docker\.internal)(:\d+)?(\/|$)/i;
const PLACEHOLDER = /(x{4,}|\*{3,}|<[^>]+>|\$\{|your[-_]?|example|changeme|placeholder|dummy|redacted)/i;

export const PATTERNS: Pattern[] = [
  { kind: "Stripe secret key", re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/g, severity: "critical", envName: "STRIPE_SECRET_KEY" },
  { kind: "Stripe test secret key", re: /\b(?:sk|rk)_test_[0-9a-zA-Z]{20,}\b/g, severity: "high", envName: "STRIPE_SECRET_KEY" },
  { kind: "Stripe webhook secret", re: /\bwhsec_[0-9a-zA-Z]{24,}\b/g, severity: "high", envName: "STRIPE_WEBHOOK_SECRET" },
  { kind: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: "critical", envName: "AWS_ACCESS_KEY_ID",
    check: (s) => (s.endsWith("EXAMPLE") ? null : "critical") },
  { kind: "OpenAI API key", re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{16,}T3BlbkFJ[A-Za-z0-9_-]{16,}\b|\bsk-proj-[A-Za-z0-9_-]{40,}\b/g, severity: "critical", envName: "OPENAI_API_KEY" },
  { kind: "Anthropic API key", re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}\b/g, severity: "critical", envName: "ANTHROPIC_API_KEY" },
  { kind: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{70,}\b/g, severity: "critical", envName: "GITHUB_TOKEN" },
  { kind: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, severity: "high", envName: "SLACK_TOKEN" },
  { kind: "SendGrid API key", re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, severity: "critical", envName: "SENDGRID_API_KEY" },
  { kind: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g, severity: "critical", envName: "SUPABASE_SECRET_KEY" },
  { kind: "private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g, severity: "critical", envName: "PRIVATE_KEY" },
  { kind: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: "high", envName: "GOOGLE_API_KEY",
    // Firebase web config keys are designed to be public; their safety comes from security rules.
    check: (_s, ctx) => (/authDomain|firebaseConfig|projectId|initializeApp/.test(ctx) ? null : "high") },
  { kind: "Supabase service-role (admin) key", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, severity: "critical", envName: "SUPABASE_SERVICE_ROLE_KEY",
    check: (s) => {
      const p = decodeJwtPayload(s);
      if (!p) return null;
      if (p.role === "service_role") return "critical";
      return null; // anon keys are public by design; other JWTs are usually session tokens
    } },
  { kind: "database password", re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss):\/\/[^:\s'"`/@]+:[^@\s'"`]{3,}@[^\s'"`]+/g, severity: "critical", envName: "DATABASE_URL",
    check: (s) => (LOCAL_DB_HOST.test(s) || PLACEHOLDER.test(s) ? null : "critical") },
];

/** Built-in detector used alongside Gitleaks, and for scanning live JS bundles. */
export function findSecrets(content: string): SecretMatch[] {
  const out: SecretMatch[] = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(content))) {
      const secret = m[0];
      if (p.kind !== "private key" && PLACEHOLDER.test(secret) && p.kind !== "database password") continue;
      const ctx = content.slice(Math.max(0, m.index - 300), m.index + 300);
      let severity: Severity | null = p.severity;
      let kind = p.kind;
      if (p.check) {
        const r = p.check(secret, ctx);
        if (r === null) continue;
        if (typeof r === "object") { severity = r.severity; kind = r.kind; } else severity = r;
      }
      out.push({ kind, severity: severity!, secret, index: m.index, envName: p.envName });
    }
  }
  return out;
}

/** Classify a secret string Gitleaks found, preferring our more specific labels. */
export function classify(secret: string, gitleaksRule: string, ctx = ""): { kind: string; severity: Severity; envName?: string } | null {
  const ours = findSecrets(secret);
  if (ours.length) return ours[0];
  // A JWT we couldn't classify as service_role (e.g. a Supabase anon key) — public by design.
  if (/^eyJ/.test(secret) || gitleaksRule === "jwt") return null;
  if (gitleaksRule === "gcp-api-key" && /authDomain|firebaseConfig|projectId/.test(ctx)) return null;
  const isTest = /test|sandbox/i.test(secret);
  return { kind: gitleaksLabel(gitleaksRule), severity: isTest ? "high" : "critical" };
}

const LABELS: Record<string, string> = {
  "generic-api-key": "API key or password",
  "aws-access-token": "AWS access key",
  "gcp-api-key": "Google API key",
  "private-key": "private key",
  "jwt": "access token",
  "slack-webhook-url": "Slack webhook URL",
  "discord-api-token": "Discord token",
  "twilio-api-key": "Twilio API key",
  "mailgun-private-api-token": "Mailgun API key",
  "openai-api-key": "OpenAI API key",
  "anthropic-api-key": "Anthropic API key",
  "github-pat": "GitHub token",
  "stripe-access-token": "Stripe secret key",
};

export function gitleaksLabel(rule: string): string {
  if (LABELS[rule]) return LABELS[rule];
  const words = rule.split("-").map((w) => (/^(api|aws|gcp|jwt|pat|id|url|ssh)$/i.test(w) ? w.toUpperCase() : w));
  return words.join(" ").replace(/^\w/, (c) => c.toUpperCase());
}

export function mask(secret: string): string {
  const s = secret.trim();
  if (s.length <= 12) return "•••";
  return `${s.slice(0, 4)}•••${s.slice(-2)}`;
}
