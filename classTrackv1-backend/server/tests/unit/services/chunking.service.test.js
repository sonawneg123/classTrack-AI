/**
 * server/tests/unit/services/chunking.service.test.js
 *
 * Tests for the ChunkingService — pure in-process logic, no mocks needed.
 */

// Set up required env vars for config.js
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test_secret_long_enough';
process.env.GROQ_API_KEY = 'test';

const { chunkText, approxTokens } = require('../../../src/services/knowledge/chunking.service');

describe('approxTokens', () => {
  it('returns Math.ceil(charCount / 4)', () => {
    expect(approxTokens(8)).toBe(2);
    expect(approxTokens(9)).toBe(3);
    expect(approxTokens(0)).toBe(0);
  });
});

describe('chunkText', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns empty array for whitespace-only text', () => {
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const text = 'Photosynthesis is the process by which plants make food using sunlight.';
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].chunkText).toBe(text.trim());
    expect(chunks[0].charCount).toBe(text.trim().length);
    expect(chunks[0].tokenApprox).toBe(Math.ceil(text.trim().length / 4));
  });

  it('assigns sequential chunkIndex values', () => {
    // Create text long enough to require multiple chunks (target = 512 tokens ≈ 2048 chars)
    const sentence = 'This is a test sentence about photosynthesis in plants. ';
    const longText = sentence.repeat(60); // ~3300 chars → 825 approx tokens → at least 2 chunks
    const chunks = chunkText(longText);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
    });
  });

  it('each chunk has required fields', () => {
    const text = 'Hello world. This is a sentence. And another one here.';
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(typeof chunk.chunkIndex).toBe('number');
      expect(typeof chunk.chunkText).toBe('string');
      expect(chunk.chunkText.length).toBeGreaterThan(0);
      expect(typeof chunk.charCount).toBe('number');
      expect(typeof chunk.tokenApprox).toBe('number');
      expect(chunk.sourceMeta).toBeDefined();
    }
  });

  it('passes source metadata through to each chunk', () => {
    const text = 'A sentence about biology.';
    const meta = { page: 3, section: 'intro' };
    const chunks = chunkText(text, meta);
    expect(chunks[0].sourceMeta).toEqual(meta);
  });

  it('charCount matches chunkText length', () => {
    const text = 'Biology is the study of life. Chemistry is another field. Physics covers forces.';
    const chunks = chunkText(text);
    for (const c of chunks) {
      expect(c.charCount).toBe(c.chunkText.length);
    }
  });

  it('produces multiple chunks for very long text', () => {
    // 3000 chars → ~750 tokens → should produce more than 1 chunk
    const sentence = 'The mitochondria is the powerhouse of the cell. ';
    const longText = sentence.repeat(60);
    const chunks = chunkText(longText);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
