/**
 * server/src/repositories/teacher.repository.js
 *
 * PostgreSQL-compatible. Parameter placeholders are $1, $2, …
 */
const BaseRepository = require('./base.repository');

class TeacherRepository extends BaseRepository {
  constructor() { super('teachers'); }

  async findByEmail(email) {
    return this.findOneBy('email', email.trim().toLowerCase());
  }

  async findByMobile(mobileNumber) {
    const [rows] = await this.pool.query(
      `SELECT * FROM teachers WHERE mobile_number = $1 LIMIT 1`,
      [mobileNumber]
    );
    return rows[0] || null;
  }

  async existsByEmail(email) {
    return (await this.countBy('email', email.trim().toLowerCase())) > 0;
  }

  async existsByMobile(mobileNumber) {
    return (await this.countBy('mobile_number', mobileNumber)) > 0;
  }

  async updateLastLogin(id) {
    return this.updateById(id, { last_login_at: new Date() });
  }

  async markEmailVerified(id) {
    return this.updateById(id, { email_verified_at: new Date() });
  }

  async listWithClassroomCount({ limit, offset }) {
    const [rows] = await this.pool.query(
      `SELECT t.id, t.name, t.email, t.mobile_number, t.is_active, t.created_at,
              t.last_login_at, t.created_by,
              COUNT(DISTINCT c.id) AS classroom_count,
              json_agg(
                json_build_object('id', c.id, 'name', c.name)
                ORDER BY c.created_at
              ) FILTER (WHERE c.id IS NOT NULL) AS classrooms
       FROM teachers t
       LEFT JOIN classrooms c ON c.teacher_id = t.id AND c.deleted_at IS NULL
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = await this.count();
    return { rows, total };
  }

  /** Find teacher with classroom info for admin detail view. */
  async findWithClassrooms(teacherId) {
    const [rows] = await this.pool.query(
      `SELECT t.id, t.name, t.email, t.mobile_number, t.is_active, t.created_at,
              t.last_login_at, t.email_verified_at,
              json_agg(
                json_build_object('id', c.id, 'name', c.name, 'classCode', c.class_code)
                ORDER BY c.created_at
              ) FILTER (WHERE c.id IS NOT NULL) AS classrooms
       FROM teachers t
       LEFT JOIN classrooms c ON c.teacher_id = t.id AND c.deleted_at IS NULL
       WHERE t.id = $1
       GROUP BY t.id`,
      [teacherId]
    );
    return rows[0] || null;
  }

  async toggleActive(id) {
    return this.toggleBoolById(id, 'is_active');
  }

  async setActive(id, isActive) {
    return this.updateById(id, { is_active: isActive });
  }

  async updatePassword(id, passwordHash) {
    return this.updateById(id, { password_hash: passwordHash });
  }

  /** Assign a teacher to a specific classroom (set classroom's teacher_id). */
  async assignClassroom(teacherId, classroomId) {
    await this.pool.query(
      `UPDATE classrooms SET teacher_id = $1, updated_at = NOW() WHERE id = $2`,
      [teacherId, classroomId]
    );
  }

  /** Remove a teacher from a classroom (set classroom teacher_id to NULL is not allowed by FK —
   *  so instead we use a placeholder admin-managed approach: leave unassigned means
   *  we need a different approach. For now, we document: classrooms require a teacher_id.
   *  "Remove from classroom" means assigning a different teacher or setting up a placeholder.
   *  We expose a raw query for this admin operation. */
  async removeFromClassroom(classroomId) {
    // This sets deleted_at so the classroom is effectively unlinked from daily use
    // without violating the NOT NULL FK constraint on classrooms.teacher_id.
    // The admin must reassign to a real teacher to reactivate.
    await this.pool.query(
      `UPDATE classrooms SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [classroomId]
    );
  }
}

module.exports = new TeacherRepository();
