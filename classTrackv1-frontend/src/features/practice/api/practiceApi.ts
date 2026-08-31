// src/features/practice/api/practiceApi.ts
//
// Sprint 6 + Sprint 3 Phase 1 — Student AI Practice API client
// Talks to /api/v1/practice/* endpoints which are student-only.

import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type {
  Question,
  GenerateQuestionsRequest,
  GenerateQuestionsResponse,
} from "@/types/question";
import type { SubmitAttemptResponse, QuizAttempt } from "@/types/quizAttempt";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  CompleteSessionResponse,
  TopicMastery,
  PracticeSession,
} from "@/types/practiceSession";

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
  submitAttempt: (questionId: number, studentAnswer: string, practiceSessionId?: number) =>
    _unwrap<SubmitAttemptResponse>(
      apiClient.post(`${BASE}/questions/${questionId}/attempt`, {
        studentAnswer,
        ...(practiceSessionId !== undefined && { practiceSessionId }),
      })
    ),

  getAttempt: (questionId: number) =>
    _unwrap<QuizAttempt | null>(
      apiClient.get(`${BASE}/questions/${questionId}/attempt`)
    ),

  // ── Sprint 3 Phase 1: Practice Sessions ───────────────────────────────────
  createSession: (payload: CreateSessionRequest) =>
    _unwrap<CreateSessionResponse>(
      apiClient.post(`${BASE}/sessions`, payload)
    ),

  getSession: (sessionId: number) =>
    _unwrap<{ session: PracticeSession }>(
      apiClient.get(`${BASE}/sessions/${sessionId}`)
    ),

  completeSession: (sessionId: number) =>
    _unwrap<CompleteSessionResponse>(
      apiClient.post(`${BASE}/sessions/${sessionId}/complete`)
    ),

  // ── Sprint 3 Phase 1: Mastery ─────────────────────────────────────────────
  listMastery: () =>
    _unwrap<{ mastery: TopicMastery[] }>(apiClient.get(`${BASE}/mastery`)),

  getTopicMastery: (topicId: number) =>
    _unwrap<{ mastery: TopicMastery | null }>(
      apiClient.get(`${BASE}/mastery/${topicId}`)
    ),
};
