import Link from 'next/link';
import type { ReactNode } from 'react';
import { ExternalLink, Store as StoreIcon } from 'lucide-react';
import { SignOutButton } from '@/components/sign-out-button';
import { requireStore } from '@/lib/store-access';

/**
 * The shell every page of one shop's dashboard sits in.
 *
 * It resolves the `[storeSlug]` once, which also means an address for a shop
 * the signed-in person does not belong to stops here with a 404 rather than
 * reaching a page that would have asked the API and rendered an error.
 */
export default async function StoreDashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await requireStore(storeSlug, `/dashboard/${storeSlug}`);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <StoreIcon className="h-4 w-4 text-gold-deep" strokeWidth={1.5} />
            <div>
              <Link href={`/dashboard/${store.slug}`} className="font-display text-lg text-ink">
                {store.name}
              </Link>
              <p className="text-[11px] text-ink-faint">
                {store.roleName}
                {store.isOwner ? ' · Owner' : ''}
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-5 text-sm">
            <Link
              href={`/dashboard/${store.slug}/products`}
              className="text-ink-soft hover:text-ink"
            >
              Products
            </Link>
            <Link
              href={`/s/${store.slug}`}
              className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink"
            >
              Storefront
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
            <Link href="/dashboard" className="text-ink-soft hover:text-ink">
              All shops
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
