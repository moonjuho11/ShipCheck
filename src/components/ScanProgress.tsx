"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Step } from "@/scanner/types";
import { Spinner } from "./ScanForm";
import { AnimatePresence, EASE, m } from "./motion";
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

  const done = steps.filter((s) => s.status === "done" || s.status === "skipped" || s.status === "failed").length;
  const pct = Math.round((done / Math.max(1, steps.length)) * 100);
  const elapsed = now === null ? 0 : Math.max(0, (now - new Date(startedAt).getTime()) / 1000);

  return (
    <div className="relative mx-auto max-w-2xl">
      <div className="window relative">
        <div className="h-px w-full bg-line">
          <m.div className="h-px bg-accent" initial={false} animate={{ width: `${Math.max(3, pct)}%` }} transition={{ duration: 0.8, ease: EASE }} />
        </div>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Spinner className="h-4 w-4 text-ink-3" />
            <span className="text-[14px] font-medium text-ink">{status === "queued" ? "Waiting for a free scanner…" : "Checking your app"}</span>
          </div>
          <span className="text-[13px] text-ink-3 tabular-nums">{elapsed.toFixed(1)}s</span>
        </div>
        <ol className="px-2 py-2">
          {steps.map((s) => (
            <li key={s.key} className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-colors duration-300 ${s.status === "running" ? "bg-white/[0.04]" : ""}`}>
              <AnimatePresence mode="wait" initial={false}><m.span key={s.status} className="inline-flex shrink-0" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: { duration: 0.25, ease: EASE } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}><StepIcon status={s.status} /></m.span></AnimatePresence>
              <div className="min-w-0 flex-1">
                <p className={`text-[14px] ${s.status === "pending" ? "text-ink-4" : s.status === "skipped" ? "text-ink-4 line-through decoration-ink-4/60" : s.status === "running" ? "text-ink" : "text-ink-2"}`}>{s.label}</p>
                {s.detail && <p className="mt-0.5 text-[12px] text-ink-4">{s.detail}</p>}
              </div>
              <span className="mt-0.5 text-[12px] text-ink-4">{STATUS_TEXT[s.status]}</span>
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[12px] text-ink-4">
          <span className="truncate">{repo}</span>
          <span>You can close this tab; the scan keeps running.</span>
        </div>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<Step["status"], string> = { done: "Done", running: "Running", pending: "", skipped: "Skipped", failed: "Failed" };

function StepIcon({ status }: { status: Step["status"] }) {
  const base = "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full";
  if (status === "done") return <span className={`${base} text-ink-2`}><CheckIcon className="h-3.5 w-3.5" /></span>;
  if (status === "running") return <span className={`${base} text-ink-2`}><Spinner className="h-4 w-4" /></span>;
  if (status === "failed") return <span className={`${base} text-[12px] font-semibold text-ink-2`}>!</span>;
  if (status === "skipped") return <span className={`${base} border border-line-2 text-[10px] text-ink-4`}>–</span>;
  return <span className={`${base} border border-dashed border-line-2`} />;
}
