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

  /**
   * Acquire a pg client for transactions.
   *
   * The raw client returned by _pgPool.connect() has a .query() that returns
   * a QueryResult object.  All repositories use the mysql2 destructuring
   * pattern `const [rows] = await executor.query(...)`, which expects an
   * array tuple [rows, fields].  We wrap the client so its .query() returns
   * the same [rows, fields] format as pool.query above.
   */
  async connect() {
    const client = await _pgPool.connect();
    // Preserve the original query method so BEGIN/COMMIT/ROLLBACK calls
    // (which are made directly on the client in service files) still work.
    const originalQuery = client.query.bind(client);

    // Wrap .query() to return [rows, fields] matching the pool.query() shim.
    client.query = async (sql, params) => {
      const result = await originalQuery(sql, params);
      return [result.rows, result.fields || []];
    };

    // Wrap .release() to RESTORE the original .query() before returning the
    // client to _pgPool.  Without this, _pgPool.query() reuses the returned
    // client but calls our [rows, fields] wrapper instead of the raw
    // QueryResult-returning query — causing pool.query() to hang forever.
    const originalRelease = client.release.bind(client);
    client.release = (err) => {
      client.query = originalQuery;   // restore raw query before pool reuse
      client.release = originalRelease; // restore original release too
      return originalRelease(err);
    };

    return client;
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
