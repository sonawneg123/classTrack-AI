/**
 * server/src/database/connection.js
 *
 * PostgreSQL connection pool via the `pg` driver.
 *
 * Compatibility shim: the mysql2 pattern was `const [rows] = await pool.query(sql, params)`.
 * The `pg` driver returns a single Result object with `result.rows`.
 * We wrap the pool so `pool.query(sql, params)` returns `[rows, fields]`
 * matching the mysql2 destructuring pattern used throughout the repositories.
 */
const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger.util');

const _pgPool = new Pool({
  host:     config.db.host,
  port:     config.db.port,
  user:     config.db.user,
  password: config.db.password,
  database: config.db.name,
  max:      config.db.poolLimit,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Wraps pg pool.query to return [rows, fields] so all repositories can keep
 * the `const [rows] = await pool.query(...)` destructuring pattern unchanged.
 */
const pool = {
  /**
   * Execute a parameterised query.
   * @param {string} sql  - Query text with $1/$2/… placeholders
   * @param {Array}  [params=[]] - Bound parameter values
   * @returns {Promise<[Array, Array]>} - [rows, fields]
   */
  async query(sql, params = []) {
    const result = await _pgPool.query(sql, params);
    return [result.rows, result.fields || []];
  },

  /** Acquire a raw pg client for transactions. */
  async connect() {
    return _pgPool.connect();
  },

  /** End the pool (used in scripts like setup-db.js and seed.js). */
  async end() {
    return _pgPool.end();
  },
};

async function testConnection() {
  try {
    const client = await _pgPool.connect();
    logger.info('PostgreSQL connected', { database: config.db.name });
    client.release();
  } catch (err) {
    logger.error('PostgreSQL connection failed', { error: err.message });
  }
}

module.exports = { pool, testConnection };
