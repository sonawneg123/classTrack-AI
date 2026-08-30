// src/pages/teacher/QuestionBankPage.tsx
//
// Teacher Question Bank — Sprint 3 + 7 (updated)
//
// Tabs:
//   "Review"    — pending_approval + approved questions  (approve / publish / reject)
//   "Published" — all published questions (view + archive)
//
// Workflow:
//   Generate → pending_approval
//     → [Approve]  → approved
//     → [Publish]  → published  (DIRECTLY from pending_approval too)
//   published → available in Quiz Builder

import { useState } from "react";
import {
  Alert,
  Box, Button, Chip, CircularProgress, Collapse,
  Divider, IconButton,
  Paper, Stack, TextField, Tooltip, Typography, Dialog,
  DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem,
  Badge,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage, NotebookCard } from "@components/notebook";
import {
  useReviewQueue,
  usePublishedQuestionsForTeacher,
  useApproveQuestion,
  useRejectQuestion,
  usePublishQuestion,
  useArchiveQuestion,
  useGenerateQuestions,
} from "@features/questions/hooks/useQuestions";
import type { Question, QuestionType, QuestionDifficulty } from "@/types/question";
import { CurriculumNavigator } from "@components/curriculum/CurriculumNavigator";
import type { TopicSelection } from "@components/curriculum/CurriculumNavigator";

// ── Constants ──────────────────────────────────────────────────────────────────
const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "mcq",          label: "Multiple Choice (MCQ)" },
  { value: "true_false",   label: "True / False" },
  { value: "fill_blank",   label: "Fill in the Blank" },
  { value: "one_word",     label: "One Word Answer" },
  { value: "short_answer", label: "Short Answer" },
  { value: "descriptive",  label: "Descriptive" },
];

const DIFFICULTIES: { value: QuestionDifficulty; label: string }[] = [
  { value: "easy",   label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard",   label: "Hard" },
];

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
  const label = status.replace(/_/g, " ");
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
            <Chip label={q.question_type.replace(/_/g, " ")} size="small" variant="outlined" sx={{ fontSize: 11 }} />
            <DiffChip difficulty={q.difficulty} />
            <QStatusChip status={q.status} />
            {q.topic_name && (
              <Chip label={q.topic_name} size="small" sx={{ fontSize: 11 }} />
            )}
            {q.chapter_name && (
              <Chip label={q.chapter_name} size="small" variant="outlined" sx={{ fontSize: 11 }} />
            )}
            {q.subject_name && (
              <Chip label={q.subject_name} size="small" variant="outlined" sx={{ fontSize: 11 }} />
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
              Marks: {q.marks} · Model: {q.generation_model}
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

// ── Review queue item row ────────────────────────────────────────────────────────
// Shows a question that is either pending_approval or approved.
// Teacher can: approve (if pending), reject, publish (directly), or archive.
function ReviewQuestionRow({ q }: { q: Question }) {
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

  const isPending = q.status === "pending_approval";

  return (
    <Box sx={{ mb: 2 }}>
      <QuestionPreview q={q} />

      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
        {/* Approve: only shown for pending_approval questions */}
        {isPending && (
          <Tooltip title="Approve this question (moves to Approved status)">
            <span>
              <Button
                size="small"
                variant="outlined"
                color="info"
                startIcon={<CheckCircleOutlineIcon />}
                onClick={() => approveMutation.mutate(q.id)}
                disabled={busy}
              >
                Approve
              </Button>
            </span>
          </Tooltip>
        )}

        {/* Publish: available for both pending_approval AND approved */}
        <Tooltip title="Publish this question — makes it available in the Quiz Builder">
          <span>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={
                publishMutation.isPending
                  ? <CircularProgress size={14} color="inherit" />
                  : <PublishOutlinedIcon />
              }
              onClick={() => publishMutation.mutate(q.id)}
              disabled={busy}
            >
              {publishMutation.isPending ? "Publishing…" : "Publish"}
            </Button>
          </span>
        </Tooltip>

        {/* Reject */}
        <Tooltip title="Reject this question">
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

        {/* Archive */}
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

// ── Published question row ──────────────────────────────────────────────────────
function PublishedQuestionRow({ q }: { q: Question }) {
  const archiveMutation = useArchiveQuestion();
  const busy = archiveMutation.isPending;

  return (
    <Box sx={{ mb: 2 }}>
      <QuestionPreview q={q} />
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Chip
          icon={<CheckCircleIcon sx={{ fontSize: "14px !important" }} />}
          label="Published — Available in Quiz Builder"
          color="success"
          size="small"
          variant="outlined"
        />
        <Tooltip title="Archive (removes from Quiz Builder)">
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
    </Box>
  );
}

// ── Generate Questions panel ───────────────────────────────────────────────────
function GenerateQuestionsPanel() {
  const [selectedTopic, setSelectedTopic] = useState<TopicSelection | null>(null);
  const [questionType,  setQuestionType]  = useState<QuestionType>("mcq");
  const [difficulty,    setDifficulty]    = useState<QuestionDifficulty>("medium");
  const [count,         setCount]         = useState(5);
  const [panelOpen,     setPanelOpen]     = useState(true);

  const generateMutation = useGenerateQuestions();

  const canGenerate = !!selectedTopic && !generateMutation.isPending;

  const handleGenerate = () => {
    if (!selectedTopic) return;
    generateMutation.mutate({
      topicId:      selectedTopic.topicId,
      questionType,
      difficulty,
      count,
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: panelOpen ? 2 : 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <AutoAwesomeIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>Generate Questions</Typography>
        </Stack>
        <IconButton size="small" onClick={() => setPanelOpen((v) => !v)}>
          {panelOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Stack>

      <Collapse in={panelOpen}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Generated questions will appear in the <strong>Review Queue</strong> below.
          Click <strong>Publish</strong> to make them available in the Quiz Builder.
        </Alert>

        {/* Cascading curriculum selector */}
        <CurriculumNavigator
          onTopicSelect={setSelectedTopic}
          disabled={generateMutation.isPending}
        />

        {/* Question type, difficulty, count */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Question Type</InputLabel>
            <Select
              value={questionType}
              label="Question Type"
              onChange={(e) => setQuestionType(e.target.value as QuestionType)}
              disabled={generateMutation.isPending}
            >
              {QUESTION_TYPES.map((qt) => (
                <MenuItem key={qt.value} value={qt.value}>{qt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Difficulty</InputLabel>
            <Select
              value={difficulty}
              label="Difficulty"
              onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
              disabled={generateMutation.isPending}
            >
              {DIFFICULTIES.map((d) => (
                <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Number of Questions"
            type="number"
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(15, Number(e.target.value))))}
            inputProps={{ min: 1, max: 15 }}
            disabled={generateMutation.isPending}
            sx={{ width: 180 }}
          />
        </Stack>

        {selectedTopic && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Topic: <strong>{selectedTopic.topicName}</strong> (ID: {selectedTopic.topicId})
          </Typography>
        )}

        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            startIcon={generateMutation.isPending
              ? <CircularProgress size={14} color="inherit" />
              : <AutoAwesomeIcon fontSize="small" />}
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {generateMutation.isPending ? "Generating…" : "Generate Questions"}
          </Button>
          {!selectedTopic && (
            <Typography variant="caption" color="text.disabled">
              Select a topic to enable generation.
            </Typography>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function QuestionBankPage() {
  const [tab, setTab] = useState<"review" | "published">("review");

  // Review queue: pending_approval + approved
  const reviewQuery     = useReviewQueue();
  // Published questions
  const publishedQuery  = usePublishedQuestionsForTeacher();

  const reviewQuestions   = reviewQuery.data?.questions ?? [];
  const publishedQuestions = publishedQuery.data?.questions ?? [];

  const pendingCount  = reviewQuestions.filter((q) => q.status === "pending_approval").length;
  const approvedCount = reviewQuestions.filter((q) => q.status === "approved").length;

  return (
    <DashboardLayout
      title="Question Bank"
      description="Generate, review, and publish AI questions. Published questions become available in the Quiz Builder."
      breadcrumbs={[
        { label: "Dashboard", href: "/teacher/dashboard" },
        { label: "Question Bank" },
      ]}
    >
      <NotebookPage>

        {/* Generate Questions panel */}
        <GenerateQuestionsPanel />

        {/* Workflow guide */}
        <Alert severity="info" sx={{ mb: 3 }}>
          <strong>Publishing Workflow:</strong>{" "}
          Generate Questions → Review Queue (Pending Approval / Approved) →{" "}
          <strong>Publish</strong> → Available in Quiz Builder
        </Alert>

        {/* Tab selector */}
        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          <Badge badgeContent={reviewQuestions.length} color="warning" max={99}>
            <Button
              variant={tab === "review" ? "contained" : "outlined"}
              startIcon={<HourglassEmptyOutlinedIcon />}
              onClick={() => setTab("review")}
              size="small"
            >
              Review Queue
            </Button>
          </Badge>
          <Badge badgeContent={publishedQuestions.length} color="success" max={99}>
            <Button
              variant={tab === "published" ? "contained" : "outlined"}
              startIcon={<CheckCircleIcon />}
              onClick={() => setTab("published")}
              size="small"
            >
              Published
            </Button>
          </Badge>
        </Stack>

        {/* ── Review tab ── */}
        {tab === "review" && (
          <>
            {reviewQuery.isLoading && (
              <Stack alignItems="center" py={4}>
                <CircularProgress size={32} />
              </Stack>
            )}
            {reviewQuery.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Failed to load questions. Please refresh.
              </Alert>
            )}
            {!reviewQuery.isLoading && reviewQuestions.length === 0 && (
              <NotebookCard>
                <Stack alignItems="center" py={4} spacing={1}>
                  <CheckCircleOutlineIcon color="success" sx={{ fontSize: 40 }} />
                  <Typography variant="body2" color="text.secondary">
                    No questions awaiting review.
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Generate questions above to get started.
                  </Typography>
                </Stack>
              </NotebookCard>
            )}
            {!reviewQuery.isLoading && reviewQuestions.length > 0 && (
              <Box>
                <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                  {pendingCount > 0 && (
                    <Chip
                      label={`${pendingCount} pending approval`}
                      color="warning"
                      size="small"
                      icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: "14px !important" }} />}
                    />
                  )}
                  {approvedCount > 0 && (
                    <Chip
                      label={`${approvedCount} approved (ready to publish)`}
                      color="info"
                      size="small"
                      icon={<CheckCircleOutlineIcon sx={{ fontSize: "14px !important" }} />}
                    />
                  )}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Click <strong>Publish</strong> to make a question available in the Quiz Builder.
                  You can also approve first and publish later.
                </Typography>
                {reviewQuestions.map((q) => (
                  <ReviewQuestionRow key={q.id} q={q} />
                ))}
              </Box>
            )}
          </>
        )}

        {/* ── Published tab ── */}
        {tab === "published" && (
          <>
            {publishedQuery.isLoading && (
              <Stack alignItems="center" py={4}>
                <CircularProgress size={32} />
              </Stack>
            )}
            {publishedQuery.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Failed to load published questions. Please refresh.
              </Alert>
            )}
            {!publishedQuery.isLoading && publishedQuestions.length === 0 && (
              <NotebookCard>
                <Stack alignItems="center" py={4} spacing={1}>
                  <PublishOutlinedIcon sx={{ fontSize: 40, color: "text.disabled" }} />
                  <Typography variant="body2" color="text.secondary">
                    No published questions yet.
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Go to the Review Queue and publish questions to make them available
                    in the Quiz Builder.
                  </Typography>
                </Stack>
              </NotebookCard>
            )}
            {!publishedQuery.isLoading && publishedQuestions.length > 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {publishedQuestions.length} published question(s) — available in the Quiz Builder.
                </Typography>
                {publishedQuestions.map((q) => (
                  <PublishedQuestionRow key={q.id} q={q} />
                ))}
              </Box>
            )}
          </>
        )}

      </NotebookPage>
    </DashboardLayout>
  );
}
