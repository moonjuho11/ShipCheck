import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "./Logo";

export async function SiteHeader() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900">
          <Logo />
          <span className="text-lg">ShipCheck</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/pricing" className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">Pricing</Link>
          {user ? (
            <>
              <Link href="/dashboard" className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">My scans</Link>
              <form action="/api/auth/logout" method="post" className="flex items-center">
                <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-600 hover:bg-slate-100" title="Sign out">
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full ring-1 ring-slate-200" />
                  ) : null}
                  <span className="hidden font-medium sm:inline">Sign out</span>
                </button>
              </form>
            </>
          ) : (
            <a href="/api/auth/github?next=/dashboard" className="btn-primary !py-2">
              <GitHubIcon /> Sign in
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2"><Logo className="h-5 w-5" /> ShipCheck — launch with confidence.</div>
        <div className="flex gap-5">
          <Link href="/pricing" className="hover:text-slate-800">Pricing</Link>
          <Link href="/#privacy" className="hover:text-slate-800">Privacy</Link>
          <Link href="/#faq" className="hover:text-slate-800">FAQ</Link>
        </div>
      </div>
    </footer>
  );
}

export function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
