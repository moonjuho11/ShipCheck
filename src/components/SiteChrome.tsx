import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { Wordmark } from "./Logo";
import { GitHubIcon } from "./ui";

export async function SiteHeader() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <header className="sticky top-0 z-40 px-3 pt-3">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl border border-line bg-panel/70 pr-2 pl-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_10px_30px_-10px_rgb(0_0_0/0.8)] backdrop-blur-xl">
        <Link href="/" aria-label="ShipCheck home"><Wordmark /></Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/#checks" className="hidden rounded-lg px-3 py-1.5 text-ink-3 transition hover:text-ink md:block">What we check</Link>
          <Link href="/#privacy" className="hidden rounded-lg px-3 py-1.5 text-ink-3 transition hover:text-ink md:block">Privacy</Link>
          <Link href="/pricing" className="rounded-lg px-3 py-1.5 text-ink-3 transition hover:text-ink">Pricing</Link>
          <span className="mx-2 hidden h-4 w-px bg-line-2 sm:block" />
          {user ? (
            <>
              <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-ink-2 transition hover:text-ink">My scans</Link>
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
            <a href="/api/auth/github?next=/dashboard" className="btn-white !h-9 !px-3.5">
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
    <footer className="relative mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 border-x border-line px-6 py-12 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-ink-3">The safety check for apps built with AI. Find the holes before your users do.</p>
        </div>
        <FooterCol title="Product" links={[["What we check", "/#checks"], ["How it works", "/#how"], ["Pricing", "/pricing"]]} />
        <FooterCol title="Trust" links={[["Privacy", "/#privacy"], ["FAQ", "/#faq"]]} />
        <FooterCol title="Account" links={[["My scans", "/dashboard"], ["Sign in", "/api/auth/github?next=/dashboard"]]} />
      </div>
      <div className="mx-auto flex max-w-6xl items-center justify-between border-x border-t border-line px-6 py-4">
        <span className="eyebrow">© {new Date().getFullYear()} ShipCheck</span>
        <span className="eyebrow">Your code is never stored</span>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([l, h]) => <li key={l}><Link href={h} className="text-ink-3 transition hover:text-ink">{l}</Link></li>)}
      </ul>
    </div>
  );
}
