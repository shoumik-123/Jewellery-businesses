'use client';

import { useState } from 'react';
import { Gem } from 'lucide-react';
import type { Media } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The product image gallery.
 *
 * A client component, and the only one in the storefront: choosing a
 * thumbnail is local interaction state, and doing it on the server would mean
 * a round trip to change which picture is on screen.
 *
 * `onError` matters. A media row points at a URL the store supplied, and a URL
 * can rot - an asset deleted from Cloudinary, a bad migration, a typo in an
 * import. When one fails the gallery drops it and falls back, rather than
 * leaving the browser's broken-image glyph in a shop window.
 */
export function ProductGallery({
  media,
  name,
  metalType,
}: {
  media: Media[];
  name: string;
  metalType: string;
}) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());

  const usable = media.filter((item) => !broken.has(item.url));
  const current = usable[Math.min(active, usable.length - 1)];

  function markBroken(url: string) {
    setBroken((previous) => new Set(previous).add(url));
  }

  if (!current) {
    return <MetalPlaceholder metalType={metalType} className="aspect-square w-full" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square overflow-hidden bg-parchment-deep">
        {/* eslint-disable-next-line @next/next/no-img-element -- see ProductCard */}
        <img
          src={current.url}
          alt={current.altText ?? name}
          width={1000}
          height={1000}
          className="h-full w-full object-cover"
          onError={() => markBroken(current.url)}
        />
      </div>

      {usable.length > 1 && (
        <ul className="flex gap-3">
          {usable.map((item, index) => (
            <li key={item.url}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={`View image ${index + 1} of ${usable.length}`}
                aria-current={index === active}
                className={cn(
                  'block h-20 w-20 overflow-hidden border bg-parchment-deep transition-colors',
                  index === active ? 'border-gold' : 'border-line hover:border-gold/60',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- see ProductCard */}
                <img
                  src={item.url}
                  alt=""
                  width={160}
                  height={160}
                  className="h-full w-full object-cover"
                  onError={() => markBroken(item.url)}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Shown when a product has no usable image.
 *
 * Tinted to the metal so a gold piece and a silver piece still read
 * differently, and deliberately not a stock photograph of someone else's
 * jewellery standing in for merchandise the shop never photographed.
 */
export function MetalPlaceholder({
  metalType,
  className,
}: {
  metalType: string;
  className?: string;
}) {
  const tint =
    metalType.includes('GOLD') && !metalType.includes('WHITE')
      ? 'from-[#FCF6EA] to-[#E3CFA6]'
      : metalType.includes('SILVER') || metalType === 'WHITE_GOLD' || metalType === 'PLATINUM'
        ? 'from-[#F6F8F9] to-[#DDE2E7]'
        : 'from-parchment-deep to-line';

  return (
    <div
      className={cn('flex items-center justify-center bg-gradient-to-br', tint, className)}
      aria-hidden="true"
    >
      <Gem className="h-8 w-8 text-ink/15" strokeWidth={1} />
    </div>
  );
}
