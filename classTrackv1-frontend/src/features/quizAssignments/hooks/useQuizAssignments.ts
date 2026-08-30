// src/features/quizAssignments/hooks/useQuizAssignments.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useNavigate } from "react-router-dom";
import { quizAssignmentApi } from "../api/quizAssignmentApi";
import { getErrorMessage } from "@utils/apiError";
import { ROUTES } from "@utils/constants";
import type {
  CreateQuizPayload,
  UpdateQuizPayload,
  QuizSubmitAnswer,
  BatchAddQuestionsPayload,
  TeacherQuizResults,
  StudentAttemptDetail,
} from "@/types/quizAssignment";

// ── Query keys ────────────────────────────────────────────────────────────────
const QK = {
  teacherList:    ["quiz-assignments", "teacher", "list"] as const,
  teacherDetail:  (id: number) => ["quiz-assignments", "teacher", "detail", id] as const,
  results:        (id: number) => ["quiz-assignments", "teacher", "results", id] as const,
  studentDetail_: (quizId: number, studentId: number, attemptNumber: number) =>
    ["quiz-assignments", "teacher", "student-detail", quizId, studentId, attemptNumber] as const,
  studentList:    ["quiz-assignments", "student", "list"] as const,
  studentDetail:  (id: number) => ["quiz-assignments", "student", "detail", id] as const,
  attempt:        (id: number) => ["quiz-assignments", "student", "attempt", id] as const,
  attempts:       (id: number) => ["quiz-assignments", "student", "attempts", id] as const,
};

// ── Teacher query hooks ───────────────────────────────────────────────────────

export function useTeacherQuizzes() {
  return useQuery({
    queryKey: QK.teacherList,
    queryFn: () => quizAssignmentApi.list(),
  });
}

export function useTeacherQuizDetail(quizId: number | null) {
  return useQuery({
    queryKey: QK.teacherDetail(quizId!),
    queryFn: () => quizAssignmentApi.get(quizId!),
    enabled: !!quizId,
  });
}

export function useQuizResults(quizId: number | null) {
  return useQuery<TeacherQuizResults>({
    queryKey: QK.results(quizId!),
    queryFn: () => quizAssignmentApi.getResults(quizId!),
    enabled: !!quizId,
    // refetchOnWindowFocus intentionally OFF:
    //   The results tab shows a fully-rendered table. Refetching on focus would
    //   set isFetching=true and re-render the spinner, blanking the table for a
    //   background round-trip that the teacher didn't request.
    //   Teachers can always switch tabs or reload the page to refresh results.
    refetchOnWindowFocus: false,
    // staleTime: treat results as fresh for 60s so navigating between tabs
    // doesn't re-fetch on every mount.
    staleTime: 60_000,
  });
}

export function useStudentAttemptDetail(
  quizId: number | null,
  studentId: number | null,
  attemptNumber: number | null
) {
  return useQuery<StudentAttemptDetail>({
    queryKey: QK.studentDetail_(quizId!, studentId!, attemptNumber!),
    queryFn: () =>
      quizAssignmentApi.getStudentAttemptDetail(quizId!, studentId!, attemptNumber!),
    enabled: !!quizId && !!studentId && !!attemptNumber,
    staleTime: 60_000,
  });
}

// ── Teacher mutation hooks ────────────────────────────────────────────────────

export function useCreateQuiz() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (payload: CreateQuizPayload) => quizAssignmentApi.create(payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QK.teacherList });
      enqueueSnackbar("Quiz assignment created.", { variant: "success" });
      navigate(ROUTES.TEACHER.QUIZ_ASSIGNMENT_DETAIL(data.quiz.id));
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useUpdateQuiz() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ quizId, payload }: { quizId: number; payload: UpdateQuizPayload }) =>
      quizAssignmentApi.update(quizId, payload),
    onSuccess: (_, { quizId }) => {
      qc.invalidateQueries({ queryKey: QK.teacherDetail(quizId) });
      qc.invalidateQueries({ queryKey: QK.teacherList });
      enqueueSnackbar("Quiz updated.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function usePublishQuiz() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quizId: number) => quizAssignmentApi.publish(quizId),
    onSuccess: (_, quizId) => {
      qc.invalidateQueries({ queryKey: QK.teacherDetail(quizId) });
      qc.invalidateQueries({ queryKey: QK.teacherList });
      enqueueSnackbar("Quiz published successfully.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useArchiveQuiz() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quizId: number) => quizAssignmentApi.archive(quizId),
    onSuccess: (_, quizId) => {
      qc.invalidateQueries({ queryKey: QK.teacherDetail(quizId) });
      qc.invalidateQueries({ queryKey: QK.teacherList });
      enqueueSnackbar("Quiz archived.", { variant: "info" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useDeleteQuiz() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (quizId: number) => quizAssignmentApi.remove(quizId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.teacherList });
      enqueueSnackbar("Quiz deleted.", { variant: "info" });
      navigate(ROUTES.TEACHER.QUIZ_ASSIGNMENTS);
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useAddQuestion() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      quizId,
      questionId,
      marksOverride,
    }: {
      quizId: number;
      questionId: number;
      marksOverride?: number | null;
    }) => quizAssignmentApi.addQuestion(quizId, { questionId, marksOverride }),
    onSuccess: (_, { quizId }) => {
      qc.invalidateQueries({ queryKey: QK.teacherDetail(quizId) });
      enqueueSnackbar("Question added to quiz.", { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useBatchAddQuestions() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ quizId, payload }: { quizId: number; payload: BatchAddQuestionsPayload }) =>
      quizAssignmentApi.batchAddQuestions(quizId, payload),
    onSuccess: (data, { quizId }) => {
      qc.invalidateQueries({ queryKey: QK.teacherDetail(quizId) });
      enqueueSnackbar(`${data.added} question(s) added to quiz.`, { variant: "success" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

/** Fetch published question count for a topic (for the source picker UI) */
export function useTopicPublishedCount(topicId: number | null) {
  return useQuery({
    queryKey: ["questions", "topic", topicId, "published-count"],
    queryFn: () => quizAssignmentApi.getTopicPublishedCount(topicId!),
    enabled: !!topicId,
    staleTime: 30_000,
  });
}

export function useRemoveQuestion() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ quizId, questionId }: { quizId: number; questionId: number }) =>
      quizAssignmentApi.removeQuestion(quizId, questionId),
    onSuccess: (_, { quizId }) => {
      qc.invalidateQueries({ queryKey: QK.teacherDetail(quizId) });
      enqueueSnackbar("Question removed.", { variant: "info" });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useReorderQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ quizId, questionIds }: { quizId: number; questionIds: number[] }) =>
      quizAssignmentApi.reorderQuestions(quizId, questionIds),
    onSuccess: (_, { quizId }) => {
      qc.invalidateQueries({ queryKey: QK.teacherDetail(quizId) });
    },
  });
}

// ── Student query hooks ───────────────────────────────────────────────────────

export function useStudentQuizzes() {
  return useQuery({
    queryKey: QK.studentList,
    queryFn: () => quizAssignmentApi.listMine(),
    refetchOnWindowFocus: true,
  });
}

export function useStudentQuizDetail(quizId: number | null) {
  return useQuery({
    queryKey: QK.studentDetail(quizId!),
    queryFn: () => quizAssignmentApi.getMine(quizId!),
    enabled: !!quizId,
    refetchOnWindowFocus: true,
  });
}

export function useMyAttempt(quizId: number | null) {
  return useQuery({
    queryKey: QK.attempt(quizId!),
    queryFn: () => quizAssignmentApi.getAttempt(quizId!),
    enabled: !!quizId,
  });
}

export function useMyAttempts(quizId: number | null) {
  return useQuery({
    queryKey: QK.attempts(quizId!),
    queryFn: () => quizAssignmentApi.listAttempts(quizId!),
    enabled: !!quizId,
  });
}

// ── Student mutation hooks ────────────────────────────────────────────────────

export function useStartQuiz() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (quizId: number) => quizAssignmentApi.start(quizId),
    onSuccess: (_, quizId) => {
      qc.invalidateQueries({ queryKey: QK.studentDetail(quizId) });
      qc.invalidateQueries({ queryKey: QK.attempt(quizId) });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}

export function useSubmitQuiz() {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ quizId, answers }: { quizId: number; answers: QuizSubmitAnswer[] }) =>
      quizAssignmentApi.submit(quizId, answers),
    onSuccess: (_, { quizId }) => {
      // Invalidate attempt + list caches; page handles result display from mutation state
      qc.invalidateQueries({ queryKey: QK.attempt(quizId) });
      qc.invalidateQueries({ queryKey: QK.attempts(quizId) });
      qc.invalidateQueries({ queryKey: QK.studentList });
      qc.invalidateQueries({ queryKey: QK.studentDetail(quizId) });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: "error" }),
  });
}
