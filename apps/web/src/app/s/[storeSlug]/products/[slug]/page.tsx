import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, ChevronRight, Scale, Sparkles } from 'lucide-react';
import { ProductGallery } from '@/components/product-gallery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError, apiGet } from '@/lib/api';
import {
  carats,
  discountPercent,
  effectivePrice,
  humanise,
  price,
  richTextToPlain,
  weight,
} from '@/lib/format';
import type { ProductDetail } from '@/lib/types';
import { getStore } from '../../layout';

async function loadProduct(storeSlug: string, slug: string): Promise<ProductDetail> {
  try {
    return await apiGet<ProductDetail>(`/storefront/products/${slug}`, {
      storeSlug,
      revalidate: 60,
    });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeSlug: string; slug: string }>;
}) {
  const { storeSlug, slug } = await params;
  try {
    const product = await loadProduct(storeSlug, slug);
    return {
      title: product.name,
      ...(product.shortDescription ? { description: product.shortDescription } : {}),
    };
  } catch {
    return { title: 'Product' };
  }
}

function Spec({ label, value }: { label: string; value: string | null }) {
  if (value === null || value === '') return null;
  return (
    <div className="flex justify-between gap-6 border-b border-line/70 py-2.5 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="numeric text-right text-ink">{value}</dd>
    </div>
  );
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ storeSlug: string; slug: string }>;
}) {
  const { storeSlug, slug } = await params;
  const storeHref = `/s/${storeSlug}`;

  const [store, product] = await Promise.all([getStore(storeSlug), loadProduct(storeSlug, slug)]);

  const { now, was } = effectivePrice(product);
  const saving = discountPercent(was, now);
  const rateBased = product.pricingMode === 'METAL_RATE_BASED';

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
        <Link href={storeHref} className="hover:text-ink">
          {store.name}
        </Link>
        <ChevronRight className="h-3 w-3" strokeWidth={1.5} />
        <Link href={`${storeHref}/products`} className="hover:text-ink">
          Jewellery
        </Link>
        {product.category && (
          <>
            <ChevronRight className="h-3 w-3" strokeWidth={1.5} />
            <Link
              href={`${storeHref}/products?category=${product.category.slug}`}
              className="hover:text-ink"
            >
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <ProductGallery media={product.media} name={product.name} metalType={product.metalType} />

        <div>
          <p className="eyebrow">
            {humanise(product.jewelleryType)}
            {product.metalPurity ? ` · ${product.metalPurity}` : ''}
          </p>
          <h1 className="mt-2 text-3xl leading-tight">{product.name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {product.hallmarked && (
              <Badge tone="gold">
                <BadgeCheck className="h-3 w-3" strokeWidth={2} />
                Hallmarked
              </Badge>
            )}
            {product.isCustomisable && <Badge tone="outline">Made to order</Badge>}
            {product.availability !== 'IN_STOCK' && (
              <Badge tone="silver">{humanise(product.availability)}</Badge>
            )}
            <span className="numeric text-xs text-ink-faint">SKU {product.sku}</span>
          </div>

          {product.shortDescription && (
            <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">
              {product.shortDescription}
            </p>
          )}

          <div className="mt-7 flex items-baseline gap-3">
            <span className="numeric font-display text-3xl text-ink">
              {price(now, store.currency, store.currencySymbol)}
            </span>
            {was !== null && (
              <span className="numeric text-ink-faint line-through">
                {price(was, store.currency, store.currencySymbol)}
              </span>
            )}
            {saving !== null && <Badge tone="sale">{saving}% off</Badge>}
          </div>

          {rateBased && (
            <p className="mt-3 flex items-start gap-2 bg-gold-wash p-3 text-xs leading-relaxed text-gold-deep">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span>
                Priced from the shop&rsquo;s recorded gold rate: net weight × rate, plus making
                charge and wastage. It moves when the rate does.
              </span>
            </p>
          )}

          <div className="mt-8">
            {/* Cart and checkout arrive in Phase 5. A button that silently did
                nothing would be worse than one that says what it is. */}
            <Button size="lg" disabled className="w-full sm:w-auto">
              Add to cart — available in the next phase
            </Button>
            {store.phone && (
              <p className="mt-3 text-xs text-ink-soft">
                To buy now, call the shop on{' '}
                <a
                  className="numeric text-gold-deep underline underline-offset-4"
                  href={`tel:${store.phone}`}
                >
                  {store.phone}
                </a>
                .
              </p>
            )}
          </div>

          {product.variants.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg">Options</h2>
              <ul className="mt-3 divide-y divide-line/70 border-y border-line/70">
                {product.variants.map((variant) => (
                  <li
                    key={variant.id}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <div>
                      <p className="text-ink">{variant.name}</p>
                      <p className="numeric mt-0.5 text-xs text-ink-faint">
                        {[
                          variant.sku,
                          variant.ringSize ? `Size ${variant.ringSize}` : null,
                          weight(variant.netWeightG),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span className="numeric shrink-0 text-ink">
                      {price(
                        variant.salePrice ?? variant.price,
                        store.currency,
                        store.currencySymbol,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-lg">
              <Scale className="h-4 w-4 text-gold-deep" strokeWidth={1.5} />
              Specification
            </h2>
            <dl className="mt-3">
              <Spec label="Metal" value={humanise(product.metalType)} />
              <Spec label="Purity" value={product.metalPurity} />
              <Spec label="Material" value={product.material} />
              <Spec label="Gross weight" value={weight(product.grossWeightG)} />
              <Spec label="Net metal weight" value={weight(product.netWeightG)} />
              <Spec label="Stone weight" value={carats(product.stoneWeightCt)} />
              <Spec label="Stone" value={product.stoneType} />
              <Spec label="Hallmark number" value={product.hallmarkNumber} />
              <Spec
                label="Making charge"
                value={
                  product.makingCharge === null
                    ? null
                    : product.makingChargeType === 'PERCENT'
                      ? `${product.makingCharge}%`
                      : product.makingChargeType === 'PER_GRAM'
                        ? `${price(product.makingCharge, store.currency, store.currencySymbol)} / g`
                        : price(product.makingCharge, store.currency, store.currencySymbol)
                }
              />
              <Spec
                label="Wastage"
                value={product.wastagePercent === null ? null : `${product.wastagePercent}%`}
              />
              <Spec label="Country of origin" value={product.countryOfOrigin} />
            </dl>
          </section>

          {product.gemstones.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg">Stones</h2>
              <ul className="mt-3 space-y-3">
                {product.gemstones.map((stone, index) => (
                  <li key={`${stone.stoneType}-${index}`} className="border border-line p-4">
                    <p className="text-sm text-ink">
                      {stone.count > 1 ? `${stone.count} × ` : ''}
                      {stone.stoneType}
                      {stone.shape ? `, ${stone.shape}` : ''}
                    </p>
                    <p className="numeric mt-1 text-xs text-ink-soft">
                      {[
                        carats(stone.caratWeight),
                        stone.colourGrade ? `Colour ${stone.colourGrade}` : null,
                        stone.clarityGrade ? `Clarity ${stone.clarityGrade}` : null,
                        stone.cutGrade ? `Cut ${stone.cutGrade}` : null,
                        stone.setting,
                        stone.certification,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {product.careInstructions && (
            <section className="mt-10">
              <h2 className="text-lg">Care</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {product.careInstructions}
              </p>
            </section>
          )}

          {product.description && (
            <section className="mt-10">
              <h2 className="text-lg">Details</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                {richTextToPlain(product.description)}
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
