import { SeverityIcon, SeverityTag } from "../ui";
import type { Severity } from "@/scanner/types";

const ROWS: { sev: Severity; title: string; file: string; area: string }[] = [
  { sev: "critical", title: "Your Stripe secret key is saved in your code", file: "src/lib/payments.ts:4", area: "Secrets" },
  { sev: "critical", title: "Anyone can read and change your “invoices” table", file: "supabase/migrations/init.sql:11", area: "Database" },
  { sev: "high", title: "Users can see other people’s invoices by changing an ID", file: "app/api/invoices/[id]/route.ts:7", area: "Login" },
  { sev: "high", title: "Your payment webhook trusts anyone who calls it", file: "app/api/stripe-webhook/route.ts:4", area: "Login" },
  { sev: "medium", title: "File uploads aren’t checked for type or size", file: "app/api/upload/route.ts:9", area: "Input" },
  { sev: "low", title: "We couldn’t find a backup plan for your data", file: "—", area: "Launch" },
];

/** Static product shot of a report, framed like a desktop app window. */
export function ReportPreview() {
  return (
    <div className="relative">
      <div className="window relative">
        <div className="flex items-center gap-2 border-b border-line bg-panel-2/60 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-white/10" /><span className="h-3 w-3 rounded-full bg-white/10" /><span className="h-3 w-3 rounded-full bg-white/10" />
          <span className="ml-3 truncate font-mono text-[11px] text-ink-4">shipcheck.app/scans/acme-taskpal</span>
        </div>
        <div className="grid md:grid-cols-[260px_1fr]">
          <aside className="hidden border-r border-line p-5 md:block">
            <p className="eyebrow">Safety score</p>
            <div className="mt-2 flex items-baseline gap-1.5"><span className="text-5xl font-semibold tracking-tight text-ink">38</span><span className="text-ink-4">/ 100</span></div>
            <p className="mt-2 text-[14px] font-semibold text-ink">Not ready to launch</p>
            <div className="mt-6 space-y-2.5">
              {([["critical", 2], ["high", 2], ["medium", 1], ["low", 1]] as [Severity, number][]).map(([s, n]) => (
                <div key={s} className="flex items-center gap-2 text-[13px]">
                  <SeverityIcon severity={s} className="h-3.5 w-3.5" />
                  <span className="flex-1 capitalize text-ink-3">{s}</span>
                  <span className="font-mono text-ink-2">{n}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-1.5 border-t border-line pt-5 text-[12px]">
              {[["Secrets", 1], ["Database", 1], ["Login", 2], ["Packages", 0], ["Live site", 0]].map(([a, n]) => (
                <div key={a} className="flex justify-between"><span className="text-ink-3">{a}</span>{n ? <span className="text-ink-2">{n} {n === 1 ? "issue" : "issues"}</span> : <span className="text-ink-4">Passed</span>}</div>
              ))}
            </div>
          </aside>
          <div className="min-w-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-[13px] font-medium text-ink-2">acme/taskpal</span>
              <span className="eyebrow">6 issues</span>
            </div>
            <ul>
              {ROWS.map((r, i) => (
                <li key={i} className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 ${i === 1 ? "bg-white/[0.035]" : ""}`}>
                  <SeverityIcon severity={r.sev} className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-ink">{r.title}</p>
                    <p className="truncate font-mono text-[11px] text-ink-4">{r.file}</p>
                  </div>
                  <span className="hidden text-[11px] text-ink-4 sm:block">{r.area}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line bg-panel-2 p-4">
              <div className="flex items-center justify-between">
                <SeverityTag severity="critical" />
                <span className="flex items-center gap-1.5 rounded-md border border-line-2 px-2 py-1 text-[11px] text-ink-2">Copy fix prompt</span>
              </div>
              <pre className="mt-3 overflow-hidden font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-3">
{`Fix a security problem in my app.
Where: supabase/migrations/init.sql (around line 11)
Please:
1. Enable row level security on public.invoices
2. Only let users see rows where auth.uid() = user_id`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
