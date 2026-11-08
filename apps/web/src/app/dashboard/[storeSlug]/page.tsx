import Link from 'next/link';
import { Boxes, CircleCheck, FileText, Plus, Archive, ShieldAlert } from 'lucide-react';
import { apiAuthed } from '@/lib/session';
import { can, requireStore, STORE_PERMISSIONS } from '@/lib/store-access';
import type { CatalogueMeta } from '@/lib/types';

export const metadata = { title: 'Shop dashboard' };

/**
 * One shop's overview.
 *
 * The numbers come from the API, not from a count kept in the page, so what it
 * shows is the catalogue as it actually is.
 */
export default async function StoreDashboardPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await requireStore(storeSlug, `/dashboard/${storeSlug}`);

  if (!can(store, STORE_PERMISSIONS.PRODUCT_READ)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="flex items-start gap-3 border border-line bg-parchment-deep p-5 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" strokeWidth={1.5} />
          <span>
            <span className="block text-ink">Your role does not include the catalogue.</span>
            <span className="mt-1 block text-ink-soft">
              {store.roleName} cannot read products in {store.name}. The shop owner can widen this.
            </span>
          </span>
        </p>
      </main>
    );
  }

  const result = await apiAuthed<CatalogueMeta>(`/stores/${store.storeId}/products/meta`);

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="border border-line bg-parchment-deep p-5 text-sm text-ink">
          Could not load the catalogue. {result.message}
        </p>
      </main>
    );
  }

  const { counts, categories, brands } = result.data;
  const writer = can(store, STORE_PERMISSIONS.PRODUCT_WRITE);

  const tiles = [
    { label: 'All pieces', value: counts.total, icon: Boxes, href: '' },
    { label: 'On the storefront', value: counts.active, icon: CircleCheck, href: '?status=ACTIVE' },
    { label: 'Drafts', value: counts.draft, icon: FileText, href: '?status=DRAFT' },
    {
      label: 'Archived',
      value: counts.archived,
      icon: Archive,
      href: '?status=ARCHIVED&includeArchived=true',
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 className="mt-2 text-3xl">{store.name}</h1>
        </div>
        {writer && (
          <Link
            href={`/dashboard/${store.slug}/products/new`}
            className="inline-flex items-center gap-1.5 bg-ink px-4 py-2 text-sm text-parchment hover:bg-gold-deep"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add a piece
          </Link>
        )}
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={`/dashboard/${store.slug}/products${tile.href}`}
            className="border border-line bg-white/50 p-5 hover:border-gold"
          >
            <tile.icon className="h-4 w-4 text-gold-deep" strokeWidth={1.5} />
            <p className="numeric mt-3 text-3xl text-ink">{tile.value}</p>
            <p className="mt-1 text-xs text-ink-soft">{tile.label}</p>
          </Link>
        ))}
      </section>

      <section className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="border border-line bg-white/50 p-5">
          <p className="eyebrow">Categories</p>
          {categories.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              None yet. A piece can be saved without one.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <li
                  key={category.id}
                  className="border border-line px-2 py-0.5 text-[11px] text-ink-soft"
                >
                  {category.parentName ? `${category.parentName} › ` : ''}
                  {category.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-line bg-white/50 p-5">
          <p className="eyebrow">Brands</p>
          {brands.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              None yet. Brands are optional for an own-make catalogue.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {brands.map((brand) => (
                <li
                  key={brand.id}
                  className="border border-line px-2 py-0.5 text-[11px] text-ink-soft"
                >
                  {brand.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-12 border-t border-line pt-6">
        <p className="eyebrow mb-2">Not here yet</p>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Variants and sizes, stock per location, and orders are the next slices. Adding and editing
          categories and brands is still done in the database; a piece can be saved without either.
          Images are given as addresses — uploading needs a storage provider configured, and a
          button that quietly stored nothing would be worse than not having one.
        </p>
      </section>
    </main>
  );
}
