/**
 * Grants the application roles access to the local dev server's change-log.
 *
 * `prisma dev` installs a trigger on every table that records writes into a
 * private `_prisma_dev_wal` schema. The trigger runs as the *calling* role, so
 * when the API writes a row as `app_identity` or `app_runtime` - roles that
 * deliberately hold almost no privileges - the insert fails with
 *
 *     permission denied for schema _prisma_dev_wal
 *
 * That schema does not exist on real PostgreSQL. It is an artifact of the
 * development server, so the grant cannot live in a migration: running it
 * against production, or in CI, would fail on a schema that is not there.
 * Hence a separate, idempotent script that no-ops when the schema is absent.
 *
 * This widens nothing that matters. The roles gain write access to a log of
 * their own writes, and no access at all to another tenant's data - row-level
 * security is untouched, and `pnpm db:verify-rls` still proves it.
 *
 * Run with: pnpm db:grants
 */
import 'dotenv/config';
import { Client } from 'pg';

const ROLES = ['app_runtime', 'app_identity', 'app_platform'] as const;
const WAL_SCHEMA = '_prisma_dev_wal';

async function main(): Promise<void> {
  const connectionString = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DIRECT_DATABASE_URL (or DATABASE_URL) is required.');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query<{ exists: boolean }>(
      `select exists (select 1 from pg_namespace where nspname = $1) as exists`,
      [WAL_SCHEMA],
    );

    if (rows[0]?.exists !== true) {
      console.log(
        `No ${WAL_SCHEMA} schema here — this is real PostgreSQL, nothing to grant. Done.`,
      );
      return;
    }

    for (const role of ROLES) {
      await client.query(`GRANT USAGE ON SCHEMA "${WAL_SCHEMA}" TO ${role}`);
      await client.query(`GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA "${WAL_SCHEMA}" TO ${role}`);
      await client.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${WAL_SCHEMA}" TO ${role}`,
      );
      // The dev server recreates these objects when it restarts, so make the
      // grant apply to whatever it creates next as well.
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA "${WAL_SCHEMA}" GRANT SELECT, INSERT ON TABLES TO ${role}`,
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA "${WAL_SCHEMA}" GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
      );
      console.log(`  granted ${WAL_SCHEMA} write access to ${role}`);
    }

    console.log('\nLocal dev grants applied.');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
