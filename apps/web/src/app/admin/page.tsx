import Link from 'next/link';
import { Plus, ShieldAlert } from 'lucide-react';
import { SignOutButton } from '@/components/sign-out-button';
import { apiAuthed, requireUser } from '@/lib/session';

export const metadata = { title: 'Admin console' };

interface StoreSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  city: string | null;
  createdAt: string;
  ownerEmail: string | null;
  productCount: number;
}

/**
 * The Super Admin console.
 *
 * Shops are created here and nowhere else — there is no public sign-up — so
 * this list is the full set of shops on the platform.
 *
 * The permission check that matters is the API's, not this page's. Hiding the
 * page from a non-admin is a courtesy; the endpoint refusing them is the
 * control.
 */
export default async function AdminPage() {
  const user = await requireUser('/admin');
  const result = await apiAuthed<StoreSummary[]>('/admin/stores');

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="flex items-start gap-3 border border-line bg-parchment-deep p-5 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" strokeWidth={1.5} />
          <span>
            <span className="block text-ink">
              {result.status === 403
                ? 'This console is for platform administrators.'
                : 'Could not load the store list.'}
            </span>
            <span className="mt-1 block text-ink-soft">{result.message}</span>
          </span>
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block text-sm text-gold-deep underline underline-offset-4"
        >
          Back to your dashboard
        </Link>
      </main>
    );
  }

  const stores = result.data;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow">Platform</p>
          <h1 className="mt-2 text-3xl">Admin console</h1>
          <p className="mt-1 text-sm text-ink-soft">Signed in as {user.email}</p>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href="/admin/stores/new"
            className="inline-flex items-center gap-1.5 bg-ink px-4 py-2 text-sm text-parchment hover:bg-gold-deep"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New shop
          </Link>
          <SignOutButton />
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-xl">
          Shops <span className="numeric text-base text-ink-faint">({stores.length})</span>
        </h2>

        {stores.length === 0 ? (
          <p className="mt-5 border border-line bg-parchment-deep p-6 text-sm text-ink-soft">
            No shops yet. Create the first one.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="eyebrow py-2 pr-4 font-normal">Shop</th>
                  <th className="eyebrow py-2 pr-4 font-normal">Owner</th>
                  <th className="eyebrow py-2 pr-4 font-normal">Status</th>
                  <th className="eyebrow py-2 pr-4 text-right font-normal">Products</th>
                  <th className="eyebrow py-2 font-normal">Storefront</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id} className="border-b border-line/60">
                    <td className="py-3 pr-4">
                      <span className="block text-ink">{store.name}</span>
                      <span className="block font-mono text-[11px] text-ink-faint">
                        {store.slug}
                        {store.city ? ` · ${store.city}` : ''}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-ink-soft">{store.ownerEmail ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={store.status === 'ACTIVE' ? 'text-gold-deep' : 'text-ink-faint'}
                      >
                        {store.status}
                      </span>
                    </td>
                    <td className="numeric py-3 pr-4 text-right text-ink-soft">
                      {store.productCount}
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/s/${store.slug}`}
                        className="text-ink-soft underline underline-offset-4 hover:text-gold-deep"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
