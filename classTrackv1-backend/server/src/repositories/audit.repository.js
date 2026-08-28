/**
 * server/src/repositories/audit.repository.js
 *
 * PostgreSQL-compatible. Parameter placeholders are $1, $2, …
 */
const BaseRepository = require('./base.repository');

class AuditRepository extends BaseRepository {
  constructor() { super('audit_logs'); }

  async insert({ actorType, actorId, action, targetType, targetId, details }) {
    return this.pool.query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorType, actorId || null, action, targetType || null, targetId || null,
       details ? JSON.stringify(details) : null]
    );
  }

  async list({ limit, offset }) {
    const [rows] = await this.pool.query(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    const total = await this.count();
    return { logs: rows, total };
  }
}

module.exports = new AuditRepository();
