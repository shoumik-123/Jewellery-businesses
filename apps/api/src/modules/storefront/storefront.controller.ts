import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../core/auth/decorators.js';
import { CurrentStore, StorefrontStoreGuard } from '../../core/tenancy/storefront-store.guard.js';
import type { ResolvedStore } from '../../core/tenancy/store-resolver.service.js';
import { ZodQueryPipe } from '../../core/http/zod-query.pipe.js';
import { productQuerySchema, type ProductQuery } from './storefront.dto.js';
import { StorefrontService } from './storefront.service.js';

/**
 * The public catalogue. No authentication: these responses are what a visitor
 * to the shop would see anyway. Which store they describe is decided by the
 * guard, not by anything in the path.
 */
@Controller('storefront')
@Public()
@UseGuards(StorefrontStoreGuard)
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get('store')
  @Header('Cache-Control', 'public, max-age=60')
  getStore(@CurrentStore() store: ResolvedStore) {
    return this.storefront.getStore(store);
  }

  @Get('home')
  @Header('Cache-Control', 'public, max-age=60')
  getHome(@CurrentStore() store: ResolvedStore) {
    return this.storefront.getHome(store);
  }

  @Get('products')
  @Header('Cache-Control', 'public, max-age=30')
  listProducts(
    @CurrentStore() store: ResolvedStore,
    @Query(new ZodQueryPipe(productQuerySchema)) query: ProductQuery,
  ) {
    return this.storefront.listProducts(store, query);
  }

  @Get('products/:slug')
  @Header('Cache-Control', 'public, max-age=60')
  getProduct(@CurrentStore() store: ResolvedStore, @Param('slug') slug: string) {
    return this.storefront.getProduct(store, slug);
  }
}
