import { LogOut } from 'lucide-react';

/**
 * A form, not a link.
 *
 * Signing out changes state, so it must be a POST. A GET link would let any
 * page sign someone out with an <img src="/api/auth/logout">.
 */
export function SignOutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
      >
        <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
        Sign out
      </button>
    </form>
  );
}
