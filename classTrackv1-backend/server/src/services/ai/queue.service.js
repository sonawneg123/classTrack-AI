/**
 * server/src/services/ai/queue.service.js
 *
 * In-process AI job queue: concurrency cap + exponential-backoff retries.
 * All values come from config — no hardcoded numbers.
 */
const config = require('../../config');
const logger = require('../../utils/logger.util');

const { queueConcurrency: MAX_CONCURRENT, maxRetries: MAX_ATTEMPTS, baseRetryDelayMs: BASE_DELAY } = config.ai;

let active = 0;
const pending = [];

function _backoffDelay(attempt) {
  return BASE_DELAY * 2 ** (attempt - 1);
}

function _runNext() {
  if (active >= MAX_CONCURRENT || pending.length === 0) return;

  const job = pending.shift();
  active++;

  job.task()
    .then((result) => {
      active--;
      job.resolve(result);
      _runNext();
    })
    .catch((err) => {
      active--;
      job.attempt++;

      if (job.attempt < MAX_ATTEMPTS) {
        const delay = _backoffDelay(job.attempt);
        logger.warn('AI job failed, retrying', {
          label: job.label, attempt: job.attempt, maxAttempts: MAX_ATTEMPTS,
          retryInMs: delay, error: err.message,
        });
        setTimeout(() => { pending.push(job); _runNext(); }, delay);
      } else {
        logger.error('AI job permanently failed', {
          label: job.label, attempts: MAX_ATTEMPTS, error: err.message,
        });
        if (job.onFinalFailure) job.onFinalFailure(err).catch(() => {});
        job.reject(err);
      }
      _runNext();
    });
}

/**
 * Enqueue an async task.
 * @param {() => Promise}  task            The async work to execute
 * @param {string}         label           For logging
 * @param {Function}       [onFinalFailure] Called once after all retries exhausted
 */
function enqueue(task, label, onFinalFailure) {
  return new Promise((resolve, reject) => {
    pending.push({ task, label, attempt: 0, resolve, reject, onFinalFailure });
    _runNext();
  });
}

function getStats() {
  return { active, pending: pending.length, maxConcurrent: MAX_CONCURRENT };
}

module.exports = { enqueue, getStats };
