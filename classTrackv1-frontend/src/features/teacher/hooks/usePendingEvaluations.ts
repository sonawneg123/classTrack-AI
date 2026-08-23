import { useQuery } from "@tanstack/react-query";
import { teacherApi } from "../api/teacherApi";

/**
 * Fetches pending evaluations across all of the teacher's classrooms.
 * Backed by GET /teacher/pending-evaluations.
 *
 * "Pending" = status IN ('submitted', 'analyzing', 'failed') AND teacher_score IS NULL.
 * This is the authoritative definition used by both the dashboard count and this list.
 */
export function usePendingEvaluations() {
  return useQuery({
    queryKey: ["teacher", "pending-evaluations"],
    queryFn: () => teacherApi.getPendingEvaluations(),
    staleTime: 30_000,
  });
}
