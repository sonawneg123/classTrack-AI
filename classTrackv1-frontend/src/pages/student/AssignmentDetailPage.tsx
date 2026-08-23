/**
 * src/pages/student/AssignmentDetailPage.tsx
 *
 * Student Assignment Detail page — the centerpiece of the Student workflow.
 * Single page that handles:
 *   - Display assignment details
 *   - Submit typed answer or file
 *   - Show AI evaluation state (analyzing, analyzed, failed)
 *   - Display AI score + feedback (from GET /student/submissions)
 *   - Display teacher override when present
 *   - Show submission history (GET /student/submissions/:id/history)
 *   - Allow resubmission
 *
 * Data sources:
 *   GET /student/tasks              → task metadata + submission summary
 *   GET /student/submissions        → full submission including AI feedback text
 *   GET /student/submissions/:id/history → previous attempt versions
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import { useSnackbar } from "notistack";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookCard } from "@components/notebook";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { useMyAssignments } from "@features/student/hooks/useMyAssignments";
import { useMySubmissions } from "@features/student/hooks/useMySubmissions";
import { useSubmissionHistory } from "@features/student/hooks/useSubmissionHistory";
import { useSubmitTask } from "@features/student/hooks/useSubmitTask";
import { ROUTES } from "@utils/constants";
import { getErrorMessage } from "@utils/apiError";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null): string {
  if (!d) return "No due date";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Submission status UI sub-component
// ---------------------------------------------------------------------------
type SubmStatus = "submitted" | "analyzing" | "analyzed" | "failed";

function SubmissionStatusPanel({
  hasSubmission,
  status,
  effectiveScore,
  maxScore,
  teacherOverride,
  aiEnabled,
}: {
  hasSubmission: boolean;
  status: SubmStatus | null;
  effectiveScore: number | null;
  maxScore: string;
  teacherOverride: boolean;
  aiEnabled: boolean;
}) {
  if (!hasSubmission) {
    return (
      <Stack spacing={1.5} alignItems="center" textAlign="center" py={3}>
        <UploadFileOutlinedIcon fontSize="large" color="action" />
        <Typography variant="body2" fontWeight={600}>Not submitted yet</Typography>
        <Typography variant="caption" color="text.secondary">
          Submit your work using the tab below.
        </Typography>
      </Stack>
    );
  }

  // AI disabled — submission is in "submitted" status permanently until teacher grades
  if (status === "submitted" && !aiEnabled) {
    return (
      <Stack spacing={1.5} alignItems="center" textAlign="center" py={3}>
        <CheckCircleOutlineIcon fontSize="large" color="success" />
        <Typography variant="body2" fontWeight={600}>Submitted</Typography>
        <Typography variant="caption" color="text.secondary">
          Awaiting teacher review.
        </Typography>
      </Stack>
    );
  }

  if (status === "submitted") {
    return (
      <Stack spacing={1.5} alignItems="center" textAlign="center" py={3}>
        <CheckCircleOutlineIcon fontSize="large" color="info" />
        <Typography variant="body2" fontWeight={600}>Submitted</Typography>
        <Typography variant="caption" color="text.secondary">
          Waiting for AI evaluation to start…
        </Typography>
      </Stack>
    );
  }

  if (status === "analyzing") {
    return (
      <Stack spacing={1.5} alignItems="center" textAlign="center" py={3}>
        <CircularProgress size={48} />
        <Typography variant="body2" fontWeight={600}>AI Analyzing…</Typography>
        <Typography variant="caption" color="text.secondary">
          Your submission is being evaluated. This usually takes under a minute.
        </Typography>
      </Stack>
    );
  }

  if (status === "analyzed") {
    return (
      <Stack spacing={1.5} alignItems="center" textAlign="center" py={3}>
        <CheckCircleOutlineIcon fontSize="large" color="success" />
        <Typography variant="body2" fontWeight={600}>
          {teacherOverride ? "Graded (Teacher)" : "Graded (AI)"}
        </Typography>
        <Typography variant="h4" fontWeight={700} color="primary.main">
          {effectiveScore !== null ? `${effectiveScore} / ${maxScore}` : "—"}
        </Typography>
        {teacherOverride && (
          <Chip label="Teacher override applied" size="small" color="secondary" />
        )}
      </Stack>
    );
  }

  if (status === "failed") {
    return (
      <Stack spacing={1.5} alignItems="center" textAlign="center" py={3}>
        <ErrorOutlineIcon fontSize="large" color="error" />
        <Typography variant="body2" fontWeight={600}>Analysis Failed</Typography>
        <Typography variant="caption" color="text.secondary">
          Something went wrong. Try resubmitting your work or ask your teacher.
        </Typography>
      </Stack>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Polling constants
// ---------------------------------------------------------------------------

/** Statuses that mean the AI evaluation is still running. */
const ACTIVE_EVAL_STATUSES = new Set(["submitted", "analyzing"] as const);

/** How often (ms) to poll while evaluation is in progress. */
const POLL_INTERVAL_MS = 3_000;

export default function StudentAssignmentDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const parsedId = taskId ? parseInt(taskId, 10) : undefined;
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  // ── Data fetching with conditional polling ─────────────────────────────────
  //
  // TanStack Query v5 `refetchInterval` can be a function that receives the
  // internal Query object (via `query.state.data`) and returns the interval in
  // ms, or false to stop polling.
  //
  // The functions below inspect the current cached data for this specific task
  // and return POLL_INTERVAL_MS while the AI is still evaluating, or false
  // once it reaches a terminal state ("analyzed" | "failed").
  //
  // React Query manages the timer lifecycle: polling starts automatically
  // when the function first returns a positive number, and stops when it
  // returns false. On component unmount the timer is cleared by React Query
  // with no manual cleanup needed.

  const queryClient = useQueryClient();

  const {
    data: allTasks,
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = useMyAssignments((query) => {
    const data = query.state.data;
    if (!data || parsedId === undefined) return false;
    const t = data.find((x) => x.id === parsedId);
    if (!t || t.submission_id == null || t.ai_evaluation_enabled !== 1) return false;
    return ACTIVE_EVAL_STATUSES.has(
      t.submission_status as "submitted" | "analyzing"
    )
      ? POLL_INTERVAL_MS
      : false;
  });

  const {
    data: allSubmissions,
    isLoading: subsLoading,
    refetch: refetchSubs,
  } = useMySubmissions((query) => {
    const data = query.state.data;
    if (!data || parsedId === undefined) return false;
    const s = data.find((x) => x.task_id === parsedId);
    if (!s) return false;
    // Only poll when the task has AI evaluation enabled
    const tasks = queryClient.getQueryData<import("@/types/studentAssignment").StudentAssignment[]>(
      ["student", "assignments"]
    );
    const t = tasks?.find((x) => x.id === parsedId);
    if (!t || t.ai_evaluation_enabled !== 1) return false;
    return ACTIVE_EVAL_STATUSES.has(s.status as "submitted" | "analyzing")
      ? POLL_INTERVAL_MS
      : false;
  });

  const task = allTasks?.find((t) => t.id === parsedId);

  // Find the matching submission (task_id matches) to get AI feedback text
  const submission = allSubmissions?.find((s) => s.task_id === parsedId);

  const { data: history, isLoading: historyLoading } = useSubmissionHistory(
    task?.submission_id ?? null
  );

  const submitMutation = useSubmitTask();

  const [typedText, setTypedText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const crumbs = [
    { label: "Dashboard", href: ROUTES.STUDENT.DASHBOARD },
    { label: "Assignments", href: ROUTES.STUDENT.ASSIGNMENTS },
    { label: task?.title ?? "Assignment" },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // Loading / not found
  // ─────────────────────────────────────────────────────────────────────────
  if (tasksLoading || subsLoading) {
    return (
      <DashboardLayout title="Loading…" breadcrumbs={crumbs}>
        <LoadingSkeleton variant="card" />
      </DashboardLayout>
    );
  }

  if (!task || !parsedId || isNaN(parsedId)) {
    return (
      <DashboardLayout title="Assignment not found" breadcrumbs={crumbs}>
        <Alert severity="error" sx={{ mb: 3 }}>
          This assignment does not exist or you do not have access to it.
        </Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(ROUTES.STUDENT.ASSIGNMENTS)}
        >
          Back to Assignments
        </Button>
      </DashboardLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived state
  // ─────────────────────────────────────────────────────────────────────────
  const hasSubmission = task.submission_id !== null;
  const submissionStatus = task.submission_status;
  const effectiveScore = task.effective_score;
  const teacherScore = task.teacher_score ? parseFloat(task.teacher_score) : null;
  const aiScore = task.ai_score ? parseFloat(task.ai_score) : null;
  const teacherOverride = teacherScore !== null;
  /** Whether AI evaluation is enabled for this task (authoritative from backend). */
  const aiEnabled = task.ai_evaluation_enabled === 1;

  const isOverdue = task.assignment_status === "overdue";
  const allowLate = task.late_submission_allowed === 1;
  // Can submit if: not yet submitted, OR already submitted (resubmit allowed),
  // UNLESS overdue AND late not allowed.
  const blockedByLate = isOverdue && !allowLate;
  const canSubmit = !blockedByLate;

  // AI feedback text comes from the full submissions endpoint
  const aiStrengths = parseJsonArray(submission?.ai_strengths);
  const aiImprovements = parseJsonArray(submission?.ai_improvements);
  const aiSummary = submission?.ai_summary ?? null;
  const teacherFeedback = submission?.teacher_feedback ?? null;

  // ─────────────────────────────────────────────────────────────────────────
  // Submit handler
  // ─────────────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!typedText.trim() && !selectedFile) {
      enqueueSnackbar("Please type your answer or upload a file.", { variant: "warning" });
      return;
    }

    submitMutation.mutate(
      { taskId: task!.id, payload: { typedText, file: selectedFile ?? undefined } },
      {
        onSuccess: (result) => {
          const msg = result.aiQueued
            ? "Submission received! AI is reviewing it now."
            : "Submission received! Your teacher will review it.";
          enqueueSnackbar(msg, { variant: "success" });
          setTypedText("");
          setSelectedFile(null);
          refetchTasks();
          refetchSubs();
        },
        onError: (err) => {
          enqueueSnackbar(getErrorMessage(err), { variant: "error" });
        },
      }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout
      title={task.title}
      description={task.description ?? undefined}
      breadcrumbs={crumbs}
    >
      {/* ── Status banners ───────────────────────────────────────────── */}
      {blockedByLate && !hasSubmission && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <strong>Overdue.</strong> Late submissions are not allowed for this assignment.
        </Alert>
      )}
      {isOverdue && allowLate && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <strong>Past due date.</strong> Late submissions are still accepted for this
          assignment.
        </Alert>
      )}

      {/* ── Assignment info ──────────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <NotebookCard title="Assignment Details">
            {task.instructions && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Instructions
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ whiteSpace: "pre-wrap" }}
                >
                  {task.instructions}
                </Typography>
              </Box>
            )}
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body2" fontWeight={600}>
                  Maximum Score
                </Typography>
                <Typography variant="body2">{task.max_score}</Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body2" fontWeight={600}>
                  Due Date
                </Typography>
                <Typography variant="body2">{formatDate(task.due_date)}</Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body2" fontWeight={600}>
                  Late Submission
                </Typography>
                <Typography
                  variant="body2"
                  color={allowLate ? "success.main" : "error.main"}
                >
                  {allowLate ? "Allowed" : "Not allowed"}
                </Typography>
              </Box>
              {task.allowed_file_types && task.allowed_file_types.length > 0 && (
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" fontWeight={600}>
                    Allowed File Types
                  </Typography>
                  <Typography variant="body2">
                    {task.allowed_file_types.join(", ")}
                  </Typography>
                </Box>
              )}
              {task.max_file_size_mb && (
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" fontWeight={600}>
                    Max File Size
                  </Typography>
                  <Typography variant="body2">{task.max_file_size_mb} MB</Typography>
                </Box>
              )}
              {task.attempt_number !== null && (
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" fontWeight={600}>
                    Current Attempt
                  </Typography>
                  <Typography variant="body2">#{task.attempt_number}</Typography>
                </Box>
              )}
            </Stack>
          </NotebookCard>
        </Grid>

        {/* ─── Status card ──────────────────────────────────────────── */}
        <Grid size={{ xs: 12, md: 4 }}>
          <NotebookCard title="Submission Status">
            <SubmissionStatusPanel
              hasSubmission={hasSubmission}
              status={submissionStatus}
              effectiveScore={effectiveScore}
              maxScore={task.max_score}
              teacherOverride={teacherOverride}
              aiEnabled={aiEnabled}
            />
          </NotebookCard>
        </Grid>
      </Grid>

      {/* ── Tabs: Submit / Results / History ────────────────────────── */}
      <NotebookCard disablePadding>
        <Box sx={{ borderBottom: "2px solid", borderColor: "divider", px: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            aria-label="Assignment tabs"
          >
            <Tab
              label={hasSubmission ? "Resubmit" : "Submit"}
              id="tab-submit"
              disabled={!canSubmit}
            />
            <Tab
              label="Results"
              id="tab-results"
              disabled={
                !hasSubmission ||
                (submissionStatus === "submitted" && !teacherOverride && aiEnabled)
              }
            />
            <Tab
              label={`History (${history?.length ?? 0})`}
              id="tab-history"
              disabled={!hasSubmission || !history || history.length === 0}
            />
          </Tabs>
        </Box>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* Tab 0: Submit / Resubmit                                     */}
        {/* ─────────────────────────────────────────────────────────── */}
        <Box role="tabpanel" id="tabpanel-submit" hidden={activeTab !== 0}>
          {canSubmit ? (
            <CardContent>
              {hasSubmission && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <strong>Resubmission:</strong> A new attempt will be saved. Your
                  previous attempt will remain in the History tab.
                </Alert>
              )}

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Type your answer
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={7}
                placeholder="Enter your response here…"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                disabled={submitMutation.isPending}
                sx={{ mb: 3 }}
              />

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Or upload a file
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Accepted: JPG, PNG, WEBP (photos), PDF, TXT
                {task.max_file_size_mb ? ` · Max ${task.max_file_size_mb} MB` : ""}
              </Typography>

              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadFileOutlinedIcon />}
                disabled={submitMutation.isPending}
                sx={{ mb: 1 }}
              >
                Choose File
                <input
                  type="file"
                  hidden
                  accept={
                    task.allowed_file_types && task.allowed_file_types.length > 0
                      ? task.allowed_file_types.map((t) => `.${t}`).join(",")
                      : ".jpg,.jpeg,.png,.webp,.pdf,.txt"
                  }
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </Button>
              {selectedFile && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                  Selected: {selectedFile.name}
                </Typography>
              )}

              <Box sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={
                    submitMutation.isPending ? (
                      <CircularProgress size={16} />
                    ) : (
                      <SendOutlinedIcon />
                    )
                  }
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  fullWidth
                >
                  {submitMutation.isPending
                    ? "Submitting…"
                    : hasSubmission
                    ? "Resubmit Assignment"
                    : "Submit Assignment"}
                </Button>
              </Box>
            </CardContent>
          ) : (
            <CardContent>
              <Alert severity="error">
                This assignment is past due and late submissions are not allowed.
              </Alert>
            </CardContent>
          )}
        </Box>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* Tab 1: Results                                               */}
        {/* ─────────────────────────────────────────────────────────── */}
        <Box role="tabpanel" id="tabpanel-results" hidden={activeTab !== 1}>
          {/* AI-disabled: awaiting teacher review */}
          {hasSubmission && !aiEnabled && submissionStatus === "submitted" && (
            <CardContent>
              {teacherOverride ? null : (
                <Alert severity="info">
                  This assignment does not use AI evaluation. Your submission is awaiting
                  teacher review.
                </Alert>
              )}
            </CardContent>
          )}

          {hasSubmission && aiEnabled && submissionStatus === "analyzing" && (
            <CardContent>
              <Alert severity="info" icon={<CircularProgress size={18} />}>
                AI is evaluating your submission. Check back in a moment.
              </Alert>
            </CardContent>
          )}

          {hasSubmission && aiEnabled && submissionStatus === "failed" && (
            <CardContent>
              <Alert severity="error">
                AI evaluation failed for this submission. Your teacher can retry it, or
                you can resubmit your work.
              </Alert>
            </CardContent>
          )}

          {/* Teacher graded (AI-disabled path: status stays "submitted" but teacher_score is set) */}
          {hasSubmission && !aiEnabled && teacherOverride && (
            <CardContent>
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    Teacher Score
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="primary.main">
                    {effectiveScore !== null
                      ? `${effectiveScore} / ${task.max_score}`
                      : "—"}
                  </Typography>
                  <Chip label="Teacher graded" size="small" color="secondary" sx={{ mt: 0.5 }} />
                </Box>
                {teacherFeedback && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Teacher Feedback
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {teacherFeedback}
                      </Typography>
                    </Box>
                  </>
                )}
              </Stack>
            </CardContent>
          )}

          {hasSubmission && submissionStatus === "analyzed" && (
            <CardContent>
              <Stack spacing={2.5}>
                {/* Score summary */}
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    {teacherOverride ? "Final Score (Teacher override)" : "AI Score"}
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="primary.main">
                    {effectiveScore !== null
                      ? `${effectiveScore} / ${task.max_score}`
                      : "—"}
                  </Typography>
                  {teacherOverride && aiScore !== null && (
                    <Typography variant="caption" color="text.secondary">
                      AI originally scored {aiScore} / {task.max_score}
                    </Typography>
                  )}
                </Box>

                <Divider />

                {/* AI summary */}
                {aiSummary && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                      Feedback Summary
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {aiSummary}
                    </Typography>
                  </Box>
                )}

                {/* Strengths */}
                {aiStrengths.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                      Strengths
                    </Typography>
                    <List dense disablePadding>
                      {aiStrengths.map((s, i) => (
                        <ListItem key={i} disablePadding sx={{ pl: 1 }}>
                          <ListItemText
                            primary={`• ${s}`}
                            primaryTypographyProps={{
                              variant: "body2",
                              color: "success.main",
                            }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}

                {/* Areas for improvement */}
                {aiImprovements.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                      Areas for Improvement
                    </Typography>
                    <List dense disablePadding>
                      {aiImprovements.map((s, i) => (
                        <ListItem key={i} disablePadding sx={{ pl: 1 }}>
                          <ListItemText
                            primary={`• ${s}`}
                            primaryTypographyProps={{
                              variant: "body2",
                              color: "warning.main",
                            }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}

                {/* Teacher feedback */}
                {teacherFeedback && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Teacher Feedback
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {teacherFeedback}
                      </Typography>
                    </Box>
                  </>
                )}
              </Stack>
            </CardContent>
          )}
        </Box>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* Tab 2: History                                               */}
        {/* ─────────────────────────────────────────────────────────── */}
        <Box role="tabpanel" id="tabpanel-history" hidden={activeTab !== 2}>
          {historyLoading && <LoadingSkeleton variant="list" rows={3} />}
          {!historyLoading && history && history.length > 0 && (
            <List disablePadding>
              {history.map((v) => {
                const vAiScore = v.ai_score ? parseFloat(v.ai_score) : null;
                const vTeacherScore = v.teacher_score ? parseFloat(v.teacher_score) : null;
                const vEffectiveScore = vTeacherScore ?? vAiScore;
                const vStrengths = parseJsonArray(v.ai_strengths);
                const vImprovements = parseJsonArray(v.ai_improvements);

                return (
                  <ListItem
                    key={v.id}
                    divider
                    sx={{
                      py: 2,
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 0.5,
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      width="100%"
                    >
                      <Typography variant="subtitle2" fontWeight={700}>
                        Attempt #{v.attempt_number}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(v.created_at).toLocaleString()}
                      </Typography>
                    </Stack>

                    {vEffectiveScore !== null && (
                      <Typography variant="body2">
                        <strong>Score:</strong> {vEffectiveScore} / {task.max_score}
                        {vTeacherScore !== null && (
                          <Chip
                            label="Teacher"
                            size="small"
                            color="secondary"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </Typography>
                    )}

                    {v.ai_summary && (
                      <Typography variant="body2" color="text.secondary">
                        {v.ai_summary}
                      </Typography>
                    )}

                    {vStrengths.length > 0 && (
                      <Typography variant="caption" color="success.main">
                        <strong>Strengths:</strong> {vStrengths.join("; ")}
                      </Typography>
                    )}

                    {vImprovements.length > 0 && (
                      <Typography variant="caption" color="warning.main">
                        <strong>Improvements:</strong> {vImprovements.join("; ")}
                      </Typography>
                    )}

                    {v.teacher_feedback && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>Teacher:</strong> {v.teacher_feedback}
                      </Typography>
                    )}

                    {v.original_filename && (
                      <Typography variant="caption" color="text.secondary">
                        File: {v.original_filename}
                      </Typography>
                    )}
                  </ListItem>
                );
              })}
            </List>
          )}
          {!historyLoading && (!history || history.length === 0) && (
            <CardContent>
              <Alert severity="info">
                No previous attempts. Previous attempts appear here after resubmission.
              </Alert>
            </CardContent>
          )}
        </Box>
      </NotebookCard>
    </DashboardLayout>
  );
}
