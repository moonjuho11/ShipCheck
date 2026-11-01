"use client";

import { useState } from "react";
import type { ReportFinding } from "@/lib/report";
import { SeverityPill } from "./ReportBits";

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
    <article className="card overflow-hidden">
      <button
        type="button" onClick={() => !locked && setOpen(!open)} aria-expanded={open}
        className={`flex w-full items-start gap-3 p-4 text-left sm:p-5 ${locked ? "cursor-default" : "hover:bg-slate-50/60"}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={f.severity} />
            <span className="text-xs font-medium text-slate-500">{categoryLabel}</span>
            {f.aiWritten && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">found by AI review</span>}
          </div>
          <h3 className="mt-2 text-[15px] font-semibold leading-snug text-slate-900 sm:text-base"><Rich text={f.title} /></h3>
          {f.file && (
            <p className="mt-1 truncate font-mono text-xs text-slate-500">
              {f.file}{f.line ? `, line ${f.line}` : ""}{f.evidence ? ` · ${f.evidence}` : ""}
            </p>
          )}
        </div>
        {locked ? (
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-400"><LockIcon /> Locked</span>
        ) : (
          <svg viewBox="0 0 20 20" className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} fill="currentColor"><path d="M5.3 7.3 10 12l4.7-4.7 1.1 1.1L10 14.2 4.2 8.4z" /></svg>
        )}
      </button>
      {open && !locked && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">What’s wrong</h4>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-800"><Rich text={f.explanation!} /></p>
          </section>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it matters</h4>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-800"><Rich text={f.whyItMatters!} /></p>
          </section>
          <section>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fix it: paste this into Lovable, Bolt, Cursor or Replit</h4>
              <button type="button" onClick={copy} className="btn-primary !px-3 !py-1.5 !text-xs">
                {copied ? "Copied ✓" : "Copy prompt"}
              </button>
            </div>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 font-mono text-[13px] leading-relaxed text-slate-700">{f.fixPrompt}</pre>
          </section>
        </div>
      )}
    </article>
  );
}

export function LockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true"><path d="M10 1.7a4.2 4.2 0 0 0-4.2 4.2v2.5H5a1.7 1.7 0 0 0-1.7 1.6v6.7c0 .9.8 1.6 1.7 1.6h10c.9 0 1.7-.7 1.7-1.6V10c0-.9-.8-1.6-1.7-1.6h-.8V5.9A4.2 4.2 0 0 0 10 1.7Zm-2.5 4.2a2.5 2.5 0 0 1 5 0v2.5h-5V5.9Z" /></svg>;
}

/** Render `code` spans as small chips; everything else stays plain text (no HTML injection). */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2
      ? <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">{part.slice(1, -1)}</code>
      : part)}</>;
}
