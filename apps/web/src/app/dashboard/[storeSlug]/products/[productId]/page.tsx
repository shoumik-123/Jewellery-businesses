import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Archive, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { humanise } from '@/lib/format';
import { apiAuthed } from '@/lib/session';
import { can, requireStore, STORE_PERMISSIONS } from '@/lib/store-access';
import type { CatalogueMeta, ProductEdit } from '@/lib/types';
import { ProductForm } from '../product-form';

export const metadata = { title: 'Edit a piece' };

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string; productId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { storeSlug, productId } = await params;
  const { created } = await searchParams;
  const { store } = await requireStore(storeSlug, `/dashboard/${storeSlug}/products/${productId}`);

  if (!can(store, STORE_PERMISSIONS.PRODUCT_READ)) notFound();

  const [product, meta] = await Promise.all([
    apiAuthed<ProductEdit>(`/stores/${store.storeId}/products/${productId}`),
    apiAuthed<CatalogueMeta>(`/stores/${store.storeId}/products/meta`),
  ]);

  // A product id from another shop answers 404 at the API, and that is the
  // answer shown here too - the same page a product that never existed gets.
  if (!product.ok && product.status === 404) notFound();

  if (!product.ok || !meta.ok) {
    const failure = product.ok ? meta : product;
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="border border-line bg-parchment-deep p-5 text-sm text-ink">
          Could not load the piece. {failure.ok ? '' : failure.message}
        </p>
      </main>
    );
  }

  const piece = product.data;
  const writer = can(store, STORE_PERMISSIONS.PRODUCT_WRITE);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {created === '1' && (
        <p className="mb-6 border border-gold/50 bg-gold-wash p-3 text-sm text-gold-deep">
          Created. It is {piece.status === 'ACTIVE' ? 'live on the storefront' : 'saved as a draft'}
          .
        </p>
      )}

      <p className="eyebrow">{store.name}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">{piece.name}</h1>
          <p className="mt-1 font-mono text-xs text-ink-faint">
            {piece.sku} · updated {new Date(piece.updatedAt).toLocaleString('en-GB')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={piece.status === 'ACTIVE' ? 'gold' : 'outline'}>
            {humanise(piece.status)}
          </Badge>
          {piece.status === 'ACTIVE' && (
            <Link
              href={`/s/${store.slug}/products/${piece.slug}`}
              className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-gold-deep"
            >
              View on the shop
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
          )}
        </div>
      </div>

      {piece.archived && (
        <p className="mt-6 flex items-start gap-2 border border-line bg-parchment-deep p-3 text-sm text-ink-soft">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" strokeWidth={1.5} />
          Archived, so it is off the storefront. Set the status back to Active to bring it back —
          nothing was deleted.
        </p>
      )}

      <ProductForm
        mode="edit"
        storeId={store.storeId}
        storeSlug={store.slug}
        meta={meta.data}
        product={piece}
        canWrite={writer}
      />
    </main>
  );
}
