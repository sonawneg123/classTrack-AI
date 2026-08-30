/**
 * server/src/repositories/questionBank.repository.js
 *
 * Data access for the question_bank table.
 * All queries that touch teacher-owned data include teacher_id scoping
 * via JOIN through the topics → chapters → subjects → curricula chain.
 *
 * Status lifecycle:
 *   generated → validated → pending_approval → approved → published
 *   Side-paths: rejected, archived
 */
const BaseRepository = require('./base.repository');
const crypto = require('crypto');

/** MD5 of lower-trimmed text — used for duplicate detection. */
function textHash(text) {
  return crypto.createHash('md5').update(text.toLowerCase().trim()).digest('hex');
}

class QuestionBankRepository extends BaseRepository {
  constructor() { super('question_bank'); }

  // ── Create ───────────────────────────────────────────────────────────────────

  /**
   * Insert a single validated question.
   * Throws on duplicate (unique index idx_qb_dedup).
   *
   * @param {object} q  Validated question data
   * @returns {Promise<object>}  The inserted row { id, status, created_at }
   */
  async insert(q) {
    const hash = textHash(q.questionText);
    const [rows] = await this.pool.query(
      `INSERT INTO question_bank
         (question_type, difficulty, marks,
          question_text, options, correct_answer, explanation,
          curriculum_id, subject_id, chapter_id, topic_id,
          source_document_id, source_chunk_id,
          generation_model, generation_provider, generation_prompt_version,
          status,
          created_by, created_by_role,
          text_hash)
       VALUES
         ($1,  $2,  $3,
          $4,  $5,  $6,  $7,
          $8,  $9,  $10, $11,
          $12, $13,
          $14, $15, $16,
          'pending_approval',
          $17, $18,
          $19)
       RETURNING id, status, created_at`,
      [
        q.questionType,
        q.difficulty,
        q.marks ?? 1.00,
        q.questionText,
        q.options ? JSON.stringify(q.options) : null,
        q.correctAnswer,
        q.explanation || null,
        q.curriculumId,
        q.subjectId,
        q.chapterId,
        q.topicId,
        q.sourceDocumentId,
        q.sourceChunkId,
        q.generationModel,
        q.generationProvider || 'groq',
        q.generationPromptVersion || 'v1',
        q.createdBy,
        q.createdByRole,
        hash,
      ]
    );
    return rows[0];
  }

  // ── Ownership-aware reads ─────────────────────────────────────────────────────

  /**
   * List questions for a topic.  For teachers, returns all statuses.
   * For students, returns only 'published'.
   *
   * @param {number}  topicId
   * @param {number}  teacherId      — used for ownership JOIN
   * @param {object}  [opts]
   * @param {string}  [opts.status]  — filter by status
   * @param {boolean} [opts.publishedOnly]
   */
  async listByTopic(topicId, teacherId, opts = {}) {
    const params = [topicId, teacherId];
    const conditions = [
      'q.topic_id = $1',
      'q.curriculum_id IN (SELECT id FROM curricula WHERE teacher_id = $2 AND deleted_at IS NULL)',
    ];

    if (opts.publishedOnly) {
      conditions.push(`q.status = 'published'`);
    } else if (opts.status) {
      params.push(opts.status);
      conditions.push(`q.status = $${params.length}`);
    }

    params.push(params.length + 1); // placeholder for LIMIT — not used here
    // Remove unused placeholder
    params.pop();

    const [rows] = await this.pool.query(
      `SELECT
         q.id, q.question_type, q.difficulty, q.marks,
         q.question_text, q.options, q.correct_answer, q.explanation,
         q.status,
         q.curriculum_id, q.subject_id, q.chapter_id, q.topic_id,
         q.source_document_id, q.source_chunk_id,
         q.generation_model, q.generation_provider, q.generation_prompt_version,
         q.created_by, q.created_by_role, q.approved_by, q.approved_at,
         q.rejected_reason,
         q.created_at, q.updated_at
       FROM question_bank q
       WHERE ${conditions.join(' AND ')}
       ORDER BY q.created_at DESC`,
      params
    );
    return rows;
  }

  /**
   * List questions in the teacher review queue.
   * Returns all questions with status IN ('pending_approval', 'approved')
   * for all topics owned by the given teacher.
   *
   * Optionally filter by a single status via opts.status.
   *
   * @param {number} teacherId
   * @param {object} [opts]
   * @param {string} [opts.status]  — filter to a specific status
   */
  async listReviewQueue(teacherId, opts = {}) {
    const params = [teacherId];
    let statusFilter = `q.status IN ('pending_approval', 'approved')`;

    if (opts.status) {
      params.push(opts.status);
      statusFilter = `q.status = $${params.length}`;
    }

    const [rows] = await this.pool.query(
      `SELECT
         q.id, q.question_type, q.difficulty, q.marks,
         q.question_text, q.options, q.correct_answer, q.explanation,
         q.status,
         q.topic_id, q.chapter_id, q.subject_id, q.curriculum_id,
         q.source_document_id, q.source_chunk_id,
         q.generation_model, q.created_by, q.created_by_role,
         q.approved_by, q.approved_at, q.rejected_reason,
         q.created_at, q.updated_at,
         t.name AS topic_name,
         ch.name AS chapter_name,
         s.name  AS subject_name,
         cu.name AS curriculum_name
       FROM question_bank q
       JOIN topics    t  ON t.id  = q.topic_id
       JOIN chapters  ch ON ch.id = q.chapter_id
       JOIN subjects  s  ON s.id  = q.subject_id
       JOIN curricula cu ON cu.id = q.curriculum_id
       WHERE ${statusFilter}
         AND cu.teacher_id = $1
         AND cu.deleted_at IS NULL
       ORDER BY q.created_at ASC`,
      params
    );
    return rows;
  }

  /**
   * @deprecated Use listReviewQueue instead.
   * Kept for backwards compatibility with existing callers.
   */
  async listPendingApproval(teacherId) {
    return this.listReviewQueue(teacherId, { status: 'pending_approval' });
  }

  /**
   * List all published questions for a teacher across all their topics.
   * Enriched with topic/chapter/subject/curriculum names.
   *
   * @param {number} teacherId
   * @param {object} [opts]
   * @param {number} [opts.topicId]   — optional topic filter
   */
  async listPublishedForTeacher(teacherId, opts = {}) {
    const params = [teacherId];
    const conditions = [
      `q.status = 'published'`,
      `cu.teacher_id = $1`,
      `cu.deleted_at IS NULL`,
    ];

    if (opts.topicId) {
      params.push(opts.topicId);
      conditions.push(`q.topic_id = $${params.length}`);
    }

    const [rows] = await this.pool.query(
      `SELECT
         q.id, q.question_type, q.difficulty, q.marks,
         q.question_text, q.options, q.correct_answer, q.explanation,
         q.status,
         q.topic_id, q.chapter_id, q.subject_id, q.curriculum_id,
         q.source_document_id, q.source_chunk_id,
         q.generation_model, q.created_by, q.created_by_role,
         q.approved_by, q.approved_at,
         q.created_at, q.updated_at,
         t.name AS topic_name,
         ch.name AS chapter_name,
         s.name  AS subject_name,
         cu.name AS curriculum_name
       FROM question_bank q
       JOIN topics    t  ON t.id  = q.topic_id
       JOIN chapters  ch ON ch.id = q.chapter_id
       JOIN subjects  s  ON s.id  = q.subject_id
       JOIN curricula cu ON cu.id = q.curriculum_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY q.topic_id ASC, q.created_at DESC`,
      params
    );
    return rows;
  }

  /**
   * Find a question by id, ensuring it belongs to the given teacher's
   * curriculum chain.
   */
  async findByIdForTeacher(id, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT q.*
       FROM question_bank q
       JOIN curricula cu ON cu.id = q.curriculum_id
       WHERE q.id = $1
         AND cu.teacher_id = $2
         AND cu.deleted_at IS NULL`,
      [id, teacherId]
    );
    return rows[0] || null;
  }

  /**
   * Find a question by id; returns it only if it is published
   * AND in a curriculum belonging to the given teacher.
   *
   * Used by students — they can only see published questions.
   * teacherId here is the teacher who owns the curriculum.
   */
  async findPublishedById(id, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT q.*
       FROM question_bank q
       JOIN curricula cu ON cu.id = q.curriculum_id
       WHERE q.id = $1
         AND cu.teacher_id = $2
         AND cu.deleted_at IS NULL
         AND q.status = 'published'`,
      [id, teacherId]
    );
    return rows[0] || null;
  }

  // ── Status transitions ────────────────────────────────────────────────────────

  /**
   * Generic status update for a teacher-owned question.
   * Extra fields (approvedBy, approvedAt, rejectedReason) may be passed.
   */
  async updateStatus(id, teacherId, newStatus, extra = {}) {
    const sets = ['status = $1', 'updated_at = NOW()'];
    const params = [newStatus, id, teacherId];

    if (extra.approvedBy) {
      sets.push(`approved_by = $${params.length + 1}`);
      params.push(extra.approvedBy);
    }
    if (extra.approvedAt) {
      sets.push(`approved_at = $${params.length + 1}`);
      params.push(extra.approvedAt);
    }
    if (extra.rejectedReason !== undefined) {
      sets.push(`rejected_reason = $${params.length + 1}`);
      params.push(extra.rejectedReason);
    }

    const [rows] = await this.pool.query(
      `UPDATE question_bank
       SET ${sets.join(', ')}
       WHERE id = $2
         AND curriculum_id IN (
           SELECT id FROM curricula WHERE teacher_id = $3 AND deleted_at IS NULL
         )
       RETURNING id, status, updated_at`,
      params
    );
    return rows[0] || null;
  }

  // ── Duplicate detection ───────────────────────────────────────────────────────

  /**
   * Check whether a question with the same normalised text already exists
   * for the given topic (across any non-archived status).
   */
  async existsDuplicate(topicId, questionText) {
    const hash = textHash(questionText);
    const [rows] = await this.pool.query(
      `SELECT id FROM question_bank
       WHERE topic_id = $1 AND text_hash = $2 AND status <> 'archived'
       LIMIT 1`,
      [topicId, hash]
    );
    return rows.length > 0;
  }

  /**
   * List all questions created by a specific student across all topics,
   * optionally filtered by topic.
   *
   * This is the "my questions" view — the student can see every question they
   * generated regardless of its current status (pending_approval, approved,
   * published, rejected, archived).
   *
   * Ownership is double-scoped:
   *   1. created_by = studentId AND created_by_role = 'student'
   *   2. curriculum owned by the student's classroom teacher
   *      (prevents a student from seeing questions from another school's
   *       curriculum that somehow shares the same student id).
   *
   * @param {number} studentId
   * @param {number} studentTeacherId  — teacher_id of the student's classroom
   * @param {object} [opts]
   * @param {number} [opts.topicId]    — optional topic filter
   */
  async listByStudent(studentId, studentTeacherId, opts = {}) {
    const params = [studentId, studentTeacherId];
    const conditions = [
      `q.created_by = $1`,
      `q.created_by_role = 'student'`,
      `q.curriculum_id IN (SELECT id FROM curricula WHERE teacher_id = $2 AND deleted_at IS NULL)`,
    ];

    if (opts.topicId) {
      params.push(opts.topicId);
      conditions.push(`q.topic_id = $${params.length}`);
    }

    const [rows] = await this.pool.query(
      `SELECT
         q.id, q.question_type, q.difficulty, q.marks,
         q.question_text, q.options, q.correct_answer, q.explanation,
         q.status,
         q.curriculum_id, q.subject_id, q.chapter_id, q.topic_id,
         q.source_document_id, q.source_chunk_id,
         q.generation_model, q.generation_provider,
         q.created_by, q.created_by_role, q.approved_by, q.approved_at,
         q.rejected_reason,
         q.created_at, q.updated_at
       FROM question_bank q
       WHERE ${conditions.join(' AND ')}
       ORDER BY q.created_at DESC`,
      params
    );
    return rows;
  }

  /**
   * List published questions for a topic, accessible to students whose
   * classroom teacher owns the curriculum.
   *
   * @param {number} topicId
   * @param {number} studentTeacherId — the teacher_id of the student's classroom
   */
  async listPublishedForStudent(topicId, studentTeacherId) {
    const [rows] = await this.pool.query(
      `SELECT
         q.id, q.question_type, q.difficulty, q.marks,
         q.question_text, q.options, q.correct_answer, q.explanation,
         q.topic_id, q.chapter_id, q.subject_id, q.curriculum_id,
         q.created_at
       FROM question_bank q
       JOIN curricula cu ON cu.id = q.curriculum_id
       WHERE q.topic_id = $1
         AND cu.teacher_id = $2
         AND cu.deleted_at IS NULL
         AND q.status = 'published'
       ORDER BY q.difficulty ASC, q.created_at DESC`,
      [topicId, studentTeacherId]
    );
    return rows;
  }
  /**
   * Count the number of published questions for a topic owned by a teacher.
   * Used by the batch-add endpoint to validate requested counts.
   *
   * @param {number} topicId
   * @param {number} teacherId
   * @returns {Promise<number>}
   */
  async countPublishedByTopic(topicId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS n
       FROM question_bank q
       JOIN curricula cu ON cu.id = q.curriculum_id
       WHERE q.topic_id = $1
         AND cu.teacher_id = $2
         AND cu.deleted_at IS NULL
         AND q.status = 'published'`,
      [topicId, teacherId]
    );
    return Number(rows[0].n);
  }

  /**
   * Select up to `count` published questions from a topic, excluding any IDs
   * in `excludeIds`. Uses ORDER BY RANDOM() for quick-select mode.
   *
   * @param {number}   topicId
   * @param {number}   teacherId
   * @param {number}   count
   * @param {number[]} excludeIds  — question IDs already in the quiz
   * @returns {Promise<object[]>}  Array of question rows
   */
  async selectPublishedRandom(topicId, teacherId, count, excludeIds) {
    const params = [topicId, teacherId, count];
    let excludeClause = '';
    if (excludeIds && excludeIds.length) {
      excludeClause = `AND q.id NOT IN (${excludeIds.map((_, i) => `$${params.length + i + 1}`).join(', ')})`;
      excludeIds.forEach(id => params.push(id));
    }
    const [rows] = await this.pool.query(
      `SELECT
         q.id, q.question_type, q.difficulty, q.marks,
         q.question_text, q.options, q.correct_answer, q.explanation,
         q.status, q.topic_id, q.chapter_id, q.subject_id, q.curriculum_id,
         q.created_by, q.created_by_role, q.created_at
       FROM question_bank q
       JOIN curricula cu ON cu.id = q.curriculum_id
       WHERE q.topic_id = $1
         AND cu.teacher_id = $2
         AND cu.deleted_at IS NULL
         AND q.status = 'published'
         ${excludeClause}
       ORDER BY RANDOM()
       LIMIT $3`,
      params
    );
    return rows;
  }

  /**
   * Select specific published questions by their IDs, ensuring they belong to
   * the teacher's curriculum chain and have status='published'.
   *
   * @param {number[]} questionIds
   * @param {number}   teacherId
   * @returns {Promise<object[]>}
   */
  async selectPublishedByIds(questionIds, teacherId) {
    if (!questionIds.length) return [];
    const placeholders = questionIds.map((_, i) => `$${i + 2}`).join(', ');
    const [rows] = await this.pool.query(
      `SELECT q.id, q.question_type, q.difficulty, q.marks,
              q.question_text, q.options, q.correct_answer, q.explanation,
              q.status, q.topic_id, q.chapter_id, q.subject_id, q.curriculum_id
       FROM question_bank q
       JOIN curricula cu ON cu.id = q.curriculum_id
       WHERE q.id IN (${placeholders})
         AND cu.teacher_id = $1
         AND cu.deleted_at IS NULL
         AND q.status = 'published'`,
      [teacherId, ...questionIds]
    );
    return rows;
  }

  /**
   * List all 'practice' questions created by a specific student.
   * Optionally filtered by topic.
   *
   * IDOR protection: only questions where created_by = studentId AND
   *   created_by_role = 'student' AND status = 'practice' are returned.
   *
   * @param {number} studentId
   * @param {object} [opts]
   * @param {number} [opts.topicId]
   */
  async listPracticeByStudent(studentId, opts = {}) {
    const params = [studentId];
    const conditions = [
      `q.created_by = $1`,
      `q.created_by_role = 'student'`,
      `q.status = 'practice'`,
    ];

    if (opts.topicId) {
      params.push(opts.topicId);
      conditions.push(`q.topic_id = $${params.length}`);
    }

    const [rows] = await this.pool.query(
      `SELECT
         q.id, q.question_type, q.difficulty, q.marks,
         q.question_text, q.options, q.correct_answer, q.explanation,
         q.status,
         q.curriculum_id, q.subject_id, q.chapter_id, q.topic_id,
         q.source_document_id, q.source_chunk_id,
         q.generation_model, q.generation_provider,
         q.created_by, q.created_by_role,
         q.created_at, q.updated_at
       FROM question_bank q
       WHERE ${conditions.join(' AND ')}
       ORDER BY q.created_at DESC`,
      params
    );
    return rows;
  }

  /**
   * Find a single 'practice' question by id, owned by the given student.
   * Used for student practice attempts — strict ownership.
   *
   * @param {number} id
   * @param {number} studentId
   */
  async findPracticeByIdForStudent(id, studentId) {
    const [rows] = await this.pool.query(
      `SELECT q.*
       FROM question_bank q
       WHERE q.id = $1
         AND q.created_by = $2
         AND q.created_by_role = 'student'
         AND q.status = 'practice'`,
      [id, studentId]
    );
    return rows[0] || null;
  }
}

module.exports = new QuestionBankRepository();
module.exports.textHash = textHash;
