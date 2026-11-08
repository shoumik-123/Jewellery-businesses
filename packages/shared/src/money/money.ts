import Decimal from 'decimal.js';

/**
 * Money and weight arithmetic.
 *
 * Every monetary value in this system is a decimal with two fractional digits,
 * stored as PostgreSQL `DECIMAL(14,2)` and carried over the wire as a string.
 * Floats never touch it: `0.1 + 0.2 !== 0.3` is a rounding dispute with a
 * customer who just bought gold by weight.
 *
 * Weights are three fractional digits (milligram precision on grams), because
 * jewellery is priced by weight and 0.001g of 22K gold is real money.
 */

/** Local Decimal constructor so we never mutate global decimal.js config. */
const D = Decimal.clone({
  precision: 34,
  rounding: Decimal.ROUND_HALF_UP, // commercial rounding: 0.005 -> 0.01
  toExpNeg: -15,
  toExpPos: 30,
});

export type Money = Decimal;
export type Weight = Decimal;
export type MoneyInput = string | number | Decimal;

export const MONEY_DP = 2;
export const WEIGHT_DP = 3;
export const RATE_DP = 3;

/** Thrown rather than silently producing NaN, which would propagate into a total. */
export class InvalidMoneyError extends Error {
  constructor(value: unknown) {
    super(`Not a valid monetary value: ${String(value)}`);
    this.name = 'InvalidMoneyError';
  }
}

function toDecimal(value: MoneyInput): Decimal {
  if (value instanceof Decimal) {
    if (!value.isFinite()) throw new InvalidMoneyError(value);
    return new D(value);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new InvalidMoneyError(value);
  if (typeof value === 'string' && value.trim() === '') throw new InvalidMoneyError(value);

  let d: Decimal;
  try {
    d = new D(value);
  } catch {
    // decimal.js throws its own DecimalError. Normalise it so callers of this
    // module only ever have to catch one error type.
    throw new InvalidMoneyError(value);
  }
  if (!d.isFinite()) throw new InvalidMoneyError(value);
  return d;
}

/** Parse any accepted input into an exact decimal. */
export function money(value: MoneyInput): Money {
  return toDecimal(value);
}

export const ZERO: Money = new D(0);

/** Round to 2dp, half-up. Apply at boundaries (persist/display), not between steps. */
export function roundMoney(value: MoneyInput): Money {
  return toDecimal(value).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
}

/** Round to 3dp, half-up — grams and carats. */
export function roundWeight(value: MoneyInput): Weight {
  return toDecimal(value).toDecimalPlaces(WEIGHT_DP, Decimal.ROUND_HALF_UP);
}

export function add(...values: MoneyInput[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(toDecimal(v)), new D(0));
}

export function subtract(a: MoneyInput, b: MoneyInput): Money {
  return toDecimal(a).minus(toDecimal(b));
}

export function multiply(a: MoneyInput, b: MoneyInput): Money {
  return toDecimal(a).times(toDecimal(b));
}

export function divide(a: MoneyInput, b: MoneyInput): Money {
  const divisor = toDecimal(b);
  if (divisor.isZero()) throw new InvalidMoneyError('division by zero');
  return toDecimal(a).dividedBy(divisor);
}

/** Sum a list of line amounts. Empty list is zero, not NaN. */
export function sum(values: readonly MoneyInput[]): Money {
  return add(...values);
}

/** `percentOf(1000, 8)` -> 80. Percent is a percentage, not a fraction. */
export function percentOf(amount: MoneyInput, percent: MoneyInput): Money {
  return multiply(amount, divide(toDecimal(percent), 100));
}

/** `addPercent(1000, 8)` -> 1080 */
export function addPercent(amount: MoneyInput, percent: MoneyInput): Money {
  return add(amount, percentOf(amount, percent));
}

/** Never let a computed total go below zero (e.g. a discount larger than the subtotal). */
export function clampNonNegative(value: MoneyInput): Money {
  const d = toDecimal(value);
  return d.isNegative() ? new D(0) : d;
}

export function min(a: MoneyInput, b: MoneyInput): Money {
  const [x, y] = [toDecimal(a), toDecimal(b)];
  return x.lessThanOrEqualTo(y) ? x : y;
}

export function max(a: MoneyInput, b: MoneyInput): Money {
  const [x, y] = [toDecimal(a), toDecimal(b)];
  return x.greaterThanOrEqualTo(y) ? x : y;
}

export function isZero(value: MoneyInput): boolean {
  return toDecimal(value).isZero();
}

export function isPositive(value: MoneyInput): boolean {
  return toDecimal(value).greaterThan(0);
}

export function isNegative(value: MoneyInput): boolean {
  return toDecimal(value).isNegative();
}

export function equals(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).equals(toDecimal(b));
}

export function greaterThan(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).greaterThan(toDecimal(b));
}

export function lessThan(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).lessThan(toDecimal(b));
}

/** Wire format: a fixed 2dp string. This is what the API returns and the DB stores. */
export function toMoneyString(value: MoneyInput): string {
  return roundMoney(value).toFixed(MONEY_DP);
}

/** Wire format for grams/carats: fixed 3dp string. */
export function toWeightString(value: MoneyInput): string {
  return roundWeight(value).toFixed(WEIGHT_DP);
}

/**
 * Digit grouping style.
 *  - `western`: 1,234,567.00
 *  - `indian` : 12,34,567.00  (lakh/crore — how prices are read in Bangladesh)
 */
export type GroupingStyle = 'western' | 'indian';

export interface FormatMoneyOptions {
  /** ISO code, used when no symbol is given. Default `BDT`. */
  currency?: string;
  /** Display symbol, e.g. `Tk`, `৳`, `$`. */
  symbol?: string;
  /** Overrides the grouping implied by the currency. */
  grouping?: GroupingStyle;
  /** Drop `.00` on whole amounts — useful in dense tables. */
  compactDecimals?: boolean;
}

/** Currencies written with lakh/crore grouping. */
const INDIAN_GROUPING_CURRENCIES = new Set(['BDT', 'INR', 'PKR', 'NPR', 'LKR']);

/**
 * Group an integer digit string. Done by hand rather than through
 * `Intl.NumberFormat` for two reasons: Intl takes a `number`, which would send
 * money through a float on its way to the screen, and ICU's grouping for
 * `en-BD` is western, which is not how a Dhaka jeweller writes a price.
 */
function groupDigits(digits: string, style: GroupingStyle): string {
  if (digits.length <= 3) return digits;
  if (style === 'western') {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  // Indian: last three digits, then pairs.
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

/**
 * Human-readable money. The digits come from Decimal and are grouped as
 * strings, so what is displayed is exactly what is stored.
 */
export function formatMoney(value: MoneyInput, options: FormatMoneyOptions = {}): string {
  const { currency = 'BDT', symbol, compactDecimals = false } = options;
  const style =
    options.grouping ??
    (INDIAN_GROUPING_CURRENCIES.has(currency.toUpperCase()) ? 'indian' : 'western');

  const rounded = roundMoney(value);
  const fractionDigits = compactDecimals && rounded.modulo(1).isZero() ? 0 : MONEY_DP;

  const fixed = rounded.toFixed(fractionDigits); // e.g. "-148125.00"
  const negative = fixed.startsWith('-');
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [intPart = '0', fracPart] = unsigned.split('.');

  const grouped = groupDigits(intPart, style);
  const number = fracPart ? `${grouped}.${fracPart}` : grouped;
  const prefix = symbol ?? currencySymbol(currency);

  return `${prefix}${prefix ? ' ' : ''}${negative ? '-' : ''}${number}`;
}

const SYMBOLS: Readonly<Record<string, string>> = {
  BDT: 'Tk',
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  AED: 'AED',
};

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
}

/** `formatWeight(12.5)` -> `12.500 g` */
export function formatWeight(value: MoneyInput, unit = 'g'): string {
  return `${toWeightString(value)} ${unit}`;
}

/**
 * Split an amount across n parts so the parts sum exactly to the original.
 * Used when apportioning an order-level discount across lines: naive division
 * loses or invents a paisa, and then the invoice does not balance.
 */
export function allocate(amount: MoneyInput, weights: readonly MoneyInput[]): Money[] {
  const total = toDecimal(amount);
  const ws = weights.map(toDecimal);
  const weightSum = add(...ws);

  if (weightSum.isZero()) {
    // Nothing to weight by: give everything to the first part.
    return ws.map((_, i) => (i === 0 ? roundMoney(total) : new D(0)));
  }

  const parts = ws.map((w) => roundMoney(total.times(w).dividedBy(weightSum)));
  const allocated = add(...parts);
  const remainder = total.minus(allocated);

  if (!remainder.isZero() && parts.length > 0) {
    // Push the rounding remainder onto the largest part, where it is least visible.
    let largest = 0;
    for (let i = 1; i < parts.length; i += 1) {
      if (parts[i]!.greaterThan(parts[largest]!)) largest = i;
    }
    parts[largest] = roundMoney(parts[largest]!.plus(remainder));
  }

  return parts;
}

export { Decimal };
