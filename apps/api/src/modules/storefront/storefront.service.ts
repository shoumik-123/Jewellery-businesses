import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus, StoreStatus, type TransactionClient } from '@jh/db';
import { DatabaseService } from '../../core/database/database.service.js';
import { ApiError } from '../../core/http/api-error.js';
import type { ResolvedStore } from '../../core/tenancy/store-resolver.service.js';
import {
  moneyOut,
  weightOut,
  type CategoryView,
  type Paginated,
  type ProductCardView,
  type ProductDetailView,
  type ProductQuery,
  type StoreView,
} from './storefront.dto.js';

/**
 * Public, read-only catalogue reads.
 *
 * Every query runs through `withTenant`, which issues `SET LOCAL ROLE
 * app_runtime` and sets the store context for the transaction. The explicit
 * `storeId` in each `where` is therefore belt and braces — it is what drives
 * the compound indexes, while row-level security is what makes a mistake here
 * return nothing rather than another store's data.
 */
@Injectable()
export class StorefrontService {
  constructor(private readonly db: DatabaseService) {}

  /** Columns that are safe to publish. Never spread a Product row. */
  private static readonly productCardSelect = {
    id: true,
    slug: true,
    name: true,
    sku: true,
    shortDescription: true,
    jewelleryType: true,
    metalType: true,
    metalPurity: true,
    price: true,
    salePrice: true,
    availability: true,
    isFeatured: true,
    isNewArrival: true,
    hallmarked: true,
    netWeightG: true,
    grossWeightG: true,
    ratingAverage: true,
    ratingCount: true,
    media: {
      where: { type: 'IMAGE' as const },
      orderBy: [{ isPrimary: 'desc' as const }, { position: 'asc' as const }],
      take: 4,
      select: { url: true, altText: true, isPrimary: true },
    },
  } satisfies Prisma.ProductSelect;

  async getStore(store: ResolvedStore): Promise<StoreView> {
    return this.db.withTenant({ storeId: store.id }, async (tx) => {
      const row = await tx.store.findFirst({
        where: { id: store.id, status: StoreStatus.ACTIVE, deletedAt: null },
        select: {
          id: true,
          slug: true,
          name: true,
          tagline: true,
          description: true,
          logoUrl: true,
          currency: true,
          currencySymbol: true,
          locale: true,
          email: true,
          phone: true,
          whatsapp: true,
          city: true,
          district: true,
          country: true,
          settings: { select: { socialLinks: true } },
        },
      });

      if (!row) throw ApiError.notFound('Store not found.');

      const { settings, ...rest } = row;
      return {
        ...rest,
        socialLinks: (settings?.socialLinks as Record<string, unknown> | null) ?? null,
        categories: await this.listCategories(tx, store.id),
      };
    });
  }

  async listCategories(tx: TransactionClient, storeId: string): Promise<CategoryView[]> {
    const rows = await tx.category.findMany({
      where: { storeId, isActive: true, deletedAt: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        imageUrl: true,
        _count: { select: { primaryFor: true } },
      },
    });

    return rows.map(({ _count, ...rest }) => ({ ...rest, productCount: _count.primaryFor }));
  }

  async listProducts(
    store: ResolvedStore,
    query: ProductQuery,
  ): Promise<Paginated<ProductCardView>> {
    return this.db.withTenant({ storeId: store.id }, async (tx) => {
      const where: Prisma.ProductWhereInput = {
        storeId: store.id,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      };

      if (query.category) {
        where.primaryCategory = { slug: query.category };
      }
      if (query.metal) {
        where.metalType = query.metal as Exclude<Prisma.ProductWhereInput['metalType'], undefined>;
      }
      if (query.type) {
        where.jewelleryType = query.type as Exclude<
          Prisma.ProductWhereInput['jewelleryType'],
          undefined
        >;
      }
      if (query.q) {
        // Parameterised by Prisma; `contains` is escaped, never interpolated.
        where.OR = [
          { name: { contains: query.q, mode: 'insensitive' } },
          { shortDescription: { contains: query.q, mode: 'insensitive' } },
          { sku: { contains: query.q, mode: 'insensitive' } },
          { tags: { has: query.q.toLowerCase() } },
        ];
      }

      const total = await tx.product.count({ where });
      const rows = await tx.product.findMany({
        where,
        orderBy: StorefrontService.orderFor(query.sort),
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: StorefrontService.productCardSelect,
      });

      return {
        items: rows.map((row) => StorefrontService.toCard(row)),
        meta: {
          page: query.page,
          perPage: query.perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.perPage)),
        },
      };
    });
  }

  async getProduct(store: ResolvedStore, slug: string): Promise<ProductDetailView> {
    return this.db.withTenant({ storeId: store.id }, async (tx) => {
      const row = await tx.product.findFirst({
        where: {
          storeId: store.id,
          slug,
          status: ProductStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          ...StorefrontService.productCardSelect,
          description: true,
          pricingMode: true,
          makingCharge: true,
          makingChargeType: true,
          wastagePercent: true,
          stoneWeightCt: true,
          stoneType: true,
          material: true,
          hallmarkNumber: true,
          certificateUrl: true,
          careInstructions: true,
          countryOfOrigin: true,
          isCustomisable: true,
          tags: true,
          primaryCategory: { select: { slug: true, name: true } },
          variants: {
            where: { isActive: true, deletedAt: null },
            orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
            select: {
              id: true,
              name: true,
              sku: true,
              ringSize: true,
              lengthCm: true,
              braceletCm: true,
              metalPurity: true,
              price: true,
              salePrice: true,
              netWeightG: true,
              grossWeightG: true,
              isDefault: true,
            },
          },
          gemstones: {
            orderBy: { position: 'asc' },
            select: {
              stoneType: true,
              shape: true,
              count: true,
              caratWeight: true,
              colourGrade: true,
              clarityGrade: true,
              cutGrade: true,
              setting: true,
              certification: true,
            },
          },
        },
      });

      if (!row) throw ApiError.notFound('Product not found.');

      const { primaryCategory, variants, gemstones, ...product } = row;

      return {
        ...StorefrontService.toCard(product),
        description: product.description,
        pricingMode: product.pricingMode,
        makingCharge: moneyOut(product.makingCharge),
        makingChargeType: product.makingChargeType,
        wastagePercent: product.wastagePercent?.toString() ?? null,
        stoneWeightCt: weightOut(product.stoneWeightCt),
        stoneType: product.stoneType,
        material: product.material,
        hallmarkNumber: product.hallmarkNumber,
        certificateUrl: product.certificateUrl,
        careInstructions: product.careInstructions,
        countryOfOrigin: product.countryOfOrigin,
        isCustomisable: product.isCustomisable,
        tags: product.tags,
        category: primaryCategory,
        variants: variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          ringSize: variant.ringSize,
          lengthCm: variant.lengthCm?.toString() ?? null,
          braceletCm: variant.braceletCm?.toString() ?? null,
          metalPurity: variant.metalPurity,
          price: moneyOut(variant.price),
          salePrice: moneyOut(variant.salePrice),
          netWeightG: weightOut(variant.netWeightG),
          grossWeightG: weightOut(variant.grossWeightG),
          isDefault: variant.isDefault,
        })),
        gemstones: gemstones.map((stone) => ({
          stoneType: stone.stoneType,
          shape: stone.shape,
          count: stone.count,
          caratWeight: weightOut(stone.caratWeight),
          colourGrade: stone.colourGrade,
          clarityGrade: stone.clarityGrade,
          cutGrade: stone.cutGrade,
          setting: stone.setting,
          certification: stone.certification,
        })),
      };
    });
  }

  /** Featured and new-arrival rails for the home page. */
  async getHome(store: ResolvedStore): Promise<{
    featured: ProductCardView[];
    newArrivals: ProductCardView[];
    categories: CategoryView[];
  }> {
    return this.db.withTenant({ storeId: store.id }, async (tx) => {
      const base = {
        storeId: store.id,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      } satisfies Prisma.ProductWhereInput;

      const featured = await tx.product.findMany({
        where: { ...base, isFeatured: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
        take: 8,
        select: StorefrontService.productCardSelect,
      });

      const newArrivals = await tx.product.findMany({
        where: base,
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: StorefrontService.productCardSelect,
      });

      return {
        featured: featured.map((row) => StorefrontService.toCard(row)),
        newArrivals: newArrivals.map((row) => StorefrontService.toCard(row)),
        categories: await this.listCategories(tx, store.id),
      };
    });
  }

  private static orderFor(sort: ProductQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
        return [{ price: 'asc' }];
      case 'price_desc':
        return [{ price: 'desc' }];
      case 'name':
        return [{ name: 'asc' }];
      case 'popular':
        return [{ soldCount: 'desc' }, { viewCount: 'desc' }];
      case 'newest':
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  private static toCard(row: {
    id: string;
    slug: string;
    name: string;
    sku: string;
    shortDescription: string | null;
    jewelleryType: string;
    metalType: string;
    metalPurity: string | null;
    price: Prisma.Decimal;
    salePrice: Prisma.Decimal | null;
    availability: string;
    isFeatured: boolean;
    isNewArrival: boolean;
    hallmarked: boolean;
    netWeightG: Prisma.Decimal | null;
    grossWeightG: Prisma.Decimal | null;
    ratingAverage: Prisma.Decimal;
    ratingCount: number;
    media: { url: string; altText: string | null; isPrimary: boolean }[];
  }): ProductCardView {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      sku: row.sku,
      shortDescription: row.shortDescription,
      jewelleryType: row.jewelleryType,
      metalType: row.metalType,
      metalPurity: row.metalPurity,
      price: moneyOut(row.price),
      salePrice: moneyOut(row.salePrice),
      availability: row.availability,
      isFeatured: row.isFeatured,
      isNewArrival: row.isNewArrival,
      hallmarked: row.hallmarked,
      netWeightG: weightOut(row.netWeightG),
      grossWeightG: weightOut(row.grossWeightG),
      ratingAverage: row.ratingAverage.toString(),
      ratingCount: row.ratingCount,
      media: row.media,
    };
  }
}
