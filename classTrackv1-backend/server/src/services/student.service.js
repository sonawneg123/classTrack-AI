/**
 * server/src/services/student.service.js
 */
const { ApiError } = require('../utils/response.util');
const { effectiveScore } = require('../utils/scoring.util');
const { mimeToFileType } = require('../middleware/upload.middleware');
const { extractFromTxt, extractFromPdf, toBase64DataUrl } = require('./ai/extractor.service');
const { analyzeText, analyzeImage } = require('./ai/groq.service');
const { enqueue } = require('./ai/queue.service');
const logger = require('../utils/logger.util');

const taskRepo       = require('../repositories/task.repository');
const submissionRepo = require('../repositories/submission.repository');
const notifRepo      = require('../repositories/notification.repository');

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
/**
 * Categorizes each task for the student's "My Assignments" view — one
 * status computed centrally here rather than left for the frontend (or
 * multiple frontends) to re-derive inconsistently.
 *   submitted — a submission exists, regardless of due date
 *   overdue   — no submission, due_date exists and is in the past
 *   upcoming  — no submission, due_date exists and is today or later
 *   pending   — no submission, no due_date set at all
 */
function _assignmentStatus(task) {
  if (task.submission_id) return 'submitted';
  if (!task.due_date) return 'pending';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.due_date) < today ? 'overdue' : 'upcoming';
}

/** Normalises the DB tinyint(1) to a real boolean. */
function _aiEnabled(task) {
  return task.ai_evaluation_enabled === 1 || task.ai_evaluation_enabled === true;
}

async function getMyTasks(studentId, classroomId) {
  const tasks = await taskRepo.listForStudent(classroomId, studentId);
  return tasks.map((t) => ({
    ...t,
    effective_score: effectiveScore({ ai_score: t.ai_score, teacher_score: t.teacher_score }),
    assignment_status: _assignmentStatus(t),
  }));
}

// ---------------------------------------------------------------------------
// AI analysis (used by the queue)
// ---------------------------------------------------------------------------
async function _performAnalysis(submissionId, task, { fileType, filePath, typedText }) {
  let result;
  let extractedText = null;

  logger.info('[AI] Content extraction started', { submissionId, fileType });

  if (fileType === 'image') {
    const dataUrl = toBase64DataUrl(filePath, 'image/jpeg');
    logger.info('[AI] Groq vision request started', { submissionId });
    result        = await analyzeImage({ title: task.title, description: task.description, maxScore: task.max_score, base64DataUrl: dataUrl });
    extractedText = result.transcribedText;
  } else {
    let text = typedText;
    if (fileType === 'txt') text = await extractFromTxt(filePath);
    if (fileType === 'pdf') text = await extractFromPdf(filePath);
    if (!text || !text.trim()) throw new Error('Could not read any text from the submission.');
    extractedText = text;
    logger.info('[AI] Groq text request started', { submissionId, textLength: text.length });
    result = await analyzeText({ title: task.title, description: task.description, maxScore: task.max_score, studentText: text });
  }

  logger.info('[AI] Groq response received — persisting result', { submissionId, score: result.score });
  await submissionRepo.markAnalyzed(submissionId, result, extractedText);
  logger.info('[AI] Submission marked analyzed', { submissionId });
  return result;
}

function _queueAnalysis(submissionId, studentId, task, fileInfo) {
  // ── Guard: only queue AI when the task has it enabled ──────────────────
  if (!_aiEnabled(task)) {
    logger.info('[AI] Skipped — ai_evaluation_enabled=false', { submissionId, taskId: task.id });
    return;
  }

  logger.info('[AI] Submission received — queuing evaluation', { submissionId, taskId: task.id });
  submissionRepo.markAnalyzing(submissionId).catch(() => {});

  enqueue(
    () => {
      logger.info('[AI] Worker started', { submissionId });
      return _performAnalysis(submissionId, task, fileInfo);
    },
    `analyze-${submissionId}`,
    async (err) => {
      logger.error('[AI] Evaluation permanently failed', { submissionId, error: err?.message });
      await submissionRepo.markFailed(submissionId);
      await notifRepo.insertOne({
        recipientType: 'student', recipientId: studentId, taskId: task.id,
        type:    'analysis_failed',
        title:   `We couldn't grade "${task.title}"`,
        message: 'Something went wrong. Your teacher can retry it, or you can resubmit.',
      });
    }
  )
    .then(async () => {
      logger.info('[AI] Evaluation complete — notifying student', { submissionId });
      await notifRepo.insertOne({
        recipientType: 'student', recipientId: studentId, taskId: task.id,
        type:    'submission_graded',
        title:   `"${task.title}" has been graded`,
        message: 'Your AI feedback is ready.',
      });
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Submit / resubmit
// ---------------------------------------------------------------------------
async function submitTask({ taskId, studentId, classroomId, file, typedText }) {
  const task = (await taskRepo.listForStudent(classroomId, studentId))
    .find((t) => t.id === Number(taskId));
  if (!task) throw ApiError.notFound('Task not found.');

  if (task.due_date && !task.late_submission_allowed) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(task.due_date) < today) {
      throw ApiError.badRequest('The due date for this assignment has passed and late submissions are not allowed.');
    }
  }

  if (!file && !typedText?.trim()) {
    throw ApiError.badRequest('Please upload a file or type your answer.');
  }

  const fileType        = file ? mimeToFileType(file.mimetype) : 'text';
  const filePath        = file?.path        || null;
  const originalFilename = file?.originalname || null;

  const existing = await submissionRepo.findByTaskAndStudent(taskId, studentId);
  let submissionId, attemptNumber;

  if (existing) {
    await submissionRepo.archiveVersion(existing);
    submissionId  = existing.id;
    attemptNumber = existing.attempt_number + 1;
    await submissionRepo.resetForResubmit(submissionId, { filePath, originalFilename, fileType, typedText, attemptNumber });
  } else {
    submissionId  = await submissionRepo.create({ taskId, studentId, filePath, originalFilename, fileType, typedText });
    attemptNumber = 1;
  }

  logger.info('Task submitted', { submissionId, taskId, studentId, attempt: attemptNumber });
  const aiQueued = _aiEnabled(task);
  _queueAnalysis(submissionId, studentId, task, { fileType, filePath, typedText });
  return { submissionId, attemptNumber, aiQueued };
}

// ---------------------------------------------------------------------------
// History & submissions
// ---------------------------------------------------------------------------
async function getMySubmissions(studentId) {
  const subs = await submissionRepo.listByStudent(studentId);
  return subs.map((s) => ({ ...s, effective_score: effectiveScore(s) }));
}

async function getMySubmissionHistory(submissionId, studentId) {
  const sub   = await require('../database/connection').pool
    .query('SELECT id FROM submissions WHERE id = ? AND student_id = ?', [submissionId, studentId])
    .then(([rows]) => rows[0]);
  if (!sub) throw ApiError.notFound('Submission not found.');
  return submissionRepo.getVersionHistory(submissionId);
}

module.exports = { getMyTasks, submitTask, getMySubmissions, getMySubmissionHistory };
