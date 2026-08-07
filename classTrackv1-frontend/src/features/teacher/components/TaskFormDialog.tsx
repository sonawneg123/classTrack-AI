import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { ALLOWED_FILE_TYPES, taskFormSchema, type TaskFormSchema } from "../schemas/taskSchema";
import { useClassrooms } from "../hooks/useClassrooms";
import type { Task } from "@/types/task";

interface TaskFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  task?: Task | null;
  defaultClassroomId?: number;
  submitting?: boolean;
  onSubmit: (values: TaskFormSchema) => void;
  onClose: () => void;
}

const EMPTY_VALUES: TaskFormSchema = {
  classroomId: 0,
  title: "",
  description: "",
  instructions: "",
  maxScore: 100,
  dueDate: "",
  taskDate: "",
  aiEvaluationEnabled: true,
  allowedFileTypes: [],
  lateSubmissionAllowed: false,
  maxFileSizeMb: undefined,
};

export function TaskFormDialog({
  open,
  mode,
  task,
  defaultClassroomId,
  submitting = false,
  onSubmit,
  onClose,
}: TaskFormDialogProps) {
  // Active classrooms only — you can't assign a new/edited task to an
  // archived classroom (mirrors the backend's publish-time check).
  const { data: classroomData } = useClassrooms({
    page: 1, limit: 100, status: "active", sortBy: "name", sortDir: "asc",
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<TaskFormSchema>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && task) {
      reset({
        classroomId: task.classroomId,
        title: task.title,
        description: task.description ?? "",
        instructions: task.instructions ?? "",
        maxScore: task.maxScore,
        dueDate: task.dueDate ?? "",
        taskDate: task.taskDate ?? "",
        aiEvaluationEnabled: task.aiEvaluationEnabled,
        allowedFileTypes: task.allowedFileTypes ?? [],
        lateSubmissionAllowed: task.lateSubmissionAllowed,
        maxFileSizeMb: task.maxFileSizeMb ?? undefined,
      });
    } else {
      reset({ ...EMPTY_VALUES, classroomId: defaultClassroomId ?? 0 });
    }
  }, [open, mode, task, defaultClassroomId, reset]);

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{mode === "create" ? "Create assignment" : "Edit assignment"}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent>
          <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField
                select
                fullWidth
                label="Classroom"
                disabled={mode === "edit"}
                error={Boolean(errors.classroomId)}
                helperText={errors.classroomId?.message ?? (mode === "edit" ? "Classroom can't be changed after creation" : undefined)}
                {...register("classroomId", { valueAsNumber: true })}
              >
                <MenuItem value={0} disabled>Select a classroom…</MenuItem>
                {classroomData?.classrooms.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}{c.section ? ` · ${c.section}` : ""}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={12}>
              <TextField
                label="Title" fullWidth autoFocus
                error={Boolean(errors.title)} helperText={errors.title?.message}
                {...register("title")}
              />
            </Grid>

            <Grid size={12}>
              <TextField
                label="Description" fullWidth multiline minRows={2}
                error={Boolean(errors.description)} helperText={errors.description?.message}
                {...register("description")}
              />
            </Grid>

            <Grid size={12}>
              <TextField
                label="Submission instructions" fullWidth multiline minRows={2}
                error={Boolean(errors.instructions)} helperText={errors.instructions?.message}
                {...register("instructions")}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Maximum marks" type="number" fullWidth
                error={Boolean(errors.maxScore)} helperText={errors.maxScore?.message}
                {...register("maxScore", { valueAsNumber: true })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Task date" type="date" fullWidth
                InputLabelProps={{ shrink: true }}
                error={Boolean(errors.taskDate)} helperText={errors.taskDate?.message}
                {...register("taskDate")}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Due date" type="date" fullWidth
                InputLabelProps={{ shrink: true }}
                error={Boolean(errors.dueDate)} helperText={errors.dueDate?.message}
                {...register("dueDate")}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                control={control}
                name="allowedFileTypes"
                render={({ field }) => (
                  <Autocomplete
                    multiple
                    options={[...ALLOWED_FILE_TYPES]}
                    value={field.value}
                    onChange={(_, next) => field.onChange(next)}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => (
                        <Chip label={option.toUpperCase()} size="small" {...getTagProps({ index })} key={option} />
                      ))
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Allowed file types"
                        placeholder="Platform default if empty"
                        error={Boolean(errors.allowedFileTypes)}
                        helperText={errors.allowedFileTypes?.message}
                      />
                    )}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Max file size (MB)" type="number" fullWidth
                placeholder="Platform default"
                error={Boolean(errors.maxFileSizeMb)} helperText={errors.maxFileSizeMb?.message}
                {...register("maxFileSizeMb", { valueAsNumber: true })}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Controller
                control={control}
                name="lateSubmissionAllowed"
                render={({ field }) => (
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ height: "100%" }}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>Allow late submission</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Accept submissions after the due date
                      </Typography>
                    </Box>
                    <FormControlLabel
                      control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                      label=""
                      sx={{ m: 0 }}
                    />
                  </Stack>
                )}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                control={control}
                name="aiEvaluationEnabled"
                render={({ field }) => (
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography variant="body2" fontWeight={600}>AI evaluation</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Automatically score and summarize student submissions
                      </Typography>
                    </Box>
                    <FormControlLabel
                      control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                      label=""
                      sx={{ m: 0 }}
                    />
                  </Stack>
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={submitting} color="inherit">Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
