import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import { apiGet } from '@/lib/api';
import { humanise } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Paginated, ProductCard as ProductCardData } from '@/lib/types';
import { getStore } from '../layout';

export const metadata = { title: 'Jewellery' };

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price, low to high' },
  { value: 'price_desc', label: 'Price, high to low' },
  { value: 'name', label: 'Name' },
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Rebuild the current query string with one parameter changed. */
function withParam(params: SearchParams, key: string, value: string | undefined): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const single = Array.isArray(v) ? v[0] : v;
    if (single !== undefined && k !== 'page') next.set(k, single);
  }
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  const query = next.toString();
  return query ? `?${query}` : '';
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ storeSlug }, search] = await Promise.all([params, searchParams]);
  const storeHref = `/s/${storeSlug}`;

  const category = one(search, 'category');
  const sort = one(search, 'sort') ?? 'newest';
  const page = Number(one(search, 'page') ?? '1');

  const [store, result] = await Promise.all([
    getStore(storeSlug),
    apiGet<Paginated<ProductCardData>>('/storefront/products', {
      storeSlug,
      revalidate: 30,
      query: { category, sort, page, perPage: 12 },
    }),
  ]);

  const activeCategory = store.categories.find((c) => c.slug === category);
  const categories = store.categories.filter((c) => c.productCount > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="border-b border-line pb-6">
        <p className="eyebrow">{store.name}</p>
        <h1 className="mt-2 text-3xl">{activeCategory?.name ?? 'All jewellery'}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {result.meta.total === 0
            ? 'Nothing here yet.'
            : `${result.meta.total} ${result.meta.total === 1 ? 'piece' : 'pieces'}`}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4 py-5">
        <nav className="flex flex-wrap items-center gap-2">
          <Link
            href={`${storeHref}/products${withParam(search, 'category', undefined)}`}
            className={cn(
              'border px-3 py-1.5 text-[13px] transition-colors',
              category === undefined
                ? 'border-gold bg-gold-wash text-gold-deep'
                : 'border-line text-ink-soft hover:border-gold hover:text-gold-deep',
            )}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`${storeHref}/products${withParam(search, 'category', c.slug)}`}
              className={cn(
                'border px-3 py-1.5 text-[13px] transition-colors',
                category === c.slug
                  ? 'border-gold bg-gold-wash text-gold-deep'
                  : 'border-line text-ink-soft hover:border-gold hover:text-gold-deep',
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <nav className="flex items-center gap-3 text-[13px]">
          <span className="eyebrow">Sort</span>
          {SORTS.map((option) => (
            <Link
              key={option.value}
              href={`${storeHref}/products${withParam(search, 'sort', option.value)}`}
              className={cn(
                'transition-colors',
                sort === option.value ? 'text-gold-deep' : 'text-ink-soft hover:text-ink',
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {result.items.length === 0 ? (
        <p className="border border-line bg-parchment-deep p-8 text-center text-sm text-ink-soft">
          No pieces match this filter.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {result.items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              storeHref={storeHref}
              currency={store.currency}
              currencySymbol={store.currencySymbol}
            />
          ))}
        </div>
      )}

      {result.meta.totalPages > 1 && (
        <nav className="mt-12 flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: result.meta.totalPages }, (_, index) => index + 1).map((n) => (
            <Link
              key={n}
              href={`${storeHref}/products${withParam(search, 'page', String(n))}`}
              className={cn(
                'numeric border px-3 py-1.5 transition-colors',
                n === result.meta.page
                  ? 'border-gold bg-gold-wash text-gold-deep'
                  : 'border-line text-ink-soft hover:border-gold',
              )}
            >
              {n}
            </Link>
          ))}
        </nav>
      )}

      <p className="mt-10 text-center text-xs text-ink-faint">
        Showing {humanise(sort).toLowerCase()} first.
      </p>
    </main>
  );
}
