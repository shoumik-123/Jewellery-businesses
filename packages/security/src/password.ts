import { type Algorithm, hash, parseOptions, verify } from '@node-rs/argon2';

/**
 * `Algorithm.Argon2id`, inlined as its numeric value because the library
 * declares `Algorithm` as an ambient const enum, which cannot be referenced
 * under `isolatedModules`.
 */
const ARGON2ID = 2 as Algorithm;

/**
 * Password hashing.
 *
 * Argon2id with the OWASP 2024 baseline parameters. One implementation, used
 * by the API and by the seed script, so the cost parameters cannot drift apart
 * between them.
 */

export interface Argon2Params {
  /** KiB of memory per hash. */
  memoryCost: number;
  /** Iterations. */
  timeCost: number;
  parallelism: number;
}

/**
 * OWASP's recommended minimum for Argon2id: 19 MiB, 2 iterations, 1 lane.
 * Raising memoryCost is the cheapest way to make cracking harder; measure
 * before changing, since it is paid on every login.
 */
export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * A hash of a value nobody knows, used to spend the same CPU time when an
 * account does not exist. Without this, response timing reveals whether an
 * email is registered.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Iq0q0Z6f2vQmJ8Qe1KQmPnJ1dG5kZXJzY29yZQ';

export async function hashPassword(
  plain: string,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<string> {
  if (plain.length === 0) throw new Error('Refusing to hash an empty password');
  return hash(plain, { ...params, algorithm: ARGON2ID });
}

/**
 * Verify a password. Never throws on a malformed hash — a corrupt stored hash
 * must read as "wrong password", not as a 500 that tells an attacker the
 * account exists.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

/**
 * Spend comparable time when there is no account to check against, so
 * `/auth/login` cannot be used to enumerate registered emails.
 *
 * Call this on the "user not found" branch and return the same generic error.
 */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  try {
    await verify(DUMMY_HASH, plain);
  } catch {
    // Expected: the dummy is not a real hash of anything.
  }
  return false;
}

/**
 * True when a stored hash was produced with weaker parameters than we now use.
 * Call on successful login and re-hash in the background: this is how cost
 * parameters get raised without forcing a password reset on everyone.
 */
export function passwordNeedsRehash(
  storedHash: string,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): boolean {
  try {
    const parsed = parseOptions(storedHash);
    return (
      parsed.algorithm !== ARGON2ID ||
      parsed.memoryCost < params.memoryCost ||
      parsed.timeCost < params.timeCost ||
      parsed.parallelism !== params.parallelism ||
      parsed.saltLen < 16
    );
  } catch {
    // An unreadable hash cannot be kept.
    return true;
  }
}
