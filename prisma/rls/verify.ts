/**
 * Verifies tenant isolation *against the live database, with the application
 * bypassed entirely*.
 *
 * This matters: an isolation test that goes through the API only proves the API
 * is scoping correctly today. This one proves the database refuses cross-tenant
 * access even when the application is wrong — which is the whole reason
 * row-level security is layer 4 rather than the only layer.
 *
 * It connects as the owner to build fixtures, then switches to the application
 * roles with `SET LOCAL ROLE`, exactly as the request path does.
 *
 * Every check runs in its own transaction. A statement that RLS rejects aborts
 * its transaction, and the local WASM dev server does not tolerate savepoint
 * recovery, so one-transaction-per-check is both simpler and portable.
 *
 *   pnpm db:verify-rls
 *
 * Exits non-zero on any failure. Required check in CI, where it runs against
 * real PostgreSQL.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import {
  CHILD_TABLES,
  PLATFORM_TABLES,
  ROLE_IDENTITY,
  ROLE_PLATFORM,
  ROLE_RUNTIME,
  STORE_CONTEXT_VAR,
  TENANT_CONTEXT_VAR,
  parseModels,
  storeScoped,
  tenantScoped,
} from './generate.ts';

const DATABASE_URL = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('DIRECT_DATABASE_URL or DATABASE_URL must be set.');
  process.exit(1);
}

const FIXTURE_PREFIX = 'rlsverify';
const id = (suffix: string): string => `${FIXTURE_PREFIX}${suffix}`;

let checks = 0;
let failures = 0;
let skipped = 0;

/**
 * True when running against the local `prisma dev` server, which is PostgreSQL
 * compiled to WebAssembly. It is fine for schema and feature work but has a
 * defect that terminates the server when a transaction issues an UPDATE or
 * DELETE that row-level security filters to zero rows. Those specific checks
 * are therefore skipped there and must be covered by a run against real
 * PostgreSQL (which is what CI does).
 */
let isWasmDevServer = false;

function pass(label: string): void {
  checks += 1;
  console.warn(`  PASS  ${label}`);
}

function fail(label: string, detail: string): void {
  checks += 1;
  failures += 1;
  console.error(`  FAIL  ${label}\n        ${detail}`);
}

function skip(label: string, reason: string): void {
  checks += 1;
  skipped += 1;
  console.warn(`  SKIP  ${label}\n        ${reason}`);
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass(label);
  else fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertTrue(label: string, value: boolean, detail = 'expected true'): void {
  if (value) pass(label);
  else fail(label, detail);
}

type Mode = { role: string; storeId?: string; tenantId?: string };

/**
 * The local `prisma dev` server (PGlite, Postgres compiled to WASM) terminates
 * if a transaction issues ROLLBACK after an UPDATE that row-level security
 * filtered down to zero rows. That is a defect in the dev server, not in these
 * policies — real PostgreSQL handles it — but the suite has to survive it, so
 * transactions that are expected to change nothing end with COMMIT instead.
 * CI runs this file against real PostgreSQL, where either ending works.
 */
async function inMode<T>(
  db: Client,
  mode: Mode,
  fn: () => Promise<T>,
  finish: 'ROLLBACK' | 'COMMIT' = 'ROLLBACK',
): Promise<T> {
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${mode.role}`);
    if (mode.storeId !== undefined) {
      await db.query(`SET LOCAL ${STORE_CONTEXT_VAR} = '${mode.storeId}'`);
    }
    if (mode.tenantId !== undefined) {
      await db.query(`SET LOCAL ${TENANT_CONTEXT_VAR} = '${mode.tenantId}'`);
    }
    return await fn();
  } finally {
    await db.query(finish).catch(() => undefined);
  }
}

/** Rows visible to a given role/context. */
async function rowsIn<T extends Record<string, unknown>>(
  db: Client,
  mode: Mode,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return inMode(db, mode, async () => (await db.query<T>(sql, params)).rows);
}

/** Run a statement expected to be refused; returns the error, or null on success. */
async function refusalOf(
  db: Client,
  mode: Mode,
  sql: string,
  params: unknown[] = [],
  finish: 'ROLLBACK' | 'COMMIT' = 'ROLLBACK',
): Promise<{ error: Error | null; rowCount: number | null }> {
  return inMode(
    db,
    mode,
    async () => {
      try {
        const result = await db.query(sql, params);
        return { error: null, rowCount: result.rowCount };
      } catch (error) {
        return { error: error as Error, rowCount: null };
      }
    },
    finish,
  );
}

async function main(): Promise<void> {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const tenantMode = (storeId: string): Mode => ({ role: ROLE_RUNTIME, storeId });
  const storeA = tenantMode(id('storea'));

  const { rows: versionRows } = await db.query<{ version: string }>('SELECT version()');
  const version = versionRows[0]?.version ?? '';
  isWasmDevServer = /wasm32|emscripten/i.test(version);
  console.warn(`\nServer: ${version.split(',')[0] ?? 'unknown'}`);
  if (isWasmDevServer) {
    console.warn(
      'NOTE: this is the local WASM dev server. A few write checks are skipped;\n' +
        '      they are covered by the CI run against real PostgreSQL.',
    );
  }

  // -------------------------------------------------------------------------
  console.warn('\n=== 1. Roles ===');
  const roles = await db.query<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }>(
    'SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = ANY($1)',
    [[ROLE_RUNTIME, ROLE_IDENTITY, ROLE_PLATFORM]],
  );
  const byName = new Map(roles.rows.map((r) => [r.rolname, r]));
  const runtime = byName.get(ROLE_RUNTIME);

  assertTrue(`${ROLE_RUNTIME} exists`, runtime !== undefined);
  assertTrue(
    `${ROLE_RUNTIME} cannot bypass RLS`,
    runtime?.rolbypassrls === false && runtime?.rolsuper === false,
    'the role that serves tenant requests must not be able to bypass row-level security',
  );
  assertTrue(`${ROLE_IDENTITY} may bypass RLS`, byName.get(ROLE_IDENTITY)?.rolbypassrls === true);
  assertTrue(`${ROLE_PLATFORM} may bypass RLS`, byName.get(ROLE_PLATFORM)?.rolbypassrls === true);

  // -------------------------------------------------------------------------
  console.warn('\n=== 2. Coverage: every tenant-owned table is protected ===');
  const schema = readFileSync(join(import.meta.dirname, '..', 'schema.prisma'), 'utf8');
  const models = parseModels(schema);
  const expectProtected = [
    ...storeScoped(models),
    ...tenantScoped(models),
    ...Object.keys(CHILD_TABLES),
    'Store',
    'Tenant',
  ];

  const state = await db.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
    policies: number;
  }>(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
            (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  );
  const stateByName = new Map(state.rows.map((r) => [r.relname, r]));

  const unprotected = expectProtected
    .map((table) => ({ table, row: stateByName.get(table) }))
    .filter(
      ({ row }) => !row || !row.relrowsecurity || !row.relforcerowsecurity || row.policies < 1,
    )
    .map(
      ({ table, row }) =>
        `${table} (rls=${String(row?.relrowsecurity)}, force=${String(
          row?.relforcerowsecurity,
        )}, policies=${String(row?.policies)})`,
    );
  assertEqual(
    `all ${expectProtected.length} tenant-owned tables have FORCE RLS and a policy`,
    unprotected,
    [],
  );

  // The inverse: nothing is quietly exempt.
  const exempt = state.rows
    .filter((r) => !r.relrowsecurity && r.relname !== '_prisma_migrations')
    .map((r) => r.relname)
    .sort();
  assertEqual(
    'the only unprotected tables are the declared platform tables',
    exempt,
    Object.keys(PLATFORM_TABLES).sort(),
  );

  // -------------------------------------------------------------------------
  console.warn('\n=== 3. Fixtures (as owner) ===');
  await cleanup(db);
  const now = new Date().toISOString();
  for (const suffix of ['a', 'b']) {
    await db.query(
      `INSERT INTO "User" (id, email, "firstName", status, "createdAt", "updatedAt")
       VALUES ($1, $2, 'Verify', 'ACTIVE', $3, $3)`,
      [id(`user${suffix}`), `${FIXTURE_PREFIX}.${suffix}@example.test`, now],
    );
    await db.query(
      `INSERT INTO "Tenant" (id, name, slug, "ownerUserId", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $2, $3, 'ACTIVE', $4, $4)`,
      [id(`tenant${suffix}`), id(`tenant-${suffix}`), id(`user${suffix}`), now],
    );
    await db.query(
      `INSERT INTO "Store" (id, "tenantId", name, slug, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $3, 'ACTIVE', $4, $4)`,
      [id(`store${suffix}`), id(`tenant${suffix}`), id(`store-${suffix}`), now],
    );
    await db.query(
      `INSERT INTO "Product"
         (id, "storeId", name, slug, sku, "jewelleryType", price, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $3, $4, 'RING', 1000.00, 'ACTIVE', $5, $5)`,
      [
        id(`product${suffix}`),
        id(`store${suffix}`),
        id(`product-${suffix}`),
        id(`SKU-${suffix}`),
        now,
      ],
    );
    // A child row with no storeId of its own: isolated through its parent.
    await db.query(
      `INSERT INTO "ProductGemstone" (id, "productId", "stoneType", count)
       VALUES ($1, $2, 'Diamond', 1)`,
      [id(`gem${suffix}`), id(`product${suffix}`)],
    );
  }
  pass('two independent stores, each with a product and a child gemstone row');

  // -------------------------------------------------------------------------
  console.warn(`\n=== 4. Reads in tenant mode (SET LOCAL ROLE ${ROLE_RUNTIME}) ===`);

  const noContext: Mode = { role: ROLE_RUNTIME };
  assertEqual(
    'no store context -> zero products (fails closed, not open)',
    (await rowsIn<{ c: number }>(db, noContext, 'SELECT count(*)::int c FROM "Product"'))[0]?.c,
    0,
  );
  assertEqual(
    'no store context -> zero stores',
    (await rowsIn<{ c: number }>(db, noContext, 'SELECT count(*)::int c FROM "Store"'))[0]?.c,
    0,
  );
  assertEqual(
    "store A sees only store A's product",
    (await rowsIn<{ id: string }>(db, storeA, 'SELECT id FROM "Product" ORDER BY id')).map(
      (r) => r.id,
    ),
    [id('producta')],
  );
  assertEqual(
    'store A sees only its own Store row',
    (await rowsIn<{ id: string }>(db, storeA, 'SELECT id FROM "Store" ORDER BY id')).map(
      (r) => r.id,
    ),
    [id('storea')],
  );
  assertEqual(
    'child rows are isolated through their parent product',
    (await rowsIn<{ id: string }>(db, storeA, 'SELECT id FROM "ProductGemstone" ORDER BY id')).map(
      (r) => r.id,
    ),
    [id('gema')],
  );
  assertEqual(
    "asking for store B's product by primary key returns nothing",
    (
      await rowsIn<{ c: number }>(
        db,
        storeA,
        'SELECT count(*)::int c FROM "Product" WHERE id = $1',
        [id('productb')],
      )
    )[0]?.c,
    0,
  );
  assertEqual(
    "asking for store B's gemstone by primary key returns nothing",
    (
      await rowsIn<{ c: number }>(
        db,
        storeA,
        'SELECT count(*)::int c FROM "ProductGemstone" WHERE id = $1',
        [id('gemb')],
      )
    )[0]?.c,
    0,
  );

  // -------------------------------------------------------------------------
  console.warn('\n=== 5. Writes in tenant mode ===');

  const insert = await refusalOf(
    db,
    storeA,
    `INSERT INTO "Product" (id, "storeId", name, slug, sku, "jewelleryType", price, "createdAt", "updatedAt")
       VALUES ($1, $2, 'Sneaky', 'sneaky-x', 'SNEAK-1', 'RING', 1.00, now(), now())`,
    [id('sneaky'), id('storeb')],
  );
  assertTrue(
    "inserting a row into another store's catalogue is refused",
    insert.error !== null && /row-level security/i.test(insert.error.message),
    insert.error === null ? 'the insert succeeded' : insert.error.message,
  );

  const move = await refusalOf(db, storeA, 'UPDATE "Product" SET "storeId" = $1 WHERE id = $2', [
    id('storeb'),
    id('producta'),
  ]);
  assertTrue(
    'moving your own row into another store is refused',
    move.error !== null || move.rowCount === 0,
    `UPDATE changed ${String(move.rowCount)} row(s)`,
  );

  // An UPDATE or DELETE that RLS narrows to zero rows crashes the WASM dev
  // server outright, so these three run only against real PostgreSQL.
  const wasmSkip =
    'the local WASM dev server terminates on an UPDATE/DELETE that RLS filters to zero rows; ' +
    'run against real PostgreSQL (CI does) to verify this';

  if (isWasmDevServer) {
    skip("updating another store's product affects no rows", wasmSkip);
    skip("deleting another store's product affects no rows", wasmSkip);
    skip("deleting another store's child row affects no rows", wasmSkip);
  } else {
    const updateForeign = await refusalOf(
      db,
      storeA,
      'UPDATE "Product" SET price = 1 WHERE id = $1',
      [id('productb')],
    );
    assertTrue(
      "updating another store's product affects no rows",
      updateForeign.error !== null || updateForeign.rowCount === 0,
      `UPDATE changed ${String(updateForeign.rowCount)} row(s)`,
    );

    const deleteForeign = await refusalOf(db, storeA, 'DELETE FROM "Product" WHERE id = $1', [
      id('productb'),
    ]);
    assertTrue(
      "deleting another store's product affects no rows",
      deleteForeign.error !== null || deleteForeign.rowCount === 0,
      `DELETE removed ${String(deleteForeign.rowCount)} row(s)`,
    );

    const deleteForeignChild = await refusalOf(
      db,
      storeA,
      'DELETE FROM "ProductGemstone" WHERE id = $1',
      [id('gemb')],
    );
    assertTrue(
      "deleting another store's child row affects no rows",
      deleteForeignChild.error !== null || deleteForeignChild.rowCount === 0,
      `DELETE removed ${String(deleteForeignChild.rowCount)} row(s)`,
    );

    // And prove it: store B's rows are still there.
    const survivors = await db.query<{ c: number }>(
      'SELECT count(*)::int c FROM "Product" WHERE id = $1',
      [id('productb')],
    );
    assertEqual(
      "store B's product still exists after store A tried to delete it",
      survivors.rows[0]?.c,
      1,
    );
  }

  // -------------------------------------------------------------------------
  console.warn('\n=== 6. Least privilege, not just row filtering ===');

  const sessionRead = await refusalOf(db, storeA, 'SELECT count(*) FROM "Session"');
  assertTrue(
    `${ROLE_RUNTIME} has no privilege on Session at all`,
    sessionRead.error !== null && /permission denied/i.test(sessionRead.error.message),
    'tenant-mode code must not be able to read session rows, context or not',
  );

  const planWrite = await refusalOf(
    db,
    storeA,
    `UPDATE "SubscriptionPlan" SET "monthlyPrice" = 0 WHERE true`,
  );
  assertTrue(
    `${ROLE_RUNTIME} cannot write the plan catalogue`,
    planWrite.error !== null && /permission denied/i.test(planWrite.error.message),
    'a tenant request must not be able to rewrite pricing',
  );

  const identityMode: Mode = { role: ROLE_IDENTITY };
  const identitySession = await refusalOf(db, identityMode, 'SELECT count(*) FROM "Session"');
  assertTrue(
    'identity mode can read Session (needed before any context exists)',
    identitySession.error === null,
    identitySession.error?.message ?? '',
  );
  const identityProduct = await refusalOf(db, identityMode, 'SELECT count(*) FROM "Product"');
  assertTrue(
    'identity mode has no privilege on Product',
    identityProduct.error !== null && /permission denied/i.test(identityProduct.error.message),
    'a bug in auth code must not be able to reach merchandise',
  );
  const identityOrder = await refusalOf(db, identityMode, 'SELECT count(*) FROM "Order"');
  assertTrue(
    'identity mode has no privilege on Order',
    identityOrder.error !== null && /permission denied/i.test(identityOrder.error.message),
  );

  // -------------------------------------------------------------------------
  console.warn('\n=== 7. Context does not outlive its transaction ===');
  await inMode(db, storeA, async () => undefined);
  const leaked = await db.query<{ v: string | null; u: string }>(
    `SELECT current_setting('${STORE_CONTEXT_VAR}', true) AS v, current_user AS u`,
  );
  assertTrue(
    'the store context is empty after the transaction ends (safe to pool)',
    !leaked.rows[0]?.v,
    `leaked value: ${String(leaked.rows[0]?.v)}`,
  );
  assertTrue(
    'the role reverts after the transaction ends',
    leaked.rows[0]?.u !== ROLE_RUNTIME,
    `still ${String(leaked.rows[0]?.u)}`,
  );

  // -------------------------------------------------------------------------
  console.warn('\n=== 8. Tenant context for billing tables ===');
  const tenantA: Mode = { role: ROLE_RUNTIME, tenantId: id('tenanta') };
  assertEqual(
    'tenant A sees only its own Tenant row',
    (await rowsIn<{ id: string }>(db, tenantA, 'SELECT id FROM "Tenant" ORDER BY id')).map(
      (r) => r.id,
    ),
    [id('tenanta')],
  );
  assertEqual(
    'tenant context reaches its own stores, for billing screens',
    (await rowsIn<{ id: string }>(db, tenantA, 'SELECT id FROM "Store" ORDER BY id')).map(
      (r) => r.id,
    ),
    [id('storea')],
  );
  assertEqual(
    'tenant context alone does not expose catalogue rows',
    (await rowsIn<{ c: number }>(db, tenantA, 'SELECT count(*)::int c FROM "Product"'))[0]?.c,
    0,
  );

  // -------------------------------------------------------------------------
  console.warn(`\n=== 9. Platform mode (SET LOCAL ROLE ${ROLE_PLATFORM}) ===`);
  assertEqual(
    'platform mode sees every store',
    (
      await rowsIn<{ c: number }>(
        db,
        { role: ROLE_PLATFORM },
        'SELECT count(*)::int c FROM "Store" WHERE id LIKE $1',
        [`${FIXTURE_PREFIX}%`],
      )
    )[0]?.c,
    2,
  );
  assertEqual(
    'platform mode sees every product',
    (
      await rowsIn<{ c: number }>(
        db,
        { role: ROLE_PLATFORM },
        'SELECT count(*)::int c FROM "Product" WHERE id LIKE $1',
        [`${FIXTURE_PREFIX}%`],
      )
    )[0]?.c,
    2,
  );

  // -------------------------------------------------------------------------
  console.warn('\n=== 10. Cleanup ===');
  await cleanup(db);
  pass('fixtures removed');

  await db.end();

  const passed = checks - failures - skipped;
  const summary =
    `${passed}/${checks} checks passed` +
    (failures > 0 ? `, ${failures} failed` : '') +
    (skipped > 0 ? `, ${skipped} skipped` : '');
  console.warn(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${summary}`);
  if (skipped > 0) {
    console.warn(
      'Skipped checks are NOT verified. Run this against real PostgreSQL before relying on it.\n',
    );
  } else {
    console.warn('');
  }
  if (failures > 0) process.exit(1);
}

async function cleanup(db: Client): Promise<void> {
  // The owner connection bypasses RLS, so this reaches every fixture row.
  const like = `${FIXTURE_PREFIX}%`;
  for (const table of ['ProductGemstone', 'Product', 'Store', 'Tenant', 'User']) {
    await db.query(`DELETE FROM "${table}" WHERE id LIKE $1`, [like]);
  }
}

main().catch((error: unknown) => {
  console.error('\nVerifier crashed:', error);
  process.exit(1);
});
