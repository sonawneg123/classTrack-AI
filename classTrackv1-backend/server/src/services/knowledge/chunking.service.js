/**
 * server/src/services/knowledge/chunking.service.js
 *
 * ChunkingService — converts a long document text into overlapping chunks
 * suitable for embedding and vector retrieval.
 *
 * Strategy: sentence-aware sliding window
 *   Target:  512 tokens per chunk
 *   Overlap: 64 tokens between consecutive chunks
 *
 * TOKEN APPROXIMATION NOTE:
 *   This prototype approximates token count as Math.ceil(charCount / 4),
 *   which is a well-known rule-of-thumb for English text and most Latin-script
 *   languages (GPT tokenisers average ~4 characters per token).  It is NOT
 *   exact — a proper tokeniser (e.g. tiktoken, sentencepiece) would be needed
 *   for billing or hard model-context-length enforcement.  For chunking
 *   heuristics at this prototype stage the approximation is acceptable and
 *   is documented explicitly here and in the per-chunk metadata.
 */
const config = require('../../config');

/**
 * Approximate character count → token count.
 * @param {number} chars
 * @returns {number}
 */
function approxTokens(chars) {
  return Math.ceil(chars / 4);
}

/**
 * Approximate token count → character count.
 * @param {number} tokens
 * @returns {number}
 */
function tokensToChars(tokens) {
  return tokens * 4;
}

/**
 * Split text into non-empty sentences (very simple split on '. ', '! ', '? ').
 * Preserves sentence boundaries to avoid cutting mid-sentence.
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  // Split on sentence-ending punctuation followed by whitespace or end-of-string
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.map((s) => s.trim()).filter(Boolean);
}

/**
 * Produces an array of chunk objects from raw document text.
 *
 * @param {string} text         Full extracted document text.
 * @param {object} [sourceMeta] Extra source information (e.g. { page: null, section: null }).
 * @returns {{ chunkIndex: number, chunkText: string, charCount: number, tokenApprox: number, sourceMeta: object }[]}
 */
function chunkText(text, sourceMeta = {}) {
  const { chunkTokens, overlapTokens } = config.rag;

  // Target/overlap in characters (approximated)
  const targetChars  = tokensToChars(chunkTokens);
  const overlapChars = tokensToChars(overlapTokens);

  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks = [];
  let chunkIndex = 0;
  let bufferStart = 0;  // index into sentences[]

  while (bufferStart < sentences.length) {
    // Build a chunk by accumulating sentences until we hit the target size
    let buffer = '';
    let i = bufferStart;

    while (i < sentences.length) {
      const candidate = buffer ? buffer + ' ' + sentences[i] : sentences[i];
      if (buffer && approxTokens(candidate.length) > chunkTokens) break;
      buffer = candidate;
      i++;
    }

    // If we couldn't even fit one sentence (extremely long single sentence),
    // hard-truncate it to targetChars.
    if (!buffer) {
      buffer = sentences[bufferStart].slice(0, targetChars);
      i = bufferStart + 1;
    }

    const trimmed = buffer.trim();
    if (trimmed) {
      chunks.push({
        chunkIndex,
        chunkText:  trimmed,
        charCount:  trimmed.length,
        tokenApprox: approxTokens(trimmed.length),
        sourceMeta: { ...sourceMeta },
      });
      chunkIndex++;
    }

    if (i >= sentences.length) break;  // we consumed everything

    // Slide back by overlap: find the sentence count that gives ~overlapChars
    // of overlap re-used from the END of the current chunk.
    let overlapSentences = 0;
    let overlapBuffer = '';
    for (let j = i - 1; j >= bufferStart; j--) {
      const candidate = sentences[j] + (overlapBuffer ? ' ' + overlapBuffer : '');
      if (overlapBuffer && candidate.length > overlapChars) break;
      overlapBuffer = candidate;
      overlapSentences++;
    }
    // Compute the new start, but guarantee at least one net-new sentence is
    // consumed each iteration — otherwise a single sentence longer than
    // overlapChars would cause an infinite loop.
    const nextStart = i - overlapSentences;
    bufferStart = nextStart > bufferStart ? nextStart : i;
  }

  return chunks;
}

module.exports = { chunkText, approxTokens };
