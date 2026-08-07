import { useState } from "react";
import { Button, Fade } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { ErrorBoundary } from "@components/feedback/ErrorBoundary";
import { TaskTable } from "@features/teacher/components/TaskTable";
import { TaskFormDialog } from "@features/teacher/components/TaskFormDialog";
import { ConfirmActionDialog } from "@features/teacher/components/ConfirmActionDialog";
import {
  useArchiveTask,
  useCreateTask,
  useDeleteTask,
  useDuplicateTask,
  usePublishTask,
  useRestoreTask,
  useTasks,
  useUnpublishTask,
  useUpdateTask,
} from "@features/teacher/hooks/useTasks";
import { ROUTES } from "@utils/constants";
import type { Task, TaskListParams } from "@/types/task";
import type { TaskFormSchema } from "@features/teacher/schemas/taskSchema";

const DEFAULT_PARAMS: TaskListParams = {
  page: 1,
  limit: 10,
  status: "all",
  sortBy: "createdAt",
  sortDir: "desc",
};

export default function TasksPage() {
  const [params, setParams] = useState<TaskListParams>(DEFAULT_PARAMS);
  const [formState, setFormState] = useState<{ open: boolean; mode: "create" | "edit"; task: Task | null }>(
    { open: false, mode: "create", task: null }
  );
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const { data, isLoading, isFetching } = useTasks(params);
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const publishMutation = usePublishTask();
  const unpublishMutation = useUnpublishTask();
  const archiveMutation = useArchiveTask();
  const restoreMutation = useRestoreTask();
  const duplicateMutation = useDuplicateTask();

  const handleFormSubmit = (values: TaskFormSchema) => {
    const payload = {
      classroomId: values.classroomId,
      title: values.title,
      description: values.description || undefined,
      instructions: values.instructions || undefined,
      maxScore: values.maxScore,
      dueDate: values.dueDate || undefined,
      taskDate: values.taskDate || undefined,
      aiEvaluationEnabled: values.aiEvaluationEnabled,
      allowedFileTypes: values.allowedFileTypes,
      lateSubmissionAllowed: values.lateSubmissionAllowed,
      maxFileSizeMb: values.maxFileSizeMb,
    };
    if (formState.mode === "create") {
      createMutation.mutate(payload, { onSuccess: () => setFormState({ open: false, mode: "create", task: null }) });
    } else if (formState.task) {
      updateMutation.mutate(
        { id: formState.task.id, payload },
        { onSuccess: () => setFormState({ open: false, mode: "create", task: null }) }
      );
    }
  };

  const handleTogglePublish = (task: Task) => {
    if (task.isPublished) {
      unpublishMutation.mutate(task.id);
    } else {
      publishMutation.mutate(task.id);
    }
  };

  return (
    <DashboardLayout
      title="Assignments"
      description="Create and manage assignments across your classrooms."
      breadcrumbs={[{ label: "Dashboard", href: ROUTES.TEACHER.DASHBOARD }, { label: "Assignments" }]}
      actions={
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setFormState({ open: true, mode: "create", task: null })}
        >
          New assignment
        </Button>
      }
    >
      <ErrorBoundary section="your assignments">
        <Fade in timeout={300}>
          <div>
            <TaskTable
              tasks={data?.tasks ?? []}
              pagination={data?.pagination}
              params={params}
              isLoading={isLoading || isFetching}
              onParamsChange={setParams}
              onEdit={(task) => setFormState({ open: true, mode: "edit", task })}
              onDelete={setDeleteTarget}
              onTogglePublish={handleTogglePublish}
              onArchive={(task) => archiveMutation.mutate(task.id)}
              onRestore={(task) => restoreMutation.mutate(task.id)}
              onDuplicate={(task) => duplicateMutation.mutate(task.id)}
              onCreateFirst={() => setFormState({ open: true, mode: "create", task: null })}
            />
          </div>
        </Fade>
      </ErrorBoundary>

      <TaskFormDialog
        open={formState.open}
        mode={formState.mode}
        task={formState.task}
        submitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleFormSubmit}
        onClose={() => setFormState({ open: false, mode: "create", task: null })}
      />

      {deleteTarget && (
        <ConfirmActionDialog
          open={Boolean(deleteTarget)}
          title="Delete assignment?"
          description={`"${deleteTarget.title}" will be permanently removed from your assignment list. This cannot be undone.`}
          confirmLabel="Delete"
          confirmColor="error"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </DashboardLayout>
  );
}
