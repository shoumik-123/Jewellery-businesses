import Link from 'next/link';

export default function StoreNotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-3xl">Nothing here</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        This store or product is not published. If you expected to find it, the store may still be a
        draft, or the address may be mistyped.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block border border-line px-5 py-2.5 text-sm text-ink transition-colors hover:border-gold hover:text-gold-deep"
      >
        Back to JewelleryHub
      </Link>
    </main>
  );
}
