/**
 * server/src/repositories/notification.repository.js
 *
 * PostgreSQL-compatible. Parameter placeholders are $1, $2, …
 * Boolean column is_read stored as BOOLEAN in PostgreSQL.
 */
const BaseRepository = require('./base.repository');

class NotificationRepository extends BaseRepository {
  constructor() { super('notifications'); }

  async insertOne({ recipientType, recipientId, classroomId, taskId, type, title, message }) {
    return this.pool.query(
      `INSERT INTO notifications (recipient_type, recipient_id, classroom_id, task_id, type, title, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [recipientType, recipientId, classroomId || null, taskId || null, type, title, message || null]
    );
  }

  async bulkInsertForClassroom(studentIds, { classroomId, taskId, type, title, message }) {
    if (!studentIds.length) return;
    // Build multi-row INSERT with sequential $N placeholders
    const placeholders = studentIds.map((_, i) => {
      const base = i * 6;
      return `('student', $${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6})`;
    }).join(', ');
    const values = studentIds.flatMap((id) => [id, classroomId, taskId || null, type, title, message || null]);
    return this.pool.query(
      `INSERT INTO notifications (recipient_type, recipient_id, classroom_id, task_id, type, title, message) VALUES ${placeholders}`,
      values
    );
  }

  async getActiveStudentIds(classroomId) {
    const [rows] = await this.pool.query(
      'SELECT id FROM students WHERE classroom_id = $1 AND is_active = TRUE',
      [classroomId]
    );
    return rows.map((r) => r.id);
  }

  async listForRecipient(recipientType, recipientId, { unreadOnly = false, limit = 30, offset = 0 } = {}) {
    const where = unreadOnly
      ? 'WHERE recipient_type = $1 AND recipient_id = $2 AND is_read = FALSE'
      : 'WHERE recipient_type = $1 AND recipient_id = $2';
    const [rows] = await this.pool.query(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [recipientType, recipientId, limit, offset]
    );
    const [[{ unreadcount }]] = await this.pool.query(
      'SELECT COUNT(*) AS unreadCount FROM notifications WHERE recipient_type = $1 AND recipient_id = $2 AND is_read = FALSE',
      [recipientType, recipientId]
    );
    return { notifications: rows, unreadCount: Number(unreadcount) };
  }

  async markRead(id, recipientType, recipientId) {
    return this.pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND recipient_type = $2 AND recipient_id = $3',
      [id, recipientType, recipientId]
    );
  }

  async markAllRead(recipientType, recipientId) {
    return this.pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE recipient_type = $1 AND recipient_id = $2 AND is_read = FALSE',
      [recipientType, recipientId]
    );
  }
}

module.exports = new NotificationRepository();
