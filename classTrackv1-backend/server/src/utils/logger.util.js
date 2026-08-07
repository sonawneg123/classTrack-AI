/**
 * server/src/utils/logger.util.js
 *
 * Structured, leveled logger using Winston.
 *
 * In production:  logs go to rotating daily files (combined + error-only)
 *                 as newline-delimited JSON — ready for Datadog, CloudWatch, etc.
 * In development: colourised, human-readable output in the terminal.
 *
 * Usage (anywhere in the codebase):
 *   const logger = require('../utils/logger.util');
 *   logger.info('Server started', { port: 5000 });
 *   logger.warn('Slow DB query', { durationMs: 620, query: '...' });
 *   logger.error('AI grading failed', { submissionId: 42, error: err.message });
 *
 * NEVER log: passwords, JWT tokens, full request bodies containing credentials,
 * or the raw Groq API key.
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs   = require('fs');
const config = require('../config');

const logDir = path.resolve(process.cwd(), config.logging.dir);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Shared metadata added to every log entry
const sharedMeta = format((info) => {
  info.service = 'classtrack-api';
  info.env     = config.env;
  return info;
});

const devFormat = format.combine(
  sharedMeta(),
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length
      ? '  ' + JSON.stringify(meta)
      : '';
    return `${timestamp} [${level}] ${message}${extra}`;
  })
);

const prodFormat = format.combine(
  sharedMeta(),
  format.timestamp(),
  format.errors({ stack: true }),
  format.json()
);

const logger = createLogger({
  level: config.logging.level,
  format: config.isProduction ? prodFormat : devFormat,
  transports: config.isProduction
    ? [
        new transports.File({
          filename: path.join(logDir, 'error.log'),
          level:    'error',
          maxsize:  10 * 1024 * 1024, // 10 MB
          maxFiles: 7,
          tailable: true,
        }),
        new transports.File({
          filename: path.join(logDir, 'combined.log'),
          maxsize:  10 * 1024 * 1024,
          maxFiles: 14,
          tailable: true,
        }),
      ]
    : [new transports.Console()],
});

module.exports = logger;
