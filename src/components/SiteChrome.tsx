import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { Wordmark } from "./Logo";
import { GitHubIcon } from "./ui";

export async function SiteHeader() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="Seaproof home"><Wordmark /></Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/#checks" className="hidden rounded-lg px-3 py-1.5 text-ink-3 transition hover:text-ink md:block">What we check</Link>
          <Link href="/#privacy" className="hidden rounded-lg px-3 py-1.5 text-ink-3 transition hover:text-ink md:block">Privacy</Link>
          <Link href="/pricing" className="rounded-lg px-3 py-1.5 text-ink-3 transition hover:text-ink">Pricing</Link>
          <span className="mx-2 hidden h-4 w-px bg-line-2 sm:block" />
          {user ? (
            <>
              <Link href="/dashboard" prefetch={false} className="rounded-lg px-3 py-1.5 text-ink-2 transition hover:text-ink">My scans</Link>
              <form action="/api/auth/logout" method="post">
                <button className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-ink-3 transition hover:bg-white/5 hover:text-ink" title="Sign out">
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full ring-1 ring-line-2" />
                  ) : null}
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </>
          ) : (
            <a href="/api/auth/github?next=/dashboard" className="btn-white !h-8 !px-3">
              <GitHubIcon /> Sign in
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}

const FOOTER_LINKS: [string, string][] = [["What we check", "/#checks"], ["Privacy", "/#privacy"], ["Pricing", "/pricing"], ["FAQ", "/#faq"]];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 border-x border-line px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {FOOTER_LINKS.map(([l, h]) => <li key={l}><Link href={h} className="text-ink-3 transition hover:text-ink">{l}</Link></li>)}
        </ul>
        <span className="text-[13px] text-ink-4">© {new Date().getFullYear()} Seaproof</span>
      </div>
    </footer>
  );
}
