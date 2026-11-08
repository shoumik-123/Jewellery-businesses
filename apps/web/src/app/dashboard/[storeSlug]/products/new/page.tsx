import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { apiAuthed } from '@/lib/session';
import { can, requireStore, STORE_PERMISSIONS } from '@/lib/store-access';
import type { CatalogueMeta } from '@/lib/types';
import { ProductForm } from '../product-form';

export const metadata = { title: 'Add a piece' };

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await requireStore(storeSlug, `/dashboard/${storeSlug}/products/new`);

  // The API refuses the POST either way. This is so the person is told before
  // filling in forty fields, not after.
  if (!can(store, STORE_PERMISSIONS.PRODUCT_WRITE)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="flex items-start gap-3 border border-line bg-parchment-deep p-5 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" strokeWidth={1.5} />
          <span>
            <span className="block text-ink">{store.roleName} cannot add pieces.</span>
            <span className="mt-1 block text-ink-soft">
              Adding to the catalogue needs the <code className="font-mono">product:write</code>{' '}
              permission. The shop owner can grant it.
            </span>
          </span>
        </p>
        <Link
          href={`/dashboard/${store.slug}/products`}
          className="mt-6 inline-block text-sm text-gold-deep underline underline-offset-4"
        >
          Back to the catalogue
        </Link>
      </main>
    );
  }

  const meta = await apiAuthed<CatalogueMeta>(`/stores/${store.storeId}/products/meta`);
  if (!meta.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="border border-line bg-parchment-deep p-5 text-sm text-ink">
          Could not load the form. {meta.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="eyebrow">{store.name}</p>
      <h1 className="mt-2 text-3xl">Add a piece</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
        Only the name, SKU, type and price are required. A piece saved as a draft is not on the
        storefront until its status is Active.
      </p>

      <ProductForm
        mode="create"
        storeId={store.storeId}
        storeSlug={store.slug}
        meta={meta.data}
        product={null}
        canWrite
      />
    </main>
  );
}
