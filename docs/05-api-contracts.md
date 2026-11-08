# API Contracts — JewelleryHub

**Version** 0.1 (planning) · **Date** 2026-11-07
Base URL: `https://api.jewelleryhub.com/v1` · OpenAPI served at `/docs`

---

## 1. Conventions

**Namespaces.** The first path segment states the audience, which also fixes
which guard stack applies:

| Prefix                | Audience                | Tenant resolution                            | Guards                                       |
| --------------------- | ----------------------- | -------------------------------------------- | -------------------------------------------- |
| `/auth/*`             | platform users          | n/a                                          | rate limit                                   |
| `/platform/*`         | Super Admin, Support    | explicit store/tenant id in path             | auth + platform permission                   |
| `/stores/{storeId}/*` | owner + staff dashboard | token claim, cross-checked with `X-Store-Id` | auth + membership + permission + entitlement |
| `/storefront/*`       | public shoppers         | `Host` header → store                        | optional customer auth, rate limit           |
| `/customer/*`         | logged-in shoppers      | customer session (store-bound)               | customer auth                                |
| `/webhooks/*`         | gateways, couriers      | provider config                              | signature verification only                  |
| `/sdk/*`              | embedded try-on SDK     | API key + origin allowlist                   | api key                                      |

**Headers.**

| Header                        | Use                                                                 |
| ----------------------------- | ------------------------------------------------------------------- |
| `Authorization: Bearer <jwt>` | API clients; browsers use `httpOnly` cookies instead                |
| `X-Store-Id`                  | Active store for dashboard calls; must match the token claim or 403 |
| `Idempotency-Key`             | Required on checkout, payment init, refund, bulk import             |
| `X-Request-Id`                | Echoed in every response and every log line                         |

**Response envelope.** Single resources return the object directly. Lists are
always paginated and never return a bare array:

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "perPage": 20, "total": 143, "totalPages": 8 }
}
```

Cursor pagination (`?cursor=&limit=`) is used where order is stable and depth
matters: orders, activity log, inventory movements.

**Errors.** One shape, always:

```json
{
  "error": {
    "code": "PLAN_LIMIT_EXCEEDED",
    "message": "Your Starter plan allows 100 products.",
    "details": { "limit": 100, "current": 100, "upgradeTo": "growth" },
    "requestId": "req_01HX..."
  }
}
```

| HTTP | Codes                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_FAILED`, `INVALID_STATE_TRANSITION`, `COUPON_INVALID`, `CART_PRICE_CHANGED`              |
| 401  | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `REFRESH_REUSED`                                                 |
| 403  | `FORBIDDEN`, `PERMISSION_DENIED`, `STORE_MISMATCH`, `STORE_SUSPENDED`                                |
| 404  | `NOT_FOUND` — also returned instead of 403 for another tenant's resource, so existence does not leak |
| 409  | `CONFLICT`, `SLUG_TAKEN`, `SKU_TAKEN`, `INSUFFICIENT_STOCK`, `IDEMPOTENT_REPLAY_MISMATCH`            |
| 402  | `PLAN_LIMIT_EXCEEDED`, `FEATURE_NOT_IN_PLAN`, `SUBSCRIPTION_PAST_DUE`                                |
| 422  | `UNPROCESSABLE` — well-formed but business-invalid                                                   |
| 429  | `RATE_LIMITED` (with `Retry-After`)                                                                  |
| 500  | `INTERNAL` — never leaks internals; correlate by `requestId`                                         |

**List parameters.** `?page`, `?perPage` (max 100), `?sort=field:asc|desc`,
`?q=`, `?from=`/`?to=` (ISO 8601), plus resource filters. Unknown parameters
are rejected, not ignored — a typo should fail loudly.

**Dates** are ISO 8601 UTC on the wire; rendering in the store's timezone is
the client's job. **Money** is a decimal string (`"12500.00"`) with a sibling
`currency`, never a float.

---

## 2. Authentication — `/auth`

| Method | Path                                            | Body / notes                                                   | Returns                                                              |
| ------ | ----------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| POST   | `/auth/register`                                | owner name, email, password, businessName, storeSlug, planKey? | 201 tenant + store + trial, sends verification                       |
| POST   | `/auth/login`                                   | email, password                                                | tokens via cookies + `{ user, memberships }`                         |
| POST   | `/auth/refresh`                                 | refresh cookie                                                 | rotated pair; reuse revokes the family (401 `REFRESH_REUSED`)        |
| POST   | `/auth/logout`                                  | —                                                              | revokes the current session                                          |
| POST   | `/auth/logout-all`                              | —                                                              | revokes every session for the user                                   |
| POST   | `/auth/verify-email`                            | token                                                          | 204                                                                  |
| POST   | `/auth/resend-verification`                     | email                                                          | 202 (never reveals existence)                                        |
| POST   | `/auth/forgot-password`                         | email                                                          | 202 (always 202)                                                     |
| POST   | `/auth/reset-password`                          | token, password                                                | 204, revokes all sessions                                            |
| POST   | `/auth/accept-invite`                           | token, name, password                                          | 201 membership                                                       |
| GET    | `/auth/me`                                      | —                                                              | user, memberships, active store, effective permissions, entitlements |
| GET    | `/auth/sessions` · DELETE `/auth/sessions/{id}` | —                                                              | device list / revoke                                                 |
| POST   | `/auth/mfa/setup` · `/verify` · `/disable`      | TOTP                                                           | —                                                                    |
| GET    | `/auth/slug-available?slug=`                    | public                                                         | `{ available, reason? }`                                             |

---

## 3. Platform console — `/platform`

| Method                | Path                                               | Permission                                |
| --------------------- | -------------------------------------------------- | ----------------------------------------- |
| GET                   | `/platform/dashboard`                              | `platform:analytics:read`                 |
| GET                   | `/platform/stores`                                 | `platform:store:read`                     |
| GET                   | `/platform/stores/{id}`                            | `platform:store:read`                     |
| POST                  | `/platform/stores/{id}/suspend` · `/activate`      | `platform:store:write`                    |
| POST                  | `/platform/stores/{id}/impersonate`                | `platform:store:impersonate`              |
| GET/POST/PATCH/DELETE | `/platform/plans[/{id}]`                           | `platform:plan:write`                     |
| GET/PUT/DELETE        | `/platform/plans/{id}/entitlements[/{key}]`        | `platform:plan:write`                     |
| GET                   | `/platform/subscriptions`                          | `platform:subscription:read`              |
| PATCH                 | `/platform/subscriptions/{id}`                     | change plan, extend trial, set status     |
| PUT                   | `/platform/subscriptions/{id}/overrides/{key}`     | per-tenant limit override                 |
| GET                   | `/platform/invoices` · `/{id}`                     | `platform:billing:read`                   |
| POST                  | `/platform/invoices/{id}/mark-paid` · `/void`      | `platform:billing:write`, reason required |
| GET                   | `/platform/payments`                               | `platform:billing:read`                   |
| GET/POST/PATCH        | `/platform/users`                                  | `platform:user:write`                     |
| GET/PATCH             | `/platform/settings`                               | `platform:settings:write`                 |
| GET/POST/PATCH        | `/platform/themes`                                 | `platform:theme:write`                    |
| GET/PATCH             | `/platform/tickets[/{id}]` · POST `/{id}/messages` | `platform:support:*`                      |
| GET                   | `/platform/activity`                               | `platform:audit:read`                     |
| GET                   | `/platform/analytics/{revenue                      | growth                                    | churn | plans}` | `platform:analytics:read` |

Every `/platform` route that touches tenant data writes an `ActivityLog` entry
naming the operator, the target store and the reason supplied.

---

## 4. Store dashboard — `/stores/{storeId}`

Prefix omitted below. All routes require membership plus the stated permission.

### 4.1 Overview and setup

| Method                | Path                                                                               | Permission                                     |
| --------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| GET                   | `/dashboard?range=30d`                                                             | `analytics:read`                               |
| GET                   | `/onboarding`                                                                      | `store:read` — checklist state                 |
| GET/PATCH             | `/settings` · `/settings/{checkout\|tax\|inventory\|notifications\|seo\|policies}` | `store:settings`                               |
| GET/POST/DELETE       | `/domains[/{id}]` · POST `/domains/{id}/verify`                                    | `store:settings` + `custom_domain` entitlement |
| GET/PUT               | `/payment-methods[/{provider}]` · POST `/{provider}/test`                          | `store:payments` — config is write-only        |
| GET/POST/PATCH/DELETE | `/shipping/zones[/{id}]` · `/shipping/rates[/{id}]`                                | `store:settings`                               |
| GET/PUT               | `/carriers[/{provider}]`                                                           | `store:settings`                               |

### 4.2 Catalogue

| Method                | Path                                                                                                              | Permission                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| GET                   | `/products` — `?q,status,categoryId,brandId,jewelleryType,metalType,purity,minPrice,maxPrice,stock=low\|out,sort` | `product:read`                                                       |
| POST                  | `/products`                                                                                                       | `product:write` + `max_products` limit                               |
| GET/PATCH/DELETE      | `/products/{id}`                                                                                                  | `product:read` / `product:write`                                     |
| POST                  | `/products/{id}/duplicate` · `/archive` · `/restore`                                                              | `product:write`                                                      |
| POST                  | `/products/bulk` — activate, archive, delete, set category, adjust price                                          | `product:write`                                                      |
| POST                  | `/products/import` (multipart, `?dryRun=true`) · GET `/products/export`                                           | `product:write`                                                      |
| GET/POST/PATCH/DELETE | `/products/{id}/variants[/{vid}]`                                                                                 | `product:write`                                                      |
| POST                  | `/products/{id}/variants/generate` — cartesian product of options                                                 | `product:write`                                                      |
| GET/POST/PATCH/DELETE | `/products/{id}/media[/{mid}]` · PATCH `/media/reorder`                                                           | `product:write`                                                      |
| GET/POST/PATCH/DELETE | `/products/{id}/gemstones[/{gid}]`                                                                                | `product:write`                                                      |
| PUT                   | `/products/{id}/attributes`                                                                                       | `product:write`                                                      |
| PUT                   | `/products/{id}/related`                                                                                          | `product:write`                                                      |
| POST                  | `/media/sign-upload`                                                                                              | returns a signed direct-upload payload; server validates MIME + size |
| GET/POST/PATCH/DELETE | `/categories[/{id}]` · PATCH `/categories/reorder`                                                                | `category:write`                                                     |
| GET/POST/PATCH/DELETE | `/brands[/{id}]`                                                                                                  | `category:write`                                                     |
| GET/POST/PATCH/DELETE | `/collections[/{id}]` · PUT `/{id}/products`                                                                      | `category:write`                                                     |
| GET/POST/PATCH/DELETE | `/attributes[/{id}]`                                                                                              | `product:write`                                                      |
| GET/POST              | `/metal-rates` · GET `/metal-rates/current`                                                                       | `product:write`                                                      |

`POST /products` accepts the product, its options, variants, gemstones and
attribute values in one request and creates them in one transaction — a
half-created product is not a state the UI should ever have to handle.

### 4.3 Inventory

| Method                | Path                                                                                | Permission                                            |
| --------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| GET                   | `/inventory` — `?locationId,q,stock=low\|out,sort`                                  | `inventory:read`                                      |
| GET                   | `/inventory/{variantId}` — levels + movement history                                | `inventory:read`                                      |
| POST                  | `/inventory/adjust` — `{ variantId, locationId, delta, reason }`, `Idempotency-Key` | `inventory:write`                                     |
| POST                  | `/inventory/bulk-adjust` · `/stocktake`                                             | `inventory:write`                                     |
| POST                  | `/inventory/transfer`                                                               | `inventory:write`                                     |
| GET                   | `/inventory/movements` — cursor paginated                                           | `inventory:read`                                      |
| GET                   | `/inventory/alerts` — at or below reorder point                                     | `inventory:read`                                      |
| GET/POST/PATCH/DELETE | `/locations[/{id}]`                                                                 | `inventory:write`                                     |
| GET/POST/PATCH/DELETE | `/suppliers[/{id}]`                                                                 | `inventory:write`                                     |
| GET/POST/PATCH        | `/purchase-orders[/{id}]`                                                           | `inventory:write`                                     |
| POST                  | `/purchase-orders/{id}/{send\|receive\|cancel}`                                     | `inventory:write` — receive takes per-line quantities |

### 4.4 Orders

| Method    | Path                                                                            | Permission     |
| --------- | ------------------------------------------------------------------------------- | -------------- |
| GET       | `/orders` — `?q,status,paymentStatus,fulfillmentStatus,from,to,min,max`, cursor | `order:read`   |
| GET       | `/orders/{id}`                                                                  | `order:read`   |
| POST      | `/orders` — manual/phone order                                                  | `order:write`  |
| POST      | `/orders/{id}/transition` — `{ to, note? }`, validated by the state machine     | `order:write`  |
| PATCH     | `/orders/{id}` — staff note, tags, shipping address while unshipped             | `order:write`  |
| POST      | `/orders/{id}/cancel` — `{ reason, restock }`                                   | `order:cancel` |
| GET/POST  | `/orders/{id}/shipments` · PATCH `/shipments/{sid}`                             | `order:fulfil` |
| POST      | `/orders/{id}/refunds` — full or per-line, `Idempotency-Key`                    | `order:refund` |
| GET       | `/orders/{id}/invoice.pdf` · `/packing-slip.pdf`                                | `order:read`   |
| GET       | `/orders/export?from&to&format=csv\|xlsx`                                       | `order:read`   |
| GET/PATCH | `/returns[/{id}]` · POST `/{id}/{approve\|reject\|receive\|complete}`           | `order:return` |
| GET       | `/payments` — attempts across orders                                            | `order:read`   |

`POST /orders/{id}/transition` is the only way order status changes. There is
no `PATCH /orders/{id} { status }`, which is how illegal transitions get in.

### 4.5 Customers, promotions, reviews, staff

| Method                | Path                                                            | Permission                                                       |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| GET                   | `/customers` — `?q,tag,hasOrdered,from,to`                      | `customer:read`                                                  |
| GET                   | `/customers/{id}` — profile, addresses, orders, lifetime value  | `customer:read`                                                  |
| PATCH                 | `/customers/{id}` — note, tags, block/unblock                   | `customer:write`                                                 |
| GET                   | `/customers/export` · POST `/customers/{id}/erase` (GDPR-style) | `customer:write`                                                 |
| GET/POST/PATCH/DELETE | `/coupons[/{id}]`                                               | `coupon:write`                                                   |
| GET                   | `/coupons/{id}/redemptions`                                     | `coupon:read`                                                    |
| GET                   | `/reviews` — `?status,productId,rating`                         | `review:read`                                                    |
| POST                  | `/reviews/{id}/{approve\|reject}` · PUT `/{id}/reply`           | `review:moderate`                                                |
| GET                   | `/staff` · POST `/staff/invite`                                 | `staff:write` + `staff_accounts` entitlement + `max_staff` limit |
| PATCH/DELETE          | `/staff/{id}` — role, permission overrides, remove              | `staff:write`                                                    |
| GET                   | `/roles` · `/permissions`                                       | `staff:read`                                                     |
| GET                   | `/activity` — this store's audit log, cursor                    | `audit:read`                                                     |
| GET                   | `/notifications` · POST `/notifications/read`                   | `store:read`                                                     |

### 4.6 Storefront customisation

| Method                | Path                                                            | Permission                                |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| GET                   | `/themes` — catalogue + which is active                         | `storefront:write`                        |
| POST                  | `/themes/{themeId}/activate`                                    | `storefront:write`                        |
| GET/PATCH             | `/themes/active/tokens` — draft edits                           | `storefront:write`                        |
| POST                  | `/themes/active/publish` · `/discard-draft`                     | `storefront:write`                        |
| GET/POST/PATCH/DELETE | `/pages[/{id}]`                                                 | `storefront:write`                        |
| GET/POST/PATCH/DELETE | `/pages/{id}/sections[/{sid}]` · PATCH `/sections/reorder`      | `storefront:write`                        |
| GET                   | `/sections/registry` — available types + their settings schemas | `storefront:write`                        |
| POST                  | `/pages/{id}/publish`                                           | `storefront:write` — revalidates ISR tags |
| GET/POST/PATCH/DELETE | `/banners[/{id}]`                                               | `storefront:write`                        |
| GET                   | `/preview-token`                                                | signed, short-lived draft preview         |

### 4.7 Analytics and billing

| Method | Path                                                                              | Permission                                                   |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/analytics/overview?range=`                                                      | `analytics:read`                                             |
| GET    | `/analytics/{sales\|products\|categories\|customers\|inventory\|payment-methods}` | `analytics:read`; advanced reports need `advanced_analytics` |
| GET    | `/analytics/export?report=&from=&to=`                                             | `analytics:read`                                             |
| GET    | `/billing/subscription`                                                           | `store:billing`                                              |
| GET    | `/billing/plans` — upgrade options with proration preview                         | `store:billing`                                              |
| POST   | `/billing/subscribe` · `/change-plan` · `/cancel` · `/resume`                     | `store:billing`                                              |
| GET    | `/billing/invoices` · `/invoices/{id}.pdf`                                        | `store:billing`                                              |
| GET    | `/billing/usage` — each entitlement: limit vs current                             | `store:billing`                                              |

---

## 5. Public storefront — `/storefront`

Store resolved from `Host`. Cacheable, no credentials required.

| Method            | Path                                                                                        | Notes                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET               | `/storefront/config`                                                                        | store identity, theme tokens, nav, payment + shipping options, policies                                                                |
| GET               | `/storefront/pages/{slug}`                                                                  | published sections with resolved content                                                                                               |
| GET               | `/storefront/products`                                                                      | `?q,category,collection,brand,jewelleryType,metalType,purity,minPrice,maxPrice,minWeight,maxWeight,stone,attr.{key},inStock,sort,page` |
| GET               | `/storefront/products/{slug}`                                                               | full detail, variants, gemstones, attributes, media, rating summary                                                                    |
| GET               | `/storefront/products/{slug}/related` · `/reviews`                                          |                                                                                                                                        |
| GET               | `/storefront/categories` · `/collections[/{slug}]`                                          |                                                                                                                                        |
| GET               | `/storefront/search/suggest?q=`                                                             | typeahead, debounced, 10 max                                                                                                           |
| GET               | `/storefront/facets`                                                                        | available filter values with counts for the current query                                                                              |
| POST              | `/storefront/cart`                                                                          | creates a cart, returns `sessionToken` cookie                                                                                          |
| GET               | `/storefront/cart`                                                                          | current cart with recomputed totals and price-change flags                                                                             |
| POST/PATCH/DELETE | `/storefront/cart/items[/{id}]`                                                             | stock checked on every mutation                                                                                                        |
| POST/DELETE       | `/storefront/cart/coupon`                                                                   | server-side validation                                                                                                                 |
| POST              | `/storefront/cart/shipping-estimate`                                                        | `{ district, postalCode }` → rate options                                                                                              |
| POST              | `/storefront/checkout`                                                                      | `Idempotency-Key` required → `{ order, payment: { redirectUrl? } }`                                                                    |
| GET               | `/storefront/orders/track?number=&phone=`                                                   | guest tracking, rate limited, timing-safe comparison                                                                                   |
| POST              | `/storefront/newsletter` · `/contact`                                                       | rate limited + honeypot                                                                                                                |
| GET               | `/storefront/sitemap.xml` · `/robots.txt`                                                   | per store                                                                                                                              |
| POST              | `/storefront/auth/{register\|login\|logout\|forgot-password\|reset-password\|verify-email}` | store-scoped customer identity                                                                                                         |

`POST /storefront/checkout` re-validates everything server-side — product
status, stock, prices, coupon, shipping rate, minimum order value — and
returns `400 CART_PRICE_CHANGED` with the differences rather than quietly
charging a different amount.

---

## 6. Customer account — `/customer`

Requires a customer session bound to the resolved store.

| Method                | Path                                                                 |
| --------------------- | -------------------------------------------------------------------- |
| GET/PATCH             | `/customer/profile`                                                  |
| POST                  | `/customer/change-password`                                          |
| GET/POST/PATCH/DELETE | `/customer/addresses[/{id}]`                                         |
| GET                   | `/customer/orders` · `/orders/{id}`                                  |
| POST                  | `/customer/orders/{id}/cancel` — only while `PENDING` or `CONFIRMED` |
| POST                  | `/customer/orders/{id}/returns`                                      |
| GET/POST/DELETE       | `/customer/wishlist[/items/{id}]`                                    |
| GET/POST              | `/customer/reviews` — only for delivered, purchased items            |
| GET                   | `/customer/recently-viewed`                                          |

---

## 7. Webhooks — `/webhooks`

| Method | Path                                     | Verification                                    |
| ------ | ---------------------------------------- | ----------------------------------------------- |
| POST   | `/webhooks/sslcommerz/{storeId}`         | `verify_sign` + server-side `validatorAPI` call |
| POST   | `/webhooks/bkash/{storeId}`              | signature + `payment/execute` / query status    |
| POST   | `/webhooks/nagad/{storeId}`              | signature + verification call                   |
| POST   | `/webhooks/stripe`                       | `Stripe-Signature`, raw body                    |
| POST   | `/webhooks/courier/{provider}/{storeId}` | provider signature or shared secret             |

Every handler: capture raw body → persist `WebhookEvent` → verify signature →
dedupe on `(provider, externalId)` → **independently verify with the provider**
→ check the amount equals the order total → apply in a transaction → return
200 fast and do side effects on the queue. Unknown or unverifiable events are
stored with `IGNORED`/`FAILED` and alerted on, never silently dropped. A 200 is
returned for duplicates so providers stop retrying.

---

## 8. SDK — `/sdk`

For the embeddable virtual try-on, usable from a non-JewelleryHub storefront.

| Method | Path                        | Auth                                                 |
| ------ | --------------------------- | ---------------------------------------------------- |
| GET    | `/sdk/products/{id}/try-on` | API key + `Origin` allowlist                         |
| GET    | `/sdk/config`               | API key                                              |
| POST   | `/sdk/events`               | API key — anonymous usage metrics, no biometric data |

Camera frames are processed in the browser. No face or body imagery is
transmitted to or stored on the platform; this is a stated product constraint,
not an implementation detail to decide later.

---

## 9. Contract hygiene

- Zod schemas in `packages/shared` are the single definition of every request
  and response; the API validates with them and the OpenAPI document is
  generated from them, so docs cannot drift from behaviour.
- The generated OpenAPI file is committed. CI diffs it; a breaking change
  without a version note fails the build.
- The contract test generator walks the OpenAPI document and asserts that every
  tenant-owned route rejects a foreign-store caller (see
  `docs/03-multi-tenancy.md` §9).
- Versioning: additive changes go into `v1`; a breaking change opens `v2` with
  `v1` supported for six months and a `Deprecation` header.
