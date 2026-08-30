/**
 * server/src/services/knowledge/reranker/CrossEncoderReranker.js
 *
 * Cross-encoder reranker using @xenova/transformers via a persistent worker thread.
 *
 * Architecture mirrors LocalEmbeddingProvider exactly:
 *   - One persistent worker thread
 *   - Model loaded once, reused for all subsequent requests
 *   - Concurrent callers queue requests; the worker processes them one at a time
 *   - Worker errors propagate cleanly to the caller
 *   - Worker exits (non-zero code) cause all pending requests to fail
 *   - Model-load failure resets state so the next call can retry
 *   - No new worker or model download per request
 *
 * The worker uses 'id'-correlated messages so that if the implementation is
 * ever extended to support parallel execution, reply routing remains correct.
 *
 * Usage:
 *   const reranker = new CrossEncoderReranker();
 *   const ranked   = await reranker.rerank(query, candidates);
 *   // ranked[i].rerankScore is the cross-encoder relevance score (higher = better)
 */
const { Worker } = require('worker_threads');
const path = require('path');
const Reranker = require('./Reranker');
const config = require('../../../config');
const logger = require('../../../utils/logger.util');

const WORKER_PATH = path.join(__dirname, 'rerankerWorker.js');

class CrossEncoderReranker extends Reranker {
  constructor() {
    super();
    this._model        = config.rag.reranker.model;
    this._worker       = null;
    this._pending      = new Map();  // requestId → { resolve, reject }
    this._queue        = [];         // Array<{ id, query, texts, resolve, reject }>
    this._busy         = false;      // true while the worker is processing a request
    this._startPromise = null;       // shared Promise for concurrent start callers
    this._startReject  = null;       // reject function for the _startPromise
    this._nextId       = 0;          // per-instance incrementing request correlation ID
    this._disposing    = false;      // true when dispose() is in progress or complete
  }

  // ── Worker lifecycle ────────────────────────────────────────────────────────

  /**
   * Lazily start the persistent worker thread.
   * Multiple concurrent callers share the same starting Promise — only one
   * worker is ever created.
   *
   * @returns {Promise<Worker>}
   */
  _getWorker() {
    if (this._worker) return Promise.resolve(this._worker);

    if (this._startPromise) return this._startPromise;

    this._startPromise = new Promise((resolve, reject) => {
      // Store the reject so dispose() can cancel a pending startup
      this._startReject = reject;

      logger.info('[Reranker] Starting worker thread…', { model: this._model });

      const worker = new Worker(WORKER_PATH);

      worker.once('online', () => {
        logger.info('[Reranker] Worker thread online.', { model: this._model });
        this._worker = worker;
        this._startPromise = null;
        this._startReject = null;
        resolve(worker);
      });

      worker.on('error', (err) => {
        logger.error('[Reranker] Worker thread error', {
          model: this._model,
          error: err.message,
          stack: err.stack,
        });
        this._worker = null;
        this._startPromise = null;
        this._startReject = null;
        this._busy = false;
        // Reject all pending + queued
        const allPending = [...this._pending.values()];
        this._pending.clear();
        this._queue.splice(0);
        for (const { reject: rej } of allPending) rej(err);
        reject(err);
      });

      worker.on('exit', (code) => {
        // An exit code of 1 is the normal result of worker.terminate().
        // Only treat non-zero exits as unexpected crashes when we are NOT
        // in the middle of an intentional disposal.
        if (code !== 0 && !this._disposing) {
          logger.warn('[Reranker] Worker exited with non-zero code', {
            code,
            model: this._model,
          });
          this._worker = null;
          this._startPromise = null;
          this._startReject = null;
          this._busy = false;
          const allPending = [...this._pending.values()];
          this._pending.clear();
          this._queue.splice(0);
          const exitErr = new Error(`Reranker worker exited with code ${code}`);
          for (const { reject: rej } of allPending) rej(exitErr);
        }
      });

      worker.on('message', (msg) => {
        this._busy = false;

        const item = this._pending.get(msg.id);
        if (!item) {
          logger.warn('[Reranker] Received reply for unknown request id', { id: msg.id });
          this._processNext();
          return;
        }
        this._pending.delete(msg.id);

        if (msg.type === 'result') {
          item.resolve(msg.scores);
        } else if (msg.type === 'error') {
          item.reject(new Error(`[RerankerWorker] ${msg.message}`));
        }

        this._processNext();
      });
    });

    return this._startPromise;
  }

  /**
   * Dequeue the next pending request and send it to the worker.
   * No-op if the worker is busy or the queue is empty.
   * @private
   */
  _processNext() {
    if (this._busy || this._queue.length === 0 || !this._worker) return;

    this._busy = true;
    const next = this._queue.shift();

    // Register the pending reply handler
    this._pending.set(next.id, { resolve: next.resolve, reject: next.reject });

    this._worker.postMessage({
      type:  'rerank',
      id:    next.id,
      model: this._model,
      query: next.query,
      texts: next.texts,
    });
  }

  // ── Reranker interface ──────────────────────────────────────────────────────

  /**
   * Score each (query, candidate.content) pair and return candidates sorted
   * descending by rerankScore.
   *
   * All original candidate metadata is preserved.  A `rerankScore` field is added.
   *
   * @param {string}   query
   * @param {object[]} candidates  Must have a `content` field.
   * @returns {Promise<object[]>}  Same shape + rerankScore, sorted descending.
   */
  async rerank(query, candidates) {
    if (!candidates || candidates.length === 0) return [];

    logger.debug('[Reranker] Reranking started', {
      model: this._model,
      candidateCount: candidates.length,
      queryLength: query.length,
    });

    const rerankStart = Date.now();

    // Ensure worker is running before queuing
    await this._getWorker();

    const texts = candidates.map((c) => c.content || '');
    const scores = await this._sendRequest(query, texts);

    const rerankMs = Date.now() - rerankStart;

    // Attach rerankScore to each candidate, preserving all existing fields
    const reranked = candidates.map((c, i) => ({
      ...c,
      rerankScore: scores[i],
    }));

    // Sort descending by rerankScore
    reranked.sort((a, b) => b.rerankScore - a.rerankScore);

    logger.debug('[Reranker] Reranking completed', {
      model: this._model,
      candidateCount: candidates.length,
      rerankMs,
    });

    return reranked;
  }

  /**
   * Queue a rerank request and return a Promise that resolves when the
   * worker finishes scoring.
   *
   * @private
   * @param {string}   query
   * @param {string[]} texts
   * @returns {Promise<number[]>}
   */
  _sendRequest(query, texts) {
    return new Promise((resolve, reject) => {
      const id = String(this._nextId++);
      this._queue.push({ id, query, texts, resolve, reject });
      this._processNext();
    });
  }

  /**
   * Gracefully terminate the worker thread.
   *
   * Rejects all pending and queued requests with a "disposed" error, then
   * calls worker.terminate().  Safe to call multiple times — no-op when the
   * worker was never started or has already been terminated.
   *
   * worker.terminate() causes the worker to exit with code 1 — this is normal
   * Node.js behavior.  The _disposing flag prevents the exit handler from
   * treating this as an unexpected crash or logging a spurious warning.
   *
   * Use in test teardown (`afterAll`) to prevent open-handle warnings.
   * Production code does not need to call this because the process exit
   * terminates the worker automatically.
   *
   * @returns {Promise<void>}
   */
  async dispose() {
    // Already disposed or never started — nothing to do
    if (this._disposing) return;
    if (!this._worker && !this._startPromise) return;

    // Mark as disposing BEFORE calling terminate() so the exit listener
    // knows this is intentional and does not log a spurious warning.
    this._disposing = true;

    const disposeErr = new Error('Reranker disposed');

    // Reject any queued requests that have not yet been sent
    const queued = this._queue.splice(0);
    for (const item of queued) {
      item.reject(disposeErr);
    }

    // Reject any in-flight requests waiting for a reply
    const pending = [...this._pending.values()];
    this._pending.clear();
    for (const item of pending) {
      item.reject(disposeErr);
    }

    // If the worker is still starting up (online not yet fired), reject the
    // start promise so concurrent _getWorker() callers do not hang forever.
    if (this._startPromise && this._startReject) {
      const rej = this._startReject;
      this._startPromise = null;
      this._startReject = null;
      rej(disposeErr);
    }

    const worker = this._worker;
    this._worker = null;
    this._busy = false;

    if (worker) {
      // terminate() resolves with the worker exit code.
      // The exit code will be 1 — that is expected and intentional.
      // The _disposing flag prevents the 'exit' listener from treating it
      // as a crash.
      await worker.terminate();
    }
  }
}

module.exports = CrossEncoderReranker;
