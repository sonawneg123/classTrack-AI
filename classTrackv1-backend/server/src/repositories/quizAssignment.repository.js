/**
 * server/src/repositories/quizAssignment.repository.js
 *
 * Data access layer for the quiz assignment tables:
 *   quiz_assignments           — quiz headers
 *   quiz_assignment_questions  — question join table
 *   quiz_assignment_attempts   — student attempt rows
 *
 * All teacher methods scope to teacher_id; all student methods scope to
 * the student's classroom membership — no cross-user data leakage.
 *
 * Sprint 7 — Teacher Quiz Assignment Workflow
 */

const BaseRepository = require('./base.repository');

class QuizAssignmentRepository extends BaseRepository {
  constructor() { super('quiz_assignments'); }

  // ── Teacher: Quiz CRUD ────────────────────────────────────────────────────────

  /**
   * Create a new quiz assignment draft.
   * Returns the full created row { id, title, status, created_at }.
   */
  async createQuiz({ teacherId, classroomId, title, instructions,
                     timeLimitMinutes, dueDate, shuffleQuestions, allowRetake }) {
    const [rows] = await this.pool.query(
      `INSERT INTO quiz_assignments
         (teacher_id, classroom_id, title, instructions,
          time_limit_minutes, due_date, shuffle_questions, allow_retake,
          status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
       RETURNING id, teacher_id, classroom_id, title, instructions,
                 time_limit_minutes, due_date, shuffle_questions, allow_retake,
                 status, created_at, updated_at`,
      [teacherId, classroomId, title, instructions ?? null,
       timeLimitMinutes ?? null, dueDate ?? null,
       shuffleQuestions ?? false, allowRetake ?? false]
    );
    return rows[0];
  }

  /**
   * List all non-deleted quiz assignments for a teacher.
   * Includes question_count and submitted attempt_count.
   */
  async listByTeacher(teacherId) {
    const [rows] = await this.pool.query(
      `SELECT
         qa.*,
         cl.name  AS classroom_name,
         (SELECT COUNT(*) FROM quiz_assignment_questions
          WHERE quiz_assignment_id = qa.id) AS question_count,
         (SELECT COUNT(DISTINCT student_id) FROM quiz_assignment_attempts
          WHERE quiz_assignment_id = qa.id AND status = 'submitted') AS attempt_count
       FROM quiz_assignments qa
       JOIN classrooms cl ON cl.id = qa.classroom_id
       WHERE qa.teacher_id = $1
         AND qa.deleted_at IS NULL
       ORDER BY qa.created_at DESC`,
      [teacherId]
    );
    return rows;
  }

  /**
   * Get a quiz with all its questions (teacher view).
   * Returns null if not found or teacher_id doesn't match.
   */
  async findByIdForTeacher(id, teacherId) {
    const [quizRows] = await this.pool.query(
      `SELECT qa.*, cl.name AS classroom_name
       FROM quiz_assignments qa
       JOIN classrooms cl ON cl.id = qa.classroom_id
       WHERE qa.id = $1
         AND qa.teacher_id = $2
         AND qa.deleted_at IS NULL
       LIMIT 1`,
      [id, teacherId]
    );
    if (!quizRows.length) return null;
    const quiz = quizRows[0];

    const [qRows] = await this.pool.query(
      `SELECT
         qaq.id AS quiz_question_id,
         qaq.order_index,
         qaq.marks_override,
         qb.id, qb.question_type, qb.difficulty, qb.marks,
         qb.question_text, qb.options, qb.correct_answer, qb.explanation,
         qb.status, qb.topic_id, qb.chapter_id, qb.subject_id, qb.curriculum_id,
         qb.created_by, qb.created_by_role, qb.created_at
       FROM quiz_assignment_questions qaq
       JOIN question_bank qb ON qb.id = qaq.question_id
       WHERE qaq.quiz_assignment_id = $1
       ORDER BY qaq.order_index ASC`,
      [id]
    );
    quiz.questions = qRows;
    return quiz;
  }

  /**
   * Update mutable fields on a draft quiz.
   * Only affects the specified fields; always sets updated_at.
   */
  async updateFields(id, teacherId, data) {
    const allowed = ['title','instructions','time_limit_minutes','due_date',
                     'shuffle_questions','allow_retake'];
    const keys   = Object.keys(data).filter(k => allowed.includes(k));
    if (!keys.length) return;
    const vals   = keys.map(k => data[k]);
    const set    = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const [rows] = await this.pool.query(
      `UPDATE quiz_assignments
       SET ${set}, updated_at = NOW()
       WHERE id = $${keys.length + 1}
         AND teacher_id = $${keys.length + 2}
         AND deleted_at IS NULL
       RETURNING id`,
      [...vals, id, teacherId]
    );
    return rows[0] || null;
  }

  /**
   * Update the status of a quiz.
   */
  async setStatus(id, teacherId, newStatus) {
    const [rows] = await this.pool.query(
      `UPDATE quiz_assignments
       SET status = $1, updated_at = NOW()
       WHERE id = $2
         AND teacher_id = $3
         AND deleted_at IS NULL
       RETURNING id, status`,
      [newStatus, id, teacherId]
    );
    return rows[0] || null;
  }

  /**
   * Soft-delete a quiz.
   */
  async softDelete(id, teacherId) {
    const [rows] = await this.pool.query(
      `UPDATE quiz_assignments
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1
         AND teacher_id = $2
         AND deleted_at IS NULL
       RETURNING id`,
      [id, teacherId]
    );
    return rows.length > 0;
  }

  // ── Teacher: Question management ──────────────────────────────────────────────

  /**
   * Count how many questions are already in the quiz.
   */
  async countQuestions(quizId) {
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS n FROM quiz_assignment_questions
       WHERE quiz_assignment_id = $1`,
      [quizId]
    );
    return Number(rows[0].n);
  }

  /**
   * Add a question to a quiz at the given order index.
   */
  async addQuestion(quizId, questionId, orderIndex, marksOverride) {
    const [rows] = await this.pool.query(
      `INSERT INTO quiz_assignment_questions
         (quiz_assignment_id, question_id, order_index, marks_override)
       VALUES ($1, $2, $3, $4)
       RETURNING id, quiz_assignment_id, question_id, order_index, marks_override`,
      [quizId, questionId, orderIndex, marksOverride ?? null]
    );
    return rows[0];
  }

  /**
   * Add multiple questions to a quiz in a single call, inside the caller's
   * transaction client. Each question gets the next sequential order_index.
   *
   * @param {object}   client        — pg PoolClient (transaction already open)
   * @param {number}   quizId
   * @param {number[]} questionIds   — already deduplicated, not in quiz yet
   * @param {number}   startIndex    — 1-based starting order_index
   * @returns {Promise<object[]>}    Inserted rows
   */
  async addQuestionsBatch(client, quizId, questionIds, startIndex) {
    if (!questionIds.length) return [];
    const rows = [];
    for (let i = 0; i < questionIds.length; i++) {
      // client.query() returns [rows, fields] (pool shim format), so destructure
      // directly: `inserted` IS the rows array, not a QueryResult object.
      const [inserted] = await client.query(
        `INSERT INTO quiz_assignment_questions
           (quiz_assignment_id, question_id, order_index, marks_override)
         VALUES ($1, $2, $3, NULL)
         ON CONFLICT (quiz_assignment_id, question_id) DO NOTHING
         RETURNING id, quiz_assignment_id, question_id, order_index, marks_override`,
        [quizId, questionIds[i], startIndex + i]
      );
      // `inserted` is already the rows array — use inserted[0], not inserted.rows[0]
      if (inserted[0]) rows.push(inserted[0]);
    }
    return rows;
  }

  /**
   * Remove a question from a quiz.
   */
  async removeQuestion(quizId, questionId) {
    const [rows] = await this.pool.query(
      `DELETE FROM quiz_assignment_questions
       WHERE quiz_assignment_id = $1
         AND question_id = $2
       RETURNING id`,
      [quizId, questionId]
    );
    return rows.length > 0;
  }

  /**
   * Reorder questions in a quiz.
   * orderedQuestionIds is an array of question_id values in the desired order.
   * Each gets order_index = its position (1-based) in the array.
   */
  async reorderQuestions(quizId, orderedQuestionIds) {
    // Build a VALUES list for a bulk UPDATE via a temporary inline table
    const values = orderedQuestionIds
      .map((qid, i) => `(${Number(qid)}, ${i + 1})`)
      .join(', ');
    await this.pool.query(
      `UPDATE quiz_assignment_questions AS qaq
       SET order_index = ord.new_order
       FROM (VALUES ${values}) AS ord(qid, new_order)
       WHERE qaq.quiz_assignment_id = $1
         AND qaq.question_id = ord.qid`,
      [quizId]
    );
  }

  // ── Teacher: Quiz by topic ────────────────────────────────────────────────────

  /**
   * List all non-deleted quiz assignments for a teacher that contain at least
   * one question from the given topic.
   * Scoped to teacherId — prevents IDOR.
   */
  async listByTopic(topicId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT DISTINCT
         qa.id, qa.title, qa.status, qa.classroom_id,
         cl.name AS classroom_name,
         qa.due_date, qa.allow_retake, qa.shuffle_questions,
         qa.created_at, qa.updated_at,
         (SELECT COUNT(*) FROM quiz_assignment_questions
          WHERE quiz_assignment_id = qa.id) AS question_count,
         (SELECT COUNT(DISTINCT student_id) FROM quiz_assignment_attempts
          WHERE quiz_assignment_id = qa.id AND status = 'submitted') AS attempt_count
       FROM quiz_assignments qa
       JOIN classrooms cl ON cl.id = qa.classroom_id
       JOIN quiz_assignment_questions qaq ON qaq.quiz_assignment_id = qa.id
       JOIN question_bank qb ON qb.id = qaq.question_id
       WHERE qa.teacher_id = $1
         AND qb.topic_id = $2
         AND qa.deleted_at IS NULL
       ORDER BY qa.created_at DESC`,
      [teacherId, topicId]
    );
    return rows;
  }

  // ── Teacher: Results ──────────────────────────────────────────────────────────

  /**
   * Get all submitted attempts for a quiz, scoped to the owning teacher.
   * Includes student identity and total attempt count per student.
   * Legacy method — kept for backward compatibility.
   */
  async getResultsForTeacher(quizId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT
         qaa.id, qaa.quiz_assignment_id, qaa.student_id,
         qaa.attempt_number, qaa.status, qaa.score, qaa.max_score,
         qaa.started_at, qaa.submitted_at,
         s.name     AS student_name,
         s.username AS student_username,
         (SELECT COUNT(*) FROM quiz_assignment_attempts
          WHERE quiz_assignment_id = qaa.quiz_assignment_id
            AND student_id = qaa.student_id) AS total_attempts
       FROM quiz_assignment_attempts qaa
       JOIN students          s  ON s.id  = qaa.student_id
       JOIN quiz_assignments  qa ON qa.id = qaa.quiz_assignment_id
       WHERE qaa.quiz_assignment_id = $1
         AND qa.teacher_id = $2
       ORDER BY s.name ASC, qaa.attempt_number ASC`,
      [quizId, teacherId]
    );
    return rows;
  }

  /**
   * Get the quiz header (with classroom + teacher metadata) scoped to the owner.
   * Used by the enriched results endpoint.
   */
  async getQuizHeaderForTeacher(quizId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT
         qa.id, qa.title, qa.classroom_id, qa.teacher_id,
         qa.allow_retake, qa.time_limit_minutes, qa.due_date, qa.status,
         cl.name AS classroom_name,
         t.name  AS teacher_name,
         (SELECT COALESCE(SUM(
            COALESCE(qaq.marks_override, qb.marks)
          ), 0)
          FROM quiz_assignment_questions qaq
          JOIN question_bank qb ON qb.id = qaq.question_id
          WHERE qaq.quiz_assignment_id = qa.id) AS max_score
       FROM quiz_assignments qa
       JOIN classrooms cl ON cl.id = qa.classroom_id
       JOIN teachers   t  ON t.id  = qa.teacher_id
       WHERE qa.id = $1
         AND qa.teacher_id = $2
         AND qa.deleted_at IS NULL
       LIMIT 1`,
      [quizId, teacherId]
    );
    return rows[0] || null;
  }

  /**
   * Get the list of students enrolled in the classroom associated with a quiz.
   * Scoped to the owning teacher to prevent IDOR.
   *
   * Returns every student, regardless of whether they attempted the quiz.
   */
  async getClassroomStudentsForQuiz(quizId, teacherId) {
    const [rows] = await this.pool.query(
      `SELECT s.id, s.name, s.username
       FROM students s
       JOIN classrooms cl  ON cl.id = s.classroom_id
       JOIN quiz_assignments qa ON qa.classroom_id = cl.id
       WHERE qa.id = $1
         AND qa.teacher_id = $2
         AND qa.deleted_at IS NULL
       ORDER BY s.name ASC`,
      [quizId, teacherId]
    );
    return rows;
  }

  /**
   * Get the "ranking attempt" for each student who submitted the quiz.
   *
   * Ranking rule (competition ranking):
   *   - When allow_retake = FALSE: only one attempt per student (attempt_number = 1).
   *   - When allow_retake = TRUE:  use the BEST submitted attempt (highest score).
   *     If two attempts have the same score, the LATEST (highest attempt_number) wins.
   *     This preserves history while using the student's personal best for ranking.
   *
   * Returns one row per student.
   * Rank is assigned with DENSE_RANK() so tied scores receive the same rank.
   *
   * NOT_ATTEMPTED students are excluded — they do not get a rank.
   */
  async getRankedSubmissionsForTeacher(quizId, teacherId) {
    const [rows] = await this.pool.query(
      `WITH best_attempt AS (
         -- Per (quiz, student): choose the attempt with the highest score.
         -- Tie-break: prefer the highest attempt_number (most recent).
         SELECT DISTINCT ON (qaa.student_id)
           qaa.id, qaa.quiz_assignment_id, qaa.student_id,
           qaa.attempt_number, qaa.status, qaa.score, qaa.max_score,
           qaa.started_at, qaa.submitted_at
         FROM quiz_assignment_attempts qaa
         JOIN quiz_assignments qa ON qa.id = qaa.quiz_assignment_id
         WHERE qaa.quiz_assignment_id = $1
           AND qa.teacher_id = $2
           AND qaa.status = 'submitted'
         ORDER BY qaa.student_id,
                  qaa.score DESC NULLS LAST,
                  qaa.attempt_number DESC
       )
       SELECT
         ba.*,
         s.name     AS student_name,
         s.username AS student_username,
         (SELECT COUNT(*) FROM quiz_assignment_attempts x
          WHERE x.quiz_assignment_id = $1
            AND x.student_id = ba.student_id)   AS total_attempts,
         DENSE_RANK() OVER (
           ORDER BY ba.score DESC NULLS LAST
         )::int AS rank
       FROM best_attempt ba
       JOIN students s ON s.id = ba.student_id
       ORDER BY rank ASC, s.name ASC`,
      [quizId, teacherId]
    );
    return rows;
  }

  /**
   * Get the detailed per-question results for a single student's specific attempt.
   *
   * Security: scoped to the quiz owner (teacherId) so Teacher A cannot read
   * attempts belonging to Teacher B's quiz.
   *
   * Returns one row per question in the quiz, including the student's answer,
   * correct answer, score awarded, and whether it was correct.
   */
  async getStudentAttemptDetail(quizId, studentId, attemptNumber, teacherId) {
    // First verify ownership and get attempt metadata
    const [attemptRows] = await this.pool.query(
      `SELECT
         qaa.id, qaa.attempt_number, qaa.status,
         qaa.score, qaa.max_score, qaa.started_at, qaa.submitted_at,
         s.id AS student_id, s.name AS student_name, s.username AS student_username
       FROM quiz_assignment_attempts qaa
       JOIN quiz_assignments  qa ON qa.id = qaa.quiz_assignment_id
       JOIN students          s  ON s.id  = qaa.student_id
       WHERE qaa.quiz_assignment_id = $1
         AND qaa.student_id = $2
         AND qaa.attempt_number = $3
         AND qa.teacher_id = $4
         AND qa.deleted_at IS NULL
       LIMIT 1`,
      [quizId, studentId, attemptNumber, teacherId]
    );
    if (!attemptRows.length) return null;
    const attempt = attemptRows[0];

    // Get the student's per-question answers from quiz_attempts (upserted on submit)
    // Cross-join with quiz questions to ensure ALL questions appear (even unanswered ones).
    const [questionRows] = await this.pool.query(
      `SELECT
         qaq.order_index,
         qb.id          AS question_id,
         qb.question_text,
         qb.question_type,
         qb.difficulty,
         qb.correct_answer,
         qb.explanation,
         COALESCE(qaq.marks_override, qb.marks) AS effective_marks,
         qa2.student_answer,
         qa2.is_correct,
         qa2.score
       FROM quiz_assignment_questions qaq
       JOIN question_bank qb ON qb.id = qaq.question_id
       LEFT JOIN quiz_attempts qa2
         ON qa2.question_id = qb.id
        AND qa2.student_id  = $2
       WHERE qaq.quiz_assignment_id = $1
       ORDER BY qaq.order_index ASC`,
      [quizId, studentId]
    );

    return {
      attempt,
      questions: questionRows,
    };
  }

  // ── Student: Quiz access ──────────────────────────────────────────────────────

  /**
   * List all published quizzes assigned to the student's classroom.
   * Includes latest attempt status/score via LATERAL join.
   */
  async listForStudent(studentId) {
    const [rows] = await this.pool.query(
      `SELECT
         qa.id, qa.title, qa.instructions, qa.time_limit_minutes, qa.due_date,
         qa.status, qa.allow_retake, qa.shuffle_questions, qa.created_at,
         cl.name AS classroom_name,
         (SELECT COUNT(*) FROM quiz_assignment_questions
          WHERE quiz_assignment_id = qa.id) AS question_count,
         latest_att.attempt_number  AS attempt_number,
         latest_att.status          AS attempt_status,
         latest_att.score           AS attempt_score,
         latest_att.max_score       AS attempt_max_score,
         latest_att.submitted_at    AS attempt_submitted_at
       FROM quiz_assignments qa
       JOIN classrooms cl ON cl.id = qa.classroom_id
       JOIN students   s  ON s.classroom_id = cl.id AND s.id = $1
       LEFT JOIN LATERAL (
         SELECT * FROM quiz_assignment_attempts
         WHERE quiz_assignment_id = qa.id
           AND student_id = $1
         ORDER BY attempt_number DESC
         LIMIT 1
       ) latest_att ON TRUE
       WHERE qa.status = 'published'
         AND qa.deleted_at IS NULL
       ORDER BY qa.due_date ASC NULLS LAST, qa.created_at DESC`,
      [studentId]
    );
    return rows;
  }

  /**
   * Get a single published quiz with all questions (student view).
   * Also attaches latest attempt via LATERAL join.
   * Returns null if not found or student's classroom does not match.
   */
  async findForStudent(quizId, studentId) {
    const [quizRows] = await this.pool.query(
      `SELECT
         qa.*, cl.name AS classroom_name,
         latest_att.id             AS latest_attempt_id,
         latest_att.attempt_number AS latest_attempt_number,
         latest_att.status         AS latest_attempt_status,
         latest_att.score          AS latest_attempt_score,
         latest_att.max_score      AS latest_attempt_max_score,
         latest_att.started_at     AS latest_attempt_started_at,
         latest_att.submitted_at   AS latest_attempt_submitted_at
       FROM quiz_assignments qa
       JOIN classrooms cl ON cl.id = qa.classroom_id
       JOIN students   s  ON s.classroom_id = cl.id AND s.id = $2
       LEFT JOIN LATERAL (
         SELECT * FROM quiz_assignment_attempts
         WHERE quiz_assignment_id = qa.id
           AND student_id = $2
         ORDER BY attempt_number DESC
         LIMIT 1
       ) latest_att ON TRUE
       WHERE qa.id = $1
         AND qa.status = 'published'
         AND qa.deleted_at IS NULL
       LIMIT 1`,
      [quizId, studentId]
    );
    if (!quizRows.length) return null;
    const quiz = quizRows[0];

    // Reshape flat latest_attempt_* columns into a nested object
    quiz.latest_attempt = quiz.latest_attempt_id != null ? {
      id:             quiz.latest_attempt_id,
      attempt_number: quiz.latest_attempt_number,
      status:         quiz.latest_attempt_status,
      score:          quiz.latest_attempt_score,
      max_score:      quiz.latest_attempt_max_score,
      started_at:     quiz.latest_attempt_started_at,
      submitted_at:   quiz.latest_attempt_submitted_at,
    } : null;
    delete quiz.latest_attempt_id;
    delete quiz.latest_attempt_number;
    delete quiz.latest_attempt_status;
    delete quiz.latest_attempt_score;
    delete quiz.latest_attempt_max_score;
    delete quiz.latest_attempt_started_at;
    delete quiz.latest_attempt_submitted_at;

    const [qRows] = await this.pool.query(
      `SELECT
         qaq.id AS quiz_question_id,
         qaq.order_index,
         qaq.marks_override,
         qb.id, qb.question_type, qb.difficulty, qb.marks,
         qb.question_text, qb.options, qb.correct_answer, qb.explanation,
         qb.topic_id, qb.chapter_id, qb.subject_id, qb.curriculum_id
       FROM quiz_assignment_questions qaq
       JOIN question_bank qb ON qb.id = qaq.question_id
       WHERE qaq.quiz_assignment_id = $1
       ORDER BY qaq.order_index ASC`,
      [quizId]
    );
    quiz.questions = qRows;
    return quiz;
  }

  // ── Student: Attempt management ───────────────────────────────────────────────

  /**
   * Insert a new attempt row (in_progress).
   * Returns the inserted row.
   */
  async insertAttempt({ quizId, studentId, status, score, maxScore,
                        startedAt, submittedAt, attemptNumber }) {
    const [rows] = await this.pool.query(
      `INSERT INTO quiz_assignment_attempts
         (quiz_assignment_id, student_id, status, score, max_score,
          started_at, submitted_at, attempt_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [quizId, studentId, status, score ?? null, maxScore ?? null,
       startedAt ?? new Date(), submittedAt ?? null, attemptNumber]
    );
    return rows[0];
  }

  /**
   * Update an existing attempt (used when submitting).
   */
  async updateAttempt(attemptId, data) {
    const allowed = ['status', 'score', 'max_score', 'submitted_at'];
    const keys   = Object.keys(data).filter(k => allowed.includes(k));
    if (!keys.length) return null;
    const vals   = keys.map(k => data[k]);
    const set    = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const [rows] = await this.pool.query(
      `UPDATE quiz_assignment_attempts
       SET ${set}
       WHERE id = $${keys.length + 1}
       RETURNING *`,
      [...vals, attemptId]
    );
    return rows[0] || null;
  }

  /**
   * Get the next attempt number for a (quiz, student) pair.
   * Returns 1 if no attempts exist yet.
   */
  async getNextAttemptNumber(quizId, studentId) {
    const [rows] = await this.pool.query(
      `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_num
       FROM quiz_assignment_attempts
       WHERE quiz_assignment_id = $1
         AND student_id = $2`,
      [quizId, studentId]
    );
    return Number(rows[0].next_num);
  }

  /**
   * Get the most recent attempt for a (quiz, student) pair.
   * Returns null if no attempts exist.
   */
  async getLatestAttempt(quizId, studentId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM quiz_assignment_attempts
       WHERE quiz_assignment_id = $1
         AND student_id = $2
       ORDER BY attempt_number DESC
       LIMIT 1`,
      [quizId, studentId]
    );
    return rows[0] || null;
  }

  /**
   * List all attempts for a (quiz, student) pair in chronological order.
   */
  async listAttemptsForStudent(quizId, studentId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM quiz_assignment_attempts
       WHERE quiz_assignment_id = $1
         AND student_id = $2
       ORDER BY attempt_number ASC`,
      [quizId, studentId]
    );
    return rows;
  }
}

module.exports = new QuizAssignmentRepository();
