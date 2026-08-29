// src/pages/student/QuestionBankPage.tsx
//
// Student Question Bank — Sprint 3
// Students select a topic, choose parameters, and generate questions.
// They can also browse published questions for any topic.
//
// Persistence fix: generated questions are fetched from the database on mount
// via useMyQuestions (polls every 15 s). Refreshing the browser no longer
// loses questions — the database is the source of truth.
//
// Real-time sync fix: useMyQuestions uses refetchInterval (15 s) +
// refetchOnWindowFocus so teacher approval/publish changes propagate to the
// student UI without a manual refresh.

import { useState } from "react";
import {
  Box, Button, Chip, CircularProgress, Collapse, Divider,
  FormControl, FormHelperText, InputLabel, MenuItem,
  Paper, Select, Stack, TextField, Typography, Alert,
  Accordion, AccordionSummary, AccordionDetails,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage, NotebookCard } from "@components/notebook";
import {
  useGenerateQuestions,
  useMyQuestions,
  usePublishedQuestions,
} from "@features/questions/hooks/useQuestions";
import type { QuestionType, QuestionDifficulty, Question, QuestionStatus } from "@/types/question";

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "mcq",           label: "Multiple Choice" },
  { value: "true_false",    label: "True / False" },
  { value: "fill_blank",    label: "Fill in the Blank" },
  { value: "one_word",      label: "One Word Answer" },
  { value: "short_answer",  label: "Short Answer" },
  { value: "descriptive",   label: "Descriptive" },
  { value: "matching",      label: "Matching" },
  { value: "scenario",      label: "Scenario-Based" },
];

const DIFFICULTIES: { value: QuestionDifficulty; label: string }[] = [
  { value: "easy",   label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard",   label: "Hard" },
];

// ── Status chip ────────────────────────────────────────────────────────────────
function QStatusChip({ status }: { status: QuestionStatus }) {
  const map: Record<QuestionStatus, "default" | "warning" | "info" | "success" | "error"> = {
    generated:        "default",
    validated:        "default",
    pending_approval: "warning",
    approved:         "info",
    published:        "success",
    rejected:         "error",
    archived:         "default",
  };
  const labels: Record<QuestionStatus, string> = {
    generated:        "Generated",
    validated:        "Validated",
    pending_approval: "Pending Approval",
    approved:         "Approved",
    published:        "Published",
    rejected:         "Rejected",
    archived:         "Archived",
  };
  return (
    <Chip
      label={labels[status] ?? status}
      color={map[status] ?? "default"}
      size="small"
      sx={{ fontSize: 11 }}
    />
  );
}

// ── Difficulty chip ────────────────────────────────────────────────────────────
function DiffChip({ difficulty }: { difficulty: string }) {
  const map: Record<string, "success" | "warning" | "error"> = {
    easy: "success", medium: "warning", hard: "error",
  };
  return (
    <Chip label={difficulty} color={map[difficulty] ?? "default"} size="small"
      variant="outlined" sx={{ textTransform: "capitalize", fontSize: 11 }} />
  );
}

// ── My question card (all statuses) ────────────────────────────────────────────
function MyQuestionCard({ q }: { q: Question }) {
  const [showAnswer, setShowAnswer] = useState(false);

  const renderOptions = () => {
    if (!q.options) return null;
    if (q.question_type === "matching") {
      const pairs = q.options as { left: string; right: string }[];
      return (
        <Box sx={{ mt: 1 }}>
          {pairs.map((p, i) => (
            <Typography key={i} variant="body2" sx={{ ml: 1 }}>
              {i + 1}. {p.left} &nbsp;⇔&nbsp; {p.right}
            </Typography>
          ))}
        </Box>
      );
    }
    const opts = q.options as string[];
    return (
      <Box sx={{ mt: 1 }}>
        {opts.map((o, i) => (
          <Typography key={i} variant="body2" sx={{ ml: 1 }}>
            {String.fromCharCode(65 + i)}. {o}
          </Typography>
        ))}
      </Box>
    );
  };

  const borderColor =
    q.status === "approved"  ? "info.main"    :
    q.status === "published"  ? "success.main" :
    q.status === "rejected"   ? "error.main"   :
    "warning.main"; // pending_approval / generated / validated

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 1.5, borderColor }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
        <Chip label={q.question_type.replace("_", " ")} size="small" variant="outlined" sx={{ fontSize: 11 }} />
        <DiffChip difficulty={q.difficulty} />
        <QStatusChip status={q.status} />
      </Stack>
      <Typography variant="body1" fontWeight={500} sx={{ mb: 0.5 }}>
        {q.question_text}
      </Typography>
      {renderOptions()}

      {q.status === "rejected" && q.rejected_reason && (
        <Alert severity="error" sx={{ mt: 1, py: 0.5 }}>
          Rejection reason: {q.rejected_reason}
        </Alert>
      )}

      <Button size="small" sx={{ mt: 1 }} onClick={() => setShowAnswer((v) => !v)}>
        {showAnswer ? "Hide Answer" : "Show Answer"}
      </Button>
      <Collapse in={showAnswer}>
        <Divider sx={{ my: 1 }} />
        <Typography variant="body2" color="success.main" fontWeight={600}>
          Answer: {q.correct_answer}
        </Typography>
        {q.explanation && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {q.explanation}
          </Typography>
        )}
      </Collapse>
    </Paper>
  );
}

// ── Published question card ────────────────────────────────────────────────────
function PublishedQuestionCard({ q }: { q: Question }) {
  const [showAnswer, setShowAnswer] = useState(false);

  const renderOptions = () => {
    if (!q.options) return null;
    if (q.question_type === "matching") {
      const pairs = q.options as { left: string; right: string }[];
      return (
        <Box sx={{ mt: 1 }}>
          {pairs.map((p, i) => (
            <Typography key={i} variant="body2" sx={{ ml: 1 }}>
              {i + 1}. {p.left} &nbsp;⇔&nbsp; {p.right}
            </Typography>
          ))}
        </Box>
      );
    }
    const opts = q.options as string[];
    return (
      <Box sx={{ mt: 1 }}>
        {opts.map((o, i) => (
          <Typography key={i} variant="body2" sx={{ ml: 1 }}>
            {String.fromCharCode(65 + i)}. {o}
          </Typography>
        ))}
      </Box>
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 1.5 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
        <Chip label={q.question_type.replace("_", " ")} size="small" variant="outlined" sx={{ fontSize: 11 }} />
        <DiffChip difficulty={q.difficulty} />
      </Stack>
      <Typography variant="body1" fontWeight={500} sx={{ mb: 0.5 }}>
        {q.question_text}
      </Typography>
      {renderOptions()}

      <Button
        size="small"
        sx={{ mt: 1 }}
        onClick={() => setShowAnswer((v) => !v)}
      >
        {showAnswer ? "Hide Answer" : "Show Answer"}
      </Button>

      <Collapse in={showAnswer}>
        <Divider sx={{ my: 1 }} />
        <Typography variant="body2" color="success.main" fontWeight={600}>
          Answer: {q.correct_answer}
        </Typography>
        {q.explanation && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {q.explanation}
          </Typography>
        )}
      </Collapse>
    </Paper>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StudentQuestionBankPage() {
  const [topicId, setTopicId] = useState<string>("");
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>("medium");
  const [count, setCount] = useState<number>(5);

  const generateMutation = useGenerateQuestions();

  // ── Database-backed queries ────────────────────────────────────────────────
  // useMyQuestions polls the backend every 15 s so status changes made by the
  // teacher (pending → approved → published) appear in the student UI
  // automatically without a page refresh.
  const topicIdNum = topicId ? Number(topicId) : undefined;
  const myQuestionsQuery = useMyQuestions(topicIdNum);
  const publishedQuery   = usePublishedQuestions(topicIdNum ?? null);

  const handleGenerate = () => {
    if (!topicId) return;
    generateMutation.mutate({
      topicId: Number(topicId),
      questionType,
      difficulty,
      count,
    });
  };

  // Source of truth = database via useMyQuestions.
  // No longer read from mutation.data — that was the root cause of
  // questions disappearing on browser refresh.
  const myQuestions      = myQuestionsQuery.data?.questions ?? [];
  const publishedQuestions = publishedQuery.data?.questions ?? [];

  // Separate pending/approved questions from published so we don't show them
  // twice (they will also appear in the Published section once published).
  const pendingAndApproved = myQuestions.filter(
    (q) => !["published", "archived"].includes(q.status)
  );

  return (
    <DashboardLayout
      title="Question Bank"
      description="Generate practice questions from your syllabus content."
      breadcrumbs={[
        { label: "Dashboard", href: "/student/dashboard" },
        { label: "Question Bank" },
      ]}
    >
      <NotebookPage>

        {/* ── Generation form ──────────────────────────────────────────────── */}
        <NotebookCard title="Generate Questions" sx={{ mb: 3 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Topic ID"
                size="small"
                type="number"
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                helperText="Enter the topic ID from your Knowledge Base"
                sx={{ width: { xs: "100%", sm: 160 } }}
              />

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Question Type</InputLabel>
                <Select
                  label="Question Type"
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                >
                  {QUESTION_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Difficulty</InputLabel>
                <Select
                  label="Difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
                >
                  {DIFFICULTIES.map((d) => (
                    <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Count</InputLabel>
                <Select
                  label="Count"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {[1, 3, 5, 10, 15, 20].map((n) => (
                    <MenuItem key={n} value={n}>{n}</MenuItem>
                  ))}
                </Select>
                <FormHelperText>Max 20</FormHelperText>
              </FormControl>
            </Stack>

            <Box>
              <Button
                variant="contained"
                startIcon={
                  generateMutation.isPending
                    ? <CircularProgress size={16} color="inherit" />
                    : <AutoAwesomeIcon />
                }
                onClick={handleGenerate}
                disabled={!topicId || generateMutation.isPending}
              >
                {generateMutation.isPending ? "Generating…" : "Generate Questions"}
              </Button>
            </Box>

            {generateMutation.isError && (
              <Alert severity="error">
                {(generateMutation.error as Error)?.message ?? "Generation failed."}
              </Alert>
            )}
          </Stack>
        </NotebookCard>

        {/* ── My generated questions (persisted, from DB) ────────────────────
            Shows all statuses: pending_approval, approved, rejected.
            Published questions appear here until they are in the published
            section — they are excluded from this list to avoid duplication.
        ──────────────────────────────────────────────────────────────────── */}
        {topicId && (
          <NotebookCard
            title={
              myQuestionsQuery.isLoading
                ? "My Questions (loading…)"
                : `My Questions (${pendingAndApproved.length})`
            }
            subtitle="Questions you generated — status updates automatically as your teacher reviews them."
            sx={{ mb: 3 }}
          >
            {myQuestionsQuery.isLoading && (
              <Stack alignItems="center" py={2}><CircularProgress size={24} /></Stack>
            )}
            {myQuestionsQuery.isError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                Failed to load your questions. Please refresh.
              </Alert>
            )}
            {!myQuestionsQuery.isLoading && pendingAndApproved.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                No questions generated for this topic yet. Use the form above to generate some!
              </Typography>
            )}
            {pendingAndApproved.map((q) => (
              <MyQuestionCard key={q.id} q={q} />
            ))}
            {myQuestionsQuery.isFetching && !myQuestionsQuery.isLoading && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <CircularProgress size={12} />
                <Typography variant="caption" color="text.secondary">
                  Checking for status updates…
                </Typography>
              </Stack>
            )}
          </NotebookCard>
        )}

        {/* ── Published questions for the topic ─────────────────────────────── */}
        {topicId && (
          <Accordion defaultExpanded elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} alignItems="center">
                <QuizOutlinedIcon fontSize="small" />
                <Typography variant="subtitle2" fontWeight={600}>
                  Published Questions for Topic #{topicId}
                </Typography>
                {publishedQuery.isLoading && <CircularProgress size={14} />}
                {!publishedQuery.isLoading && (
                  <Chip
                    label={publishedQuestions.length}
                    size="small"
                    color={publishedQuestions.length > 0 ? "success" : "default"}
                    sx={{ height: 18, fontSize: 11 }}
                  />
                )}
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {publishedQuery.isLoading && (
                <Stack alignItems="center" py={2}><CircularProgress size={24} /></Stack>
              )}
              {!publishedQuery.isLoading && publishedQuestions.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  No published questions for this topic yet.
                </Typography>
              )}
              {publishedQuestions.map((q) => (
                <PublishedQuestionCard key={q.id} q={q} />
              ))}
            </AccordionDetails>
          </Accordion>
        )}
      </NotebookPage>
    </DashboardLayout>
  );
}
