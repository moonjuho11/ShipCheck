import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckoutButton } from "@/components/CheckoutButton";
import { FindingCard } from "@/components/FindingCard";
import { CountTiles, ReadyBadge, ScoreRing } from "@/components/ReportBits";
import { RescanButton } from "@/components/RescanButton";
import { ScanProgress } from "@/components/ScanProgress";
import { ShareControls } from "@/components/ShareControls";
import { CheckIcon, LockIcon, SEV, SeverityIcon } from "@/components/ui";
import { env } from "@/lib/env";
import { getEntitlements, reportAccess } from "@/lib/plans";
import { CATEGORY_LABELS, SEVERITY_LABELS, shapeReport } from "@/lib/report";
import { getFindings, getScan } from "@/lib/scans";
import { getSessionUserId } from "@/lib/session";
import type { Severity } from "@/scanner/types";

export const metadata: Metadata = { title: "Safety report", robots: { index: false } };

function verdict(counts: Record<Severity, number>, ready: boolean): string {
  if (ready) return counts.medium + counts.low === 0
    ? "We didn’t find any problems. Nice work — your app looks ready for real users."
    : "No serious problems found. A few smaller things are worth tidying up when you have time.";
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="label-mono flex items-center gap-2"><Link href="/dashboard" className="hover:text-ink">Scans</Link><span className="text-ink-4">/</span><span className="truncate normal-case tracking-normal text-ink-3">{scan.repo_full_name}</span></p>
        <h1 className="headline mt-3 truncate text-[28px] sm:text-[34px]">{scan.repo_full_name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] text-ink-4">
          <span>{scan.created_at.toLocaleString()}</span>
          {scan.commit_sha ? <span>commit {scan.commit_sha.slice(0, 7)}</span> : null}
          {scan.pr_number ? <span>pull request #{scan.pr_number}</span> : null}
          {scan.site_url ? <span>{new URL(scan.site_url).host}</span> : null}
        </p>
      </div>
      {(scan.status === "completed" || scan.status === "failed") && scan.trigger === "manual" && <RescanButton repoUrl={scan.repo_url} siteUrl={scan.site_url} />}
    </div>
  );

  if (scan.status === "queued" || scan.status === "running") {
    return <div className="mx-auto max-w-6xl px-5 py-12">{header}<ScanProgress scanId={scan.id} initialSteps={scan.steps} repo={scan.repo_full_name} startedAt={(scan.started_at ?? scan.created_at).toISOString()} /></div>;
  }

  if (scan.status === "failed") {
    return (
      <div className="mx-auto max-w-6xl px-5 py-12">
        {header}
        <div className="window mx-auto max-w-xl p-8 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-high/10 font-mono text-high ring-1 ring-high/30">!</span>
          <h2 className="mt-4 text-lg font-medium text-ink">We couldn’t finish this scan</h2>
          <p className="mt-2 text-ink-3">{scan.error || "Something went wrong."}</p>
          <p className="label-mono mt-6 !text-[10px]">Failed scans don’t count toward your plan</p>
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
    <div className="mx-auto max-w-6xl px-5 py-12">
      {header}
      {sp.paid === "1" && access === "full" && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-signal/30 bg-signal/10 px-4 py-3 text-sm text-signal"><CheckIcon /> Thanks! Your full report is unlocked below.</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <section className="window grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-7">
            <div className="mx-auto"><ScoreRing score={scan.score ?? 0} /></div>
            <div className="space-y-4">
              <ReadyBadge ready={ready} />
              <p className="text-[15px] leading-relaxed text-ink-2">{verdict(counts, ready)}</p>
              <CountTiles counts={counts} />
            </div>
          </section>

          {access === "titles" && report.findings.length > 0 && (
            <section className="relative overflow-hidden rounded-2xl border border-line-2 bg-panel p-6">
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-signal/15 text-signal ring-1 ring-signal/30"><LockIcon className="h-4 w-4" /></span>
                <div className="flex-1">
                  <h2 className="text-[16px] font-medium text-ink">Unlock the fixes</h2>
                  <p className="mt-1 text-sm leading-relaxed text-ink-3">See where each problem lives, why it matters, and get a copy-paste prompt your AI agent can use to fix it.</p>
                </div>
              </div>
              <div className="relative mt-5 grid gap-2.5 sm:grid-cols-2">
                <CheckoutButton plan="repo" scanId={scan.id}>Unlock this repo · $29 once</CheckoutButton>
                <CheckoutButton plan="pro" scanId={scan.id} className="btn-white">Go Pro · $49/month</CheckoutButton>
              </div>
            </section>
          )}

          {report.findings.length === 0 ? (
            <section className="window relative overflow-hidden p-12 text-center">
              <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-signal/15 text-signal ring-1 ring-signal/30"><CheckIcon className="h-5 w-5" /></span>
              <h2 className="relative mt-4 text-xl font-medium text-ink">Nothing to fix</h2>
              <p className="relative mt-1 text-ink-3">We didn’t find any of the problems we check for.</p>
            </section>
          ) : (
            <section className="window">
              {(["critical", "high", "medium", "low"] as Severity[]).map((sev) =>
                report.bySeverity[sev].length ? (
                  <div key={sev} aria-labelledby={`sev-${sev}`}>
                    <div className="flex items-center gap-2.5 border-b border-line bg-panel-2 px-4 py-2.5 sm:px-5">
                      <SeverityIcon severity={sev} className="h-3.5 w-3.5" />
                      <h2 id={`sev-${sev}`} className="text-[13px] font-medium text-ink">{SEVERITY_LABELS[sev].label}</h2>
                      <span className="font-mono text-[11px] text-ink-4">{report.bySeverity[sev].length}</span>
                      <span className="ml-2 hidden truncate text-[12px] text-ink-4 md:inline">{SEVERITY_LABELS[sev].blurb}</span>
                    </div>
                    {report.bySeverity[sev].map((f, i) => (
                      <FindingCard key={f.id} f={f} categoryLabel={CATEGORY_LABELS[f.category]?.label ?? f.category} defaultOpen={access === "full" && sev === "critical" && i === 0} />
                    ))}
                  </div>
                ) : null,
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[88px] lg:self-start">
          <ShareControls scanId={scan.id} shareToken={scan.share_token} initialPublic={scan.is_public} appUrl={env.appUrl} canBadge={ent.pro} productionReady={ready} />
          <div className="card p-4">
            <h3 className="label-mono !text-[10px]">Checked areas</h3>
            <ul className="mt-3 space-y-2 text-[13px]">
              {Object.entries(CATEGORY_LABELS).map(([key, c]) => {
                const items = report.findings.filter((f) => f.category === key);
                const worst = (["critical", "high", "medium", "low"] as Severity[]).find((s) => items.some((f) => f.severity === s));
                const skipped = key === "live_site" && !scan.site_url;
                return (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <span className="text-ink-2">{c.label}</span>
                    {skipped ? <span className="text-[12px] text-ink-4">not checked</span>
                      : worst ? <span className={`font-mono text-[11.5px] ${SEV[worst].text}`}>{items.length} to fix</span>
                      : <span className="flex items-center gap-1 text-[12px] text-signal"><CheckIcon className="h-3 w-3" /> passed</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          <details className="card group p-4 text-[13px] text-ink-3">
            <summary className="label-mono flex cursor-pointer list-none items-center justify-between !text-[10px]">About this scan <span className="transition group-open:rotate-45">+</span></summary>
            <ul className="mt-3 space-y-1.5 leading-relaxed">
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
