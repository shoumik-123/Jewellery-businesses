import { formatMoney } from '@jh/shared/money';

/**
 * Display formatting.
 *
 * Money goes through @jh/shared, the same module the API and the pricing
 * engine use, so a price never gains or loses a paisa on its way to the
 * screen. In particular it never becomes a JavaScript number: `formatMoney`
 * takes the decimal string straight from the API, and for BDT it groups in the
 * South Asian style (1,48,125, not 148,125), which Intl's en-BD locale does
 * not do.
 */

export function price(value: string | null, currency = 'BDT', symbol?: string): string {
  if (value === null) return '—';
  return formatMoney(value, symbol ? { currency, symbol } : { currency });
}

/** Grams to 3 dp, with the unit. Returns null so callers can omit the row. */
export function weight(value: string | null): string | null {
  if (value === null) return null;
  return `${trimTrailingZeros(value)} g`;
}

export function carats(value: string | null): string | null {
  if (value === null) return null;
  return `${trimTrailingZeros(value)} ct`;
}

/** 12.500 -> 12.5, 12.000 -> 12. Trailing zeros are noise in a spec table. */
function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}

/** SCREAMING_SNAKE enum value to Title Case for display. */
export function humanise(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => (word.length > 0 ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** The price a customer actually pays, and the struck-through one if on sale. */
export function effectivePrice(item: { price: string | null; salePrice: string | null }): {
  now: string | null;
  was: string | null;
} {
  if (item.salePrice !== null) return { now: item.salePrice, was: item.price };
  return { now: item.price, was: null };
}

/**
 * Percentage saved, as a whole number, or null when there is no saving.
 * Computed on integer paisa so it does not depend on float arithmetic.
 */
export function discountPercent(was: string | null, now: string | null): number | null {
  if (was === null || now === null) return null;
  const wasPaisa = toPaisa(was);
  const nowPaisa = toPaisa(now);
  if (wasPaisa === null || nowPaisa === null || wasPaisa <= nowPaisa || wasPaisa === 0) {
    return null;
  }
  return Math.round(((wasPaisa - nowPaisa) * 100) / wasPaisa);
}

function toPaisa(value: string): number | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, sign, whole = '0', fraction = '0'] = match;
  const paisa = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return sign === '-' ? -paisa : paisa;
}

/**
 * Rich-text description to plain text.
 *
 * Product descriptions are stored as HTML authored in the dashboard. They are
 * NOT rendered as HTML here, and deliberately so: the sanitiser that cleans
 * them on write arrives with the product editor in Phase 4, so nothing has
 * vetted what is in the column yet. Passing unvetted store-authored markup to
 * dangerouslySetInnerHTML would let a store owner run script on their own
 * storefront today, and on a shared platform domain later.
 *
 * So: block tags become paragraph breaks, everything else is dropped, and the
 * result is rendered as text. When the sanitiser exists, this becomes a real
 * renderer and the decision is a one-line change in one place.
 */
export function richTextToPlain(value: string): string {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
