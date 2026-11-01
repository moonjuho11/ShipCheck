import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckoutButton } from "@/components/CheckoutButton";
import { FindingCard, LockIcon } from "@/components/FindingCard";
import { CountTiles, ReadyBadge, ScoreRing, SEV_STYLE } from "@/components/ReportBits";
import { RescanButton } from "@/components/RescanButton";
import { ScanProgress } from "@/components/ScanProgress";
import { ShareControls } from "@/components/ShareControls";
import { env } from "@/lib/env";
import { getEntitlements, reportAccess } from "@/lib/plans";
import { CATEGORY_LABELS, SEVERITY_LABELS, shapeReport } from "@/lib/report";
import { getFindings, getScan } from "@/lib/scans";
import { getSessionUserId } from "@/lib/session";
import type { Severity } from "@/scanner/types";

export const metadata: Metadata = { title: "Safety report", robots: { index: false } };

function verdict(counts: Record<Severity, number>, ready: boolean): string {
  if (ready) return counts.medium + counts.low === 0
    ? "We didn't find any problems. Nice work — your app looks ready for real users."
    : "No serious problems found. There are a few smaller things worth tidying up when you have time.";
  if (counts.critical) return `We found ${counts.critical} critical problem${counts.critical > 1 ? "s" : ""}. Start there — each one could let a stranger take over accounts, read your data or run up your bills.`;
  return `We found ${counts.high} serious problem${counts.high > 1 ? "s" : ""} to fix before launch. None are disasters on their own, but each is easy to abuse.`;
}

export default async function ScanPage({ params, searchParams }: PageProps<"/scans/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const userId = await getSessionUserId();
  if (!userId) redirect(`/api/auth/github?next=/scans/${id}`);
  const scan = await getScan(id);
  if (!scan || scan.user_id !== userId) notFound();

  const header = (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-slate-500">Safety report</p>
        <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{scan.repo_full_name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {scan.created_at.toLocaleString()}
          {scan.commit_sha ? <> · version <span className="font-mono">{scan.commit_sha.slice(0, 7)}</span></> : null}
          {scan.pr_number ? ` · pull request #${scan.pr_number}` : ""}
          {scan.site_url ? <> · {new URL(scan.site_url).host}</> : null}
        </p>
      </div>
      {(scan.status === "completed" || scan.status === "failed") && scan.trigger === "manual" && <RescanButton repoUrl={scan.repo_url} siteUrl={scan.site_url} />}
    </div>
  );

  if (scan.status === "queued" || scan.status === "running") {
    return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{header}<ScanProgress scanId={scan.id} initialSteps={scan.steps} repo={scan.repo_full_name} /></div>;
  }

  if (scan.status === "failed") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {header}
        <div className="card mx-auto max-w-2xl p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900">We couldn’t finish this scan</h2>
          <p className="mt-2 text-slate-600">{scan.error || "Something went wrong."}</p>
          <p className="mt-4 text-sm text-slate-500">Failed scans don’t count toward your plan.</p>
        </div>
      </div>
    );
  }

  const ent = await getEntitlements(userId);
  const access = reportAccess(ent, scan.repo_full_name);
  const report = shapeReport(await getFindings(scan.id), access);
  const counts = { critical: 0, high: 0, medium: 0, low: 0, ...scan.counts } as Record<Severity, number>;
  const ready = !!scan.production_ready;
  const notes = scan.meta.notes || [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {header}
      {sp.paid === "1" && access === "full" && (
        <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">Thanks! Your full report is unlocked below.</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <section className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
            <ScoreRing score={scan.score ?? 0} />
            <div className="flex-1 space-y-4">
              <ReadyBadge ready={ready} />
              <p className="text-[15px] leading-relaxed text-slate-700">{verdict(counts, ready)}</p>
              <CountTiles counts={counts} />
            </div>
          </section>

          {access === "titles" && report.findings.length > 0 && (
            <section className="card border-brand-200 bg-gradient-to-br from-white to-brand-50 p-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-brand-600 p-1.5 text-white"><LockIcon className="h-4 w-4" /></span>
                <div className="flex-1">
                  <h2 className="font-semibold text-slate-900">Unlock the fixes</h2>
                  <p className="mt-1 text-sm text-slate-600">See where each problem is, why it matters, and get a copy-paste prompt your AI agent can use to fix it.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <CheckoutButton plan="repo" scanId={scan.id}>Unlock this repo — $29 once</CheckoutButton>
                    <CheckoutButton plan="pro" scanId={scan.id} className="btn-primary">Go Pro — $49/month</CheckoutButton>
                  </div>
                </div>
              </div>
            </section>
          )}

          {report.findings.length === 0 ? (
            <section className="card p-10 text-center">
              <div className="text-4xl">🎉</div>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">Nothing to fix</h2>
              <p className="mt-1 text-slate-600">We didn’t find any of the problems we check for.</p>
            </section>
          ) : (
            (["critical", "high", "medium", "low"] as Severity[]).map((sev) =>
              report.bySeverity[sev].length ? (
                <section key={sev} aria-labelledby={`sev-${sev}`}>
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2 id={`sev-${sev}`} className={`text-lg font-bold ${SEV_STYLE[sev].text}`}>{SEVERITY_LABELS[sev].label} <span className="text-slate-400">· {report.bySeverity[sev].length}</span></h2>
                    <p className="text-sm text-slate-500">{SEVERITY_LABELS[sev].blurb}</p>
                  </div>
                  <div className="space-y-3">
                    {report.bySeverity[sev].map((f, i) => (
                      <FindingCard key={f.id} f={f} categoryLabel={CATEGORY_LABELS[f.category]?.label ?? f.category} defaultOpen={access === "full" && sev === "critical" && i === 0} />
                    ))}
                  </div>
                </section>
              ) : null,
            )
          )}
        </div>

        <aside className="space-y-6">
          <ShareControls scanId={scan.id} shareToken={scan.share_token} initialPublic={scan.is_public} appUrl={env.appUrl} canBadge={ent.pro} productionReady={ready} />
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900">Checked areas</h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              {Object.entries(CATEGORY_LABELS).map(([key, c]) => {
                const n = report.findings.filter((f) => f.category === key).length;
                const skipped = key === "live_site" && !scan.site_url;
                return (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <span className="text-slate-700">{c.label}</span>
                    {skipped ? <span className="text-xs text-slate-400">not checked</span> : n ? <span className="text-xs font-semibold text-red-600">{n} to fix</span> : <span className="text-xs font-semibold text-brand-700">✓ passed</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          <details className="card p-5 text-sm text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-900">About this scan</summary>
            <ul className="mt-3 space-y-1.5">
              <li>{scan.meta.filesScanned ?? 0} files read, then deleted.</li>
              <li>{scan.meta.aiReviewedFiles?.length ? `AI double-checked ${scan.meta.aiReviewedFiles.length} of the riskiest files.` : "AI review was not used for this scan."}</li>
              {notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </details>
        </aside>
      </div>
    </div>
  );
}
