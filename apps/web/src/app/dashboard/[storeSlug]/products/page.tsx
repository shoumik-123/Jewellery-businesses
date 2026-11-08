import Image from 'next/image';
import Link from 'next/link';
import { ImageOff, Pencil, Plus, Search, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { price as formatPrice, humanise, weight } from '@/lib/format';
import { apiAuthed } from '@/lib/session';
import { can, requireStore, STORE_PERMISSIONS } from '@/lib/store-access';
import type { CatalogueMeta, Paginated, ProductRow } from '@/lib/types';

export const metadata = { title: 'Products' };

const STATUS_TONE: Record<string, 'gold' | 'silver' | 'outline'> = {
  ACTIVE: 'gold',
  DRAFT: 'outline',
  ARCHIVED: 'silver',
};

/**
 * The shop's working catalogue.
 *
 * Filtering is a plain GET form, so the state of the list lives in the URL:
 * it can be bookmarked, shared with a colleague, and reloaded without a client
 * bundle. Nothing here needs JavaScript except the archive button.
 */
export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeSlug } = await params;
  const query = await searchParams;
  const { store } = await requireStore(storeSlug, `/dashboard/${storeSlug}/products`);

  if (!can(store, STORE_PERMISSIONS.PRODUCT_READ)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="flex items-start gap-3 border border-line bg-parchment-deep p-5 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" strokeWidth={1.5} />
          <span className="text-ink">{store.roleName} cannot read this shop&rsquo;s products.</span>
        </p>
      </main>
    );
  }

  const first = (key: string): string => {
    const value = query[key];
    return (Array.isArray(value) ? value[0] : value) ?? '';
  };

  const search = new URLSearchParams();
  for (const key of ['q', 'status', 'type', 'metal', 'categoryId', 'sort', 'page']) {
    const value = first(key);
    if (value) search.set(key, value);
  }
  // Asking for archived explicitly, or filtering to archived, both show them.
  if (first('includeArchived') === 'true' || first('status') === 'ARCHIVED') {
    search.set('includeArchived', 'true');
  }

  const [listResult, metaResult] = await Promise.all([
    apiAuthed<Paginated<ProductRow>>(`/stores/${store.storeId}/products?${search.toString()}`),
    apiAuthed<CatalogueMeta>(`/stores/${store.storeId}/products/meta`),
  ]);

  if (!listResult.ok || !metaResult.ok) {
    const failure = listResult.ok ? metaResult : listResult;
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="border border-line bg-parchment-deep p-5 text-sm text-ink">
          Could not load the catalogue. {failure.ok ? '' : failure.message}
        </p>
      </main>
    );
  }

  const { items, meta } = listResult.data;
  const { options, categories, store: storeMeta } = metaResult.data;
  const writer = can(store, STORE_PERMISSIONS.PRODUCT_WRITE);

  const pageHref = (page: number): string => {
    const next = new URLSearchParams(search);
    next.set('page', String(page));
    return `/dashboard/${store.slug}/products?${next.toString()}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1 className="mt-2 text-3xl">
            Products <span className="numeric text-xl text-ink-faint">({meta.total})</span>
          </h1>
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

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 border-y border-line py-4">
        <div className="grow sm:grow-0">
          <label htmlFor="q" className="eyebrow mb-1.5 block">
            Search
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
              strokeWidth={1.5}
            />
            <input
              id="q"
              name="q"
              defaultValue={first('q')}
              placeholder="Name, SKU, barcode or tag"
              className="w-full border border-line bg-white/60 py-2 pr-3 pl-8 text-sm text-ink outline-none focus:border-gold sm:w-64"
            />
          </div>
        </div>

        <Select id="status" label="Status" value={first('status')} options={options.status} />
        <Select id="type" label="Type" value={first('type')} options={options.jewelleryType} />
        <Select id="metal" label="Metal" value={first('metal')} options={options.metalType} />
        <div>
          <label htmlFor="categoryId" className="eyebrow mb-1.5 block">
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={first('categoryId')}
            className="border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-gold"
          >
            <option value="">Any</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <Select
          id="sort"
          label="Sort"
          value={first('sort')}
          options={['updated', 'newest', 'oldest', 'name', 'price_asc', 'price_desc']}
          anyLabel={null}
        />

        <button
          type="submit"
          className="border border-line px-4 py-2 text-sm text-ink hover:border-gold hover:text-gold-deep"
        >
          Apply
        </button>
        {search.toString() !== '' && (
          <Link
            href={`/dashboard/${store.slug}/products`}
            className="py-2 text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Clear
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <p className="mt-8 border border-line bg-parchment-deep p-6 text-sm text-ink-soft">
          {search.toString() === ''
            ? 'No pieces yet. Add the first one.'
            : 'Nothing matches those filters.'}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="eyebrow py-2 pr-4 font-normal">Piece</th>
                <th className="eyebrow py-2 pr-4 font-normal">Metal</th>
                <th className="eyebrow py-2 pr-4 text-right font-normal">Weight</th>
                <th className="eyebrow py-2 pr-4 text-right font-normal">Price</th>
                <th className="eyebrow py-2 pr-4 font-normal">Status</th>
                <th className="eyebrow py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line/60 align-top">
                  <td className="py-3 pr-4">
                    <div className="flex items-start gap-3">
                      <span className="relative block h-12 w-12 shrink-0 overflow-hidden border border-line bg-parchment-deep">
                        {item.primaryImage ? (
                          <Image
                            src={item.primaryImage}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <ImageOff
                            className="absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-ink-faint"
                            strokeWidth={1.5}
                          />
                        )}
                      </span>
                      <span>
                        <Link
                          href={`/dashboard/${store.slug}/products/${item.id}`}
                          className="block text-ink hover:text-gold-deep"
                        >
                          {item.name}
                        </Link>
                        <span className="block font-mono text-[11px] text-ink-faint">
                          {item.sku}
                          {item.categoryName ? ` · ${item.categoryName}` : ''}
                          {item.variantCount > 0 ? ` · ${item.variantCount} variants` : ''}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-ink-soft">
                    {humanise(item.metalType)}
                    {item.metalPurity ? ` · ${item.metalPurity}` : ''}
                    <span className="block text-[11px] text-ink-faint">
                      {humanise(item.jewelleryType)}
                    </span>
                  </td>
                  <td className="numeric py-3 pr-4 text-right text-ink-soft">
                    {weight(item.netWeightG) ?? '—'}
                  </td>
                  <td className="numeric py-3 pr-4 text-right">
                    <span className={item.salePrice ? 'text-ink-faint line-through' : 'text-ink'}>
                      {formatPrice(item.price, storeMeta.currency, storeMeta.currencySymbol)}
                    </span>
                    {item.salePrice && (
                      <span className="block text-gold-deep">
                        {formatPrice(item.salePrice, storeMeta.currency, storeMeta.currencySymbol)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={STATUS_TONE[item.status] ?? 'outline'}>
                      {humanise(item.status)}
                    </Badge>
                    {item.isFeatured && (
                      <span className="mt-1 block text-[11px] text-ink-faint">Featured</span>
                    )}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/dashboard/${store.slug}/products/${item.id}`}
                      className="inline-flex items-center gap-1 text-ink-soft hover:text-gold-deep"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {writer ? 'Edit' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta.totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm">
          {meta.page > 1 ? (
            <Link href={pageHref(meta.page - 1)} className="text-ink-soft hover:text-ink">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="numeric text-ink-faint">
            Page {meta.page} of {meta.totalPages}
          </span>
          {meta.page < meta.totalPages ? (
            <Link href={pageHref(meta.page + 1)} className="text-ink-soft hover:text-ink">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}

/** A labelled select whose options are the API's own enum list. */
function Select({
  id,
  label,
  value,
  options,
  anyLabel = 'Any',
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  anyLabel?: string | null;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={value}
        className="border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-gold"
      >
        {anyLabel !== null && <option value="">{anyLabel}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {humanise(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
