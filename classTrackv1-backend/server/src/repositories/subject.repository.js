/**
 * server/src/repositories/subject.repository.js
 */
const BaseRepository = require('./base.repository');

class SubjectRepository extends BaseRepository {
  constructor() { super('subjects'); }

  async listByCurriculum(curriculumId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT id, curriculum_id, name, description, created_at, updated_at
       FROM subjects
       WHERE curriculum_id = $1 AND teacher_id = $2 AND deleted_at IS NULL
       ORDER BY name ASC`,
      [curriculumId, teacherId]
    );
    return rows;
  }

  async findOwnedById(id, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM subjects
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
      [id, teacherId]
    );
    return rows[0] || null;
  }

  async createForTeacher(teacherId, curriculumId, { name, description }) {
    const [rows] = await this.pool.query(
      `INSERT INTO subjects (curriculum_id, teacher_id, name, description)
       VALUES ($1, $2, $3, $4) RETURNING id, name, description, curriculum_id, created_at`,
      [curriculumId, teacherId, name, description || null]
    );
    return rows[0];
  }

  async softDeleteOwned(id, teacherId) {
    const [rows] = await this.pool.query(
      `UPDATE subjects SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, teacherId]
    );
    return rows.length > 0;
  }

  /**
   * Hard-delete a subject; cascades to chapters → topics → knowledge_documents
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
      `DELETE FROM subjects
       WHERE id = $1 AND teacher_id = $2
       RETURNING id`,
      [id, teacherId]
    );
    return rows.length > 0;
  }
}

module.exports = new SubjectRepository();
