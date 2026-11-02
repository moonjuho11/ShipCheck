import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="bg-grid fade-edges absolute inset-0" />
      <div className="relative mx-auto max-w-xl px-5 py-32 text-center">
        <p className="text-[13px] text-ink-4">Error 404</p>
        <h1 className="headline mt-4 text-[36px]">Nothing to scan here.</h1>
        <p className="mt-3 text-ink-3">This page may have moved, or you might need to sign in with the account that owns it.</p>
        <Link href="/" className="btn-white mt-8">Back home</Link>
      </div>
    </div>
  );
}
