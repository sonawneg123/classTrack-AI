/**
 * server/src/config/index.js
 *
 * Single source of truth for every runtime configuration value.
 * All values come from environment variables — nothing is hardcoded.
 * The module validates required variables at startup so the server
 * fails fast with a clear message instead of silently misbehaving later.
 */
require('dotenv').config();

const REQUIRED = [
  'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'JWT_SECRET', 'GROQ_API_KEY',
];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`[Config] Missing required environment variables: ${missing.join(', ')}`);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  server: {
    port: Number(process.env.PORT) || 5000,
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  },

  db: {
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name:     process.env.DB_NAME,
    poolLimit: Number(process.env.DB_POOL_LIMIT) || 10,
  },

  jwt: {
    // Legacy fields — unchanged, still used by the pre-v1 /api/auth routes
    // and by verifyToken()/signToken() for every existing token in the wild.
    secret:    process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',

    // Enterprise IAM (v1) — short-lived access token + rotating refresh token.
    accessTokenExpiresIn:  process.env.JWT_ACCESS_EXPIRES_IN  || '15m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    refreshTokenBytes:     Number(process.env.JWT_REFRESH_TOKEN_BYTES) || 64,
  },

  auth: {
    // Account lockout
    maxFailedLoginAttempts: Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS) || 5,
    lockoutDurationMinutes: Number(process.env.LOCKOUT_DURATION_MINUTES) || 15,

    // Email verification — OFF by default so existing seeded/legacy accounts
    // (created before this module existed) are never locked out of login.
    // Turn on once your SMTP config is production-ready.
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
    emailVerificationExpiresInHours: Number(process.env.EMAIL_VERIFICATION_EXPIRES_HOURS) || 24,

    // Forgot / reset password
    passwordResetExpiresInMinutes: Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES) || 60,
  },

  email: {
    // If SMTP_HOST is unset, emailService falls back to a console transport
    // (logs the email instead of sending it) — safe default for local/dev.
    host:     process.env.SMTP_HOST || null,
    port:     Number(process.env.SMTP_PORT) || 587,
    secure:   process.env.SMTP_SECURE === 'true',
    user:     process.env.SMTP_USER || null,
    password: process.env.SMTP_PASSWORD || null,
    fromAddress: process.env.EMAIL_FROM || 'no-reply@classtrack.ai',
    fromName:    process.env.EMAIL_FROM_NAME || 'ClassTrack AI',
  },

  groq: {
    apiKey:      process.env.GROQ_API_KEY,
    textModel:   process.env.GROQ_TEXT_MODEL   || 'openai/gpt-oss-120b',
    visionModel: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
  },

  upload: {
    maxSizeMb:  Number(process.env.MAX_UPLOAD_MB) || 15,
    uploadDir:  process.env.UPLOAD_DIR || 'uploads',
  },

  ai: {
    queueConcurrency: Number(process.env.AI_QUEUE_CONCURRENCY) || 3,
    gradingTemperature: 0.15,
    maxRetries: 3,
    baseRetryDelayMs: 1500,
  },

  rateLimit: {
    login:    { windowMs: 15 * 60 * 1000, max: 10 },
    register: { windowMs: 60 * 60 * 1000, max: 8  },
    global:   { windowMs: 60 * 1000,      max: 200 },
    refresh:  { windowMs: 15 * 60 * 1000, max: 30 },
    forgotPassword: { windowMs: 60 * 60 * 1000, max: 5 },
  },

  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug'),
    dir:   process.env.LOG_DIR   || 'logs',
  },
};

module.exports = config;
