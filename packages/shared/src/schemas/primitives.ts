import { z } from 'zod';
import { DEFAULTS, isReservedSlug } from '../constants';

/**
 * Primitive schemas reused across every request DTO.
 *
 * These are the single definition of "valid" for this platform: the API
 * validates with them and the web forms resolve against the same objects, so
 * client and server can never disagree about what a phone number is.
 */

/** cuid2-ish opaque id. Deliberately not a UUID regex: ids are Prisma cuids. */
export const idSchema = z
  .string()
  .min(8, 'Invalid id')
  .max(64, 'Invalid id')
  .regex(/^[a-z0-9]+$/i, 'Invalid id');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Must be at least 3 characters')
  .max(40, 'Must be 40 characters or fewer')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'Use lowercase letters, numbers and hyphens (not at the start or end)',
  )
  .refine((v) => !v.includes('--'), 'Cannot contain consecutive hyphens')
  .refine((v) => !isReservedSlug(v), 'This address is reserved');

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email('Invalid email'));

/**
 * Bangladesh mobile numbers, normalised to `01XXXXXXXXX`.
 * Accepts `+8801...`, `8801...`, `01...` because customers type all three.
 */
export const bdPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .transform((v) => {
    if (v.startsWith('+880')) return `0${v.slice(4)}`;
    if (v.startsWith('880')) return `0${v.slice(3)}`;
    return v;
  })
  .refine((v) => /^01[3-9]\d{8}$/.test(v), 'Enter a valid Bangladeshi mobile number');

/** International fallback for stores outside BD. */
export const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(20)
  .regex(/^\+?[0-9\s()-]+$/, 'Invalid phone number');

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Too long')
  .refine((v) => v.trim().length === v.length || v.trim().length >= 10, 'Password cannot be blank');

/**
 * Money on the wire is a string with at most 2 decimals. Numbers are rejected
 * so a float never silently becomes a price.
 */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Enter an amount with up to 2 decimal places');

export const positiveMoneySchema = moneySchema.refine(
  (v) => Number.parseFloat(v) > 0,
  'Must be greater than zero',
);

export const nonNegativeMoneySchema = moneySchema.refine(
  (v) => Number.parseFloat(v) >= 0,
  'Cannot be negative',
);

/** Grams or carats: up to 3 decimals. */
export const weightSchema = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,3})?$/, 'Enter a weight with up to 3 decimal places');

export const percentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,3})?$/, 'Enter a percentage')
  .refine((v) => Number.parseFloat(v) <= 100, 'Cannot exceed 100%');

export const quantitySchema = z.coerce.number().int().min(0).max(1_000_000);
export const positiveQuantitySchema = z.coerce.number().int().min(1).max(1_000_000);

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, 'SKU is too short')
  .max(48, 'SKU is too long')
  .regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Use letters, numbers and - . _ /');

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(32)
  .regex(/^[A-Z0-9_-]+$/, 'Use letters, numbers, hyphens and underscores');

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(4)
  .max(253)
  .regex(
    /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
    'Enter a valid domain name',
  );

export const urlSchema = z.string().trim().max(2048).pipe(z.url('Enter a valid URL'));

export const isoDateSchema = z.string().datetime({ offset: true });

export const colourHexSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Enter a hex colour like #B8860B');

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code');

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(DEFAULTS.MAX_PAGE_SIZE).default(DEFAULTS.PAGE_SIZE),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export const cursorPaginationSchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(DEFAULTS.MAX_PAGE_SIZE).default(DEFAULTS.PAGE_SIZE),
});

/** `sort=name:asc`. Allowed fields are supplied per endpoint. */
export function sortSchema<T extends readonly [string, ...string[]]>(fields: T) {
  return z
    .string()
    .trim()
    .regex(/^[a-zA-Z]+:(asc|desc)$/, 'Use field:asc or field:desc')
    .refine(
      (v) => fields.includes(v.split(':')[0] ?? ''),
      `Sort field must be one of: ${fields.join(', ')}`,
    )
    .transform((v) => {
      const [field, direction] = v.split(':') as [T[number], 'asc' | 'desc'];
      return { field, direction };
    });
}

export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'The start date must be before the end date',
    path: ['from'],
  });

export interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export interface CursorPaginated<T> {
  data: T[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

/** Address shape used for customer addresses and for order snapshots. */
export const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: bdPhoneSchema,
  altPhone: bdPhoneSchema.optional(),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  area: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2).max(100),
  district: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().length(2).default(DEFAULTS.COUNTRY),
  landmark: z.string().trim().max(200).optional(),
});

export type AddressInput = z.infer<typeof addressSchema>;
