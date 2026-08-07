/**
 * server/tests/unit/utils/token.util.test.js
 */
const { generateRawToken, hashToken, minutesFromNow, hoursFromNow } = require('../../../src/utils/token.util');

describe('token.util', () => {
  describe('generateRawToken', () => {
    it('generates a non-empty, URL-safe string', () => {
      const token = generateRawToken(48);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(token).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('generates a different token on every call', () => {
      const a = generateRawToken(48);
      const b = generateRawToken(48);
      expect(a).not.toBe(b);
    });

    it('produces a longer string for more bytes', () => {
      const short = generateRawToken(16);
      const long  = generateRawToken(64);
      expect(long.length).toBeGreaterThan(short.length);
    });
  });

  describe('hashToken', () => {
    it('is deterministic — same input always produces the same hash', () => {
      const raw = 'a-known-raw-token-value';
      expect(hashToken(raw)).toBe(hashToken(raw));
    });

    it('produces a 64-character hex string (SHA-256)', () => {
      const hash = hashToken('anything');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces different hashes for different inputs', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });

    it('never returns the raw input itself (one-way)', () => {
      const raw = 'my-raw-refresh-token';
      expect(hashToken(raw)).not.toBe(raw);
    });
  });

  describe('minutesFromNow / hoursFromNow', () => {
    it('minutesFromNow returns a Date roughly N minutes in the future', () => {
      const before = Date.now();
      const result = minutesFromNow(10);
      const diffMs = result.getTime() - before;
      expect(diffMs).toBeGreaterThan(9 * 60 * 1000);
      expect(diffMs).toBeLessThan(11 * 60 * 1000);
    });

    it('hoursFromNow returns a Date roughly N hours in the future', () => {
      const before = Date.now();
      const result = hoursFromNow(2);
      const diffMs = result.getTime() - before;
      expect(diffMs).toBeGreaterThan(1.9 * 60 * 60 * 1000);
      expect(diffMs).toBeLessThan(2.1 * 60 * 60 * 1000);
    });
  });
});
