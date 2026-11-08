import { z } from 'zod';
import {
  JewelleryType,
  MakingChargeType,
  MetalType,
  PricingMode,
  ProductAvailability,
  ProductStatus,
} from '@jh/db';
import {
  moneySchema,
  nonNegativeMoneySchema,
  percentSchema,
  positiveMoneySchema,
  skuSchema,
  weightSchema,
} from '@jh/shared/schemas';

/**
 * What a shop may send when managing its own catalogue, and what it gets back.
 *
 * This is the write-side counterpart to storefront.dto.ts, and the two differ
 * in one important way: a shop sees its own `costPrice`. That is the only
 * reason these shapes are not shared - the storefront must never be able to
 * publish a margin, so the two field lists stay separate and each one is
 * reviewable on its own.
 *
 * Money and weights arrive as strings, never numbers. `19.99` as a JSON number
 * is a float, and a float has already lost the guarantee the DECIMAL(14,2)
 * column exists to provide. The shared primitives enforce the string form.
 */

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * A product's own address inside the shop. Narrower than the shop's slug
 * (which is a DNS label) because this one only has to be a clean URL segment.
 */
const productSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Must be at least 3 characters')
  .max(80, 'Must be 80 characters or fewer')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'Use lowercase letters, numbers and hyphens (not at the start or end)',
  );

/**
 * An image address, which ends up inside `<img src>`.
 *
 * Only http(s) and site-relative paths are allowed. The point is what is
 * excluded: `javascript:` and `data:` URLs are script delivery, and a shop
 * owner who pastes one would be attacking their own customers through their
 * own storefront. `//evil.example` is excluded too - it looks relative and is
 * not.
 */
const mediaUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    if (value.startsWith('//')) return false;
    if (value.startsWith('/')) return true;
    try {
      const { protocol } = new URL(value);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter an https:// address or a path starting with /');

const mediaSchema = z.object({
  url: mediaUrlSchema,
  altText: z.string().trim().max(200).optional(),
});

/** Trimmed free text that may be cleared by sending an empty string. */
const text = (max: number) => z.string().trim().max(max);

/**
 * Descriptions are stored and rendered as **plain text**, not HTML.
 *
 * The schema comment calls the column rich text, and one day it will be. It
 * cannot be today: nothing in this codebase sanitises HTML, and storing
 * store-authored markup that the storefront later renders with
 * dangerouslySetInnerHTML is how a shop owner ends up running script on their
 * own customers - and, once shops share a platform domain, on each other's.
 * Accepting plain text is the honest version of this field until a sanitiser
 * is a real dependency; see richTextToPlain in apps/web/src/lib/format.ts.
 */
const descriptionSchema = text(8000);

const tagsSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(25, 'Up to 25 tags')
  // Duplicates are a typing accident, not an error worth refusing a save over.
  .transform((tags) => [...new Set(tags.filter((tag) => tag.length > 0))]);

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

/**
 * The columns the table gives a default to, without their defaults.
 *
 * Kept apart from the rest for one reason, found by a probe rather than by
 * reading: `.partial()` does not remove a `.default()`. An update schema built
 * as `base.partial()` therefore produces the default for every key the caller
 * left out, so a PATCH of `{ price }` alone silently reset `status` to DRAFT
 * and pulled a live product off the storefront - a column the request never
 * mentioned, changed by a request that looked like it only touched a price.
 *
 * So the defaults are applied to the create schema only, and the update schema
 * takes these bare. catalogue.dto.spec.ts holds that line.
 */
const defaultedFields = {
  status: z.enum(ProductStatus),
  availability: z.enum(ProductAvailability),
  metalType: z.enum(MetalType),
  hallmarked: z.boolean(),
  isCustomisable: z.boolean(),
  isCouplePair: z.boolean(),
  pricingMode: z.enum(PricingMode),
  makingChargeType: z.enum(MakingChargeType),
  taxable: z.boolean(),
  isFeatured: z.boolean(),
  isNewArrival: z.boolean(),
  requiresShipping: z.boolean(),
};

/** What each of those falls back to when a create leaves it out. */
const DEFAULTS = {
  status: ProductStatus.DRAFT,
  availability: ProductAvailability.IN_STOCK,
  metalType: MetalType.NONE,
  hallmarked: false,
  isCustomisable: false,
  isCouplePair: false,
  pricingMode: PricingMode.FIXED,
  makingChargeType: MakingChargeType.FLAT,
  taxable: false,
  isFeatured: false,
  isNewArrival: false,
  requiresShipping: true,
} satisfies { [K in keyof typeof defaultedFields]: z.infer<(typeof defaultedFields)[K]> };

/** Everything else: required fields, and the ones that are simply optional. */
const productBase = z.object({
  name: z.string().trim().min(2, 'Give the piece a name').max(200),
  slug: productSlugSchema.optional(),
  sku: skuSchema,
  barcode: text(64).optional(),

  shortDescription: text(300).optional(),
  description: descriptionSchema.optional(),

  // --- The piece itself ---
  jewelleryType: z.enum(JewelleryType),
  metalPurity: text(20).optional(),
  material: text(120).optional(),
  hallmarkNumber: text(80).optional(),
  certificateUrl: mediaUrlSchema.optional(),
  grossWeightG: weightSchema.optional(),
  netWeightG: weightSchema.optional(),
  stoneWeightCt: weightSchema.optional(),
  stoneType: text(120).optional(),
  countryOfOrigin: text(80).optional(),
  careInstructions: text(1000).optional(),

  // --- Price ---
  costPrice: nonNegativeMoneySchema.optional(),
  price: positiveMoneySchema,
  salePrice: moneySchema.optional(),
  saleStartsAt: z.string().datetime({ offset: true }).optional(),
  saleEndsAt: z.string().datetime({ offset: true }).optional(),
  makingCharge: nonNegativeMoneySchema.optional(),
  wastagePercent: percentSchema.optional(),
  taxRate: percentSchema.optional(),

  // --- Shop front ---
  shipWeightG: weightSchema.optional(),
  seoTitle: text(70).optional(),
  seoDesc: text(160).optional(),
  tags: tagsSchema.optional(),

  primaryCategoryId: z.string().trim().min(1).max(64).optional(),
  brandId: z.string().trim().min(1).max(64).optional(),

  /**
   * Replaces the whole gallery when present. First entry is the primary image.
   *
   * These are addresses, not uploads. Uploading needs Cloudinary or S3
   * credentials, which this install does not have, and an upload endpoint that
   * silently stored nothing would be worse than not having one - see
   * docs/08-roadmap.md.
   */
  media: z.array(mediaSchema).max(12, 'Up to 12 images').optional(),
});

/**
 * The fields the cross-field rules read.
 *
 * Every one is optional and nullable, because the same rules run against a
 * create (all present) and a partial update (one field, possibly `null` to
 * clear it). A missing or cleared value means the pair cannot be compared, so
 * the rule passes - the single-field validators have already had their say.
 */
interface ProductFields {
  netWeightG?: string | null | undefined;
  grossWeightG?: string | null | undefined;
  price?: string | null | undefined;
  salePrice?: string | null | undefined;
  saleStartsAt?: string | null | undefined;
  saleEndsAt?: string | null | undefined;
  pricingMode?: string | undefined;
}

/** `null` and `undefined` both mean "nothing to compare against". */
function num(value: string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number.parseFloat(value);
}

/**
 * Cross-field rules, applied to create and update alike.
 *
 * They live in the schema rather than the service because they are statements
 * about what a *request* may contain. A service check would have to be
 * repeated in every handler that writes a product, and the one that forgets is
 * the one that ships.
 */
const PRODUCT_RULES: ReadonlyArray<{
  field: keyof ProductFields;
  message: string;
  ok: (value: ProductFields) => boolean;
}> = [
  {
    field: 'netWeightG',
    message: 'Net weight cannot exceed gross weight',
    ok: (value) => {
      const net = num(value.netWeightG);
      const gross = num(value.grossWeightG);
      return net === null || gross === null || net <= gross;
    },
  },
  {
    field: 'salePrice',
    message: 'The sale price has to be below the regular price',
    ok: (value) => {
      const sale = num(value.salePrice);
      const price = num(value.price);
      return sale === null || price === null || sale < price;
    },
  },
  {
    field: 'saleEndsAt',
    message: 'The sale has to end after it starts',
    ok: (value) => {
      const { saleStartsAt, saleEndsAt } = value;
      if (!saleStartsAt || !saleEndsAt) return true;
      return new Date(saleStartsAt) < new Date(saleEndsAt);
    },
  },
  {
    field: 'netWeightG',
    // Rate-based pricing multiplies the metal weight by the day's rate. With
    // no net weight there is nothing to multiply, so the price would quietly
    // come out as the making charge alone.
    message: 'Rate-based pricing needs the net metal weight',
    ok: (value) =>
      value.pricingMode !== PricingMode.METAL_RATE_BASED ||
      (value.netWeightG !== null && value.netWeightG !== undefined),
  },
];

function checkProductRules(value: ProductFields, ctx: z.RefinementCtx): void {
  for (const rule of PRODUCT_RULES) {
    if (!rule.ok(value)) {
      ctx.addIssue({ code: 'custom', message: rule.message, path: [rule.field] });
    }
  }
}

export const createProductSchema = productBase
  .extend({
    status: defaultedFields.status.default(DEFAULTS.status),
    availability: defaultedFields.availability.default(DEFAULTS.availability),
    metalType: defaultedFields.metalType.default(DEFAULTS.metalType),
    hallmarked: defaultedFields.hallmarked.default(DEFAULTS.hallmarked),
    isCustomisable: defaultedFields.isCustomisable.default(DEFAULTS.isCustomisable),
    isCouplePair: defaultedFields.isCouplePair.default(DEFAULTS.isCouplePair),
    pricingMode: defaultedFields.pricingMode.default(DEFAULTS.pricingMode),
    makingChargeType: defaultedFields.makingChargeType.default(DEFAULTS.makingChargeType),
    taxable: defaultedFields.taxable.default(DEFAULTS.taxable),
    isFeatured: defaultedFields.isFeatured.default(DEFAULTS.isFeatured),
    isNewArrival: defaultedFields.isNewArrival.default(DEFAULTS.isNewArrival),
    requiresShipping: defaultedFields.requiresShipping.default(DEFAULTS.requiresShipping),
  })
  .superRefine(checkProductRules);

/**
 * Update is a partial of the same shape, so a form can send one field.
 *
 * `null` is accepted where the column is nullable and means "clear it", which
 * is different from omitting the key - that means "leave it alone". Without
 * the distinction there would be no way to remove a sale price.
 */
export const updateProductSchema = productBase
  .partial()
  .extend({
    // Bare, not defaulted: see the note on `defaultedFields`.
    status: defaultedFields.status.optional(),
    availability: defaultedFields.availability.optional(),
    metalType: defaultedFields.metalType.optional(),
    hallmarked: defaultedFields.hallmarked.optional(),
    isCustomisable: defaultedFields.isCustomisable.optional(),
    isCouplePair: defaultedFields.isCouplePair.optional(),
    pricingMode: defaultedFields.pricingMode.optional(),
    makingChargeType: defaultedFields.makingChargeType.optional(),
    taxable: defaultedFields.taxable.optional(),
    isFeatured: defaultedFields.isFeatured.optional(),
    isNewArrival: defaultedFields.isNewArrival.optional(),
    requiresShipping: defaultedFields.requiresShipping.optional(),

    shortDescription: text(300).nullable().optional(),
    description: descriptionSchema.nullable().optional(),
    metalPurity: text(20).nullable().optional(),
    material: text(120).nullable().optional(),
    barcode: text(64).nullable().optional(),
    hallmarkNumber: text(80).nullable().optional(),
    certificateUrl: mediaUrlSchema.nullable().optional(),
    grossWeightG: weightSchema.nullable().optional(),
    netWeightG: weightSchema.nullable().optional(),
    stoneWeightCt: weightSchema.nullable().optional(),
    stoneType: text(120).nullable().optional(),
    countryOfOrigin: text(80).nullable().optional(),
    careInstructions: text(1000).nullable().optional(),
    costPrice: nonNegativeMoneySchema.nullable().optional(),
    salePrice: moneySchema.nullable().optional(),
    saleStartsAt: z.string().datetime({ offset: true }).nullable().optional(),
    saleEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
    makingCharge: nonNegativeMoneySchema.nullable().optional(),
    wastagePercent: percentSchema.nullable().optional(),
    taxRate: percentSchema.nullable().optional(),
    shipWeightG: weightSchema.nullable().optional(),
    seoTitle: text(70).nullable().optional(),
    seoDesc: text(160).nullable().optional(),
    primaryCategoryId: z.string().trim().min(1).max(64).nullable().optional(),
    brandId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .superRefine(checkProductRules);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export const manageProductQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: z.enum(ProductStatus).optional(),
  type: z.enum(JewelleryType).optional(),
  metal: z.enum(MetalType).optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
  /** Archived products are hidden unless asked for: the list is a work queue. */
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  sort: z
    .enum(['newest', 'oldest', 'name', 'price_asc', 'price_desc', 'updated'])
    .default('updated'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export type ManageProductQuery = z.infer<typeof manageProductQuerySchema>;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface ProductRowView {
  id: string;
  slug: string;
  name: string;
  sku: string;
  status: string;
  availability: string;
  jewelleryType: string;
  metalType: string;
  metalPurity: string | null;
  price: string | null;
  salePrice: string | null;
  netWeightG: string | null;
  isFeatured: boolean;
  variantCount: number;
  primaryImage: string | null;
  categoryName: string | null;
  updatedAt: string;
  archived: boolean;
}

export interface ProductEditView {
  id: string;
  slug: string;
  name: string;
  sku: string;
  barcode: string | null;
  status: string;
  availability: string;
  shortDescription: string | null;
  description: string | null;

  jewelleryType: string;
  metalType: string;
  metalPurity: string | null;
  material: string | null;
  hallmarked: boolean;
  hallmarkNumber: string | null;
  certificateUrl: string | null;
  grossWeightG: string | null;
  netWeightG: string | null;
  stoneWeightCt: string | null;
  stoneType: string | null;
  countryOfOrigin: string | null;
  careInstructions: string | null;
  isCustomisable: boolean;
  isCouplePair: boolean;

  pricingMode: string;
  /** Visible here and nowhere public. The shop's own margin. */
  costPrice: string | null;
  price: string | null;
  salePrice: string | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  makingCharge: string | null;
  makingChargeType: string;
  wastagePercent: string | null;
  taxable: boolean;
  taxRate: string | null;

  isFeatured: boolean;
  isNewArrival: boolean;
  requiresShipping: boolean;
  shipWeightG: string | null;
  seoTitle: string | null;
  seoDesc: string | null;
  tags: string[];

  primaryCategoryId: string | null;
  brandId: string | null;
  media: { id: string; url: string; altText: string | null; isPrimary: boolean }[];

  variantCount: number;
  archived: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Everything the product form needs to render its selects. One round trip. */
export interface CatalogueMetaView {
  store: { id: string; slug: string; name: string; currency: string; currencySymbol: string };
  categories: { id: string; name: string; parentName: string | null }[];
  brands: { id: string; name: string }[];
  counts: { total: number; active: number; draft: number; archived: number };
  options: {
    status: string[];
    availability: string[];
    jewelleryType: string[];
    metalType: string[];
    pricingMode: string[];
    makingChargeType: string[];
  };
  /** Known purities per metal, so the form can suggest without forcing. */
  purities: Record<string, { code: string; label: string }[]>;
  /** False until a storage provider is configured; the UI asks for URLs then. */
  mediaUploadEnabled: boolean;
}
