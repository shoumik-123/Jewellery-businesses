-- Generated: constraints + search (prisma/rls/constraints.sql) followed by
-- row-level security (prisma/rls/policies.sql, produced by prisma/rls/generate.ts).
-- Migrations are immutable history; those files are the current desired state.

-- ============================================================================
-- Constraints, partial unique indexes and search that Prisma cannot express.
--
-- These are invariants, not validations: the application checks them too, but
-- the database is what makes them true. Anything that would corrupt money,
-- stock or ownership is enforced here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- "Exactly one of these per parent" — expressible only as a partial index
-- ---------------------------------------------------------------------------

-- One owner per store (ignoring removed members).
CREATE UNIQUE INDEX store_member_single_owner
  ON "StoreMember" ("storeId")
  WHERE "isOwner" = true AND "deletedAt" IS NULL;

-- One active theme per store.
CREATE UNIQUE INDEX store_theme_single_active
  ON "StoreTheme" ("storeId")
  WHERE "isActive" = true;

-- One primary domain per store.
CREATE UNIQUE INDEX store_domain_single_primary
  ON "StoreDomain" ("storeId")
  WHERE "isPrimary" = true;

-- One default inventory location per store.
CREATE UNIQUE INDEX inventory_location_single_default
  ON "InventoryLocation" ("storeId")
  WHERE "isDefault" = true;

-- One default variant per product.
CREATE UNIQUE INDEX product_variant_single_default
  ON "ProductVariant" ("productId")
  WHERE "isDefault" = true AND "deletedAt" IS NULL;

-- One default wishlist per customer.
CREATE UNIQUE INDEX wishlist_single_default
  ON "Wishlist" ("customerId")
  WHERE "isDefault" = true;

-- One default shipping and billing address per customer.
CREATE UNIQUE INDEX customer_address_single_default_shipping
  ON "CustomerAddress" ("customerId")
  WHERE "isDefaultShipping" = true;
CREATE UNIQUE INDEX customer_address_single_default_billing
  ON "CustomerAddress" ("customerId")
  WHERE "isDefaultBilling" = true;

-- One default shipping zone per store.
CREATE UNIQUE INDEX shipping_zone_single_default
  ON "ShippingZone" ("storeId")
  WHERE "isDefault" = true;

-- A coupon code is unique per store only while the coupon is active, so a code
-- can be reused after a campaign ends.
CREATE UNIQUE INDEX coupon_active_code_unique
  ON "Coupon" ("storeId", "code")
  WHERE "isActive" = true;

-- ---------------------------------------------------------------------------
-- Stock can never go negative. This is the backstop behind the application's
-- SELECT ... FOR UPDATE: if the ordering code is ever wrong, the insert fails
-- rather than quietly overselling a one-of-a-kind piece.
-- ---------------------------------------------------------------------------
ALTER TABLE "InventoryItem"
  ADD CONSTRAINT inventory_item_non_negative
  CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "incoming" >= 0);

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT inventory_item_reorder_non_negative
  CHECK ("reorderPoint" >= 0 AND "reorderQty" >= 0);

-- A movement that changes nothing is a bug in the caller, not a valid record.
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT inventory_movement_non_zero
  CHECK ("quantityDelta" <> 0);

ALTER TABLE "StockReservation"
  ADD CONSTRAINT stock_reservation_positive
  CHECK ("quantity" > 0);

-- ---------------------------------------------------------------------------
-- Money invariants
-- ---------------------------------------------------------------------------
ALTER TABLE "Order"
  ADD CONSTRAINT order_amounts_non_negative
  CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "shippingTotal" >= 0
    AND "taxTotal" >= 0 AND "grandTotal" >= 0
    AND "amountPaid" >= 0 AND "amountRefunded" >= 0
  );

-- You cannot refund more than was taken.
ALTER TABLE "Order"
  ADD CONSTRAINT order_refund_within_paid
  CHECK ("amountRefunded" <= "amountPaid");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT order_item_quantity_positive
  CHECK ("quantity" > 0);

-- Fulfilment, return and refund counts can never exceed what was ordered.
ALTER TABLE "OrderItem"
  ADD CONSTRAINT order_item_quantities_within_ordered
  CHECK (
    "fulfilledQuantity" >= 0 AND "fulfilledQuantity" <= "quantity"
    AND "returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity"
    AND "refundedQuantity" >= 0 AND "refundedQuantity" <= "quantity"
  );

ALTER TABLE "OrderItem"
  ADD CONSTRAINT order_item_amounts_non_negative
  CHECK ("unitPrice" >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND "lineTotal" >= 0);

ALTER TABLE "CartItem"
  ADD CONSTRAINT cart_item_quantity_positive
  CHECK ("quantity" > 0);

ALTER TABLE "CartItem"
  ADD CONSTRAINT cart_item_price_non_negative
  CHECK ("unitPrice" >= 0 AND "lineTotal" >= 0);

ALTER TABLE "Refund"
  ADD CONSTRAINT refund_amount_positive
  CHECK ("amount" > 0);

ALTER TABLE "RefundItem"
  ADD CONSTRAINT refund_item_valid
  CHECK ("quantity" > 0 AND "amount" >= 0);

ALTER TABLE "ShipmentItem"
  ADD CONSTRAINT shipment_item_quantity_positive
  CHECK ("quantity" > 0);

ALTER TABLE "ReturnItem"
  ADD CONSTRAINT return_item_quantity_positive
  CHECK ("quantity" > 0);

ALTER TABLE "OrderPayment"
  ADD CONSTRAINT order_payment_amount_positive
  CHECK ("amount" > 0);

ALTER TABLE "SubscriptionPayment"
  ADD CONSTRAINT subscription_payment_amount_positive
  CHECK ("amount" > 0);

ALTER TABLE "Invoice"
  ADD CONSTRAINT invoice_amounts_non_negative
  CHECK ("subtotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0 AND "amountPaid" >= 0);

ALTER TABLE "InvoiceLine"
  ADD CONSTRAINT invoice_line_valid
  CHECK ("quantity" > 0);

-- ---------------------------------------------------------------------------
-- Pricing invariants
-- ---------------------------------------------------------------------------
ALTER TABLE "Product"
  ADD CONSTRAINT product_prices_non_negative
  CHECK (
    "price" >= 0
    AND ("costPrice" IS NULL OR "costPrice" >= 0)
    AND ("salePrice" IS NULL OR "salePrice" >= 0)
    AND ("makingCharge" IS NULL OR "makingCharge" >= 0)
  );

-- A "sale" price above the normal price is a data-entry error, not a discount.
ALTER TABLE "Product"
  ADD CONSTRAINT product_sale_price_below_price
  CHECK ("salePrice" IS NULL OR "salePrice" <= "price");

-- Metal weight cannot exceed the weight of the whole piece.
ALTER TABLE "Product"
  ADD CONSTRAINT product_weights_consistent
  CHECK (
    ("grossWeightG" IS NULL OR "grossWeightG" >= 0)
    AND ("netWeightG" IS NULL OR "netWeightG" >= 0)
    AND ("grossWeightG" IS NULL OR "netWeightG" IS NULL OR "netWeightG" <= "grossWeightG")
  );

-- Rate-based pricing is meaningless without a metal weight to multiply.
ALTER TABLE "Product"
  ADD CONSTRAINT product_rate_pricing_needs_weight
  CHECK ("pricingMode" <> 'METAL_RATE_BASED' OR ("netWeightG" IS NOT NULL AND "netWeightG" > 0));

ALTER TABLE "Product"
  ADD CONSTRAINT product_sale_window_ordered
  CHECK ("saleStartsAt" IS NULL OR "saleEndsAt" IS NULL OR "saleStartsAt" < "saleEndsAt");

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT product_variant_prices_non_negative
  CHECK (
    "price" >= 0
    AND ("salePrice" IS NULL OR ("salePrice" >= 0 AND "salePrice" <= "price"))
    AND ("costPrice" IS NULL OR "costPrice" >= 0)
  );

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT product_variant_weights_consistent
  CHECK (
    ("grossWeightG" IS NULL OR "grossWeightG" >= 0)
    AND ("netWeightG" IS NULL OR "netWeightG" >= 0)
    AND ("grossWeightG" IS NULL OR "netWeightG" IS NULL OR "netWeightG" <= "grossWeightG")
  );

ALTER TABLE "MetalRate"
  ADD CONSTRAINT metal_rate_positive
  CHECK ("ratePerGram" > 0);

ALTER TABLE "MetalRate"
  ADD CONSTRAINT metal_rate_window_ordered
  CHECK ("effectiveTo" IS NULL OR "effectiveFrom" < "effectiveTo");

ALTER TABLE "ProductGemstone"
  ADD CONSTRAINT product_gemstone_valid
  CHECK ("count" > 0 AND ("caratWeight" IS NULL OR "caratWeight" >= 0));

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------
ALTER TABLE "Coupon"
  ADD CONSTRAINT coupon_values_valid
  CHECK (
    "value" >= 0
    AND "usedCount" >= 0
    AND ("usageLimit" IS NULL OR "usageLimit" > 0)
    AND ("usageLimitPerCustomer" IS NULL OR "usageLimitPerCustomer" > 0)
    AND ("minSubtotal" IS NULL OR "minSubtotal" >= 0)
    AND ("maxDiscountAmount" IS NULL OR "maxDiscountAmount" >= 0)
  );

-- A percentage coupon above 100% would pay the customer to shop.
ALTER TABLE "Coupon"
  ADD CONSTRAINT coupon_percentage_within_bounds
  CHECK ("type" <> 'PERCENTAGE' OR "value" <= 100);

ALTER TABLE "Coupon"
  ADD CONSTRAINT coupon_window_ordered
  CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt");

ALTER TABLE "Coupon"
  ADD CONSTRAINT coupon_bxgy_quantities
  CHECK (
    "type" <> 'BUY_X_GET_Y'
    OR ("buyQuantity" IS NOT NULL AND "buyQuantity" > 0
        AND "getQuantity" IS NOT NULL AND "getQuantity" > 0)
  );

ALTER TABLE "CouponRedemption"
  ADD CONSTRAINT coupon_redemption_amount_non_negative
  CHECK ("amount" >= 0);

-- ---------------------------------------------------------------------------
-- Subscriptions and plans
-- ---------------------------------------------------------------------------
ALTER TABLE "SubscriptionPlan"
  ADD CONSTRAINT plan_prices_non_negative
  CHECK ("monthlyPrice" >= 0 AND "yearlyPrice" >= 0 AND "setupFee" >= 0 AND "trialDays" >= 0);

ALTER TABLE "PlanEntitlement"
  ADD CONSTRAINT plan_entitlement_limit_non_negative
  CHECK ("limitValue" IS NULL OR "limitValue" >= 0);

ALTER TABLE "SubscriptionOverride"
  ADD CONSTRAINT subscription_override_limit_non_negative
  CHECK ("limitValue" IS NULL OR "limitValue" >= 0);

ALTER TABLE "Subscription"
  ADD CONSTRAINT subscription_period_ordered
  CHECK ("currentPeriodStart" < "currentPeriodEnd");

ALTER TABLE "Subscription"
  ADD CONSTRAINT subscription_price_non_negative
  CHECK ("priceAmount" >= 0);

-- ---------------------------------------------------------------------------
-- Reviews and ratings
-- ---------------------------------------------------------------------------
ALTER TABLE "Review"
  ADD CONSTRAINT review_rating_range
  CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "Review"
  ADD CONSTRAINT review_helpful_non_negative
  CHECK ("helpfulCount" >= 0);

ALTER TABLE "Product"
  ADD CONSTRAINT product_rating_range
  CHECK ("ratingAverage" >= 0 AND "ratingAverage" <= 5 AND "ratingCount" >= 0);

-- ---------------------------------------------------------------------------
-- Structural sanity
-- ---------------------------------------------------------------------------

-- A category cannot be its own parent.
ALTER TABLE "Category"
  ADD CONSTRAINT category_not_own_parent
  CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- A product cannot be related to itself.
ALTER TABLE "RelatedProduct"
  ADD CONSTRAINT related_product_distinct
  CHECK ("productId" <> "relatedProductId");

-- Per-member permission overrides are ALLOW or DENY, nothing else.
ALTER TABLE "StoreMemberPermission"
  ADD CONSTRAINT store_member_permission_effect
  CHECK ("effect" IN ('ALLOW', 'DENY'));

ALTER TABLE "Store"
  ADD CONSTRAINT store_order_sequence_non_negative
  CHECK ("orderSequence" >= 0);

-- A customer record needs at least one way to reach the person.
ALTER TABLE "Customer"
  ADD CONSTRAINT customer_has_contact
  CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

-- A session belongs to a user or a customer, never both and never neither.
ALTER TABLE "Session"
  ADD CONSTRAINT session_single_principal
  CHECK (
    ("userId" IS NOT NULL AND "customerId" IS NULL)
    OR ("userId" IS NULL AND "customerId" IS NOT NULL)
  );

-- A customer session is always bound to one storefront.
ALTER TABLE "Session"
  ADD CONSTRAINT session_customer_has_store
  CHECK ("customerId" IS NULL OR "storeId" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Product search: a generated tsvector kept current by the database, so it can
-- never fall out of step with the row the way a trigger-maintained one can.
-- Weighted: name beats SKU beats description.
-- ---------------------------------------------------------------------------
ALTER TABLE "Product"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("sku", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("shortDescription", '')), 'C') ||
    setweight(to_tsvector('simple', coalesce("metalPurity", '')), 'D') ||
    setweight(to_tsvector('simple', coalesce("stoneType", '')), 'D')
  ) STORED;

CREATE INDEX product_search_vector_idx ON "Product" USING GIN ("searchVector");

-- Fuzzy matching for typos ("neklace") and partial SKUs.
CREATE INDEX product_name_trgm_idx ON "Product" USING GIN ("name" gin_trgm_ops);
CREATE INDEX product_sku_trgm_idx ON "Product" USING GIN ("sku" gin_trgm_ops);
CREATE INDEX category_name_trgm_idx ON "Category" USING GIN ("name" gin_trgm_ops);
CREATE INDEX customer_search_trgm_idx ON "Customer" USING GIN (
  (coalesce("firstName", '') || ' ' || coalesce("lastName", '') || ' ' ||
   coalesce("email", '') || ' ' || coalesce("phone", '')) gin_trgm_ops
);

-- Storefront listing hits this constantly: active products of a store, newest
-- first. A partial index keeps drafts and archived rows out of it entirely.
CREATE INDEX product_storefront_listing_idx
  ON "Product" ("storeId", "publishedAt" DESC)
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;

CREATE INDEX product_storefront_price_idx
  ON "Product" ("storeId", "price")
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;

-- Dashboard default view: open orders, newest first.
CREATE INDEX order_open_idx
  ON "Order" ("storeId", "placedAt" DESC)
  WHERE "status" IN ('PENDING', 'CONFIRMED', 'PROCESSING');

-- The reservation sweep runs every minute; it must never scan the table.
CREATE INDEX stock_reservation_expiry_idx
  ON "StockReservation" ("expiresAt")
  WHERE "status" = 'HELD';

-- Low-stock alerting.
CREATE INDEX inventory_low_stock_idx
  ON "InventoryItem" ("storeId", "onHand")
  WHERE "trackStock" = true;

-- ============================================================================
-- Row-level security — GENERATED by prisma/rls/generate.ts. DO NOT EDIT.
-- Regenerate with: pnpm db:rls
--
-- Layer 4 of the four described in docs/03-multi-tenancy.md. The application
-- also scopes every query through a Prisma client extension; this is the layer
-- that holds when that one fails.
--
-- A tenant request reaches data like this:
--     BEGIN;
--       SET LOCAL ROLE app_runtime;                -- no BYPASSRLS
--       SET LOCAL app.current_store_id = '<storeId>';
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
-- Protected: 51 store-scoped, 3 tenant-scoped,
--            19 via parent, plus Store and Tenant.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Roles. Cross-tenant reach is a property of the current role, not of a query.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_identity') THEN
    CREATE ROLE app_identity NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform') THEN
    CREATE ROLE app_platform NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- Whoever connects must be able to assume the three roles.
DO $$
BEGIN
  EXECUTE format('GRANT app_runtime, app_identity, app_platform TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not grant application roles to %: %', current_user, SQLERRM;
END $$;

GRANT USAGE ON SCHEMA public TO app_runtime, app_identity, app_platform;

-- app_platform: everything, but it has to be entered deliberately.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_platform;

-- app_runtime: everything except the session tables, read-only on catalogues.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
REVOKE ALL ON "Session", "VerificationToken" FROM app_runtime;
REVOKE INSERT, UPDATE, DELETE ON "User", "Role", "Permission", "RolePermission", "PlatformRoleAssignment", "Theme", "SubscriptionPlan", "PlanEntitlement", "PlatformSetting", "PlatformDailyStat", "WebhookEvent" FROM app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- app_identity: only what is needed before a tenant context exists.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_identity;
GRANT SELECT, INSERT, UPDATE, DELETE ON "User", "Session", "VerificationToken", "Role", "Permission", "RolePermission", "PlatformRoleAssignment", "StoreMember", "StoreMemberPermission", "ApiKey", "Store", "StoreDomain", "StoreSettings", "Tenant", "Subscription", "SubscriptionPlan", "PlanEntitlement", "SubscriptionOverride", "Customer" TO app_identity;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_identity;

-- Tables added by later migrations inherit the runtime and platform grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime, app_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime, app_identity, app_platform;


-- ---------------------------------------------------------------------------
-- Store-scoped (51)
-- ---------------------------------------------------------------------------

ALTER TABLE "ActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_log_isolation ON "ActivityLog";
CREATE POLICY activity_log_isolation ON "ActivityLog"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "AiGenerationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiGenerationLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_generation_log_isolation ON "AiGenerationLog";
CREATE POLICY ai_generation_log_isolation ON "AiGenerationLog"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "AiSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiSetting" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_setting_isolation ON "AiSetting";
CREATE POLICY ai_setting_isolation ON "AiSetting"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_key_isolation ON "ApiKey";
CREATE POLICY api_key_isolation ON "ApiKey"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "AttributeDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttributeDefinition" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attribute_definition_isolation ON "AttributeDefinition";
CREATE POLICY attribute_definition_isolation ON "AttributeDefinition"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Banner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Banner" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS banner_isolation ON "Banner";
CREATE POLICY banner_isolation ON "Banner"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brand" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_isolation ON "Brand";
CREATE POLICY brand_isolation ON "Brand"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Carrier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Carrier" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carrier_isolation ON "Carrier";
CREATE POLICY carrier_isolation ON "Carrier"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Cart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cart" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cart_isolation ON "Cart";
CREATE POLICY cart_isolation ON "Cart"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "CartItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CartItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cart_item_isolation ON "CartItem";
CREATE POLICY cart_item_isolation ON "CartItem"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS category_isolation ON "Category";
CREATE POLICY category_isolation ON "Category"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Collection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Collection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collection_isolation ON "Collection";
CREATE POLICY collection_isolation ON "Collection"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Coupon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Coupon" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupon_isolation ON "Coupon";
CREATE POLICY coupon_isolation ON "Coupon"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "CouponRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouponRedemption" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupon_redemption_isolation ON "CouponRedemption";
CREATE POLICY coupon_redemption_isolation ON "CouponRedemption"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_isolation ON "Customer";
CREATE POLICY customer_isolation ON "Customer"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "CustomerAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAddress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_address_isolation ON "CustomerAddress";
CREATE POLICY customer_address_isolation ON "CustomerAddress"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_item_isolation ON "InventoryItem";
CREATE POLICY inventory_item_isolation ON "InventoryItem"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "InventoryLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryLocation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_location_isolation ON "InventoryLocation";
CREATE POLICY inventory_location_isolation ON "InventoryLocation"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryMovement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_movement_isolation ON "InventoryMovement";
CREATE POLICY inventory_movement_isolation ON "InventoryMovement"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "MetalRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MetalRate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS metal_rate_isolation ON "MetalRate";
CREATE POLICY metal_rate_isolation ON "MetalRate"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_isolation ON "Notification";
CREATE POLICY notification_isolation ON "Notification"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_isolation ON "Order";
CREATE POLICY order_isolation ON "Order"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_item_isolation ON "OrderItem";
CREATE POLICY order_item_isolation ON "OrderItem"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "OrderPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderPayment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_payment_isolation ON "OrderPayment";
CREATE POLICY order_payment_isolation ON "OrderPayment"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "OrderStatusHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderStatusHistory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_status_history_isolation ON "OrderStatusHistory";
CREATE POLICY order_status_history_isolation ON "OrderStatusHistory"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "OutboundMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboundMessage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbound_message_isolation ON "OutboundMessage";
CREATE POLICY outbound_message_isolation ON "OutboundMessage"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_isolation ON "Product";
CREATE POLICY product_isolation ON "Product"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "ProductAttributeValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductAttributeValue" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_attribute_value_isolation ON "ProductAttributeValue";
CREATE POLICY product_attribute_value_isolation ON "ProductAttributeValue"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "ProductMedia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductMedia" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_media_isolation ON "ProductMedia";
CREATE POLICY product_media_isolation ON "ProductMedia"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_variant_isolation ON "ProductVariant";
CREATE POLICY product_variant_isolation ON "ProductVariant"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "PurchaseOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_order_isolation ON "PurchaseOrder";
CREATE POLICY purchase_order_isolation ON "PurchaseOrder"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "RecentlyViewed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecentlyViewed" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recently_viewed_isolation ON "RecentlyViewed";
CREATE POLICY recently_viewed_isolation ON "RecentlyViewed"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refund_isolation ON "Refund";
CREATE POLICY refund_isolation ON "Refund"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "ReturnRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReturnRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS return_request_isolation ON "ReturnRequest";
CREATE POLICY return_request_isolation ON "ReturnRequest"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_isolation ON "Review";
CREATE POLICY review_isolation ON "Review"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Shipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Shipment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipment_isolation ON "Shipment";
CREATE POLICY shipment_isolation ON "Shipment"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "ShippingRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShippingRate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipping_rate_isolation ON "ShippingRate";
CREATE POLICY shipping_rate_isolation ON "ShippingRate"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "ShippingZone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShippingZone" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipping_zone_isolation ON "ShippingZone";
CREATE POLICY shipping_zone_isolation ON "ShippingZone"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "StockReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockReservation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_reservation_isolation ON "StockReservation";
CREATE POLICY stock_reservation_isolation ON "StockReservation"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "StoreDailyStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreDailyStat" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_daily_stat_isolation ON "StoreDailyStat";
CREATE POLICY store_daily_stat_isolation ON "StoreDailyStat"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "StoreDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreDomain" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_domain_isolation ON "StoreDomain";
CREATE POLICY store_domain_isolation ON "StoreDomain"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "StoreMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreMember" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_member_isolation ON "StoreMember";
CREATE POLICY store_member_isolation ON "StoreMember"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "StorePage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorePage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_page_isolation ON "StorePage";
CREATE POLICY store_page_isolation ON "StorePage"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "StorePageSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorePageSection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_page_section_isolation ON "StorePageSection";
CREATE POLICY store_page_section_isolation ON "StorePageSection"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "StorePaymentMethod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorePaymentMethod" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_payment_method_isolation ON "StorePaymentMethod";
CREATE POLICY store_payment_method_isolation ON "StorePaymentMethod"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "StoreSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreSettings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_settings_isolation ON "StoreSettings";
CREATE POLICY store_settings_isolation ON "StoreSettings"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "StoreTheme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreTheme" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_theme_isolation ON "StoreTheme";
CREATE POLICY store_theme_isolation ON "StoreTheme"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_isolation ON "Supplier";
CREATE POLICY supplier_isolation ON "Supplier"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_ticket_isolation ON "SupportTicket";
CREATE POLICY support_ticket_isolation ON "SupportTicket"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "TryOnAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TryOnAsset" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS try_on_asset_isolation ON "TryOnAsset";
CREATE POLICY try_on_asset_isolation ON "TryOnAsset"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

ALTER TABLE "Wishlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wishlist" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wishlist_isolation ON "Wishlist";
CREATE POLICY wishlist_isolation ON "Wishlist"
  USING ("storeId" = current_setting('app.current_store_id', true))
  WITH CHECK ("storeId" = current_setting('app.current_store_id', true));

-- ---------------------------------------------------------------------------
-- Tenant-scoped (3)
-- ---------------------------------------------------------------------------

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_isolation ON "Invoice";
CREATE POLICY invoice_isolation ON "Invoice"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_isolation ON "Subscription";
CREATE POLICY subscription_isolation ON "Subscription"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "SubscriptionPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionPayment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_payment_isolation ON "SubscriptionPayment";
CREATE POLICY subscription_payment_isolation ON "SubscriptionPayment"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- ---------------------------------------------------------------------------
-- Roots
-- ---------------------------------------------------------------------------

-- The Store row: addressable by its own id (storefront and dashboard) or by its
-- owning tenant (billing screens, which run with tenant context set).
ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_isolation ON "Store";
CREATE POLICY store_isolation ON "Store"
  USING (
    "id" = current_setting('app.current_store_id', true)
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  )
  WITH CHECK (
    "id" = current_setting('app.current_store_id', true)
    OR "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- The Tenant row.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
CREATE POLICY tenant_isolation ON "Tenant"
  USING ("id" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("id" = current_setting('app.current_tenant_id', true));

-- ---------------------------------------------------------------------------
-- Isolated through their parent (19)
-- ---------------------------------------------------------------------------

ALTER TABLE "CollectionProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CollectionProduct" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collection_product_isolation ON "CollectionProduct";
CREATE POLICY collection_product_isolation ON "CollectionProduct"
  USING (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "CollectionProduct"."productId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "CollectionProduct"."productId"));

ALTER TABLE "CouponCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouponCategory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupon_category_isolation ON "CouponCategory";
CREATE POLICY coupon_category_isolation ON "CouponCategory"
  USING (EXISTS (SELECT 1 FROM "Coupon" p WHERE p."id" = "CouponCategory"."couponId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Coupon" p WHERE p."id" = "CouponCategory"."couponId"));

ALTER TABLE "CouponProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouponProduct" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupon_product_isolation ON "CouponProduct";
CREATE POLICY coupon_product_isolation ON "CouponProduct"
  USING (EXISTS (SELECT 1 FROM "Coupon" p WHERE p."id" = "CouponProduct"."couponId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Coupon" p WHERE p."id" = "CouponProduct"."couponId"));

ALTER TABLE "InvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_line_isolation ON "InvoiceLine";
CREATE POLICY invoice_line_isolation ON "InvoiceLine"
  USING (EXISTS (SELECT 1 FROM "Invoice" p WHERE p."id" = "InvoiceLine"."invoiceId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Invoice" p WHERE p."id" = "InvoiceLine"."invoiceId"));

ALTER TABLE "ProductCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductCategory" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_category_isolation ON "ProductCategory";
CREATE POLICY product_category_isolation ON "ProductCategory"
  USING (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductCategory"."productId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductCategory"."productId"));

ALTER TABLE "ProductGemstone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductGemstone" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_gemstone_isolation ON "ProductGemstone";
CREATE POLICY product_gemstone_isolation ON "ProductGemstone"
  USING (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductGemstone"."productId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductGemstone"."productId"));

ALTER TABLE "ProductOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductOption" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_option_isolation ON "ProductOption";
CREATE POLICY product_option_isolation ON "ProductOption"
  USING (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductOption"."productId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "ProductOption"."productId"));

ALTER TABLE "ProductOptionValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductOptionValue" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_option_value_isolation ON "ProductOptionValue";
CREATE POLICY product_option_value_isolation ON "ProductOptionValue"
  USING (EXISTS (SELECT 1 FROM "ProductOption" p WHERE p."id" = "ProductOptionValue"."optionId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "ProductOption" p WHERE p."id" = "ProductOptionValue"."optionId"));

ALTER TABLE "PurchaseOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrderItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_order_item_isolation ON "PurchaseOrderItem";
CREATE POLICY purchase_order_item_isolation ON "PurchaseOrderItem"
  USING (EXISTS (SELECT 1 FROM "PurchaseOrder" p WHERE p."id" = "PurchaseOrderItem"."purchaseOrderId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "PurchaseOrder" p WHERE p."id" = "PurchaseOrderItem"."purchaseOrderId"));

ALTER TABLE "RefundItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefundItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refund_item_isolation ON "RefundItem";
CREATE POLICY refund_item_isolation ON "RefundItem"
  USING (EXISTS (SELECT 1 FROM "Refund" p WHERE p."id" = "RefundItem"."refundId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Refund" p WHERE p."id" = "RefundItem"."refundId"));

ALTER TABLE "RelatedProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RelatedProduct" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS related_product_isolation ON "RelatedProduct";
CREATE POLICY related_product_isolation ON "RelatedProduct"
  USING (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "RelatedProduct"."productId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "RelatedProduct"."productId"));

ALTER TABLE "ReturnItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReturnItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS return_item_isolation ON "ReturnItem";
CREATE POLICY return_item_isolation ON "ReturnItem"
  USING (EXISTS (SELECT 1 FROM "ReturnRequest" p WHERE p."id" = "ReturnItem"."returnId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "ReturnRequest" p WHERE p."id" = "ReturnItem"."returnId"));

ALTER TABLE "ShipmentItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShipmentItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipment_item_isolation ON "ShipmentItem";
CREATE POLICY shipment_item_isolation ON "ShipmentItem"
  USING (EXISTS (SELECT 1 FROM "Shipment" p WHERE p."id" = "ShipmentItem"."shipmentId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Shipment" p WHERE p."id" = "ShipmentItem"."shipmentId"));

ALTER TABLE "StoreMemberPermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreMemberPermission" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_member_permission_isolation ON "StoreMemberPermission";
CREATE POLICY store_member_permission_isolation ON "StoreMemberPermission"
  USING (EXISTS (SELECT 1 FROM "StoreMember" p WHERE p."id" = "StoreMemberPermission"."storeMemberId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "StoreMember" p WHERE p."id" = "StoreMemberPermission"."storeMemberId"));

ALTER TABLE "SubscriptionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_event_isolation ON "SubscriptionEvent";
CREATE POLICY subscription_event_isolation ON "SubscriptionEvent"
  USING (EXISTS (SELECT 1 FROM "Subscription" p WHERE p."id" = "SubscriptionEvent"."subscriptionId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Subscription" p WHERE p."id" = "SubscriptionEvent"."subscriptionId"));

ALTER TABLE "SubscriptionOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionOverride" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_override_isolation ON "SubscriptionOverride";
CREATE POLICY subscription_override_isolation ON "SubscriptionOverride"
  USING (EXISTS (SELECT 1 FROM "Subscription" p WHERE p."id" = "SubscriptionOverride"."subscriptionId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Subscription" p WHERE p."id" = "SubscriptionOverride"."subscriptionId"));

ALTER TABLE "SupportMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportMessage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_message_isolation ON "SupportMessage";
CREATE POLICY support_message_isolation ON "SupportMessage"
  USING (EXISTS (SELECT 1 FROM "SupportTicket" p WHERE p."id" = "SupportMessage"."ticketId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "SupportTicket" p WHERE p."id" = "SupportMessage"."ticketId"));

ALTER TABLE "VariantOptionValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VariantOptionValue" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS variant_option_value_isolation ON "VariantOptionValue";
CREATE POLICY variant_option_value_isolation ON "VariantOptionValue"
  USING (EXISTS (SELECT 1 FROM "ProductVariant" p WHERE p."id" = "VariantOptionValue"."variantId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "ProductVariant" p WHERE p."id" = "VariantOptionValue"."variantId"));

ALTER TABLE "WishlistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WishlistItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wishlist_item_isolation ON "WishlistItem";
CREATE POLICY wishlist_item_isolation ON "WishlistItem"
  USING (EXISTS (SELECT 1 FROM "Wishlist" p WHERE p."id" = "WishlistItem"."wishlistId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Wishlist" p WHERE p."id" = "WishlistItem"."wishlistId"));

-- ---------------------------------------------------------------------------
-- No policy, by decision (13):
--   User                     one login may work for several stores; scoped by membership, not by row
--   Session                  must be readable before any tenant context exists (login, refresh)
--   VerificationToken        consumed before the user has a store context
--   Role                     platform catalogue, identical for every tenant
--   Permission               platform catalogue
--   RolePermission           platform catalogue
--   PlatformRoleAssignment   grants platform roles; no tenant dimension
--   Theme                    platform catalogue of storefront themes
--   SubscriptionPlan         public pricing catalogue
--   PlanEntitlement          child of the public plan catalogue
--   PlatformSetting          platform configuration
--   PlatformDailyStat        platform-wide rollup, no tenant dimension
--   WebhookEvent             raw provider callbacks, captured before the store is resolved
-- ---------------------------------------------------------------------------

