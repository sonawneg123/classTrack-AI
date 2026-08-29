/**
 * server/tests/unit/repositories/questionBank.repository.test.js
 *
 * Tests for the text hash deduplication helper.
 * The database pool is mocked so no DB is required.
 */

// Mock pool before requiring the repo
jest.mock('../../../src/database/connection', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { textHash } = require('../../../src/repositories/questionBank.repository');

describe('textHash', () => {
  it('returns a 32-char hex MD5', () => {
    const hash = textHash('Hello World');
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is case-insensitive', () => {
    expect(textHash('HELLO WORLD')).toBe(textHash('hello world'));
  });

  it('trims leading/trailing whitespace before hashing', () => {
    expect(textHash('  hello  ')).toBe(textHash('hello'));
  });

  it('produces different hashes for different questions', () => {
    const h1 = textHash('What is photosynthesis?');
    const h2 = textHash('What is respiration?');
    expect(h1).not.toBe(h2);
  });

  it('is deterministic', () => {
    const text = 'Repeated question text';
    expect(textHash(text)).toBe(textHash(text));
  });
});
