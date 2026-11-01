import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanForm } from "@/components/ScanForm";
import { env } from "@/lib/env";
import { getEntitlements, PLANS } from "@/lib/plans";
import { listScans } from "@/lib/scans";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "My scans" };

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/github?next=/dashboard");
  const [scans, ent] = await Promise.all([listScans(user.id), getEntitlements(user.id)]);
  const privateAccess = /\brepo\b/.test(user.github_scopes);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hi {user.name?.split(" ")[0] || user.github_login} 👋</h1>
          <p className="mt-1 text-slate-600">
            Plan: <strong>{ent.pro ? PLANS.pro.name : ent.unlocked.size ? `${PLANS.free.name} + ${ent.unlocked.size} Repo Pass${ent.unlocked.size > 1 ? "es" : ""}` : PLANS.free.name}</strong>
            {ent.pro && ent.proUntil ? <span className="text-slate-500"> · renews {ent.proUntil.toLocaleDateString()}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ent.pro ? (
            <form action="/api/billing/portal" method="post"><button className="btn-ghost">Manage billing</button></form>
          ) : (
            <Link href="/pricing" className="btn-ghost">Upgrade</Link>
          )}
          {!privateAccess && <a className="btn-ghost" href="/api/auth/github?scope=repo&next=/dashboard">Connect private repos</a>}
          {ent.pro && env.githubAppSlug && <a className="btn-primary" href={`https://github.com/apps/${env.githubAppSlug}/installations/new`}>Turn on PR checks</a>}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent scans</h2>
          {scans.length === 0 ? (
            <div className="card mt-3 p-8 text-center text-slate-600">No scans yet. Start your first one →</div>
          ) : (
            <ul className="card mt-3 divide-y divide-slate-100">
              {scans.map((s) => (
                <li key={s.id}>
                  <Link href={`/scans/${s.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 sm:px-5">
                    <ScoreChip score={s.score} status={s.status} ready={s.production_ready} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{s.repo_full_name}</p>
                      <p className="text-xs text-slate-500">
                        {s.created_at.toLocaleString()} {s.trigger === "pr" ? `· Pull request #${s.pr_number}` : ""}
                        {s.status === "completed" ? ` · ${s.counts.critical ?? 0} critical, ${s.counts.high ?? 0} high` : s.status === "failed" ? " · couldn't finish" : " · in progress"}
                      </p>
                    </div>
                    <span className="text-slate-300">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">New scan</h2>
          <div className="mt-3"><ScanForm signedIn hasPrivateAccess={privateAccess} compact /></div>
        </aside>
      </div>
    </div>
  );
}

function ScoreChip({ score, status, ready }: { score: number | null; status: string; ready: boolean | null }) {
  if (status !== "completed") return <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-500">{status === "failed" ? "—" : "…"}</span>;
  const c = ready ? "bg-brand-50 text-brand-700" : (score ?? 0) >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-base font-bold tabular-nums ${c}`}>{score}</span>;
}
