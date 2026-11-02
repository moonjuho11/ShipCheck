import Link from "next/link";
import { FigExplain, FigFix, FigSandbox } from "@/components/landing/Figures";
import { ReportPreview } from "@/components/landing/ReportPreview";
import { ScanTerminal } from "@/components/landing/ScanTerminal";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { ScanForm } from "@/components/ScanForm";
import { ArrowRight, Section, SeverityTag } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import type { Severity } from "@/scanner/types";

const CHECKS: { title: string; example: string; sev: Severity }[] = [
  { title: "Leaked passwords & API keys", example: "Your Stripe secret key is visible in your code", sev: "critical" },
  { title: "Open databases", example: "Anyone can read your “invoices” table", sev: "critical" },
  { title: "Pages that skip the login", example: "Users can see other people’s orders", sev: "high" },
  { title: "Dangerous user input", example: "Visitors can run their own database commands", sev: "critical" },
  { title: "Packages with known holes", example: "next 14.1.0 has known security holes", sev: "high" },
  { title: "Your live website", example: "Your site publishes its original source code", sev: "medium" },
  { title: "Launch basics", example: "Nothing stops someone guessing passwords", sev: "high" },
];

const FAQ = [
  { q: "Do you run my code?", a: "Never. We only read the files. Nothing is installed, built or executed." },
  { q: "Do you keep my code?", a: "No. The temporary copy is deleted when the scan ends. We keep only the findings." },
  { q: "Does AI see my code?", a: "Only the riskiest files, with anything that looks like a secret removed first." },
  { q: "Is a passing score a guarantee?", a: "No scanner can promise zero bugs. Seaproof catches the problems that most often hurt AI-built apps." },
];

const H2 = "headline text-[32px] sm:text-[44px]";

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const user = await getCurrentUser().catch(() => null);
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  const error = str(sp.error);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative">
        <Stagger onMount gap={0.08} delay={0.05} className="relative mx-auto max-w-4xl px-5 pt-20 pb-16 text-center sm:pt-28">
          <StaggerItem><h1 className="display text-[40px] text-balance sm:text-[56px] lg:text-[64px]">Is your vibe-coded app<br className="hidden sm:block" /> safe to launch?</h1></StaggerItem>
          <StaggerItem id="scan" className="mx-auto mt-10 max-w-2xl scroll-mt-28">
            {error && <div role="alert" className="mb-3 rounded-lg border border-line-2 bg-panel px-4 py-2.5 text-left text-sm text-ink-2">{error}</div>}
            <ScanForm
              signedIn={!!user}
              initialRepo={str(sp.repo)}
              initialSite={str(sp.site)}
              autostart={str(sp.autostart) === "1"}
            />
          </StaggerItem>
        </Stagger>
        <Reveal onMount delay={0.35} y={24} className="relative mx-auto max-w-5xl px-5 pb-24">
          <ReportPreview />
        </Reveal>
      </section>

      {/* ── Statement + figures ──────────────────────────────── */}
      <Section className="px-6 pt-20 pb-0 sm:px-10">
        <Reveal><h2 className={`${H2} max-w-3xl`}>A security review for people who don’t read code.</h2></Reveal>
        <Stagger gap={0.12} className="mt-16 grid grid-cols-1 border-t border-line sm:grid-cols-3">
          {[
            { title: "Never runs your code", Art: FigSandbox },
            { title: "Plain English, always", Art: FigExplain },
            { title: "Fixed in one paste", Art: FigFix },
          ].map(({ title, Art }, i) => (
            <StaggerItem key={title} className={`relative px-2 py-8 sm:px-6 ${i > 0 ? "sm:border-l sm:border-line" : ""}`}>
              <div className="mx-auto h-52 max-w-[300px]"><Art /></div>
              <h3 className="mt-4 text-[15px] font-medium text-ink">{title}</h3>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* ── What we check ────────────────────────────────────── */}
      <Section id="checks" className="scroll-mt-24">
        <Reveal className="px-6 py-16 sm:px-10">
          <h2 className={`${H2} max-w-xl text-balance`}>The problems that hurt AI-built apps first.</h2>
        </Reveal>
        <Stagger gap={0.05} className="grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((c) => (
            <StaggerItem key={c.title} className="relative min-w-0 border-b border-line p-6 transition hover:bg-white/[0.02] sm:p-8 sm:[&:nth-child(odd)]:border-r lg:[&:nth-child(odd)]:border-r-0 lg:[&:not(:nth-child(3n))]:border-r">
              <h3 className="text-[17px] font-medium text-ink">{c.title}</h3>
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12.5px] text-ink-2">
                <SeverityTag severity={c.sev} />
                <span className="min-w-0 truncate">{c.example}</span>
              </div>
            </StaggerItem>
          ))}
          <StaggerItem className="relative flex min-w-0 items-center border-b border-line p-6 sm:p-8 lg:col-span-2">
            <h3 className="text-[17px] font-medium text-ink">Plus a second opinion from Claude</h3>
          </StaggerItem>
        </Stagger>
      </Section>

      {/* ── How it works ─────────────────────────────────────── */}
      <Section id="how" className="grid scroll-mt-24 gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <Reveal>
          <h2 className={H2}>From “is this safe?” to fixed in a minute.</h2>
          <Stagger as="ol" gap={0.12} delay={0.15} className="mt-10 space-y-0 border-l border-line">
            {["Paste your repo", "We check it", "Fix with one paste"].map((t, i) => (
              <StaggerItem as="li" key={t} className="relative pb-6 pl-8 last:pb-0">
                <span className="absolute top-0.5 -left-[9px] flex h-[17px] w-[17px] items-center justify-center rounded-full border border-line-2 bg-canvas font-mono text-[9px] text-ink-3">{i + 1}</span>
                <h3 className="text-[15px] font-medium text-ink">{t}</h3>
              </StaggerItem>
            ))}
          </Stagger>
        </Reveal>
        <ScanTerminal />
      </Section>

      {/* ── Fix prompt showcase ──────────────────────────────── */}
      <Section className="grid gap-12 px-6 py-20 sm:px-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <Reveal y={20} className="window order-2 lg:order-1">
          <div className="border-b border-line p-5">
            <SeverityTag severity="high" />
            <h3 className="mt-3 text-[16px] font-medium text-ink">Logged-in users can see other people’s invoices by changing an ID</h3>
            <p className="mt-1 font-mono text-[11.5px] text-ink-4">app/api/invoices/[id]/route.ts · line 7</p>
          </div>
          <div className="p-5">
            <div className="rounded-xl border border-line bg-panel-2">
              <div className="flex justify-end border-b border-line px-3.5 py-2">
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
        </Reveal>
        <Reveal delay={0.1} className="order-1 lg:order-2">
          <h2 className={H2}>Your AI wrote the bug. <span className="text-ink-4">Let it write the fix.</span></h2>
        </Reveal>
      </Section>

      {/* ── Privacy ─────────────────────────────────────────── */}
      <Section id="privacy" className="grid scroll-mt-24 gap-10 px-6 py-20 sm:px-10 lg:grid-cols-[1fr_1.4fr]">
        <Reveal><h2 className={H2}>Your code stays yours.</h2></Reveal>
        <Stagger gap={0.08} className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2">
          {["Never executed", "Deleted after scanning", "Findings only", "Read-only access"].map((t) => (
            <StaggerItem key={t} className="border-r border-b border-line p-6 text-[15px] font-medium text-ink">{t}</StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* ── Pricing teaser ──────────────────────────────────── */}
      <Section className="px-6 py-20 sm:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <h2 className={H2}>Start free. <span className="text-ink-4">Pay for the fixes.</span></h2>
          <Link href="/pricing" className="btn-ghost self-start sm:self-auto">Compare plans <ArrowRight /></Link>
        </div>
        <Stagger gap={0.08} className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          {[["Free", "$0"], ["Repo Pass", "$29"], ["Pro", "$49/mo"]].map(([n, p]) => (
            <StaggerItem key={n} className="bg-panel p-6">
              <p className="text-[15px] font-medium text-ink-2">{n}</p>
              <p className="mt-3 text-3xl font-medium tracking-tight text-ink">{p}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <Section id="faq" className="grid scroll-mt-24 gap-10 px-6 py-20 sm:px-10 lg:grid-cols-[1fr_1.6fr]">
        <h2 className={H2}>Questions</h2>
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
        <Reveal className="relative">
          <h2 className="display text-[36px] sm:text-[52px]">Check it before you launch it.</h2>
          <a href="#scan" className="btn-accent mt-9 !h-11 !px-5">Scan my app <ArrowRight /></a>
        </Reveal>
      </Section>
    </div>
  );
}
