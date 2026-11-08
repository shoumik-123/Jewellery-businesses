import { NextResponse, type NextRequest } from 'next/server';

/**
 * Host-based store routing (Next 16 'proxy' convention, formerly middleware).
 *
 * In production each store is reached at <slug>.jewelleryhub.com. Internally
 * every storefront page lives under /s/<slug>, and this rewrites the former to
 * the latter so the two addressing schemes share one set of routes.
 *
 * Locally, browsers resolve *.localhost to 127.0.0.1 without any hosts-file
 * entry, so http://aurum-jewellers.localhost:3000 works out of the box. The
 * /s/<slug> path also stays reachable directly, which is what makes the app
 * usable when the host is a bare localhost.
 *
 * A rewrite, not a redirect: the visitor keeps seeing the store's own domain.
 */
const ROOT_DOMAIN = process.env['ROOT_DOMAIN'] ?? 'localhost:3000';

function storeSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const normalised = host.toLowerCase();
  if (normalised === ROOT_DOMAIN) return null;

  const suffix = `.${ROOT_DOMAIN}`;
  if (!normalised.endsWith(suffix)) return null;

  const label = normalised.slice(0, -suffix.length);
  // Reserved for the dashboard and the platform console, added in Phase 2.
  if (label.length === 0 || label.includes('.') || label === 'www') return null;
  if (label === 'app' || label === 'admin') return null;
  return label;
}

/** Paths that belong to the platform, never to a store subdomain. */
const PLATFORM_PATHS = ['/login', '/dashboard', '/admin', '/api/'];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/s/')) return NextResponse.next();
  if (PLATFORM_PATHS.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();

  const slug = storeSlugFromHost(request.headers.get('host'));
  if (!slug) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/s/${slug}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
