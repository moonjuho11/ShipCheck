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

/** Animated scan log (pure CSS — lines reveal with staggered delays). */
export function ScanTerminal() {
  return (
    <div className="window">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="eyebrow">scan · acme/taskpal</span>
        <span className="text-[12px] text-ink-4">Example</span>
      </div>
      <ol className="space-y-1.5 p-4 font-mono text-[12px] leading-relaxed">
        {LINES.map(([t, tag, msg], i) => (
          <li key={i} className="reveal-line flex gap-3" style={{ animationDelay: `${0.35 + i * 0.45}s` }}>
            <span className="text-ink-4">{t}</span>
            <span className={`w-16 shrink-0 ${TAG[tag] ?? "text-ink-3"}`}>{tag}</span>
            <span className="min-w-0 text-ink-2">{msg}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
