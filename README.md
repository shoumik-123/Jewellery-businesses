# JewelleryHub

A multi-tenant SaaS platform that lets jewellery businesses launch and run
their own online store — catalogue, inventory, storefront, checkout, orders and
subscription billing — without writing code.

**বাংলায় সম্পূর্ণ নির্দেশিকা: [README.bn.md](README.bn.md) · পেজ তালিকা: [PAGES.bn.md](PAGES.bn.md)**

**Status: scaffold, database, storefront, authentication and RBAC are complete
and verified. A shop can now manage its own catalogue from its dashboard —
add, edit and archive products. Variants, stock and orders are next.**

| Phase | What                                                                             | State |
| ----- | -------------------------------------------------------------------------------- | ----- |
| —     | Planning: SRS, architecture, data model, API, auth, roadmap, testing, deployment | done  |
| 0     | Monorepo, toolchain, lint/format/typecheck, CI, shared packages                  | done  |
| 1     | Schema, migrations, constraints, search, row-level security, seed                | done  |
| 1.5   | Storefront slice: NestJS API, Next.js shop, host-based tenant routing            | done  |
| 2     | Authentication, sessions, RBAC                                                   | done  |
| 3     | Multi-tenancy wiring in the API (guards, context, scoped client)                 | done  |
| 4     | Shop dashboard: product list, create, edit, archive                              | done  |
| 4     | Variants and sizes, stock per location, category and brand editing               | next  |

103 unit tests pass and all 33 live tenant-isolation checks pass locally
against PostgreSQL 18. Two storefronts render from real rows at
`localhost:3000`. See **Verified so far** below.

---

## Quick start

```bash
pnpm install          # pnpm 12+, Node 22+
# PostgreSQL 17 or 18, listening on 127.0.0.1:5432
createdb jewelleryhub           # or: CREATE DATABASE jewelleryhub;
cp .env.example .env            # set DATABASE_URL / DIRECT_DATABASE_URL
pnpm db:generate      # generate the Prisma client
pnpm db:deploy        # 88 tables, constraints, search, RLS policies, roles
pnpm media:generate   # demo catalogue imagery
pnpm db:seed          # reference data, admin, and the two demo stores
pnpm dev              # API on :4000, storefront on :3000
```

The migration creates the `app_runtime`, `app_identity` and `app_platform`
roles itself, so a plain superuser connection string is all `.env` needs.

Then open **http://localhost:3000** and pick a store.

| What                   | Where                                   |
| ---------------------- | --------------------------------------- |
| Store directory        | http://localhost:3000                   |
| Aurum Jewellers        | http://localhost:3000/s/aurum-jewellers |
| Silver Leaf Studio     | http://localhost:3000/s/silver-leaf     |
| The same, by subdomain | http://aurum-jewellers.localhost:3000   |
| API                    | http://localhost:4000/v1/health/ready   |
| Browse the raw data    | `pnpm db:studio`                        |

`pnpm db:up` still starts a no-install WebAssembly Postgres as a fallback, but
it cannot run sign-in: it terminates on any UPDATE issued under a non-owner
role. Real PostgreSQL is the supported local database.

Browsers resolve `*.localhost` to 127.0.0.1 with no hosts-file entry, so the
subdomain form — which is how stores are addressed in production — works
locally too. `pnpm dev:api` and `pnpm dev:web` run the two halves separately.

Other checks worth running:

```bash
pnpm db:verify-rls    # prove tenant isolation against the live database
pnpm test             # 85 unit tests
```

`docker compose up -d postgres redis mailpit` gives real PostgreSQL instead —
recommended before trusting an isolation result, for the reasons in
[docs/03-multi-tenancy.md](docs/03-multi-tenancy.md) §11.

Seeded demo logins (local only): `owner@aurum.test` and `owner@silverleaf.test`,
password `DemoStore!2026`.

---

## Verified so far

Not claims — commands you can run:

| Check                         | Command                                            | Result                                            |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Schema is valid               | `pnpm exec prisma validate`                        | 88 models, 47 enums                               |
| Migrations apply from empty   | `pnpm db:deploy`                                   | 88 tables, 190 indexes, 150 FKs, 47 enum types    |
| Tenant isolation, live        | `pnpm db:verify-rls`                               | 33/33 pass on PostgreSQL 18                       |
| RLS covers every tenant table | included above                                     | 75 protected, 13 exempt by documented decision    |
| RLS policies match the schema | `pnpm db:rls -- --check`                           | in sync                                           |
| Money arithmetic              | `pnpm test`                                        | 47 tests incl. half-up rounding, exact allocation |
| Jewellery conversions         | `pnpm test`                                        | 14 tests incl. bhori/ana, purity, ring sizes      |
| Password and token handling   | `pnpm test`                                        | 24 tests incl. argon2id, timing-safe compare      |
| Seed is idempotent            | `pnpm db:seed` twice                               | no duplicates                                     |
| Seeded data reconciles        | SQL in the report                                  | order totals and stock ledger both balance        |
| Lint, format, typecheck       | `pnpm lint && pnpm format:check && pnpm typecheck` | clean                                             |
| Storefront renders real rows  | `pnpm dev`, then localhost:3000                    | 2 stores, 14 products, prices in lakh grouping    |
| Catalogue imagery             | `pnpm media:generate` then `pnpm db:seed`          | 28 media rows, 30 files, 164 KB, all 200          |
| Isolation holds in the UI     | open Aurum's product slug under /s/silver-leaf     | 404, not another store's page                     |

---

## Planning deliverables

| #   | Document                                                                            | Covers                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [docs/01-srs.md](docs/01-srs.md)                                                    | Software Requirements Specification — 90 numbered functional requirements across 12 areas, 14 non-functional requirements, launch acceptance criteria |
| 2   | [docs/02-architecture.md](docs/02-architecture.md)                                  | System architecture, context and sequence diagrams, layering, cross-cutting concerns, 12 recorded decisions with rejected alternatives                |
| 3   | [docs/03-multi-tenancy.md](docs/03-multi-tenancy.md)                                | Four-layer tenant isolation, RLS design, pooling, caching, custom domains, entitlement enforcement, how it is verified                                |
| 4   | [docs/04-data-model.md](docs/04-data-model.md)                                      | Six ER diagrams, modelling rationale, constraints Prisma cannot express, seed plan                                                                    |
| 5   | [prisma/schema.prisma](prisma/schema.prisma)                                        | Complete Prisma schema — 88 models, 47 enums, validated with `prisma validate`                                                                        |
| 6   | [docs/05-api-contracts.md](docs/05-api-contracts.md)                                | ~200 endpoints across 8 namespaces, conventions, error codes, webhook pipeline                                                                        |
| 7   | [docs/06-auth-strategy.md](docs/06-auth-strategy.md)                                | Two identity realms, token rotation with reuse detection, permission catalogue, roles, guard chain, hardening checklist                               |
| 8   | [docs/07-project-structure.md](docs/07-project-structure.md)                        | Monorepo layout, backend modules, frontend route groups, shared packages, enforced boundaries                                                         |
| 9   | [docs/08-roadmap.md](docs/08-roadmap.md)                                            | 15 phases with deliverables, dependencies and exit criteria; ~16 weeks to beta, ~22 to v1.0                                                           |
| 10  | [docs/09-testing-strategy.md](docs/09-testing-strategy.md)                          | Test pyramid, the generated cross-tenant isolation suite, per-path coverage targets, CI gates, definition of done                                     |
| 11  | [docs/10-deployment.md](docs/10-deployment.md)                                      | Topology, hosting recommendation with costs, environments, zero-downtime migrations, custom domains, scaling, DR, alerting                            |
| 12  | [docs/11-env-reference.md](docs/11-env-reference.md) + [.env.example](.env.example) | Every configuration variable, validated at boot                                                                                                       |

Suggested reading order if you only read three: the multi-tenancy document,
the data model, then the roadmap.

## The shape of it, in one minute

```
jewelleryhub.com            marketing + signup
app.jewelleryhub.com        store owner / staff dashboard
admin.jewelleryhub.com      platform (Super Admin) console
<store>.jewelleryhub.com    each tenant's storefront
www.brand.com               custom domains, verified + auto-TLS
```

- **Next.js** serves all four surfaces; **NestJS** owns every business rule and
  is the only writer to **PostgreSQL**; a **worker** runs queues and cron.
- **Tenancy**: one database, shared schema, `storeId` on every tenant row, and
  four independent layers of enforcement — host/token resolution, membership
  checks, a Prisma extension that makes an unscoped query unwriteable, and
  PostgreSQL row-level security that fails _closed_ if all of that is bypassed.
- **Jewellery-specific**: metal type and purity, gross/net weight to 0.001 g,
  gemstone rows with certification, hallmarking, making charge (flat/per-gram/
  percent), wastage, and optional daily-metal-rate pricing — so a gold retailer
  does not re-type every price when the rate moves.
- **Money**: `DECIMAL(14,2)` throughout, floats banned in pricing by lint rule.
- **Payments**: provider adapters; an order becomes paid only after a verified
  server-side webhook plus an independent verification call with an amount
  check. A browser redirect never changes payment status.
- **Subscriptions**: plan entitlements are rows, so new limits are configurable
  from the admin console without a migration; limits are enforced in a guard at
  the point of mutation, inside the same transaction as the insert.

## Who can create an account

Decided 8 November 2026, and built this way:

- **No public sign-up.** There is no registration endpoint and no signup page.
  The absence is the design, not an omission.
- **A Super Admin creates each shop** from the admin console, which also
  creates the owner's account and a one-time password in the same
  transaction.
- **Shop owners and staff sign in** at `/login`.
- **Customers only browse.** The storefront needs no account.

This removes a whole class of exposure — credential stuffing against a public
registration form, fake-shop spam, and email-verification abuse — and it is
why `POST /v1/auth/register` does not exist.

## Decisions I still need from you

Five decisions change the work materially. My recommendation is first in each
case; "as proposed" is a complete answer.

1. **Plan limits and pricing.** The schema supports anything; the seed needs
   real numbers. Proposed: Starter ৳1,500/mo — 100 products, 1 staff, no custom
   domain · Growth ৳3,500/mo — 1,000 products, 3 staff, coupons, analytics ·
   Business ৳7,500/mo — 10,000 products, 10 staff, custom domain, advanced
   reports · Enterprise — quote. 14-day trial, 2 months free on yearly.
2. **Payment priority.** Proposed build order: COD → SSLCommerz (one
   integration covers cards, bKash and Nagad) → native bKash → native Nagad.
   Native integrations are better UX and cheaper per transaction, but each is a
   separate merchant onboarding you must complete.
3. **Whose merchant account receives store revenue?** Proposed: the store's own
   (each tenant enters their own credentials; we never touch their money, which
   avoids money-transmission exposure). The alternative — we collect and remit —
   is a different legal and regulatory product.
4. **Hosting.** Proposed: Vercel + Railway/Render + Neon + Upstash +
   Cloudinary, roughly $150–300/month at launch. Custom-domain TLS is the main
   reason; self-hosting it is weeks of work.
5. **Scope trims for v1.0, if you want to launch sooner.** Candidates, in the
   order I would cut them: purchase orders and suppliers (−2 weeks), returns
   workflow (−1 week), courier API integrations in favour of manual tracking
   numbers (−1.5 weeks), two themes instead of three (−1 week). I would not cut
   the isolation suite, payment verification, or the inventory ledger.

Also worth confirming: English only at launch or English + Bangla; and whether
the brand name and domain are settled, since store slugs and emails bake it in.

## Environment on this machine

|            |                                                                                  |
| ---------- | -------------------------------------------------------------------------------- |
| Node       | v26.10.0 — fine (Prisma warns it is newer than its tested majors; nothing broke) |
| pnpm       | 12.18.0 — installed during setup                                                 |
| PostgreSQL | local WASM server via `pnpm db:up`; no native install                            |
| Docker     | **not installed** — optional, for full-fidelity local Postgres/Redis/Mailpit     |
| Git        | 2.55.0 — I ran `git init` here; `rm -rf .git` if you did not want that           |

## Project layout

```
packages/
  shared/      money (Decimal), error codes, permission + entitlement keys,
               Zod primitives, jewellery reference data        [built, tested]
  db/          generated Prisma client, pg pool, and the three
               access modes (tenant / identity / platform)     [built]
  security/    argon2id passwords, opaque tokens, API keys     [built, tested]
  config/      eslint (incl. the architecture boundary rules),
               tsconfig presets                                 [built]
prisma/
  schema.prisma  88 models, 47 enums                            [applied]
  migrations/    init + constraints/search/RLS                  [applied]
  rls/           generator, generated policies, live verifier   [passing]
  seed.ts        reference data + two demo stores               [idempotent]
docs/            the planning set, updated as the code changed it
apps/
  api/         NestJS: config, database boundary, store resolver,
               public storefront + directory, auth and sessions,
               platform admin, shop catalogue management        [running]
  web/         Next.js: store directory, storefront home, catalogue
               with filters and sorting, product detail, login,
               shop dashboard with the product editor,
               super-admin console                              [running]
  worker/      queues and cron                                  [Phase 6]
e2e/             Playwright suites + k6 load scripts            [Phase 8+]
```

## How we will work

Per `docs/08-roadmap.md`, module by module. Before each phase I state its
purpose, dependencies, the exact files to create or modify, and the test plan;
after implementing, I give you the commands to run it, what you should see, and
how it fits what already exists. No phase ships with mock data standing in for
real functionality, and no phase closes with a known failing test.

**Next step:** the rest of Phase 4 — variants and sizes (one ring in sizes 16,
18 and 20, each with its own SKU and price), stock per location, and editing
categories and brands rather than only choosing from the seeded ones.

Three things still need your input or your credentials:

1. **Plan prices and limits** are seeded from the proposal below. Change them
   in `prisma/seed.ts` (or later from the admin console — they are data).
2. **Image uploads** need a Cloudinary or S3 account. Until one is configured
   the product editor takes image addresses, which is real functionality; an
   upload button that stored nothing would not be. See `docs/08-roadmap.md`.
3. **Password reset and staff invites** need an email service. Until one is
   configured, reset a password with
   `NEW_PASSWORD='…' pnpm user:set-password someone@example.com`.
