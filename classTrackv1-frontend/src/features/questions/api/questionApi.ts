// src/features/questions/api/questionApi.ts

import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type {
  Question,
  GenerateQuestionsRequest,
  GenerateQuestionsResponse,
  QuestionStatus,
} from "@/types/question";

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
};
