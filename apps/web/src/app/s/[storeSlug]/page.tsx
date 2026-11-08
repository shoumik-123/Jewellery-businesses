import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ProductCard } from '@/components/product-card';
import { ButtonLink } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import type { HomePayload, ProductCard as ProductCardData } from '@/lib/types';
import { getStore } from './layout';

function Rail({
  title,
  description,
  products,
  storeHref,
  currency,
  currencySymbol,
  moreHref,
}: {
  title: string;
  description?: string;
  products: ProductCardData[];
  storeHref: string;
  currency: string;
  currencySymbol: string;
  moreHref?: string;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mt-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
        </div>
        {moreHref && (
          <Link
            href={moreHref}
            className="flex shrink-0 items-center gap-1 text-sm text-ink-soft hover:text-gold-deep"
          >
            See all
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            storeHref={storeHref}
            currency={currency}
            currencySymbol={currencySymbol}
          />
        ))}
      </div>
    </section>
  );
}

export default async function StoreHomePage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const storeHref = `/s/${storeSlug}`;

  const [store, home] = await Promise.all([
    getStore(storeSlug),
    apiGet<HomePayload>('/storefront/home', { storeSlug, revalidate: 60 }),
  ]);

  const categories = home.categories.filter((category) => category.productCount > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
      <section className="border-b border-line py-14 sm:py-20">
        <p className="eyebrow">{store.city ? `${store.city}, Bangladesh` : 'Bangladesh'}</p>
        <h1 className="mt-3 max-w-2xl text-4xl leading-tight sm:text-5xl">
          {store.tagline ?? store.name}
        </h1>
        {store.description && (
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            {store.description}
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={`${storeHref}/products`} size="lg">
            Browse the collection
          </ButtonLink>
          {store.phone && (
            <ButtonLink href={`tel:${store.phone}`} variant="outline" size="lg">
              Call the shop
            </ButtonLink>
          )}
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mt-14">
          <h2 className="text-2xl">Shop by category</h2>
          <ul className="mt-5 flex flex-wrap gap-2.5">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`${storeHref}/products?category=${category.slug}`}
                  className="inline-flex items-baseline gap-2 border border-line px-4 py-2 text-sm text-ink transition-colors hover:border-gold hover:text-gold-deep"
                >
                  {category.name}
                  <span className="numeric text-xs text-ink-faint">{category.productCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Rail
        title="Featured"
        description="Chosen by the shop."
        products={home.featured}
        storeHref={storeHref}
        currency={store.currency}
        currencySymbol={store.currencySymbol}
        moreHref={`${storeHref}/products`}
      />

      <Rail
        title="New arrivals"
        products={home.newArrivals}
        storeHref={storeHref}
        currency={store.currency}
        currencySymbol={store.currencySymbol}
        moreHref={`${storeHref}/products?sort=newest`}
      />
    </main>
  );
}
