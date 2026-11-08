import { Body, Controller, Get, Post } from '@nestjs/common';
import { PLATFORM_PERMISSIONS } from '@jh/shared/constants';
import { CurrentPrincipal, RequirePlatformPermission } from '../../core/auth/decorators.js';
import type { Principal } from '../../core/auth/principal.js';
import { ZodBodyPipe } from '../../core/http/zod-body.pipe.js';
import { createStoreSchema, type CreateStoreInput } from './admin.dto.js';
import { AdminService, type CreatedStore, type StoreSummary } from './admin.service.js';

/**
 * The Super Admin console's API.
 *
 * Every route here requires a platform permission, checked by the global
 * AuthGuard. Being a store owner - even of every store - grants nothing on
 * these endpoints.
 */
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stores')
  @RequirePlatformPermission(PLATFORM_PERMISSIONS.STORE_READ)
  listStores(): Promise<StoreSummary[]> {
    return this.admin.listStores();
  }

  @Post('stores')
  @RequirePlatformPermission(PLATFORM_PERMISSIONS.STORE_WRITE)
  createStore(
    @Body(new ZodBodyPipe(createStoreSchema)) body: CreateStoreInput,
    @CurrentPrincipal() principal: Principal,
  ): Promise<CreatedStore> {
    return this.admin.createStore(body, principal.userId);
  }
}
