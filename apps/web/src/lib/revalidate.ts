import 'server-only';
import { revalidateTag } from 'next/cache';
import { storeCacheTag } from './api';
import { currentUser } from './session';

/**
 * Drops the cached storefront reads for one shop after the shop has changed
 * something about its catalogue.
 *
 * The write routes know the shop by id; the storefront caches by slug, because
 * that is what its URLs carry. This translates one to the other using the
 * caller's own session, which already lists both for every shop they belong
 * to - no extra lookup, and no way to invalidate a shop the caller has nothing
 * to do with.
 *
 * It is called only after the API has accepted a write, so it never runs for
 * a request that was refused. A failure to find the shop is ignored rather
 * than raised: the write already succeeded, and turning a cache miss into an
 * error response would tell the shop owner their save failed when it did not.
 */
export async function revalidateStore(storeId: string): Promise<void> {
  const user = await currentUser();
  const store = user?.stores.find((candidate) => candidate.storeId === storeId);
  if (!store) return;

  // `{ expire: 0 }` rather than a named cacheLife profile, because the point
  // is that the next read goes to the API, not that it goes sooner. Next 16's
  // `updateTag` would be stricter still, but it only works inside a Server
  // Action; this runs in a route handler.
  revalidateTag(storeCacheTag(store.slug), { expire: 0 });
}
