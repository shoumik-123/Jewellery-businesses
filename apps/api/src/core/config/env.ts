import { z } from 'zod';

/**
 * Configuration is validated once, at boot, and the process refuses to start
 * if anything required is missing or malformed. A misconfigured deployment
 * should fail immediately and loudly, not on the first request that needs the
 * missing value.
 *
 * Only the variables this slice actually uses are declared here. Each later
 * module adds its own, so the schema stays an honest statement of what the
 * running code needs.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().default('local'),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  /** Browser origins allowed to call this API. Comma separated. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

  /**
   * The application connection. This must be a role WITHOUT bypassrls — the
   * tenancy guarantee in docs/03-multi-tenancy.md depends on it. The runtime
   * additionally issues SET LOCAL ROLE per transaction, so a misconfigured URL
   * is caught by the second layer rather than silently disabling isolation.
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  PRISMA_LOG_QUERIES: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  /**
   * The suffix under which every store gets a subdomain, e.g. a ROOT_DOMAIN of
   * `localhost:3000` makes `aurum-jewellers.localhost:3000` resolve to that
   * store. Used to turn a Host header into a store slug.
   */
  ROOT_DOMAIN: z.string().default('localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return parsed.data;
}

export const ENV = Symbol('ENV');
