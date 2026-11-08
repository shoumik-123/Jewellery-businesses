/**
 * @jh/shared — the contract between the API, the worker and the web app.
 *
 * Anything imported by more than one app belongs here: money arithmetic,
 * error codes, permission keys, entitlement keys, validation schemas and
 * jewellery reference data. If the API changes a shape, the web build breaks.
 * That is the point.
 */
export * from './money';
export * from './errors';
export * from './constants';
export * from './jewellery';
export * from './schemas';
