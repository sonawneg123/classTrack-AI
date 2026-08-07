/**
 * server/src/repositories/base.repository.js
 *
 * Shared helpers that every domain repository inherits.
 * All SQL touches this file or a domain repository — never a controller.
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
      `SELECT * FROM \`${this.table}\` WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  /** Find one row matching a single column = value. */
  async findOneBy(column, value) {
    const [rows] = await this.pool.query(
      `SELECT * FROM \`${this.table}\` WHERE \`${column}\` = ? LIMIT 1`,
      [value]
    );
    return rows[0] || null;
  }

  /** Count rows matching a column = value. */
  async countBy(column, value) {
    const [[{ n }]] = await this.pool.query(
      `SELECT COUNT(*) AS n FROM \`${this.table}\` WHERE \`${column}\` = ?`,
      [value]
    );
    return Number(n);
  }

  /** Count all rows. */
  async count() {
    const [[{ n }]] = await this.pool.query(
      `SELECT COUNT(*) AS n FROM \`${this.table}\``
    );
    return Number(n);
  }

  /** Generic INSERT. Returns the insertId. */
  async create(data) {
    const [result] = await this.pool.query(
      `INSERT INTO \`${this.table}\` SET ?`,
      [data]
    );
    return result.insertId;
  }

  /** Generic UPDATE by id. Returns affectedRows. */
  async updateById(id, data) {
    const [result] = await this.pool.query(
      `UPDATE \`${this.table}\` SET ? WHERE id = ?`,
      [data, id]
    );
    return result.affectedRows;
  }

  /** Soft-toggle a boolean column by id. */
  async toggleBoolById(id, column) {
    await this.pool.query(
      `UPDATE \`${this.table}\` SET \`${column}\` = NOT \`${column}\` WHERE id = ?`,
      [id]
    );
  }

  // ---------------------------------------------------------------------
  // Account lockout helpers — shared by admins/teachers/students, which
  // all carry the same (failed_login_attempts, locked_until) columns.
  // ---------------------------------------------------------------------

  /** Increments failed_login_attempts and returns the new count. */
  async incrementFailedAttempts(id) {
    await this.pool.query(
      `UPDATE \`${this.table}\` SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?`,
      [id]
    );
    const [[{ failed_login_attempts }]] = await this.pool.query(
      `SELECT failed_login_attempts FROM \`${this.table}\` WHERE id = ?`,
      [id]
    );
    return failed_login_attempts;
  }

  /** Resets the failed-attempt counter and clears any active lockout — called on a successful login. */
  async resetFailedAttempts(id) {
    await this.pool.query(
      `UPDATE \`${this.table}\` SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
      [id]
    );
  }

  /** Locks the account until the given Date. */
  async lockUntil(id, until) {
    await this.pool.query(`UPDATE \`${this.table}\` SET locked_until = ? WHERE id = ?`, [until, id]);
  }

  /** True if the account currently has an active lockout. */
  isCurrentlyLocked(account) {
    return !!account.locked_until && new Date(account.locked_until) > new Date();
  }
}

module.exports = BaseRepository;
