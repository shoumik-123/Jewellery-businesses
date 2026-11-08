import { Injectable } from '@nestjs/common';
import {
  JewelleryType,
  MakingChargeType,
  MetalType,
  Prisma,
  PricingMode,
  ProductAvailability,
  ProductStatus,
  type TransactionClient,
} from '@jh/db';
import { ErrorCodes } from '@jh/shared/errors';
import { PURITIES_BY_METAL } from '@jh/shared/jewellery';
import { ApiError } from '../../core/http/api-error.js';
import { DatabaseService } from '../../core/database/database.service.js';
import {
  type CatalogueMetaView,
  type CreateProductInput,
  type ManageProductQuery,
  type ProductEditView,
  type ProductRowView,
  type UpdateProductInput,
} from './catalogue.dto.js';
import { moneyOut, weightOut, type Paginated } from '../storefront/storefront.dto.js';

/**
 * The columns a shop may set on its own product, and nothing else.
 *
 * Deliberately a hand-written list rather than `Prisma.ProductUpdateInput`:
 * the Prisma type is everything the table has, and this is the subset a
 * request is allowed to reach. Money and weights stay strings all the way to
 * Prisma, which parses them straight into DECIMAL.
 *
 * `primaryCategoryId` and `brandId` appear as plain foreign keys, which means
 * every write here uses Prisma's unchecked input - the same variant that lets
 * `storeId` be set explicitly. That is what we want: the store id is stated in
 * the data, matching the `where`, matching the row-level-security check.
 */
interface ProductScalars {
  barcode?: string | null;
  status?: ProductStatus;
  availability?: ProductAvailability;
  shortDescription?: string | null;
  description?: string | null;

  jewelleryType?: JewelleryType;
  metalType?: MetalType;
  metalPurity?: string | null;
  material?: string | null;
  hallmarked?: boolean;
  hallmarkNumber?: string | null;
  certificateUrl?: string | null;
  grossWeightG?: string | null;
  netWeightG?: string | null;
  stoneWeightCt?: string | null;
  stoneType?: string | null;
  countryOfOrigin?: string | null;
  careInstructions?: string | null;
  isCustomisable?: boolean;
  isCouplePair?: boolean;

  pricingMode?: PricingMode;
  costPrice?: string | null;
  price?: string;
  salePrice?: string | null;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  makingCharge?: string | null;
  makingChargeType?: MakingChargeType;
  wastagePercent?: string | null;
  taxable?: boolean;
  taxRate?: string | null;

  isFeatured?: boolean;
  isNewArrival?: boolean;
  requiresShipping?: boolean;
  shipWeightG?: string | null;
  seoTitle?: string | null;
  seoDesc?: string | null;
  tags?: string[];

  primaryCategoryId?: string | null;
  brandId?: string | null;
}

/**
 * A shop managing its own catalogue.
 *
 * Every statement runs inside `withTenant`, which issues `SET LOCAL ROLE
 * app_runtime` and pins `app.current_store_id` for the transaction. So there
 * are two independent guards on each write:
 *
 *   1. the explicit `storeId` in the `where`, which also drives the compound
 *      indexes, and
 *   2. row-level security, which makes a mistake in (1) return nothing - or
 *      refuse the insert - instead of touching another shop's row.
 *
 * The second is the one that matters. The first is the one that will be got
 * wrong one day.
 */
@Injectable()
export class CatalogueService {
  constructor(private readonly db: DatabaseService) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  private static readonly rowSelect = {
    id: true,
    slug: true,
    name: true,
    sku: true,
    status: true,
    availability: true,
    jewelleryType: true,
    metalType: true,
    metalPurity: true,
    price: true,
    salePrice: true,
    netWeightG: true,
    isFeatured: true,
    updatedAt: true,
    deletedAt: true,
    primaryCategory: { select: { name: true } },
    _count: { select: { variants: true } },
    media: {
      where: { type: 'IMAGE' as const },
      orderBy: [{ isPrimary: 'desc' as const }, { position: 'asc' as const }],
      take: 1,
      select: { url: true },
    },
  } satisfies Prisma.ProductSelect;

  async list(storeId: string, query: ManageProductQuery): Promise<Paginated<ProductRowView>> {
    return this.db.withTenant({ storeId }, async (tx) => {
      const where: Prisma.ProductWhereInput = { storeId, deletedAt: null };

      if (query.status) {
        where.status = query.status;
      } else if (!query.includeArchived) {
        // The default list is the shop's working catalogue. Archived pieces are
        // kept forever (orders reference them) but they are not today's work.
        where.status = { not: ProductStatus.ARCHIVED };
      }
      if (query.type) where.jewelleryType = query.type;
      if (query.metal) where.metalType = query.metal;
      if (query.categoryId) where.primaryCategoryId = query.categoryId;
      if (query.q) {
        // Parameterised by Prisma. `contains` is escaped, never interpolated.
        where.OR = [
          { name: { contains: query.q, mode: 'insensitive' } },
          { sku: { contains: query.q, mode: 'insensitive' } },
          { barcode: { contains: query.q, mode: 'insensitive' } },
          { tags: { has: query.q.toLowerCase() } },
        ];
      }

      const total = await tx.product.count({ where });
      const rows = await tx.product.findMany({
        where,
        orderBy: CatalogueService.orderFor(query.sort),
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: CatalogueService.rowSelect,
      });

      return {
        items: rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          sku: row.sku,
          status: row.status,
          availability: row.availability,
          jewelleryType: row.jewelleryType,
          metalType: row.metalType,
          metalPurity: row.metalPurity,
          price: moneyOut(row.price),
          salePrice: moneyOut(row.salePrice),
          netWeightG: weightOut(row.netWeightG),
          isFeatured: row.isFeatured,
          variantCount: row._count.variants,
          primaryImage: row.media[0]?.url ?? null,
          categoryName: row.primaryCategory?.name ?? null,
          updatedAt: row.updatedAt.toISOString(),
          archived: row.status === ProductStatus.ARCHIVED,
        })),
        meta: {
          page: query.page,
          perPage: query.perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.perPage)),
        },
      };
    });
  }

  async get(storeId: string, productId: string): Promise<ProductEditView> {
    return this.db.withTenant({ storeId }, async (tx) =>
      CatalogueService.toEditView(await CatalogueService.findOrFail(tx, storeId, productId)),
    );
  }

  /** Categories, brands, counts and the enum lists the product form needs. */
  async meta(storeId: string): Promise<CatalogueMetaView> {
    return this.db.withTenant({ storeId }, async (tx) => {
      const store = await tx.store.findFirst({
        where: { id: storeId, deletedAt: null },
        select: { id: true, slug: true, name: true, currency: true, currencySymbol: true },
      });
      if (!store) throw ApiError.notFound('Shop not found.');

      const [categories, brands, grouped] = await Promise.all([
        tx.category.findMany({
          where: { storeId, deletedAt: null },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, parent: { select: { name: true } } },
        }),
        tx.brand.findMany({
          where: { storeId, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        }),
        tx.product.groupBy({
          by: ['status'],
          where: { storeId, deletedAt: null },
          _count: { _all: true },
        }),
      ]);

      const countFor = (status: ProductStatus): number =>
        grouped.find((group) => group.status === status)?._count._all ?? 0;

      return {
        store,
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          parentName: category.parent?.name ?? null,
        })),
        brands,
        counts: {
          total: grouped.reduce((sum, group) => sum + group._count._all, 0),
          active: countFor(ProductStatus.ACTIVE),
          draft: countFor(ProductStatus.DRAFT),
          archived: countFor(ProductStatus.ARCHIVED),
        },
        options: {
          status: Object.values(ProductStatus),
          availability: Object.values(ProductAvailability),
          jewelleryType: Object.values(JewelleryType),
          metalType: Object.values(MetalType),
          pricingMode: Object.values(PricingMode),
          makingChargeType: Object.values(MakingChargeType),
        },
        purities: Object.fromEntries(
          Object.entries(PURITIES_BY_METAL).map(([metal, specs]) => [
            metal,
            specs.map((spec) => ({ code: spec.code, label: spec.label })),
          ]),
        ),
        // Uploading needs Cloudinary or S3 credentials. Until they are
        // configured the editor asks for image addresses, which is real
        // functionality; an upload button that stored nothing would not be.
        mediaUploadEnabled: false,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  async create(storeId: string, input: CreateProductInput): Promise<ProductEditView> {
    return this.db.withTenant({ storeId }, async (tx) => {
      await CatalogueService.assertReferencesBelongToStore(tx, storeId, input);
      await CatalogueService.assertSkuAvailable(tx, storeId, input.sku, null);

      const slug = await CatalogueService.resolveSlug(
        tx,
        storeId,
        input.slug ?? CatalogueService.slugify(input.name),
        null,
      );

      const created = await CatalogueService.guardUnique(() =>
        tx.product.create({
          data: {
            ...CatalogueService.scalarData(input),
            storeId,
            slug,
            name: input.name,
            sku: input.sku,
            // Restated after the spread because these two are required by the
            // table, and the spread's type says only "maybe present".
            jewelleryType: input.jewelleryType,
            price: input.price,
            // A piece is only "published" once it is actually visible. The
            // storefront shows ACTIVE products, so that is the moment.
            publishedAt: input.status === ProductStatus.ACTIVE ? new Date() : null,
            ...(input.media && input.media.length > 0
              ? { media: { create: CatalogueService.mediaRows(storeId, input.media) } }
              : {}),
          },
          select: { id: true },
        }),
      );

      return CatalogueService.toEditView(
        await CatalogueService.findOrFail(tx, storeId, created.id),
      );
    });
  }

  async update(
    storeId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductEditView> {
    return this.db.withTenant({ storeId }, async (tx) => {
      const existing = await CatalogueService.findOrFail(tx, storeId, productId);
      await CatalogueService.assertReferencesBelongToStore(tx, storeId, input);
      if (input.sku !== undefined) {
        await CatalogueService.assertSkuAvailable(tx, storeId, input.sku, productId);
      }

      // Cross-field rules in the schema can only see what was sent. A partial
      // update has to be checked against the row it is landing on, or sending
      // `price` alone could leave a sale price above it.
      CatalogueService.assertCoherentAfterMerge(existing, input);

      const data: ProductScalars & {
        name?: string;
        sku?: string;
        slug?: string;
        publishedAt?: Date;
      } = {
        ...CatalogueService.scalarData(input),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.sku !== undefined && { sku: input.sku }),
      };

      if (input.slug !== undefined) {
        data.slug = await CatalogueService.resolveSlug(tx, storeId, input.slug, productId);
      }

      // publishedAt records the first time a piece went live, so it is set
      // once and never moved by a later edit.
      if (input.status === ProductStatus.ACTIVE && existing.publishedAt === null) {
        data.publishedAt = new Date();
      }

      await CatalogueService.guardUnique(() =>
        tx.product.update({ where: { id: productId }, data }),
      );

      if (input.media !== undefined) {
        // Replace rather than merge: the editor sends the gallery it wants,
        // and a diff would need stable client-side ids it does not have.
        await tx.productMedia.deleteMany({ where: { productId, storeId } });
        if (input.media.length > 0) {
          await tx.productMedia.createMany({
            data: CatalogueService.mediaRows(storeId, input.media).map((row) => ({
              ...row,
              productId,
            })),
          });
        }
      }

      return CatalogueService.toEditView(await CatalogueService.findOrFail(tx, storeId, productId));
    });
  }

  /**
   * Archive, which is what "delete" means here.
   *
   * Orders snapshot a product but still reference it, so removing the row
   * would break a customer's order history and the shop's own sales reports.
   * Archiving takes it off the storefront, keeps it in the shop's list behind
   * a filter, and stays reversible.
   */
  async archive(storeId: string, productId: string): Promise<ProductEditView> {
    return this.db.withTenant({ storeId }, async (tx) => {
      await CatalogueService.findOrFail(tx, storeId, productId);
      await tx.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ARCHIVED },
      });
      return CatalogueService.toEditView(await CatalogueService.findOrFail(tx, storeId, productId));
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * One lookup, one failure mode.
   *
   * `findFirst` with the storeId rather than `findUnique` by id: with RLS on,
   * another shop's id returns nothing here, and the 404 is the same answer as
   * an id that was never real. A 403 would confirm the product exists, which
   * is how a competitor enumerates a catalogue.
   */
  private static async findOrFail(tx: TransactionClient, storeId: string, productId: string) {
    const row = await tx.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      include: {
        media: {
          orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
          select: { id: true, url: true, altText: true, isPrimary: true },
        },
        _count: { select: { variants: true } },
      },
    });
    if (!row) throw ApiError.notFound('Product not found.');
    return row;
  }

  /**
   * A category or brand from another shop must not be attachable.
   *
   * RLS already makes the row invisible, so the lookup below finds nothing and
   * this throws - but a bare foreign-key violation would surface as a 500. The
   * explicit check turns it into a field error the form can show.
   */
  private static async assertReferencesBelongToStore(
    tx: TransactionClient,
    storeId: string,
    input: { primaryCategoryId?: string | null | undefined; brandId?: string | null | undefined },
  ): Promise<void> {
    if (input.primaryCategoryId) {
      const category = await tx.category.findFirst({
        where: { id: input.primaryCategoryId, storeId, deletedAt: null },
        select: { id: true },
      });
      if (!category) {
        throw new ApiError(ErrorCodes.VALIDATION_FAILED, 'Check the details and try again.', {
          primaryCategoryId: ['That category is not one of this shop’s categories.'],
        });
      }
    }

    if (input.brandId) {
      const brand = await tx.brand.findFirst({
        where: { id: input.brandId, storeId },
        select: { id: true },
      });
      if (!brand) {
        throw new ApiError(ErrorCodes.VALIDATION_FAILED, 'Check the details and try again.', {
          brandId: ['That brand is not one of this shop’s brands.'],
        });
      }
    }
  }

  /**
   * Re-checks the pair rules against the merged row.
   *
   * The schema validated the request in isolation. This validates the result,
   * which is the thing that actually has to make sense.
   */
  private static assertCoherentAfterMerge(
    existing: { price: Prisma.Decimal; salePrice: Prisma.Decimal | null },
    input: UpdateProductInput,
  ): void {
    const price =
      input.price !== undefined ? Number.parseFloat(input.price) : Number(existing.price);

    const salePrice =
      input.salePrice === undefined
        ? existing.salePrice === null
          ? null
          : Number(existing.salePrice)
        : input.salePrice === null
          ? null
          : Number.parseFloat(input.salePrice);

    if (salePrice !== null && salePrice >= price) {
      throw new ApiError(ErrorCodes.VALIDATION_FAILED, 'Check the details and try again.', {
        salePrice: ['The sale price has to be below the regular price.'],
      });
    }
  }

  /**
   * Maps validated input onto Prisma scalars.
   *
   * Only keys that were sent are included, which is how a partial update
   * leaves the rest alone, and an explicit `null` clears a nullable column.
   *
   * Writing all forty fields out is the point. A `...input` spread would
   * quietly accept whatever a future schema change adds, including the columns
   * a shop must not be able to set on itself - `soldCount`, `ratingAverage`,
   * `viewCount` are the shop's own marketing numbers if they are writable.
   *
   * Money and weights are passed through as the strings they arrived as.
   * Prisma parses them into DECIMAL directly; converting to a JavaScript
   * number on the way would be the one thing the schema's Decimal columns
   * exist to prevent.
   */
  private static scalarData(input: UpdateProductInput): ProductScalars {
    return {
      ...(input.barcode !== undefined && { barcode: input.barcode }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.availability !== undefined && { availability: input.availability }),
      ...(input.shortDescription !== undefined && { shortDescription: input.shortDescription }),
      ...(input.description !== undefined && { description: input.description }),

      ...(input.jewelleryType !== undefined && { jewelleryType: input.jewelleryType }),
      ...(input.metalType !== undefined && { metalType: input.metalType }),
      ...(input.metalPurity !== undefined && { metalPurity: input.metalPurity }),
      ...(input.material !== undefined && { material: input.material }),
      ...(input.hallmarked !== undefined && { hallmarked: input.hallmarked }),
      ...(input.hallmarkNumber !== undefined && { hallmarkNumber: input.hallmarkNumber }),
      ...(input.certificateUrl !== undefined && { certificateUrl: input.certificateUrl }),
      ...(input.grossWeightG !== undefined && { grossWeightG: input.grossWeightG }),
      ...(input.netWeightG !== undefined && { netWeightG: input.netWeightG }),
      ...(input.stoneWeightCt !== undefined && { stoneWeightCt: input.stoneWeightCt }),
      ...(input.stoneType !== undefined && { stoneType: input.stoneType }),
      ...(input.countryOfOrigin !== undefined && { countryOfOrigin: input.countryOfOrigin }),
      ...(input.careInstructions !== undefined && { careInstructions: input.careInstructions }),
      ...(input.isCustomisable !== undefined && { isCustomisable: input.isCustomisable }),
      ...(input.isCouplePair !== undefined && { isCouplePair: input.isCouplePair }),

      ...(input.pricingMode !== undefined && { pricingMode: input.pricingMode }),
      ...(input.costPrice !== undefined && { costPrice: input.costPrice }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.salePrice !== undefined && { salePrice: input.salePrice }),
      ...(input.saleStartsAt !== undefined && { saleStartsAt: input.saleStartsAt }),
      ...(input.saleEndsAt !== undefined && { saleEndsAt: input.saleEndsAt }),
      ...(input.makingCharge !== undefined && { makingCharge: input.makingCharge }),
      ...(input.makingChargeType !== undefined && { makingChargeType: input.makingChargeType }),
      ...(input.wastagePercent !== undefined && { wastagePercent: input.wastagePercent }),
      ...(input.taxable !== undefined && { taxable: input.taxable }),
      ...(input.taxRate !== undefined && { taxRate: input.taxRate }),

      ...(input.isFeatured !== undefined && { isFeatured: input.isFeatured }),
      ...(input.isNewArrival !== undefined && { isNewArrival: input.isNewArrival }),
      ...(input.requiresShipping !== undefined && { requiresShipping: input.requiresShipping }),
      ...(input.shipWeightG !== undefined && { shipWeightG: input.shipWeightG }),
      ...(input.seoTitle !== undefined && { seoTitle: input.seoTitle }),
      ...(input.seoDesc !== undefined && { seoDesc: input.seoDesc }),
      ...(input.tags !== undefined && { tags: input.tags }),

      ...(input.primaryCategoryId !== undefined && {
        primaryCategoryId: input.primaryCategoryId,
      }),
      ...(input.brandId !== undefined && { brandId: input.brandId }),
    };
  }

  private static mediaRows(
    storeId: string,
    media: readonly { url: string; altText?: string | undefined }[],
  ) {
    return media.map((item, index) => ({
      storeId,
      url: item.url,
      altText: item.altText ?? null,
      position: index,
      // First one wins. A gallery with no primary image is a product card with
      // no picture, so the order the shop chose decides it rather than a flag
      // they have to remember to tick.
      isPrimary: index === 0,
    }));
  }

  /** Lowercase, hyphenated, ASCII-safe. Bengali names fall back to the SKU. */
  private static slugify(name: string): string {
    const slug = name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70)
      .replace(/-+$/g, '');
    return slug.length >= 3 ? slug : '';
  }

  /**
   * Makes a slug unique within the shop before the insert, rather than letting
   * the unique index reject it.
   *
   * A shop with two "Gold Chain" pieces is normal, and refusing the second one
   * over a URL they never typed would be a baffling error. A suffix is added
   * instead; an address the shop *did* type is left to fail loudly.
   */
  private static async resolveSlug(
    tx: TransactionClient,
    storeId: string,
    desired: string,
    excludeProductId: string | null,
  ): Promise<string> {
    if (desired === '') {
      // Nothing usable came out of the name - a fully non-Latin title, for
      // instance. The caller's SKU is already unique per shop, so it is a
      // better fallback than a random string.
      throw new ApiError(ErrorCodes.VALIDATION_FAILED, 'Check the details and try again.', {
        slug: ['Give the piece a web address — the name has no Latin letters to use.'],
      });
    }

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? desired : `${desired}-${attempt + 1}`;
      const clash = await tx.product.findFirst({
        where: {
          storeId,
          slug: candidate,
          ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
        },
        select: { id: true },
      });
      if (!clash) return candidate;
    }

    throw new ApiError(ErrorCodes.SLUG_TAKEN, 'Too many pieces share that web address.');
  }

  /**
   * A SKU is the shop's own code for a piece and has to be unique within the
   * shop, so a clash gets a named field rather than a database error.
   *
   * Checked up front rather than caught afterwards, for the same reason
   * `resolveSlug` resolves before inserting: the unique index does report the
   * clash, but which column it was about is only discoverable through the
   * driver's error payload, and that shape is not part of Prisma's contract.
   * `guardUnique` is still there for the race this check cannot win.
   */
  private static async assertSkuAvailable(
    tx: TransactionClient,
    storeId: string,
    sku: string,
    excludeProductId: string | null,
  ): Promise<void> {
    const clash = await tx.product.findFirst({
      where: {
        storeId,
        sku,
        ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      },
      select: { name: true },
    });

    if (clash) {
      throw new ApiError(ErrorCodes.SKU_TAKEN, `“${clash.name}” already uses the SKU ${sku}.`, {
        sku: ['Another piece in this shop already uses that SKU.'],
      });
    }
  }

  /**
   * The backstop for two writes racing on the same SKU or address.
   *
   * It cannot say *which* index was hit: under the pg driver adapter the
   * constraint name is buried in a driver-specific payload that Prisma does
   * not promise to keep, and guessing wrong would send a shop owner off to
   * edit the field that was never the problem. The deterministic checks above
   * handle every non-concurrent case, so this one only has to be honest.
   */
  private static async guardUnique<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(
          ErrorCodes.CONFLICT,
          'Another piece was saved with the same SKU or web address a moment ago. Try again.',
        );
      }
      throw error;
    }
  }

  private static orderFor(
    sort: ManageProductQuery['sort'],
  ): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'newest':
        return [{ createdAt: 'desc' }];
      case 'oldest':
        return [{ createdAt: 'asc' }];
      case 'name':
        return [{ name: 'asc' }];
      case 'price_asc':
        return [{ price: 'asc' }];
      case 'price_desc':
        return [{ price: 'desc' }];
      case 'updated':
      default:
        return [{ updatedAt: 'desc' }];
    }
  }

  private static toEditView(row: {
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
    grossWeightG: Prisma.Decimal | null;
    netWeightG: Prisma.Decimal | null;
    stoneWeightCt: Prisma.Decimal | null;
    stoneType: string | null;
    countryOfOrigin: string | null;
    careInstructions: string | null;
    isCustomisable: boolean;
    isCouplePair: boolean;
    pricingMode: string;
    costPrice: Prisma.Decimal | null;
    price: Prisma.Decimal;
    salePrice: Prisma.Decimal | null;
    saleStartsAt: Date | null;
    saleEndsAt: Date | null;
    makingCharge: Prisma.Decimal | null;
    makingChargeType: string;
    wastagePercent: Prisma.Decimal | null;
    taxable: boolean;
    taxRate: Prisma.Decimal | null;
    isFeatured: boolean;
    isNewArrival: boolean;
    requiresShipping: boolean;
    shipWeightG: Prisma.Decimal | null;
    seoTitle: string | null;
    seoDesc: string | null;
    tags: string[];
    primaryCategoryId: string | null;
    brandId: string | null;
    media: { id: string; url: string; altText: string | null; isPrimary: boolean }[];
    _count: { variants: number };
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ProductEditView {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      status: row.status,
      availability: row.availability,
      shortDescription: row.shortDescription,
      description: row.description,

      jewelleryType: row.jewelleryType,
      metalType: row.metalType,
      metalPurity: row.metalPurity,
      material: row.material,
      hallmarked: row.hallmarked,
      hallmarkNumber: row.hallmarkNumber,
      certificateUrl: row.certificateUrl,
      grossWeightG: weightOut(row.grossWeightG),
      netWeightG: weightOut(row.netWeightG),
      stoneWeightCt: weightOut(row.stoneWeightCt),
      stoneType: row.stoneType,
      countryOfOrigin: row.countryOfOrigin,
      careInstructions: row.careInstructions,
      isCustomisable: row.isCustomisable,
      isCouplePair: row.isCouplePair,

      pricingMode: row.pricingMode,
      costPrice: moneyOut(row.costPrice),
      price: moneyOut(row.price),
      salePrice: moneyOut(row.salePrice),
      saleStartsAt: row.saleStartsAt?.toISOString() ?? null,
      saleEndsAt: row.saleEndsAt?.toISOString() ?? null,
      makingCharge: moneyOut(row.makingCharge),
      makingChargeType: row.makingChargeType,
      wastagePercent: row.wastagePercent?.toString() ?? null,
      taxable: row.taxable,
      taxRate: row.taxRate?.toString() ?? null,

      isFeatured: row.isFeatured,
      isNewArrival: row.isNewArrival,
      requiresShipping: row.requiresShipping,
      shipWeightG: weightOut(row.shipWeightG),
      seoTitle: row.seoTitle,
      seoDesc: row.seoDesc,
      tags: row.tags,

      primaryCategoryId: row.primaryCategoryId,
      brandId: row.brandId,
      media: row.media,

      variantCount: row._count.variants,
      archived: row.status === ProductStatus.ARCHIVED,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
