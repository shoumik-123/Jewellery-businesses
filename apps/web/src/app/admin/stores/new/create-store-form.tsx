'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Check, Copy, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CreatedStore {
  slug: string;
  name: string;
  storefrontUrl: string;
  owner: { email: string; temporaryPassword: string };
}

function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="w-full border border-line bg-white/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold"
        {...props}
      />
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function CreateStoreForm() {
  const [created, setCreated] = useState<CreatedStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      // FormData values are string | File here; these inputs are all text.
      const text = typeof value === 'string' ? value.trim() : '';
      // Optional fields are omitted rather than sent empty: the API's schema
      // treats absent as "not provided" and '' as an invalid value.
      if (text !== '') payload[key] = text;
    }

    try {
      const response = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message: string }).message)
            : 'Could not create the shop.',
        );
        setBusy(false);
        return;
      }

      setCreated(body as CreatedStore);
      setBusy(false);
    } catch {
      setError('Cannot reach the server.');
      setBusy(false);
    }
  }

  // The one-time password is shown once and never stored in readable form -
  // only its argon2 hash reaches the database. There is no screen that can
  // show it again, by design.
  if (created) {
    return (
      <div className="space-y-6">
        <div className="border border-gold/50 bg-gold-wash p-5">
          <p className="text-sm text-gold-deep">
            <strong className="font-medium">{created.name}</strong> is live.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Sign-in email</dt>
              <dd className="font-mono text-xs text-ink">{created.owner.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-soft">Temporary password</dt>
              <dd className="flex items-center gap-2">
                <code className="bg-white/70 px-2 py-1 font-mono text-xs text-ink">
                  {created.owner.temporaryPassword}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(created.owner.temporaryPassword);
                    setCopied(true);
                  }}
                  className="text-ink-soft hover:text-ink"
                  aria-label="Copy password"
                >
                  {copied ? (
                    <Check className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <Copy className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </button>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-gold-deep">
            Write this down now. It is not stored anywhere readable — only its hash is kept — so
            this screen is the only place it exists. Leaving this page loses it, and the shop owner
            would need a new one.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={created.storefrontUrl}
            className="border border-line px-4 py-2 text-sm text-ink hover:border-gold hover:text-gold-deep"
          >
            View storefront
          </Link>
          <Link
            href="/admin"
            className="bg-ink px-4 py-2 text-sm text-parchment hover:bg-gold-deep"
          >
            Back to all shops
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-8" noValidate>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-line bg-parchment-deep p-3 text-sm text-ink"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" strokeWidth={1.5} />
          {error}
        </p>
      )}

      <fieldset className="space-y-5">
        <legend className="eyebrow mb-3">The shop</legend>
        <Field id="name" label="Shop name" required maxLength={120} placeholder="Aurum Jewellers" />
        <Field
          id="slug"
          label="Web address"
          required
          maxLength={63}
          pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
          placeholder="aurum-jewellers"
          hint="Lowercase letters, numbers and hyphens. Becomes the shop's own subdomain."
        />
        <Field id="tagline" label="Tagline (optional)" maxLength={160} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="city" label="City (optional)" maxLength={80} />
          <Field id="phone" label="Shop phone (optional)" maxLength={32} />
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-6">
        <legend className="eyebrow mb-3">The owner</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="ownerFirstName" label="First name" required maxLength={80} />
          <Field id="ownerLastName" label="Last name (optional)" maxLength={80} />
        </div>
        <Field
          id="ownerEmail"
          label="Email"
          type="email"
          required
          maxLength={254}
          hint="They sign in with this. A one-time password is generated for you to pass on."
        />
        <Field id="ownerPhone" label="Phone (optional)" maxLength={32} />
      </fieldset>

      <Button type="submit" size="lg" disabled={busy}>
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />}
        {busy ? 'Creating…' : 'Create shop'}
      </Button>
    </form>
  );
}
