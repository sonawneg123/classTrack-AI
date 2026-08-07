/**
 * server/src/database/connection.js
 *
 * mysql2 connection pool. Imported by every repository — never by
 * controllers or routes (that would violate separation of concerns).
 */
const mysql  = require('mysql2/promise');
const config = require('../config');
const logger = require('../utils/logger.util');

const pool = mysql.createPool({
  host:             config.db.host,
  port:             config.db.port,
  user:             config.db.user,
  password:         config.db.password,
  database:         config.db.name,
  waitForConnections: true,
  connectionLimit:  config.db.poolLimit,
  queueLimit:       0,
  dateStrings:      true,
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    logger.info('MySQL connected', { database: config.db.name });
    conn.release();
  } catch (err) {
    logger.error('MySQL connection failed', { error: err.message });
  }
}

module.exports = { pool, testConnection };
