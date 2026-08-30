/**
 * server/src/services/knowledge/studentKnowledge.service.js
 *
 * Read-only hierarchy browsing for students.
 *
 * A student belongs to a classroom owned by a teacher.
 * That teacher owns curricula → subjects → chapters → topics.
 * Students should see only the hierarchy belonging to their classroom's teacher.
 *
 * Security model:
 *   studentId (from JWT, never from request body) → classroom → teacher_id
 *   All queries scope to that teacher_id.
 *   A student in classroom A cannot browse teacher B's hierarchy.
 *
 * No mutations are permitted here.
 */

const { ApiError } = require('../../utils/response.util');
const { pool } = require('../../database/connection');

const curriculumRepo = require('../../repositories/curriculum.repository');
const subjectRepo    = require('../../repositories/subject.repository');
const chapterRepo    = require('../../repositories/chapter.repository');
const topicRepo      = require('../../repositories/topic.repository');

// ── Internal: resolve teacher from student's classroom ────────────────────────

/**
 * Returns the teacher_id that owns the classroom the student belongs to.
 * Throws 404 if the student has no classroom (shouldn't happen, but defensive).
 *
 * @param {number} studentId  — from authenticated JWT, never from request
 * @returns {Promise<number>} teacherId
 */
async function _getTeacherIdForStudent(studentId) {
  const [rows] = await pool.query(
    `SELECT c.teacher_id
     FROM classrooms c
     JOIN students   s ON s.classroom_id = c.id
     WHERE s.id = $1
     LIMIT 1`,
    [studentId]
  );
  if (!rows || rows.length === 0) {
    throw ApiError.notFound('Classroom not found. Please contact your teacher.');
  }
  return rows[0].teacher_id;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all curricula visible to the student (i.e. owned by their teacher).
 */
async function listCurricula(studentId) {
  const teacherId = await _getTeacherIdForStudent(studentId);
  return curriculumRepo.listByTeacher(teacherId);
}

/**
 * List subjects within a curriculum — verifies teacher ownership through
 * the student's classroom to prevent IDOR.
 */
async function listSubjects(curriculumId, studentId) {
  const teacherId = await _getTeacherIdForStudent(studentId);
  // Ownership check: curriculum must belong to this student's teacher
  const curriculum = await curriculumRepo.findOwnedById(curriculumId, teacherId);
  if (!curriculum) throw ApiError.notFound('Curriculum not found.');
  return subjectRepo.listByCurriculum(curriculumId, teacherId);
}

/**
 * List chapters within a subject — verifies teacher ownership through
 * the student's classroom to prevent IDOR.
 */
async function listChapters(subjectId, studentId) {
  const teacherId = await _getTeacherIdForStudent(studentId);
  const subject = await subjectRepo.findOwnedById(subjectId, teacherId);
  if (!subject) throw ApiError.notFound('Subject not found.');
  return chapterRepo.listBySubject(subjectId, teacherId);
}

/**
 * List topics within a chapter — verifies teacher ownership through
 * the student's classroom to prevent IDOR.
 */
async function listTopics(chapterId, studentId) {
  const teacherId = await _getTeacherIdForStudent(studentId);
  const chapter = await chapterRepo.findOwnedById(chapterId, teacherId);
  if (!chapter) throw ApiError.notFound('Chapter not found.');
  return topicRepo.listByChapter(chapterId, teacherId);
}

/**
 * Verify a student can access a given topicId.
 * Returns the teacher_id — used by practice generation to scope RAG retrieval.
 *
 * @param {number} topicId
 * @param {number} studentId
 * @returns {Promise<number>} teacherId
 */
async function verifyTopicAccess(topicId, studentId) {
  const teacherId = await _getTeacherIdForStudent(studentId);
  const topic = await topicRepo.findOwnedById(topicId, teacherId);
  if (!topic) throw ApiError.notFound('Topic not found.');
  return teacherId;
}

module.exports = {
  listCurricula,
  listSubjects,
  listChapters,
  listTopics,
  verifyTopicAccess,
};
