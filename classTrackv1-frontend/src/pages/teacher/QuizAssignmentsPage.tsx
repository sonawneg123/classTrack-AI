// src/pages/teacher/QuizAssignmentsPage.tsx
//
// Sprint 7 — Teacher Quiz Assignments
// Lists all quiz assignments and provides a "New Quiz" creation dialog.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage } from "@components/notebook";
import {
  useTeacherQuizzes,
  useCreateQuiz,
  useArchiveQuiz,
  useDeleteQuiz,
} from "@features/quizAssignments/hooks/useQuizAssignments";
import { useClassrooms } from "@features/teacher/hooks/useClassrooms";
import { ROUTES } from "@utils/constants";
import type { QuizAssignment, QuizStatus, CreateQuizPayload } from "@/types/quizAssignment";

// ── Status chip ────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: QuizStatus }) {
  const map: Record<QuizStatus, "default" | "success" | "warning"> = {
    draft:     "default",
    published: "success",
    archived:  "warning",
  };
  return (
    <Chip
      label={status.charAt(0).toUpperCase() + status.slice(1)}
      color={map[status]}
      size="small"
      sx={{ fontSize: 11 }}
    />
  );
}

// ── Create Quiz Dialog ─────────────────────────────────────────────────────────
function CreateQuizDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createMutation = useCreateQuiz();
  const classroomsQuery = useClassrooms({ page: 1, limit: 100, status: "active", sortBy: "name", sortDir: "asc" });

  const [form, setForm] = useState<CreateQuizPayload>({
    classroomId: 0,
    title: "",
    instructions: null,
    timeLimitMinutes: null,
    dueDate: null,
    shuffleQuestions: false,
    allowRetake: false,
  });

  const classrooms = classroomsQuery.data?.classrooms ?? [];

  const handleCreate = () => {
    if (!form.classroomId || !form.title.trim()) return;
    createMutation.mutate(
      { ...form, title: form.title.trim() },
      { onSuccess: () => { onClose(); resetForm(); } }
    );
  };

  const resetForm = () => setForm({
    classroomId: 0, title: "", instructions: null,
    timeLimitMinutes: null, dueDate: null,
    shuffleQuestions: false, allowRetake: false,
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Quiz Assignment</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl size="small" fullWidth required>
            <InputLabel>Classroom</InputLabel>
            <Select
              value={form.classroomId || ""}
              label="Classroom"
              onChange={(e) => setForm((f) => ({ ...f, classroomId: Number(e.target.value) }))}
            >
              {classrooms.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}{c.section ? ` — ${c.section}` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Title"
            required
            inputProps={{ maxLength: 200 }}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />

          <TextField
            size="small"
            label="Instructions (optional)"
            multiline
            rows={3}
            inputProps={{ maxLength: 2000 }}
            value={form.instructions ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value || null }))}
          />

          <Stack direction="row" spacing={2}>
            <TextField
              size="small"
              label="Time Limit (minutes)"
              type="number"
              value={form.timeLimitMinutes ?? ""}
              onChange={(e) => setForm((f) => ({
                ...f, timeLimitMinutes: e.target.value ? Number(e.target.value) : null,
              }))}
              inputProps={{ min: 1, max: 300 }}
              sx={{ flex: 1 }}
            />

            <TextField
              size="small"
              label="Due Date"
              type="datetime-local"
              value={form.dueDate ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value || null }))}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.allowRetake}
                  onChange={(e) => setForm((f) => ({ ...f, allowRetake: e.target.checked }))}
                  size="small"
                />
              }
              label={<Typography variant="body2">Allow Retake</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.shuffleQuestions}
                  onChange={(e) => setForm((f) => ({ ...f, shuffleQuestions: e.target.checked }))}
                  size="small"
                />
              }
              label={<Typography variant="body2">Shuffle Questions</Typography>}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={!form.classroomId || !form.title.trim() || createMutation.isPending}
          startIcon={createMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          Create Quiz
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function QuizAssignmentsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const { data, isLoading, isError } = useTeacherQuizzes();
  const archiveMutation = useArchiveQuiz();
  const deleteMutation  = useDeleteQuiz();

  const quizzes: QuizAssignment[] = data?.quizzes ?? [];

  return (
    <DashboardLayout
      title="Quiz Assignments"
      description="Create and manage quiz assignments for your classrooms."
      breadcrumbs={[
        { label: "Dashboard", href: "/teacher/dashboard" },
        { label: "Quiz Assignments" },
      ]}
    >
      <NotebookPage>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Typography variant="h6">My Quiz Assignments</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            New Quiz
          </Button>
        </Stack>

        {isLoading && (
          <Stack alignItems="center" py={6}>
            <CircularProgress size={32} />
          </Stack>
        )}

        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load quiz assignments. Please refresh.
          </Alert>
        )}

        {!isLoading && quizzes.length === 0 && (
          <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 2 }}>
            <QuizOutlinedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No quiz assignments yet. Click "New Quiz" to create one.
            </Typography>
          </Paper>
        )}

        {!isLoading && quizzes.length > 0 && (
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell><strong>Title</strong></TableCell>
                  <TableCell><strong>Classroom</strong></TableCell>
                  <TableCell align="center"><strong>Status</strong></TableCell>
                  <TableCell align="center"><strong>Questions</strong></TableCell>
                  <TableCell align="center"><strong>Submissions</strong></TableCell>
                  <TableCell><strong>Due Date</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quizzes.map((q) => (
                  <TableRow
                    key={q.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(ROUTES.TEACHER.QUIZ_ASSIGNMENT_DETAIL(q.id))}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{q.title}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {q.classroom_name ?? `#${q.classroom_id}`}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <StatusChip status={q.status} />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">{Number(q.question_count)}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">{Number(q.attempt_count)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {q.due_date
                          ? new Date(q.due_date).toLocaleDateString()
                          : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                        <Tooltip title="Open">
                          <IconButton
                            size="small"
                            onClick={() => navigate(ROUTES.TEACHER.QUIZ_ASSIGNMENT_DETAIL(q.id))}
                          >
                            <OpenInNewOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {q.status !== "archived" && (
                          <Tooltip title="Archive">
                            <IconButton
                              size="small"
                              onClick={() => archiveMutation.mutate(q.id)}
                              disabled={archiveMutation.isPending}
                            >
                              <ArchiveOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => deleteMutation.mutate(q.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </NotebookPage>

      <CreateQuizDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </DashboardLayout>
  );
}
