"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Step } from "@/scanner/types";
import { Spinner } from "./ScanForm";
import { CheckIcon } from "./ui";

export function ScanProgress({ scanId, initialSteps, repo, startedAt }: { scanId: string; initialSteps: Step[]; repo: string; startedAt: string }) {
  const router = useRouter();
  const [steps, setSteps] = useState(initialSteps);
  const [status, setStatus] = useState("queued");
  const [now, setNow] = useState<number | null>(null); // set after mount to avoid a hydration mismatch

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
        if (res.ok) {
          const d = await res.json();
          if (!alive) return;
          setSteps(d.steps);
          setStatus(d.status);
          if (d.status === "completed" || d.status === "failed") { router.refresh(); return; }
        }
      } catch { /* keep polling */ }
      if (alive) timer = setTimeout(tick, 1200);
    };
    tick();
    const clock = setInterval(() => setNow(Date.now()), 100);
    return () => { alive = false; clearTimeout(timer); clearInterval(clock); };
  }, [scanId, router]);

  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const pct = Math.round((done / Math.max(1, steps.length)) * 100);
  const elapsed = now === null ? 0 : Math.max(0, (now - new Date(startedAt).getTime()) / 1000);

  return (
    <div className="relative mx-auto max-w-2xl">
      <div aria-hidden className="absolute -inset-10 rounded-[48px] bg-signal/[0.07] blur-3xl" />
      <div className="window relative">
        <div className="h-px w-full bg-line">
          <div className="h-px bg-signal shadow-[0_0_12px_rgb(62_232_143)] transition-all duration-700" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Spinner className="h-4 w-4 text-signal" />
            <span className="text-[14px] font-medium text-ink">{status === "queued" ? "Waiting for a free scanner…" : "Checking your app"}</span>
          </div>
          <span className="font-mono text-[12px] text-ink-3 tabular-nums">{elapsed.toFixed(1)}s</span>
        </div>
        <ol className="px-2 py-2">
          {steps.map((s, i) => (
            <li key={s.key} className={`flex items-start gap-3 rounded-lg px-3 py-2 ${s.status === "running" ? "bg-white/[0.04]" : ""}`}>
              <span className="mt-0.5 w-5 font-mono text-[11px] text-ink-4">{String(i + 1).padStart(2, "0")}</span>
              <StepIcon status={s.status} />
              <div className="min-w-0 flex-1">
                <p className={`text-[14px] ${s.status === "pending" ? "text-ink-4" : s.status === "skipped" ? "text-ink-4 line-through decoration-ink-4/60" : s.status === "running" ? "text-ink" : "text-ink-2"}`}>{s.label}</p>
                {s.detail && <p className="mt-0.5 font-mono text-[11px] text-ink-4">{s.detail}</p>}
              </div>
              <span className={`mt-0.5 font-mono text-[10.5px] tracking-wide uppercase ${s.status === "done" ? "text-signal" : s.status === "running" ? "text-ink-2" : s.status === "failed" ? "text-high" : "text-ink-4"}`}>
                {s.status === "running" ? "running" : s.status === "pending" ? "" : s.status}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between border-t border-line bg-black/25 px-5 py-2.5 font-mono text-[11px] text-ink-4">
          <span className="truncate">{repo}</span>
          <span>you can close this tab — we’ll keep going</span>
        </div>
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: Step["status"] }) {
  const base = "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full";
  if (status === "done") return <span className={`${base} bg-signal/15 text-signal`}><CheckIcon className="h-3 w-3" /></span>;
  if (status === "running") return <span className={`${base} text-signal`}><Spinner className="h-[18px] w-[18px]" /></span>;
  if (status === "failed") return <span className={`${base} bg-high/15 font-mono text-[10px] text-high`}>!</span>;
  if (status === "skipped") return <span className={`${base} border border-line-2 text-[10px] text-ink-4`}>–</span>;
  return <span className={`${base} border border-dashed border-line-2`} />;
}
