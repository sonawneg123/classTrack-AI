// src/pages/teacher/QuestionBankPage.tsx
//
// Teacher Question Bank — Sprint 3
// Shows pending-approval queue + topic browser for approve/reject/publish.

import { useState } from "react";
import {
  Box, Button, Chip, CircularProgress, Collapse,
  Divider, IconButton,
  Paper, Stack, TextField, Tooltip, Typography, Dialog,
  DialogTitle, DialogContent, DialogActions, Alert,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage, NotebookCard } from "@components/notebook";
import {
  usePendingApproval,
  useApproveQuestion,
  useRejectQuestion,
  usePublishQuestion,
  useArchiveQuestion,
} from "@features/questions/hooks/useQuestions";
import type { Question } from "@/types/question";

// ── Status chip ────────────────────────────────────────────────────────────────
function QStatusChip({ status }: { status: string }) {
  const map: Record<string, "default" | "info" | "success" | "error" | "warning" | "primary"> = {
    pending_approval: "warning",
    approved: "info",
    published: "success",
    rejected: "error",
    archived: "default",
    generated: "default",
    validated: "primary",
  };
  const label = status.replace("_", " ");
  return (
    <Chip
      label={label}
      color={map[status] ?? "default"}
      size="small"
      sx={{ textTransform: "capitalize", fontSize: 11 }}
    />
  );
}

// ── Difficulty chip ────────────────────────────────────────────────────────────
function DiffChip({ difficulty }: { difficulty: string }) {
  const map: Record<string, "success" | "warning" | "error"> = {
    easy: "success",
    medium: "warning",
    hard: "error",
  };
  return (
    <Chip
      label={difficulty}
      color={map[difficulty] ?? "default"}
      size="small"
      variant="outlined"
      sx={{ textTransform: "capitalize", fontSize: 11 }}
    />
  );
}

// ── Question preview card ──────────────────────────────────────────────────────
function QuestionPreview({ q }: { q: Question }) {
  const [expanded, setExpanded] = useState(false);

  const renderOptions = () => {
    if (!q.options) return null;
    if (q.question_type === "matching") {
      const pairs = q.options as { left: string; right: string }[];
      return (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Pairs:
          </Typography>
          {pairs.map((p, i) => (
            <Typography key={i} variant="body2" sx={{ ml: 1 }}>
              {p.left} → {p.right}
            </Typography>
          ))}
        </Box>
      );
    }
    const opts = q.options as string[];
    return (
      <Box sx={{ mt: 1 }}>
        {opts.map((o, i) => (
          <Typography
            key={i}
            variant="body2"
            sx={{
              ml: 1,
              color: o === q.correct_answer ? "success.main" : "text.primary",
              fontWeight: o === q.correct_answer ? 700 : 400,
            }}
          >
            {String.fromCharCode(65 + i)}. {o}
            {o === q.correct_answer && " ✓"}
          </Typography>
        ))}
      </Box>
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
            <Chip label={q.question_type.replace("_", " ")} size="small" variant="outlined" sx={{ fontSize: 11 }} />
            <DiffChip difficulty={q.difficulty} />
            <QStatusChip status={q.status} />
            {q.topic_name && (
              <Chip label={q.topic_name} size="small" sx={{ fontSize: 11 }} />
            )}
          </Stack>

          <Typography variant="body1" fontWeight={500} sx={{ mb: 0.5 }}>
            {q.question_text}
          </Typography>

          {renderOptions()}

          <Collapse in={expanded}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="body2" color="text.secondary">
              <strong>Answer:</strong> {q.correct_answer}
            </Typography>
            {q.explanation && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                <strong>Explanation:</strong> {q.explanation}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
              Model: {q.generation_model} · Marks: {q.marks}
            </Typography>
          </Collapse>
        </Box>

        <IconButton size="small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Stack>
    </Paper>
  );
}

// ── Pending item row ────────────────────────────────────────────────────────────
function PendingQuestionRow({ q }: { q: Question }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const approveMutation = useApproveQuestion();
  const rejectMutation  = useRejectQuestion();
  const publishMutation = usePublishQuestion();
  const archiveMutation = useArchiveQuestion();

  const busy =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    publishMutation.isPending ||
    archiveMutation.isPending;

  const handleReject = () => {
    rejectMutation.mutate(
      { id: q.id, reason: rejectReason || undefined },
      { onSuccess: () => { setRejectOpen(false); setRejectReason(""); } }
    );
  };

  return (
    <Box sx={{ mb: 2 }}>
      <QuestionPreview q={q} />

      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
        <Tooltip title="Approve">
          <span>
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<CheckCircleOutlineIcon />}
              onClick={() => approveMutation.mutate(q.id)}
              disabled={busy}
            >
              Approve
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Reject">
          <span>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<CancelOutlinedIcon />}
              onClick={() => setRejectOpen(true)}
              disabled={busy}
            >
              Reject
            </Button>
          </span>
        </Tooltip>

        {q.status === "approved" && (
          <Tooltip title="Publish to students">
            <span>
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={<PublishOutlinedIcon />}
                onClick={() => publishMutation.mutate(q.id)}
                disabled={busy}
              >
                Publish
              </Button>
            </span>
          </Tooltip>
        )}

        <Tooltip title="Archive">
          <span>
            <IconButton
              size="small"
              onClick={() => archiveMutation.mutate({ id: q.id })}
              disabled={busy}
            >
              <ArchiveOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reject Question</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Optionally provide a reason for rejection.
          </Typography>
          <TextField
            fullWidth
            size="small"
            multiline
            rows={2}
            label="Reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button
            onClick={handleReject}
            color="error"
            variant="contained"
            disabled={rejectMutation.isPending}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── Approved question row (with publish button) ────────────────────────────────
function ApprovedQuestionRow({ q }: { q: Question }) {
  const publishMutation = usePublishQuestion();
  const archiveMutation = useArchiveQuestion();
  const busy = publishMutation.isPending || archiveMutation.isPending;

  return (
    <Box sx={{ mb: 2 }}>
      <QuestionPreview q={q} />
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={<PublishOutlinedIcon />}
          onClick={() => publishMutation.mutate(q.id)}
          disabled={busy}
        >
          Publish
        </Button>
        <IconButton size="small" onClick={() => archiveMutation.mutate({ id: q.id })} disabled={busy}>
          <ArchiveOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function QuestionBankPage() {
  const [tab, setTab] = useState<"pending" | "approved">("pending");
  const pendingQuery = usePendingApproval();

  const questions = pendingQuery.data?.questions ?? [];
  const pending   = questions.filter((q) => q.status === "pending_approval");
  const approved  = questions.filter((q) => q.status === "approved");

  return (
    <DashboardLayout
      title="Question Bank"
      description="Review AI-generated questions and approve them for student access."
      breadcrumbs={[
        { label: "Dashboard", href: "/teacher/dashboard" },
        { label: "Question Bank" },
      ]}
    >
      <NotebookPage>

        {/* Tab selector */}
        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          <Button
            variant={tab === "pending" ? "contained" : "outlined"}
            startIcon={<HourglassEmptyOutlinedIcon />}
            onClick={() => setTab("pending")}
            size="small"
          >
            Pending Approval
            {pending.length > 0 && (
              <Chip
                label={pending.length}
                size="small"
                color="warning"
                sx={{ ml: 1, height: 18, fontSize: 11 }}
              />
            )}
          </Button>
          <Button
            variant={tab === "approved" ? "contained" : "outlined"}
            startIcon={<QuizOutlinedIcon />}
            onClick={() => setTab("approved")}
            size="small"
          >
            Approved
            {approved.length > 0 && (
              <Chip
                label={approved.length}
                size="small"
                color="success"
                sx={{ ml: 1, height: 18, fontSize: 11 }}
              />
            )}
          </Button>
        </Stack>

        {pendingQuery.isLoading && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={32} />
          </Stack>
        )}

        {pendingQuery.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load questions. Please refresh.
          </Alert>
        )}

        {/* Pending tab */}
        {tab === "pending" && !pendingQuery.isLoading && (
          <>
            {pending.length === 0 ? (
              <NotebookCard>
                <Stack alignItems="center" py={4} spacing={1}>
                  <CheckCircleOutlineIcon color="success" sx={{ fontSize: 40 }} />
                  <Typography variant="body2" color="text.secondary">
                    No questions pending approval.
                  </Typography>
                </Stack>
              </NotebookCard>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {pending.length} question(s) awaiting your review.
                </Typography>
                {pending.map((q) => (
                  <PendingQuestionRow key={q.id} q={q} />
                ))}
              </Box>
            )}
          </>
        )}

        {/* Approved tab */}
        {tab === "approved" && !pendingQuery.isLoading && (
          <>
            {approved.length === 0 ? (
              <NotebookCard>
                <Stack alignItems="center" py={4} spacing={1}>
                  <QuizOutlinedIcon sx={{ fontSize: 40, color: "text.disabled" }} />
                  <Typography variant="body2" color="text.secondary">
                    No approved questions waiting to be published.
                  </Typography>
                </Stack>
              </NotebookCard>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {approved.length} approved question(s) ready to publish.
                </Typography>
                {approved.map((q) => (
                  <ApprovedQuestionRow key={q.id} q={q} />
                ))}
              </Box>
            )}
          </>
        )}
      </NotebookPage>
    </DashboardLayout>
  );
}
