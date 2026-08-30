/**
 * server/src/repositories/topic.repository.js
 */
const BaseRepository = require('./base.repository');

class TopicRepository extends BaseRepository {
  constructor() { super('topics'); }

  async listByChapter(chapterId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT id, chapter_id, name, description, order_index, created_at, updated_at
       FROM topics
       WHERE chapter_id = $1 AND teacher_id = $2 AND deleted_at IS NULL
       ORDER BY order_index ASC, name ASC`,
      [chapterId, teacherId]
    );
    return rows;
  }

  async findOwnedById(id, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM topics
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
      [id, teacherId]
    );
    return rows[0] || null;
  }

  async createForTeacher(teacherId, chapterId, { name, description, orderIndex }) {
    const [rows] = await this.pool.query(
      `INSERT INTO topics (chapter_id, teacher_id, name, description, order_index)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, description, order_index, chapter_id, created_at`,
      [chapterId, teacherId, name, description || null, orderIndex ?? 0]
    );
    return rows[0];
  }

  async softDeleteOwned(id, teacherId) {
    const [rows] = await this.pool.query(
      `UPDATE topics SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, teacherId]
    );
    return rows.length > 0;
  }

  /**
   * Hard-delete a topic; cascades to knowledge_documents → knowledge_chunks
   * via FK ON DELETE CASCADE.
   *
   * @param {number} id
   * @param {number} teacherId
   * @param {object} [client]  Optional pg transaction client
   * @returns {Promise<boolean>}
   */
  async hardDeleteOwned(id, teacherId, client) {
    const executor = client || this.pool;
    const [rows] = await executor.query(
      `DELETE FROM topics
       WHERE id = $1 AND teacher_id = $2
       RETURNING id`,
      [id, teacherId]
    );
    return rows.length > 0;
  }
}

module.exports = new TopicRepository();
