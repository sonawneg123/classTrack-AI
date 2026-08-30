// src/features/practice/hooks/usePractice.ts
//
// Sprint 6 — React Query hooks for Student AI Practice

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { practiceApi } from "../api/practiceApi";
import { getErrorMessage } from "@utils/apiError";
import type { GenerateQuestionsRequest } from "@/types/question";

// ── Query keys ────────────────────────────────────────────────────────────────
const PK = {
  practiceQuestions: (topicId?: number) =>
    ["practice", "questions", topicId ?? "all"] as const,
  practiceQuestion: (id: number) => ["practice", "question", id] as const,
  practiceAttempt: (questionId: number) =>
    ["practice", "attempt", questionId] as const,
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
    }: {
      questionId: number;
      studentAnswer: string;
    }) => practiceApi.submitAttempt(questionId, studentAnswer),
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
