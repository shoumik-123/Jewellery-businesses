# Deploying to Vercel

Two Vercel projects from this one repository, and a Postgres that is not on
anybody's laptop.

| Piece              | Where it runs                | Vercel root directory |
| ------------------ | ---------------------------- | --------------------- |
| Next.js storefront | Vercel                       | `apps/web`            |
| NestJS API         | Vercel (serverless function) | `apps/api`            |
| PostgreSQL         | Neon                         | —                     |

Two projects rather than one because they are two applications with two build
outputs. It also means the API can be redeployed without rebuilding the shop,
and the shop keeps serving if an API deploy fails.

---

## 1. The database

Vercel cannot reach a database on your own machine, so the local PostgreSQL is
for development only. Create a Neon database — from Vercel, **Storage → Create
Database → Neon**, which links it to the account you are already paying for
(nothing, on Hobby).

Neon gives two connection strings, and **both are needed, for different
things**:

| String | Looks like                      | Used for                                 |
| ------ | ------------------------------- | ---------------------------------------- |
| Pooled | `...-pooler.<region>.neon.tech` | `DATABASE_URL` — what the API runs on    |
| Direct | `...<region>.neon.tech`         | `DIRECT_DATABASE_URL` — migrations, seed |

Why the split: the pooled endpoint is PgBouncer in transaction mode, which is
exactly what this codebase's tenancy model is built for — `SET LOCAL ROLE` and
`SET LOCAL app.current_store_id` are transaction-scoped, so a connection handed
back to the pooler cannot carry one shop's context into another shop's query.
Migrations are the opposite: they need session-level statements (`CREATE ROLE`,
`ALTER DEFAULT PRIVILEGES`) that a transaction pooler will not pass through.

Both strings need `?sslmode=require`.

### Apply the schema, the isolation policies and the reference data

Run these from your machine, once, against the new database:

```bash
# Point the local tooling at Neon for the length of these commands only.
DATABASE_URL='<pooled>' DIRECT_DATABASE_URL='<direct>' pnpm db:deploy

DATABASE_URL='<pooled>' DIRECT_DATABASE_URL='<direct>' \
  SEED_SUPER_ADMIN_EMAIL='you@yourdomain.com' \
  SEED_SUPER_ADMIN_PASSWORD='a-long-passphrase-you-choose' \
  pnpm db:seed
```

The seed creates the super admin only when both of those are set, and refuses
a password under 12 characters. It never overwrites an existing account's
password, so re-running it is safe and cannot reset a live login.

`db:deploy` creates the tables **and** the three database roles and every
row-level-security policy, because those live in migrations rather than in a
setup script — a policy that is not in a migration is a policy that is missing
from the next environment.

Then prove the isolation actually holds on the real database, which is the only
place that claim means anything:

```bash
DATABASE_URL='<pooled>' DIRECT_DATABASE_URL='<direct>' pnpm db:verify-rls
```

Expect `OK — 33/33 checks passed`. **If it does not pass, stop and fix it
before the site is public.** The whole multi-tenancy guarantee is that one
shop cannot read another's rows, and this is the test of it.

The two demo shops are **not** seeded unless you add `SEED_DEMO_DATA=true`, and
the seed refuses that combination outright when `NODE_ENV=production`. That
guard is deliberate: the demo accounts share a password that is a constant in
this repository, so they must never exist on a database that will hold a real
customer's catalogue. For a first look at a deployment, seed them on a throwaway
database.

---

## 2. The API project

**New Project → import `shoumik-123/Jewellery-businesses`.**

| Setting         | Value                                          |
| --------------- | ---------------------------------------------- |
| Root Directory  | `apps/api`                                     |
| Framework       | Other                                          |
| Build / Install | leave blank — `apps/api/vercel.json` sets them |

Turn **on** "Include source files outside of the Root Directory", or the build
cannot see `packages/`, `prisma/schema.prisma` or the lockfile, and will fail
at install.

### Environment variables

| Name                  | Value                                                  |
| --------------------- | ------------------------------------------------------ |
| `DATABASE_URL`        | the **pooled** Neon string                             |
| `DIRECT_DATABASE_URL` | the **direct** Neon string                             |
| `DATABASE_SSL`        | `true`                                                 |
| `DATABASE_POOL_MAX`   | `3`                                                    |
| `NODE_ENV`            | `production`                                           |
| `APP_ENV`             | `production`                                           |
| `CORS_ORIGINS`        | the web project's URL, e.g. `https://<web>.vercel.app` |
| `ROOT_DOMAIN`         | the web project's host, e.g. `<web>.vercel.app`        |
| `SESSION_TTL_DAYS`    | `7`                                                    |

`DATABASE_POOL_MAX` is small on purpose. Every warm function container holds
its own pool, so the real connection count is this number times the number of
containers; a generous-looking `10` is how a serverless deployment exhausts a
free database's connection limit under mild traffic.

Do **not** set `DB_ROLE_SWITCHING`. It is a local-development escape hatch for
the WebAssembly database, it disables the database half of tenant isolation,
and the API refuses to start with it off when `NODE_ENV=production` — which is
the behaviour you want.

Deploy, then check `https://<api>.vercel.app/v1/health/ready`. It should answer
`{"status":"ready","database":"up"}`. A `200` from `/v1/health` alone only says
the function booted; `ready` is the one that proves it reached Neon.

---

## 3. The web project

**New Project → import the same repository again.**

| Setting        | Value              |
| -------------- | ------------------ |
| Root Directory | `apps/web`         |
| Framework      | Next.js (detected) |

"Include source files outside of the Root Directory" **on**, same reason.

| Name           | Value                         |
| -------------- | ----------------------------- |
| `API_BASE_URL` | `https://<api>.vercel.app/v1` |
| `ROOT_DOMAIN`  | `<web>.vercel.app`            |

`API_BASE_URL` has no `NEXT_PUBLIC_` prefix, and must not get one. Every call
to the API is made by the Next.js server; the browser never learns the API's
address and cannot be pointed at a different one from devtools.

---

## 4. After the first deploy

Sign in at `https://<web>.vercel.app/login` with the super-admin address and
password you passed to the seed, open `/admin`, and create a shop. The shop's
owner gets a one-time password shown once on that screen.

To change a password later — there is no self-service reset yet, because that
needs an email service:

```bash
DATABASE_URL='<pooled>' DIRECT_DATABASE_URL='<direct>' \
  NEW_PASSWORD='a-long-passphrase' pnpm user:set-password you@yourdomain.com
```

---

## What does not work on `.vercel.app`, and why

**Store subdomains.** The design gives each shop `<slug>.jewelleryhub.com`, and
`apps/web/src/proxy.ts` turns that host into the internal `/s/<slug>` route.
That needs a wildcard DNS record on a domain you own, which `*.vercel.app` is
not. Until a real domain is attached, reach a shop at
`https://<web>.vercel.app/s/<slug>` — the same pages, the other address, and
both have always been supported.

To switch it on later: add your domain to the web project, add `*.yourdomain`
as a wildcard, and set `ROOT_DOMAIN=yourdomain.com` on both projects. No code
changes.

**`lastUsedAt` on sessions.** The auth guard records that a session was used
without waiting for the write (`void this.authContext.touch(...)`), which is
correct for a long-running server and unreliable in a function: the platform
may freeze the container once the response is sent, so the write is sometimes
lost. It is best-effort bookkeeping and nothing depends on it — sessions still
expire, rotate and revoke correctly. It is listed here so the column is not
mistaken for an activity log.

**Cold starts.** The first request to an idle container builds the Nest
application: roughly 100 ms locally, more on Vercel with a network hop to Neon.
Subsequent requests reuse it — the application is cached per container, and
deliberately not rebuilt per request, because that would also mean a new
database pool per request.

---

## If the build fails

The likeliest causes, in order:

1. **"Include source files outside of the Root Directory" is off.** Install
   fails immediately; the log mentions the lockfile or a missing `@jh/*`
   package.
2. **Prisma client not generated.** `packages/db`'s build runs
   `prisma generate` itself, so this should not happen — but if the log says a
   module under `src/generated/prisma` is missing, that is the cause.
3. **Function bundling missed a file.** NestJS resolves some platform packages
   dynamically, which file tracing can miss. The symptom is a deploy that
   builds and then 500s on every request with `Cannot find module`. The fix is
   to name the missing package in `functions` → `includeFiles` in
   `apps/api/vercel.json`.

Send the build log and the failing URL and these are quick to read.
