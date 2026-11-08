# Project Structure — JewelleryHub

**Version** 0.1 (planning) · **Date** 2026-11-07

---

## 1. Monorepo

pnpm workspaces + Turborepo. One repo so the API contract, Zod schemas and
error codes are shared by construction rather than by discipline.

```
jewellery-selling/
├─ apps/
│  ├─ api/                  NestJS REST API — the only writer to Postgres
│  ├─ web/                  Next.js: marketing, admin, dashboard, storefronts
│  └─ worker/               NestJS standalone: BullMQ consumers + cron
├─ packages/
│  ├─ shared/               Zod schemas, DTO types, error codes, money, jewellery data
│  ├─ db/                   the database boundary: generated Prisma client +
│  │                        the client factory and the three access modes
│  ├─ security/             server-only password and token primitives
│  ├─ ui/                   Shadcn-based component library (both dashboards)
│  ├─ storefront-themes/    Theme components + token schemas + section registry
│  ├─ try-on-sdk/           Embeddable JS SDK (Phase 11)
│  └─ config/               eslint, tsconfig, tailwind, prettier presets
├─ prisma/
│  ├─ schema.prisma         88 models, 47 enums
│  ├─ migrations/           forward-only; 2 applied (init, constraints+search+RLS)
│  ├─ seed.ts               permissions, roles, plans, themes, settings, admin
│  ├─ seed-demo.ts          two complete demo stores (gated, never in production)
│  └─ rls/
│     ├─ generate.ts        generates the RLS policies from the schema
│     ├─ policies.sql       generated output (committed, drift-checked in CI)
│     ├─ constraints.sql    CHECKs, partial unique indexes, search indexes
│     └─ verify.ts          verifies isolation against a live database
├─ docs/                    this planning set, kept current with the code
├─ e2e/                     Playwright suites (dashboard + storefront)
├─ .github/workflows/       CI: lint, typecheck, test, migrate-check, build, deploy
├─ docker-compose.yml       local Postgres + Redis + mailpit
├─ turbo.json
└─ pnpm-workspace.yaml
```

**Why pnpm.** Its strict `node_modules` stops a package importing a dependency
it has not declared, which matters in a monorepo this size. Note that pnpm 11
replaced `onlyBuiltDependencies` with `allowBuilds` in `pnpm-workspace.yaml`:
every dependency that runs an install script needs an explicit `true`/`false`
decision, so a new postinstall script in the tree fails the install rather than
running unreviewed.

**Why `packages/db` exists.** Prisma 7 generates the client as TypeScript
source rather than pre-compiled JavaScript, so it needs a package that compiles
it. That turned out to be a better boundary than the originally planned
`apps/api/src/core/database`: the generated client, the `pg` pool and the three
access modes all live in one package that the API consumes, and the lint rule
forbidding raw client imports becomes a package boundary rather than a path
convention. `apps/api/src/core/database` keeps only the Nest DI wiring.

**Why `packages/security` exists.** Password and token primitives are needed by
both the API and the seed script. Keeping one implementation means the Argon2
cost parameters cannot drift between them. It is deliberately a separate
package from `@jh/shared`, which the browser bundles: `@jh/security` pulls in a
native module and must never reach the client.

## 2. Backend — `apps/api`

```
apps/api/src/
├─ main.ts
├─ app.module.ts
│
├─ core/                            cross-cutting, imported by everything
│  ├─ config/                       typed env config, validated at boot (Zod)
│  ├─ database/
│  │  ├─ prisma.service.ts          raw client — import restricted by lint
│  │  ├─ tenant-prisma.factory.ts   scoped client (storeId extension)
│  │  ├─ transaction.helper.ts      opens TX + SET LOCAL app.current_store_id
│  │  └─ tenant-models.generated.ts generated TENANT_OWNED set
│  ├─ tenancy/
│  │  ├─ tenant-context.ts          AsyncLocalStorage store
│  │  ├─ tenant.guard.ts            resolve + verify store
│  │  └─ store-resolver.service.ts  host → store, Redis-cached
│  ├─ auth/
│  │  ├─ auth.guard.ts  jwt.service.ts  password.service.ts
│  │  ├─ permission.guard.ts  permissions.ts  decorators.ts
│  │  └─ session.service.ts         rotation + reuse detection
│  ├─ entitlements/
│  │  ├─ entitlement.service.ts     effective map = plan ∪ overrides
│  │  ├─ entitlement.guard.ts       @RequireFeature / @RequireLimit
│  │  └─ usage.service.ts           live counts, counted inside the TX
│  ├─ audit/                        interceptor + activity-log writer
│  ├─ cache/                        Redis wrapper; keys always store-prefixed
│  ├─ queue/                        BullMQ registration + typed job payloads
│  ├─ errors/                       AppException, codes, global filter
│  ├─ validation/                   Zod pipe, shared transforms
│  ├─ observability/                pino logger, tracing, metrics, request id
│  └─ crypto/                       envelope encryption for provider configs
│
├─ modules/
│  ├─ auth/                         register, login, refresh, verify, reset, invite
│  ├─ users/                        platform users, roles, permissions
│  ├─ tenants/                      tenant lifecycle
│  ├─ stores/                       store CRUD, settings, domains, provisioning
│  ├─ staff/                        invitations, roles, overrides
│  ├─ subscriptions/                plans, entitlements, subscribe, change, cancel
│  ├─ billing/                      invoices, PDF, payment history, dunning
│  ├─ catalog/
│  │  ├─ products/                  products, variants, options, media, gemstones
│  │  ├─ categories/  brands/  collections/  attributes/
│  │  └─ pricing/                   ← pure domain: metal-rate + making-charge maths
│  ├─ inventory/                    levels, adjustments, movements, reservations,
│  │                                locations, suppliers, purchase orders
│  ├─ orders/
│  │  ├─ orders.service.ts          placement TX, listing, detail
│  │  ├─ order-state-machine.ts     ← pure domain: legal transitions
│  │  ├─ fulfilment/  refunds/  returns/  invoices/
│  ├─ checkout/                     cart, repricing, coupon application, place order
│  ├─ customers/                    customer CRUD, addresses, auth, wishlist
│  ├─ promotions/                   coupons, redemption, shipping zones + rates
│  ├─ reviews/                      submission, moderation, rating aggregation
│  ├─ storefront/                   public read API (config, catalogue, pages)
│  ├─ storefront-builder/           themes, pages, sections, banners, publish
│  ├─ payments/
│  │  ├─ payment.service.ts         order payment orchestration
│  │  ├─ webhook.controller.ts      capture → verify → dedupe → apply
│  │  └─ providers/                 sslcommerz/ bkash/ nagad/ cod/ stripe/
│  ├─ shipping/                     rate calculation, carriers/ pathao/ steadfast/
│  ├─ analytics/                    rollup queries + report builders
│  ├─ notifications/                in-app + templated email/SMS dispatch
│  ├─ media/                        signed uploads, storage adapters
│  ├─ support/                      tickets, messages
│  ├─ platform/                     super-admin controllers over the above services
│  └─ ai/                           provider interfaces; inert without credentials
│
└─ shared/                          Nest-specific helpers, pagination, mappers
```

### Module anatomy

```
modules/catalog/products/
├─ products.controller.ts        HTTP only: route, DTO, permission, swagger
├─ products.service.ts           use cases, transactions, events
├─ products.repository.ts        Prisma via the scoped client
├─ dto/                          re-exported Zod schemas from packages/shared
├─ mappers/                      entity → response DTO (strips costPrice etc.)
└─ __tests__/                    unit (service, mocked repo) + integration (real DB)
```

Enforced boundaries, checked by lint:

- Controllers may not import a repository or Prisma.
- `pricing/` and `order-state-machine.ts` import nothing from Nest or Prisma —
  pure functions over plain data, so the money and status rules are unit-tested
  without a database or an HTTP layer.
- Providers (payment, courier, storage, mail, AI) are only reachable through
  their interface; a concrete provider is never imported by a domain module.
- `modules/platform` composes other modules' services; it owns no entities, so
  admin and tenant paths cannot drift apart in behaviour.

## 3. Frontend — `apps/web`

Four surfaces, one Next.js app, separated by route group. Middleware routes by
hostname, so `aurum.jewelleryhub.com` and `app.jewelleryhub.com` never share a
layout.

```
apps/web/src/
├─ middleware.ts                   host → surface; subdomain → storefront rewrite
│
├─ app/
│  ├─ (marketing)/                 jewelleryhub.com
│  │  ├─ page.tsx  features/  pricing/  about/  contact/
│  │  ├─ login/  register/  forgot-password/  reset-password/  verify-email/
│  │  └─ layout.tsx
│  │
│  ├─ (admin)/                     admin.jewelleryhub.com — Super Admin
│  │  ├─ layout.tsx                sidebar + topbar shell
│  │  ├─ page.tsx                  platform dashboard
│  │  ├─ stores/[id]/  users/  plans/  subscriptions/  payments/
│  │  ├─ invoices/  analytics/  themes/  tickets/  activity/  settings/
│  │
│  ├─ (dashboard)/                 app.jewelleryhub.com — Store Owner / Staff
│  │  ├─ layout.tsx                store switcher, nav gated by permissions
│  │  ├─ page.tsx                  store dashboard
│  │  ├─ products/[id]/  categories/  brands/  collections/  attributes/
│  │  ├─ inventory/  suppliers/  purchase-orders/
│  │  ├─ orders/[id]/  returns/  customers/[id]/
│  │  ├─ coupons/  reviews/  staff/
│  │  ├─ storefront/               theme picker, section editor, banners, pages
│  │  ├─ analytics/  billing/  settings/  activity/
│  │
│  ├─ (storefront)/[storeSlug]/    *.jewelleryhub.com + custom domains
│  │  ├─ layout.tsx                theme tokens → CSS variables
│  │  ├─ page.tsx                  section-composed homepage
│  │  ├─ shop/  collections/[slug]/  categories/[slug]/
│  │  ├─ products/[slug]/
│  │  ├─ cart/  checkout/  checkout/success/  checkout/failed/
│  │  ├─ wishlist/  track-order/  pages/[slug]/
│  │  ├─ account/                  login, register, profile, addresses, orders
│  │  ├─ sitemap.ts  robots.ts  opengraph-image.tsx
│  │
│  └─ api/                         Route Handlers: cookie↔token bridge, webhook
│                                  forwarding, ISR revalidation, upload signing
│
├─ components/
│  ├─ layout/                      shells, sidebars, breadcrumbs, store switcher
│  ├─ data-table/                  one table primitive: sort, filter, select,
│  │                               paginate, column visibility, empty + loading
│  ├─ forms/                       react-hook-form + shared Zod resolvers
│  ├─ charts/                      Recharts wrappers with one token palette
│  ├─ products/  orders/  inventory/  billing/
│  ├─ storefront-editor/           section list, drag-reorder, settings panels
│  └─ feedback/                    toasts, confirm dialogs, skeletons, empty states
│
├─ lib/
│  ├─ api-client.ts                typed fetch; injects store + csrf; maps errors
│  ├─ auth/                        server-side session helpers, route protection
│  ├─ permissions.ts               `can(permission)` for conditional UI
│  ├─ entitlements.ts              `hasFeature`, `usageOf` for upgrade prompts
│  ├─ format.ts                    money, weight, date in the store's locale/TZ
│  └─ query.ts                     TanStack Query client, keys, invalidation
│
├─ hooks/                          useStore, usePermissions, useCart, useDebounce
└─ styles/                         tailwind base, tokens, theme variables
```

### Frontend conventions

- **Server Components by default.** `"use client"` only for interactivity;
  tables, filters and charts are client islands inside server pages.
- **Data fetching**: Server Components for first paint and SEO; TanStack Query
  for client mutations and optimistic updates. No duplicated fetch logic — both
  go through `lib/api-client.ts`.
- **Forms**: react-hook-form with the same Zod schema the API validates, so
  client and server messages cannot disagree.
- **Permissions in the UI** hide what the user cannot do, purely for clarity.
  The server decides; `lib/permissions.ts` is cosmetic by design.
- **Loading**: route-level `loading.tsx` skeletons shaped like the real content,
  not spinners. **Errors**: `error.tsx` per route group with a retry.
- **Empty states** are designed per resource, with the primary action inline —
  a new store's product list is the first screen most owners see.
- **Storefront themes** live in `packages/storefront-themes` so they can be
  versioned and later distributed; `apps/web` only hosts them.

## 4. Shared packages

### `packages/shared`

```
schemas/      product.schema.ts, order.schema.ts, checkout.schema.ts, ...
types/        inferred DTO types, API response envelopes, TenantContext
enums/        re-exported Prisma enums + UI labels (one place for display names)
errors/       ErrorCode union + user-facing message map
money/        Decimal helpers: add, multiply, percent, round-half-up, format
jewellery/    metal purity tables, ring-size conversions, weight conversions
constants/    reserved slugs, entitlement keys, permission keys, order statuses
```

Imported by `api`, `web` and `worker`. An endpoint changing its response shape
breaks the frontend build, which is the point.

### `packages/storefront-themes`

```
registry.ts                    section type → { component, schema, editor meta }
themes/aurum/                  components/ tokens.ts preview.png
themes/lustre/  themes/minima/
sections/                      hero, featuredProducts, collectionGrid,
                               categoryStrip, banner, richText, testimonials,
                               newsletter, instagramStrip, productSpotlight
tokens/                        token schema + default palettes + contrast checks
```

## 5. Worker — `apps/worker`

```
src/
├─ consumers/   email, sms, image-processing, stats-rollup, csv-import,
│               csv-export, invoice-pdf, courier-sync, webhook-retry
├─ cron/        reservation-sweep (1m), subscription-renewal (1h),
│               dunning (1h), trial-reminders (1d), rollup-nightly (1d),
│               abandoned-cart (1h), domain-verification (15m),
│               metal-rate-refresh (opt-in), session-cleanup (1d)
└─ main.ts
```

Every job is idempotent and keyed, so a retry cannot double-send an email or
double-adjust stock. Jobs run with an explicit tenant context, set per job
payload — never inherited.

## 6. Naming and style

| Thing        | Convention                                                             |
| ------------ | ---------------------------------------------------------------------- |
| Files        | kebab-case (`product-variant.service.ts`); React components PascalCase |
| Nest classes | `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.guard.ts`     |
| Zod schemas  | `createProductSchema`, inferred type `CreateProductInput`              |
| DB fields    | camelCase in Prisma; Prisma maps to the quoted identifiers             |
| Env vars     | `SCREAMING_SNAKE`, grouped by prefix (`BKASH_`, `SSLCOMMERZ_`)         |
| Branches     | `feat/`, `fix/`, `chore/`, `docs/` + short slug                        |
| Commits      | Conventional Commits; CI checks the subject line                       |

`tsconfig` is `strict` with `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. `any` is an error outside `*.d.ts`; `unknown`
plus a Zod parse is the sanctioned alternative at boundaries.
