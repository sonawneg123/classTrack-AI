/**
 * server/src/repositories/notification.repository.js
 */
const BaseRepository = require('./base.repository');

class NotificationRepository extends BaseRepository {
  constructor() { super('notifications'); }

  async insertOne({ recipientType, recipientId, classroomId, taskId, type, title, message }) {
    return this.pool.query(
      `INSERT INTO notifications (recipient_type, recipient_id, classroom_id, task_id, type, title, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [recipientType, recipientId, classroomId || null, taskId || null, type, title, message || null]
    );
  }

  async bulkInsertForClassroom(studentIds, { classroomId, taskId, type, title, message }) {
    if (!studentIds.length) return;
    const placeholders = studentIds.map(() => "('student', ?, ?, ?, ?, ?, ?)").join(', ');
    const values = studentIds.flatMap((id) => [id, classroomId, taskId || null, type, title, message || null]);
    return this.pool.query(
      `INSERT INTO notifications (recipient_type, recipient_id, classroom_id, task_id, type, title, message) VALUES ${placeholders}`,
      values
    );
  }

  async getActiveStudentIds(classroomId) {
    const [rows] = await this.pool.query(
      'SELECT id FROM students WHERE classroom_id = ? AND is_active = 1',
      [classroomId]
    );
    return rows.map((r) => r.id);
  }

  async listForRecipient(recipientType, recipientId, { unreadOnly = false, limit = 30, offset = 0 } = {}) {
    const where = unreadOnly
      ? 'WHERE recipient_type = ? AND recipient_id = ? AND is_read = 0'
      : 'WHERE recipient_type = ? AND recipient_id = ?';
    const [rows] = await this.pool.query(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [recipientType, recipientId, limit, offset]
    );
    const [[{ unreadCount }]] = await this.pool.query(
      'SELECT COUNT(*) AS unreadCount FROM notifications WHERE recipient_type = ? AND recipient_id = ? AND is_read = 0',
      [recipientType, recipientId]
    );
    return { notifications: rows, unreadCount: Number(unreadCount) };
  }

  async markRead(id, recipientType, recipientId) {
    return this.pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_type = ? AND recipient_id = ?',
      [id, recipientType, recipientId]
    );
  }

  async markAllRead(recipientType, recipientId) {
    return this.pool.query(
      'UPDATE notifications SET is_read = 1 WHERE recipient_type = ? AND recipient_id = ? AND is_read = 0',
      [recipientType, recipientId]
    );
  }
}

module.exports = new NotificationRepository();
