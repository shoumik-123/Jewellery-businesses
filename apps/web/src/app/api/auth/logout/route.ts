import { NextResponse } from 'next/server';
import { clearSessionCookie, readSessionToken } from '@/lib/session';

const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:4000/v1';

/**
 * Sign out.
 *
 * The cookie is cleared whatever happens. If the API call fails, the session
 * row outlives the cookie until it expires - but leaving someone signed in
 * because a network call failed is the worse outcome of the two.
 */
export async function POST(): Promise<NextResponse> {
  const token = await readSessionToken();

  if (token) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      });
    } catch {
      // Clearing the cookie below is what signs this browser out.
    }
  }

  await clearSessionCookie();
  return NextResponse.redirect(
    new URL('/login', process.env['WEB_BASE_URL'] ?? 'http://localhost:3000'),
  );
}
