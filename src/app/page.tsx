import Link from "next/link";
import { FigExplain, FigFix, FigSandbox } from "@/components/landing/Figures";
import { ReportPreview } from "@/components/landing/ReportPreview";
import { ScanTerminal } from "@/components/landing/ScanTerminal";
import { ScanForm } from "@/components/ScanForm";
import { ArrowRight, BracketLabel, CheckIcon, Section, SeverityTag } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import type { Severity } from "@/scanner/types";

const CHECKS: { title: string; body: string; example: string; sev: Severity }[] = [
  { title: "Leaked passwords & API keys", body: "Stripe, OpenAI and Supabase admin keys in your code, in old commits, or shipped to every visitor’s browser.", example: "Your Stripe secret key is visible in your code", sev: "critical" },
  { title: "Open databases", body: "Supabase tables without Row Level Security, Firebase left in test mode, admin keys used in the browser.", example: "Anyone can read your “invoices” table", sev: "critical" },
  { title: "Pages that skip the login", body: "API routes and server actions anyone can call, and users who can see each other’s data by changing an ID.", example: "Users can see other people’s orders", sev: "high" },
  { title: "Dangerous user input", body: "Search boxes that run database commands, comments that run scripts, uploads with no limits.", example: "Visitors can run their own database commands", sev: "critical" },
  { title: "Packages with known holes", body: "Every package in your lockfile checked against the public OSV vulnerability database.", example: "next 14.1.0 has known security holes", sev: "high" },
  { title: "Your live website", body: "HTTPS, browser protections, public source code, open CORS, reachable /admin, /.env and debug pages.", example: "Your site publishes its original source code", sev: "medium" },
  { title: "Launch basics", body: "Routes that crash without error handling, logins and payments with no rate limits, missing backups.", example: "Nothing stops someone guessing passwords", sev: "high" },
];

const FAQ = [
  { q: "Do you run my code?", a: "Never. We read the files like a careful reviewer would. Nothing is installed, built or executed." },
  { q: "Do you keep my code?", a: "No. We make a temporary copy, scan it, and delete it the moment the scan ends — even if the scan fails. We only keep the findings: a title, a file name, a line number and the fix advice." },
  { q: "Does AI see my code?", a: "When AI review is on, only the riskiest files (not your whole repo) are sent to Claude to double-check findings and explain them in plain English. Anything that looks like a secret key is removed first." },
  { q: "I’m not technical. Will I understand the report?", a: "That’s the point. Every finding says what’s wrong and why it matters in everyday language, plus a ready-made prompt you paste into Lovable, Bolt, Cursor or Replit to fix it." },
  { q: "Is a passing score a guarantee?", a: "No scanner can promise zero bugs. ShipCheck catches the problems that most often hurt AI-built apps in their first week, so you can fix them before real users arrive." },
];

const BUILDERS = ["Lovable", "Bolt", "Cursor", "Replit", "v0", "Windsurf"];

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const user = await getCurrentUser().catch(() => null);
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  const error = str(sp.error);

  return (
    <div className="-mt-[68px]">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-[68px]">
        <div aria-hidden className="bg-grid fade-edges pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-4xl px-5 pt-24 pb-16 text-center sm:pt-32">
          <p className="eyebrow">Pre-launch security audit for AI-built apps</p>
          <h1 className="display mt-6 text-[40px] text-balance sm:text-[56px] lg:text-[64px]">Is your vibe-coded app<br className="hidden sm:block" /> safe to launch?</h1>
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-balance text-ink-3 sm:text-lg">
            ShipCheck finds leaked keys, open databases and pages that skip the login — then writes the prompt your AI agent needs to fix each one.
          </p>
          <div id="scan" className="mx-auto mt-10 max-w-2xl scroll-mt-28">
            {error && <div role="alert" className="mb-3 rounded-lg border border-line-2 bg-panel px-4 py-2.5 text-left text-sm text-ink-2">{error}</div>}
            <ScanForm
              signedIn={!!user}
              hasPrivateAccess={/\brepo\b/.test(user?.github_scopes || "")}
              initialRepo={str(sp.repo)}
              initialSite={str(sp.site)}
              autostart={str(sp.autostart) === "1"}
            />
            <p className="eyebrow mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <span>Never runs your code</span><span className="text-ink-4">/</span>
              <span>Deleted after the scan</span><span className="text-ink-4">/</span>
              <span>~60 seconds</span>
            </p>
          </div>
        </div>
        <div className="relative mx-auto max-w-5xl px-5 pb-24">
          <ReportPreview />
        </div>
      </section>

      {/* ── Builders strip ─────────────────────────────────── */}
      <Section className="flex flex-col items-center gap-5 px-6 py-10 sm:flex-row sm:justify-between">
        <span className="eyebrow">Built for apps made with</span>
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {BUILDERS.map((b) => <li key={b} className="text-[17px] font-semibold tracking-tight text-ink-4">{b}</li>)}
        </ul>
      </Section>

      {/* ── Statement + figures (Linear) ─────────────────────── */}
      <Section className="px-6 pt-20 pb-0 sm:px-10">
        <BracketLabel>Why ShipCheck</BracketLabel>
        <p className="headline mt-6 max-w-4xl text-[28px] sm:text-[40px]">
          A security review for people who don’t read code.{" "}
          <span className="text-ink-4">ShipCheck checks your app the way a security engineer would, explains every problem in plain English, and hands you the exact fix.</span>
        </p>
        <div className="mt-16 grid grid-cols-1 border-t border-line sm:grid-cols-3">
          {[
            { fig: "0.1", title: "Never runs your code", body: "A sealed, temporary copy is read — never installed or executed — then deleted.", Art: FigSandbox },
            { fig: "0.2", title: "Plain English, always", body: "Every finding says what’s wrong, why it matters and where it lives. No jargon.", Art: FigExplain },
            { fig: "0.3", title: "Fixed in one paste", body: "Copy the prompt into Lovable, Bolt, Cursor or Replit. Rescan to confirm.", Art: FigFix },
          ].map(({ fig, title, body, Art }, i) => (
            <div key={fig} className={`relative px-2 py-8 sm:px-6 ${i > 0 ? "sm:border-l sm:border-line" : ""}`}>
              <span className="eyebrow text-ink-4">FIG {fig}</span>
              <div className="mx-auto mt-2 h-52 max-w-[300px]"><Art /></div>
              <h3 className="mt-4 text-[15px] font-medium text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── What we check (Firecrawl grid) ───────────────────── */}
      <Section id="checks" className="scroll-mt-24">
        <div className="flex flex-col gap-6 px-6 py-16 sm:flex-row sm:items-end sm:justify-between sm:px-10">
          <div>
            <BracketLabel index={1} total={7}>What we check</BracketLabel>
            <h2 className="headline mt-5 max-w-xl text-[32px] text-balance sm:text-[44px]">The problems that hurt AI-built apps first.</h2>
          </div>
          <p className="max-w-sm text-ink-3">Seven areas, checked with proven open-source scanners plus checks built specifically for Supabase, Firebase and Next.js apps.</p>
        </div>
        <div className="grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((c, i) => (
            <div key={c.title} className="group relative min-w-0 border-b border-line p-6 transition hover:bg-white/[0.02] sm:p-8 sm:[&:nth-child(odd)]:border-r lg:[&:nth-child(odd)]:border-r-0 lg:[&:not(:nth-child(3n))]:border-r">
              <span className="font-mono text-[11px] text-ink-4">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-6 text-[17px] font-medium text-ink">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">{c.body}</p>
              <div className="mt-6 flex items-center gap-2 rounded-lg border border-line bg-black/30 px-3 py-2 text-[12.5px] text-ink-2">
                <SeverityTag severity={c.sev} />
                <span className="min-w-0 truncate">{c.example}</span>
              </div>
            </div>
          ))}
          <div className="relative flex min-w-0 flex-col justify-between overflow-hidden border-b border-line p-6 sm:p-8 lg:col-span-2">
            <span className="font-mono text-[11px] text-ink-4">+ AI</span>
            <div className="relative">
              <h3 className="mt-6 text-[17px] font-medium text-ink">A second opinion from Claude</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">Reviews your riskiest files, removes false alarms, and explains each problem for your exact code.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── How it works ─────────────────────────────────────── */}
      <Section id="how" className="grid scroll-mt-24 gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <div>
          <BracketLabel index={2} total={7}>How it works</BracketLabel>
          <h2 className="headline mt-5 text-[32px] sm:text-[44px]">From “is this safe?” to fixed <span className="text-ink-4">in about a minute.</span></h2>
          <ol className="mt-10 space-y-0 border-l border-line">
            {[
              ["Paste your repo", "Public or private GitHub repos. Add your live site for extra checks."],
              ["We check it", "Gitleaks, Semgrep and OSV, plus checks built for vibe-coded stacks — then Claude double-checks."],
              ["Fix with one paste", "Every problem comes with a prompt written for your AI agent. Paste, apply, rescan."],
            ].map(([t, b], i) => (
              <li key={t} className="relative pb-8 pl-8 last:pb-0">
                <span className="absolute top-0.5 -left-[9px] flex h-[17px] w-[17px] items-center justify-center rounded-full border border-line-2 bg-canvas font-mono text-[9px] text-ink-3">{i + 1}</span>
                <h3 className="text-[15px] font-medium text-ink">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-3">{b}</p>
              </li>
            ))}
          </ol>
        </div>
        <ScanTerminal />
      </Section>

      {/* ── Fix prompt showcase ──────────────────────────────── */}
      <Section className="grid gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div className="window order-2 lg:order-1">
          <div className="border-b border-line p-5">
            <div className="flex items-center gap-2"><SeverityTag severity="high" /><span className="text-[12px] text-ink-4">Login protection</span></div>
            <h3 className="mt-3 text-[16px] font-medium text-ink">Logged-in users can see other people’s invoices by changing an ID</h3>
            <p className="mt-1 font-mono text-[11.5px] text-ink-4">app/api/invoices/[id]/route.ts · line 7</p>
          </div>
          <div className="space-y-4 p-5 text-[14px]">
            <div><p className="eyebrow">Why it matters</p><p className="mt-1.5 leading-relaxed text-ink-2">A user can change /invoices/123 to /invoices/124 and read someone else’s private data. It’s one of the most common real-world leaks.</p></div>
            <div className="rounded-xl border border-line bg-black/40">
              <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
                <span className="eyebrow">Fix prompt</span>
                <span className="rounded-md bg-ink px-2 py-1 text-[12px] font-medium text-canvas">Copy prompt</span>
              </div>
              <pre className="p-3.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-3">{`Fix a security problem in my app.

Where: app/api/invoices/[id]/route.ts (around line 7)

Please:
1. Add an ownership check: .eq("user_id", user.id)
2. Return 404 when the invoice isn't this user's
3. Use a client scoped to the logged-in user`}</pre>
            </div>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <BracketLabel index={3} total={7}>The fix</BracketLabel>
          <h2 className="headline mt-5 text-[32px] sm:text-[44px]">Your AI wrote the bug. <span className="text-ink-4">Let it write the fix.</span></h2>
          <p className="mt-5 max-w-md leading-relaxed text-ink-3">Each finding comes with a precise, copy-paste prompt: the file, the line, the change, and how to check it worked. Paste it into the tool you built with and rescan.</p>
          <ul className="mt-8 grid grid-cols-2 gap-3 text-sm text-ink-2">
            {["Exact file and line", "Steps your agent can follow", "Keeps the app working", "Tells you how to verify"].map((t) => (
              <li key={t} className="flex items-center gap-2"><CheckIcon className="h-4 w-4 text-ink-3" />{t}</li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ── Privacy ─────────────────────────────────────────── */}
      <Section id="privacy" className="scroll-mt-24 px-6 py-20 sm:px-10">
        <BracketLabel index={4} total={7}>Privacy</BracketLabel>
        <div className="mt-5 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="headline text-[32px] sm:text-[44px]">Your code stays yours.</h2>
          <div className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2">
            {[
              ["Never executed", "No installs, builds or scripts. We only read files."],
              ["Deleted after scanning", "The temporary copy is removed when the scan ends — even on errors."],
              ["Findings only", "We store titles, file names and line numbers. Never source code or full secrets."],
              ["Least access", "Public repos need no permissions. Private access is optional and read-only."],
            ].map(([t, b]) => (
              <div key={t} className="border-r border-b border-line p-6">
                <p className="flex items-center gap-2 text-[15px] font-medium text-ink">{t}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Pricing teaser ──────────────────────────────────── */}
      <Section className="px-6 py-20 sm:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <BracketLabel index={5} total={7}>Pricing</BracketLabel>
            <h2 className="headline mt-5 text-[32px] sm:text-[44px]">Start free. <span className="text-ink-4">Pay for the fixes.</span></h2>
          </div>
          <Link href="/pricing" className="btn-ghost self-start sm:self-auto">Compare plans <ArrowRight /></Link>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {[
            ["Free", "$0", "1 scan a month · see every problem’s title"],
            ["Repo Pass", "$29", "Full report + fix prompts for one repo · 5 rescans"],
            ["Pro", "$49/mo", "Unlimited scans · PR checks · Production Ready badge"],
          ].map(([n, p, d]) => (
            <div key={n} className="bg-panel p-6">
              <p className="eyebrow">{n}</p>
              <p className="mt-3 text-3xl font-medium tracking-tight text-ink">{p}</p>
              <p className="mt-2 text-sm text-ink-3">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <Section id="faq" className="grid scroll-mt-24 gap-10 px-6 py-20 sm:px-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <BracketLabel index={6} total={7}>Questions</BracketLabel>
          <h2 className="headline mt-5 text-[32px] sm:text-[44px]">Good questions.</h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] text-ink">
                {f.q}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-2 text-ink-3 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-2xl leading-relaxed text-ink-3">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <Section className="relative overflow-hidden px-6 py-28 text-center">
        <div className="relative">
          <BracketLabel index={7} total={7} className="justify-center">Ship it</BracketLabel>
          <h2 className="display mt-6 text-[36px] sm:text-[52px]">Check it before you launch it.</h2>
          <p className="mx-auto mt-5 max-w-md text-ink-3">A one-minute scan now costs less than a leaked database later.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a href="#scan" className="btn-signal !h-11 !px-5">Scan my app <ArrowRight /></a>
            <Link href="/pricing" className="btn-ghost !h-11 !px-5">See pricing</Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
