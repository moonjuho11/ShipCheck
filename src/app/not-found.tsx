import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-slate-900">We couldn’t find that page</h1>
      <p className="mt-2 text-slate-600">It may have been removed, or you might need to sign in with the account that owns it.</p>
      <Link href="/" className="btn-primary mt-6">Go home</Link>
    </div>
  );
}
