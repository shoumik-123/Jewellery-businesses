import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';
import { PrismaClient } from './generated/prisma/client.ts';

/**
 * The database client, and the only place that decides how a query reaches
 * PostgreSQL.
 *
 * Prisma 7 takes the connection through a driver adapter, which is what lets us
 * own the `pg` pool directly — and owning the pool is what makes the tenancy
 * modes below possible.
 */

export type { PrismaClient } from './generated/prisma/client.ts';
export * from './generated/prisma/enums.ts';
export { Prisma } from './generated/prisma/client.ts';
import type { Prisma } from './generated/prisma/client.ts';

/**
 * How a unit of work reaches the database. Cross-tenant reach is a property of
 * the role, not of a `where` clause, so choosing a mode is a deliberate and
 * reviewable act.
 *
 *  - `tenant`   : app_runtime, row-level security enforced. Needs a storeId
 *                 and/or tenantId. The default for everything a store does.
 *  - `identity` : app_identity. Bypasses RLS but is granted only the tables
 *                 needed before a tenant context exists (login, token
 *                 rotation, host -> store routing, membership, entitlements).
 *                 It has no privilege at all on Product, Order or Customer.
 *  - `platform` : app_platform. Bypasses RLS on everything. Super Admin
 *                 endpoints and rollup jobs only, always behind a platform
 *                 permission guard, always audited.
 */
export type AccessMode = 'tenant' | 'identity' | 'platform';

export const DB_ROLES: Readonly<Record<AccessMode, string>> = {
  tenant: 'app_runtime',
  identity: 'app_identity',
  platform: 'app_platform',
};

export const STORE_CONTEXT_VAR = 'app.current_store_id';
export const TENANT_CONTEXT_VAR = 'app.current_tenant_id';

export interface TenantScope {
  storeId?: string;
  tenantId?: string;
}

export interface CreateClientOptions {
  connectionString: string;
  /**
   * Issue `SET LOCAL ROLE` per transaction. Defaults to true, and must stay
   * true everywhere that matters.
   *
   * The only reason this switch exists: the local WebAssembly development
   * server (`pnpm db:up`) terminates its backend on any UPDATE executed under
   * a non-owner role, which makes sign-in - and anything else that writes -
   * impossible there. Turning it off trades the database-level half of tenant
   * isolation for a usable local environment.
   *
   * With it off, queries run as the connection's own role. If that role owns
   * the schema or is a superuser, row-level security no longer applies and
   * only the application's own `where` clauses separate tenants. The API
   * refuses to start with this off outside development, and says so loudly on
   * every boot where it is off. See docs/03-multi-tenancy.md section 11.
   */
  roleSwitching?: boolean;
  /** Max pool connections for this process. */
  maxConnections?: number;
  /** Statement timeout applied to every connection, in milliseconds. */
  statementTimeoutMs?: number;
  log?: boolean;
  ssl?: PoolConfig['ssl'];
}

export interface Database {
  prisma: PrismaClient;
  pool: Pool;
  /** Run `fn` inside a transaction scoped to one store (or tenant). */
  withTenant: <T>(scope: TenantScope, fn: TxCallback<T>) => Promise<T>;
  /** Run `fn` with identity-table access, before any tenant context exists. */
  withIdentity: <T>(fn: TxCallback<T>) => Promise<T>;
  /** Run `fn` with cross-tenant access. Platform endpoints and jobs only. */
  withPlatform: <T>(fn: TxCallback<T>) => Promise<T>;
  disconnect: () => Promise<void>;
}

/**
 * The handle Prisma passes to an interactive transaction: the client minus the
 * methods that cannot be used inside one. Taken from the generated namespace
 * rather than hand-written, so it tracks the client version.
 */
export type TransactionClient = Prisma.TransactionClient;

export type TxCallback<T> = (tx: TransactionClient) => Promise<T>;

/**
 * Marks a failure that happened while acquiring a connection, before any of
 * the caller's work ran. Carried as its own type so the retry cannot be
 * triggered by anything else.
 */
class StaleConnectionError extends Error {
  constructor(override readonly cause: unknown) {
    super('Database connection was closed before the transaction started');
    this.name = 'StaleConnectionError';
  }
}

/**
 * Was this a connection that the server had already closed?
 *
 * Every pooled deployment produces these: managed Postgres closes idle
 * connections, a transaction-mode pooler recycles them, a rolling restart
 * drops them, and the local WASM development server drops them aggressively
 * (docs/03-multi-tenancy.md section 11). `pg` can hand out such a connection
 * before it notices, and the first statement then fails.
 *
 * Matching on message text is unattractive, but node-postgres reports this as
 * a plain Error with no code, so there is nothing better to match on. The
 * patterns are narrow, and the `entered` guard - not this function - is what
 * makes the retry safe.
 *
 * Exported for its unit test: the retry is only as safe as this is narrow.
 */
export function isStaleConnectionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === '57P01') return true;

  const message = error instanceof Error ? error.message : '';
  return (
    message.includes('Connection terminated unexpectedly') ||
    message.includes('Client has encountered a connection error') ||
    message.includes('terminating connection due to administrator command') ||
    message.includes('server closed the connection unexpectedly')
  );
}

export function createDatabase(options: CreateClientOptions): Database {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    // A connection that hangs should fail fast rather than occupy the pool.
    connectionTimeoutMillis: 10_000,
    // Shorter than the shortest idle cutoff we expect in front of us (a
    // managed provider, a pooler, or the local WASM server), so the pool
    // retires a connection before the server does. The retry above covers
    // what still slips through.
    idleTimeoutMillis: 10_000,
    ...(options.ssl !== undefined ? { ssl: options.ssl } : {}),
  });

  // A pool-level error must never take the process down.
  pool.on('error', (error) => {
    console.error('[db] idle client error', error.message);
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({
    adapter,
    log: options.log === true ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

  /**
   * Enter a role and (optionally) a tenant context for the life of one
   * transaction.
   *
   * `SET LOCAL` is transaction-scoped: both the role and the context expire at
   * COMMIT or ROLLBACK. That is what makes this safe behind a transaction-mode
   * connection pooler — a connection returned to the pool cannot carry one
   * store's context into another store's query.
   *
   * `SET LOCAL ROLE` is deliberate rather than relying only on connecting as a
   * non-owner: it means isolation holds even if the connection string is ever
   * misconfigured with an owning role, and it works identically on managed
   * providers that only hand out one login.
   */
  async function run<T>(mode: AccessMode, scope: TenantScope, fn: TxCallback<T>): Promise<T> {
    try {
      return await attempt(mode, scope, fn);
    } catch (error) {
      // See isStaleConnectionError: this is only ever reached when the
      // callback never ran, so nothing can be duplicated by trying again.
      if (!(error instanceof StaleConnectionError)) throw error;
      return attempt(mode, scope, fn);
    }
  }

  async function attempt<T>(mode: AccessMode, scope: TenantScope, fn: TxCallback<T>): Promise<T> {
    /**
     * Did control reach the caller's work?
     *
     * This is the whole safety argument for the retry above. A connection can
     * die after COMMIT was sent but before the acknowledgement arrives, and
     * re-running that transaction would apply it twice. So a retry is only
     * allowed while this is still false — the connection was already dead when
     * the pool handed it over, the caller's callback never ran, and no
     * statement of theirs reached the server.
     */
    let entered = false;

    try {
      return await prisma.$transaction(async (tx) => {
        if (options.roleSwitching !== false) {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${DB_ROLES[mode]}`);
        }

        if (options.statementTimeoutMs !== undefined) {
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${options.statementTimeoutMs}`);
        }

        if (mode === 'tenant') {
          if (scope.storeId === undefined && scope.tenantId === undefined) {
            // Without a context every policy matches nothing, so this would
            // silently read zero rows. Failing loudly is far more useful.
            throw new Error(
              'withTenant requires a storeId or tenantId; without one every query returns no rows.',
            );
          }
          if (scope.storeId !== undefined) {
            await tx.$executeRaw`SELECT set_config('app.current_store_id', ${scope.storeId}, true)`;
          }
          if (scope.tenantId !== undefined) {
            await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${scope.tenantId}, true)`;
          }
        }

        entered = true;
        return fn(tx);
      });
    } catch (error) {
      if (!entered && isStaleConnectionError(error)) {
        throw new StaleConnectionError(error);
      }
      throw error;
    }
  }

  return {
    prisma,
    pool,
    withTenant: (scope, fn) => run('tenant', scope, fn),
    withIdentity: (fn) => run('identity', {}, fn),
    withPlatform: (fn) => run('platform', {}, fn),
    disconnect: async () => {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}
