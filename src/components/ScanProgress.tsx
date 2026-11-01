"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Step } from "@/scanner/types";
import { Spinner } from "./ScanForm";

export function ScanProgress({ scanId, initialSteps, repo }: { scanId: string; initialSteps: Step[]; repo: string }) {
  const router = useRouter();
  const [steps, setSteps] = useState(initialSteps);
  const [status, setStatus] = useState("queued");

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
      if (alive) timer = setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [scanId, router]);

  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const pct = Math.round((done / Math.max(1, steps.length)) * 100);

  return (
    <div className="card mx-auto max-w-2xl p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <Spinner className="h-5 w-5 text-brand-600" />
        <h1 className="text-xl font-semibold text-slate-900">{status === "queued" ? "Your scan is in line…" : "Checking your app…"}</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">Scanning <span className="font-mono">{repo}</span>. This usually takes under a minute. You can leave this page — we’ll keep going.</p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <ol className="mt-6 space-y-3">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            <StepIcon status={s.status} />
            <div className="min-w-0">
              <p className={`text-[15px] ${s.status === "pending" ? "text-slate-400" : s.status === "skipped" ? "text-slate-400 line-through decoration-slate-300" : "text-slate-800"} ${s.status === "running" ? "font-semibold" : ""}`}>{s.label}</p>
              {s.detail && <p className="text-xs text-slate-500">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepIcon({ status }: { status: Step["status"] }) {
  const base = "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full";
  if (status === "done") return <span className={`${base} bg-brand-500 text-white`}><svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor"><path d="M8.1 13.3 4.8 10l-1.1 1.1 4.4 4.4 9-9-1.1-1.1z" /></svg></span>;
  if (status === "running") return <span className={`${base} text-brand-600`}><Spinner className="h-5 w-5" /></span>;
  if (status === "failed") return <span className={`${base} bg-amber-400 text-white text-xs font-bold`}>!</span>;
  if (status === "skipped") return <span className={`${base} border border-slate-200 text-slate-300 text-xs`}>–</span>;
  return <span className={`${base} border-2 border-slate-200`} />;
}
