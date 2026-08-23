import { useQuery } from "@tanstack/react-query";
import { teacherApi } from "../api/teacherApi";

/**
 * Fetches the grading overview for one classroom.
 *
 * Enabled only when classroomId is a positive integer — keeps the hook
 * safe to call unconditionally even before a classroom is selected.
 */
export function useGradingOverview(classroomId: number | undefined) {
  return useQuery({
    queryKey: ["teacher", "grading-overview", classroomId],
    queryFn: () => teacherApi.getGradingOverview(classroomId!),
    enabled: typeof classroomId === "number" && classroomId > 0,
    staleTime: 30_000, // grading data is fine to cache for 30s
  });
}
