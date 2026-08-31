import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/adminApi";

// ── Query Keys ─────────────────────────────────────────────────────────────────

export const adminKeys = {
  dashboard: () => ["admin", "dashboard"] as const,
  teachers: (params?: object) => ["admin", "teachers", params] as const,
  teacher: (id: number) => ["admin", "teacher", id] as const,
  registrationCodes: (params?: object) => ["admin", "reg-codes", params] as const,
};

// ── Dashboard hook ─────────────────────────────────────────────────────────────

export function useAdminDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard(),
    queryFn: () => adminApi.getDashboard(),
    staleTime: 60_000, // 1 minute — dashboard data refreshes on next focus/manual refetch
  });
}

// ── Teacher list hook ──────────────────────────────────────────────────────────

export function useAdminTeachers(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: adminKeys.teachers(params),
    queryFn: () => adminApi.listTeachers(params),
  });
}

// ── Single teacher hook ────────────────────────────────────────────────────────

export function useAdminTeacher(id: number) {
  return useQuery({
    queryKey: adminKeys.teacher(id),
    queryFn: () => adminApi.getTeacher(id),
    enabled: Boolean(id),
  });
}

// ── Update teacher mutation ────────────────────────────────────────────────────

export function useUpdateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: { name?: string; email?: string; mobile?: string };
    }) => adminApi.updateTeacher(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: adminKeys.teachers() });
      qc.invalidateQueries({ queryKey: adminKeys.teacher(id) });
    },
  });
}

// ── Set teacher status mutation ────────────────────────────────────────────────

export function useSetTeacherStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      adminApi.setTeacherStatus(id, isActive),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: adminKeys.teachers() });
      qc.invalidateQueries({ queryKey: adminKeys.teacher(id) });
    },
  });
}

// ── Assign classroom mutation ──────────────────────────────────────────────────

export function useAssignTeacherClassroom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      teacherId,
      classroomId,
    }: {
      teacherId: number;
      classroomId: number;
    }) => adminApi.assignTeacherClassroom(teacherId, classroomId),
    onSuccess: (_data, { teacherId }) => {
      qc.invalidateQueries({ queryKey: adminKeys.teachers() });
      qc.invalidateQueries({ queryKey: adminKeys.teacher(teacherId) });
    },
  });
}

// ── Remove from classroom mutation ────────────────────────────────────────────

export function useRemoveTeacherFromClassroom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      teacherId,
      classroomId,
    }: {
      teacherId: number;
      classroomId: number;
    }) => adminApi.removeTeacherFromClassroom(teacherId, classroomId),
    onSuccess: (_data, { teacherId }) => {
      qc.invalidateQueries({ queryKey: adminKeys.teachers() });
      qc.invalidateQueries({ queryKey: adminKeys.teacher(teacherId) });
    },
  });
}

// ── Registration codes hooks ───────────────────────────────────────────────────

export function useRegistrationCodes(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: adminKeys.registrationCodes(params),
    queryFn: () => adminApi.listRegistrationCodes(params),
  });
}

export function useCreateRegistrationCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (expiresInHours?: number) =>
      adminApi.createRegistrationCode(expiresInHours),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.registrationCodes() });
    },
  });
}

export function useRevokeRegistrationCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminApi.revokeRegistrationCode(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.registrationCodes() });
    },
  });
}
