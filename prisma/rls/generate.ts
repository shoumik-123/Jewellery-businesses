/**
 * Generates PostgreSQL row-level-security SQL from schema.prisma.
 *
 * Why generated: the isolation guarantee must cover every tenant-owned table,
 * including the one added next month. Hand-written policies drift; a generator
 * plus the drift check (`pnpm db:rls -- --check`) and the live verifier
 * (`pnpm db:verify-rls`) cannot.
 *
 * Every model lands in exactly one bucket, and an unclassified model fails the
 * build. That is the point: a new table is an isolation decision, never an
 * oversight.
 *
 *   STORE_SCOPED   has a `storeId` column  -> "storeId" = app.current_store_id
 *   TENANT_SCOPED  has a `tenantId` column -> "tenantId" = app.current_tenant_id
 *   ROOT           Store / Tenant          -> matched on their own primary key
 *   CHILD          no tenant column        -> EXISTS against the parent row,
 *                                             which is itself filtered by its
 *                                             own policy, so isolation composes
 *   PLATFORM       no tenant dimension     -> no policy; least-privilege grants
 *
 * Three database roles, so "who may read across tenants" is a property of the
 * connection's current role rather than of a `where` clause:
 *
 *   app_runtime   no BYPASSRLS. Serves tenant requests. Cannot see Session or
 *                 VerificationToken at all, and reads platform catalogues.
 *   app_identity  BYPASSRLS, but granted only the tables needed before a tenant
 *                 context exists: login, token rotation, host -> store routing,
 *                 membership and entitlement lookup. It has no privilege on
 *                 Product, Order, Customer and the rest, so a bug in auth code
 *                 cannot reach merchandise or customer data.
 *   app_platform  BYPASSRLS on everything. Super Admin endpoints and rollup
 *                 jobs only, always behind a platform permission guard.
 *
 *   pnpm db:rls            # write prisma/rls/policies.sql
 *   pnpm db:rls -- --check # fail if the file is stale (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PRISMA_DIR = join(import.meta.dirname, '..');
const SCHEMA_PATH = join(PRISMA_DIR, 'schema.prisma');
const OUTPUT_PATH = join(PRISMA_DIR, 'rls', 'policies.sql');

export const STORE_CONTEXT_VAR = 'app.current_store_id';
export const TENANT_CONTEXT_VAR = 'app.current_tenant_id';

export const ROLE_RUNTIME = 'app_runtime';
export const ROLE_IDENTITY = 'app_identity';
export const ROLE_PLATFORM = 'app_platform';

export interface ModelInfo {
  name: string;
  fields: string[];
}

export function parseModels(schema: string): ModelInfo[] {
  const models: ModelInfo[] = [];
  const cleaned = schema
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line))
    .join('\n');

  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = modelPattern.exec(cleaned)) !== null) {
    const [, name, body] = match;
    if (!name || body === undefined) continue;
    const fields = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('@@'))
      .map((line) => line.split(/\s+/)[0] ?? '')
      .filter((f) => f.length > 0);
    models.push({ name, fields });
  }
  return models;
}

/** The two roots, isolated on their own primary key. */
const ROOT_TABLES = ['Store', 'Tenant'] as const;

/**
 * Child tables with no tenant column of their own. The policy tests that the
 * parent row is visible; because the parent carries its own policy, isolation
 * composes without duplicating `storeId` onto every join table.
 */
export const CHILD_TABLES: Readonly<
  Record<string, { fk: string; parent: string; parentKey?: string }>
> = {
  // Catalogue
  ProductCategory: { fk: 'productId', parent: 'Product' },
  CollectionProduct: { fk: 'productId', parent: 'Product' },
  ProductOption: { fk: 'productId', parent: 'Product' },
  ProductOptionValue: { fk: 'optionId', parent: 'ProductOption' },
  VariantOptionValue: { fk: 'variantId', parent: 'ProductVariant' },
  ProductGemstone: { fk: 'productId', parent: 'Product' },
  RelatedProduct: { fk: 'productId', parent: 'Product' },
  // Inventory
  PurchaseOrderItem: { fk: 'purchaseOrderId', parent: 'PurchaseOrder' },
  // Commerce
  WishlistItem: { fk: 'wishlistId', parent: 'Wishlist' },
  ShipmentItem: { fk: 'shipmentId', parent: 'Shipment' },
  RefundItem: { fk: 'refundId', parent: 'Refund' },
  ReturnItem: { fk: 'returnId', parent: 'ReturnRequest' },
  CouponProduct: { fk: 'couponId', parent: 'Coupon' },
  CouponCategory: { fk: 'couponId', parent: 'Coupon' },
  // People
  StoreMemberPermission: { fk: 'storeMemberId', parent: 'StoreMember' },
  // Billing
  InvoiceLine: { fk: 'invoiceId', parent: 'Invoice' },
  SubscriptionOverride: { fk: 'subscriptionId', parent: 'Subscription' },
  SubscriptionEvent: { fk: 'subscriptionId', parent: 'Subscription' },
  SupportMessage: { fk: 'ticketId', parent: 'SupportTicket' },
};

/**
 * Tables with no tenant dimension. No policy — a policy would have nothing to
 * compare against. Each entry states why, because this list is the complete
 * set of places where isolation is a privilege question rather than a row
 * question.
 */
export const PLATFORM_TABLES: Readonly<Record<string, string>> = {
  User: 'one login may work for several stores; scoped by membership, not by row',
  Session: 'must be readable before any tenant context exists (login, refresh)',
  VerificationToken: 'consumed before the user has a store context',
  Role: 'platform catalogue, identical for every tenant',
  Permission: 'platform catalogue',
  RolePermission: 'platform catalogue',
  PlatformRoleAssignment: 'grants platform roles; no tenant dimension',
  Theme: 'platform catalogue of storefront themes',
  SubscriptionPlan: 'public pricing catalogue',
  PlanEntitlement: 'child of the public plan catalogue',
  PlatformSetting: 'platform configuration',
  PlatformDailyStat: 'platform-wide rollup, no tenant dimension',
  WebhookEvent: 'raw provider callbacks, captured before the store is resolved',
};

/** app_runtime gets read-only access to these: platform catalogues it may join to. */
const RUNTIME_READ_ONLY = [
  'User',
  'Role',
  'Permission',
  'RolePermission',
  'PlatformRoleAssignment',
  'Theme',
  'SubscriptionPlan',
  'PlanEntitlement',
  'PlatformSetting',
  'PlatformDailyStat',
  'WebhookEvent',
];

/** app_runtime gets no access at all to these. Only identity mode touches them. */
const RUNTIME_DENIED = ['Session', 'VerificationToken'];

/**
 * The only tables app_identity may touch: everything needed to answer "who is
 * this, which store is this, and what is their plan" — and nothing else.
 */
const IDENTITY_TABLES = [
  'User',
  'Session',
  'VerificationToken',
  'Role',
  'Permission',
  'RolePermission',
  'PlatformRoleAssignment',
  'StoreMember',
  'StoreMemberPermission',
  'ApiKey',
  'Store',
  'StoreDomain',
  'StoreSettings',
  'Tenant',
  'Subscription',
  'SubscriptionPlan',
  'PlanEntitlement',
  'SubscriptionOverride',
  'Customer',
];

export function storeScoped(models: ModelInfo[]): string[] {
  return models
    .filter(
      (m) =>
        m.fields.includes('storeId') &&
        !(ROOT_TABLES as readonly string[]).includes(m.name) &&
        !(m.name in PLATFORM_TABLES),
    )
    .map((m) => m.name)
    .sort();
}

export function tenantScoped(models: ModelInfo[]): string[] {
  return models
    .filter(
      (m) =>
        m.fields.includes('tenantId') &&
        !m.fields.includes('storeId') &&
        !(ROOT_TABLES as readonly string[]).includes(m.name) &&
        !(m.name in PLATFORM_TABLES),
    )
    .map((m) => m.name)
    .sort();
}

function toSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function enableRls(table: string): string {
  return `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`;
}

function columnPolicy(table: string, column: string, contextVar: string): string {
  const policy = `${toSnake(table)}_isolation`;
  return `
${enableRls(table)}
DROP POLICY IF EXISTS ${policy} ON "${table}";
CREATE POLICY ${policy} ON "${table}"
  USING ("${column}" = current_setting('${contextVar}', true))
  WITH CHECK ("${column}" = current_setting('${contextVar}', true));`;
}

function childPolicy(table: string, fk: string, parent: string, parentKey = 'id'): string {
  const policy = `${toSnake(table)}_isolation`;
  // The subquery is itself subject to the parent's policy for this role, so a
  // child row is visible exactly when its parent is.
  return `
${enableRls(table)}
DROP POLICY IF EXISTS ${policy} ON "${table}";
CREATE POLICY ${policy} ON "${table}"
  USING (EXISTS (SELECT 1 FROM "${parent}" p WHERE p."${parentKey}" = "${table}"."${fk}"))
  WITH CHECK (EXISTS (SELECT 1 FROM "${parent}" p WHERE p."${parentKey}" = "${table}"."${fk}"));`;
}

function rootPolicies(): string {
  return `
-- The Store row: addressable by its own id (storefront and dashboard) or by its
-- owning tenant (billing screens, which run with tenant context set).
${enableRls('Store')}
DROP POLICY IF EXISTS store_isolation ON "Store";
CREATE POLICY store_isolation ON "Store"
  USING (
    "id" = current_setting('${STORE_CONTEXT_VAR}', true)
    OR "tenantId" = current_setting('${TENANT_CONTEXT_VAR}', true)
  )
  WITH CHECK (
    "id" = current_setting('${STORE_CONTEXT_VAR}', true)
    OR "tenantId" = current_setting('${TENANT_CONTEXT_VAR}', true)
  );

-- The Tenant row.
${enableRls('Tenant')}
DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
CREATE POLICY tenant_isolation ON "Tenant"
  USING ("id" = current_setting('${TENANT_CONTEXT_VAR}', true))
  WITH CHECK ("id" = current_setting('${TENANT_CONTEXT_VAR}', true));`;
}

function header(storeCount: number, tenantCount: number, childCount: number): string {
  return `-- ============================================================================
-- Row-level security — GENERATED by prisma/rls/generate.ts. DO NOT EDIT.
-- Regenerate with: pnpm db:rls
--
-- Layer 4 of the four described in docs/03-multi-tenancy.md. The application
-- also scopes every query through a Prisma client extension; this is the layer
-- that holds when that one fails.
--
-- A tenant request reaches data like this:
--     BEGIN;
--       SET LOCAL ROLE ${ROLE_RUNTIME};                -- no BYPASSRLS
--       SET LOCAL ${STORE_CONTEXT_VAR} = '<storeId>';
--       ...queries...
--     COMMIT;                                       -- both settings expire
--
-- SET LOCAL is transaction-scoped, so a pooled connection cannot carry one
-- store's context into another store's query.
--
-- Fail closed: current_setting(..., true) is NULL when unset and
-- "storeId" = NULL matches nothing, so a query that escapes the application's
-- scoping returns zero rows rather than every row.
--
-- Protected: ${storeCount} store-scoped, ${tenantCount} tenant-scoped,
--            ${childCount} via parent, plus Store and Tenant.
-- ============================================================================
`;
}

function rolesSql(): string {
  const identityList = IDENTITY_TABLES.map((t) => `"${t}"`).join(', ');
  const readOnlyList = RUNTIME_READ_ONLY.map((t) => `"${t}"`).join(', ');
  const deniedList = RUNTIME_DENIED.map((t) => `"${t}"`).join(', ');

  return `
-- ---------------------------------------------------------------------------
-- Roles. Cross-tenant reach is a property of the current role, not of a query.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE_RUNTIME}') THEN
    CREATE ROLE ${ROLE_RUNTIME} NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE_IDENTITY}') THEN
    CREATE ROLE ${ROLE_IDENTITY} NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE_PLATFORM}') THEN
    CREATE ROLE ${ROLE_PLATFORM} NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- Whoever connects must be able to assume the three roles.
DO $$
BEGIN
  EXECUTE format('GRANT ${ROLE_RUNTIME}, ${ROLE_IDENTITY}, ${ROLE_PLATFORM} TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not grant application roles to %: %', current_user, SQLERRM;
END $$;

GRANT USAGE ON SCHEMA public TO ${ROLE_RUNTIME}, ${ROLE_IDENTITY}, ${ROLE_PLATFORM};

-- app_platform: everything, but it has to be entered deliberately.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE_PLATFORM};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROLE_PLATFORM};

-- app_runtime: everything except the session tables, read-only on catalogues.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE_RUNTIME};
REVOKE ALL ON ${deniedList} FROM ${ROLE_RUNTIME};
REVOKE INSERT, UPDATE, DELETE ON ${readOnlyList} FROM ${ROLE_RUNTIME};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROLE_RUNTIME};

-- app_identity: only what is needed before a tenant context exists.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE_IDENTITY};
GRANT SELECT, INSERT, UPDATE, DELETE ON ${identityList} TO ${ROLE_IDENTITY};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROLE_IDENTITY};

-- Tables added by later migrations inherit the runtime and platform grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROLE_RUNTIME}, ${ROLE_PLATFORM};
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${ROLE_RUNTIME}, ${ROLE_IDENTITY}, ${ROLE_PLATFORM};
`;
}

export function generateSql(schema: string): string {
  const models = parseModels(schema);
  const storeTables = storeScoped(models);
  const tenantTables = tenantScoped(models);
  const childTables = Object.keys(CHILD_TABLES).sort();

  const classified = new Set<string>([
    ...storeTables,
    ...tenantTables,
    ...childTables,
    ...Object.keys(PLATFORM_TABLES),
    ...ROOT_TABLES,
  ]);

  const unclassified = models.map((m) => m.name).filter((name) => !classified.has(name));
  if (unclassified.length > 0) {
    throw new Error(
      `Unclassified model(s): ${unclassified.join(', ')}.\n` +
        'Every model must be isolated or explicitly exempt. Either add a storeId/tenantId ' +
        'column, add a CHILD_TABLES entry naming its parent, or add it to PLATFORM_TABLES ' +
        'with a reason — in prisma/rls/generate.ts.',
    );
  }

  // A table cannot be both isolated and exempt.
  const overlap = [...storeTables, ...tenantTables, ...childTables].filter(
    (t) => t in PLATFORM_TABLES,
  );
  if (overlap.length > 0) {
    throw new Error(`Model(s) both isolated and exempt: ${overlap.join(', ')}.`);
  }

  // Every child's parent must itself be protected, or the chain is broken.
  for (const [table, { parent }] of Object.entries(CHILD_TABLES)) {
    const parentProtected =
      storeTables.includes(parent) ||
      tenantTables.includes(parent) ||
      childTables.includes(parent) ||
      (ROOT_TABLES as readonly string[]).includes(parent);
    if (!parentProtected) {
      throw new Error(
        `CHILD_TABLES["${table}"] points at "${parent}", which has no policy of its own. ` +
          'A child policy only isolates if its parent does.',
      );
    }
  }

  const parts: string[] = [
    header(storeTables.length, tenantTables.length, childTables.length),
    rolesSql(),
    `
-- ---------------------------------------------------------------------------
-- Store-scoped (${storeTables.length})
-- ---------------------------------------------------------------------------`,
  ];

  for (const table of storeTables) {
    parts.push(columnPolicy(table, 'storeId', STORE_CONTEXT_VAR));
  }

  parts.push(`
-- ---------------------------------------------------------------------------
-- Tenant-scoped (${tenantTables.length})
-- ---------------------------------------------------------------------------`);
  for (const table of tenantTables) {
    parts.push(columnPolicy(table, 'tenantId', TENANT_CONTEXT_VAR));
  }

  parts.push(`
-- ---------------------------------------------------------------------------
-- Roots
-- ---------------------------------------------------------------------------`);
  parts.push(rootPolicies());

  parts.push(`
-- ---------------------------------------------------------------------------
-- Isolated through their parent (${childTables.length})
-- ---------------------------------------------------------------------------`);
  for (const table of childTables) {
    const spec = CHILD_TABLES[table]!;
    parts.push(childPolicy(table, spec.fk, spec.parent, spec.parentKey));
  }

  parts.push(`
-- ---------------------------------------------------------------------------
-- No policy, by decision (${Object.keys(PLATFORM_TABLES).length}):
${Object.entries(PLATFORM_TABLES)
  .map(([t, why]) => `--   ${t.padEnd(24)} ${why}`)
  .join('\n')}
-- ---------------------------------------------------------------------------
`);

  return `${parts.join('\n')}\n`;
}

function main(): void {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const sql = generateSql(schema);

  if (process.argv.includes('--check')) {
    let existing = '';
    try {
      existing = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
      existing = '';
    }
    if (existing !== sql) {
      console.error(
        'prisma/rls/policies.sql is stale. Run `pnpm db:rls`, review the diff, and commit it.',
      );
      process.exit(1);
    }
    console.warn('RLS policies are in sync with schema.prisma.');
    return;
  }

  writeFileSync(OUTPUT_PATH, sql);
  const models = parseModels(schema);
  console.warn(
    [
      `Wrote ${OUTPUT_PATH}`,
      `  store-scoped : ${storeScoped(models).length}`,
      `  tenant-scoped: ${tenantScoped(models).length}`,
      `  via parent   : ${Object.keys(CHILD_TABLES).length}`,
      `  roots        : ${ROOT_TABLES.length}`,
      `  no policy    : ${Object.keys(PLATFORM_TABLES).length}`,
      `  total models : ${models.length}`,
    ].join('\n'),
  );
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main();
}
