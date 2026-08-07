import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { classroomFormSchema, type ClassroomFormSchema } from "../schemas/classroomSchema";
import type { Classroom } from "@/types/classroom";

interface ClassroomFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  classroom?: Classroom | null;
  submitting?: boolean;
  onSubmit: (values: ClassroomFormSchema) => void;
  onClose: () => void;
}

export function ClassroomFormDialog({
  open,
  mode,
  classroom,
  submitting = false,
  onSubmit,
  onClose,
}: ClassroomFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClassroomFormSchema>({
    resolver: zodResolver(classroomFormSchema),
    defaultValues: { name: "", subject: "", section: "" },
  });

  // Reset the form to the classroom's current values whenever the dialog
  // opens for editing (or clear it for create) — keeps this a single
  // controlled component for both modes instead of two near-duplicates.
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && classroom) {
      reset({ name: classroom.name, subject: classroom.subject ?? "", section: classroom.section ?? "" });
    } else {
      reset({ name: "", subject: "", section: "" });
    }
  }, [open, mode, classroom, reset]);

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{mode === "create" ? "Create classroom" : "Edit classroom"}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Classroom name"
              autoFocus
              fullWidth
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
              {...register("name")}
            />
            <TextField
              label="Subject"
              fullWidth
              error={Boolean(errors.subject)}
              helperText={errors.subject?.message}
              {...register("subject")}
            />
            <TextField
              label="Section"
              fullWidth
              error={Boolean(errors.section)}
              helperText={errors.section?.message}
              {...register("section")}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={submitting} color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
