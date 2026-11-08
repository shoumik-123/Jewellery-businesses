import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

/**
 * Sign-in.
 *
 * There is no "create an account" link, and that is deliberate: shops do not
 * register themselves. A Super Admin creates each shop and its owner, so the
 * only way onto this page is with credentials someone was given.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params['next'];
  const requested = Array.isArray(raw) ? raw[0] : raw;

  // Only same-site paths. An open redirect here would let a phishing link
  // bounce someone from a real sign-in to an attacker's page.
  const next = requested && /^\/(?!\/)/.test(requested) ? requested : '/dashboard';

  const user = await currentUser();
  if (user) redirect(next);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <Link href="/" className="eyebrow mb-8 hover:text-ink">
        JewelleryHub
      </Link>

      <h1 className="text-3xl">Sign in</h1>
      <p className="mt-2 text-sm text-ink-soft">
        For shop owners and staff. Your shop is set up for you by JewelleryHub — there is no public
        sign-up.
      </p>

      <div className="mt-8">
        <LoginForm next={next} />
      </div>

      <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-ink-faint">
        Lost your password? Ask JewelleryHub to reset it — self-service reset arrives with the email
        service.
      </p>
    </main>
  );
}
