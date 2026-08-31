// src/features/practice/hooks/usePractice.ts
//
// Sprint 6 + Sprint 3 Phase 1 — React Query hooks for Student AI Practice

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { practiceApi } from "../api/practiceApi";
import { getErrorMessage } from "@utils/apiError";
import type { GenerateQuestionsRequest } from "@/types/question";
import type { CreateSessionRequest } from "@/types/practiceSession";

// ── Query keys ────────────────────────────────────────────────────────────────
const PK = {
  practiceQuestions: (topicId?: number) =>
    ["practice", "questions", topicId ?? "all"] as const,
  practiceQuestion: (id: number) => ["practice", "question", id] as const,
  practiceAttempt: (questionId: number) =>
    ["practice", "attempt", questionId] as const,
  // Sprint 3 Phase 1
  practiceSession: (sessionId: number) =>
    ["practice", "session", sessionId] as const,
  mastery: () => ["practice", "mastery"] as const,
  topicMastery: (topicId: number) =>
    ["practice", "mastery", topicId] as const,
};

// ── Generation ─────────────────────────────────────────────────────────────────
export function useGeneratePractice() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GenerateQuestionsRequest) => practiceApi.generate(payload),
    onSuccess: (data, vars) => {
      // INSUFFICIENT_CONTEXT — the page handles this with a dedicated Alert.
      // Don't show a confusing success snackbar.
      if (data.code === "INSUFFICIENT_CONTEXT") return;

      // Invalidate so the practice questions list refreshes
      qc.invalidateQueries({ queryKey: PK.practiceQuestions() });
      qc.invalidateQueries({ queryKey: PK.practiceQuestions(vars.topicId) });
      if (data.stored > 0) {
        enqueueSnackbar(
          `${data.stored} practice question(s) ready. Start answering below!`,
          { variant: "success" }
        );
      }
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

// ── Practice question listing ──────────────────────────────────────────────────
export function usePracticeQuestions(topicId?: number) {
  return useQuery({
    queryKey: PK.practiceQuestions(topicId),
    queryFn: () => practiceApi.listQuestions(topicId),
    // Only enabled when we have a topic selected
    enabled: !!topicId,
    refetchOnWindowFocus: true,
  });
}

// ── Practice attempt submission ────────────────────────────────────────────────
export function useSubmitPracticeAttempt() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      studentAnswer,
      practiceSessionId,
    }: {
      questionId: number;
      studentAnswer: string;
      practiceSessionId?: number;
    }) => practiceApi.submitAttempt(questionId, studentAnswer, practiceSessionId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PK.practiceAttempt(data.questionId) });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

// ── Get single attempt ─────────────────────────────────────────────────────────
export function usePracticeAttempt(questionId: number | null) {
  return useQuery({
    queryKey: PK.practiceAttempt(questionId!),
    queryFn: () => practiceApi.getAttempt(questionId!),
    enabled: !!questionId,
  });
}

// ── Sprint 3 Phase 1: Practice Session lifecycle ───────────────────────────────

export function useCreateSession() {
  const { enqueueSnackbar } = useSnackbar();
  return useMutation({
    mutationFn: (payload: CreateSessionRequest) => practiceApi.createSession(payload),
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useCompleteSession() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => practiceApi.completeSession(sessionId),
    onSuccess: (_data, sessionId) => {
      // Invalidate mastery cache so the mastery banner refreshes
      qc.invalidateQueries({ queryKey: PK.mastery() });
      qc.invalidateQueries({ queryKey: PK.practiceSession(sessionId) });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

// ── Sprint 3 Phase 1: Mastery ──────────────────────────────────────────────────

export function useMastery() {
  return useQuery({
    queryKey: PK.mastery(),
    queryFn: () => practiceApi.listMastery(),
  });
}

export function useTopicMastery(topicId: number | null) {
  return useQuery({
    queryKey: PK.topicMastery(topicId!),
    queryFn: () => practiceApi.getTopicMastery(topicId!),
    enabled: !!topicId,
  });
}
