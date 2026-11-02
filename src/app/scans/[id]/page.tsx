import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckoutButton } from "@/components/CheckoutButton";
import { Reveal } from "@/components/motion";
import { FindingCard } from "@/components/FindingCard";
import { AreaStatus, CountTiles, ReadyBadge, ScoreFigure } from "@/components/ReportBits";
import { RescanButton } from "@/components/RescanButton";
import { ScanProgress } from "@/components/ScanProgress";
import { ShareControls } from "@/components/ShareControls";
import { SeverityIcon } from "@/components/ui";
import { env } from "@/lib/env";
import { getEntitlements, reportAccess } from "@/lib/plans";
import { CATEGORY_LABELS, SEVERITY_LABELS, shapeReport } from "@/lib/report";
import { getFindings, getScan } from "@/lib/scans";
import { getSessionUserId } from "@/lib/session";
import type { Severity } from "@/scanner/types";

export const metadata: Metadata = { title: "Safety report", robots: { index: false } };

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
        <h1 className="headline truncate text-[28px] sm:text-[34px]">{scan.repo_full_name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-4">
          <span>{scan.created_at.toLocaleString()}</span>
          {scan.pr_number ? <span>Pull request #{scan.pr_number}</span> : null}
        </p>
      </div>
      {(scan.status === "completed" || scan.status === "failed") && scan.trigger === "manual" && <RescanButton repoUrl={scan.repo_url} siteUrl={scan.site_url} />}
    </div>
  );

  if (scan.status === "queued" || scan.status === "running") {
    return <div className="mx-auto max-w-6xl px-5 py-12">{header}<ScanProgress scanId={scan.id} initialSteps={scan.steps} startedAt={(scan.started_at ?? scan.created_at).toISOString()} /></div>;
  }

  if (scan.status === "failed") {
    return (
      <div className="mx-auto max-w-6xl px-5 py-12">
        {header}
        <div className="window mx-auto max-w-xl p-8 text-center">
          <h2 className="text-lg font-semibold text-ink">We couldn’t finish this scan</h2>
          <p className="mt-2 text-ink-3">{scan.error || "Something went wrong."}</p>
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
        <div className="mb-6 rounded-lg border border-line-2 bg-panel px-4 py-3 text-sm text-ink-2">Payment received. Your full report is unlocked below.</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Reveal onMount y={10}><section className="window p-6 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <ScoreFigure score={scan.score ?? 0} />
              <ReadyBadge ready={ready} />
            </div>
            <div className="mt-6"><CountTiles counts={counts} /></div>
          </section></Reveal>

          {access === "titles" && report.findings.length > 0 && (
            <Reveal onMount delay={0.08} y={10}><section className="rounded-xl border border-line-2 bg-panel p-6">
              <h2 className="text-[16px] font-semibold text-ink">Unlock the fixes</h2>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                <CheckoutButton plan="repo" scanId={scan.id}>Unlock this repo · $29 once</CheckoutButton>
                <CheckoutButton plan="pro" scanId={scan.id} className="btn-white">Go Pro · $49/month</CheckoutButton>
              </div>
            </section></Reveal>
          )}

          {report.findings.length === 0 ? (
            <section className="window p-12 text-center">
              <h2 className="text-xl font-semibold text-ink">Nothing to fix</h2>
            </section>
          ) : (
            <Reveal onMount delay={0.14} y={10}><section className="window">
              {(["critical", "high", "medium", "low"] as Severity[]).map((sev) =>
                report.bySeverity[sev].length ? (
                  <div key={sev} aria-labelledby={`sev-${sev}`}>
                    <div className="flex items-center gap-2.5 border-b border-line bg-panel-2 px-4 py-2.5 sm:px-5">
                      <SeverityIcon severity={sev} className="h-3.5 w-3.5" />
                      <h2 id={`sev-${sev}`} className="text-[13px] font-medium text-ink">{SEVERITY_LABELS[sev].label}</h2>
                      <span className="text-[13px] text-ink-4 tabular-nums">{report.bySeverity[sev].length}</span>
                    </div>
                    {report.bySeverity[sev].map((f, i) => (
                      <FindingCard key={f.id} f={f} categoryLabel={CATEGORY_LABELS[f.category]?.label ?? f.category} defaultOpen={access === "full" && sev === "critical" && i === 0} />
                    ))}
                  </div>
                ) : null,
              )}
            </section></Reveal>
          )}
        </div>

        <Reveal onMount delay={0.1} y={10} className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <ShareControls scanId={scan.id} shareToken={scan.share_token} initialPublic={scan.is_public} appUrl={env.appUrl} canBadge={ent.pro} productionReady={ready} />
          <div className="card p-4">
            <h3 className="text-[14px] font-medium text-ink">Checked areas</h3>
            <ul className="mt-3 space-y-2 text-[13px]">
              {Object.entries(CATEGORY_LABELS).map(([key, c]) => {
                const items = report.findings.filter((f) => f.category === key);
                const skipped = key === "live_site" && !scan.site_url;
                return (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <span className="text-ink-2">{c.label}</span>
                    <AreaStatus count={items.length} checked={!skipped} />
                  </li>
                );
              })}
            </ul>
          </div>
          {notes.length > 0 && (
            <ul className="card space-y-1.5 p-4 text-[13px] leading-relaxed text-ink-3">
              {notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
        </Reveal>
      </div>
    </div>
  );
}
