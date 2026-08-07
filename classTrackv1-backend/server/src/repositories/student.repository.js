/**
 * server/src/repositories/student.repository.js
 */
const BaseRepository = require('./base.repository');

class StudentRepository extends BaseRepository {
  constructor() { super('students'); }

  async findByUsername(username) {
    const [rows] = await this.pool.query(
      `SELECT s.*, c.name AS classroom_name
       FROM students s
       JOIN classrooms c ON c.id = s.classroom_id
       WHERE s.username = ? LIMIT 1`,
      [username.trim().toLowerCase()]
    );
    return rows[0] || null;
  }

  async findByUsernameInClassroom(username, classroomId) {
    return this.findOneBy('username', username.trim().toLowerCase());
  }

  async existsByUsername(username) {
    return (await this.countBy('username', username.trim().toLowerCase())) > 0;
  }

  async updateLastLogin(id) {
    return this.updateById(id, { last_login_at: new Date() });
  }

  async updatePassword(id, passwordHash) {
    return this.updateById(id, { password_hash: passwordHash });
  }

  async listByClassroom(classroomId) {
    const [rows] = await this.pool.query(
      'SELECT id, name, username FROM students WHERE classroom_id = ? ORDER BY name',
      [classroomId]
    );
    return rows;
  }
}

module.exports = new StudentRepository();
