/**
 * src/pages/teacher/SubmissionDetailPage.tsx
 *
 * Teacher view of a SINGLE student submission.
 * Backed by:
 *   GET   /teacher/submissions/:submissionId  (new endpoint)
 *   PATCH /teacher/submissions/:submissionId/override-score  (existing)
 *
 * Flow: Grading Overview → Task Submissions list → click student row → this page
 */
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import GradeOutlinedIcon from "@mui/icons-material/GradeOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import { useSnackbar } from "notistack";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookCard } from "@components/notebook";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { ErrorBoundary } from "@components/feedback/ErrorBoundary";
import {
  useTeacherSubmission,
  useOverrideScore,
} from "@features/teacher/hooks/useTaskSubmissions";
import { ROUTES } from "@utils/constants";
import type { TeacherSubmission } from "@/types/grading";

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

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusChip({ status }: { status: TeacherSubmission["status"] }) {
  const map: Record<TeacherSubmission["status"], React.ReactElement> = {
    submitted: <Chip label="Submitted" size="small" color="info" />,
    analyzing: (
      <Chip
        label="AI Analyzing…"
        size="small"
        color="warning"
        icon={<CircularProgress size={12} />}
      />
    ),
    analyzed: (
      <Chip
        label="Analyzed"
        size="small"
        color="success"
        icon={<CheckCircleOutlineIcon sx={{ fontSize: 14 }} />}
      />
    ),
    failed: (
      <Chip
        label="Analysis Failed"
        size="small"
        color="error"
        icon={<ErrorOutlineIcon sx={{ fontSize: 14 }} />}
      />
    ),
  };
  return map[status] ?? <Chip label={status} size="small" />;
}

// ---------------------------------------------------------------------------
// Teacher grading form
// ---------------------------------------------------------------------------

interface GradingFormProps {
  submission: TeacherSubmission;
  onSave: (score: number | null, feedback: string) => void;
  saving: boolean;
}

function GradingForm({ submission, onSave, saving }: GradingFormProps) {
  const [score, setScore] = useState(
    submission.teacher_score !== null ? String(submission.teacher_score) : ""
  );
  const [feedback, setFeedback] = useState(submission.teacher_feedback ?? "");
  const [scoreError, setScoreError] = useState("");

  const handleSave = () => {
    if (score.trim() === "") {
      onSave(null, feedback);
      return;
    }
    const n = parseFloat(score);
    if (isNaN(n) || n < 0 || n > submission.max_score) {
      setScoreError(`Score must be between 0 and ${submission.max_score}`);
      return;
    }
    setScoreError("");
    onSave(n, feedback);
  };

  return (
    <Stack spacing={2}>
      <TextField
        label={`Teacher Score (0 – ${submission.max_score})`}
        size="small"
        type="number"
        value={score}
        onChange={(e) => {
          setScore(e.target.value);
          setScoreError("");
        }}
        error={Boolean(scoreError)}
        helperText={scoreError || "Leave blank to use AI score, or enter a value to override"}
        slotProps={{ htmlInput: { min: 0, max: submission.max_score, step: 0.5 } }}
        sx={{ maxWidth: 280 }}
      />
      <TextField
        label="Feedback for student (optional)"
        size="small"
        multiline
        rows={3}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <Box>
        <Button
          variant="contained"
          color="primary"
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : <GradeOutlinedIcon />}
          onClick={handleSave}
          sx={{ minWidth: 140 }}
        >
          {score.trim() ? "Save Grade" : "Clear Override"}
        </Button>
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SubmissionDetailPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const parsedId = submissionId ? parseInt(submissionId, 10) : undefined;
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { data, isLoading, isError, error, refetch } = useTeacherSubmission(parsedId);
  const submission = data?.submission;

  // Override-score mutation scoped to this submission's task
  const overrideMutation = useOverrideScore(submission?.task_id ?? 0);

  const handleSaveGrade = (teacherScore: number | null, teacherFeedback: string) => {
    if (!submission) return;
    overrideMutation.mutate(
      {
        submissionId: submission.id,
        teacherScore,
        teacherFeedback: teacherFeedback || undefined,
      },
      {
        onSuccess: () => {
          enqueueSnackbar("Grade saved. Student has been notified.", { variant: "success" });
          refetch();
        },
        onError: (err: unknown) => {
          enqueueSnackbar(
            err instanceof Error ? err.message : "Failed to save grade.",
            { variant: "error" }
          );
        },
      }
    );
  };

  const crumbs = [
    { label: "Dashboard", href: ROUTES.TEACHER.DASHBOARD },
    { label: "Classrooms", href: ROUTES.TEACHER.CLASSROOMS },
    ...(submission
      ? [
          {
            label: submission.task_title,
            href: ROUTES.TEACHER.TASK_SUBMISSIONS(submission.task_id),
          },
          { label: submission.student_name },
        ]
      : [{ label: "Submission" }]),
  ];

  const strengths = parseJsonArray(submission?.ai_strengths);
  const improvements = parseJsonArray(submission?.ai_improvements);

  return (
    <DashboardLayout
      title={
        submission
          ? `${submission.student_name} — ${submission.task_title}`
          : "Submission Detail"
      }
      description={
        submission
          ? `Attempt #${submission.attempt_number} · Submitted ${formatDateTime(submission.submitted_at)}`
          : ""
      }
      breadcrumbs={crumbs}
      actions={
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() =>
            submission
              ? navigate(ROUTES.TEACHER.TASK_SUBMISSIONS(submission.task_id))
              : navigate(-1)
          }
          size="small"
        >
          Back to submissions
        </Button>
      }
    >
      <ErrorBoundary section="submission detail">
        {isError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {(error as Error)?.message ?? "Failed to load submission."}
          </Alert>
        )}

        {isLoading ? (
          <NotebookCard>
            <LoadingSkeleton variant="list" rows={8} />
          </NotebookCard>
        ) : submission ? (
          <Grid container spacing={3}>
            {/* ── Left column: submission content + AI ─────────────────── */}
            <Grid size={{ xs: 12, lg: 8 }}>
              <Stack spacing={3}>
                {/* Student & assignment meta */}
                <NotebookCard>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                        <PersonOutlinedIcon fontSize="small" color="action" />
                        <Typography variant="caption" color="text.secondary">
                          Student
                        </Typography>
                      </Stack>
                      <Typography variant="body1" fontWeight={600}>
                        {submission.student_name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                        @{submission.student_username}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                        <AssignmentOutlinedIcon fontSize="small" color="action" />
                        <Typography variant="caption" color="text.secondary">
                          Assignment
                        </Typography>
                      </Stack>
                      <Typography variant="body1" fontWeight={600}>
                        {submission.task_title}
                      </Typography>
                      {submission.task_description && (
                        <Typography variant="body2" color="text.secondary">
                          {submission.task_description}
                        </Typography>
                      )}
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary">
                        Status
                      </Typography>
                      <Box mt={0.5}>
                        <StatusChip status={submission.status} />
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary">
                        Attempt
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        #{submission.attempt_number}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" color="text.secondary">
                        Submitted
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(submission.submitted_at)}
                      </Typography>
                    </Grid>
                  </Grid>
                </NotebookCard>

                {/* Student submission content */}
                <NotebookCard title="Student Submission">
                  {submission.typed_text ? (
                    <Box
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.875rem",
                        whiteSpace: "pre-wrap",
                        bgcolor: "background.default",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        p: 2,
                        minHeight: 80,
                        maxHeight: 400,
                        overflow: "auto",
                        lineHeight: 1.7,
                      }}
                    >
                      {submission.typed_text}
                    </Box>
                  ) : submission.original_filename ? (
                    <Stack direction="row" spacing={1.5} alignItems="center" py={1}>
                      <InsertDriveFileOutlinedIcon color="action" />
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {submission.original_filename}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {submission.file_type?.toUpperCase()} file ·{" "}
                          {submission.extracted_text
                            ? "Text extracted for AI analysis"
                            : "Binary file"}
                        </Typography>
                      </Box>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No submission content found.
                    </Typography>
                  )}
                  {/* Show extracted text if submission was a file */}
                  {submission.extracted_text && !submission.typed_text && (
                    <Box mt={2}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Extracted text (used for AI analysis)
                      </Typography>
                      <Box
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                          whiteSpace: "pre-wrap",
                          bgcolor: "background.default",
                          border: "1px solid",
                          borderColor: "divider",
                          borderRadius: 1,
                          p: 1.5,
                          mt: 0.5,
                          maxHeight: 200,
                          overflow: "auto",
                          color: "text.secondary",
                        }}
                      >
                        {submission.extracted_text}
                      </Box>
                    </Box>
                  )}
                </NotebookCard>

                {/* AI evaluation */}
                {submission.status === "analyzed" && (
                  <NotebookCard
                    title="AI Evaluation"
                    accentColor="#7c3aed"
                  >
                    <Stack spacing={2}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <AutoAwesomeOutlinedIcon fontSize="small" color="secondary" />
                        <Typography variant="body2" fontWeight={600} color="secondary.main">
                          AI Score: {submission.ai_score} / {submission.max_score}
                        </Typography>
                      </Stack>
                      {submission.ai_summary && (
                        <Typography variant="body2">{submission.ai_summary}</Typography>
                      )}
                      {strengths.length > 0 && (
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="success.main">
                            Strengths
                          </Typography>
                          <List dense disablePadding sx={{ mt: 0.5 }}>
                            {strengths.map((s, i) => (
                              <ListItem
                                key={i}
                                sx={{ py: 0.25, px: 0, display: "flex", gap: 1 }}
                              >
                                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 12 }}>
                                  •
                                </Typography>
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
                              <ListItem
                                key={i}
                                sx={{ py: 0.25, px: 0, display: "flex", gap: 1 }}
                              >
                                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 12 }}>
                                  •
                                </Typography>
                                <Typography variant="body2">{s}</Typography>
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                    </Stack>
                  </NotebookCard>
                )}

                {submission.status === "analyzing" && (
                  <Alert severity="info" icon={<HourglassEmptyOutlinedIcon />}>
                    AI is currently analyzing this submission. Refresh to see results.
                  </Alert>
                )}

                {submission.status === "failed" && (
                  <Alert severity="warning">
                    AI analysis failed for this submission. You can still grade it manually.
                  </Alert>
                )}
              </Stack>
            </Grid>

            {/* ── Right column: scores + grading ───────────────────────── */}
            <Grid size={{ xs: 12, lg: 4 }}>
              <Stack spacing={3}>
                {/* Effective score summary */}
                <NotebookCard title="Score Summary">
                  <Stack spacing={1.5}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Effective Score
                      </Typography>
                      <Typography
                        variant="h4"
                        fontWeight={700}
                        color={
                          submission.effective_score !== null
                            ? "primary.main"
                            : "text.secondary"
                        }
                      >
                        {submission.effective_score !== null
                          ? `${submission.effective_score} / ${submission.max_score}`
                          : "—"}
                      </Typography>
                      {submission.teacher_score !== null && (
                        <Chip
                          label="Teacher override active"
                          size="small"
                          color="secondary"
                          sx={{ mt: 0.5 }}
                        />
                      )}
                    </Box>
                    <Divider />
                    <Stack spacing={0.75}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">
                          AI Score
                        </Typography>
                        <Typography variant="caption" fontWeight={600}>
                          {submission.ai_score !== null ? submission.ai_score : "—"}
                        </Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">
                          Teacher Score
                        </Typography>
                        <Typography
                          variant="caption"
                          fontWeight={600}
                          color={submission.teacher_score !== null ? "secondary.main" : "text.secondary"}
                        >
                          {submission.teacher_score !== null ? submission.teacher_score : "—"}
                        </Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="caption" color="text.secondary">
                          Max Score
                        </Typography>
                        <Typography variant="caption" fontWeight={600}>
                          {submission.max_score}
                        </Typography>
                      </Stack>
                    </Stack>
                    {submission.teacher_feedback && (
                      <>
                        <Divider />
                        <Box>
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            Teacher Feedback
                          </Typography>
                          <Typography variant="body2" mt={0.5}>
                            {submission.teacher_feedback}
                          </Typography>
                        </Box>
                      </>
                    )}
                  </Stack>
                </NotebookCard>

                {/* Grading form */}
                <NotebookCard title="Teacher Grading">
                  <GradingForm
                    submission={submission}
                    onSave={handleSaveGrade}
                    saving={overrideMutation.isPending}
                  />
                </NotebookCard>
              </Stack>
            </Grid>
          </Grid>
        ) : !isLoading && !isError ? (
          <Alert severity="warning">Submission not found or not accessible.</Alert>
        ) : null}
      </ErrorBoundary>
    </DashboardLayout>
  );
}
