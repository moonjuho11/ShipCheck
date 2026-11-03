import type postgres from "postgres";
import { sql } from "./db";

export const PLANS = {
  free: { name: "Free", price: "$0", scansPerMonth: 1 },
  repo: { name: "Repo Pass", price: "$29", cadence: "one-time", scansIncluded: 6 }, // first scan + 5 rescans
  pro: { name: "Pro", price: "$49", cadence: "/month" },
} as const;

export const MAX_ACTIVE_SCANS = 2;

export interface Entitlements {
  pro: boolean;
  proUntil: Date | null;
  unlocked: Map<string, Date>; // repo_full_name → unlocked at
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const db = sql();
  const [subs, unlocks] = await Promise.all([
    db<{ status: string; current_period_end: Date | null }[]>`
      select status, current_period_end from subscriptions
      where user_id = ${userId} and status in ('active','trialing','past_due')
      order by current_period_end desc nulls last limit 1`,
    db<{ repo_full_name: string; created_at: Date }[]>`select repo_full_name, created_at from repo_unlocks where user_id = ${userId}`,
  ]);
  const sub = subs[0];
  return {
    pro: !!sub,
    proUntil: sub?.current_period_end ?? null,
    unlocked: new Map(unlocks.map((u) => [u.repo_full_name, u.created_at])),
  };
}

export type ReportAccess = "full" | "titles";

export function reportAccess(ent: Entitlements, repoFullName: string): ReportAccess {
  return ent.pro || ent.unlocked.has(repoFullName) ? "full" : "titles";
}

export type ScanPermission = { ok: true; via: "pro" | "repo" | "free" } | { ok: false; message: string; upgrade?: "repo" | "pro" };

export async function canStartScan(userId: string, repoFullName: string, ent?: Entitlements, db: postgres.Sql | postgres.TransactionSql = sql()): Promise<ScanPermission> {
  const e = ent ?? (await getEntitlements(userId));
  const [{ active }] = await db<{ active: number }[]>`
    select count(*)::int as active from scans where user_id = ${userId} and status in ('queued','running')`;
  if (active >= MAX_ACTIVE_SCANS) return { ok: false, message: "You already have scans running. Wait for them to finish, or cancel one from your dashboard." };
  if (e.pro) return { ok: true, via: "pro" };

  const unlockedAt = e.unlocked.get(repoFullName);
  if (unlockedAt) {
    const [{ n }] = await db<{ n: number }[]>`
      select count(*)::int as n from scans
      where user_id = ${userId} and repo_full_name = ${repoFullName} and status not in ('failed','canceled') and created_at >= ${unlockedAt}`;
    if (n < PLANS.repo.scansIncluded) return { ok: true, via: "repo" };
  }

  const unlockedRepos = [...e.unlocked.keys()];
  const [{ used }] = await db<{ used: number }[]>`
    select count(*)::int as used from scans
    where user_id = ${userId} and trigger = 'manual' and status not in ('failed','canceled')
      and created_at >= date_trunc('month', now())
      and not (repo_full_name = any(${unlockedRepos}::text[]))`;
  if (used < PLANS.free.scansPerMonth) return { ok: true, via: "free" };

  return unlockedAt
    ? { ok: false, message: "You've used all the rescans in your Repo Pass. Go Pro for unlimited rescans.", upgrade: "pro" }
    : { ok: false, message: "You've used your free scan for this month. Unlock this repo or go Pro to scan again.", upgrade: "pro" };
}
