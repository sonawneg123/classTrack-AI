// src/features/quizAssignments/api/quizAssignmentApi.ts

import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type {
  QuizAssignment,
  QuizAssignmentDetail,
  QuizAssignmentAttempt,
  StudentQuizView,
  QuizSubmitResult,
  QuizSubmitAnswer,
  TeacherQuizResults,
  StudentAttemptDetail,
  CreateQuizPayload,
  UpdateQuizPayload,
  BatchAddQuestionsPayload,
} from "@/types/quizAssignment";

async function _unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) throw new Error(data.message);
  return (data as { success: true; data: T }).data;
}

const TEACHER_BASE = "/teacher/quiz-assignments";
const STUDENT_BASE = "/student/quiz-assignments";

export const quizAssignmentApi = {
  // ── Teacher ───────────────────────────────────────────────────────────────

  /** Create a new quiz assignment draft */
  create: (payload: CreateQuizPayload) =>
    _unwrap<{ quiz: QuizAssignment }>(apiClient.post(TEACHER_BASE, payload)),

  /** List all quizzes for the authenticated teacher */
  list: () =>
    _unwrap<{ quizzes: QuizAssignment[] }>(apiClient.get(TEACHER_BASE)),

  /** Get quiz detail with questions (teacher view) */
  get: (quizId: number) =>
    _unwrap<{ quiz: QuizAssignmentDetail }>(apiClient.get(`${TEACHER_BASE}/${quizId}`)),

  /** Update a draft quiz's metadata */
  update: (quizId: number, payload: UpdateQuizPayload) =>
    _unwrap<{ quiz: QuizAssignmentDetail }>(
      apiClient.patch(`${TEACHER_BASE}/${quizId}`, payload)
    ),

  /** Publish a draft quiz to students */
  publish: (quizId: number) =>
    _unwrap<{ quiz: QuizAssignmentDetail }>(
      apiClient.patch(`${TEACHER_BASE}/${quizId}/publish`)
    ),

  /** Archive a quiz */
  archive: (quizId: number) =>
    _unwrap<null>(apiClient.patch(`${TEACHER_BASE}/${quizId}/archive`)),

  /** Soft-delete a quiz */
  remove: (quizId: number) =>
    _unwrap<null>(apiClient.delete(`${TEACHER_BASE}/${quizId}`)),

  /** Add a published question to a quiz (single) */
  addQuestion: (quizId: number, payload: { questionId: number; marksOverride?: number | null }) =>
    _unwrap<{ quizQuestion: object }>(
      apiClient.post(`${TEACHER_BASE}/${quizId}/questions`, payload)
    ),

  /**
   * Batch-add questions to a quiz.
   * Quick-select: { sources: [{ topicId, count }] }
   * Manual-select: { questionIds: number[] }
   */
  batchAddQuestions: (quizId: number, payload: BatchAddQuestionsPayload) =>
    _unwrap<{ added: number; quizId: number }>(
      apiClient.post(`${TEACHER_BASE}/${quizId}/questions/batch`, payload)
    ),

  /**
   * Count the number of published questions for a topic (teacher view).
   * Uses the existing GET /questions/topics/:topicId?status=published endpoint.
   */
  getTopicPublishedCount: (topicId: number) =>
    _unwrap<{ questions: { id: number }[] }>(
      apiClient.get(`/questions/topics/${topicId}`, { params: { status: 'published' } })
    ),

  /** Remove a question from a quiz */
  removeQuestion: (quizId: number, questionId: number) =>
    _unwrap<null>(apiClient.delete(`${TEACHER_BASE}/${quizId}/questions/${questionId}`)),

  /** Reorder questions in a quiz */
  reorderQuestions: (quizId: number, questionIds: number[]) =>
    _unwrap<null>(
      apiClient.put(`${TEACHER_BASE}/${quizId}/questions/order`, { questionIds })
    ),

  /** Get enriched student results for a quiz (ranked, with summary) */
  getResults: (quizId: number) =>
    _unwrap<TeacherQuizResults>(
      apiClient.get(`${TEACHER_BASE}/${quizId}/results`)
    ),

  /** Get detailed per-question result for a specific student attempt */
  getStudentAttemptDetail: (quizId: number, studentId: number, attemptNumber: number) =>
    _unwrap<StudentAttemptDetail>(
      apiClient.get(`${TEACHER_BASE}/${quizId}/students/${studentId}/attempts/${attemptNumber}`)
    ),

  /** Download PDF report for a quiz's results — returns blob URL */
  getResultsPdfUrl: (quizId: number) =>
    `${apiClient.defaults.baseURL}${TEACHER_BASE}/${quizId}/results/pdf`,

  // ── Student ───────────────────────────────────────────────────────────────

  /** List all published quizzes for the authenticated student */
  listMine: () =>
    _unwrap<{ quizzes: StudentQuizView[] }>(apiClient.get(STUDENT_BASE)),

  /** Get a single quiz with questions + latest attempt (student view) */
  getMine: (quizId: number) =>
    _unwrap<{ quiz: StudentQuizView }>(apiClient.get(`${STUDENT_BASE}/${quizId}`)),

  /** Start a new attempt (idempotent if already in-progress) */
  start: (quizId: number) =>
    _unwrap<{ attempt: QuizAssignmentAttempt }>(
      apiClient.post(`${STUDENT_BASE}/${quizId}/start`)
    ),

  /** Submit all answers for the current in-progress attempt */
  submit: (quizId: number, answers: QuizSubmitAnswer[]) =>
    _unwrap<QuizSubmitResult>(
      apiClient.post(`${STUDENT_BASE}/${quizId}/submit`, { answers })
    ),

  /** Get the latest attempt for a quiz */
  getAttempt: (quizId: number) =>
    _unwrap<{ attempt: QuizAssignmentAttempt } | null>(
      apiClient.get(`${STUDENT_BASE}/${quizId}/attempt`)
    ),

  /** List all attempts (history) for a quiz */
  listAttempts: (quizId: number) =>
    _unwrap<{ attempts: QuizAssignmentAttempt[] }>(
      apiClient.get(`${STUDENT_BASE}/${quizId}/attempts`)
    ),
};
