import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CountTiles, ReadyBadge, ScoreRing } from "@/components/ReportBits";
import { publicSummary } from "@/lib/report";
import { getFindings, getScanByShareToken } from "@/lib/scans";

export async function generateMetadata({ params }: PageProps<"/r/[token]">): Promise<Metadata> {
  const scan = await getScanByShareToken((await params).token);
  return scan
    ? { title: `${scan.repo_full_name}: ${scan.production_ready ? "Production Ready" : `score ${scan.score}/100`}`, robots: { index: false } }
    : { title: "Report not found" };
}

// Public share page: score + per-area status only. No titles, file names or fix steps,
// so a shared report can't be used as a map of what to attack.
export default async function PublicReport({ params }: PageProps<"/r/[token]">) {
  const scan = await getScanByShareToken((await params).token);
  if (!scan) notFound();
  const s = publicSummary(scan, await getFindings(scan.id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-center text-sm text-slate-500">ShipCheck safety report</p>
      <h1 className="mt-1 text-center text-2xl font-bold tracking-tight text-slate-900">{s.repo}</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        Scanned {s.finishedAt?.toLocaleDateString()}{s.commitSha ? <> · version <span className="font-mono">{s.commitSha.slice(0, 7)}</span></> : null}
      </p>
      <div className="card mt-8 flex flex-col items-center gap-5 p-8">
        <ScoreRing score={s.score} size={150} />
        <ReadyBadge ready={s.productionReady} />
        <div className="w-full max-w-md"><CountTiles counts={s.counts} /></div>
      </div>
      <div className="card mt-6 divide-y divide-slate-100">
        {s.areas.map((a) => (
          <div key={a.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <div><p className="font-medium text-slate-900">{a.label}</p><p className="text-xs text-slate-500">{a.blurb}</p></div>
            {a.key === "live_site" && !s.liveChecked ? <span className="text-xs text-slate-400">not checked</span>
              : a.count === 0 ? <span className="text-sm font-semibold text-brand-700">✓ Passed</span>
              : <span className="text-sm font-semibold text-slate-600">{a.count} item{a.count > 1 ? "s" : ""} to review</span>}
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">Details are visible only to the app’s owner. <Link href="/" className="font-medium text-slate-800 underline">Check your own app →</Link></p>
    </div>
  );
}
