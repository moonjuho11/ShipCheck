"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GitHubIcon, Kbd } from "./ui";

interface Props {
  signedIn: boolean;
  hasPrivateAccess: boolean;
  initialRepo?: string;
  initialSite?: string;
  autostart?: boolean;
  compact?: boolean;
}

type Problem = { message: string; action?: { label: string; href: string } };

const CHECKS = ["Secrets", "Database", "Login", "Input", "Packages", "Live site", "Launch basics"];

export function ScanForm({ signedIn, hasPrivateAccess, initialRepo = "", initialSite = "", autostart, compact }: Props) {
  const router = useRouter();
  const [repo, setRepo] = useState(initialRepo);
  const [site, setSite] = useState(initialSite);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const started = useRef(false);
  const repoRef = useRef<HTMLInputElement>(null);

  const returnTo = () => `/?repo=${encodeURIComponent(repo)}&site=${encodeURIComponent(site)}&autostart=1`;
  const login = (scope = "") => `${window.location.origin}/api/auth/github?${scope}next=${encodeURIComponent(returnTo())}`;

  async function submit() {
    setProblem(null);
    if (!repo.trim()) { setProblem({ message: "Paste the link to your GitHub repository first." }); repoRef.current?.focus(); return; }
    if (!signedIn) { window.location.href = login(); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repoUrl: repo, siteUrl: site || null }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { router.push(`/scans/${data.id}`); return; }
      if (data.code === "login_required") { window.location.href = login(); return; }
      if (data.code === "needs_private_access") setProblem({ message: data.error, action: { label: "Connect private repos", href: login("scope=repo&") } });
      else if (data.code === "upgrade_required") setProblem({ message: data.error, action: { label: "See plans", href: "/pricing" } });
      else setProblem({ message: data.error || "Something went wrong. Please try again." });
    } catch {
      setProblem({ message: "We couldn't reach ShipCheck. Check your connection and try again." });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (autostart && signedIn && initialRepo && !started.current) {
      started.current = true;
      window.history.replaceState(null, "", "/");
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="window w-full text-left" aria-label="Start a safety scan">
      <label className={`flex items-center gap-3 px-4 ${compact ? "py-3" : "py-4"}`}>
        <GitHubIcon className="h-5 w-5 shrink-0 text-ink-3" />
        <span className="sr-only">GitHub repository</span>
        <input
          ref={repoRef} name="repo" autoComplete="off" spellCheck={false} required
          className={`min-w-0 flex-1 bg-transparent font-mono text-ink placeholder:text-ink-4 focus:outline-none ${compact ? "text-[14px]" : "text-[15px] sm:text-[17px]"}`}
          placeholder="github.com/you/your-app" value={repo} onChange={(e) => setRepo(e.target.value)}
        />
        <span className="hidden items-center gap-1 sm:flex"><Kbd>↵</Kbd></span>
      </label>
      <label className="flex items-center gap-3 border-t border-line px-4 py-2.5">
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><circle cx="8" cy="8" r="6.2" /><path d="M1.8 8h12.4M8 1.8c1.8 2 1.8 10.4 0 12.4M8 1.8c-1.8 2-1.8 10.4 0 12.4" /></svg>
        <span className="label-mono shrink-0 !text-[10px]">Live site</span>
        <input
          name="site" autoComplete="off" spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-ink-2 placeholder:text-ink-4 focus:outline-none"
          placeholder="optional — your-app.lovable.app" value={site} onChange={(e) => setSite(e.target.value)}
        />
      </label>
      {problem && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-high/[0.06] px-4 py-2.5 text-[13px] text-[#ffc89a]">
          <span>{problem.message}</span>
          {problem.action && <a href={problem.action.href} className="font-medium text-ink underline decoration-ink-4 underline-offset-4 hover:decoration-ink">{problem.action.label} →</a>}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line bg-black/20 px-3 py-2.5">
        <div className="hidden min-w-0 items-center gap-1.5 overflow-hidden md:flex">
          {CHECKS.slice(0, compact ? 3 : 5).map((c) => (
            <span key={c} className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] whitespace-nowrap text-ink-3">
              <span className="h-1 w-1 rounded-full bg-ink-4" />{c}
            </span>
          ))}
          <span className="px-1 text-[11px] whitespace-nowrap text-ink-4">+{CHECKS.length - (compact ? 3 : 5)} more</span>
        </div>
        <p className="text-[11px] text-ink-4 md:hidden">
          {signedIn ? (hasPrivateAccess ? "Public & private repos" : "Public repos") : "Sign in with GitHub to scan"}
        </p>
        <button type="submit" disabled={busy} className="btn-signal !h-9 shrink-0 !px-4">
          {busy ? <><Spinner /> Starting…</> : <>Scan my app <span className="rounded bg-black/15 px-1 font-mono text-[11px]">↵</span></>}
        </button>
      </div>
      {!compact && signedIn && !hasPrivateAccess && (
        <div className="border-t border-line px-4 py-2 text-[12px] text-ink-4">
          Private repo? <a className="text-ink-3 underline decoration-ink-4 underline-offset-4 hover:text-ink" href="/api/auth/github?scope=repo&next=/">Connect private repo access</a>
        </div>
      )}
    </form>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
