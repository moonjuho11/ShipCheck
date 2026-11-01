import Link from "next/link";
import { ScanForm } from "@/components/ScanForm";
import { SeverityPill } from "@/components/ReportBits";
import { getCurrentUser } from "@/lib/session";

const CHECKS = [
  { icon: "🔑", title: "Leaked passwords & API keys", body: "Stripe, OpenAI, Supabase admin keys and .env files saved in your code, its history, or shipped to every visitor's browser." },
  { icon: "🗄️", title: "Open databases", body: "Supabase tables without Row Level Security, Firebase rules left in test mode, and admin keys used in the browser." },
  { icon: "🔒", title: "Pages that skip the login", body: "API routes and server actions anyone can call, and users who can see each other's data by changing an ID in the URL." },
  { icon: "⌨️", title: "Dangerous user input", body: "Search boxes that run database commands, comments that run scripts, and uploads with no type or size limits." },
  { icon: "📦", title: "Packages with known holes", body: "Every package in your lockfile checked against the public OSV vulnerability database." },
  { icon: "🌐", title: "Your live website", body: "HTTPS, browser security headers, public source code, open CORS, and reachable /admin, /.env or debug pages." },
  { icon: "🚀", title: "Launch basics", body: "Routes that crash without error handling, logins and payments with no rate limits, missing migrations and backups." },
];

const FAQ = [
  { q: "Do you run my code?", a: "Never. We read the files like a careful reviewer would. Nothing is installed, built or executed." },
  { q: "Do you keep my code?", a: "No. We download a temporary copy, scan it, and delete it as soon as the scan ends — even if the scan fails. We only store the findings: a title, a file name, a line number and the fix advice." },
  { q: "Does AI see my code?", a: "If AI review is turned on, the riskiest files (not your whole repo) are sent to Claude to double-check findings and explain them in plain English. Anything that looks like a secret key is removed before it's sent." },
  { q: "I'm not technical. Will I understand the report?", a: "That's the point. Every finding explains what's wrong and why it matters in everyday language, plus a ready-made prompt you can paste into Lovable, Bolt, Cursor or Replit to fix it." },
  { q: "Is a passing score a guarantee?", a: "No scanner can promise zero bugs. ShipCheck catches the problems that most often hurt AI-built apps right after launch, so you can fix them before real users arrive." },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const user = await getCurrentUser().catch(() => null);
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  const error = str(sp.error);

  return (
    <>
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-white to-slate-50">
        <div className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 max-w-3xl rounded-full bg-brand-100/60 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              For apps built with Lovable, Bolt, Cursor, Replit &amp; v0
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Is your vibe-coded app safe to launch?</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              ShipCheck finds leaked keys, open databases and pages that skip the login — then hands you a copy-paste prompt so your AI agent can fix each one.
            </p>
            <ul className="mt-6 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
              {["We never run your code", "Deleted right after the scan", "Plain English, no jargon"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check /> {t}</li>
              ))}
            </ul>
          </div>
          <div>
            {error && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
            <ScanForm
              signedIn={!!user}
              hasPrivateAccess={/\brepo\b/.test(user?.github_scopes || "")}
              initialRepo={str(sp.repo)}
              initialSite={str(sp.site)}
              autostart={str(sp.autostart) === "1"}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">What we check</h2>
        <p className="mt-2 max-w-2xl text-slate-600">The problems that most often hurt AI-built apps in their first week online.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((c) => (
            <div key={c.title} className="card p-5">
              <div className="text-2xl" aria-hidden>{c.icon}</div>
              <h3 className="mt-3 font-semibold text-slate-900">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{c.body}</p>
            </div>
          ))}
          <div className="card flex flex-col justify-center bg-slate-900 p-5 text-white">
            <h3 className="font-semibold">Plus an AI second opinion</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">Claude reviews your riskiest files, weeds out false alarms, and explains each problem for your exact code.</p>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">From “is this safe?” to fixed, in three steps</h2>
            <ol className="mt-8 space-y-6">
              {[
                ["Paste your repo", "Public or private GitHub repos. Add your live website for extra checks."],
                ["We check it in about a minute", "Proven scanners (Gitleaks, Semgrep, OSV) plus checks built for Supabase, Firebase and Next.js apps."],
                ["Fix with copy-paste prompts", "Each problem comes with a prompt written for your AI agent. Paste, apply, rescan."],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{i + 1}</span>
                  <div><h3 className="font-semibold text-slate-900">{t}</h3><p className="mt-1 text-slate-600">{b}</p></div>
                </li>
              ))}
            </ol>
          </div>
          <div className="card overflow-hidden" aria-label="Example finding">
            <div className="p-5">
              <div className="flex items-center gap-2"><SeverityPill severity="critical" /><span className="text-xs font-medium text-slate-500">Database safety</span></div>
              <h3 className="mt-2 font-semibold text-slate-900">Anyone can read and change your “invoices” table</h3>
              <p className="mt-1 font-mono text-xs text-slate-500">supabase/migrations/init.sql, line 11</p>
            </div>
            <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-5 text-sm">
              <p className="text-slate-700"><span className="font-semibold">Why it matters:</span> Supabase tables are reachable from the internet with your public key. Without access rules, any visitor can download or delete every invoice.</p>
              <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 font-mono text-[12px] leading-relaxed text-slate-700">{`Fix a security problem in my app.

Where: supabase/migrations/init.sql (around line 11)

Please:
1. Create a new migration that runs
   alter table public.invoices enable row level security;
2. Add policies so each user can only see their own rows…`}</pre>
            </div>
          </div>
        </div>
      </section>

      <section id="privacy" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Your code stays yours</h2>
            <p className="mt-2 text-slate-600">We built ShipCheck the way we’d want our own code handled.</p>
          </div>
          <ul className="grid gap-4 text-sm text-slate-700 sm:grid-cols-2 lg:col-span-2">
            <li><strong className="text-slate-900">Never executed.</strong> No installs, builds or scripts — we only read files.</li>
            <li><strong className="text-slate-900">Deleted after scanning.</strong> The temporary copy is removed when the scan ends, even on errors.</li>
            <li><strong className="text-slate-900">Findings only.</strong> We store titles, file names and line numbers — never your source code or full secrets.</li>
            <li><strong className="text-slate-900">Least access.</strong> Public repos need no permissions. Private repo access is optional and read-only via our GitHub App.</li>
          </ul>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Questions</h2>
        <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-900">
                {f.q}<span className="text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/pricing" className="btn-ghost">See pricing</Link>
        </div>
      </section>
    </>
  );
}

function Check() {
  return <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-brand-600" fill="currentColor" aria-hidden><path d="M10 1.7a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6Zm-1.4 12-3.5-3.5 1.2-1.2 2.3 2.3 4.9-4.9 1.2 1.2-6.1 6.1Z" /></svg>;
}
