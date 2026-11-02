import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/motion";
import { AreaStatus, CountTiles, ReadyBadge, ScoreFigure } from "@/components/ReportBits";
import { ArrowRight } from "@/components/ui";
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
    <div className="relative overflow-hidden">
      <div className="relative mx-auto max-w-2xl px-5 py-16">
        <h1 className="headline text-center text-[30px] sm:text-[40px]">{s.repo}</h1>
        <p className="mt-2 text-center text-[13px] text-ink-4">
          {s.finishedAt?.toLocaleDateString()}
        </p>
        <Reveal onMount delay={0.1} y={12} className="window mt-10">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <ScoreFigure score={s.score} />
              <ReadyBadge ready={s.productionReady} />
            </div>
            <div className="mt-6"><CountTiles counts={s.counts} /></div>
          </div>
          <ul className="border-t border-line">
            {s.areas.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5 last:border-0">
                <p className="text-[14px] text-ink">{a.label}</p>
                <AreaStatus count={a.count} checked={!(a.key === "live_site" && !s.liveChecked)} />
              </li>
            ))}
          </ul>
        </Reveal>
        <p className="mt-8 text-center text-sm">
          <Link href="/" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">Check your own app <ArrowRight className="h-3 w-3" /></Link>
        </p>
      </div>
    </div>
  );
}
