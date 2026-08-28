/**
 * server/src/repositories/curriculum.repository.js
 *
 * Manages curricula — the top-level knowledge container owned by a teacher.
 * Every query enforces teacher ownership via teacher_id.
 */
const BaseRepository = require('./base.repository');

class CurriculumRepository extends BaseRepository {
  constructor() { super('curricula'); }

  async listByTeacher(teacherId) {
    const [rows] = await this.pool.query(
      `SELECT id, name, description, is_active, created_at, updated_at
       FROM curricula
       WHERE teacher_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [teacherId]
    );
    return rows;
  }

  async findOwnedById(id, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM curricula
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
      [id, teacherId]
    );
    return rows[0] || null;
  }

  async createForTeacher(teacherId, { name, description }) {
    const [rows] = await this.pool.query(
      `INSERT INTO curricula (teacher_id, name, description)
       VALUES ($1, $2, $3) RETURNING id, name, description, is_active, created_at`,
      [teacherId, name, description || null]
    );
    return rows[0];
  }

  async updateOwned(id, teacherId, { name, description }) {
    const [rows] = await this.pool.query(
      `UPDATE curricula SET name = $1, description = $2, updated_at = NOW()
       WHERE id = $3 AND teacher_id = $4 AND deleted_at IS NULL
       RETURNING id`,
      [name, description ?? null, id, teacherId]
    );
    return rows.length > 0;
  }

  async softDeleteOwned(id, teacherId) {
    const [rows] = await this.pool.query(
      `UPDATE curricula SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, teacherId]
    );
    return rows.length > 0;
  }
}

module.exports = new CurriculumRepository();
