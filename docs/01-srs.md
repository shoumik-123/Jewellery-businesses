# Software Requirements Specification — JewelleryHub

**Version** 0.1 (planning) · **Date** 2026-11-07 · **Status** Awaiting approval

---

## 1. Purpose and scope

JewelleryHub is a commercial multi-tenant SaaS platform that lets jewellery
businesses create and run their own online store without technical knowledge.
Each business (a _tenant_) gets an isolated catalogue, customer base, order
pipeline, inventory ledger and customisable storefront, served on its own
subdomain and later its own custom domain. The platform earns revenue from
recurring subscription plans.

In scope for v1.0: tenant onboarding, subscription billing, jewellery-specific
catalogue and inventory, storefront builder, checkout with Bangladeshi payment
rails, order lifecycle, staff permissions, analytics, and platform
administration.

Out of scope for v1.0 (architecture prepared, not built): multi-storefront
tenants, POS/offline retail, marketplace-style cross-store search, multi-
currency pricing, AI features beyond the configuration layer, and the
virtual try-on SDK beyond its data model.

## 2. Stakeholders and actors

| Actor               | Description                                                  | Interface                  |
| ------------------- | ------------------------------------------------------------ | -------------------------- |
| **Super Admin**     | Platform operator. Governs tenants, plans, revenue, support. | `admin.jewelleryhub.com`   |
| **Support Agent**   | Platform staff with read-mostly access + ticketing.          | `admin.jewelleryhub.com`   |
| **Store Owner**     | Jewellery business owner. Owns the tenant and its billing.   | `app.jewelleryhub.com`     |
| **Store Staff**     | Invited user with a subset of store permissions.             | `app.jewelleryhub.com`     |
| **Customer**        | Shopper on one store. Identity is scoped to that store.      | `<store>.jewelleryhub.com` |
| **Guest**           | Unauthenticated shopper; may complete checkout.              | `<store>.jewelleryhub.com` |
| **Payment gateway** | SSLCommerz, bKash, Nagad, Stripe. Server-to-server.          | Webhook / IPN              |
| **Courier**         | Pathao, Steadfast, RedX. Server-to-server.                   | REST + webhook             |

## 3. Definitions

- **Tenant** — the billing account and business entity. Owns the subscription.
- **Store** — one storefront with its own catalogue, orders and theme. One per
  tenant in v1; the model allows more later.
- **Entitlement** — a named plan capability, either a numeric `LIMIT`
  (`max_products = 500`) or a boolean `FEATURE` (`custom_domain = true`).
- **Variant** — a sellable SKU of a product (22K / size 16). Stock and price
  live on the variant, not the product.
- **Reservation** — stock held for an unpaid order, released on expiry.
- **Movement** — an immutable row recording any stock change.

## 4. Functional requirements

Requirement IDs are referenced by the test plan (`docs/09-testing-strategy.md`)
and the roadmap (`docs/08-roadmap.md`). Priority: **M** must-have for v1.0,
**S** should-have, **C** could-have.

### 4.1 Platform administration (FR-PA)

| ID       | Requirement                                                                                                                                                       | Pri |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-PA-01 | Super Admin sees platform KPIs: total/active/trial/suspended stores, MRR, ARR, new signups, churn, GMV, subscription mix.                                         | M   |
| FR-PA-02 | List, search, filter and open any store; view its owner, plan, usage against limits, and lifetime revenue.                                                        | M   |
| FR-PA-03 | Suspend or reactivate a store, with a reason recorded in the audit log; a suspended store's storefront returns a branded 503 and its dashboard becomes read-only. | M   |
| FR-PA-04 | Create, edit, archive subscription plans, including per-plan entitlement values. Price changes never alter existing subscriptions (price is locked at purchase).  | M   |
| FR-PA-05 | View all subscriptions and their state; manually extend a trial, change a plan, or apply a per-subscription entitlement override.                                 | M   |
| FR-PA-06 | View all platform payments and invoices; retry, void or mark an invoice paid with a recorded reason.                                                              | M   |
| FR-PA-07 | Manage platform users and platform roles (Super Admin, Support Agent).                                                                                            | M   |
| FR-PA-08 | Manage platform settings: signup open/closed, default trial length, from-addresses, feature flags.                                                                | M   |
| FR-PA-09 | Support ticket queue with assignment, internal notes and status.                                                                                                  | S   |
| FR-PA-10 | Impersonate a store owner for support, time-boxed, with a persistent banner and an audit entry.                                                                   | S   |
| FR-PA-11 | Manage the theme catalogue (publish/unpublish a theme, set defaults).                                                                                             | S   |

### 4.2 Tenant onboarding and subscription (FR-SB)

| ID       | Requirement                                                                                                                                                                                             | Pri |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-SB-01 | Public signup collects owner name, email, password, business name and desired store slug; slug availability is checked live and reserved words are rejected.                                            | M   |
| FR-SB-02 | Email verification is required before the storefront can be published.                                                                                                                                  | M   |
| FR-SB-03 | Signup provisions, in one transaction: user, tenant, store, default settings, default inventory location, default theme, home page with starter sections, default categories, and a trial subscription. | M   |
| FR-SB-04 | Trial length comes from the plan; trial end triggers a reminder sequence (T-7, T-3, T-1, T-0).                                                                                                          | M   |
| FR-SB-05 | Owner may subscribe monthly or yearly; yearly shows the saving versus monthly.                                                                                                                          | M   |
| FR-SB-06 | Upgrade applies immediately with a prorated charge; downgrade applies at period end and is blocked while current usage exceeds the target plan's limits, with the offending resources named.            | M   |
| FR-SB-07 | Successful renewal extends the period and issues a paid invoice. Failed renewal sets `PAST_DUE`, starts a 7-day grace window with dunning emails, then suspends the store.                              | M   |
| FR-SB-08 | Cancel at period end; the store stays live until the period ends, then closes. Data is retained for 60 days.                                                                                            | M   |
| FR-SB-09 | Owner can download any invoice as PDF and see full payment history.                                                                                                                                     | M   |
| FR-SB-10 | Every entitlement is enforced server-side at the point of mutation; the UI additionally shows usage meters and an upgrade prompt.                                                                       | M   |

### 4.3 Authentication and access control (FR-AU)

| ID       | Requirement                                                                                                                                     | Pri |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-AU-01 | Password login for platform users with Argon2id hashing, rate limiting and lockout after repeated failures.                                     | M   |
| FR-AU-02 | Short-lived access token plus rotating refresh token in `httpOnly`, `Secure`, `SameSite` cookies; refresh reuse revokes the whole token family. | M   |
| FR-AU-03 | Email verification and password reset via single-use, time-limited, hashed tokens.                                                              | M   |
| FR-AU-04 | A user may belong to several stores; the dashboard offers a store switcher and all requests are scoped to the selected store.                   | M   |
| FR-AU-05 | Store owner invites staff by email, assigns a role, and may ALLOW/DENY individual permissions on top of that role.                              | M   |
| FR-AU-06 | Every API endpoint declares its required permission; authorisation is enforced in a guard, never in the UI alone.                               | M   |
| FR-AU-07 | Customer accounts are per store: the same email can register at two stores independently, and sessions are bound to one store.                  | M   |
| FR-AU-08 | Session list with device/IP and "revoke this session" / "sign out everywhere".                                                                  | S   |
| FR-AU-09 | TOTP two-factor for platform users and store owners.                                                                                            | S   |

### 4.4 Catalogue (FR-CT)

| ID       | Requirement                                                                                                                                                                                                                                                    | Pri |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-CT-01 | Create a product with name, SKU, descriptions, media, primary and additional categories, brand, tags and SEO fields. SKU is unique within the store.                                                                                                           | M   |
| FR-CT-02 | Capture jewellery attributes: jewellery type, metal type, purity, material, gross/net weight, stone weight and type, hallmark number, certificate, country of origin, care instructions.                                                                       | M   |
| FR-CT-03 | Capture structured gemstone rows: stone type, shape, count, carat, colour, clarity, cut, setting, certification.                                                                                                                                               | M   |
| FR-CT-04 | Pricing: cost price, selling price, sale price with a schedule, making charge (flat / per-gram / percent), wastage percent, tax flag and rate. Cost price is never exposed on any public endpoint.                                                             | M   |
| FR-CT-05 | Optional metal-rate pricing: the store records a daily rate per metal and purity; a product in `METAL_RATE_BASED` mode computes price = net weight × rate + making charge + wastage + stone value, recomputed on read and snapshotted into the cart and order. | S   |
| FR-CT-06 | Variants from options (ring size, length, colour, purity) with per-variant SKU, price, weights and media. A product always has at least one variant.                                                                                                           | M   |
| FR-CT-07 | Store-defined custom attributes (text, number, boolean, select, multiselect, date), optionally filterable on the storefront.                                                                                                                                   | M   |
| FR-CT-08 | Media upload direct to Cloudinary/S3 via a signed request; server stores URL plus provider key, validates MIME and size, orders images, and marks a primary. Video supported.                                                                                  | M   |
| FR-CT-09 | Nested categories, brands, and manual or rule-based collections.                                                                                                                                                                                               | M   |
| FR-CT-10 | Bulk actions: activate, archive, delete, change category, adjust price by percent; CSV import and export with a dry-run validation report.                                                                                                                     | S   |
| FR-CT-11 | Related products: manual list, falling back to same-category same-price-band.                                                                                                                                                                                  | S   |

### 4.5 Inventory (FR-IN)

| ID       | Requirement                                                                                                                                                                                                         | Pri |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-IN-01 | Stock is held per (variant, location) as `onHand`, `reserved`, `incoming`. Available = onHand − reserved.                                                                                                           | M   |
| FR-IN-02 | Every change writes an immutable movement row with type, signed delta, resulting balance, actor, reason and a reference to the order or purchase order.                                                             | M   |
| FR-IN-03 | Manual adjustment requires a reason; the movement ledger is append-only and visible per variant.                                                                                                                    | M   |
| FR-IN-04 | Placing an order reserves stock inside the order transaction. Reservations expire after a configurable TTL for unpaid orders and are released by a scheduled job. Payment commits them; cancellation releases them. | M   |
| FR-IN-05 | Stock may not go negative unless the store enables backorders. Concurrent checkouts on the last unit must not oversell.                                                                                             | M   |
| FR-IN-06 | Low-stock and out-of-stock lists, with a notification when a variant crosses its reorder point.                                                                                                                     | M   |
| FR-IN-07 | Suppliers and purchase orders; receiving a PO (fully or partially) increments stock and sets average unit cost.                                                                                                     | S   |
| FR-IN-08 | Multiple inventory locations and transfers between them.                                                                                                                                                            | C   |

### 4.6 Storefront (FR-SF)

| ID       | Requirement                                                                                                                                                                                                                                    | Pri |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-SF-01 | Each store resolves from its subdomain or verified custom domain; an unknown host returns 404, a suspended store 503.                                                                                                                          | M   |
| FR-SF-02 | At least three themes, each premium and mobile-first; the owner picks one and overrides brand colours, fonts, logo and favicon.                                                                                                                | M   |
| FR-SF-03 | Homepage composed of reorderable sections from a fixed registry (hero, featured products, collection grid, category strip, banner, testimonials, rich text, newsletter, instagram strip). Each section has typed, validated settings.          | M   |
| FR-SF-04 | Draft/publish model: edits preview live for the editor only and go public on publish.                                                                                                                                                          | M   |
| FR-SF-05 | Banner management with placement, schedule and mobile artwork.                                                                                                                                                                                 | M   |
| FR-SF-06 | Shop page with keyword search, category/collection filters, and filters on price, metal type, purity, weight, stone and any filterable custom attribute; sorting by relevance, newest, price and best-selling; paginated.                      | M   |
| FR-SF-07 | Product page: media gallery with zoom, variant picker that updates price/stock/media, specification table, size guide, delivery estimate, reviews, related and recently viewed.                                                                | M   |
| FR-SF-08 | Wishlist for logged-in customers; cart for everyone, persisted by cookie and merged into the account on login.                                                                                                                                 | M   |
| FR-SF-09 | Checkout: contact, shipping address, shipping method, payment method, coupon, order review. Guest checkout allowed when enabled. Prices and stock are re-validated server-side at submit; any change is surfaced rather than silently applied. | M   |
| FR-SF-10 | Customer account: profile, address book, order history, order detail with timeline, order tracking by number + phone for guests, returns request, reviews.                                                                                     | M   |
| FR-SF-11 | SEO: per-page metadata, Open Graph, canonical URLs, JSON-LD for products and breadcrumbs, sitemap.xml and robots.txt per store.                                                                                                                | S   |
| FR-SF-12 | Core Web Vitals: LCP < 2.5 s on 4G for product and home pages.                                                                                                                                                                                 | S   |

### 4.7 Orders and fulfilment (FR-OR)

| ID       | Requirement                                                                                                                                                                                                                              | Pri |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-OR-01 | Order creation is atomic: validate cart, re-price, reserve stock, redeem coupon, allocate a per-store sequential number, snapshot addresses and line items, write history. Duplicate submits are absorbed by an idempotency key.         | M   |
| FR-OR-02 | Statuses: Pending → Confirmed → Processing → Shipped → Delivered, with Cancelled, Returned and Refunded as terminal branches. Illegal transitions are rejected by a state machine, and every transition is recorded with actor and note. | M   |
| FR-OR-03 | Order list with search by number, phone, email or customer; filters on status, payment status, fulfilment status, date range and value; saved views.                                                                                     | M   |
| FR-OR-04 | Order detail: items with jewellery attribute snapshots, totals breakdown, payment attempts, shipments, customer, timeline, internal notes.                                                                                               | M   |
| FR-OR-05 | Create shipments (full or partial), attach carrier and tracking, and push status updates to the customer.                                                                                                                                | M   |
| FR-OR-06 | Cancellation releases or restocks inventory and voids the coupon redemption.                                                                                                                                                             | M   |
| FR-OR-07 | Returns: customer request → staff approve/reject → received → completed, with optional restock.                                                                                                                                          | S   |
| FR-OR-08 | Refunds: full or per-line, through the gateway where supported or recorded as manual, never exceeding the amount paid minus amounts already refunded.                                                                                    | M   |
| FR-OR-09 | Printable A5/A4 invoice and packing slip with the store's branding.                                                                                                                                                                      | M   |
| FR-OR-10 | Export orders to CSV/XLSX for a date range.                                                                                                                                                                                              | S   |
| FR-OR-11 | Staff may create an order manually (phone/social orders).                                                                                                                                                                                | S   |

### 4.8 Payments (FR-PY)

| ID       | Requirement                                                                                                                                                                        | Pri |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-PY-01 | Payment providers sit behind one adapter interface; adding a provider requires no change to order logic.                                                                           | M   |
| FR-PY-02 | Each store configures its own gateway credentials; they are encrypted at rest and never returned by any API.                                                                       | M   |
| FR-PY-03 | An order is marked paid **only** after a server-side verification: a signed webhook/IPN, or a direct verification call to the provider. A browser redirect never sets paid status. | M   |
| FR-PY-04 | Every webhook is persisted before processing, verified by signature, and deduplicated by provider event id, so replays are harmless.                                               | M   |
| FR-PY-05 | Cash on Delivery with an optional fee and amount limits.                                                                                                                           | M   |
| FR-PY-06 | SSLCommerz, bKash and Nagad adapters, each with sandbox and live modes.                                                                                                            | M   |
| FR-PY-07 | Partial payments and partial refunds are represented accurately in `amountPaid` / `amountRefunded`.                                                                                | S   |
| FR-PY-08 | Stripe adapter for international expansion.                                                                                                                                        | C   |

### 4.9 Promotions (FR-PR)

| ID       | Requirement                                                                                                                                                                                                   | Pri |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-PR-01 | Coupons: percentage, fixed amount, free shipping, buy-X-get-Y; minimum subtotal, maximum discount, date window, total and per-customer usage limits, first-order-only, and scoping to products or categories. | M   |
| FR-PR-02 | Coupon validation is server-side at both cart and checkout; concurrent redemptions cannot exceed the usage limit.                                                                                             | M   |
| FR-PR-03 | Scheduled product-level sale prices.                                                                                                                                                                          | M   |
| FR-PR-04 | Shipping zones and rates: flat, weight-based, price-based, free above a threshold, with delivery estimates.                                                                                                   | M   |

### 4.10 Reviews, notifications, audit (FR-RN)

| ID       | Requirement                                                                                                                                                                                              | Pri |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-RN-01 | Customers review purchased products, 1–5 stars with title, body and photos; verified-purchase badge; moderation queue with optional auto-approve; owner reply. Product rating aggregates are maintained. | M   |
| FR-RN-02 | Transactional email: verification, password reset, staff invite, order confirmation, status changes, shipment, refund, trial and dunning notices. All templated and per-store branded.                   | M   |
| FR-RN-03 | In-app notifications for staff: new order, low stock, new review, subscription events.                                                                                                                   | M   |
| FR-RN-04 | SMS notifications through a pluggable provider.                                                                                                                                                          | C   |
| FR-RN-05 | Append-only audit log of every privileged mutation with actor, before/after and request id; visible to store owners for their store and to Super Admin platform-wide.                                    | M   |

### 4.11 Analytics (FR-AN)

| ID       | Requirement                                                                                                                                                               | Pri |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-AN-01 | Store dashboard: sales, orders, revenue, customers, AOV for a selected range with period-over-period deltas; revenue trend chart; best sellers; low stock; recent orders. | M   |
| FR-AN-02 | Reports: sales by day/month, by product, by category, by payment method; customer acquisition; inventory valuation at cost; gross margin using snapshotted cost price.    | S   |
| FR-AN-03 | Dashboards read from nightly (plus hourly incremental) rollup tables, not from live scans of the orders table.                                                            | M   |
| FR-AN-04 | Platform dashboard: store counts by state, MRR/ARR, plan distribution, signups, churn, platform revenue, GMV.                                                             | M   |
| FR-AN-05 | Every figure is derived from real data; no placeholder numbers in any build.                                                                                              | M   |

### 4.12 AI (FR-AI)

| ID       | Requirement                                                                                                                                                          | Pri |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-AI-01 | AI features are defined behind provider interfaces and are hidden and inert unless credentials are configured and the plan entitles them. No simulated output, ever. | M   |
| FR-AI-02 | AI product description generation from product attributes, with the draft shown for editing before saving, and token/cost logging per store.                         | C   |
| FR-AI-03 | Recommendations and shopping assistant behind the same interface and quota accounting.                                                                               | C   |
| FR-AI-04 | Virtual try-on data model and an embeddable JS SDK boundary, so try-on can later be dropped into other storefronts.                                                  | C   |

## 5. Non-functional requirements

| ID     | Area              | Requirement                                                                                                                                                                                                         |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Performance       | Storefront p95 TTFB < 400 ms for cached pages, < 900 ms uncached. Dashboard API p95 < 500 ms. Search p95 < 700 ms at 50k products per store.                                                                        |
| NFR-02 | Scale             | 1,000 active stores; 100k products and 500k orders per store; 500 concurrent checkouts platform-wide, without schema change.                                                                                        |
| NFR-03 | Isolation         | A request authenticated for store A must never read or write a row belonging to store B. Enforced in the data-access layer **and** by Postgres row-level security.                                                  |
| NFR-04 | Availability      | 99.9 % monthly for storefronts. Degraded mode: catalogue browsing survives a Redis outage.                                                                                                                          |
| NFR-05 | Security          | OWASP Top 10 addressed; Argon2id passwords; secrets only in the secret manager; TLS everywhere; HSTS; strict CSP on storefronts; rate limiting on auth, checkout and webhooks; sanitised rich text; signed uploads. |
| NFR-06 | Money correctness | All monetary values are `DECIMAL(14,2)`; no float arithmetic anywhere in pricing; order totals are recomputed server-side and reconciled against line items.                                                        |
| NFR-07 | Auditability      | Every privileged mutation is logged and retained 24 months. Payment and inventory ledgers are append-only.                                                                                                          |
| NFR-08 | Data protection   | Customer data is exportable and erasable per store (GDPR-style), gateway credentials are encrypted at rest, PAN/card data never touches our servers.                                                                |
| NFR-09 | Backups           | Nightly full plus 5-minute PITR, 30-day retention, restore rehearsed quarterly.                                                                                                                                     |
| NFR-10 | Accessibility     | WCAG 2.1 AA on dashboards and storefront themes: keyboard navigation, visible focus, 4.5:1 contrast, labelled controls.                                                                                             |
| NFR-11 | i18n ready        | All UI strings externalised; en + bn planned; `Asia/Dhaka` default timezone, BDT default currency, dates rendered in the store's timezone.                                                                          |
| NFR-12 | Observability     | Structured logs with request + store id, RED metrics per endpoint, traces across API → DB → gateway, error tracking, uptime checks.                                                                                 |
| NFR-13 | Maintainability   | TypeScript strict, no `any` outside typed boundaries, ≥ 70 % line coverage overall and ≥ 90 % on pricing, tenancy, inventory and order modules.                                                                     |
| NFR-14 | Compliance        | PCI-DSS SAQ-A posture (redirect/hosted fields only). Bangladesh VAT fields present on invoices.                                                                                                                     |

## 6. Constraints and assumptions

- Postgres 16, Node 22 LTS or newer, Next.js App Router, NestJS 11.
- The local machine has no Docker or Postgres yet; development will use a
  hosted dev database (Neon branch) unless Docker is installed.
- bKash and Nagad merchant onboarding is the tenant's responsibility; the
  platform ships sandbox adapters and a credential form.
- Wildcard TLS for `*.jewelleryhub.com` plus on-demand certificates for custom
  domains.
- Phone number is the primary customer identifier in Bangladesh; email is
  optional at checkout but required for account creation.

## 7. Acceptance criteria for v1.0

1. Two independent stores can be created from public signup, each publishing a
   customised storefront on its own subdomain.
2. An automated isolation suite proves that store A's credentials cannot read
   or mutate any of store B's rows across every tenant-owned endpoint, with RLS
   verified independently of application code.
3. A shopper completes a COD order and an SSLCommerz sandbox order; the
   sandbox order becomes `PAID` only via verified webhook, and a forged
   browser callback does not change payment status.
4. Stock cannot be oversold under 50 concurrent checkouts on a single unit.
5. A plan limit (`max_products`) blocks creation at the boundary via the API,
   not only in the UI, and downgrade is refused while usage exceeds the target.
6. A failed renewal moves through `PAST_DUE`, dunning, and suspension, and the
   storefront then serves the suspended page.
7. All dashboard figures reconcile with the underlying orders for a seeded
   dataset.
8. Prisma migrations apply cleanly from empty to current on a fresh database,
   and the seed script produces a demo platform.
