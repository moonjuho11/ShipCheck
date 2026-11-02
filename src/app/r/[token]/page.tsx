import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CountTiles, ReadyBadge, ScoreRing } from "@/components/ReportBits";
import { ArrowRight, CheckIcon, SEV } from "@/components/ui";
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
      <div aria-hidden className="bg-grid fade-edges absolute inset-0" />
      <div aria-hidden className="absolute inset-x-0 top-24 mx-auto h-72 max-w-lg rounded-full blur-3xl" style={{ background: s.productionReady ? "rgb(62 232 143 / 0.14)" : "rgb(255 92 92 / 0.10)" }} />
      <div className="relative mx-auto max-w-2xl px-5 py-16">
        <p className="label-mono text-center">ShipCheck safety report</p>
        <h1 className="headline mt-4 text-center text-[30px] sm:text-[40px]">{s.repo}</h1>
        <p className="mt-2 text-center font-mono text-[11.5px] text-ink-4">
          scanned {s.finishedAt?.toLocaleDateString()}{s.commitSha ? ` · commit ${s.commitSha.slice(0, 7)}` : ""}
        </p>
        <div className="window mt-10">
          <div className="flex flex-col items-center gap-5 p-8">
            <ScoreRing score={s.score} size={168} />
            <ReadyBadge ready={s.productionReady} />
            <div className="w-full"><CountTiles counts={s.counts} /></div>
          </div>
          <ul className="border-t border-line">
            {s.areas.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5 last:border-0">
                <div><p className="text-[14px] text-ink">{a.label}</p><p className="text-[12px] text-ink-4">{a.blurb}</p></div>
                {a.key === "live_site" && !s.liveChecked ? <span className="text-[12px] text-ink-4">not checked</span>
                  : a.count === 0 ? <span className="flex items-center gap-1.5 text-[13px] text-signal"><CheckIcon /> Passed</span>
                  : <span className={`font-mono text-[12px] ${a.worst ? SEV[a.worst].text : "text-ink-3"}`}>{a.count} to review</span>}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 text-center text-sm text-ink-4">
          Details are visible only to the app’s owner. <Link href="/" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">Check your own app <ArrowRight className="h-3 w-3" /></Link>
        </p>
      </div>
    </div>
  );
}
