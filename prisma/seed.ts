/**
 * Seeds the platform.
 *
 * Two layers:
 *   1. Reference data every environment needs: the permission catalogue, the
 *      system roles, the subscription plans with their entitlements, the theme
 *      catalogue, and one Super Admin taken from the environment.
 *   2. Demo data, only when SEED_DEMO_DATA=true, and never in production.
 *
 * Idempotent: safe to run repeatedly. Reference data is upserted by its stable
 * key, so re-running after adding a permission adds just that permission.
 *
 * Runs as the migration owner (DIRECT_DATABASE_URL), which bypasses row-level
 * security — that is intended here and nowhere else.
 *
 *   pnpm db:seed
 */
import 'dotenv/config';
import {
  ALL_PLATFORM_PERMISSIONS,
  ALL_STORE_PERMISSIONS,
  DEFAULTS,
  ENTITLEMENTS,
  PERMISSION_GROUPS,
  PLATFORM_PERMISSIONS,
  ROLE_KEYS,
  SYSTEM_ROLE_PERMISSIONS,
  type EntitlementKey,
  type Permission,
} from '@jh/shared';
import { hashPassword } from '@jh/security';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../packages/db/src/generated/prisma/client.ts';
import { seedDemoData } from './seed-demo.ts';

const connectionString = process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DIRECT_DATABASE_URL or DATABASE_URL must be set to seed.');
}

const pool = new Pool({ connectionString, max: 5 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ---------------------------------------------------------------------------
// Permission catalogue
// ---------------------------------------------------------------------------

/** Readable descriptions, so the staff permission matrix is self-explanatory. */
const PERMISSION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'product:read': 'View products and their details',
  'product:write': 'Create, edit, archive and delete products',
  'category:write': 'Manage categories, brands and collections',
  'inventory:read': 'View stock levels and movement history',
  'inventory:write': 'Adjust stock, manage suppliers and purchase orders',
  'order:read': 'View orders and customer order history',
  'order:write': 'Create and edit orders, move them through the pipeline',
  'order:fulfil': 'Create shipments and mark orders delivered',
  'order:cancel': 'Cancel orders and release reserved stock',
  'order:refund': 'Issue refunds',
  'order:return': 'Approve and process returns',
  'customer:read': 'View customers and their details',
  'customer:write': 'Edit, tag, block and erase customers',
  'coupon:read': 'View coupons and redemptions',
  'coupon:write': 'Create and manage coupons',
  'review:read': 'View product reviews',
  'review:moderate': 'Approve, reject and reply to reviews',
  'storefront:write': 'Customise the storefront, pages, sections and banners',
  'analytics:read': 'View analytics and reports',
  'audit:read': "View the store's activity log",
  'store:read': 'View store details',
  'store:settings': 'Change store settings and domains',
  'store:payments': 'Configure payment methods and credentials',
  'store:billing': 'Manage the subscription and see invoices',
  'staff:read': 'View staff members and their roles',
  'staff:write': 'Invite staff, assign roles and change permissions',
  'platform:store:read': 'View any store on the platform',
  'platform:store:write': 'Suspend, reactivate and edit any store',
  'platform:store:impersonate': 'Sign in as a store owner for support',
  'platform:plan:write': 'Create and edit subscription plans and limits',
  'platform:subscription:read': 'View all subscriptions',
  'platform:subscription:write': 'Change plans, extend trials, set overrides',
  'platform:billing:read': 'View platform invoices and payments',
  'platform:billing:write': 'Void invoices and record manual payments',
  'platform:user:write': 'Manage platform users and platform roles',
  'platform:settings:write': 'Change platform settings',
  'platform:theme:write': 'Manage the storefront theme catalogue',
  'platform:support:read': 'View support tickets',
  'platform:support:write': 'Reply to and resolve support tickets',
  'platform:analytics:read': 'View platform-wide analytics',
  'platform:audit:read': 'View the platform activity log',
};

function groupOf(permission: string): string {
  const found = PERMISSION_GROUPS.find((g) =>
    (g.permissions as readonly string[]).includes(permission),
  );
  if (found) return found.group;
  return permission.startsWith('platform:') ? 'Platform' : 'Other';
}

async function seedPermissions(): Promise<void> {
  const all: Permission[] = [...ALL_STORE_PERMISSIONS, ...ALL_PLATFORM_PERMISSIONS];

  for (const key of all) {
    const scope = key.startsWith('platform:') ? 'PLATFORM' : 'STORE';
    await prisma.permission.upsert({
      where: { key },
      create: {
        key,
        group: groupOf(key),
        scope,
        description: PERMISSION_DESCRIPTIONS[key] ?? key,
      },
      update: {
        group: groupOf(key),
        scope,
        description: PERMISSION_DESCRIPTIONS[key] ?? key,
      },
    });
  }
  console.warn(`  permissions: ${all.length}`);
}

// ---------------------------------------------------------------------------
// System roles
// ---------------------------------------------------------------------------

const ROLE_META: Readonly<
  Record<
    string,
    { name: string; description: string; scope: 'PLATFORM' | 'STORE'; position: number }
  >
> = {
  [ROLE_KEYS.SUPER_ADMIN]: {
    name: 'Super Admin',
    description: 'Full control of the platform',
    scope: 'PLATFORM',
    position: 0,
  },
  [ROLE_KEYS.SUPPORT_AGENT]: {
    name: 'Support Agent',
    description: 'Read-mostly platform access plus the support queue',
    scope: 'PLATFORM',
    position: 1,
  },
  [ROLE_KEYS.STORE_OWNER]: {
    name: 'Store Owner',
    description: 'Full control of one store, including billing',
    scope: 'STORE',
    position: 0,
  },
  [ROLE_KEYS.STORE_MANAGER]: {
    name: 'Manager',
    description: 'Runs the store day to day, without billing, payments or staff',
    scope: 'STORE',
    position: 1,
  },
  [ROLE_KEYS.CATALOGUE_STAFF]: {
    name: 'Catalogue Staff',
    description: 'Products, categories and stock',
    scope: 'STORE',
    position: 2,
  },
  [ROLE_KEYS.FULFILMENT_STAFF]: {
    name: 'Fulfilment Staff',
    description: 'Packs and ships orders',
    scope: 'STORE',
    position: 3,
  },
  [ROLE_KEYS.SUPPORT_STAFF]: {
    name: 'Customer Support',
    description: 'Answers customers, moderates reviews',
    scope: 'STORE',
    position: 4,
  },
};

async function seedRoles(): Promise<void> {
  for (const [key, permissions] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
    const meta = ROLE_META[key];
    if (!meta) throw new Error(`No metadata for role ${key}`);

    const role = await prisma.role.upsert({
      where: { key },
      create: {
        key,
        name: meta.name,
        description: meta.description,
        scope: meta.scope,
        isSystem: true,
        position: meta.position,
      },
      update: {
        name: meta.name,
        description: meta.description,
        scope: meta.scope,
        isSystem: true,
        position: meta.position,
      },
    });

    const permissionRows = await prisma.permission.findMany({
      where: { key: { in: [...permissions] } },
      select: { id: true },
    });

    // Replace the grant set so removing a permission from code removes it here.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });

    console.warn(`  role ${key}: ${permissionRows.length} permissions`);
  }
}

// ---------------------------------------------------------------------------
// Subscription plans
//
// Prices are the proposal in README.md. They are data, so Super Admin can
// change them without a deployment; these are only the starting values.
// ---------------------------------------------------------------------------

type Entitlements = Partial<Record<EntitlementKey, number | boolean | null>>;

interface PlanSeed {
  key: string;
  name: string;
  tier: 'STARTER' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE';
  description: string;
  monthlyPrice: string;
  yearlyPrice: string;
  trialDays: number;
  isPublic: boolean;
  isMostPopular: boolean;
  position: number;
  bullets: string[];
  entitlements: Entitlements;
}

const E = ENTITLEMENTS;

const PLANS: PlanSeed[] = [
  {
    key: 'starter',
    name: 'Starter',
    tier: 'STARTER',
    description: 'Open your first online jewellery store.',
    monthlyPrice: '1500.00',
    yearlyPrice: '15000.00', // two months free
    trialDays: 14,
    isPublic: true,
    isMostPopular: false,
    position: 0,
    bullets: [
      'Up to 100 products',
      'Your own storefront on a jewelleryhub.com address',
      'Cash on delivery and online payments',
      'Order and customer management',
      'Email support',
    ],
    entitlements: {
      [E.MAX_PRODUCTS]: 100,
      [E.MAX_VARIANTS_PER_PRODUCT]: 5,
      [E.MAX_CATEGORIES]: 20,
      [E.MAX_IMAGES_PER_PRODUCT]: 5,
      [E.MAX_STAFF]: 1,
      [E.MAX_LOCATIONS]: 1,
      [E.MAX_COUPONS]: 3,
      [E.MAX_MONTHLY_ORDERS]: 300,
      [E.INVENTORY_MANAGEMENT]: true,
    },
  },
  {
    key: 'growth',
    name: 'Growth',
    tier: 'GROWTH',
    description: 'For a shop with a growing catalogue and repeat customers.',
    monthlyPrice: '3500.00',
    yearlyPrice: '35000.00',
    trialDays: 14,
    isPublic: true,
    isMostPopular: true,
    position: 1,
    bullets: [
      'Up to 1,000 products',
      '3 staff accounts',
      'Coupons and scheduled discounts',
      'Daily gold-rate pricing',
      'Sales and inventory analytics',
    ],
    entitlements: {
      [E.MAX_PRODUCTS]: 1000,
      [E.MAX_VARIANTS_PER_PRODUCT]: 20,
      [E.MAX_CATEGORIES]: 100,
      [E.MAX_IMAGES_PER_PRODUCT]: 10,
      [E.MAX_STAFF]: 3,
      [E.MAX_LOCATIONS]: 2,
      [E.MAX_COUPONS]: 25,
      [E.MAX_MONTHLY_ORDERS]: 3000,
      [E.INVENTORY_MANAGEMENT]: true,
      [E.STAFF_ACCOUNTS]: true,
      [E.COUPONS]: true,
      [E.ADVANCED_ANALYTICS]: true,
      [E.METAL_RATE_PRICING]: true,
    },
  },
  {
    key: 'business',
    name: 'Business',
    tier: 'BUSINESS',
    description: 'For an established brand that wants its own domain and deeper control.',
    monthlyPrice: '7500.00',
    yearlyPrice: '75000.00',
    trialDays: 14,
    isPublic: true,
    isMostPopular: false,
    position: 2,
    bullets: [
      'Up to 10,000 products',
      '10 staff accounts with per-permission control',
      'Your own domain',
      'Advanced storefront customisation',
      'Suppliers, purchase orders and multi-location stock',
      'Advanced reports and priority support',
    ],
    entitlements: {
      [E.MAX_PRODUCTS]: 10_000,
      [E.MAX_VARIANTS_PER_PRODUCT]: 50,
      [E.MAX_CATEGORIES]: 500,
      [E.MAX_IMAGES_PER_PRODUCT]: 20,
      [E.MAX_STAFF]: 10,
      [E.MAX_LOCATIONS]: 5,
      [E.MAX_COUPONS]: 200,
      [E.MAX_MONTHLY_ORDERS]: 20_000,
      [E.INVENTORY_MANAGEMENT]: true,
      [E.STAFF_ACCOUNTS]: true,
      [E.COUPONS]: true,
      [E.ADVANCED_ANALYTICS]: true,
      [E.ADVANCED_REPORTS]: true,
      [E.METAL_RATE_PRICING]: true,
      [E.CUSTOM_DOMAIN]: true,
      [E.STOREFRONT_CUSTOM_CSS]: true,
      [E.PURCHASE_ORDERS]: true,
      [E.MULTI_LOCATION]: true,
      [E.PRIORITY_SUPPORT]: true,
      [E.REMOVE_PLATFORM_BRANDING]: true,
    },
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    tier: 'ENTERPRISE',
    description: 'Custom limits, integrations and a dedicated contact.',
    monthlyPrice: '0.00', // quoted per customer; overrides carry the real terms
    yearlyPrice: '0.00',
    trialDays: 0,
    isPublic: false,
    isMostPopular: false,
    position: 3,
    bullets: [
      'Unlimited products and staff',
      'Custom integrations',
      'API access',
      'Dedicated support contact',
    ],
    entitlements: {
      // null limit = unlimited
      [E.MAX_PRODUCTS]: null,
      [E.MAX_VARIANTS_PER_PRODUCT]: null,
      [E.MAX_CATEGORIES]: null,
      [E.MAX_IMAGES_PER_PRODUCT]: null,
      [E.MAX_STAFF]: null,
      [E.MAX_LOCATIONS]: null,
      [E.MAX_COUPONS]: null,
      [E.MAX_MONTHLY_ORDERS]: null,
      [E.INVENTORY_MANAGEMENT]: true,
      [E.STAFF_ACCOUNTS]: true,
      [E.COUPONS]: true,
      [E.ADVANCED_ANALYTICS]: true,
      [E.ADVANCED_REPORTS]: true,
      [E.METAL_RATE_PRICING]: true,
      [E.CUSTOM_DOMAIN]: true,
      [E.STOREFRONT_CUSTOM_CSS]: true,
      [E.PURCHASE_ORDERS]: true,
      [E.MULTI_LOCATION]: true,
      [E.PRIORITY_SUPPORT]: true,
      [E.REMOVE_PLATFORM_BRANDING]: true,
      [E.API_ACCESS]: true,
    },
  },
];

const LIMIT_KEYS = new Set<string>([
  E.MAX_PRODUCTS,
  E.MAX_VARIANTS_PER_PRODUCT,
  E.MAX_STAFF,
  E.MAX_CATEGORIES,
  E.MAX_LOCATIONS,
  E.MAX_IMAGES_PER_PRODUCT,
  E.MAX_COUPONS,
  E.MAX_MONTHLY_ORDERS,
]);

async function seedPlans(): Promise<void> {
  for (const plan of PLANS) {
    const record = await prisma.subscriptionPlan.upsert({
      where: { key: plan.key },
      create: {
        key: plan.key,
        name: plan.name,
        tier: plan.tier,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        currency: DEFAULTS.CURRENCY,
        trialDays: plan.trialDays,
        isPublic: plan.isPublic,
        isMostPopular: plan.isMostPopular,
        position: plan.position,
        marketingBullets: plan.bullets,
      },
      update: {
        name: plan.name,
        description: plan.description,
        isPublic: plan.isPublic,
        isMostPopular: plan.isMostPopular,
        position: plan.position,
        marketingBullets: plan.bullets,
        // Prices are deliberately NOT updated on re-seed: existing
        // subscriptions lock their own price, and changing a plan's price is a
        // commercial decision made in the admin console, not by a script.
      },
    });

    for (const [key, value] of Object.entries(plan.entitlements)) {
      const isLimit = LIMIT_KEYS.has(key);
      const data = isLimit
        ? { type: 'LIMIT' as const, limitValue: value as number | null, enabled: true }
        : { type: 'FEATURE' as const, limitValue: null, enabled: value === true };

      await prisma.planEntitlement.upsert({
        where: { planId_key: { planId: record.id, key } },
        create: { planId: record.id, key, ...data },
        update: data,
      });
    }

    console.warn(
      `  plan ${plan.key}: Tk ${plan.monthlyPrice}/mo, ${
        Object.keys(plan.entitlements).length
      } entitlements`,
    );
  }
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

const THEMES = [
  {
    key: 'aurum',
    name: 'Aurum',
    description: 'Warm gold and ivory. Built for traditional gold and bridal jewellery.',
    defaultTokens: {
      colors: {
        primary: '#8C6D1F',
        primaryForeground: '#FFFDF7',
        accent: '#B8860B',
        background: '#FFFDF7',
        foreground: '#1C1917',
        muted: '#F5F0E6',
        border: '#E7DFCC',
      },
      fonts: { heading: 'Cormorant Garamond', body: 'Inter' },
      radius: { sm: '2px', md: '4px', lg: '8px' },
    },
    position: 0,
  },
  {
    key: 'lustre',
    name: 'Lustre',
    description: 'Cool platinum and charcoal. Suits diamond and contemporary pieces.',
    defaultTokens: {
      colors: {
        primary: '#1F2933',
        primaryForeground: '#FFFFFF',
        accent: '#7B8794',
        background: '#FFFFFF',
        foreground: '#111827',
        muted: '#F4F5F7',
        border: '#E4E7EB',
      },
      fonts: { heading: 'Playfair Display', body: 'Inter' },
      radius: { sm: '0px', md: '2px', lg: '4px' },
    },
    position: 1,
  },
  {
    key: 'minima',
    name: 'Minima',
    description: 'Editorial white space and large photography. For silver and minimal designs.',
    defaultTokens: {
      colors: {
        primary: '#171717',
        primaryForeground: '#FAFAFA',
        accent: '#A3A3A3',
        background: '#FAFAFA',
        foreground: '#171717',
        muted: '#F5F5F5',
        border: '#E5E5E5',
      },
      fonts: { heading: 'Inter', body: 'Inter' },
      radius: { sm: '4px', md: '8px', lg: '16px' },
    },
    position: 2,
  },
];

const SECTION_SUPPORT = [
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
];

async function seedThemes(): Promise<void> {
  for (const theme of THEMES) {
    await prisma.theme.upsert({
      where: { key: theme.key },
      create: {
        key: theme.key,
        name: theme.name,
        description: theme.description,
        defaultTokens: theme.defaultTokens,
        sectionTypes: SECTION_SUPPORT,
        position: theme.position,
      },
      update: {
        name: theme.name,
        description: theme.description,
        defaultTokens: theme.defaultTokens,
        sectionTypes: SECTION_SUPPORT,
        position: theme.position,
      },
    });
  }
  console.warn(`  themes: ${THEMES.length}`);
}

// ---------------------------------------------------------------------------
// Platform settings and the first Super Admin
// ---------------------------------------------------------------------------

async function seedPlatformSettings(): Promise<void> {
  const settings: Array<{ key: string; group: string; value: unknown }> = [
    { key: 'signup.enabled', group: 'general', value: true },
    { key: 'signup.defaultPlanKey', group: 'billing', value: 'starter' },
    { key: 'trial.days', group: 'billing', value: DEFAULTS.TRIAL_DAYS },
    { key: 'billing.graceDays', group: 'billing', value: DEFAULTS.BILLING_GRACE_DAYS },
    { key: 'billing.currency', group: 'billing', value: DEFAULTS.CURRENCY },
    { key: 'storefront.defaultThemeKey', group: 'storefront', value: 'aurum' },
    { key: 'platform.name', group: 'general', value: 'JewelleryHub' },
    { key: 'platform.supportEmail', group: 'general', value: 'support@jewelleryhub.com' },
  ];

  for (const setting of settings) {
    await prisma.platformSetting.upsert({
      where: { key: setting.key },
      create: { key: setting.key, group: setting.group, value: setting.value as never },
      update: { group: setting.group, value: setting.value as never },
    });
  }
  console.warn(`  platform settings: ${settings.length}`);
}

async function seedSuperAdmin(): Promise<void> {
  const email = process.env['SEED_SUPER_ADMIN_EMAIL'];
  const password = process.env['SEED_SUPER_ADMIN_PASSWORD'];

  if (!email || !password) {
    // Never invent a default credential: a seeded admin with a known password
    // is a back door if it ever reaches a deployed environment.
    console.warn(
      '  super admin: SKIPPED (set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD)',
    );
    return;
  }
  if (password.length < 12) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters.');
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      firstName: 'Platform',
      lastName: 'Admin',
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      isSuperAdmin: true,
    },
    update: { isSuperAdmin: true, status: 'ACTIVE' },
  });

  const role = await prisma.role.findUniqueOrThrow({ where: { key: ROLE_KEYS.SUPER_ADMIN } });
  await prisma.platformRoleAssignment.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });

  console.warn(`  super admin: ${user.email}`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const wantsDemo = process.env['SEED_DEMO_DATA'] === 'true';

  console.warn('\nSeeding reference data');
  await seedPermissions();
  await seedRoles();
  await seedPlans();
  await seedThemes();
  await seedPlatformSettings();
  await seedSuperAdmin();

  if (wantsDemo && isProduction) {
    throw new Error('SEED_DEMO_DATA=true with NODE_ENV=production. Refusing to seed demo data.');
  }

  if (wantsDemo) {
    console.warn('\nSeeding demo data');
    await seedDemoData(prisma);
  } else {
    console.warn('\nDemo data: skipped (set SEED_DEMO_DATA=true to include it)');
  }

  console.warn('\nSeed complete.\n');
}

main()
  .catch((error: unknown) => {
    console.error('\nSeed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
