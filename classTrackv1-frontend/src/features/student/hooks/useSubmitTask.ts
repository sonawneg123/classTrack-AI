/**
 * src/features/student/hooks/useSubmitTask.ts
 * Mutation hook for submitting or resubmitting a task.
 * On success, invalidates both the assignments list and the submissions list
 * so any cached queries see the new state without a browser refresh.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { studentApi } from "../api/studentApi";

export function useSubmitTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number;
      payload: { typedText?: string; file?: File };
    }) => studentApi.submitTask(taskId, payload),
    onSuccess: () => {
      // Refetch both lists so the UI reflects the new submission state
      queryClient.invalidateQueries({ queryKey: ["student", "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["student", "submissions"] });
    },
  });
}
