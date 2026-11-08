import type { Request } from 'express';
import type { ResolvedStore } from '../tenancy/store-resolver.service.js';

/**
 * What the middleware and guard chain may attach to a request, stated as one
 * explicit type rather than a global `declare module` augmentation.
 *
 * The difference matters: a global augmentation silently widens every Express
 * Request in the program, so a handler can read `req.store` on a route that
 * never ran the guard and get `undefined` at runtime with no type error. Here,
 * a handler has to ask for this type deliberately.
 */
export interface AppRequest extends Request {
  /** Set by RequestIdMiddleware. Correlates logs, errors and audit rows. */
  id?: string;
  /** Set by StorefrontStoreGuard. Never assigned from user input directly. */
  store?: ResolvedStore;
}
