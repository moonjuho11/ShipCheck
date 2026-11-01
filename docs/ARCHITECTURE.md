# ShipCheck architecture

ShipCheck is a pre-launch safety audit for apps built with AI coding tools
(Lovable, Bolt, Cursor, Replit, v0, …). A user pastes a GitHub repo URL (and
optionally their live site URL); a background worker clones the repo into a
throwaway sandbox, runs deterministic scanners plus an LLM review, stores
**only findings**, deletes the clone, and renders a plain-English report.

```
 Browser ──POST /api/scans──▶ Next.js (App Router) ──INSERT scans + jobs──▶ Postgres
    ▲                                                                          │
    │ poll GET /api/scans/:id (live progress steps)                            │ SELECT … FOR UPDATE SKIP LOCKED
    │                                                                          ▼
    └──────────────────── report page ◀── findings ◀──────────────── worker (npm run worker)
                                                                          │
                                       ┌──────────────────────────────────┼─────────────────────────────┐
                                       ▼                  ▼               ▼              ▼              ▼
                                 git clone (tmp)   Gitleaks + Semgrep   OSV.dev     live-site probe   Claude API
                                 deleted after     + TS analyzers       (deps)      (SSRF-guarded)    (explanations,
                                                                                                       fix prompts)
```

## File structure

```
shipcheck/
├── docs/ARCHITECTURE.md            ← this file
├── supabase/migrations/            ← SQL schema (works on Supabase or any Postgres 14+)
│   └── 0001_init.sql
├── samples/
│   ├── insecure-app/               ← deliberately vulnerable "vibe-coded" app (fixture)
│   └── secure-app/                 ← a small clean app (false-positive guard)
├── scripts/
│   ├── migrate.ts                  ← applies supabase/migrations/*.sql
│   ├── make-sample-repo.ts         ← materialises samples/* into real git repos (with fake keys)
│   └── scan-local.ts               ← CLI: run the scanner on a folder and print the report
├── src/
│   ├── app/                        ← Next.js routes
│   │   ├── page.tsx                ← landing page (repo URL + site URL + Scan)
│   │   ├── dashboard/page.tsx      ← your scans
│   │   ├── scans/[id]/page.tsx     ← live progress → full report (owner view)
│   │   ├── r/[token]/page.tsx      ← public, shareable summary report
│   │   ├── pricing/page.tsx
│   │   └── api/
│   │       ├── auth/github/…       ← GitHub OAuth (login, callback, logout)
│   │       ├── scans/…             ← create scan, poll status, toggle sharing
│   │       ├── checkout/route.ts   ← Stripe Checkout session
│   │       ├── stripe/webhook/     ← Stripe fulfilment
│   │       ├── github/webhook/     ← GitHub App: PR checks
│   │       └── badge/[token]/      ← embeddable SVG badge
│   ├── components/                 ← UI pieces (FindingCard, ScoreRing, ProgressSteps, …)
│   ├── lib/                        ← server helpers: db, session, crypto, github, stripe,
│   │                                 plans (entitlements), queue, report shaping
│   ├── scanner/                    ← the scan engine (no Next.js imports; runs in the worker)
│   │   ├── index.ts                ← pipeline orchestrator + progress steps
│   │   ├── sandbox.ts              ← safe clone into tmp dir, always deleted
│   │   ├── files.ts                ← repo walker (skips symlinks, binaries, node_modules)
│   │   ├── rules.ts                ← rule catalog: plain-English title / why / fix-prompt
│   │   ├── checks/                 ← secrets, database, auth, input, dependencies,
│   │   │                             live-site, production
│   │   ├── semgrep/rules/*.yml     ← custom Semgrep rules for vibe-coded patterns
│   │   ├── llm.ts                  ← Claude review of the riskiest files
│   │   ├── score.ts                ← 0–100 score + "Production Ready" gate
│   │   └── net.ts                  ← SSRF-guarded fetch for live-site checks
│   └── worker/index.ts             ← queue consumer
└── tests/                          ← vitest: one test per check against the sample repo
```

## Data model

All tables have Row Level Security **enabled with no policies**: the app only
talks to Postgres from the server (via `DATABASE_URL`), so Supabase's public
`anon` key can read nothing. (ShipCheck would flag itself otherwise.)

| Table | Purpose | Key columns |
|---|---|---|
| `users` | GitHub-authenticated users | `github_id` (unique), `github_login`, `avatar_url`, `email`, `github_token_enc` (AES-256-GCM), `github_scopes`, `stripe_customer_id` |
| `subscriptions` | $49/mo Pro plan state (mirrors Stripe) | `user_id`, `stripe_subscription_id` (unique), `status`, `current_period_end` |
| `repo_unlocks` | $29 one-time unlock for a single repo | `user_id`, `repo_full_name`, `stripe_checkout_session_id` (unique) — unique per (user, repo) |
| `github_installations` | GitHub App installs (PR checks, read-only clone tokens) | `installation_id`, `account_login`, `user_id` |
| `scans` | One audit run | `user_id`, `repo_full_name`, `repo_ref`, `commit_sha`, `site_url`, `status` (`queued`/`running`/`completed`/`failed`), `steps` (jsonb live progress), `score`, `production_ready`, `counts` (jsonb per severity), `trigger` (`manual`/`pr`), `pr_number`, `check_run_id`, `share_token`, `is_public`, `meta` (tools used, files reviewed) |
| `findings` | One problem found | `scan_id`, `category`, `rule_id`, `severity`, `title`, `explanation`, `why_it_matters`, `fix_prompt`, `file_path`, `line`, `source` (`gitleaks`/`semgrep`/`analyzer`/`osv`/`live`/`llm`), `evidence` (always redacted), `fingerprint` |
| `jobs` | Postgres-backed queue | `scan_id`, `status`, `attempts`, `run_after`, `locked_at`, `last_error` |

**What we never store:** source code, file contents, or full secrets. Findings
keep a file path, a line number and, for secrets, a masked hint such as
`sk_l•••9f`.

## Entitlements (`src/lib/plans.ts`)

| | Free | Repo pass ($29 once) | Pro ($49/mo) |
|---|---|---|---|
| Scans | 1 per calendar month | that repo: first scan + 5 rescans | unlimited |
| Report | severity + titles only | full report + fix prompts for that repo | full report + fix prompts |
| PR checks | – | – | GitHub check on every PR |
| Badge | – | – | embeddable badge (passing reports) |

Locked fields are removed **on the server** before rendering. They are never
just blurred in the browser.

**Public share links** show the score, the badge state and finding titles.
They never show file paths or fix instructions, so a shared report is not a
roadmap for attackers.

## Safety rules for the scanner

* User code is **never executed**: no `npm install`, no build, no hooks.
  Clones run with `core.hooksPath=/dev/null`, `core.symlinks=false`,
  `protocol.file.allow=never`, and LFS smudge disabled.
* Repo URLs are parsed into `owner/repo` and rebuilt by us, so no user-supplied
  git URLs or flags reach the git command line.
* Tokens are passed via an `http.extraHeader` config, never embedded in the URL.
* The sandbox directory is removed in a `finally` block, including on failure.
* Repo-supplied scanner configs (`.gitleaks.toml`, `.gitleaksignore`,
  `.semgrepignore`) are deleted before scanning, so a repo cannot hide its own
  secrets.
* Live-site probes go through `safeFetch`. It allows only http(s) and blocks
  private, loopback, link-local and metadata IPs on every redirect hop. It
  also enforces timeouts and response size caps.
