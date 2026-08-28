/**
 * server/src/services/knowledge/retrieval.service.js
 *
 * Vector Retrieval Service
 *
 * Flow:
 *   User query text
 *     → EmbeddingProvider.generateEmbedding()
 *     → pgvector cosine similarity search (via KnowledgeChunkRepository)
 *     → Top-K results with full source metadata
 *     → Formatted result set
 *
 * Ownership enforcement:
 *   Teacher ID is always passed to the repository layer — the SQL WHERE
 *   clause guarantees a teacher can NEVER retrieve another teacher's chunks.
 */
const config    = require('../../config');
const logger    = require('../../utils/logger.util');
const { getEmbeddingProvider } = require('../ai/providers');
const chunkRepo = require('../../repositories/knowledgeChunk.repository');

/**
 * Search the knowledge base for chunks semantically similar to the query.
 *
 * @param {object} params
 * @param {string}  params.query      Natural language search query
 * @param {number}  params.teacherId  Ownership filter
 * @param {number}  [params.topK]     Defaults to config.rag.topK
 * @param {object}  [params.filters]  Optional { topicId, chapterId, subjectId, curriculumId }
 * @returns {Promise<{ results: Array }>}
 */
async function search({ query, teacherId, topK, filters = {} }) {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty.');
  }

  const k = topK || config.rag.topK;
  logger.debug('[Retrieval] Generating query embedding…', { queryLength: query.length, topK: k });

  const embeddingProvider = getEmbeddingProvider();
  const queryEmbedding = await embeddingProvider.generateEmbedding(query.trim());

  logger.debug('[Retrieval] Running similarity search…', { teacherId, topK: k });
  const rows = await chunkRepo.similaritySearch(teacherId, queryEmbedding, k, filters);

  const results = rows.map((row) => ({
    chunkId:    row.chunk_id,
    chunkIndex: row.chunk_index,
    text:       row.chunk_text,
    similarity: parseFloat(Number(row.similarity).toFixed(4)),
    source: {
      documentId:       row.doc_id,
      documentTitle:    row.document_title,
      originalFilename: row.original_filename,
      fileType:         row.file_type,
      sourceMeta:       row.source_meta,
      topic:      { id: row.topic_id,      name: row.topic_name },
      chapter:    { id: row.chapter_id,    name: row.chapter_name },
      subject:    { id: row.subject_id,    name: row.subject_name },
      curriculum: { id: row.curriculum_id, name: row.curriculum_name },
    },
  }));

  logger.debug('[Retrieval] Search complete.', { teacherId, resultCount: results.length });
  return { results };
}

module.exports = { search };
