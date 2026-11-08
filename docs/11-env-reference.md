# Environment Variable Reference — JewelleryHub

**Version** 0.1 (planning) · **Date** 2026-11-07

Every variable below is declared in a Zod config schema and validated at
process start. A missing or malformed required value **exits the process** —
it never degrades silently into a half-working service.

A copy ready to fill in lives at [.env.example](../.env.example). In Phase 0
this is split into `apps/api/.env.example`, `apps/web/.env.example` and
`apps/worker/.env.example`; it is one file now because there is one file to
read.

Legend: **R** required · **O** optional · **D** has a safe default

---

## Core

| Variable          |     | Notes                                                                       |
| ----------------- | --- | --------------------------------------------------------------------------- |
| `NODE_ENV`        | D   | `development` \| `test` \| `production`                                     |
| `APP_ENV`         | D   | `local` \| `preview` \| `staging` \| `production` — used in logs and alerts |
| `PORT`            | D   | API port, default 4000                                                      |
| `API_BASE_URL`    | R   | e.g. `http://localhost:4000/v1`                                             |
| `WEB_BASE_URL`    | R   | e.g. `http://localhost:3000`                                                |
| `ROOT_DOMAIN`     | R   | `jewelleryhub.com` — storefront subdomains derive from this                 |
| `APP_SUBDOMAIN`   | D   | `app` → dashboard host                                                      |
| `ADMIN_SUBDOMAIN` | D   | `admin` → platform console host                                             |
| `CORS_ORIGINS`    | R   | comma-separated allowlist; storefront hosts are resolved dynamically        |
| `LOG_LEVEL`       | D   | `info`; `debug` locally                                                     |

## Database

| Variable              |     | Notes                                                                                                                          |
| --------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | R   | app connection, as the **non-owner** `app_runtime` role; add `?pgbouncer=true&connection_limit=10` behind a transaction pooler |
| `DIRECT_DATABASE_URL` | R   | unpooled, owner role — migrations and the seed only                                                                            |
| `DATABASE_SSL`        | D   | `true` in every deployed environment                                                                                           |
| `PRISMA_LOG_QUERIES`  | O   | `true` locally to log SQL                                                                                                      |

Two URLs is not redundancy: migrations must create and alter objects (and so
bypass RLS), while the running application must not. In the implemented design
the application can share one login, because every unit of work enters
`app_runtime`, `app_identity` or `app_platform` with `SET LOCAL ROLE` — see
`docs/03-multi-tenancy.md` §3. Giving the application a non-owner login as well
is still recommended in production: defence in depth, not a substitute for it.

`DIRECT_DATABASE_URL` is also what `prisma7.config.ts` hands to the CLI.
Prisma 7 removed the `url` field from the schema's `datasource` block, so the
connection string lives in that config file for migrations and comes from the
`pg` driver adapter at runtime.

**Local database.** Two options, no Postgres install required for the first:

|            | `pnpm db:up` (default)                                                                                                          | `docker compose up -d postgres` |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| What it is | PostgreSQL 17 compiled to WASM (PGlite), bundled with Prisma                                                                    | real PostgreSQL 17              |
| Setup      | none                                                                                                                            | Docker                          |
| Ports      | assigned per server; re-read with `pnpm db:status`                                                                              | fixed 5432                      |
| Caveat     | authenticates every connection as superuser, and dies on an RLS-filtered zero-row UPDATE — 3 of 32 isolation checks are skipped | full fidelity                   |

Use the WASM server for day-to-day work and real PostgreSQL before trusting an
isolation result. CI always uses real PostgreSQL.

## Redis

| Variable               |     | Notes                                              |
| ---------------------- | --- | -------------------------------------------------- |
| `REDIS_URL`            | R   | cache, queues and rate limits                      |
| `REDIS_PREFIX`         | D   | `jh:` — lets environments share an instance safely |
| `CACHE_TTL_CATALOG`    | D   | `300` seconds                                      |
| `CACHE_TTL_STORE_HOST` | D   | `60` seconds                                       |

## Authentication

| Variable                |     | Notes                                                                |
| ----------------------- | --- | -------------------------------------------------------------------- |
| `JWT_PRIVATE_KEY`       | R   | Ed25519 PEM, base64-encoded                                          |
| `JWT_PUBLIC_KEY`        | R   | Ed25519 PEM, base64-encoded                                          |
| `JWT_KEY_ID`            | R   | `kid` published in the JWKS                                          |
| `ACCESS_TOKEN_TTL`      | D   | `15m`                                                                |
| `REFRESH_TOKEN_TTL`     | D   | `30d`                                                                |
| `COOKIE_DOMAIN`         | R   | `.jewelleryhub.com` for dashboards; storefront cookies are host-only |
| `COOKIE_SECURE`         | D   | `true` everywhere but local                                          |
| `CSRF_SECRET`           | R   | 32+ random bytes                                                     |
| `ARGON2_MEMORY_COST`    | D   | `19456` (KiB)                                                        |
| `ARGON2_TIME_COST`      | D   | `2`                                                                  |
| `PASSWORD_MIN_LENGTH`   | D   | `10`                                                                 |
| `LOGIN_MAX_ATTEMPTS`    | D   | `10`                                                                 |
| `LOGIN_LOCKOUT_MINUTES` | D   | `15`                                                                 |

Generate a keypair:
`openssl genpkey -algorithm ed25519 -out jwt.pem && openssl pkey -in jwt.pem -pubout -out jwt.pub`

## Encryption

| Variable                |     | Notes                                                      |
| ----------------------- | --- | ---------------------------------------------------------- |
| `ENCRYPTION_MASTER_KEY` | R   | 32 bytes base64 — wraps per-record data keys               |
| `KMS_PROVIDER`          | D   | `local` \| `aws` \| `gcp`; `local` is for development only |
| `KMS_KEY_ID`            | O   | required when `KMS_PROVIDER` is not `local`                |

## Storage

| Variable                                                                |     | Notes                                        |
| ----------------------------------------------------------------------- | --- | -------------------------------------------- |
| `STORAGE_PROVIDER`                                                      | R   | `cloudinary` \| `s3`                         |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET`                    | O   | required for `cloudinary`                    |
| `CLOUDINARY_UPLOAD_FOLDER`                                              | D   | `jewelleryhub`                               |
| `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | O   | required for `s3`                            |
| `S3_PUBLIC_BASE_URL`                                                    | O   | CDN origin in front of the bucket            |
| `MAX_UPLOAD_SIZE_MB`                                                    | D   | `10` images, `100` video                     |
| `ALLOWED_IMAGE_TYPES`                                                   | D   | `image/jpeg,image/png,image/webp,image/avif` |

## Email and SMS

| Variable                                                         |     | Notes                                          |
| ---------------------------------------------------------------- | --- | ---------------------------------------------- |
| `MAIL_PROVIDER`                                                  | R   | `smtp` \| `resend` \| `ses`                    |
| `MAIL_FROM_NAME` / `MAIL_FROM_ADDRESS`                           | R   | platform sender; stores get a branded reply-to |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD`        | O   | `smtp`; Mailpit locally on 1025                |
| `RESEND_API_KEY`                                                 | O   | `resend`                                       |
| `AWS_SES_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | O   | `ses`                                          |
| `SMS_PROVIDER`                                                   | O   | `none` \| `twilio` \| `bulksmsbd`              |
| `SMS_SENDER_ID`, `TWILIO_*`, `BULKSMSBD_API_KEY`                 | O   | per provider                                   |

## Payments — platform (subscriptions)

These are **our** merchant credentials, for tenants paying us.

| Variable                                                                          |     | Notes                                    |
| --------------------------------------------------------------------------------- | --- | ---------------------------------------- |
| `PLATFORM_PAYMENT_PROVIDERS`                                                      | R   | e.g. `sslcommerz,bkash,manual`           |
| `PLATFORM_SSLCOMMERZ_STORE_ID` / `_STORE_PASSWORD` / `_SANDBOX`                   | O   |                                          |
| `PLATFORM_BKASH_APP_KEY` / `_APP_SECRET` / `_USERNAME` / `_PASSWORD` / `_SANDBOX` | O   |                                          |
| `PLATFORM_NAGAD_MERCHANT_ID` / `_PRIVATE_KEY` / `_PUBLIC_KEY` / `_SANDBOX`        | O   |                                          |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                                     | O   | international expansion                  |
| `BILLING_CURRENCY`                                                                | D   | `BDT`                                    |
| `BILLING_GRACE_DAYS`                                                              | D   | `7` before suspension                    |
| `BILLING_DUNNING_ATTEMPTS`                                                        | D   | `4`                                      |
| `DEFAULT_TRIAL_DAYS`                                                              | D   | `14`; the plan's own value wins when set |

**Store** gateway credentials are _not_ environment variables. Each store
enters its own in the dashboard and they are stored encrypted in
`StorePaymentMethod.config` — a tenant's money must settle into the tenant's
account.

## Webhooks

| Variable                    |     | Notes                                                   |
| --------------------------- | --- | ------------------------------------------------------- |
| `WEBHOOK_BASE_URL`          | R   | public URL providers call; must be HTTPS off-local      |
| `WEBHOOK_TOLERANCE_SECONDS` | D   | `300` — reject stale signed payloads                    |
| `WEBHOOK_IP_ALLOWLIST`      | O   | comma-separated CIDRs where the provider publishes them |

Use `ngrok http 4000` locally and set `WEBHOOK_BASE_URL` to the tunnel.

## Couriers

| Variable                                                                       |     | Notes    |
| ------------------------------------------------------------------------------ | --- | -------- |
| `COURIER_PROVIDERS`                                                            | D   | `manual` |
| `PATHAO_CLIENT_ID` / `_CLIENT_SECRET` / `_USERNAME` / `_PASSWORD` / `_SANDBOX` | O   |          |
| `STEADFAST_API_KEY` / `_SECRET_KEY`                                            | O   |          |
| `REDX_ACCESS_TOKEN`                                                            | O   |          |

## AI (all optional — features stay inert and hidden without these)

| Variable                  |     | Notes                                                       |
| ------------------------- | --- | ----------------------------------------------------------- |
| `AI_ENABLED`              | D   | `false`                                                     |
| `AI_DEFAULT_PROVIDER`     | O   | `anthropic` \| `openai`                                     |
| `ANTHROPIC_API_KEY`       | O   |                                                             |
| `ANTHROPIC_MODEL`         | D   | `claude-sonnet-5-5`                                         |
| `OPENAI_API_KEY`          | O   |                                                             |
| `AI_MONTHLY_TOKEN_BUDGET` | O   | platform-wide ceiling; per-store quotas live in `AiSetting` |

No AI code path produces output without a configured provider. There is no
fallback to canned text — a disabled feature is hidden, never faked.

## Observability

| Variable                      |     | Notes                                                |
| ----------------------------- | --- | ---------------------------------------------------- |
| `SENTRY_DSN`                  | O   | errors; `SENTRY_TRACES_SAMPLE_RATE` default `0.1`    |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | O   | traces                                               |
| `OTEL_SERVICE_NAME`           | D   | `jewelleryhub-api`                                   |
| `METRICS_ENABLED`             | D   | `true`; scraped at `/metrics`, not publicly routable |

## Rate limits

| Variable                       |     | Default |
| ------------------------------ | --- | ------- |
| `RATE_LIMIT_AUTH_PER_MIN`      | D   | `5`     |
| `RATE_LIMIT_CHECKOUT_PER_MIN`  | D   | `10`    |
| `RATE_LIMIT_PUBLIC_PER_MIN`    | D   | `120`   |
| `RATE_LIMIT_DASHBOARD_PER_MIN` | D   | `600`   |
| `RATE_LIMIT_WEBHOOK_PER_MIN`   | D   | `300`   |

## Queues and jobs

| Variable                      |     | Default                                    |
| ----------------------------- | --- | ------------------------------------------ |
| `QUEUE_CONCURRENCY`           | D   | `5`                                        |
| `JOB_RESERVATION_SWEEP_CRON`  | D   | `*/1 * * * *`                              |
| `JOB_RENEWAL_CRON`            | D   | `0 * * * *`                                |
| `JOB_ROLLUP_INCREMENTAL_CRON` | D   | `15 * * * *`                               |
| `JOB_ROLLUP_NIGHTLY_CRON`     | D   | `30 2 * * *`                               |
| `JOB_DOMAIN_VERIFY_CRON`      | D   | `*/15 * * * *`                             |
| `RESERVATION_TTL_MINUTES`     | D   | `30`; a store may override in its settings |

## Frontend (`apps/web`)

Only `NEXT_PUBLIC_*` values reach the browser. Nothing secret may carry that
prefix; a CI check fails the build if a known secret name does.

| Variable                    |     | Notes                                             |
| --------------------------- | --- | ------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`  | R   |                                                   |
| `NEXT_PUBLIC_ROOT_DOMAIN`   | R   | subdomain routing in middleware                   |
| `NEXT_PUBLIC_APP_NAME`      | D   | `JewelleryHub`                                    |
| `NEXT_PUBLIC_SENTRY_DSN`    | O   |                                                   |
| `NEXT_PUBLIC_IMAGE_DOMAINS` | R   | allowlist for `next/image`                        |
| `REVALIDATE_SECRET`         | R   | shared with the API to authorise ISR revalidation |

Per-store analytics ids (GA, Meta Pixel) come from `StoreSettings.analytics` at
runtime, not from the environment — they differ per tenant.

## Seeding and development

| Variable                                               |            | Notes                                                  |
| ------------------------------------------------------ | ---------- | ------------------------------------------------------ |
| `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` | R for seed | never hardcoded; the seed fails without them           |
| `SEED_DEMO_DATA`                                       | D          | `false`; **refuses to run when `NODE_ENV=production`** |
| `SEED_DEMO_STORES`                                     | D          | `2`                                                    |
| `SEED_DEMO_PRODUCTS_PER_STORE`                         | D          | `40`                                                   |

---

## Minimum to run locally

```bash
DATABASE_URL, DIRECT_DATABASE_URL, REDIS_URL
JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, JWT_KEY_ID, CSRF_SECRET, ENCRYPTION_MASTER_KEY
API_BASE_URL, WEB_BASE_URL, ROOT_DOMAIN, CORS_ORIGINS
MAIL_PROVIDER=smtp + SMTP_HOST/PORT (Mailpit)
STORAGE_PROVIDER + its credentials
SEED_SUPER_ADMIN_EMAIL, SEED_SUPER_ADMIN_PASSWORD
NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_ROOT_DOMAIN, NEXT_PUBLIC_IMAGE_DOMAINS, REVALIDATE_SECRET
```

Payment, courier and AI variables are all optional locally: COD plus the mock
provider covers the whole checkout path, including webhook verification.
