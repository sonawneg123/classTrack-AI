import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { teacherApi } from "../api/teacherApi";

/**
 * Fetches the full student roster + submission data for one task.
 * Backed by GET /teacher/tasks/:taskId/submissions.
 */
export function useTaskSubmissions(taskId: number | undefined) {
  return useQuery({
    queryKey: ["teacher", "task-submissions", taskId],
    queryFn: () => teacherApi.getTaskSubmissions(taskId!),
    enabled: typeof taskId === "number" && taskId > 0,
    staleTime: 20_000,
  });
}

/**
 * Fetches a single submission (with student name, task title, AI data, etc.)
 * for the teacher submission detail view.
 * Backed by GET /teacher/submissions/:submissionId.
 */
export function useTeacherSubmission(submissionId: number | undefined) {
  return useQuery({
    queryKey: ["teacher", "submission", submissionId],
    queryFn: () => teacherApi.getSubmission(submissionId!),
    enabled: typeof submissionId === "number" && submissionId > 0,
    staleTime: 20_000,
  });
}

/**
 * Mutates the score override for a submission.
 * Backed by PATCH /teacher/submissions/:submissionId/override-score.
 * Invalidates the task-submissions cache on success.
 */
export function useOverrideScore(taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      submissionId,
      teacherScore,
      teacherFeedback,
    }: {
      submissionId: number;
      teacherScore: number | null;
      teacherFeedback?: string;
    }) => teacherApi.overrideScore(submissionId, { teacherScore, teacherFeedback }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher", "task-submissions", taskId] });
    },
  });
}
