import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { teacherApi } from "../api/teacherApi";
import { getErrorMessage } from "@utils/apiError";
import type { ClassroomFormValues, ClassroomListParams } from "@/types/classroom";

const CLASSROOMS_KEY = ["teacher", "classrooms"] as const;

export function useClassrooms(params: ClassroomListParams) {
  return useQuery({
    queryKey: [...CLASSROOMS_KEY, params],
    queryFn: () => teacherApi.listClassrooms(params),
    placeholderData: (previousData) => previousData, // keep old page visible while refetching (no flash)
  });
}

/**
 * Every mutation below invalidates the classroom list (and, where relevant,
 * the dashboard — since counts on the dashboard can change too) and shows
 * a toast. Centralizing that here means every call site (table row menu,
 * form dialog, confirm dialog) gets consistent feedback for free.
 */
function useInvalidateTeacherData() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: CLASSROOMS_KEY });
    queryClient.invalidateQueries({ queryKey: ["teacher", "dashboard"] });
  };
}

export function useCreateClassroom() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTeacherData();
  return useMutation({
    mutationFn: (payload: ClassroomFormValues) => teacherApi.createClassroom(payload),
    onSuccess: (data) => {
      invalidate();
      enqueueSnackbar(`"${data.name}" created — join code ${data.classCode}.`, { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useUpdateClassroom() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTeacherData();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ClassroomFormValues> }) =>
      teacherApi.updateClassroom(id, payload),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Classroom updated.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useArchiveClassroom() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTeacherData();
  return useMutation({
    mutationFn: (id: number) => teacherApi.archiveClassroom(id),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Classroom archived.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useRestoreClassroom() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTeacherData();
  return useMutation({
    mutationFn: (id: number) => teacherApi.restoreClassroom(id),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Classroom restored.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useDeleteClassroom() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTeacherData();
  return useMutation({
    mutationFn: (id: number) => teacherApi.deleteClassroom(id),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Classroom deleted.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useRegenerateJoinCode() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTeacherData();
  return useMutation({
    mutationFn: (id: number) => teacherApi.regenerateJoinCode(id),
    onSuccess: (data) => {
      invalidate();
      enqueueSnackbar(`New join code: ${data.classCode}`, { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}
