import { useQuery } from "@tanstack/react-query";
import { mockDashboardService } from "@services/mockDashboardService";

export function useAdminDashboard() {
  return useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: mockDashboardService.getAdminDashboard,
  });
}

export function useTeacherDashboard() {
  return useQuery({
    queryKey: ["dashboard", "teacher"],
    queryFn: mockDashboardService.getTeacherDashboard,
  });
}

export function useStudentDashboard() {
  return useQuery({
    queryKey: ["dashboard", "student"],
    queryFn: mockDashboardService.getStudentDashboard,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: mockDashboardService.getNotifications,
    staleTime: 60_000,
  });
}
