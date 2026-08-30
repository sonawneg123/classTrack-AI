/**
 * server/src/repositories/chapter.repository.js
 */
const BaseRepository = require('./base.repository');

class ChapterRepository extends BaseRepository {
  constructor() { super('chapters'); }

  async listBySubject(subjectId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT id, subject_id, name, description, order_index, created_at, updated_at
       FROM chapters
       WHERE subject_id = $1 AND teacher_id = $2 AND deleted_at IS NULL
       ORDER BY order_index ASC, name ASC`,
      [subjectId, teacherId]
    );
    return rows;
  }

  async findOwnedById(id, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM chapters
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
      [id, teacherId]
    );
    return rows[0] || null;
  }

  async createForTeacher(teacherId, subjectId, { name, description, orderIndex }) {
    const [rows] = await this.pool.query(
      `INSERT INTO chapters (subject_id, teacher_id, name, description, order_index)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, description, order_index, subject_id, created_at`,
      [subjectId, teacherId, name, description || null, orderIndex ?? 0]
    );
    return rows[0];
  }

  async softDeleteOwned(id, teacherId) {
    const [rows] = await this.pool.query(
      `UPDATE chapters SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, teacherId]
    );
    return rows.length > 0;
  }

  /**
   * Hard-delete a chapter; cascades to topics → knowledge_documents
   * → knowledge_chunks via FK ON DELETE CASCADE.
   *
   * @param {number} id
   * @param {number} teacherId
   * @param {object} [client]  Optional pg transaction client
   * @returns {Promise<boolean>}
   */
  async hardDeleteOwned(id, teacherId, client) {
    const executor = client || this.pool;
    const [rows] = await executor.query(
      `DELETE FROM chapters
       WHERE id = $1 AND teacher_id = $2
       RETURNING id`,
      [id, teacherId]
    );
    return rows.length > 0;
  }
}

module.exports = new ChapterRepository();
