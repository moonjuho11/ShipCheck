"use client";

import { useState } from "react";
import type { ReportFinding } from "@/lib/report";
import { Collapse, SwapText } from "./motion";
import { CheckIcon, LockIcon, SeverityIcon, SeverityTag } from "./ui";

/** Linear-style issue row that expands into the full explanation + fix prompt. */
export function FindingCard({ f, categoryLabel, defaultOpen }: { f: ReportFinding; categoryLabel: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [copied, setCopied] = useState(false);
  const locked = f.explanation === null;

  async function copy() {
    if (!f.fixPrompt) return;
    try { await navigator.clipboard.writeText(f.fixPrompt); } catch {
      const t = document.createElement("textarea"); t.value = f.fixPrompt; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <article className={`border-b border-line last:border-b-0 ${open ? "bg-white/[0.025]" : ""}`}>
      <button
        type="button" onClick={() => !locked && setOpen(!open)} aria-expanded={locked ? undefined : open} disabled={locked}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition sm:px-5 ${locked ? "cursor-default" : "hover:bg-white/[0.03]"}`}
      >
        <SeverityIcon severity={f.severity} className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug text-ink"><Rich text={f.title} /></p>
          {f.file && <p className="mt-0.5 truncate font-mono text-[11.5px] text-ink-4">{f.file}{f.line ? `:${f.line}` : ""}{f.evidence ? `  ·  ${f.evidence}` : ""}</p>}
        </div>
        {f.aiWritten && <span className="hidden text-[12px] text-ink-4 sm:inline">Found by AI review</span>}
        <span className="hidden text-[12px] text-ink-4 md:inline">{categoryLabel}</span>
        {locked ? (
          <LockIcon className="h-3.5 w-3.5 shrink-0 text-ink-4" />
        ) : (
          <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 text-ink-4 transition duration-300 ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m6 4 4 4-4 4" /></svg>
        )}
      </button>
      <Collapse open={open && !locked}>
        <div className="grid gap-5 px-4 pt-1 pb-5 sm:px-5 sm:pl-12 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><SeverityTag severity={f.severity} /><span className="text-[12px] text-ink-4">{categoryLabel}</span></div>
            <section>
              <h4 className="eyebrow">What’s wrong</h4>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2"><Rich text={f.explanation!} /></p>
            </section>
            <section>
              <h4 className="eyebrow">Why it matters</h4>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2"><Rich text={f.whyItMatters!} /></p>
            </section>
          </div>
          <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel-2">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
              <h4 className="eyebrow truncate">Fix prompt <span className="hidden text-ink-4 sm:inline">· paste into your AI tool</span></h4>
              <button type="button" onClick={copy} className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 whitespace-nowrap text-[12px] font-medium transition ${copied ? "bg-accent text-white" : "bg-ink text-canvas hover:bg-white"}`}>
                <SwapText active={copied} idle="Copy prompt" done={<><CheckIcon className="h-3 w-3" /> Copied</>} />
              </button>
            </div>
            <pre className="max-h-80 overflow-auto p-3.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-3">{f.fixPrompt}</pre>
          </section>
        </div>
      </Collapse>
    </article>
  );
}

/** Render `code` spans as chips; everything else stays plain text (no HTML injection). */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2
      ? <code key={i} className="rounded-[5px] border border-line bg-white/[0.05] px-1 py-px font-mono text-[0.86em] text-ink">{part.slice(1, -1)}</code>
      : part)}</>;
}

export { LockIcon };
