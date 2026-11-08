# Testing Strategy — JewelleryHub

**Version** 0.1 (planning) · **Date** 2026-11-07

---

## 1. What we are actually protecting

Tests are not a coverage target; they are insurance on the things that cost
real money or trust if they break:

| Risk                                          | Consequence                       | Test type that catches it                    |
| --------------------------------------------- | --------------------------------- | -------------------------------------------- |
| Tenant data leak                              | Business-ending                   | Generated contract tests + raw-SQL RLS tests |
| Order marked paid without payment             | Direct revenue loss, fraud        | Webhook security integration tests           |
| Overselling                                   | Cancelled orders, angry customers | Concurrency integration tests                |
| Wrong price (rounding, making charge, coupon) | Loss per order, disputes          | Pure-function unit tests with edge cases     |
| Illegal order status transition               | Corrupt fulfilment and refunds    | State machine unit tests                     |
| Plan limit bypass                             | Unpaid usage                      | Entitlement guard integration tests          |
| Lost stock ledger integrity                   | Unreconcilable inventory          | Ledger reconciliation tests                  |

Everything else gets proportionate attention.

## 2. The pyramid, concretely

```
      e2e (Playwright) ~40 specs      slow, high confidence, user journeys
   integration (Jest + real PG) ~250  API + DB + RLS + transactions
        unit (Jest) ~700              pure domain, services with mocks
```

| Layer       | Runs against                        | Speed        | What belongs here                                                                                                          |
| ----------- | ----------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Unit        | nothing external                    | < 10 s total | pricing, coupon maths, order state machine, entitlement evaluation, permission resolution, validators, formatters, mappers |
| Integration | real Postgres + Redis in containers | < 4 min      | controllers through to the database, transactions, RLS, guards, webhook pipeline, concurrency                              |
| E2E         | full stack on seeded data           | < 12 min     | signup → store → product → storefront → checkout → fulfilment                                                              |

CI runs unit + integration on every push, e2e on PRs to `main` and nightly.

## 3. Unit tests — the domain that must be exactly right

Pure functions in `modules/catalog/pricing`, `modules/orders/order-state-machine`,
`core/entitlements` and `core/auth/permissions` import neither Nest nor Prisma,
so they test instantly and exhaustively.

```ts
describe('metal-rate pricing', () => {
  it('prices 22K bangle: net 12.500g @ 11,850/g + 8% wastage + 1,200 making', () => {
    expect(
      computePrice({
        mode: 'METAL_RATE_BASED',
        netWeightG: d('12.500'),
        ratePerGram: d('11850.00'),
        wastagePercent: d('8.000'),
        makingCharge: d('1200.00'),
        makingChargeType: 'FLAT',
        stoneValue: d('0'),
      }),
    ).toEqual({
      metal: d('148125.00'),
      wastage: d('11850.00'),
      making: d('1200.00'),
      total: d('161175.00'),
    });
  });

  it.each([
    ['PER_GRAM', d('500.00'), d('6250.00')],
    ['PERCENT', d('12.000'), d('17775.00')],
  ])('applies %s making charge', (type, value, expected) => {
    /* ... */
  });

  it('rounds half-up to 2 decimals and never uses floats', () => {
    /* ... */
  });
  it('refuses a negative or zero net weight in rate mode', () => {
    /* ... */
  });
});
```

Coverage targets, enforced per path rather than globally:

| Path                                                                                                      | Line coverage |
| --------------------------------------------------------------------------------------------------------- | ------------- |
| `catalog/pricing`, `orders/order-state-machine`, `promotions/coupon`, `core/entitlements`, `core/tenancy` | **≥ 95 %**    |
| `inventory`, `checkout`, `payments`                                                                       | ≥ 90 %        |
| Other services                                                                                            | ≥ 70 %        |
| Overall                                                                                                   | ≥ 70 %        |

Property-based tests (fast-check) on the pricing and coupon modules: totals are
never negative, discount never exceeds subtotal, line sums always equal the
order total, and re-pricing is idempotent.

## 4. Integration tests — the real database

A Postgres container per CI job, migrated once; each test runs in a transaction
rolled back at the end, except concurrency tests which need real commits and so
get a truncation-based reset.

Critically, integration tests connect as `app_runtime` — the **non-owner,
non-superuser** role — so RLS is active exactly as in production. A test suite
that connects as the owner proves nothing about isolation.

```ts
// The generated cross-tenant suite — the single most valuable file in the repo
describe.each(tenantOwnedRoutes())('isolation: %s %s', (method, path) => {
  it('refuses a foreign store', async () => {
    const { id } = await asStore(storeA).create(path);
    const res = await asStore(storeB).call(method, path.replace(':id', id));
    expect(res.status).toBeOneOf([403, 404]);
    expect(JSON.stringify(res.body)).not.toContain(id);
  });
});
```

Routes are enumerated from the OpenAPI document, so **a new tenant-owned
endpoint is covered the day it is written** — and a new endpoint that forgets
tenant scoping fails CI without anyone remembering to add a test.

Other required integration suites:

- **RLS direct** — with `app.current_store_id` set to B, raw SQL on every
  tenant table returns only B's rows; with nothing set, zero rows everywhere.
- **Pool bleed** — interleaved requests for two stores across a 2-connection
  pool; no response contains the other store's ids.
- **Order placement atomicity** — induced failure after reservation leaves no
  partial order, no orphan reservation, no consumed coupon.
- **Overselling** — `Promise.all` of 50 checkouts on 1 unit: exactly 1 success,
  49 `INSUFFICIENT_STOCK`, `onHand` ends at 0, ledger balances.
- **Coupon concurrency** — 20 parallel redemptions of a limit-5 coupon: exactly
  5 succeed.
- **Idempotency** — the same `Idempotency-Key` twice returns the same order and
  creates one row; a different body with the same key returns 409.
- **Webhook security** — forged signature rejected; replayed event applied
  once; amount mismatch rejected and alerted; browser-only callback changes
  nothing; out-of-order webhooks converge to the right state.
- **Entitlements** — creation at the limit is refused with 402; two parallel
  creates at limit−1 yield exactly one success; downgrade is refused while
  usage exceeds the target.
- **Subscription lifecycle** — with a clock stub: trial → active → renewal →
  failure → dunning → grace → suspension → reactivation.
- **Inventory ledger** — after 200 random movements, the sum of deltas equals
  `onHand` for every item.
- **Soft delete** — an archived product disappears from the storefront, stays
  on historical orders, and its slug/SKU remain blocked.

## 5. E2E tests — Playwright

Run against a seeded stack with the payment gateway replaced by a controllable
mock provider implementing the real `PaymentProvider` interface, so the
production code path (including webhook verification) is exercised.

Core journeys:

1. **Onboarding** — signup → verify email → store provisioned → onboarding
   checklist → publish storefront on its subdomain.
2. **Catalogue** — create a jewellery product with variants, gemstones and
   images; confirm it on the storefront with correct price and specs.
3. **Shopping, guest** — browse, filter by metal + price, product page, variant
   select, add to cart, COD checkout, success page, track by number + phone.
4. **Shopping, registered** — register, wishlist, cart merge on login, online
   payment via mock provider, webhook confirms, order visible in account.
5. **Fulfilment** — staff confirms, creates a partial shipment, delivers;
   customer sees the timeline; partial refund restocks.
6. **Storefront builder** — change theme tokens, reorder sections, publish;
   verify the public page changed and the draft was private before publish.
7. **Staff permissions** — invite staff with `order:read` only; verify the
   navigation hides other areas **and** that direct API calls are rejected.
8. **Billing** — hit the product limit, see the upgrade prompt, upgrade, limit
   lifts; downgrade attempt blocked with the reason.
9. **Platform admin** — suspend a store → storefront serves the suspended page
   → reactivate.
10. **Isolation, through the UI** — logged in as store A, manipulate the store
    id in a request and confirm 403/404 with no data.

Also run: accessibility checks (`@axe-core/playwright`) on every dashboard
route group and theme page, with zero serious violations; visual regression
snapshots for the three themes at mobile, tablet and desktop widths.

## 6. Performance and load

k6 scripts committed in `e2e/load/`:

| Scenario                      | Target                                    |
| ----------------------------- | ----------------------------------------- |
| Storefront browse (cached)    | 500 rps, p95 < 400 ms                     |
| Storefront product (uncached) | 100 rps, p95 < 900 ms                     |
| Faceted search, 50k products  | p95 < 700 ms                              |
| Checkout                      | 50 concurrent, zero oversell, p95 < 1.5 s |
| Dashboard lists, 500k orders  | p95 < 500 ms                              |

Seeding: a generator producing 1,000 stores, 50k products and 500k orders for
the largest tenant, so query plans are tested against realistic cardinality.
`EXPLAIN ANALYZE` is asserted on the hot queries — a missing index shows up as
a sequential scan in a test, not as a slow page in production.

## 7. Test data

- **Factories, not fixtures** (`@faker-js/faker` + typed builders):
  `aProduct({ metalType: 'GOLD', netWeightG: '12.5' })` with sensible defaults,
  so a test states only what it cares about.
- `withTwoStores()` is the default harness for any tenant-owned feature; the
  second store is seeded with **colliding slugs and SKUs** on purpose.
- Deterministic seeds (fixed faker seed) so a failure reproduces.
- No shared mutable state between tests; no ordering dependence.

## 8. CI pipeline

```yaml
on: [push, pull_request]
jobs:
  quality: lint · typecheck · prettier · depcheck · commitlint
  unit: jest --selectProjects=unit --coverage (per-path thresholds)
  integration: postgres:16 + redis:7 services → migrate → jest integration
  migrate-check: migrate from empty, then from the previous release tag; fail on drift
  contracts: generate OpenAPI → diff against committed → fail on undocumented break
  security: npm audit (high+) · gitleaks · trivy on images
  build: turbo build (all apps)
  e2e: (PR to main + nightly) playwright, 3 shards
```

Branch protection requires every job but `e2e` to pass; `e2e` must pass before
release. Flaky tests are quarantined with an owner and a deadline, never
retried silently.

## 9. Manual verification per phase

Automation cannot judge whether a storefront looks premium. Each phase closes
with a short scripted manual pass, recorded in the PR:

- Real device check: iPhone SE, mid-range Android, iPad, 1440p desktop
- Keyboard-only navigation of the new screens
- Dark mode (dashboards) and both light storefront themes
- Empty state, loading state, error state, and the longest realistic content
  (a 90-character product name, a 40-item order)
- One real sandbox transaction per payment provider, end to end

## 10. Definition of done

A phase is done when:

- [ ] Every new endpoint has a permission, a Zod schema, and an OpenAPI entry
- [ ] Every tenant-owned endpoint appears in the generated isolation suite
- [ ] Unit tests cover the domain logic including boundaries and failure paths
- [ ] Integration tests cover the happy path plus the two likeliest failures
- [ ] Migrations apply forward cleanly from empty **and** from the last release
- [ ] No `any`, no `console.log`, no commented-out code, no TODO without an issue
- [ ] Coverage thresholds met for the touched paths
- [ ] Docs updated: API contracts, env reference, runbook if operational
- [ ] Manual pass recorded, with screenshots for UI work
- [ ] No mock or placeholder data substituting for real functionality
