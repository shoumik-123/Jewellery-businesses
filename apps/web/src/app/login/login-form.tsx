'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The sign-in form.
 *
 * It posts to this app's own route handler, not to the API, so the session
 * token is placed in an httpOnly cookie server-side and never passes through
 * client JavaScript.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message: string }).message)
            : 'Sign in failed.';
        setError(message);
        setBusy(false);
        return;
      }

      // Replace, not push: the login page should not sit in the back stack
      // behind a signed-in session.
      router.replace(next);
      router.refresh();
    } catch {
      setError('Cannot reach the server. Check that it is running.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5" noValidate>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-line bg-parchment-deep p-3 text-sm text-ink"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" strokeWidth={1.5} />
          {error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="eyebrow mb-1.5 block">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full border border-line bg-white/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold"
        />
      </div>

      <div>
        <label htmlFor="password" className="eyebrow mb-1.5 block">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full border border-line bg-white/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold"
        />
      </div>

      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />}
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
