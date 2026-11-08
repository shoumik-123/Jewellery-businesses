import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { CreateStoreForm } from './create-store-form';

export const metadata = { title: 'New shop' };

export default async function NewStorePage() {
  await requireUser('/admin/stores/new');

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        Admin console
      </Link>

      <h1 className="mt-4 text-3xl">Create a shop</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
        This creates the shop, its owner account and its subdomain together. The shop goes live
        immediately with an empty catalogue.
      </p>

      <div className="mt-10">
        <CreateStoreForm />
      </div>
    </main>
  );
}
