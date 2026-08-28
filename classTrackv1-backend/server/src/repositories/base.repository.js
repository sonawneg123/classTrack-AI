/**
 * server/src/repositories/base.repository.js
 *
 * Shared helpers that every domain repository inherits.
 * All SQL touches this file or a domain repository — never a controller.
 *
 * PostgreSQL notes vs. the old MySQL version:
 *   - Parameters are $1, $2, … (not ?)
 *   - `INSERT ... RETURNING id` replaces `result.insertId`
 *   - `INSERT INTO ... (cols) VALUES (...)` replaces `INSERT INTO ... SET ?`
 *   - `UPDATE ... SET col = $1` replaces `UPDATE ... SET ?`
 *   - Backtick identifiers removed (PG uses double-quotes or unquoted identifiers)
 *   - Boolean columns stored as BOOLEAN; no TINYINT(1) coercion needed
 */
const { pool } = require('../database/connection');

class BaseRepository {
  constructor(tableName) {
    this.table = tableName;
    this.pool  = pool;
  }

  /** Run any raw query, returns [rows, fields]. */
  async query(sql, params = []) {
    return this.pool.query(sql, params);
  }

  /** Find one row by primary key. Returns the row or null. */
  async findById(id) {
    const [rows] = await this.pool.query(
      `SELECT * FROM ${this.table} WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  /** Find one row matching a single column = value. */
  async findOneBy(column, value) {
    const [rows] = await this.pool.query(
      `SELECT * FROM ${this.table} WHERE ${column} = $1 LIMIT 1`,
      [value]
    );
    return rows[0] || null;
  }

  /** Count rows matching a column = value. */
  async countBy(column, value) {
    const [[{ n }]] = await this.pool.query(
      `SELECT COUNT(*) AS n FROM ${this.table} WHERE ${column} = $1`,
      [value]
    );
    return Number(n);
  }

  /** Count all rows. */
  async count() {
    const [[{ n }]] = await this.pool.query(
      `SELECT COUNT(*) AS n FROM ${this.table}`
    );
    return Number(n);
  }

  /**
   * Generic INSERT.
   * Builds `INSERT INTO table (col1, col2, ...) VALUES ($1, $2, ...) RETURNING id`
   * Returns the inserted id.
   */
  async create(data) {
    const keys   = Object.keys(data);
    const values = Object.values(data);
    const cols   = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const [rows] = await this.pool.query(
      `INSERT INTO ${this.table} (${cols}) VALUES (${placeholders}) RETURNING id`,
      values
    );
    return rows[0].id;
  }

  /**
   * Generic UPDATE by id.
   * Builds `UPDATE table SET col1 = $1, col2 = $2, ... WHERE id = $N`
   * Returns affectedRows (rowCount in pg).
   */
  async updateById(id, data) {
    const keys   = Object.keys(data);
    const values = Object.values(data);
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const [rows] = await this.pool.query(
      `UPDATE ${this.table} SET ${setClauses} WHERE id = $${keys.length + 1} RETURNING id`,
      [...values, id]
    );
    return rows.length;
  }

  /** Soft-toggle a boolean column by id. */
  async toggleBoolById(id, column) {
    await this.pool.query(
      `UPDATE ${this.table} SET ${column} = NOT ${column} WHERE id = $1`,
      [id]
    );
  }

  // ---------------------------------------------------------------------
  // Account lockout helpers — shared by admins/teachers/students, which
  // all carry the same (failed_login_attempts, locked_until) columns.
  // ---------------------------------------------------------------------

  /** Increments failed_login_attempts and returns the new count. */
  async incrementFailedAttempts(id) {
    const [rows] = await this.pool.query(
      `UPDATE ${this.table} SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1
       RETURNING failed_login_attempts`,
      [id]
    );
    return rows[0].failed_login_attempts;
  }

  /** Resets the failed-attempt counter and clears any active lockout — called on a successful login. */
  async resetFailedAttempts(id) {
    await this.pool.query(
      `UPDATE ${this.table} SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [id]
    );
  }

  /** Locks the account until the given Date. */
  async lockUntil(id, until) {
    await this.pool.query(
      `UPDATE ${this.table} SET locked_until = $1 WHERE id = $2`,
      [until, id]
    );
  }

  /** True if the account currently has an active lockout. */
  isCurrentlyLocked(account) {
    return !!account.locked_until && new Date(account.locked_until) > new Date();
  }
}

module.exports = BaseRepository;
