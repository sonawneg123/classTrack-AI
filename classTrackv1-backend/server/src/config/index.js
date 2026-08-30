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
    port:     Number(process.env.DB_PORT) || 5432,
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
    // Default models are Groq-hosted. Override via GROQ_TEXT_MODEL / GROQ_VISION_MODEL env vars.
    textModel:   process.env.GROQ_TEXT_MODEL   || 'llama3-70b-8192',
    visionModel: process.env.GROQ_VISION_MODEL || 'llava-v1.5-7b-4096-preview',
    // LLM model used by the RAG pipeline (separate from grading model).
    ragModel:    process.env.GROQ_RAG_MODEL    || 'llama3-70b-8192',
  },

  embedding: {
    // Provider: 'local' (default, uses @xenova/transformers locally) or 'huggingface-api'.
    provider:    process.env.EMBEDDING_PROVIDER || 'local',
    // Model name — must match the provider.  For 'local', this is the
    // Xenova/ONNX-compatible model identifier from HuggingFace.
    model:       process.env.EMBEDDING_MODEL    || 'Xenova/all-MiniLM-L6-v2',
    // Vector dimension produced by the chosen model.
    // IMPORTANT: if you change the model you MUST also create a new Flyway
    // migration that ALTERs knowledge_chunks.embedding to vector(<new_dim>).
    dimension:   Number(process.env.EMBEDDING_DIMENSION) || 384,
  },

  rag: {
    // Stage 1: number of candidate chunks to retrieve from the vector index.
    // These are then filtered by similarity threshold and diversity rules.
    candidateK:   Number(process.env.RAG_CANDIDATE_K)     || 20,
    // Stage 2: maximum number of chunks to pass to the LLM as context.
    finalK:       Number(process.env.RAG_FINAL_K)         || 8,
    // Minimum cosine similarity (0–1) required to include a chunk.
    // Chunks with similarity < this threshold are discarded before LLM call.
    // IMPORTANT: this is cosine SIMILARITY (1 - cosine distance), not distance.
    minSimilarity: Number(process.env.RAG_MIN_SIMILARITY) || 0.30,
    // Legacy alias kept so existing code that reads config.rag.topK still works.
    get topK() { return this.candidateK; },
    // Maximum characters allowed per knowledge document upload.
    maxDocChars:  Number(process.env.RAG_MAX_DOC_CHARS)   || 1_000_000,
    // Target tokens per chunk.
    chunkTokens:  Number(process.env.RAG_CHUNK_TOKENS)    || 512,
    // Overlap between consecutive chunks in tokens.
    overlapTokens: Number(process.env.RAG_OVERLAP_TOKENS) || 64,
    // Knowledge document upload dir (separate from submission uploads).
    uploadDir:    process.env.RAG_UPLOAD_DIR              || 'uploads/knowledge',
    // Maximum knowledge document size in MB.
    maxSizeMb:    Number(process.env.RAG_MAX_SIZE_MB)     || 50,
    // Maximum retry attempts before a document is permanently failed.
    maxRetries:   Number(process.env.RAG_MAX_RETRIES)     || 3,
  },

  questionGeneration: {
    // Maximum questions per single generation request.
    maxQuestionsPerRequest: Number(process.env.QG_MAX_QUESTIONS)    || 20,
    // Maximum context characters sent to the LLM in one request.
    maxContextChars:        Number(process.env.QG_MAX_CONTEXT_CHARS) || 12_000,
    // Maximum tokens the LLM may return per generation request.
    maxTokens:              Number(process.env.QG_MAX_TOKENS)        || 4096,
    // Timeout in ms for a single generation request.
    timeoutMs:              Number(process.env.QG_TIMEOUT_MS)        || 60_000,
    // Prompt version string embedded in every generated question row.
    promptVersion:          process.env.QG_PROMPT_VERSION            || 'v1',
    // Number of retrieval chunks passed as context.
    retrievalTopK:          Number(process.env.QG_RETRIEVAL_TOP_K)   || 20,
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
