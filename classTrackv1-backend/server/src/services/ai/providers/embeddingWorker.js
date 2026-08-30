/**
 * server/src/services/ai/providers/embeddingWorker.js
 *
 * Worker thread that runs @xenova/transformers ONNX inference.
 *
 * WHY A WORKER THREAD?
 *   @xenova/transformers runs ONNX inference synchronously on the CPU.
 *   Each inference call (one text → one embedding) blocks the JavaScript
 *   thread for ~100–400 ms depending on text length and hardware.
 *
 *   On Node.js there is only one main event loop thread.  If ONNX inference
 *   runs there, every await, setTimeout, DB query, and I/O callback is frozen
 *   for the entire inference duration.  For a 200-chunk document that means
 *   the event loop is blocked for ~60–80 seconds — completely unacceptable.
 *
 *   Moving inference to a worker_threads Worker keeps the main event loop
 *   free so that:
 *     - HTTP requests are served normally while a document is being embedded
 *     - DB status updates resolve promptly
 *     - Multiple documents can be queued without starving each other
 *     - setInterval / setTimeout / poll loops keep firing
 *
 * PROTOCOL:
 *   Main thread sends:  { type: 'embed', texts: string[], model: string }
 *   Worker replies:     { type: 'result', embeddings: number[][] }
 *                    or { type: 'error',  message: string }
 *
 *   The worker is reusable: it loads the model once on the first request
 *   and keeps it warm for subsequent requests.  There is no teardown message
 *   because the worker's lifetime is tied to the parent process.
 */
const { parentPort } = require('worker_threads');

let pipeline = null;
let loadPromise = null;

async function getPipeline(model) {
  if (pipeline) return pipeline;
  if (!loadPromise) {
    loadPromise = (async () => {
      const { pipeline: createPipeline } = await import('@xenova/transformers');
      const p = await createPipeline('feature-extraction', model, { quantized: true });
      return p;
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  pipeline = await loadPromise;
  return pipeline;
}

parentPort.on('message', async (msg) => {
  if (msg.type !== 'embed') return;

  try {
    const pipe = await getPipeline(msg.model);
    const embeddings = [];
    for (const text of msg.texts) {
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      embeddings.push(Array.from(output.data));
    }
    parentPort.postMessage({ type: 'result', embeddings });
  } catch (err) {
    parentPort.postMessage({ type: 'error', message: err.message, stack: err.stack });
  }
});
