import { z } from 'zod';
import { RESERVED_SLUGS } from '@jh/shared/constants';

export const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(63)
    // Subdomain rules: this becomes shop.jewelleryhub.com, so it has to be a
    // legal DNS label - lowercase, no leading or trailing hyphen.
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and hyphens.')
    .refine((value) => !RESERVED_SLUGS.includes(value), {
      message: 'That address is reserved.',
    }),
  tagline: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(32).optional(),
  ownerEmail: z.string().trim().toLowerCase().email().max(254),
  ownerFirstName: z.string().trim().min(1).max(80),
  ownerLastName: z.string().trim().max(80).optional(),
  ownerPhone: z.string().trim().max(32).optional(),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
