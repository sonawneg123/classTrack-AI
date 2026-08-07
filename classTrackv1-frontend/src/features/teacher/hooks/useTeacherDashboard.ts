import { useQuery } from "@tanstack/react-query";
import { teacherApi } from "../api/teacherApi";

export function useTeacherDashboard() {
  return useQuery({
    queryKey: ["teacher", "dashboard"],
    queryFn: teacherApi.getDashboardStats,
  });
}
