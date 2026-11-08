# Authentication and Authorization Strategy — JewelleryHub

**Version** 0.1 (planning) · **Date** 2026-11-07

---

## 1. Two identity realms

|                  | Platform realm                                   | Storefront realm                                |
| ---------------- | ------------------------------------------------ | ----------------------------------------------- |
| Table            | `User`                                           | `Customer`                                      |
| Who              | Super Admin, Support, Store Owner, Store Staff   | shoppers                                        |
| Email uniqueness | global                                           | **per store** (`@@unique([storeId, email])`)    |
| Token audience   | `aud: "platform"`                                | `aud: "storefront"`, with `storeId` bound       |
| Cookie scope     | `app.jewelleryhub.com`, `admin.jewelleryhub.com` | the store's own host only                       |
| Session table    | shared `Session` (`userId` set)                  | shared `Session` (`customerId` + `storeId` set) |

They are deliberately separate. A shopper at store A is not an account at
store B, and a staff member is never implicitly a customer. Tokens from one
realm are rejected in the other by audience check — so a leaked customer token
cannot reach a dashboard route even if every other check were wrong.

## 2. Credentials

- **Hashing**: Argon2id, `memoryCost 19456 KiB`, `timeCost 2`,
  `parallelism 1` (OWASP 2024 baseline), per-password salt, rehash on login
  when parameters change.
- **Policy**: minimum 10 characters, checked against a breached-password list
  (k-anonymity prefix API or a local list); no composition rules, no forced
  rotation — they push users toward weaker, reused passwords.
- **Enumeration**: `/auth/forgot-password`, `/auth/register` and
  `/auth/resend-verification` always return 202 with the same body and
  comparable timing, whether or not the account exists.
- **Lockout**: progressive delay from the 3rd failure, lock for 15 minutes
  after 10, counted per account **and** per IP so one attacker cannot lock out
  a legitimate user at will.
- **Timing**: password comparison runs even when the user is not found, against
  a dummy hash, so response time does not reveal account existence.

## 3. Tokens and sessions

```
Access token   JWT, 15 min, EdDSA (Ed25519), stateless
Refresh token  256-bit random, 30 days, stored as SHA-256, single use, rotating
```

Access token claims:

```json
{
  "sub": "usr_...",
  "aud": "platform",
  "typ": "access",
  "sid": "ses_...",
  "activeStoreId": "str_...",
  "memberships": ["str_..."],
  "isSuperAdmin": false,
  "imp": { "by": "usr_...", "exp": 1730000000 },
  "iat": 0,
  "exp": 0,
  "jti": "..."
}
```

Permissions are **not** in the token. They are loaded per request from a Redis
cache keyed on `(userId, storeId)` and invalidated when a role or override
changes. A revoked permission must take effect now, not in fifteen minutes.

**Rotation with reuse detection.** Each refresh issues a new token and marks
the old one `replacedById`. Presenting an already-rotated token means it was
stolen (or a race): the entire `familyId` is revoked, the user is signed out
everywhere, `401 REFRESH_REUSED` is returned, and a security notification is
sent. A single-use-token race from double-clicking is handled by a 10-second
grace window keyed on the same token hash returning the same new pair.

**Transport.** Browsers use cookies, never `localStorage`:

```
jh_at  httpOnly, Secure, SameSite=Lax,    Path=/,             Max-Age=900
jh_rt  httpOnly, Secure, SameSite=Strict, Path=/auth/refresh, Max-Age=2592000
```

`SameSite=Strict` on the refresh path and a narrow `Path` keep it out of
cross-site requests. Non-browser clients use `Authorization: Bearer`.

**CSRF.** Cookie-authenticated unsafe methods require the double-submit
pattern: a readable `jh_csrf` cookie echoed in `X-CSRF-Token`, compared with a
timing-safe equality. `Origin` is also checked against an allowlist derived
from the resolved store's verified hostnames.

**Key management.** Signing keys live in the secret manager, are published as a
JWKS with `kid`, and rotate quarterly with an overlap window so in-flight
tokens stay valid.

## 4. Email verification, reset, invites

All one-time tokens share one implementation:

- 256-bit random value, shown to the user once, stored only as SHA-256.
- Purpose-tagged (`VerificationToken.purpose`), single-use (`consumedAt`),
  time-limited: verification 24 h, reset 1 h, invite 7 days.
- Consumption is a conditional update (`WHERE consumedAt IS NULL`), so two
  concurrent clicks cannot both succeed.
- Password reset revokes every session for that identity.
- Reset links carry no email address in the URL, so the token alone is useless
  without the stored row.

## 5. Authorization

### 5.1 Permission catalogue

Verb-scoped keys, grouped for the UI matrix:

```
Catalogue   product:read product:write category:write
Inventory   inventory:read inventory:write
Orders      order:read order:write order:fulfil order:cancel order:refund order:return
Customers   customer:read customer:write
Marketing   coupon:read coupon:write review:read review:moderate
Storefront  storefront:write
Insights    analytics:read audit:read
Store       store:read store:settings store:payments store:billing
People      staff:read staff:write
Platform    platform:store:read platform:store:write platform:store:impersonate
            platform:plan:write platform:subscription:read platform:billing:read
            platform:billing:write platform:user:write platform:settings:write
            platform:theme:write platform:support:read platform:support:write
            platform:analytics:read platform:audit:read
```

### 5.2 System roles

| Role               | Scope    | Holds                                                              |
| ------------------ | -------- | ------------------------------------------------------------------ |
| `super_admin`      | PLATFORM | everything                                                         |
| `support_agent`    | PLATFORM | `platform:*:read`, `platform:support:*`, impersonate-with-approval |
| `store_owner`      | STORE    | every store permission, implicitly                                 |
| `store_manager`    | STORE    | all except `store:billing`, `staff:write`, `store:payments`        |
| `catalogue_staff`  | STORE    | `product:*`, `category:write`, `inventory:*`                       |
| `fulfilment_staff` | STORE    | `order:read`, `order:write`, `order:fulfil`, `inventory:read`      |
| `support_staff`    | STORE    | `order:read`, `customer:*`, `review:moderate`                      |

System roles are immutable. Owners may clone one into a custom role, and may
also layer per-member ALLOW/DENY overrides for one-off cases.

### 5.3 Effective permissions

```
effective = (owner ? ALL_STORE_PERMISSIONS : role.permissions)
            ∪ member.overrides(ALLOW)
            − member.overrides(DENY)
```

DENY always wins, including for owners — so "this manager must never issue
refunds" is expressible and enforced.

### 5.4 The guard chain

```
AuthGuard        valid, unexpired, correct-audience token; loads the principal
TenantGuard      resolves storeId (host / claim+header), verifies membership
                 and store status; populates TenantContext (AsyncLocalStorage)
PermissionGuard  reads @RequirePermission; checks effective permissions
EntitlementGuard reads @RequireFeature / @RequireLimit; checks the plan
```

```ts
@Post(':storeId/products')
@RequirePermission('product:write')
@RequireLimit('max_products')
@Audit('product.created')
create(@Body() dto: CreateProductDto) { /* ... */ }
```

A route with no `@Public()` and no `@RequirePermission` **fails a startup
assertion**. The application refuses to boot with an unguarded route, which is
the only reliable way to stop "we forgot the guard on the new endpoint".

### 5.5 Resource-level checks

Ownership is not re-checked in services, because the Prisma tenant extension
plus RLS make a foreign row unreachable: `findUnique({ id })` for another
store's product returns null, and the service returns 404. That is intentional
— it removes the chance of an inconsistent manual check. Where a second
dimension exists (a customer may only read _their own_ orders inside a store),
the service adds an explicit `customerId` predicate, and a test covers it.

## 6. Storefront customer auth

- Registration and login are store-scoped; the API resolves the store from the
  host before touching credentials.
- Session cookies are set on the store's own host, so a customer at store A has
  no cookie readable by store B even if both are JewelleryHub subdomains
  (cookies are never set on the apex domain).
- Guest checkout creates a `Customer` row with `isGuest = true` and no
  password; registering later with the same email claims it and attaches the
  order history.
- Guest order tracking requires order number **plus** the phone number, is rate
  limited per IP, and compares the phone with a timing-safe function. Order
  numbers are per-store and sequential, so they must never be a sufficient
  credential on their own.
- Cart merge on login: anonymous cart items are merged into the customer's
  cart, quantities summed and clamped to available stock.
- Optional OTP login by phone (Bangladesh-friendly) behind the same session
  machinery; deferred to Phase 9.

## 7. Impersonation

1. Support requests access with a reason; `platform:store:impersonate` is
   required.
2. A 15-minute access token is issued with `imp: { by, exp }` and no refresh
   token — it cannot be extended silently.
3. The dashboard shows a persistent banner naming the operator.
4. Writes require `platform:store:write` as well; read-only support cannot
   mutate tenant data.
5. Start and end are audit-logged with the reason. Owners can see every
   impersonation of their store in their own activity log — tenants should not
   have to ask whether support looked at their data.

## 8. API keys (SDK and headless)

- Format `jh_live_<prefix>_<secret>`; only the prefix and a SHA-256 of the
  secret are stored, and the full key is displayed exactly once.
- Scoped to one store, carrying explicit scopes and an `Origin` allowlist.
- Expiry optional, revocation immediate, `lastUsedAt` tracked so stale keys are
  visible.
- Rate limited per key, separately from IP limits.

## 9. Rate limits

| Surface                                | Limit                                      |
| -------------------------------------- | ------------------------------------------ |
| `/auth/login`, `/auth/forgot-password` | 5 / min / IP and 10 / hour / account       |
| `/auth/register`                       | 3 / hour / IP                              |
| `/storefront/checkout`                 | 10 / min / session                         |
| `/storefront/orders/track`             | 10 / min / IP                              |
| Public catalogue                       | 120 / min / IP                             |
| Dashboard (authenticated)              | 600 / min / user                           |
| `/webhooks/*`                          | 300 / min / provider, with burst allowance |

Implemented as a Redis sliding window keyed by IP, session, user or key as
appropriate; 429 with `Retry-After`.

## 10. Hardening checklist

- [ ] TLS everywhere; HSTS with `includeSubDomains` and preload
- [ ] CSP on storefronts: no `unsafe-inline`, nonce-based scripts, image hosts allowlisted
- [ ] `X-Frame-Options: DENY` on dashboards; storefronts framed only by their own origin
- [ ] Rich text sanitised server-side with an allowlist (DOMPurify/`sanitize-html`); never trusted from the client
- [ ] Uploads: signed direct upload, MIME sniffing by magic bytes not extension, size caps, stripped EXIF, images re-encoded
- [ ] SQL injection structurally impossible (Prisma); `$queryRawUnsafe` banned by lint
- [ ] Dependency and container scanning in CI; `npm audit` gate on high severity
- [ ] Secrets only from the secret manager; a pre-commit hook plus CI secret scan
- [ ] Per-store gateway credentials envelope-encrypted; decrypted only in the payment service, never serialised into a response
- [ ] PII redacted from logs (emails, phones, addresses, tokens) by a pino serialiser
- [ ] Error responses carry a `requestId` and nothing internal
- [ ] Penetration test before public launch, focused on tenant isolation and payment verification
