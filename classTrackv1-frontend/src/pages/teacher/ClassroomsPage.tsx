import { useState } from "react";
import { Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { ClassroomTable } from "@features/teacher/components/ClassroomTable";
import { ClassroomFormDialog } from "@features/teacher/components/ClassroomFormDialog";
import { ConfirmActionDialog } from "@features/teacher/components/ConfirmActionDialog";
import {
  useArchiveClassroom,
  useClassrooms,
  useCreateClassroom,
  useDeleteClassroom,
  useRegenerateJoinCode,
  useRestoreClassroom,
  useUpdateClassroom,
} from "@features/teacher/hooks/useClassrooms";
import { ROUTES } from "@utils/constants";
import type { Classroom, ClassroomListParams } from "@/types/classroom";
import type { ClassroomFormSchema } from "@features/teacher/schemas/classroomSchema";

type ConfirmAction = { type: "archive" | "restore" | "delete"; classroom: Classroom } | null;

const DEFAULT_PARAMS: ClassroomListParams = {
  page: 1,
  limit: 10,
  status: "active",
  sortBy: "createdAt",
  sortDir: "desc",
};

export default function ClassroomsPage() {
  const [params, setParams] = useState<ClassroomListParams>(DEFAULT_PARAMS);
  const [formState, setFormState] = useState<{ open: boolean; mode: "create" | "edit"; classroom: Classroom | null }>(
    { open: false, mode: "create", classroom: null }
  );
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const { data, isLoading, isFetching } = useClassrooms(params);
  const createMutation = useCreateClassroom();
  const updateMutation = useUpdateClassroom();
  const archiveMutation = useArchiveClassroom();
  const restoreMutation = useRestoreClassroom();
  const deleteMutation = useDeleteClassroom();
  const regenerateMutation = useRegenerateJoinCode();

  const handleFormSubmit = (values: ClassroomFormSchema) => {
    const payload = {
      name: values.name,
      subject: values.subject || undefined,
      section: values.section || undefined,
    };
    if (formState.mode === "create") {
      createMutation.mutate(payload, { onSuccess: () => setFormState({ open: false, mode: "create", classroom: null }) });
    } else if (formState.classroom) {
      updateMutation.mutate(
        { id: formState.classroom.id, payload },
        { onSuccess: () => setFormState({ open: false, mode: "create", classroom: null }) }
      );
    }
  };

  const handleConfirm = () => {
    if (!confirmAction) return;
    const { type, classroom } = confirmAction;
    const mutation = type === "archive" ? archiveMutation : type === "restore" ? restoreMutation : deleteMutation;
    mutation.mutate(classroom.id, { onSuccess: () => setConfirmAction(null) });
  };

  const confirmCopy: Record<NonNullable<ConfirmAction>["type"], { title: string; description: (c: Classroom) => string; label: string; color: "error" | "warning" | "primary" }> = {
    archive: {
      title: "Archive classroom?",
      description: (c) => `"${c.name}" will be hidden from your active list. You can restore it anytime.`,
      label: "Archive",
      color: "warning",
    },
    restore: {
      title: "Restore classroom?",
      description: (c) => `"${c.name}" will move back to your active classrooms.`,
      label: "Restore",
      color: "primary",
    },
    delete: {
      title: "Delete classroom?",
      description: (c) => `"${c.name}" will be permanently removed from your classroom list. This cannot be undone.`,
      label: "Delete",
      color: "error",
    },
  };

  return (
    <DashboardLayout
      title="Classrooms"
      description="Create and manage your classrooms."
      breadcrumbs={[{ label: "Dashboard", href: ROUTES.TEACHER.DASHBOARD }, { label: "Classrooms" }]}
      actions={
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setFormState({ open: true, mode: "create", classroom: null })}
        >
          New classroom
        </Button>
      }
    >
      <ClassroomTable
        classrooms={data?.classrooms ?? []}
        pagination={data?.pagination}
        params={params}
        isLoading={isLoading || isFetching}
        onParamsChange={setParams}
        onEdit={(classroom) => setFormState({ open: true, mode: "edit", classroom })}
        onArchive={(classroom) => setConfirmAction({ type: "archive", classroom })}
        onRestore={(classroom) => setConfirmAction({ type: "restore", classroom })}
        onDelete={(classroom) => setConfirmAction({ type: "delete", classroom })}
        onRegenerateCode={(classroom) => regenerateMutation.mutate(classroom.id)}
        onCreateFirst={() => setFormState({ open: true, mode: "create", classroom: null })}
      />

      <ClassroomFormDialog
        open={formState.open}
        mode={formState.mode}
        classroom={formState.classroom}
        submitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleFormSubmit}
        onClose={() => setFormState({ open: false, mode: "create", classroom: null })}
      />

      {confirmAction && (
        <ConfirmActionDialog
          open={Boolean(confirmAction)}
          title={confirmCopy[confirmAction.type].title}
          description={confirmCopy[confirmAction.type].description(confirmAction.classroom)}
          confirmLabel={confirmCopy[confirmAction.type].label}
          confirmColor={confirmCopy[confirmAction.type].color}
          loading={archiveMutation.isPending || restoreMutation.isPending || deleteMutation.isPending}
          onConfirm={handleConfirm}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </DashboardLayout>
  );
}
