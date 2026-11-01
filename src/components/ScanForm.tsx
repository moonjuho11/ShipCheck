"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- OAuth & Stripe hops need full-page navigations to API routes */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Props {
  signedIn: boolean;
  hasPrivateAccess: boolean;
  initialRepo?: string;
  initialSite?: string;
  autostart?: boolean;
  compact?: boolean;
}

type Problem = { message: string; action?: { label: string; href?: string; onClick?: () => void } };

export function ScanForm({ signedIn, hasPrivateAccess, initialRepo = "", initialSite = "", autostart, compact }: Props) {
  const router = useRouter();
  const [repo, setRepo] = useState(initialRepo);
  const [site, setSite] = useState(initialSite);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const started = useRef(false);

  const returnTo = (extra = "") => `/?repo=${encodeURIComponent(repo)}&site=${encodeURIComponent(site)}&autostart=1${extra}`;

  async function submit() {
    setProblem(null);
    if (!repo.trim()) { setProblem({ message: "Paste the link to your GitHub repository first." }); return; }
    if (!signedIn) { window.location.href = `${window.location.origin}/api/auth/github?next=${encodeURIComponent(returnTo())}`; return; }
    setBusy(true);
    try {
      const res = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repoUrl: repo, siteUrl: site || null }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { router.push(`/scans/${data.id}`); return; }
      if (data.code === "login_required") { window.location.href = `${window.location.origin}/api/auth/github?next=${encodeURIComponent(returnTo())}`; return; }
      if (data.code === "needs_private_access") {
        setProblem({ message: data.error, action: { label: "Connect private repos", href: `/api/auth/github?scope=repo&next=${encodeURIComponent(returnTo())}` } });
      } else if (data.code === "upgrade_required") {
        setProblem({ message: data.error, action: { label: "See plans", href: "/pricing" } });
      } else {
        setProblem({ message: data.error || "Something went wrong. Please try again." });
      }
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
    <form
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      className={`card w-full text-left ${compact ? "p-4" : "p-4 sm:p-6"}`}
      aria-label="Start a safety scan"
    >
      <label htmlFor="repo" className="block text-sm font-semibold text-slate-800">GitHub repository</label>
      <input
        id="repo" name="repo" className="input mt-1.5 font-mono text-[15px]" autoComplete="off" spellCheck={false}
        placeholder="github.com/you/your-app" value={repo} onChange={(e) => setRepo(e.target.value)} required
      />
      <label htmlFor="site" className="mt-4 block text-sm font-semibold text-slate-800">
        Live website <span className="font-normal text-slate-500">(optional)</span>
      </label>
      <input
        id="site" name="site" className="input mt-1.5 font-mono text-[15px]" autoComplete="off" spellCheck={false}
        placeholder="your-app.lovable.app" value={site} onChange={(e) => setSite(e.target.value)}
      />
      <button type="submit" disabled={busy} className="btn-brand mt-5 w-full !py-3.5 !text-base">
        {busy ? <><Spinner /> Starting your scan…</> : <>Scan my app</>}
      </button>
      {problem && (
        <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{problem.message}</p>
          {problem.action?.href && <a href={problem.action.href} className="mt-2 inline-block font-semibold underline">{problem.action.label} →</a>}
        </div>
      )}
      <p className="mt-4 text-center text-xs text-slate-500">
        {signedIn
          ? hasPrivateAccess ? "Public and private repos supported." : <>Private repo? <a className="underline" href={`/api/auth/github?scope=repo&next=${encodeURIComponent("/")}`}>Connect private repo access</a>.</>
          : "You'll sign in with GitHub. We never run your code, and we delete it right after the scan."}
      </p>
    </form>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
