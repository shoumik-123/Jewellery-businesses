import 'server-only';
import { notFound } from 'next/navigation';
import { STORE_PERMISSIONS, type StorePermission } from '@jh/shared/constants';
import { requireUser, type SessionUser } from './session';

/**
 * Resolving a dashboard URL's `[storeSlug]` to the caller's membership.
 *
 * The slug in the URL is not authority. It is matched against the shops the
 * session actually belongs to, and anything else is a 404 - the same answer as
 * a shop that does not exist, so the dashboard cannot be used to find out
 * which shops are on the platform.
 *
 * This is a convenience, not the control. Every call the page then makes is
 * checked again by the API against the same session, and the API's answer is
 * the one that counts. Hiding a button is courtesy; the endpoint refusing is
 * security.
 */

export type StoreAccess = SessionUser['stores'][number];

export interface DashboardContext {
  user: SessionUser;
  store: StoreAccess;
}

export async function requireStore(storeSlug: string, returnTo: string): Promise<DashboardContext> {
  const user = await requireUser(returnTo);
  const store = user.stores.find((candidate) => candidate.slug === storeSlug);
  if (!store) notFound();
  return { user, store };
}

/** Does this membership hold the permission? Used to decide what to render. */
export function can(store: StoreAccess, permission: StorePermission): boolean {
  return store.permissions.includes(permission);
}

export { STORE_PERMISSIONS };
