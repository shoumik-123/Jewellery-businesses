import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { STORE_PERMISSIONS } from '@jh/shared/constants';
import { CurrentMembership, RequireStorePermission } from '../../core/auth/decorators.js';
import type { StoreMembership } from '../../core/auth/principal.js';
import { StorePermissionGuard } from '../../core/auth/store-permission.guard.js';
import { ZodBodyPipe } from '../../core/http/zod-body.pipe.js';
import { ZodQueryPipe } from '../../core/http/zod-query.pipe.js';
import {
  createProductSchema,
  manageProductQuerySchema,
  updateProductSchema,
  type CatalogueMetaView,
  type CreateProductInput,
  type ManageProductQuery,
  type ProductEditView,
  type ProductRowView,
  type UpdateProductInput,
} from './catalogue.dto.js';
import { CatalogueService } from './catalogue.service.js';
import type { Paginated } from '../storefront/storefront.dto.js';

/**
 * A shop's own catalogue, managed from its dashboard.
 *
 * The store is in the path rather than inferred from the session, because a
 * person can belong to more than one shop - a group that owns two outlets, or
 * an accountant with access to several. Inferring "their shop" would be wrong
 * the first time that happens, and wrong silently.
 *
 * The store id in the path is not trust. StorePermissionGuard turns it into a
 * membership or a 404, and the service then runs every statement under
 * `withTenant`, so row-level security has the final say.
 *
 * Read and write are separate permissions on purpose: a fulfilment staff
 * member needs to look a piece up without being able to change its price.
 */
@Controller('stores/:storeId/products')
@UseGuards(StorePermissionGuard)
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get()
  @RequireStorePermission(STORE_PERMISSIONS.PRODUCT_READ)
  list(
    @CurrentMembership() membership: StoreMembership,
    @Query(new ZodQueryPipe(manageProductQuerySchema)) query: ManageProductQuery,
  ): Promise<Paginated<ProductRowView>> {
    return this.catalogue.list(membership.storeId, query);
  }

  /** Categories, brands, counts and the option lists the editor needs. */
  @Get('meta')
  @RequireStorePermission(STORE_PERMISSIONS.PRODUCT_READ)
  meta(@CurrentMembership() membership: StoreMembership): Promise<CatalogueMetaView> {
    return this.catalogue.meta(membership.storeId);
  }

  @Get(':productId')
  @RequireStorePermission(STORE_PERMISSIONS.PRODUCT_READ)
  get(
    @CurrentMembership() membership: StoreMembership,
    @Param('productId') productId: string,
  ): Promise<ProductEditView> {
    return this.catalogue.get(membership.storeId, productId);
  }

  @Post()
  @RequireStorePermission(STORE_PERMISSIONS.PRODUCT_WRITE)
  create(
    @CurrentMembership() membership: StoreMembership,
    @Body(new ZodBodyPipe(createProductSchema)) body: CreateProductInput,
  ): Promise<ProductEditView> {
    return this.catalogue.create(membership.storeId, body);
  }

  @Patch(':productId')
  @RequireStorePermission(STORE_PERMISSIONS.PRODUCT_WRITE)
  update(
    @CurrentMembership() membership: StoreMembership,
    @Param('productId') productId: string,
    @Body(new ZodBodyPipe(updateProductSchema)) body: UpdateProductInput,
  ): Promise<ProductEditView> {
    return this.catalogue.update(membership.storeId, productId, body);
  }

  /**
   * Archives the piece. There is no hard delete.
   *
   * Orders reference the products they contain, so removing a row would break
   * a customer's order history and the shop's own sales figures. Archiving
   * takes it off the storefront and is reversible from the list.
   */
  @Delete(':productId')
  @RequireStorePermission(STORE_PERMISSIONS.PRODUCT_WRITE)
  archive(
    @CurrentMembership() membership: StoreMembership,
    @Param('productId') productId: string,
  ): Promise<ProductEditView> {
    return this.catalogue.archive(membership.storeId, productId);
  }
}
