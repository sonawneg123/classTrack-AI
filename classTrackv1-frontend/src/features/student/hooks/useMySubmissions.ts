/**
 * src/features/student/hooks/useMySubmissions.ts
 * Fetches all of the student's submissions (with task metadata and effective_score).
 *
 * @param refetchInterval - Forwarded to React Query as-is.
 *   Accepts a number (ms), false (no polling), or a function that receives
 *   the Query object and returns number | false.  Defaults to false.
 *
 *   Callers should pass a function that inspects the cached data and returns
 *   the poll interval only while an AI evaluation is in progress, and false
 *   once the submission reaches a terminal state ("analyzed" | "failed").
 */
import { useQuery } from "@tanstack/react-query";
import type { Query } from "@tanstack/react-query";
import { studentApi } from "../api/studentApi";
import type { StudentSubmission } from "@/types/submission";

type RefetchIntervalValue =
  | number
  | false
  | ((query: Query<StudentSubmission[], Error, StudentSubmission[]>) => number | false);

export function useMySubmissions(refetchInterval: RefetchIntervalValue = false) {
  return useQuery({
    queryKey: ["student", "submissions"],
    queryFn: studentApi.getMySubmissions,
    refetchInterval,
  });
}
