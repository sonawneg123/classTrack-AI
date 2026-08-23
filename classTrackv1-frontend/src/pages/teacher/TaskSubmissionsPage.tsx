/**
 * src/pages/teacher/TaskSubmissionsPage.tsx
 *
 * Teacher view of all student submissions for a single task.
 * Backed by: GET /teacher/tasks/:taskId/submissions  (existing endpoint)
 *            PATCH /teacher/submissions/:id/override-score (existing endpoint)
 *
 * Flow: Grading Overview (by assignment) → click task row → this page
 */
import { useState } from "react";
import { useParams, useNavigate, Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import GradeOutlinedIcon from "@mui/icons-material/GradeOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useSnackbar } from "notistack";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookCard } from "@components/notebook";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import { ErrorBoundary } from "@components/feedback/ErrorBoundary";
import { useTaskSubmissions, useOverrideScore } from "@features/teacher/hooks/useTaskSubmissions";
import { ROUTES } from "@utils/constants";
import type {
  TaskSubmissionRosterEntry,
  TaskSubmission,
} from "@/types/grading";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusChip(status: TaskSubmission["status"] | null) {
  if (!status) return <Chip label="Not submitted" size="small" variant="outlined" color="default" />;
  const map = {
    submitted:  <Chip label="Submitted" size="small" color="info" />,
    analyzing:  <Chip label="AI Analyzing…" size="small" color="warning" icon={<CircularProgress size={12} />} />,
    analyzed:   <Chip label="Graded" size="small" color="success" icon={<CheckCircleOutlineIcon sx={{ fontSize: 14 }} />} />,
    failed:     <Chip label="Analysis Failed" size="small" color="error" icon={<ErrorOutlineIcon sx={{ fontSize: 14 }} />} />,
  };
  return map[status];
}

// ---------------------------------------------------------------------------
// Submission detail panel shown in dialog
// ---------------------------------------------------------------------------
interface DetailPanelProps {
  entry: TaskSubmissionRosterEntry;
  maxScore: number;
  onOverride: (score: number | null, feedback: string) => void;
  overriding: boolean;
}

function SubmissionDetailPanel({ entry, maxScore, onOverride, overriding }: DetailPanelProps) {
  const { student, submission } = entry;
  const [scoreInput, setScoreInput] = useState(
    submission?.teacher_score !== null && submission?.teacher_score !== undefined
      ? String(submission.teacher_score)
      : ""
  );
  const [feedbackInput, setFeedbackInput] = useState(submission?.teacher_feedback ?? "");
  const [scoreError, setScoreError] = useState("");

  if (!submission) {
    return (
      <Box sx={{ py: 4, textAlign: "center" }}>
        <HourglassEmptyOutlinedIcon fontSize="large" color="disabled" />
        <Typography variant="body2" color="text.secondary" mt={1}>
          {student.name} has not submitted this assignment yet.
        </Typography>
      </Box>
    );
  }

  const strengths = parseJsonArray(submission.ai_strengths);
  const improvements = parseJsonArray(submission.ai_improvements);
  const effectiveScore = submission.effective_score;

  const handleOverride = () => {
    if (scoreInput.trim() === "") {
      onOverride(null, feedbackInput);
      return;
    }
    const n = parseFloat(scoreInput);
    if (isNaN(n) || n < 0 || n > maxScore) {
      setScoreError(`Score must be between 0 and ${maxScore}`);
      return;
    }
    setScoreError("");
    onOverride(n, feedbackInput);
  };

  return (
    <Stack spacing={2.5}>
      {/* Effective score banner */}
      <Paper
        variant="outlined"
        sx={{ p: 2, display: "flex", alignItems: "center", gap: 2 }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Effective Score</Typography>
          <Typography variant="h5" fontWeight={700} color="primary.main">
            {effectiveScore !== null ? `${effectiveScore} / ${maxScore}` : "—"}
          </Typography>
          {submission.teacher_score !== null && (
            <Chip label="Teacher override active" size="small" color="secondary" sx={{ mt: 0.5 }} />
          )}
        </Box>
        <Stack spacing={0.5} alignItems="flex-end">
          {submission.ai_score !== null && (
            <Typography variant="caption" color="text.secondary">
              AI score: {submission.ai_score}
            </Typography>
          )}
          {submission.teacher_score !== null && (
            <Typography variant="caption" color="secondary.main" fontWeight={600}>
              Teacher score: {submission.teacher_score}
            </Typography>
          )}
        </Stack>
      </Paper>

      {/* Submission status + submitted text */}
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" mb={1}>
          {statusChip(submission.status)}
          <Typography variant="caption" color="text.secondary">
            Submitted {formatDate(submission.submitted_at)} · Attempt #{submission.attempt_number}
          </Typography>
        </Stack>
        {submission.typed_text && (
          <Paper
            variant="outlined"
            sx={{ p: 2, bgcolor: "background.default", fontFamily: "monospace", fontSize: "0.8rem", whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}
          >
            {submission.typed_text}
          </Paper>
        )}
        {!submission.typed_text && submission.file_type && submission.file_type !== "text" && (
          <Typography variant="body2" color="text.secondary">
            File: {submission.original_filename ?? submission.file_type.toUpperCase()}
          </Typography>
        )}
      </Box>

      {/* AI feedback */}
      {submission.status === "analyzed" && (
        <>
          <Divider />
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <AutoAwesomeOutlinedIcon fontSize="small" color="secondary" />
              <Typography variant="subtitle2">AI Feedback</Typography>
            </Stack>
            {submission.ai_summary && (
              <Typography variant="body2" mb={1.5}>
                {submission.ai_summary}
              </Typography>
            )}
            {strengths.length > 0 && (
              <Box mb={1}>
                <Typography variant="caption" fontWeight={700} color="success.main">
                  Strengths
                </Typography>
                <List dense disablePadding sx={{ mt: 0.5 }}>
                  {strengths.map((s, i) => (
                    <ListItem key={i} sx={{ py: 0, px: 1, "::before": { content: '"•"', mr: 1 }, display: "flex" }}>
                      <Typography variant="body2">{s}</Typography>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
            {improvements.length > 0 && (
              <Box>
                <Typography variant="caption" fontWeight={700} color="warning.main">
                  Areas to Improve
                </Typography>
                <List dense disablePadding sx={{ mt: 0.5 }}>
                  {improvements.map((s, i) => (
                    <ListItem key={i} sx={{ py: 0, px: 1, "::before": { content: '"•"', mr: 1 }, display: "flex" }}>
                      <Typography variant="body2">{s}</Typography>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        </>
      )}

      {/* Teacher override form */}
      <Divider />
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
          <GradeOutlinedIcon fontSize="small" />
          <Typography variant="subtitle2">Override Score</Typography>
        </Stack>
        <Stack spacing={1.5}>
          <TextField
            label={`Score (0 – ${maxScore})`}
            size="small"
            type="number"
            value={scoreInput}
            onChange={(e) => { setScoreInput(e.target.value); setScoreError(""); }}
            error={Boolean(scoreError)}
            helperText={scoreError || "Leave blank to clear override and use AI score"}
            slotProps={{ htmlInput: { min: 0, max: maxScore, step: 0.5 } }}
          />
          <TextField
            label="Feedback (optional)"
            size="small"
            multiline
            rows={2}
            value={feedbackInput}
            onChange={(e) => setFeedbackInput(e.target.value)}
          />
          <Button
            variant="contained"
            size="small"
            disabled={overriding}
            startIcon={overriding ? <CircularProgress size={14} /> : undefined}
            onClick={handleOverride}
          >
            {scoreInput.trim() ? "Save override" : "Clear override"}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TaskSubmissionsPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const parsedId = taskId ? parseInt(taskId, 10) : undefined;
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { data, isLoading, isError, error } = useTaskSubmissions(parsedId);
  const overrideMutation = useOverrideScore(parsedId ?? 0);

  const [selectedEntry, setSelectedEntry] = useState<TaskSubmissionRosterEntry | null>(null);

  const task = data?.task;
  const roster = data?.roster ?? [];

  const crumbs = [
    { label: "Dashboard", href: ROUTES.TEACHER.DASHBOARD },
    { label: "Classrooms", href: ROUTES.TEACHER.CLASSROOMS },
    { label: task?.title ?? "Submissions" },
  ];

  return (
    <DashboardLayout
      title={task ? `${task.title} — Submissions` : "Submissions"}
      description={task ? `Max score: ${task.max_score}${task.due_date ? ` · Due ${new Date(task.due_date).toLocaleDateString()}` : ""}` : ""}
      breadcrumbs={crumbs}
      actions={
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          size="small"
        >
          Back
        </Button>
      }
    >
      <ErrorBoundary section="task submissions">
        {isError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {(error as Error)?.message ?? "Failed to load submissions."}
          </Alert>
        )}

        {isLoading ? (
          <NotebookCard>
            <LoadingSkeleton variant="list" rows={5} />
          </NotebookCard>
        ) : (
          <NotebookCard disablePadding>
            {roster.length === 0 ? (
              <EmptyState
                icon={<HourglassEmptyOutlinedIcon fontSize="inherit" />}
                title="No students enrolled"
                description="Students join this classroom using the class code."
              />
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Student</TableCell>
                      <TableCell>Username</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="center">AI Score</TableCell>
                      <TableCell align="center">Teacher Score</TableCell>
                      <TableCell align="center">Effective Score</TableCell>
                      <TableCell>Submitted</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {roster.map(({ student, submission }) => (
                      <TableRow
                        key={student.id}
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() => setSelectedEntry({ student, submission })}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {student.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                            {student.username}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          {statusChip(submission?.status ?? null)}
                        </TableCell>
                        <TableCell align="center">
                          {submission?.ai_score !== null && submission?.ai_score !== undefined
                            ? submission.ai_score
                            : <Typography variant="body2" color="text.secondary">—</Typography>
                          }
                        </TableCell>
                        <TableCell align="center">
                          {submission?.teacher_score !== null && submission?.teacher_score !== undefined
                            ? <Typography variant="body2" color="secondary.main" fontWeight={600}>{submission.teacher_score}</Typography>
                            : <Typography variant="body2" color="text.secondary">—</Typography>
                          }
                        </TableCell>
                        <TableCell align="center">
                          {submission?.effective_score !== null && submission?.effective_score !== undefined
                            ? <Typography variant="body2" fontWeight={700}>{submission.effective_score}</Typography>
                            : <Typography variant="body2" color="text.secondary">—</Typography>
                          }
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {submission ? formatDate(submission.submitted_at) : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                           <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                             {submission && (
                               <Tooltip title="Open submission detail">
                                 <IconButton
                                   size="small"
                                   color="primary"
                                   component={RouterLink}
                                   to={ROUTES.TEACHER.SUBMISSION_DETAIL(submission.id)}
                                   onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                 >
                                   <OpenInNewIcon fontSize="small" />
                                 </IconButton>
                               </Tooltip>
                             )}
                             <Tooltip title="Quick review">
                               <IconButton
                                 size="small"
                                 color="default"
                                 onClick={(e) => { e.stopPropagation(); setSelectedEntry({ student, submission }); }}
                               >
                                 <GradeOutlinedIcon fontSize="small" />
                               </IconButton>
                             </Tooltip>
                           </Stack>
                         </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </NotebookCard>
        )}
      </ErrorBoundary>

      {/* ── Submission review dialog ──────────────────────────────────────── */}
      <Dialog
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {selectedEntry?.student.name} — Submission Review
        </DialogTitle>
        <DialogContent dividers>
          {selectedEntry && task && (
            <SubmissionDetailPanel
              entry={selectedEntry}
              maxScore={task.max_score}
              overriding={overrideMutation.isPending}
              onOverride={(score, feedback) => {
                if (!selectedEntry.submission) return;
                overrideMutation.mutate(
                  {
                    submissionId: selectedEntry.submission.id,
                    teacherScore: score,
                    teacherFeedback: feedback || undefined,
                  },
                  {
                    onSuccess: () => {
                      enqueueSnackbar("Score saved. Student has been notified.", { variant: "success" });
                      setSelectedEntry(null);
                    },
                    onError: (err: unknown) => {
                      enqueueSnackbar(
                        err instanceof Error ? err.message : "Failed to save score.",
                        { variant: "error" }
                      );
                    },
                  }
                );
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedEntry(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}
