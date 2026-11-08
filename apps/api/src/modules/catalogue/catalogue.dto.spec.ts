import {
  createProductSchema,
  manageProductQuerySchema,
  updateProductSchema,
} from './catalogue.dto.js';

/**
 * These tests exist because of one bug that nothing else would have caught.
 *
 * `base.partial()` does not strip a `.default()`, so an update schema built
 * that way filled in a default for every key the caller omitted. A PATCH
 * carrying only `{ price }` came back having also set `status` to DRAFT, which
 * took a live product off the storefront. TypeScript was happy, the endpoint
 * returned 200, and the only visible symptom was a shop owner's piece quietly
 * disappearing from their shop.
 *
 * So most of what follows asserts what must NOT happen: keys that must not
 * appear, values that must not be accepted.
 */
describe('update schema', () => {
  it('adds nothing to an empty update', () => {
    const result = updateProductSchema.parse({});
    // The whole bug in one line. Anything in here is a column that a request
    // would change without asking.
    expect(Object.keys(result)).toEqual([]);
  });

  it('leaves status alone when only the price is sent', () => {
    const result = updateProductSchema.parse({ price: '1000.00' });
    expect(result).toEqual({ price: '1000.00' });
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('metalType');
    expect(result).not.toHaveProperty('availability');
    expect(result).not.toHaveProperty('requiresShipping');
  });

  it('still accepts a status that was asked for', () => {
    expect(updateProductSchema.parse({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' });
  });

  it('keeps null distinct from absent, so a value can be cleared', () => {
    expect(updateProductSchema.parse({ salePrice: null })).toEqual({ salePrice: null });
    expect(updateProductSchema.parse({})).not.toHaveProperty('salePrice');
  });

  it('refuses a null on a column that cannot be null', () => {
    expect(updateProductSchema.safeParse({ price: null }).success).toBe(false);
    expect(updateProductSchema.safeParse({ name: null }).success).toBe(false);
  });
});

describe('create schema', () => {
  const valid = {
    name: 'Gold Kada Bangle',
    sku: 'aur-bng-1',
    jewelleryType: 'BANGLE',
    price: '145000.00',
  };

  it('applies the table defaults', () => {
    const result = createProductSchema.parse(valid);
    expect(result.status).toBe('DRAFT');
    expect(result.availability).toBe('IN_STOCK');
    expect(result.metalType).toBe('NONE');
    expect(result.pricingMode).toBe('FIXED');
    expect(result.requiresShipping).toBe(true);
    expect(result.isFeatured).toBe(false);
  });

  it('requires the four fields a piece cannot exist without', () => {
    for (const key of ['name', 'sku', 'jewelleryType', 'price'] as const) {
      const incomplete: Record<string, unknown> = { ...valid };
      delete incomplete[key];
      expect(createProductSchema.safeParse(incomplete).success).toBe(false);
    }
  });

  it('uppercases a SKU, so two cases of one code cannot both exist', () => {
    expect(createProductSchema.parse(valid).sku).toBe('AUR-BNG-1');
  });

  it('rejects money a float would have mangled', () => {
    for (const price of ['145000.555', '1e5', '145,000.00', '-10.00', '0.00', '']) {
      expect(createProductSchema.safeParse({ ...valid, price }).success).toBe(false);
    }
  });

  it('takes money as a string and nothing else', () => {
    // A JSON number has already been through a float by the time it is here.
    expect(createProductSchema.safeParse({ ...valid, price: 145000 }).success).toBe(false);
  });
});

describe('cross-field rules', () => {
  const base = { name: 'A Piece', sku: 'SKU-1', jewelleryType: 'RING', price: '1000.00' };

  it('refuses net weight above gross weight', () => {
    const result = createProductSchema.safeParse({
      ...base,
      grossWeightG: '5.000',
      netWeightG: '6.000',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['netWeightG']);
  });

  it('allows net weight equal to gross weight, for a piece with no stones', () => {
    expect(
      createProductSchema.safeParse({ ...base, grossWeightG: '5.000', netWeightG: '5.000' })
        .success,
    ).toBe(true);
  });

  it('refuses a sale price at or above the price', () => {
    expect(createProductSchema.safeParse({ ...base, salePrice: '1000.00' }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, salePrice: '1200.00' }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, salePrice: '900.00' }).success).toBe(true);
  });

  it('refuses a sale that ends before it starts', () => {
    expect(
      createProductSchema.safeParse({
        ...base,
        saleStartsAt: '2026-02-01T00:00:00+06:00',
        saleEndsAt: '2026-01-01T00:00:00+06:00',
      }).success,
    ).toBe(false);
  });

  it('refuses rate-based pricing with no metal weight to multiply', () => {
    expect(
      createProductSchema.safeParse({ ...base, pricingMode: 'METAL_RATE_BASED' }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        ...base,
        pricingMode: 'METAL_RATE_BASED',
        netWeightG: '4.000',
      }).success,
    ).toBe(true);
  });

  it('does not compare a cleared field against the one still set', () => {
    // On an update, `null` means remove. There is then nothing to compare, and
    // the rule has to pass rather than complain about a value being removed.
    expect(updateProductSchema.safeParse({ salePrice: null, price: '10.00' }).success).toBe(true);
    expect(updateProductSchema.safeParse({ netWeightG: null }).success).toBe(true);
  });
});

describe('image addresses', () => {
  const base = { name: 'A Piece', sku: 'SKU-1', jewelleryType: 'RING', price: '1000.00' };
  const withUrl = (url: string) => createProductSchema.safeParse({ ...base, media: [{ url }] });

  it('refuses the schemes that are script delivery, not pictures', () => {
    // This value reaches an <img src> on the shop's own storefront. A shop
    // owner pasting one of these would be attacking their own customers.
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(withUrl(url).success).toBe(false);
    }
  });

  it('refuses a protocol-relative address, which only looks relative', () => {
    expect(withUrl('//evil.example/x.png').success).toBe(false);
  });

  it('accepts https and a path inside this site', () => {
    expect(withUrl('https://cdn.example/ring.png').success).toBe(true);
    expect(withUrl('/demo/ring.svg').success).toBe(true);
  });
});

describe('tags', () => {
  const base = { name: 'A Piece', sku: 'SKU-1', jewelleryType: 'RING', price: '1000.00' };

  it('lowercases and de-duplicates, because case is a typing accident', () => {
    const result = createProductSchema.parse({ ...base, tags: ['Bangle', 'bangle', 'GOLD'] });
    expect(result.tags).toEqual(['bangle', 'gold']);
  });
});

describe('list query', () => {
  it('hides archived pieces unless they are asked for', () => {
    expect(manageProductQuerySchema.parse({}).includeArchived).toBe(false);
    expect(manageProductQuerySchema.parse({ includeArchived: 'true' }).includeArchived).toBe(true);
  });

  it('caps the page size, so one request cannot ask for the whole catalogue', () => {
    expect(manageProductQuerySchema.safeParse({ perPage: '500' }).success).toBe(false);
    expect(manageProductQuerySchema.parse({ perPage: '100' }).perPage).toBe(100);
  });

  it('refuses a status that is not one of the three', () => {
    expect(manageProductQuerySchema.safeParse({ status: 'DELETED' }).success).toBe(false);
  });
});
