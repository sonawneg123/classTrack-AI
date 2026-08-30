/**
 * server/tests/unit/setup.behavior.test.js
 *
 * Regression tests for tests/setup.js credential-isolation behaviour.
 *
 * Rules verified:
 *   1. Normal test runs (no REAL_DB_TESTS env var) use the safe in-process
 *      DB defaults, not any production credentials.
 *   2. When REAL_DB_TESTS=1, setup.js must NOT overwrite DB_* variables that
 *      are already present in the environment — the real-DB credentials are
 *      preserved for the pool to consume.
 *   3. No credential values are hardcoded in test source — the test itself
 *      does not contain passwords and only asserts that production values are
 *      NOT replaced.
 *
 * These tests isolate the module by manually invoking it in child processes
 * via `require` with a manipulated environment snapshot so they do not rely on
 * the order in which Jest runs setup files.
 */

'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');

/**
 * Run setup.js in an isolated Node.js subprocess with the given env overrides.
 * Returns the final values of the six DB/auth env vars as a plain object.
 */
function runSetupInIsolation(envOverrides = {}) {
  // Start from a minimal env (PATH only) so we don't accidentally inherit the
  // parent process's DB_* variables, then apply the caller's overrides.
  const env = {
    PATH: process.env.PATH || '',
    SystemRoot: process.env.SystemRoot || '',   // Windows needs this
    ...envOverrides,
  };

  const setupPath = path.resolve(__dirname, '../../tests/setup.js');

  // After running setup.js we print the vars as JSON so the parent can parse.
  const script = `
    require(${JSON.stringify(setupPath)});
    process.stdout.write(JSON.stringify({
      DB_HOST:     process.env.DB_HOST,
      DB_PORT:     process.env.DB_PORT,
      DB_USER:     process.env.DB_USER,
      DB_PASSWORD: process.env.DB_PASSWORD,
      DB_NAME:     process.env.DB_NAME,
      JWT_SECRET:  process.env.JWT_SECRET,
      GROQ_API_KEY:process.env.GROQ_API_KEY,
      NODE_ENV:    process.env.NODE_ENV,
    }));
  `;

  const stdout = execFileSync(process.execPath, ['-e', script], {
    env,
    timeout: 10_000,
    encoding: 'utf8',
  });

  return JSON.parse(stdout);
}

// ── Test group 1: normal (non-real-DB) runs ───────────────────────────────────

describe('tests/setup.js — normal test run (no REAL_DB_TESTS)', () => {
  let result;

  beforeAll(() => {
    // No DB_* vars, no REAL_DB_TESTS → setup.js should inject defaults.
    result = runSetupInIsolation({});
  });

  it('sets DB_USER to the safe test default (not a real username)', () => {
    expect(result.DB_USER).toBe('test_user');
  });

  it('sets DB_NAME to classtrack_test', () => {
    expect(result.DB_NAME).toBe('classtrack_test');
  });

  it('sets JWT_SECRET to the test sentinel', () => {
    expect(result.JWT_SECRET).toBe('test_jwt_secret_that_is_long_enough');
  });

  it('sets NODE_ENV to test', () => {
    expect(result.NODE_ENV).toBe('test');
  });

  it('does not hardcode a production password — DB_PASSWORD is the test placeholder', () => {
    expect(result.DB_PASSWORD).toBe('test_pass');
    // Confirm it is not a real-looking credential
    expect(result.DB_PASSWORD).not.toMatch(/classtrack_password/i);
  });
});

// ── Test group 2: real-DB runs (REAL_DB_TESTS=1) ──────────────────────────────

describe('tests/setup.js — REAL_DB_TESTS=1 run', () => {
  const REAL_CREDS = {
    REAL_DB_TESTS:  '1',
    DB_HOST:        'db.example.internal',
    DB_PORT:        '5432',
    DB_USER:        'classtrack',
    DB_PASSWORD:    'hunter2',       // sentinel — not a real password
    DB_NAME:        'classtrack_ai',
    JWT_SECRET:     'production_jwt_secret_placeholder',
    GROQ_API_KEY:   'gsk_placeholder',
  };

  let result;

  beforeAll(() => {
    result = runSetupInIsolation(REAL_CREDS);
  });

  it('does NOT overwrite DB_USER that was already in the environment', () => {
    expect(result.DB_USER).toBe('classtrack');
  });

  it('does NOT overwrite DB_PASSWORD that was already in the environment', () => {
    expect(result.DB_PASSWORD).toBe('hunter2');
  });

  it('does NOT overwrite DB_NAME that was already in the environment', () => {
    expect(result.DB_NAME).toBe('classtrack_ai');
  });

  it('does NOT overwrite DB_HOST that was already in the environment', () => {
    expect(result.DB_HOST).toBe('db.example.internal');
  });

  it('still sets JWT_SECRET when it was already present', () => {
    // The || guard means an existing value is kept.
    expect(result.JWT_SECRET).toBe('production_jwt_secret_placeholder');
  });

  it('still sets GROQ_API_KEY when it was already present', () => {
    expect(result.GROQ_API_KEY).toBe('gsk_placeholder');
  });

  it('still sets NODE_ENV (falls back to test when not provided)', () => {
    // NODE_ENV was not in REAL_CREDS, so it should default to 'test'.
    // (The real run would typically have NODE_ENV inherited from the shell.)
    expect(result.NODE_ENV).toBe('test');
  });

  it('does not inject test_user when REAL_DB_TESTS=1', () => {
    expect(result.DB_USER).not.toBe('test_user');
  });

  it('does not inject classtrack_test DB name when REAL_DB_TESTS=1', () => {
    expect(result.DB_NAME).not.toBe('classtrack_test');
  });
});

// ── Test group 3: REAL_DB_TESTS=1 but no DB_* vars in env ────────────────────
// Validates that setup.js does NOT silently inject defaults when in real-DB mode,
// because the pool must fail fast rather than connecting as test_user.

describe('tests/setup.js — REAL_DB_TESTS=1 without DB vars', () => {
  let result;

  beforeAll(() => {
    result = runSetupInIsolation({ REAL_DB_TESTS: '1' });
  });

  it('leaves DB_USER undefined when REAL_DB_TESTS=1 and no DB_USER is set', () => {
    // setup.js must not inject 'test_user' — the pool will fail with a clear
    // auth error rather than silently connecting to the wrong database.
    expect(result.DB_USER).toBeUndefined();
  });

  it('leaves DB_PASSWORD undefined when REAL_DB_TESTS=1 and no DB_PASSWORD is set', () => {
    expect(result.DB_PASSWORD).toBeUndefined();
  });
});
