import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Browser session transport.
 *
 * The API returns a session token in its response body and never sets a
 * cookie. This file owns the cookie instead, which keeps one rule true across
 * the whole app: the browser talks only to this Next server, and the token
 * lives in an httpOnly cookie that client JavaScript cannot read. An XSS bug
 * therefore cannot exfiltrate a session.
 */

export const SESSION_COOKIE = 'jh_session';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  isSuperAdmin: boolean;
  platformPermissions: string[];
  stores: {
    storeId: string;
    slug: string;
    name: string;
    role: string;
    roleName: string;
    isOwner: boolean;
    permissions: string[];
  }[];
}

const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:4000/v1';

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Lax rather than Strict: Strict would drop the cookie when arriving from
    // an external link, signing people out for no security gain here, since
    // Lax already blocks the cross-site POSTs that CSRF relies on.
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Never throws on an expired session. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = await readSessionToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as SessionUser;
  } catch {
    // API unreachable. Treated as signed out rather than a crashed page.
    return null;
  }
}

/** For pages that require a session. Sends anonymous visitors to sign in. */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/** An authenticated call to the API, made server-side. */
export type ApiFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  /**
   * Per-field messages from a VALIDATION_FAILED response, keyed by field path.
   * Carried through so a form can mark the offending input rather than showing
   * one sentence above everything and leaving the person to guess.
   */
  details: Record<string, string[]> | null;
};

export async function apiAuthed<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: true; data: T } | ApiFailure> {
  const token = await readSessionToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });

  if (response.ok) {
    return { ok: true, data: (await response.json()) as T };
  }

  const body: unknown = await response.json().catch(() => null);
  const error =
    typeof body === 'object' && body !== null && 'error' in body
      ? (
          body as {
            error: { code?: string; message?: string; details?: Record<string, string[]> };
          }
        ).error
      : null;

  return {
    ok: false,
    status: response.status,
    code: error?.code ?? 'UNKNOWN',
    message: error?.message ?? 'Something went wrong.',
    details: error?.details ?? null,
  };
}
