import { z } from 'zod';
import { toMoneyString, toWeightString } from '@jh/shared/money';

/**
 * Public shapes. Everything the storefront returns is assembled here rather
 * than spread through the service, so "what the public can see" is one
 * reviewable file.
 *
 * Two rules it exists to enforce:
 *  1. Money and weights leave as fixed-precision strings. A Decimal that goes
 *     through JSON.stringify as a float has already lost the guarantee the
 *     DECIMAL column was chosen for.
 *  2. Fields are whitelisted, never spread. `costPrice` sits next to `price`
 *     on the Product row, and a `...product` would publish every store's
 *     margins.
 */

export const productQuerySchema = z.object({
  category: z.string().min(1).max(120).optional(),
  q: z.string().min(1).max(120).optional(),
  metal: z.string().min(1).max(40).optional(),
  type: z.string().min(1).max(40).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name', 'popular']).default('newest'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

/** A Prisma Decimal, or null. Narrowed here so callers stay readable. */
type DecimalLike = { toString(): string } | null | undefined;

export function moneyOut(value: DecimalLike): string | null {
  return value === null || value === undefined ? null : toMoneyString(value.toString());
}

export function weightOut(value: DecimalLike): string | null {
  return value === null || value === undefined ? null : toWeightString(value.toString());
}

export interface MediaView {
  url: string;
  altText: string | null;
  isPrimary: boolean;
}

export interface ProductCardView {
  id: string;
  slug: string;
  name: string;
  sku: string;
  shortDescription: string | null;
  jewelleryType: string;
  metalType: string;
  metalPurity: string | null;
  price: string | null;
  salePrice: string | null;
  availability: string;
  isFeatured: boolean;
  isNewArrival: boolean;
  hallmarked: boolean;
  netWeightG: string | null;
  grossWeightG: string | null;
  ratingAverage: string;
  ratingCount: number;
  media: MediaView[];
}

export interface VariantView {
  id: string;
  name: string;
  sku: string;
  ringSize: string | null;
  lengthCm: string | null;
  braceletCm: string | null;
  metalPurity: string | null;
  price: string | null;
  salePrice: string | null;
  netWeightG: string | null;
  grossWeightG: string | null;
  isDefault: boolean;
}

export interface GemstoneView {
  stoneType: string;
  shape: string | null;
  count: number;
  caratWeight: string | null;
  colourGrade: string | null;
  clarityGrade: string | null;
  cutGrade: string | null;
  setting: string | null;
  certification: string | null;
}

export interface ProductDetailView extends ProductCardView {
  description: string | null;
  pricingMode: string;
  makingCharge: string | null;
  makingChargeType: string;
  wastagePercent: string | null;
  stoneWeightCt: string | null;
  stoneType: string | null;
  material: string | null;
  hallmarkNumber: string | null;
  certificateUrl: string | null;
  careInstructions: string | null;
  countryOfOrigin: string | null;
  isCustomisable: boolean;
  tags: string[];
  category: { slug: string; name: string } | null;
  variants: VariantView[];
  gemstones: GemstoneView[];
}

export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
}

export interface StoreView {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  currency: string;
  currencySymbol: string;
  locale: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  district: string | null;
  country: string;
  socialLinks: Record<string, unknown> | null;
  categories: CategoryView[];
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}
