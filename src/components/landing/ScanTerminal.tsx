"use client";

import { EASE, m } from "../motion";

const LINES: [string, string, string][] = [
  ["00.0s", "clone", "temporary copy of acme/taskpal · 142 files"],
  ["00.9s", "secrets", "gitleaks + 14 detectors · history checked"],
  ["01.2s", "found", "Stripe secret key in src/lib/payments.ts"],
  ["01.6s", "database", "3 Supabase tables · 1 without access rules"],
  ["02.1s", "auth", "18 API routes · 2 without a login check"],
  ["03.4s", "input", "semgrep · 9 rules · 1 risky query"],
  ["04.0s", "packages", "412 packages vs OSV · next@14.1.0 vulnerable"],
  ["05.2s", "live", "your-app.lovable.app · 3 headers missing"],
  ["07.9s", "ai", "Claude reviewed 11 risky files · 1 false alarm removed"],
  ["08.1s", "done", "score 38/100 · 6 issues · code deleted ✓"],
];

const TAG: Record<string, string> = { found: "text-ink", done: "text-ink" };

/** Example scan log. Lines appear one by one the first time it scrolls into view. */
export function ScanTerminal() {
  return (
    <m.div
      className="window"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="eyebrow">scan · acme/taskpal</span>
        <span className="text-[12px] text-ink-4">Example</span>
      </div>
      <m.ol
        className="space-y-1.5 p-4 font-mono text-[12px] leading-relaxed"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "0px 0px -15% 0px" }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.32, delayChildren: 0.35 } } }}
      >
        {LINES.map(([t, tag, msg], i) => (
          <m.li
            key={i}
            className="flex gap-3"
            variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0, transition: { duration: 0.25, ease: EASE } } }}
          >
            <span className="text-ink-4">{t}</span>
            <span className={`w-16 shrink-0 ${TAG[tag] ?? "text-ink-3"}`}>{tag}</span>
            <span className="min-w-0 text-ink-2">{msg}</span>
          </m.li>
        ))}
      </m.ol>
    </m.div>
  );
}
