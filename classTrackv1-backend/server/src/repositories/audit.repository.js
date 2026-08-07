/**
 * server/src/repositories/audit.repository.js
 */
const BaseRepository = require('./base.repository');

class AuditRepository extends BaseRepository {
  constructor() { super('audit_logs'); }

  async insert({ actorType, actorId, action, targetType, targetId, details }) {
    return this.pool.query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actorType, actorId || null, action, targetType || null, targetId || null,
       details ? JSON.stringify(details) : null]
    );
  }

  async list({ limit, offset }) {
    const [rows] = await this.pool.query(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const total = await this.count();
    return { logs: rows, total };
  }
}

module.exports = new AuditRepository();
