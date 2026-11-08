/**
 * @jh/db — the database boundary.
 *
 * Everything that talks to PostgreSQL goes through here, which is what makes
 * the tenancy guarantee reviewable: there is one file that decides which role
 * and which tenant context a query runs under.
 */
export * from './client';
