/** Platform-wide constants shared by the API, the worker and the web app. */

// ---------------------------------------------------------------------------
// Permissions — the authoritative catalogue. Seeded into the database and used
// by @RequirePermission on the API and by `can()` in the UI.
// ---------------------------------------------------------------------------

export const STORE_PERMISSIONS = {
  // Catalogue
  PRODUCT_READ: 'product:read',
  PRODUCT_WRITE: 'product:write',
  CATEGORY_WRITE: 'category:write',
  // Inventory
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  // Orders
  ORDER_READ: 'order:read',
  ORDER_WRITE: 'order:write',
  ORDER_FULFIL: 'order:fulfil',
  ORDER_CANCEL: 'order:cancel',
  ORDER_REFUND: 'order:refund',
  ORDER_RETURN: 'order:return',
  // Customers
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_WRITE: 'customer:write',
  // Marketing
  COUPON_READ: 'coupon:read',
  COUPON_WRITE: 'coupon:write',
  REVIEW_READ: 'review:read',
  REVIEW_MODERATE: 'review:moderate',
  // Storefront
  STOREFRONT_WRITE: 'storefront:write',
  // Insights
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
  // Store
  STORE_READ: 'store:read',
  STORE_SETTINGS: 'store:settings',
  STORE_PAYMENTS: 'store:payments',
  STORE_BILLING: 'store:billing',
  // People
  STAFF_READ: 'staff:read',
  STAFF_WRITE: 'staff:write',
} as const;

export const PLATFORM_PERMISSIONS = {
  STORE_READ: 'platform:store:read',
  STORE_WRITE: 'platform:store:write',
  STORE_IMPERSONATE: 'platform:store:impersonate',
  PLAN_WRITE: 'platform:plan:write',
  SUBSCRIPTION_READ: 'platform:subscription:read',
  SUBSCRIPTION_WRITE: 'platform:subscription:write',
  BILLING_READ: 'platform:billing:read',
  BILLING_WRITE: 'platform:billing:write',
  USER_WRITE: 'platform:user:write',
  SETTINGS_WRITE: 'platform:settings:write',
  THEME_WRITE: 'platform:theme:write',
  SUPPORT_READ: 'platform:support:read',
  SUPPORT_WRITE: 'platform:support:write',
  ANALYTICS_READ: 'platform:analytics:read',
  AUDIT_READ: 'platform:audit:read',
} as const;

export type StorePermission = (typeof STORE_PERMISSIONS)[keyof typeof STORE_PERMISSIONS];
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];
export type Permission = StorePermission | PlatformPermission;

export const ALL_STORE_PERMISSIONS: readonly StorePermission[] = Object.values(STORE_PERMISSIONS);
export const ALL_PLATFORM_PERMISSIONS: readonly PlatformPermission[] =
  Object.values(PLATFORM_PERMISSIONS);

/** UI grouping for the permission matrix. Order is the display order. */
export const PERMISSION_GROUPS: ReadonlyArray<{
  group: string;
  permissions: readonly StorePermission[];
}> = [
  {
    group: 'Catalogue',
    permissions: [
      STORE_PERMISSIONS.PRODUCT_READ,
      STORE_PERMISSIONS.PRODUCT_WRITE,
      STORE_PERMISSIONS.CATEGORY_WRITE,
    ],
  },
  {
    group: 'Inventory',
    permissions: [STORE_PERMISSIONS.INVENTORY_READ, STORE_PERMISSIONS.INVENTORY_WRITE],
  },
  {
    group: 'Orders',
    permissions: [
      STORE_PERMISSIONS.ORDER_READ,
      STORE_PERMISSIONS.ORDER_WRITE,
      STORE_PERMISSIONS.ORDER_FULFIL,
      STORE_PERMISSIONS.ORDER_CANCEL,
      STORE_PERMISSIONS.ORDER_REFUND,
      STORE_PERMISSIONS.ORDER_RETURN,
    ],
  },
  {
    group: 'Customers',
    permissions: [STORE_PERMISSIONS.CUSTOMER_READ, STORE_PERMISSIONS.CUSTOMER_WRITE],
  },
  {
    group: 'Marketing',
    permissions: [
      STORE_PERMISSIONS.COUPON_READ,
      STORE_PERMISSIONS.COUPON_WRITE,
      STORE_PERMISSIONS.REVIEW_READ,
      STORE_PERMISSIONS.REVIEW_MODERATE,
    ],
  },
  { group: 'Storefront', permissions: [STORE_PERMISSIONS.STOREFRONT_WRITE] },
  {
    group: 'Insights',
    permissions: [STORE_PERMISSIONS.ANALYTICS_READ, STORE_PERMISSIONS.AUDIT_READ],
  },
  {
    group: 'Store',
    permissions: [
      STORE_PERMISSIONS.STORE_READ,
      STORE_PERMISSIONS.STORE_SETTINGS,
      STORE_PERMISSIONS.STORE_PAYMENTS,
      STORE_PERMISSIONS.STORE_BILLING,
    ],
  },
  { group: 'People', permissions: [STORE_PERMISSIONS.STAFF_READ, STORE_PERMISSIONS.STAFF_WRITE] },
];

// ---------------------------------------------------------------------------
// System roles
// ---------------------------------------------------------------------------

export const ROLE_KEYS = {
  SUPER_ADMIN: 'super_admin',
  SUPPORT_AGENT: 'support_agent',
  STORE_OWNER: 'store_owner',
  STORE_MANAGER: 'store_manager',
  CATALOGUE_STAFF: 'catalogue_staff',
  FULFILMENT_STAFF: 'fulfilment_staff',
  SUPPORT_STAFF: 'support_staff',
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

const P = STORE_PERMISSIONS;

/** What each system role grants. Owners are handled separately: they hold everything. */
export const SYSTEM_ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly Permission[]>> = {
  [ROLE_KEYS.SUPER_ADMIN]: ALL_PLATFORM_PERMISSIONS,
  [ROLE_KEYS.SUPPORT_AGENT]: [
    PLATFORM_PERMISSIONS.STORE_READ,
    PLATFORM_PERMISSIONS.SUBSCRIPTION_READ,
    PLATFORM_PERMISSIONS.BILLING_READ,
    PLATFORM_PERMISSIONS.SUPPORT_READ,
    PLATFORM_PERMISSIONS.SUPPORT_WRITE,
    PLATFORM_PERMISSIONS.ANALYTICS_READ,
  ],
  [ROLE_KEYS.STORE_OWNER]: ALL_STORE_PERMISSIONS,
  [ROLE_KEYS.STORE_MANAGER]: ALL_STORE_PERMISSIONS.filter(
    (p) => p !== P.STORE_BILLING && p !== P.STAFF_WRITE && p !== P.STORE_PAYMENTS,
  ),
  [ROLE_KEYS.CATALOGUE_STAFF]: [
    P.STORE_READ,
    P.PRODUCT_READ,
    P.PRODUCT_WRITE,
    P.CATEGORY_WRITE,
    P.INVENTORY_READ,
    P.INVENTORY_WRITE,
  ],
  [ROLE_KEYS.FULFILMENT_STAFF]: [
    P.STORE_READ,
    P.ORDER_READ,
    P.ORDER_WRITE,
    P.ORDER_FULFIL,
    P.INVENTORY_READ,
    P.PRODUCT_READ,
  ],
  [ROLE_KEYS.SUPPORT_STAFF]: [
    P.STORE_READ,
    P.ORDER_READ,
    P.CUSTOMER_READ,
    P.CUSTOMER_WRITE,
    P.REVIEW_READ,
    P.REVIEW_MODERATE,
  ],
};

// ---------------------------------------------------------------------------
// Entitlements — plan limits and feature switches. Values live in the database
// so Super Admin can change them; the keys are code because guards reference them.
// ---------------------------------------------------------------------------

export const ENTITLEMENTS = {
  // Limits
  MAX_PRODUCTS: 'max_products',
  MAX_VARIANTS_PER_PRODUCT: 'max_variants_per_product',
  MAX_STAFF: 'max_staff',
  MAX_CATEGORIES: 'max_categories',
  MAX_LOCATIONS: 'max_locations',
  MAX_IMAGES_PER_PRODUCT: 'max_images_per_product',
  MAX_COUPONS: 'max_coupons',
  MAX_MONTHLY_ORDERS: 'max_monthly_orders',
  // Features
  CUSTOM_DOMAIN: 'custom_domain',
  STAFF_ACCOUNTS: 'staff_accounts',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  ADVANCED_REPORTS: 'advanced_reports',
  COUPONS: 'coupons',
  INVENTORY_MANAGEMENT: 'inventory_management',
  PURCHASE_ORDERS: 'purchase_orders',
  STOREFRONT_CUSTOM_CSS: 'storefront_custom_css',
  METAL_RATE_PRICING: 'metal_rate_pricing',
  MULTI_LOCATION: 'multi_location',
  PRIORITY_SUPPORT: 'priority_support',
  AI_DESCRIPTIONS: 'ai_descriptions',
  AI_RECOMMENDATIONS: 'ai_recommendations',
  VIRTUAL_TRY_ON: 'virtual_try_on',
  REMOVE_PLATFORM_BRANDING: 'remove_platform_branding',
  API_ACCESS: 'api_access',
} as const;

export type EntitlementKey = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];

export const LIMIT_ENTITLEMENTS: readonly EntitlementKey[] = [
  ENTITLEMENTS.MAX_PRODUCTS,
  ENTITLEMENTS.MAX_VARIANTS_PER_PRODUCT,
  ENTITLEMENTS.MAX_STAFF,
  ENTITLEMENTS.MAX_CATEGORIES,
  ENTITLEMENTS.MAX_LOCATIONS,
  ENTITLEMENTS.MAX_IMAGES_PER_PRODUCT,
  ENTITLEMENTS.MAX_COUPONS,
  ENTITLEMENTS.MAX_MONTHLY_ORDERS,
];

export const FEATURE_ENTITLEMENTS: readonly EntitlementKey[] = (
  Object.values(ENTITLEMENTS) as EntitlementKey[]
).filter((k) => !LIMIT_ENTITLEMENTS.includes(k));

/** Human labels for the pricing page and the usage meters. */
export const ENTITLEMENT_LABELS: Readonly<Record<EntitlementKey, string>> = {
  max_products: 'Products',
  max_variants_per_product: 'Variants per product',
  max_staff: 'Staff accounts',
  max_categories: 'Categories',
  max_locations: 'Inventory locations',
  max_images_per_product: 'Images per product',
  max_coupons: 'Active coupons',
  max_monthly_orders: 'Orders per month',
  custom_domain: 'Custom domain',
  staff_accounts: 'Staff accounts',
  advanced_analytics: 'Advanced analytics',
  advanced_reports: 'Advanced reports',
  coupons: 'Coupons and discounts',
  inventory_management: 'Inventory management',
  purchase_orders: 'Suppliers and purchase orders',
  storefront_custom_css: 'Custom CSS',
  metal_rate_pricing: 'Daily metal-rate pricing',
  multi_location: 'Multiple locations',
  priority_support: 'Priority support',
  ai_descriptions: 'AI product descriptions',
  ai_recommendations: 'AI recommendations',
  virtual_try_on: 'Virtual try-on',
  remove_platform_branding: 'Remove JewelleryHub branding',
  api_access: 'API access',
};

// ---------------------------------------------------------------------------
// Reserved store slugs — anything that would collide with a platform host or
// look official enough to phish with.
// ---------------------------------------------------------------------------

export const RESERVED_SLUGS: readonly string[] = [
  'www',
  'app',
  'admin',
  'api',
  'cdn',
  'static',
  'assets',
  'img',
  'images',
  'media',
  'mail',
  'email',
  'smtp',
  'ftp',
  'blog',
  'help',
  'support',
  'docs',
  'status',
  'dashboard',
  'account',
  'accounts',
  'billing',
  'checkout',
  'cart',
  'login',
  'logout',
  'signup',
  'register',
  'auth',
  'oauth',
  'my',
  'me',
  'shop',
  'store',
  'stores',
  'jewelleryhub',
  'jewellery-hub',
  'official',
  'secure',
  'security',
  'payment',
  'payments',
  'pay',
  'invoice',
  'test',
  'demo',
  'staging',
  'dev',
  'preview',
  'internal',
  'root',
  'system',
  'null',
  'undefined',
];

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Operational defaults
// ---------------------------------------------------------------------------

export const DEFAULTS = {
  CURRENCY: 'BDT',
  CURRENCY_SYMBOL: 'Tk',
  COUNTRY: 'BD',
  TIMEZONE: 'Asia/Dhaka',
  LOCALE: 'en',
  WEIGHT_UNIT: 'g',
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  LOW_STOCK_THRESHOLD: 3,
  RESERVATION_TTL_MINUTES: 30,
  ORDER_NUMBER_PREFIX: 'ORD',
  ORDER_SEQUENCE_START: 1000,
  TRIAL_DAYS: 14,
  BILLING_GRACE_DAYS: 7,
} as const;

/** Storefront section types. The registry in packages/storefront-themes implements these. */
export const SECTION_TYPES = [
  'hero',
  'featuredProducts',
  'collectionGrid',
  'categoryStrip',
  'banner',
  'productSpotlight',
  'richText',
  'testimonials',
  'newsletter',
  'instagramStrip',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];
