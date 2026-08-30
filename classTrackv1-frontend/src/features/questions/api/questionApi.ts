// src/features/questions/api/questionApi.ts

import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type {
  Question,
  GenerateQuestionsRequest,
  GenerateQuestionsResponse,
  QuestionStatus,
} from "@/types/question";
import type { QuizAttempt, SubmitAttemptResponse, TeacherQuizResult } from "@/types/quizAttempt";

async function _unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) throw new Error(data.message);
  return (data as { success: true; data: T }).data;
}

const BASE = "/questions";

export const questionApi = {
  // ── Generation ──────────────────────────────────────────────────────────
  generate: (payload: GenerateQuestionsRequest) =>
    _unwrap<GenerateQuestionsResponse>(apiClient.post(`${BASE}/generate`, payload)),

  // ── Teacher views ────────────────────────────────────────────────────────
  listByTopic: (topicId: number, status?: QuestionStatus) =>
    _unwrap<{ questions: Question[] }>(
      apiClient.get(`${BASE}/topics/${topicId}`, { params: status ? { status } : {} })
    ),

  /**
   * GET /questions/review-queue — pending_approval + approved questions
   * for the authenticated teacher (across all topics).
   * Optional status filter: 'pending_approval' | 'approved'
   */
  listReviewQueue: (status?: 'pending_approval' | 'approved') =>
    _unwrap<{ questions: Question[] }>(
      apiClient.get(`${BASE}/review-queue`, { params: status ? { status } : {} })
    ),

  /**
   * GET /questions/published — all published questions for the teacher.
   * Optional topicId filter.
   */
  listPublishedForTeacher: (topicId?: number) =>
    _unwrap<{ questions: Question[] }>(
      apiClient.get(`${BASE}/published`, { params: topicId ? { topicId } : {} })
    ),

  /** @deprecated Use listReviewQueue instead */
  listPendingApproval: () =>
    _unwrap<{ questions: Question[] }>(apiClient.get(`${BASE}/pending-approval`)),

  getQuestion: (questionId: number) =>
    _unwrap<Question>(apiClient.get(`${BASE}/${questionId}`)),

  // ── Lifecycle transitions ────────────────────────────────────────────────
  approve: (questionId: number) =>
    _unwrap<{ id: number; status: string }>(apiClient.patch(`${BASE}/${questionId}/approve`)),

  reject: (questionId: number, reason?: string) =>
    _unwrap<{ id: number; status: string }>(
      apiClient.patch(`${BASE}/${questionId}/reject`, { reason })
    ),

  /**
   * Publish a question. Works from both 'pending_approval' and 'approved' status.
   * This is the primary action to make a question available in the Quiz Builder.
   */
  publish: (questionId: number) =>
    _unwrap<{ id: number; status: string }>(apiClient.patch(`${BASE}/${questionId}/publish`)),

  archive: (questionId: number) =>
    _unwrap<{ id: number; status: string }>(apiClient.patch(`${BASE}/${questionId}/archive`)),

  // ── Student views ────────────────────────────────────────────────────────
  /** All questions the student generated (all statuses), optionally filtered by topic. */
  listMyQuestions: (topicId?: number) =>
    _unwrap<{ questions: Question[] }>(
      apiClient.get(`${BASE}/my-questions`, { params: topicId ? { topicId } : {} })
    ),

  listPublished: (topicId: number) =>
    _unwrap<{ questions: Question[] }>(apiClient.get(`${BASE}/topics/${topicId}/published`)),

  viewPublished: (questionId: number) =>
    _unwrap<Question>(apiClient.get(`${BASE}/${questionId}/view`)),

  // ── Quiz Attempts (Sprint 4) ─────────────────────────────────────────────
  /** POST /questions/:id/attempt — submit an answer; returns score + correct answer */
  submitAttempt: (questionId: number, studentAnswer: string) =>
    _unwrap<SubmitAttemptResponse>(
      apiClient.post(`${BASE}/${questionId}/attempt`, { studentAnswer })
    ),

  /** GET /questions/my-attempts — all attempts by this student */
  listMyAttempts: (topicId?: number) =>
    _unwrap<{ attempts: QuizAttempt[] }>(
      apiClient.get(`${BASE}/my-attempts`, { params: topicId ? { topicId } : {} })
    ),

  /** GET /questions/:id/my-attempt — single attempt for one question (null if not attempted) */
  getMyAttempt: (questionId: number) =>
    _unwrap<QuizAttempt | null>(apiClient.get(`${BASE}/${questionId}/my-attempt`)),

  // ── Teacher result views (Sprint 5) ───────────────────────────────────────
  /** GET /questions/topics/:topicId/results — all student attempts for a topic */
  listTopicResults: (topicId: number) =>
    _unwrap<{ attempts: TeacherQuizResult[] }>(
      apiClient.get(`${BASE}/topics/${topicId}/results`)
    ),

  /** GET /questions/:questionId/results — all student attempts for one question */
  listQuestionResults: (questionId: number) =>
    _unwrap<{ attempts: TeacherQuizResult[] }>(
      apiClient.get(`${BASE}/${questionId}/results`)
    ),
};
