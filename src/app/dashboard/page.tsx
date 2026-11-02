import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanForm } from "@/components/ScanForm";
import { ArrowRight, SeverityIcon } from "@/components/ui";
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
  const plan = ent.pro ? PLANS.pro.name : ent.unlocked.size ? `${PLANS.free.name} + ${ent.unlocked.size} Repo Pass${ent.unlocked.size > 1 ? "es" : ""}` : PLANS.free.name;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="headline mt-3 text-[30px] sm:text-[36px]">Hi {user.name?.split(" ")[0] || user.github_login}.</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-ink-3">
            <span>Plan: <span className="text-ink-2">{plan}</span></span>
            {ent.pro && ent.proUntil ? <span>· Renews {ent.proUntil.toLocaleDateString()}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ent.pro ? (
            <form action="/api/billing/portal" method="post"><button className="btn-ghost !h-9">Manage billing</button></form>
          ) : (
            <Link href="/pricing" className="btn-ghost !h-9">Upgrade</Link>
          )}
          {!privateAccess && <a className="btn-ghost !h-9" href="/api/auth/github?scope=repo&next=/dashboard">Connect private repos</a>}
          {ent.pro && env.githubAppSlug && <a className="btn-white !h-9" href={`https://github.com/apps/${env.githubAppSlug}/installations/new`}>Turn on PR checks</a>}
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="window min-w-0 self-start">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-[13px] font-medium text-ink">Recent scans</h2>
            <span className="text-[13px] text-ink-4 tabular-nums">{scans.length}</span>
          </div>
          {scans.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="mt-2 text-ink-2">No scans yet</p>
              <p className="mt-1 text-sm text-ink-4">Paste a repo on the right to run your first one.</p>
            </div>
          ) : (
            <ul>
              {scans.map((s) => (
                <li key={s.id} className="border-b border-line last:border-0">
                  <Link href={`/scans/${s.id}`} className="group flex items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.03]">
                    <ScoreChip score={s.score} status={s.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-ink">{s.repo_full_name}</p>
                      <p className="mt-0.5 truncate text-[12px] text-ink-4">
                        {s.created_at.toLocaleString()}{s.trigger === "pr" ? ` · PR #${s.pr_number}` : ""}
                      </p>
                    </div>
                    {s.status === "completed" ? (
                      <div className="hidden items-center gap-4 text-[13px] tabular-nums sm:flex">
                        {(["critical", "high"] as const).map((k) => (
                          <span key={k} className={`flex items-center gap-1.5 ${s.counts[k] ? "text-ink-2" : "text-ink-4"}`}><SeverityIcon severity={k} className="h-3 w-3" />{s.counts[k] ?? 0}</span>
                        ))}
                        <span className="w-16 text-right text-ink-3">{s.production_ready ? "Ready" : "Not ready"}</span>
                      </div>
                    ) : (
                      <span className="text-[13px] text-ink-3">{s.status === "failed" ? "Failed" : "Scanning…"}</span>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-ink-4 transition group-hover:translate-x-0.5 group-hover:text-ink-2" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="space-y-3">
          <p className="eyebrow">New scan</p>
          <ScanForm signedIn hasPrivateAccess={privateAccess} compact />
        </aside>
      </div>
    </div>
  );
}

function ScoreChip({ score, status }: { score: number | null; status: string }) {
  return <span className="w-9 shrink-0 text-right text-[17px] font-semibold text-ink tabular-nums">{status === "completed" ? score : "–"}</span>;
}
