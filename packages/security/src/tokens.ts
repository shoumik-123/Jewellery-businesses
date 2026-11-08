import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Opaque tokens: refresh tokens, email verification links, staff invites,
 * password resets, API keys, cart session cookies.
 *
 * Two rules, both enforced by this module's shape:
 *  1. The raw token is returned to the caller exactly once and never stored.
 *     The database holds only a SHA-256 of it, so a database leak does not
 *     hand over working links.
 *  2. Lookups compare hashes, and comparisons that involve a secret use a
 *     constant-time function.
 *
 * SHA-256 (not Argon2) is right here: these are 256-bit random values, so
 * there is nothing to brute-force, and verification happens on every request.
 */

/** 32 bytes of CSPRNG output, base64url — URL-safe and 256 bits of entropy. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two token hashes. */
export function tokenHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Constant-time comparison of two secrets of any length, e.g. a webhook
 * signature or a guest order-tracking phone number. Hashing first makes the
 * lengths equal so the comparison cannot leak length.
 */
export function secretEquals(a: string, b: string): boolean {
  return tokenHashEquals(hashToken(a), hashToken(b));
}

export interface IssuedToken {
  /** Give this to the user once. Never log it, never store it. */
  token: string;
  /** Store this. */
  tokenHash: string;
  expiresAt: Date;
}

export function issueToken(ttlMs: number, bytes = 32): IssuedToken {
  const token = generateToken(bytes);
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}

/** Token lifetimes, in one place so they can be reviewed together. */
export const TOKEN_TTL = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
  STAFF_INVITE: 7 * 24 * 60 * 60 * 1000,
  REFRESH: 30 * 24 * 60 * 60 * 1000,
  DOMAIN_VERIFICATION: 30 * 24 * 60 * 60 * 1000,
  PREVIEW: 15 * 60 * 1000,
} as const;

/**
 * API keys are shown once as `jh_live_<prefix>_<secret>`. The prefix is stored
 * in clear so the UI can show which key is which; only the secret is hashed.
 */
export interface IssuedApiKey {
  key: string;
  keyPrefix: string;
  keyHash: string;
}

export function issueApiKey(live = true): IssuedApiKey {
  const prefix = randomBytes(6).toString('hex');
  const secret = generateToken(32);
  const key = `jh_${live ? 'live' : 'test'}_${prefix}_${secret}`;
  return { key, keyPrefix: prefix, keyHash: hashToken(secret) };
}

/**
 * Parse a presented API key. Returns null for anything malformed.
 *
 * Matched with an anchored pattern rather than by splitting on `_`: the secret
 * is base64url, which contains underscores, so a naive split rejects most
 * valid keys.
 */
const API_KEY_PATTERN = /^jh_(live|test)_([0-9a-f]{12})_([A-Za-z0-9_-]{32,})$/;

export function parseApiKey(
  presented: string,
): { prefix: string; secretHash: string; live: boolean } | null {
  const match = API_KEY_PATTERN.exec(presented.trim());
  if (!match) return null;
  const [, env, prefix, secret] = match;
  if (!env || !prefix || !secret) return null;
  return { prefix, secretHash: hashToken(secret), live: env === 'live' };
}

/** A correlation id for logs and error responses. */
export function requestId(): string {
  return `req_${randomUUID().replace(/-/g, '')}`;
}

/** An anonymous cart/session cookie value. */
export function sessionToken(): string {
  return generateToken(24);
}

/** A rotation family id, shared by every refresh token descended from one login. */
export function familyId(): string {
  return `fam_${randomUUID().replace(/-/g, '')}`;
}
