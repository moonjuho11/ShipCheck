import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative overflow-hidden">
      <div className="relative mx-auto max-w-xl px-5 py-32 text-center">
        <h1 className="headline text-[36px]">Nothing to scan here.</h1>
        <Link href="/" className="btn-white mt-8">Back home</Link>
      </div>
    </div>
  );
}
