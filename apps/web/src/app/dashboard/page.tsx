import Link from 'next/link';
import { Boxes, ExternalLink, Shield, Store as StoreIcon } from 'lucide-react';
import { SignOutButton } from '@/components/sign-out-button';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Dashboard' };

/**
 * What a signed-in shop owner or staff member lands on.
 *
 * It shows the shops they belong to and exactly which permissions their role
 * grants, because that is the honest state of Phase 2: authentication and
 * authorisation work and can be inspected. Managing products and orders is
 * Phase 4 — the links below say so rather than leading to empty screens.
 */
export default async function DashboardPage() {
  const user = await requireUser('/dashboard');

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow">Signed in</p>
          <h1 className="mt-2 text-3xl">
            {user.firstName}
            {user.lastName ? ` ${user.lastName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{user.email}</p>
        </div>
        <SignOutButton />
      </div>

      {user.isSuperAdmin && (
        <section className="mt-8 border border-gold/40 bg-gold-wash p-5">
          <p className="flex items-center gap-2 text-sm text-gold-deep">
            <Shield className="h-4 w-4" strokeWidth={1.5} />
            You are a platform administrator.
          </p>
          <Link
            href="/admin"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink underline underline-offset-4 hover:text-gold-deep"
          >
            Open the admin console
          </Link>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xl">Your shops</h2>

        {user.stores.length === 0 ? (
          <p className="mt-4 border border-line bg-parchment-deep p-5 text-sm text-ink-soft">
            You are not a member of any shop yet. A platform administrator adds you to one.
          </p>
        ) : (
          <ul className="mt-5 space-y-5">
            {user.stores.map((store) => (
              <li key={store.storeId} className="border border-line bg-white/50 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-display text-xl text-ink">
                      <StoreIcon className="h-4 w-4 text-gold-deep" strokeWidth={1.5} />
                      {store.name}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {store.roleName}
                      {store.isOwner ? ' · Owner' : ''} · {store.permissions.length} permissions
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Link
                      href={`/dashboard/${store.slug}`}
                      className="inline-flex items-center gap-1.5 bg-ink px-4 py-2 text-sm text-parchment hover:bg-gold-deep"
                    >
                      <Boxes className="h-4 w-4" strokeWidth={1.5} />
                      Manage products
                    </Link>
                    <Link
                      href={`/s/${store.slug}`}
                      className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-gold-deep"
                    >
                      View storefront
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Link>
                  </div>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-ink-soft hover:text-ink">
                    What this role can do
                  </summary>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {store.permissions.map((permission) => (
                      <li
                        key={permission}
                        className="border border-line px-2 py-0.5 font-mono text-[11px] text-ink-soft"
                      >
                        {permission}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12 border-t border-line pt-6">
        <p className="eyebrow mb-2">Next</p>
        <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
          Products can be added, edited and archived from a shop&rsquo;s dashboard. Variants and
          sizes, stock per location, and orders are the slices after this one.
        </p>
      </section>
    </main>
  );
}
