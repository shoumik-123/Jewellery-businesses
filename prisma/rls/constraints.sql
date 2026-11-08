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
