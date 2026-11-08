/**
 * The storefront API's response shapes, as the web app consumes them.
 *
 * Hand-written for now, and deliberately so: generating them from the API
 * would couple the frontend build to the backend source tree before the
 * contract has settled. docs/05-api-contracts.md is the specification; when
 * the OpenAPI document lands in Phase 9 these get generated from it, and the
 * contract test will fail the build if the two ever drift.
 *
 * Money and weights are strings, not numbers. They arrive as fixed-precision
 * decimals and are formatted as decimals; parsing them into a float here would
 * throw away the exactness the DECIMAL columns exist to provide.
 */

export interface Media {
  url: string;
  altText: string | null;
  isPrimary: boolean;
}

export interface ProductCard {
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
  media: Media[];
}

export interface Variant {
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

export interface Gemstone {
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

export interface ProductDetail extends ProductCard {
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
  variants: Variant[];
  gemstones: Gemstone[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
}

export interface Store {
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
  categories: Category[];
}

export interface Paginated<T> {
  items: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export interface HomePayload {
  featured: ProductCard[];
  newArrivals: ProductCard[];
  categories: Category[];
}

export interface StoreDirectoryEntry {
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  city: string | null;
  currencySymbol: string;
}
