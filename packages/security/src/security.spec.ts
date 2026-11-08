import {
  DEFAULT_ARGON2_PARAMS,
  hashPassword,
  passwordNeedsRehash,
  verifyAgainstDummy,
  verifyPassword,
} from './password';
import {
  generateToken,
  hashToken,
  issueApiKey,
  issueToken,
  parseApiKey,
  secretEquals,
  tokenHashEquals,
} from './tokens';

describe('password hashing', () => {
  it('produces an argon2id hash with the expected cost parameters', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain(`m=${DEFAULT_ARGON2_PARAMS.memoryCost}`);
    expect(hash).toContain(`t=${DEFAULT_ARGON2_PARAMS.timeCost}`);
    expect(hash).toContain(`p=${DEFAULT_ARGON2_PARAMS.parallelism}`);
  });

  it('salts: the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'same-password')).toBe(true);
    expect(await verifyPassword(b, 'same-password')).toBe(true);
  });

  it('accepts the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('Tk-1500-gold-bangle');
    expect(await verifyPassword(hash, 'Tk-1500-gold-bangle')).toBe(true);
    expect(await verifyPassword(hash, 'Tk-1500-gold-bangl')).toBe(false);
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('handles unicode and long passphrases', async () => {
    const pass = 'সোনার গয়না 💍 a-very-long-passphrase-with-ünïcödé';
    const hash = await hashPassword(pass);
    expect(await verifyPassword(hash, pass)).toBe(true);
  });

  it('refuses to hash an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow(/empty password/i);
  });

  it('treats a corrupt stored hash as a wrong password, not an error', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(await verifyPassword('', 'anything')).toBe(false);
    expect(await verifyPassword('$argon2id$garbage', 'anything')).toBe(false);
  });

  it('spends time on a non-existent account so timing does not leak', async () => {
    await expect(verifyAgainstDummy('anything')).resolves.toBe(false);
  });

  it('flags hashes made with weaker parameters for re-hashing', async () => {
    const weak = await hashPassword('x', { memoryCost: 8192, timeCost: 1, parallelism: 1 });
    expect(passwordNeedsRehash(weak)).toBe(true);

    const current = await hashPassword('x');
    expect(passwordNeedsRehash(current)).toBe(false);
  });

  it('treats an unreadable hash as needing a rehash', () => {
    expect(passwordNeedsRehash('nonsense')).toBe(true);
  });
});

describe('tokens', () => {
  it('generates 256 bits of url-safe entropy', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateToken()));
    expect(seen.size).toBe(500);
  });

  it('hashes deterministically, and the hash does not reveal the token', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toContain(token);
  });

  it('issues a token with its hash and an expiry', () => {
    const before = Date.now();
    const issued = issueToken(60_000);
    expect(issued.tokenHash).toBe(hashToken(issued.token));
    expect(issued.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(issued.expiresAt.getTime()).toBeLessThan(before + 61_000);
  });

  it('compares hashes in constant time', () => {
    const a = hashToken('one');
    expect(tokenHashEquals(a, a)).toBe(true);
    expect(tokenHashEquals(a, hashToken('two'))).toBe(false);
    expect(tokenHashEquals(a, 'short')).toBe(false);
  });

  it('compares secrets of differing length without leaking length', () => {
    expect(secretEquals('01712345678', '01712345678')).toBe(true);
    expect(secretEquals('01712345678', '0171234567')).toBe(false);
    expect(secretEquals('', '')).toBe(true);
  });
});

describe('api keys', () => {
  it('issues a key that stores only a prefix and a hash', () => {
    const issued = issueApiKey();
    expect(issued.key).toMatch(/^jh_live_[0-9a-f]{12}_[A-Za-z0-9_-]+$/);
    expect(issued.key).toContain(issued.keyPrefix);
    expect(issued.key).not.toContain(issued.keyHash);
  });

  it('round-trips a presented key back to its prefix and secret hash', () => {
    const issued = issueApiKey();
    const parsed = parseApiKey(issued.key);
    expect(parsed).not.toBeNull();
    expect(parsed?.prefix).toBe(issued.keyPrefix);
    expect(parsed?.secretHash).toBe(issued.keyHash);
    expect(parsed?.live).toBe(true);
  });

  it('marks test keys as not live', () => {
    expect(parseApiKey(issueApiKey(false).key)?.live).toBe(false);
  });

  it.each([
    [''],
    ['jh_live_onlythreeparts'],
    ['xx_live_abc_def'],
    ['jh_prod_abc_def'],
    ['jh_live__def'],
    ['jh_live_abc_'],
  ])('rejects the malformed key %p', (input) => {
    expect(parseApiKey(input)).toBeNull();
  });
});
