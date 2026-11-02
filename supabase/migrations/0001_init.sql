-- Seaproof schema. Works on Supabase or any Postgres 14+.
-- Every table has RLS enabled and NO policies: the app talks to Postgres only
-- from the server, so the public anon key can read nothing.

create extension if not exists pgcrypto;

create table if not exists users (
  id                 uuid primary key default gen_random_uuid(),
  github_id          bigint not null unique,
  github_login       text not null,
  name               text,
  avatar_url         text,
  email              text,
  github_token_enc   text,            -- AES-256-GCM, see src/lib/crypto.ts
  github_scopes      text not null default '',
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id) on delete cascade,
  stripe_subscription_id text not null unique,
  status                 text not null,       -- mirrors Stripe: active, trialing, past_due, canceled, …
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions(user_id);

create table if not exists repo_unlocks (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references users(id) on delete cascade,
  repo_full_name             text not null,   -- lower-cased "owner/repo"
  stripe_checkout_session_id text unique,
  amount_cents               integer,
  created_at                 timestamptz not null default now(),
  unique (user_id, repo_full_name)
);

create table if not exists github_installations (
  installation_id bigint primary key,
  account_login   text not null,
  account_id      bigint,
  user_id         uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists github_installations_login_idx on github_installations(lower(account_login));

create table if not exists scans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  repo_full_name   text not null,             -- lower-cased "owner/repo"
  repo_url         text not null,
  repo_ref         text,                      -- branch / sha / refs/pull/N/head; null = default branch
  commit_sha       text,
  site_url         text,
  status           text not null default 'queued'
                   check (status in ('queued','running','completed','failed')),
  steps            jsonb not null default '[]'::jsonb,
  score            integer check (score between 0 and 100),
  production_ready boolean,
  counts           jsonb not null default '{}'::jsonb,
  trigger          text not null default 'manual' check (trigger in ('manual','pr')),
  pr_number        integer,
  check_run_id     bigint,
  installation_id  bigint,
  share_token      text not null unique default encode(gen_random_bytes(12), 'hex'),
  is_public        boolean not null default false,
  error            text,
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz
);
create index if not exists scans_user_created_idx on scans(user_id, created_at desc);
create index if not exists scans_repo_idx on scans(repo_full_name, created_at desc);

create table if not exists findings (
  id             uuid primary key default gen_random_uuid(),
  scan_id        uuid not null references scans(id) on delete cascade,
  category       text not null check (category in
                   ('secrets','database','auth','input','dependencies','live_site','production')),
  rule_id        text not null,
  severity       text not null check (severity in ('critical','high','medium','low')),
  title          text not null,
  explanation    text not null,
  why_it_matters text not null,
  fix_prompt     text not null,
  file_path      text,
  line           integer,
  source         text not null check (source in ('gitleaks','semgrep','analyzer','osv','live','llm')),
  evidence       text,                         -- always redacted; never source code
  fingerprint    text not null,
  created_at     timestamptz not null default now()
);
create index if not exists findings_scan_idx on findings(scan_id);

create table if not exists jobs (
  id          bigserial primary key,
  scan_id     uuid not null references scans(id) on delete cascade,
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts    integer not null default 0,
  run_after   timestamptz not null default now(),
  locked_at   timestamptz,
  locked_by   text,
  last_error  text,
  created_at  timestamptz not null default now()
);
create index if not exists jobs_ready_idx on jobs(status, run_after) where status = 'queued';

alter table users                enable row level security;
alter table subscriptions        enable row level security;
alter table repo_unlocks         enable row level security;
alter table github_installations enable row level security;
alter table scans                enable row level security;
alter table findings             enable row level security;
alter table jobs                 enable row level security;

create table if not exists schema_migrations (
  name       text primary key,
  applied_at timestamptz not null default now()
);
alter table schema_migrations enable row level security;
