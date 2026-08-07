import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { teacherApi } from "../api/teacherApi";
import { getErrorMessage } from "@utils/apiError";
import type { TaskFormValues, TaskListParams } from "@/types/task";

const TASKS_KEY = ["teacher", "tasks"] as const;

export function useTasks(params: TaskListParams) {
  return useQuery({
    queryKey: [...TASKS_KEY, params],
    queryFn: () => teacherApi.listTasks(params),
    placeholderData: (previousData) => previousData,
  });
}

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: TASKS_KEY });
    queryClient.invalidateQueries({ queryKey: ["teacher", "dashboard"] });
  };
}

export function useCreateTask() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (payload: TaskFormValues) => teacherApi.createTask(payload),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Task created — students have been notified.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useUpdateTask() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<TaskFormValues> }) =>
      teacherApi.updateTask(id, payload),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Task updated.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useDeleteTask() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: number) => teacherApi.deleteTask(id),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Task deleted.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function usePublishTask() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: number) => teacherApi.publishTask(id),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Task published — visible to students.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useUnpublishTask() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: number) => teacherApi.unpublishTask(id),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Task unpublished — hidden from students.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useArchiveTask() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: number) => teacherApi.archiveTask(id),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Task archived.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useRestoreTask() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: number) => teacherApi.restoreTask(id),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Task restored.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}

export function useDuplicateTask() {
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: number) => teacherApi.duplicateTask(id),
    onSuccess: () => {
      invalidate();
      enqueueSnackbar("Task duplicated as a new draft.", { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });
}
