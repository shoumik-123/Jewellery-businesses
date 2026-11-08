import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCodes } from '@jh/shared/errors';
import { ApiError } from '../http/api-error.js';
import type { AppRequest } from '../http/app-request.js';
import { STORE_PERMISSION } from './decorators.js';

/**
 * Checks a store-scope permission against the `:storeId` in the route.
 *
 * Separate from the global AuthGuard on purpose. A platform permission is a
 * property of the user alone, so the global guard can check it; a store
 * permission needs to know *which* store, and only the route knows where the
 * id is. Folding this into the global guard would mean the guard parsing route
 * parameters for every request, including the ones that have no store.
 *
 * Two distinct refusals, and the difference is deliberate:
 *
 *   not a member of this store -> 404, the same answer as a store that does
 *                                 not exist. A 403 would confirm the id is
 *                                 real, which turns this endpoint into a
 *                                 directory of every shop on the platform.
 *   a member, wrong permission -> 403. They already know the shop exists;
 *                                 hiding it would only confuse a staff member
 *                                 who genuinely needs access widened.
 *
 * A super admin is not an exception here. Platform staff reaching into a
 * tenant's catalogue is a separate, audited path (docs/03-multi-tenancy.md
 * section 8) - not an implicit override, because one compromised admin
 * account would otherwise be every shop's catalogue.
 */
@Injectable()
export class StorePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(STORE_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);

    // A programming error, not a request error: this guard was applied to a
    // route that never said what it needs. Failing loudly beats defaulting to
    // "allow" (a hole) or "deny" (a route nobody can reach, found in staging).
    if (required === undefined) {
      throw new Error(
        `${context.getClass().name}.${context.getHandler().name} uses StorePermissionGuard ` +
          'without @RequireStorePermission(...).',
      );
    }

    const request = context.switchToHttp().getRequest<AppRequest>();

    // Set by the global AuthGuard, which always runs first. If it is missing,
    // the route is marked @Public() - a store permission on a public route is
    // a contradiction worth failing on.
    const principal = request.principal;
    if (!principal) {
      throw new Error(
        `${context.getClass().name}.${context.getHandler().name} is @Public() but requires a ` +
          'store permission.',
      );
    }

    const storeId = request.params['storeId'];
    if (typeof storeId !== 'string' || storeId.length === 0) {
      throw new Error(
        `${context.getClass().name}.${context.getHandler().name} requires a store permission but ` +
          'its path has no :storeId parameter.',
      );
    }

    const membership = principal.memberships.get(storeId);
    if (!membership) throw ApiError.notFound('Shop not found.');

    if (!membership.permissions.has(required)) {
      throw new ApiError(ErrorCodes.PERMISSION_DENIED);
    }

    request.membership = membership;
    return true;
  }
}
