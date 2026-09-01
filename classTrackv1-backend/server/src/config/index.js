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
    candidateK:   Number(process.env.RAG_CANDIDATE_K)         || 20,
    // Sprint 2: number of candidate chunks for keyword (FTS) retrieval.
    keywordCandidateK: Number(process.env.RAG_KEYWORD_CANDIDATE_K) || 20,
    // Stage 2: maximum number of chunks to pass to the LLM as context.
    finalK:       Number(process.env.RAG_FINAL_K)             || 8,
    // Minimum cosine similarity (0–1) required to include a vector chunk.
    // Chunks with similarity < this threshold are discarded before LLM call.
    // IMPORTANT: this is cosine SIMILARITY (1 - cosine distance), not distance.
    minSimilarity: Number(process.env.RAG_MIN_SIMILARITY)     || 0.30,
    // Sprint 2: Reciprocal Rank Fusion constant k (default 60 per literature).
    // Higher k reduces the impact of rank differences between the two systems.
    rrfK:          Number(process.env.RAG_RRF_K)              || 60,
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

    // ── Sprint 2 Phase 2: Cross-Encoder Reranking ─────────────────────────────
    reranker: {
      // Set to false to disable reranking entirely (hybrid retrieval still works).
      enabled:    process.env.RAG_RERANKER_ENABLED !== 'false',
      // ONNX-compatible cross-encoder model from HuggingFace (Xenova namespace).
      // Xenova/ms-marco-MiniLM-L-6-v2 is a quantized cross-encoder for passage
      // relevance scoring; 6-layer MiniLM, ~22MB, fast inference.
      model:      process.env.RAG_RERANKER_MODEL      || 'Xenova/ms-marco-MiniLM-L-6-v2',
      // Number of top fused candidates to send to the cross-encoder.
      // Keep this small (≤20) to bound reranking latency.
      candidateK: Number(process.env.RAG_RERANKER_CANDIDATE_K) || 15,
    },
  },

  questionGeneration: {
    // Maximum questions per single generation request.
    maxQuestionsPerRequest: Number(process.env.QG_MAX_QUESTIONS)    || 20,
    // Hard character cap for the context body (fast pre-filter before token budget).
    // Conservative default: 3,500 chars.
    // Empirical calibration: observed ratio ~2.44 chars/token for full Groq request
    // payload.  3,500 chars / 2.0 c/t = 1,750 estimated context tokens — well within
    // any reasonable budget even for the smallest Groq free-tier limit (8,000 TPM).
    // Override via QG_MAX_CONTEXT_CHARS env var for larger-tier accounts.
    maxContextChars:        Number(process.env.QG_MAX_CONTEXT_CHARS) || 3_500,
    // Maximum tokens the LLM may return per generation request.
    // This is the absolute ceiling; the actual maxTokens passed to the provider is
    // dynamically set per-request to outputReserve (count-dependent) so that
    // input_tokens + max_completion_tokens always stays below the provider limit.
    maxTokens:              Number(process.env.QG_MAX_TOKENS)        || 4096,
    // Timeout in ms for a single generation request.
    timeoutMs:              Number(process.env.QG_TIMEOUT_MS)        || 60_000,
    // Prompt version string embedded in every generated question row.
    promptVersion:          process.env.QG_PROMPT_VERSION            || 'v1',
    // Number of retrieval chunks passed as context.
    retrievalTopK:          Number(process.env.QG_RETRIEVAL_TOP_K)   || 20,

    // ── LLM Context Budget ───────────────────────────────────────────────────
    // Effective request ceiling for the configured LLM provider tier.
    //
    // IMPORTANT: This is NOT the model's architectural context window.
    // This is the TPM/request-token limit that Groq enforces for your tier.
    // For Groq free tier (llama3-70b-8192): limit = 8,000 tokens.
    //
    // We set the effective ceiling to 6,500 (below 8,000) to provide a hard
    // safety margin against tokenizer approximation error.  The estimator uses
    // 2.0 chars/token but the empirically observed ratio is ~1.5-2.4 c/t,
    // meaning actual tokens can be higher than our estimate.  A 1,500-token
    // gap between our ceiling (6,500) and Groq's limit (8,000) absorbs this.
    llmContextWindowTokens: Number(process.env.QG_LLM_CONTEXT_WINDOW_TOKENS) || 6_500,
    // Tokens reserved for the system prompt (estimated at 2.0 c/t).
    systemPromptReserveTokens: Number(process.env.QG_SYSTEM_PROMPT_RESERVE_TOKENS) || 700,
    // Tokens reserved for the user-prompt scaffolding (topic/subject headers,
    // delimiters, generation instruction) -- does NOT include the context body.
    userPromptOverheadTokens: Number(process.env.QG_USER_PROMPT_OVERHEAD_TOKENS) || 200,
    // Tokens reserved per requested question for expected generated output.
    // A single MCQ with 4 options + explanation approx 120-180 tokens.
    // Using 250 per question gives a conservative safety margin.
    outputTokensPerQuestion: Number(process.env.QG_OUTPUT_TOKENS_PER_QUESTION) || 250,
    // Hard minimum output reserve even when count=1 (covers JSON scaffolding + wrapper).
    minOutputReserveTokens: Number(process.env.QG_MIN_OUTPUT_RESERVE_TOKENS) || 400,
    // Safety margin subtracted from the effective input budget.
    // Accounts for residual tokenizer approximation error.
    safetyMarginTokens: Number(process.env.QG_SAFETY_MARGIN_TOKENS) || 300,
  },

  upload: {
    maxSizeMb:      Number(process.env.MAX_UPLOAD_MB)        || 15,
    uploadDir:      process.env.UPLOAD_DIR                   || 'uploads',
    avatarMaxSizeMb: Number(process.env.AVATAR_MAX_SIZE_MB)  || 5,
    avatarDir:      process.env.AVATAR_UPLOAD_DIR            || 'uploads/avatars',
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
