/**
 * Jewellery domain reference data.
 *
 * Shared because the dashboard, the storefront and the API all need the same
 * purity table and the same size conversions — a ring sized "16" in the
 * catalogue must mean the same thing on the product page and on the invoice.
 */

import { Decimal, type MoneyInput, money, roundWeight } from '../money/money';

// ---------------------------------------------------------------------------
// Metal purity
// ---------------------------------------------------------------------------

export interface PuritySpec {
  /** Code stored on the product, e.g. "22K". */
  code: string;
  label: string;
  /** Fineness in parts per thousand: 22K = 916. */
  fineness: number;
  /** Fraction of pure metal, 0..1. */
  purity: number;
}

export const GOLD_PURITIES: readonly PuritySpec[] = [
  { code: '24K', label: '24K (999)', fineness: 999, purity: 0.999 },
  { code: '22K', label: '22K (916)', fineness: 916, purity: 0.916 },
  { code: '21K', label: '21K (875)', fineness: 875, purity: 0.875 },
  { code: '18K', label: '18K (750)', fineness: 750, purity: 0.75 },
  { code: '14K', label: '14K (585)', fineness: 585, purity: 0.585 },
  { code: '10K', label: '10K (417)', fineness: 417, purity: 0.417 },
];

export const SILVER_PURITIES: readonly PuritySpec[] = [
  { code: '999', label: 'Fine silver (999)', fineness: 999, purity: 0.999 },
  { code: '958', label: 'Britannia (958)', fineness: 958, purity: 0.958 },
  { code: '925', label: 'Sterling (925)', fineness: 925, purity: 0.925 },
  { code: '800', label: 'Coin silver (800)', fineness: 800, purity: 0.8 },
];

export const PLATINUM_PURITIES: readonly PuritySpec[] = [
  { code: 'PT999', label: 'Platinum 999', fineness: 999, purity: 0.999 },
  { code: 'PT950', label: 'Platinum 950', fineness: 950, purity: 0.95 },
  { code: 'PT900', label: 'Platinum 900', fineness: 900, purity: 0.9 },
];

/**
 * Which purity codes a metal type may use; drives the dependent select in the
 * product form. Written as a closed object (not an index signature) so that
 * `PURITIES_BY_METAL.GOLD` is known to exist and a typo is a compile error.
 */
export const PURITIES_BY_METAL = {
  GOLD: GOLD_PURITIES,
  WHITE_GOLD: GOLD_PURITIES,
  ROSE_GOLD: GOLD_PURITIES,
  SILVER: SILVER_PURITIES,
  PLATINUM: PLATINUM_PURITIES,
  // Plated and base metals have no meaningful fineness to declare.
  GOLD_PLATED: [],
  SILVER_PLATED: [],
  STAINLESS_STEEL: [],
  BRASS: [],
  COPPER: [],
  ALLOY: [],
  NONE: [],
} as const satisfies Record<string, readonly PuritySpec[]>;

/** The metal types the catalogue understands. */
export type MetalTypeKey = keyof typeof PURITIES_BY_METAL;

export function puritiesFor(metal: MetalTypeKey): readonly PuritySpec[] {
  return PURITIES_BY_METAL[metal];
}

export function findPurity(code: string): PuritySpec | undefined {
  const needle = code.trim().toUpperCase();
  return [...GOLD_PURITIES, ...SILVER_PURITIES, ...PLATINUM_PURITIES].find(
    (p) => p.code.toUpperCase() === needle,
  );
}

/**
 * Convert a weight at one purity to the equivalent weight at another.
 * Used when a shop quotes a rate per gram of 24K but sells 22K items.
 */
export function convertPurityWeight(
  weightG: MoneyInput,
  fromCode: string,
  toCode: string,
): Decimal {
  const from = findPurity(fromCode);
  const to = findPurity(toCode);
  if (!from || !to) throw new Error(`Unknown purity: ${!from ? fromCode : toCode}`);
  return roundWeight(money(weightG).times(from.fineness).dividedBy(to.fineness));
}

// ---------------------------------------------------------------------------
// Weight units
// ---------------------------------------------------------------------------

/** Traditional South Asian weights, still how many customers in BD think about gold. */
export const WEIGHT_UNITS = {
  GRAM: { code: 'g', label: 'Gram', grams: '1' },
  MILLIGRAM: { code: 'mg', label: 'Milligram', grams: '0.001' },
  CARAT: { code: 'ct', label: 'Carat (stones)', grams: '0.2' },
  RATTI: { code: 'ratti', label: 'Ratti', grams: '0.18' },
  ANA: { code: 'ana', label: 'Ana', grams: '0.729' },
  BHORI: { code: 'bhori', label: 'Bhori / Tola', grams: '11.664' },
} as const;

export type WeightUnitCode = (typeof WEIGHT_UNITS)[keyof typeof WEIGHT_UNITS]['code'];

export function toGrams(value: MoneyInput, unit: WeightUnitCode): Decimal {
  const spec = Object.values(WEIGHT_UNITS).find((u) => u.code === unit);
  if (!spec) throw new Error(`Unknown weight unit: ${unit}`);
  return roundWeight(money(value).times(spec.grams));
}

export function fromGrams(grams: MoneyInput, unit: WeightUnitCode): Decimal {
  const spec = Object.values(WEIGHT_UNITS).find((u) => u.code === unit);
  if (!spec) throw new Error(`Unknown weight unit: ${unit}`);
  return money(grams).dividedBy(spec.grams).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

// ---------------------------------------------------------------------------
// Ring sizes
// ---------------------------------------------------------------------------

export interface RingSize {
  /** Indian/Bangladeshi size number — the common local standard. */
  indian: number;
  us: number;
  uk: string;
  /** Inner circumference in millimetres. */
  circumferenceMm: number;
  diameterMm: number;
}

export const RING_SIZES: readonly RingSize[] = [
  { indian: 6, us: 3.0, uk: 'F', circumferenceMm: 44.2, diameterMm: 14.1 },
  { indian: 7, us: 3.5, uk: 'G', circumferenceMm: 45.5, diameterMm: 14.5 },
  { indian: 8, us: 4.0, uk: 'H', circumferenceMm: 46.8, diameterMm: 14.9 },
  { indian: 9, us: 4.5, uk: 'I', circumferenceMm: 48.0, diameterMm: 15.3 },
  { indian: 10, us: 5.0, uk: 'J', circumferenceMm: 49.3, diameterMm: 15.7 },
  { indian: 11, us: 5.5, uk: 'K', circumferenceMm: 50.6, diameterMm: 16.1 },
  { indian: 12, us: 6.0, uk: 'L', circumferenceMm: 51.9, diameterMm: 16.5 },
  { indian: 13, us: 6.5, uk: 'M', circumferenceMm: 53.1, diameterMm: 16.9 },
  { indian: 14, us: 7.0, uk: 'N', circumferenceMm: 54.4, diameterMm: 17.3 },
  { indian: 15, us: 7.5, uk: 'O', circumferenceMm: 55.7, diameterMm: 17.7 },
  { indian: 16, us: 8.0, uk: 'P', circumferenceMm: 57.0, diameterMm: 18.1 },
  { indian: 17, us: 8.5, uk: 'Q', circumferenceMm: 58.3, diameterMm: 18.5 },
  { indian: 18, us: 9.0, uk: 'R', circumferenceMm: 59.5, diameterMm: 18.9 },
  { indian: 19, us: 9.5, uk: 'S', circumferenceMm: 60.8, diameterMm: 19.4 },
  { indian: 20, us: 10.0, uk: 'T', circumferenceMm: 62.1, diameterMm: 19.8 },
  { indian: 21, us: 10.5, uk: 'U', circumferenceMm: 63.4, diameterMm: 20.2 },
  { indian: 22, us: 11.0, uk: 'V', circumferenceMm: 64.6, diameterMm: 20.6 },
  { indian: 23, us: 11.5, uk: 'W', circumferenceMm: 65.9, diameterMm: 21.0 },
  { indian: 24, us: 12.0, uk: 'X', circumferenceMm: 67.2, diameterMm: 21.4 },
];

export function findRingSize(indian: number): RingSize | undefined {
  return RING_SIZES.find((s) => s.indian === indian);
}

// ---------------------------------------------------------------------------
// Standard option values offered in the product editor
// ---------------------------------------------------------------------------

export const NECKLACE_LENGTHS_CM = [35, 40, 45, 50, 55, 60, 70, 75, 80, 90] as const;
export const BRACELET_SIZES_CM = [15, 16, 17, 18, 19, 20, 21, 22] as const;
export const BANGLE_SIZES = ['2.2', '2.4', '2.6', '2.8', '2.10', '3.0'] as const;

export const GEMSTONE_SHAPES = [
  'Round',
  'Princess',
  'Oval',
  'Marquise',
  'Pear',
  'Cushion',
  'Emerald',
  'Asscher',
  'Radiant',
  'Heart',
  'Baguette',
  'Cabochon',
] as const;

export const DIAMOND_CLARITY = [
  'FL',
  'IF',
  'VVS1',
  'VVS2',
  'VS1',
  'VS2',
  'SI1',
  'SI2',
  'I1',
  'I2',
  'I3',
] as const;

export const DIAMOND_COLOUR = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const;

export const DIAMOND_CUT = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'] as const;

export const STONE_SETTINGS = [
  'Prong',
  'Bezel',
  'Pave',
  'Channel',
  'Flush',
  'Tension',
  'Halo',
  'Cluster',
] as const;

/** Default category tree created for a new store, so the catalogue is never empty. */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; children?: readonly string[] }> = [
  { name: 'Rings', children: ['Engagement Rings', 'Wedding Bands', 'Couple Rings'] },
  { name: 'Necklaces', children: ['Chains', 'Pendants', 'Chokers'] },
  { name: 'Earrings', children: ['Studs', 'Jhumkas', 'Hoops', 'Drops'] },
  { name: 'Bracelets', children: [] },
  { name: 'Bangles', children: [] },
  { name: 'Bridal Sets', children: [] },
  { name: 'Gold Jewellery', children: [] },
  { name: 'Silver Jewellery', children: [] },
  { name: 'Artificial Jewellery', children: [] },
];
