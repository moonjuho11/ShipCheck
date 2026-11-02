import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutButton } from "@/components/CheckoutButton";
import { BracketLabel, CheckIcon, Section } from "@/components/ui";
import { getEntitlements } from "@/lib/plans";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pricing" };

const TIERS = [
  { key: "free", name: "Free", price: "$0", cadence: "", tagline: "See what’s wrong",
    features: ["1 scan per month", "Safety score and Production Ready check", "Every problem’s title and severity"] },
  { key: "repo", name: "Repo Pass", price: "$29", cadence: "one-time", tagline: "Fix one app before launch", highlight: true,
    features: ["Full report for one repo", "Plain-English explanation of every problem", "Copy-paste fix prompts for your AI agent", "5 rescans to confirm your fixes", "Shareable report link"] },
  { key: "pro", name: "Pro", price: "$49", cadence: "/ month", tagline: "Stay safe while you keep shipping",
    features: ["Unlimited scans, any repo", "Full reports with fix prompts", "Automatic check on every pull request", "Embeddable Production Ready badge", "Cancel anytime"] },
] as const;

const COMPARE: [string, string, string, string][] = [
  ["Scans", "1 / month", "6 for one repo", "Unlimited"],
  ["Safety score + verdict", "✓", "✓", "✓"],
  ["Problem titles", "✓", "✓", "✓"],
  ["Where it is (file + line)", "—", "✓", "✓"],
  ["Plain-English explanations", "—", "✓", "✓"],
  ["Copy-paste fix prompts", "—", "✓", "✓"],
  ["Public share link", "✓", "✓", "✓"],
  ["GitHub pull request checks", "—", "—", "✓"],
  ["Production Ready badge", "—", "—", "✓"],
];

export default async function Pricing() {
  const user = await getCurrentUser().catch(() => null);
  const ent = user ? await getEntitlements(user.id).catch(() => null) : null;

  return (
    <div>
      <div className="relative overflow-hidden">
        <div aria-hidden className="bg-grid fade-edges absolute inset-0" />
        <div className="relative mx-auto max-w-3xl px-5 pt-20 pb-14 text-center">
          <BracketLabel className="justify-center">Pricing</BracketLabel>
          <h1 className="display mt-6 text-[40px] sm:text-[56px]">Start free. <span className="text-ink-4">Pay for the fixes.</span></h1>
          <p className="mx-auto mt-5 max-w-md text-ink-3">Every plan includes the full scan. Paid plans unlock where each problem lives and how to fix it.</p>
        </div>
      </div>

      <Section className="grid gap-px bg-line lg:grid-cols-3">
        {TIERS.map((t) => (
          <div key={t.key} className={`relative flex flex-col bg-canvas p-7 sm:p-8 ${"highlight" in t ? "bg-panel" : ""}`}>
            {"highlight" in t && <span className="absolute top-7 right-7 rounded-full bg-signal/15 px-2 py-0.5 font-mono text-[10px] tracking-wider text-signal uppercase ring-1 ring-signal/30">Before launch</span>}
            <p className="label-mono">{t.name}</p>
            <p className="mt-1 text-sm text-ink-3">{t.tagline}</p>
            <p className="mt-6 flex items-baseline gap-2"><span className="text-5xl font-medium tracking-tighter text-ink">{t.price}</span><span className="font-mono text-xs text-ink-4">{t.cadence}</span></p>
            <ul className="mt-8 flex-1 space-y-3 text-[14px] text-ink-2">
              {t.features.map((f) => <li key={f} className="flex gap-2.5"><CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-signal" />{f}</li>)}
            </ul>
            <div className="mt-10">
              {t.key === "free" && <Link href="/#scan" className="btn-ghost w-full">Start a free scan</Link>}
              {t.key === "repo" && (user
                ? <Link href="/dashboard" className="btn-signal w-full">Pick a scanned repo to unlock</Link>
                : <a href="/api/auth/github?next=/" className="btn-signal w-full">Scan first, then unlock</a>)}
              {t.key === "pro" && (ent?.pro
                ? <form action="/api/billing/portal" method="post"><button className="btn-ghost w-full">Manage subscription</button></form>
                : <CheckoutButton plan="pro" signedIn={!!user} className="btn-white">Go Pro</CheckoutButton>)}
            </div>
          </div>
        ))}
      </Section>

      <Section className="px-5 py-16 sm:px-10">
        <BracketLabel>Compare</BracketLabel>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-line">
                <th className="py-3 font-normal text-ink-4" />
                {["Free", "Repo Pass", "Pro"].map((h) => <th key={h} className="label-mono py-3 !text-[10px] font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([f, ...v]) => (
                <tr key={f} className="border-b border-line">
                  <td className="py-3 pr-4 text-ink-2">{f}</td>
                  {v.map((x, i) => <td key={i} className={`py-3 font-mono text-[13px] ${x === "✓" ? "text-signal" : x === "—" ? "text-ink-4" : "text-ink-2"}`}>{x}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="label-mono mt-10 !text-[10px]">Payments by Stripe · Prices in USD · Failed scans never count</p>
      </Section>
    </div>
  );
}
