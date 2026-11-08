import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { AppRequest } from '../http/app-request.js';
import { StoreResolverService } from './store-resolver.service.js';

/**
 * Resolves which store a public storefront request belongs to, and refuses the
 * request if there is not a published one.
 *
 * Resolution order:
 *   1. the Host header - a verified custom domain, or <slug>.ROOT_DOMAIN
 *   2. the x-store-slug header
 *
 * The header fallback exists because local development is path-based
 * (http://localhost:3000/s/aurum-jewellers), where the browser Host carries no
 * store. It is acceptable here and only here: these endpoints are public and
 * unauthenticated, so naming a store proves nothing and grants nothing beyond
 * what that store already publishes. Authenticated endpoints take the store
 * from the session, never from a header - see docs/06-auth-strategy.md.
 */
@Injectable()
export class StorefrontStoreGuard implements CanActivate {
  constructor(private readonly resolver: StoreResolverService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();

    const host = request.header('x-forwarded-host') ?? request.header('host');
    const fromHost = await this.resolver.findByHost(host);

    const store = fromHost
      ? fromHost
      : await this.resolver.requirePublishedStore({ slug: request.header('x-store-slug') });

    if (fromHost) {
      // Re-check status through the same gate, so a suspended store cannot be
      // reached just because its hostname still resolves.
      await this.resolver.requirePublishedStore({ slug: fromHost.slug });
    }

    request.store = store;
    return true;
  }
}

/** The store this request resolved to. Only valid behind StorefrontStoreGuard. */
export const CurrentStore = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AppRequest>();
  if (!request.store) {
    throw new Error('CurrentStore used on a route without StorefrontStoreGuard');
  }
  return request.store;
});
