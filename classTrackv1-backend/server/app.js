/**
 * server/app.js
 *
 * Pure Express app factory — no server.listen() here.
 * Exported separately so it can be imported by integration tests
 * without starting a real TCP server.
 */
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const swaggerUi = require('swagger-ui-express');

const config       = require('./src/config');
const routes       = require('./src/routes');
const routesV1      = require('./src/routes/v1');
const swaggerSpec   = require('./src/config/swagger.config');
const requestId    = require('./src/middleware/requestId.middleware');
const httpLogger   = require('./src/middleware/httpLogger.middleware');
const errorHandler = require('./src/middleware/errorHandler.middleware');

const app = express();

// Correct req.ip when running behind a reverse proxy / load balancer
// (Nginx, AWS ELB, etc.) — needed for accurate rate-limiting and
// login-history / refresh-token IP logging.
app.set('trust proxy', 1);

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      config.server.clientUrl,
  credentials: true,
}));

// ── Request tracing ─────────────────────────────────────────────────────────
app.use(requestId);

// ── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── HTTP request logging ─────────────────────────────────────────────────────
app.use(httpLogger);

// ── Health check (no auth, no logging noise) ─────────────────────────────────
app.get('/api/health', (req, res) => res.json({
  success: true,
  message: 'ClassTrack AI API is running.',
  time:    new Date().toISOString(),
  env:     config.env,
}));

// ── API documentation (Swagger / OpenAPI) ────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'ClassTrack AI — Auth API Docs',
}));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// ── API routes ───────────────────────────────────────────────────────────────
// Legacy surface — unchanged, existing frontend keeps working exactly as before.
app.use('/api', routes);
// Versioned enterprise surface — new IAM module lives here.
app.use('/api/v1', routesV1);

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({
  success: false,
  message: `Route ${req.method} ${req.path} not found.`,
}));

// ── Centralised error handler (must be last) ─────────────────────────────────
app.use(errorHandler);

module.exports = app;
