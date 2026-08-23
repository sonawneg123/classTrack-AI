/**
 * src/features/student/hooks/useSubmissionHistory.ts
 * Fetches previous attempt versions for one submission.
 */
import { useQuery } from "@tanstack/react-query";
import { studentApi } from "../api/studentApi";

export function useSubmissionHistory(submissionId: number | null | undefined) {
  return useQuery({
    queryKey: ["student", "submission-history", submissionId],
    queryFn: () => studentApi.getSubmissionHistory(submissionId!),
    enabled: typeof submissionId === "number" && submissionId > 0,
  });
}
