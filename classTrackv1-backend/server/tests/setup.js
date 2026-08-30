/**
 * server/tests/setup.js
 *
 * Sets the minimum environment variables required by config/index.js
 * so tests can import the app without a real .env file.
 *
 * All tests mock the database connection layer — no live PostgreSQL
 * instance is required to run the standard test suite.
 *
 * REAL_DB_TESTS=1: when this flag is set, we must NOT overwrite the DB_*
 * variables because the real-DB integration tests depend on the credentials
 * that are already present in the environment (from the shell or from the
 * .env file loaded by config/index.js via dotenv).  We still set the
 * non-DB variables (JWT_SECRET, GROQ_API_KEY, NODE_ENV) that every test
 * file needs, only falling back to test-safe defaults when they are absent.
 */

const isRealDbRun = process.env.REAL_DB_TESTS === '1';

if (!isRealDbRun) {
  // Standard (mocked-DB) test run: provide safe in-memory DB coordinates so
  // tests that import config/index.js do not complain about missing vars.
  process.env.DB_HOST     = process.env.DB_HOST     || 'localhost';
  process.env.DB_PORT     = process.env.DB_PORT     || '5432';
  process.env.DB_USER     = process.env.DB_USER     || 'test_user';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test_pass';
  process.env.DB_NAME     = process.env.DB_NAME     || 'classtrack_test';
}

// Always set non-DB variables — real-DB tests also need a JWT secret and a
// dummy GROQ key so config/index.js validates successfully.
process.env.JWT_SECRET   = process.env.JWT_SECRET   || 'test_jwt_secret_that_is_long_enough';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test_groq_key';
process.env.NODE_ENV     = process.env.NODE_ENV     || 'test';
