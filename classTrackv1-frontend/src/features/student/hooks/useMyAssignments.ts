/**
 * src/features/student/hooks/useMyAssignments.ts
 * Fetches the student's task list.
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
import type { StudentAssignment } from "@/types/studentAssignment";

type RefetchIntervalValue =
  | number
  | false
  | ((query: Query<StudentAssignment[], Error, StudentAssignment[]>) => number | false);

export function useMyAssignments(refetchInterval: RefetchIntervalValue = false) {
  return useQuery({
    queryKey: ["student", "assignments"],
    queryFn: studentApi.getMyAssignments,
    refetchInterval,
  });
}
