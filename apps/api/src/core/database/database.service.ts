import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createDatabase, type Database, type TenantScope, type TxCallback } from '@jh/db';
import { ENV, type Env } from '../config/env.js';

/**
 * The only place in the API that owns a database connection.
 *
 * It deliberately exposes nothing but the three scoped entry points from
 * @jh/db. There is no `get prisma()` here: an unscoped client would let a
 * caller read across tenants by accident, and the whole point of the design in
 * docs/03-multi-tenancy.md is that reaching across tenants has to be a
 * deliberate, reviewable act — `withPlatform`, named in the diff.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly db: Database;

  constructor(@Inject(ENV) env: Env) {
    if (!env.DB_ROLE_SWITCHING) {
      if (env.NODE_ENV === 'production') {
        throw new Error(
          'DB_ROLE_SWITCHING=false is a local development workaround and is refused in production. ' +
            'It disables the database-level half of tenant isolation.',
        );
      }
      this.logger.warn(
        'DB_ROLE_SWITCHING=false — SET LOCAL ROLE is disabled. Row-level security is NOT ' +
          'enforcing tenant isolation in this process; only application filters are. ' +
          'Use real PostgreSQL (docker compose up -d postgres) before trusting an isolation result.',
      );
    }

    this.db = createDatabase({
      connectionString: env.DATABASE_URL,
      maxConnections: env.DATABASE_POOL_MAX,
      statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
      log: env.PRISMA_LOG_QUERIES,
      roleSwitching: env.DB_ROLE_SWITCHING,
      ...(env.DATABASE_SSL ? { ssl: { rejectUnauthorized: true } } : {}),
    });
  }

  /** Run inside a transaction pinned to one store, with RLS enforced. */
  withTenant<T>(scope: TenantScope, fn: TxCallback<T>): Promise<T> {
    return this.db.withTenant(scope, fn);
  }

  /** Identity and routing tables only — no catalogue, no orders, no customers. */
  withIdentity<T>(fn: TxCallback<T>): Promise<T> {
    return this.db.withIdentity(fn);
  }

  /** Cross-tenant. Platform endpoints and jobs only. */
  withPlatform<T>(fn: TxCallback<T>): Promise<T> {
    return this.db.withPlatform(fn);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing database pool');
    await this.db.disconnect();
  }
}
