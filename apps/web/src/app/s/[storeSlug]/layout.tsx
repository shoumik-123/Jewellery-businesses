import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StoreFooter, StoreHeader } from '@/components/store-chrome';
import { ApiError, apiGet } from '@/lib/api';
import type { Store } from '@/lib/types';

/**
 * Every storefront page is wrapped by this, so the store is fetched once per
 * request and the chrome always matches the catalogue below it.
 *
 * The slug comes from the route segment Next matched, which the middleware
 * derived from the Host header. It is passed to the API as the store context;
 * the API then resolves and authorises it independently, and answers 404 for
 * anything that is not a published store. The frontend is not trusted to
 * decide which tenant it is looking at.
 */
export async function getStore(storeSlug: string): Promise<Store> {
  try {
    return await apiGet<Store>('/storefront/store', { storeSlug, revalidate: 60 });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}): Promise<Metadata> {
  const { storeSlug } = await params;
  try {
    const store = await getStore(storeSlug);
    return {
      title: { default: store.name, template: `%s · ${store.name}` },
      ...(store.tagline ? { description: store.tagline } : {}),
    };
  } catch {
    return { title: 'Store' };
  }
}

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await getStore(storeSlug);
  const href = `/s/${storeSlug}`;

  return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader store={store} href={href} />
      <div className="flex-1">{children}</div>
      <StoreFooter store={store} />
    </div>
  );
}
