/**
 * server/server.js
 *
 * Entrypoint: starts the HTTP server.
 * Separated from app.js so the app factory can be tested without
 * binding a real port.
 */
require('dotenv').config();
const app    = require('./app');
const config = require('./src/config');
const logger = require('./src/utils/logger.util');
const { testConnection } = require('./src/database/connection');

const PORT = config.server.port;

const server = app.listen(PORT, async () => {
  logger.info('🚀 ClassTrack AI API started', { port: PORT, env: config.env });
  await testConnection();
});

// Graceful shutdown — finish in-flight requests before exiting
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('Server closed. Process exiting.');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = server;
