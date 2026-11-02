// Central place to read configuration. Server-only.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. See README.md → Setup.`);
  return v;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  get appUrl() { return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""); },
  get sessionSecret() { return required("SESSION_SECRET"); },
  get encryptionKey() { return required("ENCRYPTION_KEY"); },
  get githubClientId() { return required("GITHUB_CLIENT_ID"); },
  get githubClientSecret() { return required("GITHUB_CLIENT_SECRET"); },
  get githubAppId() { return process.env.GITHUB_APP_ID || ""; },
  get githubAppPrivateKey() { return (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n"); },
  get githubAppWebhookSecret() { return process.env.GITHUB_APP_WEBHOOK_SECRET || ""; },
  get githubAppSlug() { return process.env.GITHUB_APP_SLUG || ""; },
  get stripeSecretKey() { return required("STRIPE_SECRET_KEY"); },
  get stripeWebhookSecret() { return required("STRIPE_WEBHOOK_SECRET"); },
  get stripePriceRepo() { return required("STRIPE_PRICE_REPO"); },
  get stripePricePro() { return required("STRIPE_PRICE_PRO"); },
  get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY || ""; },
  get isProd() { return process.env.NODE_ENV === "production"; },
  /** Dev-only escape hatch so you can scan a local git repo (file:///…). Ignored in production. */
  get allowLocalRepos() { return process.env.NODE_ENV !== "production" && process.env.SEAPROOF_ALLOW_LOCAL_REPOS === "1"; },
  /** Dev/test-only: let live-site checks hit localhost. Ignored in production. */
  get allowPrivateTargets() { return process.env.NODE_ENV !== "production" && process.env.SEAPROOF_ALLOW_PRIVATE_TARGETS === "1"; },
};
