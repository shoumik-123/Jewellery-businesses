import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { StorePermission } from '@jh/shared/constants';
import type { AppRequest } from '../http/app-request.js';
import type { Principal, StoreMembership } from './principal.js';

/**
 * Marks a route as reachable without a session.
 *
 * Opt-out rather than opt-in: AuthGuard is global, so a new controller is
 * protected by default and a developer has to say out loud that something is
 * public. The reverse default is how unguarded endpoints ship.
 */
export const IS_PUBLIC = 'auth:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Requires a platform-scope permission, e.g. 'platform:store:read'. */
export const PLATFORM_PERMISSION = 'auth:platformPermission';
export const RequirePlatformPermission = (permission: string) =>
  SetMetadata(PLATFORM_PERMISSION, permission);

/** The authenticated user. Only valid on a route AuthGuard protects. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<AppRequest>();
    if (!request.principal) {
      throw new Error('CurrentPrincipal used on a route that is marked @Public()');
    }
    return request.principal;
  },
);

/**
 * Requires a store-scope permission on the store named by the route's
 * `:storeId` parameter. Enforced by StorePermissionGuard, which the controller
 * has to apply - the global AuthGuard deliberately knows nothing about stores,
 * because a store check needs a storeId and only the route knows where that is.
 *
 * Typed as StorePermission rather than string so a misspelled permission is a
 * compile error instead of a route nobody can reach.
 */
export const STORE_PERMISSION = 'auth:storePermission';
export const RequireStorePermission = (permission: StorePermission) =>
  SetMetadata(STORE_PERMISSION, permission);

/**
 * The caller's membership of the store in the route. Carries the resolved
 * permission set, so a handler that needs a second check does not go back to
 * the database for it.
 */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StoreMembership => {
    const request = context.switchToHttp().getRequest<AppRequest>();
    if (!request.membership) {
      throw new Error('CurrentMembership used on a route without StorePermissionGuard');
    }
    return request.membership;
  },
);
