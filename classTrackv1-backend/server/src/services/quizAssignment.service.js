/**
 * server/src/services/quizAssignment.service.js
 *
 * Business logic layer for the quiz assignment workflow (Sprint 7).
 *
 * Teacher workflow:
 *   create (draft) → add published questions → publish → students receive → archive
 *
 * Student workflow:
 *   list assigned quizzes → start → answer questions → submit → auto-scored result
 *
 * Security invariants enforced here:
 *   - Teacher can only manage quizzes they own (teacher_id check)
 *   - Teacher can only add questions from their own published question bank
 *   - Student can only see/attempt quizzes from their classroom
 *   - Duplicate submission blocked by status='submitted' guard + transaction
 *   - Practice questions (status='practice') and pending questions CANNOT be added
 *
 * Each quiz submission also upserts into quiz_attempts (per-question table) so
 * the existing teacher quiz-results view continues to show these attempts.
 */

const { ApiError }     = require('../utils/response.util');
const logger           = require('../utils/logger.util');
const quizRepo         = require('../repositories/quizAssignment.repository');
const questionRepo     = require('../repositories/questionBank.repository');
const attemptRepo      = require('../repositories/quizAttempt.repository');
const { pool }         = require('../database/connection');
const { autoScore }    = require('../utils/scoring.util');

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Verify the quiz exists and belongs to the teacher. Returns the quiz.
 * Throws 404 if not found or wrong teacher.
 */
async function _requireOwnedQuiz(quizId, teacherId) {
  const quiz = await quizRepo.findByIdForTeacher(quizId, teacherId);
  if (!quiz) throw ApiError.notFound('Quiz assignment not found.');
  return quiz;
}

/**
 * Fisher-Yates in-place shuffle.
 */
function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Teacher operations ────────────────────────────────────────────────────────

/**
 * Create a new quiz assignment draft.
 * Validates the teacher owns the target classroom.
 */
async function createQuiz(teacherId, { classroomId, title, instructions,
                                       timeLimitMinutes, dueDate,
                                       shuffleQuestions, allowRetake }) {
  // Ownership check: classroom must belong to this teacher
  const [classRows] = await pool.query(
    `SELECT id FROM classrooms
     WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`,
    [classroomId, teacherId]
  );
  if (!classRows.length) {
    throw ApiError.notFound('Classroom not found or does not belong to you.');
  }

  const quiz = await quizRepo.createQuiz({
    teacherId, classroomId, title, instructions,
    timeLimitMinutes, dueDate, shuffleQuestions, allowRetake,
  });

  logger.info('[QuizAssignment] Created', { quizId: quiz.id, teacherId, classroomId });
  return quiz;
}

/**
 * List all quiz assignments for a teacher.
 */
async function listQuizzes(teacherId) {
  return quizRepo.listByTeacher(teacherId);
}

/**
 * Get a quiz assignment with its questions (teacher view).
 */
async function getQuiz(quizId, teacherId) {
  return _requireOwnedQuiz(quizId, teacherId);
}

/**
 * Update mutable fields on a draft quiz.
 * Throws if quiz is already published or archived.
 */
async function updateQuiz(quizId, teacherId, data) {
  const quiz = await _requireOwnedQuiz(quizId, teacherId);
  if (quiz.status !== 'draft') {
    throw ApiError.badRequest('Cannot edit a published or archived quiz.');
  }
  await quizRepo.updateFields(quizId, teacherId, data);
  return quizRepo.findByIdForTeacher(quizId, teacherId);
}

/**
 * Publish a draft quiz to students.
 * Requires at least 1 question and an active classroom.
 */
async function publishQuiz(quizId, teacherId) {
  const quiz = await _requireOwnedQuiz(quizId, teacherId);
  if (quiz.status !== 'draft') {
    throw ApiError.badRequest(`Cannot publish a quiz with status '${quiz.status}'.`);
  }

  const questionCount = await quizRepo.countQuestions(quizId);
  if (questionCount === 0) {
    throw ApiError.badRequest('Cannot publish a quiz with no questions.');
  }

  // Classroom must still be active
  const [classRows] = await pool.query(
    `SELECT id FROM classrooms
     WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [quiz.classroom_id]
  );
  if (!classRows.length) {
    throw ApiError.badRequest('The target classroom is inactive or deleted.');
  }

  await quizRepo.setStatus(quizId, teacherId, 'published');
  logger.info('[QuizAssignment] Published', { quizId, teacherId });
  return quizRepo.findByIdForTeacher(quizId, teacherId);
}

/**
 * Archive a quiz (stops students from seeing it).
 */
async function archiveQuiz(quizId, teacherId) {
  await _requireOwnedQuiz(quizId, teacherId);
  await quizRepo.setStatus(quizId, teacherId, 'archived');
  logger.info('[QuizAssignment] Archived', { quizId, teacherId });
}

/**
 * Soft-delete a quiz.
 */
async function deleteQuiz(quizId, teacherId) {
  await _requireOwnedQuiz(quizId, teacherId);
  await quizRepo.softDelete(quizId, teacherId);
  logger.info('[QuizAssignment] Deleted', { quizId, teacherId });
}

/**
 * Add a published question to a quiz.
 * Enforces:
 *   - quiz must be draft
 *   - question must be published and owned by this teacher
 *   - no duplicates
 *   - marksOverride (if provided) must be > 0
 */
async function addQuestion(quizId, teacherId, questionId, marksOverride) {
  const quiz = await _requireOwnedQuiz(quizId, teacherId);
  if (quiz.status !== 'draft') {
    throw ApiError.badRequest('Cannot add questions to a published or archived quiz.');
  }

  // Question must be owned by this teacher and published
  const question = await questionRepo.findByIdForTeacher(questionId, teacherId);
  if (!question) {
    throw ApiError.notFound('Question not found or does not belong to you.');
  }
  if (question.status !== 'published') {
    throw ApiError.badRequest(
      `Only published questions can be added to a quiz (current status: '${question.status}').`
    );
  }

  // Duplicate check
  const existing = quiz.questions.find(q => Number(q.id) === Number(questionId));
  if (existing) {
    throw ApiError.conflict('This question is already in the quiz.');
  }

  // Validate marks override
  if (marksOverride !== undefined && marksOverride !== null && marksOverride <= 0) {
    throw ApiError.badRequest('Marks override must be a positive number.');
  }

  const orderIndex = await quizRepo.countQuestions(quizId) + 1;
  const row = await quizRepo.addQuestion(quizId, questionId, orderIndex,
                                          marksOverride ?? null);

  logger.info('[QuizAssignment] Question added', { quizId, questionId, teacherId });
  return row;
}

/**
 * Add questions to a quiz in batch — supports two modes:
 *
 * A) QUICK SELECT: sources = [{ topicId, count }]
 *    For each source the backend selects `count` random published questions
 *    that are not already in the quiz.
 *
 * B) MANUAL SELECT: questionIds = [1, 2, 3, …]
 *    Exact list of question IDs to add; backend verifies each is published
 *    and owned by the teacher.
 *
 * The entire operation runs in a single transaction: if any source fails
 * validation, nothing is added.
 *
 * @param {number}    quizId
 * @param {number}    teacherId
 * @param {object}    opts
 * @param {Array}     [opts.sources]     — [{ topicId, count }]
 * @param {number[]}  [opts.questionIds] — explicit list of question IDs
 */
async function addQuestionsBatch(quizId, teacherId, { sources, questionIds }) {
  logger.debug('[QuizBatch] start', { quizId, teacherId,
    mode: questionIds ? 'manual' : 'quick-select',
    questionIds: questionIds ?? null,
    sources: sources ?? null,
  });

  const quiz = await _requireOwnedQuiz(quizId, teacherId);
  if (quiz.status !== 'draft') {
    throw ApiError.badRequest('Cannot add questions to a published or archived quiz.');
  }

  // ── MANUAL SELECT mode ─────────────────────────────────────────────────────
  if (questionIds && questionIds.length) {
    // Deduplicate requested IDs
    const uniqueIds = [...new Set(questionIds.map(Number))];

    // Already-in-quiz IDs
    const existingIds = new Set(quiz.questions.map(q => Number(q.id)));
    const newIds = uniqueIds.filter(id => !existingIds.has(id));

    logger.debug('[QuizBatch] manual mode', {
      quizId, teacherId,
      requested: uniqueIds,
      existingQuestionIds: [...existingIds],
      newIds,
    });

    if (newIds.length === 0) {
      throw ApiError.conflict('All requested questions are already in the quiz.');
    }

    // Verify each question is published and owned by this teacher
    const verified = await questionRepo.selectPublishedByIds(newIds, teacherId);
    logger.debug('[QuizBatch] verified published questions', {
      quizId, teacherId, requested: newIds.length, verified: verified.length,
    });

    if (verified.length !== newIds.length) {
      throw ApiError.badRequest(
        'One or more requested questions were not found, are not published, or do not belong to your curriculum.'
      );
    }

    const startIndex = await quizRepo.countQuestions(quizId) + 1;
    logger.debug('[QuizBatch] opening transaction', { quizId, teacherId, startIndex, newIds });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const added = await quizRepo.addQuestionsBatch(client, quizId, newIds, startIndex);
      await client.query('COMMIT');
      logger.info('[QuizBatch] manual batch committed', {
        quizId, teacherId, count: added.length,
      });
      return { added: added.length, quizId };
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('[QuizBatch] manual transaction rolled back', {
        quizId, teacherId, err: err.message, stack: err.stack,
      });
      throw err;
    } finally {
      client.release();
    }
  }

  // ── QUICK SELECT mode ──────────────────────────────────────────────────────
  if (!sources || !sources.length) {
    throw ApiError.badRequest('Provide either "sources" or "questionIds".');
  }

  // Already-in-quiz IDs (shared across all sources to prevent cross-source dupes)
  const existingIds = new Set(quiz.questions.map(q => Number(q.id)));

  // Resolve selected questions per source first (validates before any DB write)
  const sourceSelections = [];
  for (const { topicId, count } of sources) {
    if (!count || count <= 0) continue; // skip zero-count sources

    const available = await questionRepo.countPublishedByTopic(topicId, teacherId);
    if (available === 0) {
      throw ApiError.badRequest(
        `No published questions are available for topic #${topicId}.`
      );
    }

    // How many of the available are not yet in the quiz?
    // We need to count excluding already-added IDs from THIS batch too.
    const alreadyExcluded = [...existingIds];
    const effectiveAvailable = await (async () => {
      if (!alreadyExcluded.length) return available;
      // Count after exclusion
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS n
         FROM question_bank q
         JOIN curricula cu ON cu.id = q.curriculum_id
         WHERE q.topic_id = $1
           AND cu.teacher_id = $2
           AND cu.deleted_at IS NULL
           AND q.status = 'published'
           AND q.id NOT IN (${alreadyExcluded.map((_, i) => `$${i + 3}`).join(', ')})`,
        [topicId, teacherId, ...alreadyExcluded]
      );
      return Number(rows[0].n);
    })();

    if (count > effectiveAvailable) {
      throw ApiError.badRequest(
        `Only ${effectiveAvailable} published question(s) are available for topic #${topicId} ` +
        `(requested ${count}).`
      );
    }

    const selected = await questionRepo.selectPublishedRandom(
      topicId, teacherId, count, alreadyExcluded
    );

    if (selected.length < count) {
      throw ApiError.badRequest(
        `Could not find enough published questions for topic #${topicId} ` +
        `(found ${selected.length}, requested ${count}).`
      );
    }

    // Register selected IDs in existingIds to prevent cross-source duplicates
    selected.forEach(q => existingIds.add(Number(q.id)));
    sourceSelections.push(...selected.map(q => Number(q.id)));
  }

  if (!sourceSelections.length) {
    throw ApiError.badRequest('No questions were selected. Check that source counts are > 0.');
  }

  const startIndex = await quizRepo.countQuestions(quizId) + 1;
  logger.debug('[QuizBatch] quick-select opening transaction', {
    quizId, teacherId, startIndex, selectedQuestionIds: sourceSelections,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const added = await quizRepo.addQuestionsBatch(client, quizId, sourceSelections, startIndex);
    await client.query('COMMIT');
    logger.info('[QuizBatch] quick-select batch committed', {
      quizId, teacherId, count: added.length,
    });
    return { added: added.length, quizId };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('[QuizBatch] quick-select transaction rolled back', {
      quizId, teacherId, err: err.message, stack: err.stack,
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Remove a question from a quiz.
 * Quiz must be draft.
 */
async function removeQuestion(quizId, teacherId, questionId) {
  const quiz = await _requireOwnedQuiz(quizId, teacherId);
  if (quiz.status !== 'draft') {
    throw ApiError.badRequest('Cannot remove questions from a published or archived quiz.');
  }
  await quizRepo.removeQuestion(quizId, questionId);
  logger.info('[QuizAssignment] Question removed', { quizId, questionId, teacherId });
}

/**
 * Reorder questions in a quiz.
 * orderedQuestionIds must include all question IDs currently in the quiz.
 * Quiz must be draft.
 */
async function reorderQuestions(quizId, teacherId, orderedQuestionIds) {
  const quiz = await _requireOwnedQuiz(quizId, teacherId);
  if (quiz.status !== 'draft') {
    throw ApiError.badRequest('Cannot reorder questions in a published or archived quiz.');
  }
  await quizRepo.reorderQuestions(quizId, orderedQuestionIds);
}

/**
 * Get enriched quiz results for the teacher.
 *
 * Returns a structured response:
 *   quiz    — title, classroom, teacher, maxScore
 *   summary — totals, attempted/not-attempted counts, avg/min/max percentages
 *   students — ranked rows (one per student who submitted best attempt)
 *   notAttempted — students enrolled in the classroom who have not submitted
 *
 * Ranking rule (competition / DENSE_RANK):
 *   - Best attempt per student = highest score; tie-break: most recent attempt.
 *   - Tied scores → same rank.  Next rank skips (1,1,3 not 1,1,2).
 *   - Students who have NOT submitted receive no rank.
 *
 * Security: both repo calls use teacher_id scoping — no IDOR possible.
 */
async function getQuizResults(quizId, teacherId) {
  // Verifies ownership, throws 404 if quiz not found or wrong teacher
  const header = await quizRepo.getQuizHeaderForTeacher(quizId, teacherId);
  if (!header) throw ApiError.notFound('Quiz assignment not found.');

  const [rankedRows, allStudents] = await Promise.all([
    quizRepo.getRankedSubmissionsForTeacher(quizId, teacherId),
    quizRepo.getClassroomStudentsForQuiz(quizId, teacherId),
  ]);

  // Build set of student IDs who have a submitted ranking attempt
  const attemptedIds = new Set(rankedRows.map(r => Number(r.student_id)));

  // Students enrolled but NOT attempted
  const notAttempted = allStudents
    .filter(s => !attemptedIds.has(Number(s.id)))
    .map(s => ({
      studentId:   Number(s.id),
      studentName: s.name,
      username:    s.username,
      status:      'not_attempted',
    }));

  // Shape ranked student rows
  const students = rankedRows.map(r => ({
    studentId:     Number(r.student_id),
    studentName:   r.student_name,
    username:      r.student_username,
    rank:          Number(r.rank),
    score:         r.score !== null ? Number(r.score) : null,
    maxScore:      r.max_score !== null ? Number(r.max_score) : null,
    percentage:    r.score !== null && r.max_score
      ? Math.round((Number(r.score) / Number(r.max_score)) * 100)
      : null,
    attemptNumber: Number(r.attempt_number),
    totalAttempts: Number(r.total_attempts),
    status:        r.status,
    submittedAt:   r.submitted_at,
  }));

  // Summary statistics
  const attempted    = students.length;
  const totalStudents = allStudents.length;
  const percentages  = students
    .map(s => s.percentage)
    .filter(p => p !== null);

  const averagePercentage = percentages.length
    ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
    : null;
  const highestPercentage = percentages.length ? Math.max(...percentages) : null;
  const lowestPercentage  = percentages.length ? Math.min(...percentages) : null;

  return {
    quiz: {
      id:             Number(header.id),
      title:          header.title,
      classroom:      header.classroom_name,
      classroomId:    Number(header.classroom_id),
      teacher:        header.teacher_name,
      maxScore:       Number(header.max_score),
      allowRetake:    header.allow_retake,
      status:         header.status,
      dueDate:        header.due_date,
    },
    summary: {
      totalStudents,
      attempted,
      notAttempted:       totalStudents - attempted,
      averagePercentage,
      highestPercentage,
      lowestPercentage,
    },
    students,
    notAttempted,
  };
}

/**
 * Get detailed per-question results for a specific student + attempt.
 *
 * Security invariants:
 *   - teacherId must own the quiz (quizId → qa.teacher_id = teacherId)
 *   - studentId + attemptNumber must match a row in quiz_assignment_attempts
 *     for that quiz — prevents IDOR across quizzes or students
 *
 * Returns null if any ownership check fails (controller maps to 404).
 */
async function getStudentAttemptDetail(quizId, studentId, attemptNumber, teacherId) {
  // Verifies quiz ownership
  const header = await quizRepo.getQuizHeaderForTeacher(quizId, teacherId);
  if (!header) throw ApiError.notFound('Quiz assignment not found.');

  const detail = await quizRepo.getStudentAttemptDetail(
    quizId, studentId, attemptNumber, teacherId
  );
  if (!detail) throw ApiError.notFound('Student attempt not found.');

  const { attempt, questions } = detail;
  const percentage = attempt.score !== null && attempt.max_score
    ? Math.round((Number(attempt.score) / Number(attempt.max_score)) * 100)
    : null;

  return {
    quiz: {
      id:          Number(header.id),
      title:       header.title,
      classroom:   header.classroom_name,
      teacher:     header.teacher_name,
      maxScore:    Number(header.max_score),
    },
    student: {
      id:       Number(attempt.student_id),
      name:     attempt.student_name,
      username: attempt.student_username,
    },
    attempt: {
      id:            Number(attempt.id),
      attemptNumber: Number(attempt.attempt_number),
      status:        attempt.status,
      score:         attempt.score !== null ? Number(attempt.score) : null,
      maxScore:      attempt.max_score !== null ? Number(attempt.max_score) : null,
      percentage,
      startedAt:     attempt.started_at,
      submittedAt:   attempt.submitted_at,
    },
    questions: questions.map((q, idx) => ({
      orderIndex:     Number(q.order_index),
      questionId:     Number(q.question_id),
      questionText:   q.question_text,
      questionType:   q.question_type,
      difficulty:     q.difficulty,
      correctAnswer:  q.correct_answer,
      explanation:    q.explanation,
      effectiveMarks: Number(q.effective_marks),
      studentAnswer:  q.student_answer ?? null,
      isCorrect:      q.is_correct ?? null,
      score:          q.score !== null && q.score !== undefined ? Number(q.score) : null,
    })),
  };
}

/**
 * Generate a PDF report for a quiz's results.
 * Delegates PDF building to pdf.service.js (buildQuizResultReport).
 *
 * Security: scoped to teacher via getQuizResults() (same ownership check).
 * Returns a PDFDocument stream ready to be piped to the response.
 */
async function getQuizResultsPdf(quizId, teacherId) {
  const results = await getQuizResults(quizId, teacherId);
  const { buildQuizResultReport } = require('../services/report/pdf.service');
  return buildQuizResultReport(results);
}

// ── Student operations ────────────────────────────────────────────────────────

/**
 * List all published quizzes assigned to the student's classroom.
 */
async function listMyQuizzes(studentId) {
  return quizRepo.listForStudent(studentId);
}

/**
 * Get a published quiz with questions (student view).
 * Optionally shuffles questions if quiz.shuffle_questions = true.
 */
async function getMyQuiz(quizId, studentId) {
  const quiz = await quizRepo.findForStudent(quizId, studentId);
  if (!quiz) throw ApiError.notFound('Quiz assignment not found.');

  // Shuffle if required — creates a fresh shuffled order per view
  if (quiz.shuffle_questions && quiz.questions.length > 1) {
    _shuffle(quiz.questions);
  }

  return quiz;
}

/**
 * Start a quiz attempt (or return the existing in-progress attempt).
 * Throws if:
 *   - quiz not found / not accessible
 *   - already submitted and retake not allowed
 */
async function startQuiz(quizId, studentId) {
  const quiz = await quizRepo.findForStudent(quizId, studentId);
  if (!quiz) throw ApiError.notFound('Quiz assignment not found.');

  const latest = await quizRepo.getLatestAttempt(quizId, studentId);

  // Idempotent: return existing in-progress attempt
  if (latest && latest.status === 'in_progress') {
    return latest;
  }

  // Block if already submitted and retake not allowed
  if (latest && latest.status === 'submitted' && !quiz.allow_retake) {
    throw ApiError.forbidden('Retakes are not allowed for this quiz.');
  }

  const attemptNumber = await quizRepo.getNextAttemptNumber(quizId, studentId);
  const attempt = await quizRepo.insertAttempt({
    quizId,
    studentId,
    status: 'in_progress',
    score: null,
    maxScore: null,
    startedAt: new Date(),
    submittedAt: null,
    attemptNumber,
  });

  logger.info('[QuizAssignment] Attempt started', { quizId, studentId, attemptNumber });
  return attempt;
}

/**
 * Submit a quiz attempt with all answers.
 *
 * - answers: [{ questionId, studentAnswer }]
 * - Auto-scores each question.
 * - Computes totalScore and maxScore.
 * - Wraps attempt update + per-question upserts in a PostgreSQL transaction.
 * - Returns the full result including per-question breakdown.
 *
 * Duplicate submission guard: if the latest attempt is already 'submitted',
 * throws 409 Conflict BEFORE opening the transaction (fail fast).
 */
async function submitQuiz(quizId, studentId, answers) {
  const quiz = await quizRepo.findForStudent(quizId, studentId);
  if (!quiz) throw ApiError.notFound('Quiz assignment not found.');

  const latest = await quizRepo.getLatestAttempt(quizId, studentId);
  if (!latest) {
    throw ApiError.badRequest('You must start the quiz before submitting.');
  }
  if (latest.status === 'submitted') {
    throw ApiError.conflict('This quiz attempt has already been submitted.');
  }

  // Build a lookup map: question_id → quiz question row (with marks_override)
  const questionMap = new Map();
  for (const q of quiz.questions) {
    questionMap.set(Number(q.id), q);
  }

  // Score each answer
  const answerResults = [];
  let totalScore = 0;
  let maxScore   = 0;

  for (const { questionId, studentAnswer } of answers) {
    const q = questionMap.get(Number(questionId));
    if (!q) continue; // silently skip answers for unknown questions

    const effectiveMarks = q.marks_override !== null && q.marks_override !== undefined
      ? Number(q.marks_override)
      : Number(q.marks);

    maxScore += effectiveMarks;

    const trimmedAnswer = String(studentAnswer).trim();
    const { isCorrect, score } = autoScore(
      q.question_type, q.correct_answer, trimmedAnswer, effectiveMarks
    );

    if (score !== null) totalScore += score;

    answerResults.push({
      questionId: Number(questionId),
      studentAnswer: trimmedAnswer,
      isCorrect,
      score,
      correctAnswer:  q.correct_answer,
      explanation:    q.explanation ?? null,
      effectiveMarks,
    });
  }

  // Transaction: update attempt row + upsert per-question quiz_attempts rows
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update the quiz_assignment_attempts row
    await client.query(
      `UPDATE quiz_assignment_attempts
       SET status = 'submitted', score = $1, max_score = $2, submitted_at = NOW()
       WHERE id = $3`,
      [totalScore, maxScore, latest.id]
    );

    // Upsert per-question quiz_attempts (for cross-view analytics)
    for (const r of answerResults) {
      await client.query(
        `INSERT INTO quiz_attempts
           (student_id, question_id, student_answer, is_correct, score,
            attempt_count, first_attempted_at, last_attempted_at)
         VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
         ON CONFLICT (student_id, question_id) DO UPDATE SET
           student_answer    = EXCLUDED.student_answer,
           is_correct        = EXCLUDED.is_correct,
           score             = EXCLUDED.score,
           attempt_count     = quiz_attempts.attempt_count + 1,
           last_attempted_at = NOW()`,
        [studentId, r.questionId, r.studentAnswer, r.isCorrect, r.score]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('[QuizAssignment] Submit transaction failed', { quizId, studentId, err });
    throw err;
  } finally {
    client.release();
  }

  logger.info('[QuizAssignment] Submitted', {
    quizId, studentId,
    attemptNumber: latest.attempt_number,
    totalScore, maxScore,
  });

  return {
    attemptNumber: latest.attempt_number,
    totalScore,
    maxScore,
    answers: answerResults,
  };
}

/**
 * Get the latest attempt for a student's quiz.
 * Returns null if no attempt exists.
 */
async function getMyAttempt(quizId, studentId) {
  const quiz = await quizRepo.findForStudent(quizId, studentId);
  if (!quiz) throw ApiError.notFound('Quiz assignment not found.');
  return quizRepo.getLatestAttempt(quizId, studentId);
}

/**
 * List all attempts for a student's quiz (attempt history).
 */
async function listMyAttempts(quizId, studentId) {
  const quiz = await quizRepo.findForStudent(quizId, studentId);
  if (!quiz) throw ApiError.notFound('Quiz assignment not found.');
  return quizRepo.listAttemptsForStudent(quizId, studentId);
}

module.exports = {
  // Teacher
  createQuiz,
  listQuizzes,
  getQuiz,
  updateQuiz,
  publishQuiz,
  archiveQuiz,
  deleteQuiz,
  addQuestion,
  addQuestionsBatch,
  removeQuestion,
  reorderQuestions,
  getQuizResults,
  getStudentAttemptDetail,
  getQuizResultsPdf,
  // Student
  listMyQuizzes,
  getMyQuiz,
  startQuiz,
  submitQuiz,
  getMyAttempt,
  listMyAttempts,
};
