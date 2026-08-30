// src/features/practice/api/practiceApi.ts
//
// Sprint 6 — Student AI Practice API client
// Talks to POST /api/v1/practice/* endpoints which are student-only.

import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type {
  Question,
  GenerateQuestionsRequest,
  GenerateQuestionsResponse,
} from "@/types/question";
import type { SubmitAttemptResponse, QuizAttempt } from "@/types/quizAttempt";

async function _unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) throw new Error(data.message);
  return (data as { success: true; data: T }).data;
}

const BASE = "/practice";

export const practiceApi = {
  // ── Generation ──────────────────────────────────────────────────────────
  generate: (payload: GenerateQuestionsRequest) =>
    _unwrap<GenerateQuestionsResponse>(apiClient.post(`${BASE}/generate`, payload)),

  // ── Question listing ─────────────────────────────────────────────────────
  listQuestions: (topicId?: number) =>
    _unwrap<{ questions: Question[] }>(
      apiClient.get(`${BASE}/questions`, { params: topicId ? { topicId } : {} })
    ),

  getQuestion: (questionId: number) =>
    _unwrap<Question>(apiClient.get(`${BASE}/questions/${questionId}`)),

  // ── Attempts ─────────────────────────────────────────────────────────────
  submitAttempt: (questionId: number, studentAnswer: string) =>
    _unwrap<SubmitAttemptResponse>(
      apiClient.post(`${BASE}/questions/${questionId}/attempt`, { studentAnswer })
    ),

  getAttempt: (questionId: number) =>
    _unwrap<QuizAttempt | null>(
      apiClient.get(`${BASE}/questions/${questionId}/attempt`)
    ),
};
