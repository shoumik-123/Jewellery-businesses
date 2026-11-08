import Link from 'next/link';
import { MetalPlaceholder } from '@/components/product-gallery';
import { Badge } from '@/components/ui/badge';
import { discountPercent, effectivePrice, humanise, price, weight } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ProductCard as ProductCardData } from '@/lib/types';

export function ProductCard({
  product,
  storeHref,
  currency,
  currencySymbol,
}: {
  product: ProductCardData;
  storeHref: string;
  currency: string;
  currencySymbol: string;
}) {
  const { now, was } = effectivePrice(product);
  const saving = discountPercent(was, now);
  const primary = product.media.find((m) => m.isPrimary) ?? product.media[0];
  const secondary = product.media.find((m) => m.url !== primary?.url);
  const net = weight(product.netWeightG);

  return (
    <Link
      href={`${storeHref}/products/${product.slug}`}
      className="group block focus-visible:outline-offset-4"
    >
      <article className="flex h-full flex-col">
        <div className="relative aspect-square overflow-hidden bg-parchment-deep">
          {primary ? (
            <>
              {/* Store-uploaded media lives on Cloudinary or S3, so the URL is
                  arbitrary. next/image would need remote patterns configured
                  per deployment, which belongs with the storage work in
                  Phase 7 rather than hardcoded here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={primary.url}
                alt={primary.altText ?? product.name}
                width={1000}
                height={1000}
                loading="lazy"
                className={cn(
                  'h-full w-full object-cover transition-all duration-500 group-hover:scale-105',
                  secondary && 'group-hover:opacity-0',
                )}
              />
              {secondary && (
                /* Second angle, revealed on hover. Hidden from assistive tech:
                   it is the same product, and announcing it twice is noise. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={secondary.url}
                  alt=""
                  aria-hidden="true"
                  width={1000}
                  height={1000}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full scale-105 object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                />
              )}
            </>
          ) : (
            <MetalPlaceholder metalType={product.metalType} className="h-full w-full" />
          )}

          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {saving !== null && <Badge tone="sale">{saving}% off</Badge>}
            {product.isNewArrival && <Badge tone="gold">New</Badge>}
          </div>

          {product.availability !== 'IN_STOCK' && (
            <div className="absolute inset-x-0 bottom-0 bg-ink/80 py-1.5 text-center text-[11px] uppercase tracking-wider text-parchment">
              {humanise(product.availability)}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 pt-3">
          <p className="eyebrow">
            {humanise(product.jewelleryType)}
            {product.metalPurity ? ` · ${product.metalPurity}` : ''}
          </p>

          <h3 className="text-[15px] leading-snug text-ink group-hover:text-gold-deep">
            {product.name}
          </h3>

          <div className="mt-auto flex items-baseline gap-2 pt-1">
            <span className="numeric text-[15px] text-ink">
              {price(now, currency, currencySymbol)}
            </span>
            {was !== null && (
              <span className="numeric text-xs text-ink-faint line-through">
                {price(was, currency, currencySymbol)}
              </span>
            )}
          </div>

          {net !== null && <p className="numeric text-xs text-ink-faint">Net weight {net}</p>}
        </div>
      </article>
    </Link>
  );
}
