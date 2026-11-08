import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Only a presence check. A minimum length here would reject existing
  // passwords that predate a policy change, and the strength rule belongs
  // where passwords are set, not where they are checked.
  password: z.string().min(1).max(512),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const refreshSchema = z.object({
  token: z.string().min(16).max(512),
});

export type RefreshInput = z.infer<typeof refreshSchema>;
