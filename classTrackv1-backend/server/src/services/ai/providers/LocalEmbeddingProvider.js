/**
 * server/src/services/ai/providers/LocalEmbeddingProvider.js
 *
 * Embedding provider using @xenova/transformers (ONNX runtime, runs locally).
 * No external API key required.  The model weights are downloaded on first use
 * and cached in the local filesystem.
 *
 * Default model: Xenova/all-MiniLM-L6-v2  (384 dimensions, ~22M params)
 *   — fast, small, high quality for semantic similarity tasks.
 *   — fully open-source Apache-2.0 licence.
 *
 * ARCHITECTURE — WORKER THREAD:
 *   @xenova/transformers runs ONNX inference synchronously on the CPU.
 *   Each inference call blocks the calling thread for ~100-400ms.
 *   Running this on the Node.js main event-loop thread would freeze ALL
 *   I/O (HTTP, DB, timers) for the entire embedding duration.
 *
 *   Instead, a persistent Worker thread runs the ONNX pipeline.  The main
 *   thread sends text batches via postMessage() and awaits the result via
 *   a Promise.  The main event loop stays fully responsive while inference
 *   runs in parallel on a dedicated thread.
 *
 * FIRST-RUN NOTE:
 *   On the very first invocation the ONNX model weights (~22 MB) are
 *   downloaded from HuggingFace and cached locally.  This can take
 *   10-60 seconds depending on network speed.  All subsequent calls
 *   reuse the warm worker.
 *   If the download fails the error propagates so the ingestion pipeline
 *   marks the document as 'failed' — it will NOT hang indefinitely.
 *
 * BATCH LOGGING:
 *   Progress is logged every LOG_BATCH_SIZE chunks so large documents
 *   don't appear silent in logs.
 */
const { Worker } = require('worker_threads');
const path = require('path');
const EmbeddingProvider = require('./EmbeddingProvider');
const config = require('../../../config');
const logger = require('../../../utils/logger.util');

const WORKER_PATH = path.join(__dirname, 'embeddingWorker.js');
const LOG_BATCH_SIZE = 10;

class LocalEmbeddingProvider extends EmbeddingProvider {
  constructor() {
    super();
    this._model      = config.embedding.model;
    this._worker     = null;
    this._pending    = [];       // queue of { texts, resolve, reject }
    this._busy       = false;    // true while the worker is processing a batch
    this._starting   = false;    // true while the worker is being started
    this._disposing  = false;    // true when dispose() is in progress or complete
  }

  // ── Worker lifecycle ──────────────────────────────────────────────────────

  /**
   * Lazily start the persistent worker thread.
   * Concurrent callers share the same worker — only one is ever created.
   * @returns {Promise<Worker>}
   */
  _getWorker() {
    if (this._worker) return Promise.resolve(this._worker);

    return new Promise((resolve, reject) => {
      if (this._worker) return resolve(this._worker);

      logger.info('[Embedding] Starting worker thread…', { model: this._model });

      const worker = new Worker(WORKER_PATH, {
        // Worker receives `worker_threads` built-ins automatically.
        // No extra env vars needed; it shares the parent's node_modules.
      });

      worker.once('online', () => {
        logger.info('[Embedding] Worker thread online.', { model: this._model });
        this._worker = worker;
        resolve(worker);
      });

      worker.on('error', (err) => {
        logger.error('[Embedding] Worker thread error', { model: this._model, error: err.message, stack: err.stack });
        // Reset so the next call creates a fresh worker
        this._worker   = null;
        this._busy     = false;
        // Reject all pending requests
        const pending = this._pending.splice(0);
        for (const { reject: rej } of pending) rej(err);
        reject(err);
      });

      worker.on('exit', (code) => {
        // Exit code 1 is the normal result of worker.terminate() — only treat
        // it as an unexpected crash when NOT in the middle of intentional disposal.
        if (code !== 0 && !this._disposing) {
          logger.warn('[Embedding] Worker exited with code', { code, model: this._model });
          this._worker = null;
          this._busy   = false;
          const pending = this._pending.splice(0);
          for (const { reject: rej } of pending) rej(new Error(`Embedding worker exited with code ${code}`));
        }
      });

      worker.on('message', (msg) => {
        this._busy = false;
        const item = this._pending.shift();
        if (!item) return;   // spurious message

        if (msg.type === 'result') {
          item.resolve(msg.embeddings);
        } else if (msg.type === 'error') {
          item.reject(new Error(`[EmbeddingWorker] ${msg.message}`));
        }

        // Process next queued batch if any
        this._processNext();
      });
    });
  }

  /**
   * Send the next pending batch to the worker if it is idle.
   * @private
   */
  _processNext() {
    if (this._busy || this._pending.length === 0 || !this._worker) return;
    this._busy = true;
    this._worker.postMessage({
      type:  'embed',
      texts: this._pending[0].texts,
      model: this._model,
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Generate a single embedding.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async generateEmbedding(text) {
    const [embedding] = await this.generateEmbeddings([text]);
    return embedding;
  }

  /**
   * Generate embeddings for multiple texts.
   * Batches are serialised through the worker — one batch at a time.
   * Logs progress every LOG_BATCH_SIZE items.
   *
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async generateEmbeddings(texts) {
    if (!texts || texts.length === 0) return [];

    // Ensure the worker is running
    await this._getWorker();

    const total = texts.length;

    // Process in LOG_BATCH_SIZE-sized groups so we log progress and allow
    // other queued documents to interleave (each batch queued separately).
    const allEmbeddings = [];
    const BATCH_SIZE = LOG_BATCH_SIZE;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + BATCH_SIZE);
      const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(total / BATCH_SIZE);

      logger.info('[Embedding] Batch started', {
        batch: `${batchNum}/${totalBatches}`,
        batchSize: batchTexts.length,
        chunkRange: `${i}–${i + batchTexts.length - 1}`,
        model: this._model,
      });

      const batchStart = Date.now();
      const batchEmbeddings = await this._sendBatch(batchTexts);
      const batchMs = Date.now() - batchStart;

      logger.info('[Embedding] Batch done', {
        batch: `${batchNum}/${totalBatches}`,
        durationMs: batchMs,
        msPerChunk: Math.round(batchMs / batchTexts.length),
      });

      allEmbeddings.push(...batchEmbeddings);
    }

    return allEmbeddings;
  }

  /**
   * Queue a batch of texts to the worker and return a Promise that resolves
   * when the worker finishes this batch.
   * @private
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  _sendBatch(texts) {
    return new Promise((resolve, reject) => {
      this._pending.push({ texts, resolve, reject });
      this._processNext();
    });
  }
  /**
   * Gracefully terminate the worker thread.
   *
   * Rejects all pending requests with a "disposed" error, then calls
   * worker.terminate().  Safe to call multiple times — no-op when the worker
   * was never started or has already been terminated.
   *
   * worker.terminate() causes the worker to exit with code 1 — this is normal
   * Node.js behaviour.  The _disposing flag prevents the exit handler from
   * treating this as an unexpected crash.
   *
   * Use in test teardown (afterAll) to prevent Jest open-handle warnings.
   *
   * @returns {Promise<void>}
   */
  async dispose() {
    if (this._disposing) return;
    if (!this._worker) return;

    this._disposing = true;

    const disposeErr = new Error('EmbeddingProvider disposed');
    const pending = this._pending.splice(0);
    for (const { reject: rej } of pending) rej(disposeErr);

    const worker = this._worker;
    this._worker = null;
    this._busy = false;

    await worker.terminate();
  }
}

module.exports = LocalEmbeddingProvider;
