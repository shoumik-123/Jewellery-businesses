import Link from 'next/link';
import { ArrowRight, Store as StoreIcon, TriangleAlert } from 'lucide-react';
import { apiGet } from '@/lib/api';
import type { StoreDirectoryEntry } from '@/lib/types';

export const metadata = {
  title: 'JewelleryHub — online stores for jewellery businesses',
};

async function loadStores(): Promise<{ items: StoreDirectoryEntry[] } | null> {
  try {
    return await apiGet<{ items: StoreDirectoryEntry[] }>('/stores', { revalidate: 30 });
  } catch {
    // The API being down is a condition to show, not a page to crash on.
    return null;
  }
}

export default async function LandingPage() {
  const directory = await loadStores();

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="eyebrow">Multi-tenant commerce</p>
      <h1 className="mt-3 max-w-2xl text-4xl leading-tight sm:text-5xl">
        Online stores for jewellery businesses.
      </h1>
      <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
        Each shop gets its own storefront, catalogue and orders — with metal purity, gross and net
        weight, hallmarking, making charge and wastage treated as first-class, not squeezed into a
        generic product form.
      </p>

      <section className="mt-16">
        <h2 className="text-xl">Live stores</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Served from the database, each isolated from the others at the row level.
        </p>

        {directory === null ? (
          <div className="mt-6 flex items-start gap-3 border border-line bg-parchment-deep p-5 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" strokeWidth={1.5} />
            <div>
              <p className="text-ink">The API is not reachable.</p>
              <p className="mt-1 text-ink-soft">
                Start it with <code className="font-mono text-xs">pnpm dev:api</code>, and make sure
                the database is running (<code className="font-mono text-xs">pnpm db:up</code>
                ).
              </p>
            </div>
          </div>
        ) : directory.items.length === 0 ? (
          <div className="mt-6 border border-line bg-parchment-deep p-5 text-sm text-ink-soft">
            No published stores yet. Seed the demo data with{' '}
            <code className="font-mono text-xs">pnpm db:seed</code>.
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {directory.items.map((store) => (
              <li key={store.slug}>
                <Link
                  href={`/s/${store.slug}`}
                  className="group flex h-full flex-col justify-between border border-line bg-white/50 p-6 transition-colors hover:border-gold"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <StoreIcon className="h-4 w-4 text-gold-deep" strokeWidth={1.5} />
                      <span className="font-display text-xl text-ink">{store.name}</span>
                    </div>
                    {store.tagline && <p className="mt-2 text-sm text-ink-soft">{store.tagline}</p>}
                  </div>

                  <div className="mt-6 flex items-center justify-between text-xs text-ink-faint">
                    <span>{store.city ?? '—'}</span>
                    <span className="flex items-center gap-1 text-ink-soft group-hover:text-gold-deep">
                      Visit store
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-16 border-t border-line pt-8 text-sm text-ink-soft">
        <p className="eyebrow mb-3">Addressing</p>
        <p className="max-w-2xl leading-relaxed">
          In production a store lives at its own subdomain. That works locally too — browsers
          resolve <code className="font-mono text-xs">*.localhost</code> without a hosts entry, so{' '}
          <a
            className="text-gold-deep underline underline-offset-4"
            href="http://aurum-jewellers.localhost:3000"
          >
            aurum-jewellers.localhost:3000
          </a>{' '}
          serves the same pages as the <code className="font-mono text-xs">/s/</code> links above.
        </p>
      </section>
    </main>
  );
}
