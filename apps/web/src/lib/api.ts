import 'server-only';

/**
 * The one way the web app reaches data.
 *
 * It is server-only on purpose. Every storefront page is a Server Component,
 * so the browser never learns the API address, never sends a cross-origin
 * request for catalogue data, and cannot be pointed at a different store by
 * editing a fetch in devtools. The `x-store-slug` header below is set here,
 * from the route segment Next matched - not from anything the visitor typed.
 */

const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:4000/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

interface RequestOptions {
  /** Which store the request is for. Omitted for platform-level endpoints. */
  storeSlug?: string;
  /** Seconds to cache. 0 disables caching for this request. */
  revalidate?: number;
  query?: Record<string, string | number | undefined>;
}

/**
 * The cache tag every storefront read for one shop carries.
 *
 * The timer alone is not enough. A shop owner who edits a price and then looks
 * at their own storefront has to see the new one; waiting out a revalidation
 * window looks exactly like the save having failed, and the obvious reaction
 * is to save again. So writes from the dashboard drop this tag
 * (`revalidateStore`), and the timer is only a backstop for changes that did
 * not come through this app - a seed script, or a direct database edit.
 */
export function storeCacheTag(storeSlug: string): string {
  return `store:${storeSlug}`;
}

export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.storeSlug) headers['x-store-slug'] = options.storeSlug;

  const response = await fetch(url, {
    headers,
    next: {
      revalidate: options.revalidate ?? 30,
      // Tagged by shop, not by endpoint, because one edit can change several
      // pages: a price shows on the product, the listing and the home rails.
      // Listing each one would mean remembering to add the next.
      ...(options.storeSlug ? { tags: [storeCacheTag(options.storeSlug)] } : {}),
    },
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error: { code?: string; message?: string } }).error
        : null;

    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed with ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

/** True when the API is unreachable, as opposed to answering with an error. */
export function isConnectionError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && 'cause' in error);
}
