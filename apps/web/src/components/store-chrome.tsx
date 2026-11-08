import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { Store } from '@/lib/types';

/**
 * Header and footer for a storefront.
 *
 * Everything here - the name, the category nav, the contact block - comes from
 * that store's own rows. Nothing is hardcoded, so the two seeded stores render
 * visibly differently from the same component.
 */
export function StoreHeader({ store, href }: { store: Store; href: string }) {
  const nav = store.categories.filter((category) => category.productCount > 0).slice(0, 6);

  return (
    <header className="border-b border-line bg-parchment">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Link href={href} className="group flex items-center gap-3">
            {store.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={store.logoUrl}
                alt=""
                aria-hidden="true"
                width={44}
                height={44}
                className="h-11 w-11 shrink-0"
              />
            )}
            <span className="block">
              <span className="block font-display text-2xl text-ink group-hover:text-gold-deep">
                {store.name}
              </span>
              {store.tagline && (
                <span className="mt-0.5 block text-xs text-ink-faint">{store.tagline}</span>
              )}
            </span>
          </Link>

          <div className="flex items-center gap-4 text-xs text-ink-soft">
            {store.phone && (
              <a className="flex items-center gap-1.5 hover:text-ink" href={`tel:${store.phone}`}>
                <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="numeric">{store.phone}</span>
              </a>
            )}
            {store.city && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />
                {store.city}
              </span>
            )}
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <Link href={`${href}/products`} className="text-ink hover:text-gold-deep">
            All jewellery
          </Link>
          {nav.map((category) => (
            <Link
              key={category.id}
              href={`${href}/products?category=${category.slug}`}
              className="text-ink-soft hover:text-gold-deep"
            >
              {category.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function StoreFooter({ store }: { store: Store }) {
  return (
    <footer className="mt-20 border-t border-line bg-parchment-deep">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-display text-lg text-ink">{store.name}</p>
          {store.description && (
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-ink-soft">
              {store.description}
            </p>
          )}
        </div>

        <div>
          <p className="eyebrow mb-2">Contact</p>
          <ul className="space-y-1.5 text-xs text-ink-soft">
            {store.phone && (
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="numeric">{store.phone}</span>
              </li>
            )}
            {store.email && (
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                {store.email}
              </li>
            )}
            {(store.city ?? store.district) && (
              <li className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />
                {[store.city, store.district, store.country].filter(Boolean).join(', ')}
              </li>
            )}
          </ul>
        </div>

        <div>
          <p className="eyebrow mb-2">Prices</p>
          <p className="text-xs leading-relaxed text-ink-soft">
            Shown in {store.currency} ({store.currencySymbol}). Gold items priced against the
            store&rsquo;s recorded metal rate include making charge and wastage.
          </p>
        </div>
      </div>

      <div className="border-t border-line/70 px-4 py-4 text-center text-[11px] text-ink-faint sm:px-6">
        Powered by JewelleryHub
      </div>
    </footer>
  );
}
