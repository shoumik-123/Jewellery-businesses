import { NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/session';

const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:4000/v1';

interface LoginResponse {
  token: string;
  expiresAt: string;
}

/**
 * Sign-in, proxied server-side.
 *
 * The browser posts here, not to the API. This server exchanges the
 * credentials for a token and puts it straight into an httpOnly cookie, so
 * the token never exists anywhere client JavaScript can reach it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
  }

  const { email, password } = (payload ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ message: 'Enter your email and password.' }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { message: 'Cannot reach the server. Is the API running?' },
      { status: 503 },
    );
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? ((body as { error: { message?: string } }).error.message ?? 'Sign in failed.')
        : 'Sign in failed.';
    // The API already returns one indistinguishable message for every kind of
    // failure; this passes it through rather than inventing a more specific one.
    return NextResponse.json({ message }, { status: response.status });
  }

  const data = (await response.json()) as LoginResponse;
  await setSessionCookie(data.token, data.expiresAt);
  return NextResponse.json({ ok: true });
}
