import { isStaleConnectionError } from './client';

/**
 * These tests exist because of what the classifier gates.
 *
 * A true answer lets a transaction be retried. That is safe only for a
 * connection that was already dead when the pool handed it over, which the
 * `entered` flag in client.ts establishes separately — but if this function
 * were widened to match, say, any error containing "connection", it would
 * start retrying genuine failures. The false cases below are therefore the
 * important half of this file.
 */
describe('isStaleConnectionError', () => {
  describe('recognises a connection the server had already closed', () => {
    it.each([
      [
        'node-postgres pool handing out a dead client',
        new Error('Connection terminated unexpectedly'),
      ],
      ['Prisma reporting the same thing', new Error('Client has encountered a connection error')],
      ['server closing the socket', new Error('server closed the connection unexpectedly')],
      [
        'administrator terminating the backend',
        new Error('terminating connection due to administrator command'),
      ],
    ])('%s', (_label, error) => {
      expect(isStaleConnectionError(error)).toBe(true);
    });

    it.each([
      ['ECONNRESET', 'ECONNRESET'],
      ['EPIPE', 'EPIPE'],
      ['SQLSTATE 57P01, admin shutdown', '57P01'],
    ])('by error code: %s', (_label, code) => {
      expect(isStaleConnectionError(Object.assign(new Error('socket hang up'), { code }))).toBe(
        true,
      );
    });
  });

  describe('does not claim anything else', () => {
    it.each([
      ['a constraint violation', new Error('duplicate key value violates unique constraint')],
      ['a statement timeout', new Error('canceling statement due to statement timeout')],
      ['a serialisation failure', new Error('could not serialize access due to concurrent update')],
      ['a permission failure from RLS', new Error('permission denied for table Product')],
      ['an application error thrown inside the callback', new Error('Order already captured')],
      ['a deadlock', Object.assign(new Error('deadlock detected'), { code: '40P01' })],
      [
        'a connection refused at dial time',
        Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }),
      ],
    ])('%s', (_label, error) => {
      expect(isStaleConnectionError(error)).toBe(false);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'Connection terminated unexpectedly'],
      ['a plain object', { message: 'Connection terminated unexpectedly' }],
    ])('a non-Error value: %s', (_label, value) => {
      expect(isStaleConnectionError(value)).toBe(false);
    });
  });
});
