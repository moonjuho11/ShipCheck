"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Step } from "@/scanner/types";
import { Spinner } from "./ScanForm";
import { AnimatePresence, EASE, m } from "./motion";
import { CheckIcon } from "./ui";

const SLOW_AFTER_SECONDS = 300;
const UNREACHABLE_AFTER_TRIES = 4;

interface QueueInfo { ahead: number; workersOnline: number; }

function waitingText(queue: QueueInfo | null, retrying: boolean): string {
  if (retrying) return "We hit a temporary problem. Trying again shortly…";
  if (queue?.workersOnline === 0) return "Our scanners are restarting. Your scan will start when they’re back…";
  if (queue?.ahead) return `Waiting for a free scanner. ${queue.ahead} ${queue.ahead === 1 ? "scan" : "scans"} ahead of you…`;
  return "Waiting for a free scanner…";
}

export function ScanProgress({ scanId, initialSteps, repo, startedAt, canCancel }: { scanId: string; initialSteps: Step[]; repo: string; startedAt: string; canCancel: boolean }) {
  const router = useRouter();
  const [steps, setSteps] = useState(initialSteps);
  const [status, setStatus] = useState("queued");
  const [queue, setQueue] = useState<QueueInfo | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [missedPolls, setMissedPolls] = useState(0);
  const [gone, setGone] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [now, setNow] = useState<number | null>(null); // set after mount to avoid a hydration mismatch

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 401 || res.status === 404) { setGone(true); return; }
        if (res.ok) {
          const d = await res.json();
          if (!alive) return;
          setSteps(d.steps);
          setStatus(d.status);
          setQueue(d.queue);
          setRetrying(d.retrying);
          setMissedPolls(0);
          if (d.status === "completed" || d.status === "failed" || d.status === "canceled") { router.refresh(); return; }
        } else setMissedPolls((n) => n + 1);
      } catch { setMissedPolls((n) => n + 1); }
      if (alive) timer = setTimeout(tick, 1200);
    };
    tick();
    const clock = setInterval(() => setNow(Date.now()), 100);
    return () => { alive = false; clearTimeout(timer); clearInterval(clock); };
  }, [scanId, router]);

  const cancel = async () => {
    setCanceling(true);
    // Whatever the answer, the next poll or refresh shows where the scan really stands.
    await fetch(`/api/scans/${scanId}/cancel`, { method: "POST" }).catch(() => null);
    setCanceling(false);
    router.refresh();
  };

  const done = steps.filter((s) => s.status === "done" || s.status === "skipped" || s.status === "failed").length;
  const pct = Math.round((done / Math.max(1, steps.length)) * 100);
  const elapsed = now === null ? 0 : Math.max(0, (now - new Date(startedAt).getTime()) / 1000);

  if (gone) {
    return (
      <div className="window mx-auto max-w-xl p-8 text-center">
        <h2 className="text-lg font-semibold text-ink">We can’t show this scan</h2>
        <p className="mt-2 text-ink-3">It may have been removed, or you may need to sign in again.</p>
        <Link href="/dashboard" className="btn-ghost !h-9 mt-6 inline-flex">Go to my scans</Link>
      </div>
    );
  }

  const footnote = missedPolls >= UNREACHABLE_AFTER_TRIES
    ? "We’re having trouble reaching Seaproof, so this may be out of date. We’ll keep trying."
    : elapsed > SLOW_AFTER_SECONDS
      ? "This is taking longer than usual. You can keep waiting or cancel it."
      : "You can close this tab; the scan keeps running.";

  return (
    <div className="relative mx-auto max-w-2xl">
      <div className="window relative">
        <div className="h-px w-full bg-line">
          <m.div className="h-px bg-accent" initial={false} animate={{ width: `${Math.max(3, pct)}%` }} transition={{ duration: 0.8, ease: EASE }} />
        </div>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Spinner className="h-4 w-4 text-ink-3" />
            <span className="text-[14px] font-medium text-ink">{status === "queued" ? waitingText(queue, retrying) : "Checking your app"}</span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="text-[13px] text-ink-3 tabular-nums">{elapsed.toFixed(1)}s</span>
            {canCancel && <button type="button" onClick={cancel} disabled={canceling} className="text-[13px] text-ink-3 transition hover:text-ink disabled:opacity-50">{canceling ? "Canceling…" : "Cancel"}</button>}
          </div>
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
        <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-2.5 text-[12px] text-ink-4">
          <span className="truncate">{repo}</span>
          <span className="text-right">{footnote}</span>
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
