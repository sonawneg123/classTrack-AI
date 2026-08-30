/**
 * server/src/services/knowledge/reranker/rerankerWorker.js
 *
 * Worker thread that runs @xenova/transformers cross-encoder inference.
 *
 * WHY A WORKER THREAD?
 *   Cross-encoder inference (text-classification over (query, passage) pairs)
 *   runs synchronously on the CPU via ONNX.  Running it on the main event-loop
 *   thread would block all HTTP, DB, and timer callbacks for the entire
 *   inference duration.  A dedicated worker keeps the main loop responsive.
 *
 * PROTOCOL (identical pattern to embeddingWorker.js):
 *   Main thread sends:
 *     { type: 'rerank', id: string, model: string, query: string, texts: string[] }
 *
 *   Worker replies:
 *     { type: 'result', id: string, scores: number[] }
 *   or
 *     { type: 'error',  id: string, message: string }
 *
 *   The 'id' field correlates replies to their callers so that concurrent
 *   requests can be handled safely.
 *
 * SCORING:
 *   Uses @xenova/transformers 'text-classification' pipeline.
 *   The cross-encoder (e.g. ms-marco-MiniLM-L-6-v2) outputs a relevance score
 *   for each (query, passage) pair.  Higher score = more relevant.
 *
 *   We use the raw logit / score from label index 1 ('relevant').
 *   After sigmoid the values are in [0, 1].  We return the raw score
 *   so the caller can decide how to normalise.
 *
 * MODEL LOADING:
 *   The pipeline is loaded once on the first request, then reused.
 *   If loading fails, loadPromise is reset so the next request will retry.
 */
const { parentPort } = require('worker_threads');

let pipeline = null;
let loadPromise = null;

/**
 * Load (or reuse) the cross-encoder pipeline.
 * Deduplicated: concurrent callers share the same loading Promise.
 * Resets on failure so the next call triggers a fresh attempt.
 *
 * @param {string} model - HuggingFace model identifier
 * @returns {Promise<object>} Loaded @xenova/transformers pipeline
 */
async function getPipeline(model) {
  if (pipeline) return pipeline;

  if (!loadPromise) {
    loadPromise = (async () => {
      const { pipeline: createPipeline } = await import('@xenova/transformers');
      // text-classification is the task type for cross-encoder sequence pair scoring
      const p = await createPipeline('text-classification', model, { quantized: true });
      return p;
    })().catch((err) => {
      // Reset so the next request can retry
      loadPromise = null;
      throw err;
    });
  }

  pipeline = await loadPromise;
  return pipeline;
}

parentPort.on('message', async (msg) => {
  if (msg.type !== 'rerank') return;

  const { id, model, query, texts } = msg;

  try {
    const pipe = await getPipeline(model);

    // Score each (query, text) pair independently
    const scores = [];
    for (const text of texts) {
      // Cross-encoders for passage reranking expect [query, passage] input.
      // @xenova/transformers text-classification accepts this as a string pair.
      const output = await pipe([query, text]);
      // output is an array of {label, score} objects (one per label).
      // ms-marco models output a single score; we take the highest-score label's value.
      // For binary models, label 'LABEL_1' or 'relevant' is the positive class.
      let score;
      if (Array.isArray(output)) {
        // Find the relevance-positive label or just take max score
        const relevant = output.find(
          (o) => o.label === 'LABEL_1' || o.label === 'relevant' || o.label === '1'
        );
        score = relevant ? relevant.score : Math.max(...output.map((o) => o.score));
      } else {
        score = output.score ?? 0;
      }
      scores.push(score);
    }

    parentPort.postMessage({ type: 'result', id, scores });
  } catch (err) {
    parentPort.postMessage({ type: 'error', id, message: err.message, stack: err.stack });
  }
});
