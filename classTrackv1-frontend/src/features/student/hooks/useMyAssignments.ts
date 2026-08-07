import { useQuery } from "@tanstack/react-query";
import { studentApi } from "../api/studentApi";

export function useMyAssignments() {
  return useQuery({
    queryKey: ["student", "assignments"],
    queryFn: studentApi.getMyAssignments,
  });
}
