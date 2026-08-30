// src/pages/teacher/QuizAssignmentDetailPage.tsx
//
// Sprint 7 — Teacher Quiz Assignment Detail / Builder
//
// Tab 1: Builder — multi-source question picker, review panel, publish/edit
// Tab 2: Results — student attempt summary (after publishing)
//
// QUESTION BUILDER UX:
//   1. Teacher clicks "+ Add Question Bank"
//   2. Selects Curriculum → Subject → Chapter → Topic
//   3. Sees available published questions count
//   4. Adjusts quantity with [-] [count] [+] stepper
//   5. Optionally clicks "Select Questions" for manual checkbox selection
//   6. Clicks "Add Questions" to commit the batch to the quiz
//   7. The Quiz Questions panel updates immediately
//   8. Teacher can add more sources, remove questions, reorder, then publish

import { useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage } from "@components/notebook";
import { CurriculumNavigator } from "@components/curriculum/CurriculumNavigator";
import type { TopicSelection } from "@components/curriculum/CurriculumNavigator";
import { questionApi } from "@features/questions/api/questionApi";
import {
  useTeacherQuizDetail,
  usePublishQuiz,
  useArchiveQuiz,
  useDeleteQuiz,
  useUpdateQuiz,
  useRemoveQuestion,
  useReorderQuestions,
  useQuizResults,
  useStudentAttemptDetail,
  useBatchAddQuestions,
  useTopicPublishedCount,
} from "@features/quizAssignments/hooks/useQuizAssignments";
import { quizAssignmentApi } from "@features/quizAssignments/api/quizAssignmentApi";
import { ROUTES } from "@utils/constants";
import type {
  QuizAssignmentDetail,
  QuizAssignmentQuestion,
  UpdateQuizPayload,
  TeacherQuizResultRow,
  StudentAttemptDetail,
} from "@/types/quizAssignment";
import type { Question } from "@/types/question";
import { useQuery } from "@tanstack/react-query";

// ── Status chip ────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const map: Record<string, "default" | "success" | "warning"> = {
    draft: "default", published: "success", archived: "warning",
  };
  return (
    <Chip
      label={status.charAt(0).toUpperCase() + status.slice(1)}
      color={map[status] ?? "default"}
      size="small"
    />
  );
}

// ── Edit Quiz Dialog ───────────────────────────────────────────────────────────
function EditQuizDialog({
  open,
  onClose,
  quiz,
}: {
  open: boolean;
  onClose: () => void;
  quiz: QuizAssignmentDetail;
}) {
  const updateMutation = useUpdateQuiz();
  const [form, setForm] = useState<UpdateQuizPayload>({
    title:            quiz.title,
    instructions:     quiz.instructions,
    timeLimitMinutes: quiz.time_limit_minutes,
    dueDate:          quiz.due_date,
    shuffleQuestions: quiz.shuffle_questions,
    allowRetake:      quiz.allow_retake,
  });

  const handleSave = () => {
    updateMutation.mutate(
      { quizId: quiz.id, payload: form },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Quiz Details</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            size="small"
            label="Title"
            required
            inputProps={{ maxLength: 200 }}
            value={form.title ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <TextField
            size="small"
            label="Instructions"
            multiline
            rows={3}
            inputProps={{ maxLength: 2000 }}
            value={form.instructions ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value || null }))}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              size="small"
              label="Time Limit (min)"
              type="number"
              value={form.timeLimitMinutes ?? ""}
              onChange={(e) => setForm((f) => ({
                ...f, timeLimitMinutes: e.target.value ? Number(e.target.value) : null,
              }))}
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
                  checked={form.allowRetake ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, allowRetake: e.target.checked }))}
                  size="small"
                />
              }
              label={<Typography variant="body2">Allow Retake</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.shuffleQuestions ?? false}
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
          onClick={handleSave}
          disabled={updateMutation.isPending || !form.title?.trim()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Single Question Source Card ────────────────────────────────────────────────
// Displays one selected topic source with a stepper and optional manual picker.
interface SourceCardProps {
  topicId: number;
  topicName: string;
  existingQuestionIds: Set<number>;
  quizId: number;
  onRemoveSource: (topicId: number) => void;
}

function SourceCard({
  topicId,
  topicName,
  existingQuestionIds,
  quizId,
  onRemoveSource,
}: SourceCardProps) {
  // Count available published questions for this topic
  const countQuery = useTopicPublishedCount(topicId);
  const available = countQuery.data?.questions?.length ?? 0;

  // Quick-select stepper state
  const [quickCount, setQuickCount] = useState(Math.min(5, available));

  // Manual select state
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Fetch all published questions for manual selection
  const questionsQuery = useQuery({
    queryKey: ["questions", "topic", topicId, "published"],
    queryFn: () => questionApi.listByTopic(topicId, "published"),
    enabled: manualOpen,
    staleTime: 30_000,
  });
  const allQuestions: Question[] = questionsQuery.data?.questions ?? [];

  const batchMutation = useBatchAddQuestions();

  // Update quick count when available count loads
  const effectiveAvailable = available;

  const handleQuickAdd = () => {
    if (quickCount <= 0) return;
    batchMutation.mutate({
      quizId,
      payload: { sources: [{ topicId, count: quickCount }] },
    });
  };

  const handleManualAdd = () => {
    if (selectedIds.size === 0) return;
    batchMutation.mutate({
      quizId,
      payload: { questionIds: [...selectedIds] },
    });
    setSelectedIds(new Set());
  };

  const toggleQuestion = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const notInQuiz = allQuestions.filter((q) => !existingQuestionIds.has(q.id));

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      {/* Source header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="subtitle2" fontWeight={600}>
            {topicName}
          </Typography>
          {countQuery.isLoading ? (
            <Typography variant="caption" color="text.secondary">
              Loading…
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {effectiveAvailable} published question{effectiveAvailable !== 1 ? "s" : ""} available
            </Typography>
          )}
        </Box>
        <Tooltip title="Remove this source">
          <IconButton size="small" onClick={() => onRemoveSource(topicId)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {/* Quick-select stepper */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>
          Questions to add:
        </Typography>
        <IconButton
          size="small"
          disabled={quickCount <= 0 || batchMutation.isPending}
          onClick={() => setQuickCount((n) => Math.max(0, n - 1))}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <RemoveIcon fontSize="small" />
        </IconButton>
        <Typography
          variant="body1"
          fontWeight={600}
          sx={{ minWidth: 28, textAlign: "center" }}
        >
          {quickCount}
        </Typography>
        <IconButton
          size="small"
          disabled={quickCount >= effectiveAvailable || batchMutation.isPending}
          onClick={() => setQuickCount((n) => Math.min(effectiveAvailable, n + 1))}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
        <Button
          size="small"
          variant="contained"
          onClick={handleQuickAdd}
          disabled={quickCount <= 0 || effectiveAvailable === 0 || batchMutation.isPending}
          startIcon={
            batchMutation.isPending
              ? <CircularProgress size={12} color="inherit" />
              : <PlaylistAddIcon />
          }
        >
          Add {quickCount > 0 ? quickCount : ""} Questions
        </Button>
      </Stack>

      {/* Toggle manual picker */}
      <Button
        size="small"
        variant="text"
        endIcon={manualOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        onClick={() => setManualOpen((v) => !v)}
        sx={{ color: "text.secondary", mb: 0.5 }}
      >
        {manualOpen ? "Hide" : "Select Questions Manually"}
      </Button>

      {/* Manual selection panel */}
      <Collapse in={manualOpen}>
        {questionsQuery.isLoading && (
          <Stack alignItems="center" py={2}>
            <CircularProgress size={20} />
          </Stack>
        )}
        {!questionsQuery.isLoading && notInQuiz.length === 0 && (
          <Alert severity="info" sx={{ mt: 1 }}>
            {allQuestions.length === 0
              ? "No published questions for this topic."
              : "All published questions from this topic are already in the quiz."}
          </Alert>
        )}
        {notInQuiz.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {selectedIds.size} / {notInQuiz.length} selected
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setSelectedIds(new Set(notInQuiz.map((q) => q.id)))}
                >
                  Select All
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={selectedIds.size === 0}
                >
                  Clear
                </Button>
              </Stack>
            </Stack>
            <Stack spacing={0.75}>
              {notInQuiz.map((q) => (
                <Paper
                  key={q.id}
                  variant="outlined"
                  sx={{
                    p: 1,
                    borderRadius: 1.5,
                    cursor: "pointer",
                    bgcolor: selectedIds.has(q.id) ? "primary.50" : undefined,
                    borderColor: selectedIds.has(q.id) ? "primary.main" : undefined,
                  }}
                  onClick={() => toggleQuestion(q.id)}
                >
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Checkbox
                      size="small"
                      checked={selectedIds.has(q.id)}
                      onChange={() => toggleQuestion(q.id)}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ p: 0, mt: 0.25 }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 0.25 }}>
                        <Chip label={q.question_type.replace(/_/g, " ")} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                        <Chip label={q.difficulty} size="small" sx={{ fontSize: 10 }} />
                        <Chip label={`${q.marks} pt`} size="small" sx={{ fontSize: 10 }} />
                      </Stack>
                      <Typography variant="body2" sx={{
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {q.question_text}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
            <Button
              variant="contained"
              size="small"
              sx={{ mt: 1.5 }}
              disabled={selectedIds.size === 0 || batchMutation.isPending}
              onClick={handleManualAdd}
              startIcon={
                batchMutation.isPending
                  ? <CircularProgress size={12} color="inherit" />
                  : <PlaylistAddIcon />
              }
            >
              Add {selectedIds.size} Selected
            </Button>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}

// ── Question Source Builder ────────────────────────────────────────────────────
// Multi-source question picker. Teacher adds topic sources and builds the quiz.
function QuestionSourceBuilder({
  quizId,
  existingQuestionIds,
}: {
  quizId: number;
  existingQuestionIds: Set<number>;
}) {
  // List of added sources: { topicId, topicName }
  const [sources, setSources] = useState<{ topicId: number; topicName: string }[]>([]);
  // Whether the "Add question bank" selector is visible
  const [addingSource, setAddingSource] = useState(false);

  const handleTopicSelect = useCallback((sel: TopicSelection | null) => {
    if (!sel) return;
    // Don't add duplicate sources
    if (sources.find((s) => s.topicId === sel.topicId)) {
      setAddingSource(false);
      return;
    }
    setSources((prev) => [...prev, { topicId: sel.topicId, topicName: sel.topicName }]);
    setAddingSource(false);
  }, [sources]);

  const removeSource = (topicId: number) => {
    setSources((prev) => prev.filter((s) => s.topicId !== topicId));
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
        Question Sources
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Add one or more question banks (topics). For each, choose a quantity or select manually.
      </Typography>

      {/* Existing source cards */}
      <Stack spacing={2} sx={{ mb: 2 }}>
        {sources.map((s) => (
          <SourceCard
            key={s.topicId}
            topicId={s.topicId}
            topicName={s.topicName}
            existingQuestionIds={existingQuestionIds}
            quizId={quizId}
            onRemoveSource={removeSource}
          />
        ))}
      </Stack>

      {/* Add source selector */}
      {addingSource ? (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
            Select Question Bank
          </Typography>
          <CurriculumNavigator onTopicSelect={handleTopicSelect} />
          <Button
            size="small"
            variant="text"
            sx={{ mt: 1.5 }}
            onClick={() => setAddingSource(false)}
          >
            Cancel
          </Button>
        </Paper>
      ) : (
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAddingSource(true)}
        >
          Add Question Bank
        </Button>
      )}
    </Box>
  );
}

// ── Quiz question list ─────────────────────────────────────────────────────────
function QuizQuestionList({
  quizId,
  questions,
  isDraft,
}: {
  quizId: number;
  questions: QuizAssignmentQuestion[];
  isDraft: boolean;
}) {
  const removeMutation  = useRemoveQuestion();
  const reorderMutation = useReorderQuestions();

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const newOrder = [...questions];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    reorderMutation.mutate({ quizId, questionIds: newOrder.map((q) => q.id) });
  };

  const totalMarks = questions.reduce((sum, q) => {
    return sum + Number(q.marks_override ?? q.marks);
  }, 0);

  if (questions.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No questions added yet. Use the Question Sources panel to add published questions.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1.5}>
      {questions.map((q, i) => {
        const effectiveMarks = q.marks_override ?? q.marks;
        return (
          <Paper key={q.id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
            <Stack direction="row" alignItems="flex-start" spacing={1}>
              {/* Order index badge */}
              <Box
                sx={{
                  minWidth: 28, height: 28, borderRadius: "50%",
                  bgcolor: "primary.main", color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, flexShrink: 0, mt: 0.25,
                }}
              >
                {q.order_index}
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Chip label={q.question_type.replace(/_/g, " ")} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                  <Chip label={q.difficulty} size="small" sx={{ fontSize: 10 }} />
                  <Chip
                    label={`${effectiveMarks} pt${q.marks_override ? " (override)" : ""}`}
                    size="small"
                    color={q.marks_override ? "secondary" : "default"}
                    sx={{ fontSize: 10 }}
                  />
                </Stack>
                <Typography variant="body2" sx={{
                  overflow: "hidden", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}>
                  {q.question_text}
                </Typography>
              </Box>

              {isDraft && (
                <Stack direction="row" spacing={0} flexShrink={0}>
                  <IconButton
                    size="small"
                    disabled={i === 0 || reorderMutation.isPending}
                    onClick={() => moveQuestion(i, "up")}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={i === questions.length - 1 || reorderMutation.isPending}
                    onClick={() => moveQuestion(i, "down")}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate({ quizId, questionId: q.id })}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              )}
            </Stack>
          </Paper>
        );
      })}

      {/* Totals footer */}
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "grey.50" }}>
        <Stack direction="row" spacing={3}>
          <Typography variant="body2">
            <strong>Total Questions:</strong> {questions.length}
          </Typography>
          <Typography variant="body2">
            <strong>Total Marks:</strong> {totalMarks}
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? "#990302" : rank === 2 ? "#7c5cd8" : rank === 3 ? "#c97a1f" : undefined;
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: "50%",
        bgcolor: color ?? "grey.200",
        color: color ? "#fff" : "text.primary",
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      {rank}
    </Box>
  );
}

function PctChip({ pct }: { pct: number | null }) {
  if (pct === null) return <Typography variant="body2">—</Typography>;
  const color = pct >= 70 ? "success" : pct >= 50 ? "warning" : "error";
  return <Chip label={`${pct}%`} size="small" color={color} />;
}

// ── Student Attempt Detail Dialog ─────────────────────────────────────────────
function StudentDetailDialog({
  open,
  onClose,
  quizId,
  studentId,
  attemptNumber,
  studentName,
}: {
  open: boolean;
  onClose: () => void;
  quizId: number;
  studentId: number | null;
  attemptNumber: number | null;
  studentName: string;
}) {
  const { data, status } = useStudentAttemptDetail(
    open ? quizId : null,
    studentId,
    attemptNumber
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6" fontWeight={700}>{studentName}</Typography>
            {data && (
              <Typography variant="caption" color="text.secondary">
                Attempt #{data.attempt.attemptNumber} ·{" "}
                {data.attempt.score !== null ? `${data.attempt.score} / ${data.attempt.maxScore}` : "—"}{" "}
                {data.attempt.percentage !== null ? `(${data.attempt.percentage}%)` : ""}
                {" · "}{fmtDate(data.attempt.submittedAt)}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onClose} size="small">✕</IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {status === "pending" && (
          <Stack spacing={2}>
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 1 }} />)}
          </Stack>
        )}
        {status === "error" && (
          <Alert severity="error">Failed to load student answers.</Alert>
        )}
        {status === "success" && data && (
          <Stack spacing={2}>
            {data.questions.map((q, idx) => (
              <Paper key={q.questionId} variant="outlined" sx={{ p: 2, borderRadius: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 24, pt: 0.3 }}>
                    Q{idx + 1}
                  </Typography>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                      {q.questionText}
                    </Typography>
                    <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 0.5 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Student answered:</Typography>
                        <Typography variant="body2" sx={{ mt: 0.2 }}>
                          {q.studentAnswer ?? <em style={{ color: "#aaa" }}>No answer</em>}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Correct answer:</Typography>
                        <Typography variant="body2" color="success.main" fontWeight={600} sx={{ mt: 0.2 }}>
                          {q.correctAnswer}
                        </Typography>
                      </Box>
                    </Stack>
                    {q.explanation && (
                      <Typography variant="caption" color="text.secondary">
                        Explanation: {q.explanation}
                      </Typography>
                    )}
                  </Box>
                  <Stack alignItems="flex-end" spacing={0.5} sx={{ minWidth: 80 }}>
                    {q.isCorrect === true && <CheckCircleOutlineIcon color="success" fontSize="small" />}
                    {q.isCorrect === false && <CancelOutlinedIcon color="error" fontSize="small" />}
                    {q.isCorrect === null && <HelpOutlineIcon color="disabled" fontSize="small" />}
                    <Typography variant="caption" color="text.secondary">
                      {q.score !== null ? q.score : "—"} / {q.effectiveMarks}
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Results tab ────────────────────────────────────────────────────────────────
function ResultsTab({ quizId }: { quizId: number }) {
  const { data, status, isFetching } = useQuizResults(quizId);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"rank" | "score" | "submitted">("rank");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<{
    studentId: number;
    attemptNumber: number;
    studentName: string;
  } | null>(null);

  // ── Download PDF using authenticated fetch ─────────────────────────────────
  const handleDownloadPdf = async () => {
    try {
      const { tokenStorage } = await import("@services/tokenStorage");
      const token = tokenStorage.getAccessToken();
      const url = quizAssignmentApi.getResultsPdfUrl(quizId);
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("PDF request failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `quiz-results-${quizId}.pdf`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // silently fail — user can retry
    }
  };

  // ── Initial loading skeleton ───────────────────────────────────────────────
  if (status === "pending") {
    return (
      <Stack spacing={2}>
        <Stack direction="row" spacing={2}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rectangular" height={72} sx={{ flex: 1, borderRadius: 1.5 }} />
          ))}
        </Stack>
        <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 1.5 }} />
      </Stack>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <Alert severity="error" sx={{ mt: 1 }}>
        Failed to load quiz results. The quiz may not exist or you may not have access.
      </Alert>
    );
  }

  const { quiz, summary, students, notAttempted } = data!;

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = students.filter((s) =>
    !search || s.studentName.toLowerCase().includes(search.toLowerCase()) ||
    s.username.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => {
    let diff = 0;
    if (sortBy === "rank")      diff = a.rank - b.rank;
    else if (sortBy === "score") diff = (b.score ?? -1) - (a.score ?? -1);
    else if (sortBy === "submitted") {
      diff = new Date(a.submittedAt ?? 0).getTime() - new Date(b.submittedAt ?? 0).getTime();
    }
    return sortAsc ? diff : -diff;
  });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortAsc((v) => !v);
    else { setSortBy(col); setSortAsc(true); }
  };
  const SortLabel = ({ col, label }: { col: typeof sortBy; label: string }) => (
    <Box
      component="span"
      sx={{ cursor: "pointer", userSelect: "none", display: "inline-flex", alignItems: "center", gap: 0.5 }}
      onClick={() => toggleSort(col)}
    >
      {label}
      {sortBy === col && (sortAsc ? " ↑" : " ↓")}
    </Box>
  );

  return (
    <Box>
      {/* Background refresh indicator */}
      {isFetching && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <CircularProgress size={12} />
          <Typography variant="caption" color="text.secondary">Refreshing…</Typography>
        </Stack>
      )}

      {/* Summary cards */}
      <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 3 }}>
        {[
          { label: "Total Students", value: summary.totalStudents, color: "primary.main" },
          { label: "Attempted",      value: summary.attempted,     color: "success.main" },
          { label: "Not Attempted",  value: summary.notAttempted,  color: "warning.main" },
          {
            label: "Avg Score",
            value: summary.averagePercentage !== null ? `${summary.averagePercentage}%` : "—",
            color: "info.main",
          },
          {
            label: "Highest",
            value: summary.highestPercentage !== null ? `${summary.highestPercentage}%` : "—",
            color: "success.dark",
          },
        ].map(({ label, value, color }) => (
          <Card key={label} variant="outlined" sx={{ minWidth: 120, flex: "1 1 120px" }}>
            <CardContent sx={{ py: "12px !important", px: 2 }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h6" fontWeight={700} color={color}>{value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Actions bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
        <TextField
          size="small"
          placeholder="Search student…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 220 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={<PictureAsPdfOutlinedIcon />}
          onClick={handleDownloadPdf}
        >
          Download PDF
        </Button>
      </Stack>

      {/* Ranking table */}
      {sorted.length === 0 && students.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <PersonOutlineIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No students have submitted this quiz yet.
          </Typography>
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "grey.50" }}>
                <TableCell sx={{ width: 56 }}>
                  <SortLabel col="rank" label="Rank" />
                </TableCell>
                <TableCell>Student</TableCell>
                <TableCell align="center">
                  <SortLabel col="score" label="Score" />
                </TableCell>
                <TableCell align="center">%</TableCell>
                <TableCell align="center">Attempt</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell>
                  <SortLabel col="submitted" label="Submitted" />
                </TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.studentId} hover>
                  <TableCell>
                    <RankBadge rank={r.rank} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{r.studentName}</Typography>
                    <Typography variant="caption" color="text.secondary">@{r.username}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">
                      {r.score !== null && r.maxScore !== null
                        ? `${r.score} / ${r.maxScore}`
                        : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <PctChip pct={r.percentage} />
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={r.attemptNumber} size="small" variant="outlined" />
                    {r.totalAttempts > 1 && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        / {r.totalAttempts}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={r.status === "submitted" ? "Submitted" : r.status}
                      size="small"
                      color={r.status === "submitted" ? "success" : "default"}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {fmtDate(r.submittedAt)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() =>
                        setSelectedStudent({
                          studentId: r.studentId,
                          attemptNumber: r.attemptNumber,
                          studentName: r.studentName,
                        })
                      }
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Not attempted section */}
      {notAttempted.length > 0 && (
        <Box>
          <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
            Not Attempted ({notAttempted.length})
          </Typography>
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
            <Table size="small">
              <TableBody>
                {notAttempted.map((s) => (
                  <TableRow key={s.studentId}>
                    <TableCell>
                      <Typography variant="body2">{s.studentName}</Typography>
                      <Typography variant="caption" color="text.secondary">@{s.username}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label="Not Attempted" size="small" color="default" variant="outlined" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}

      {/* Student detail dialog */}
      {selectedStudent && (
        <StudentDetailDialog
          open={!!selectedStudent}
          onClose={() => setSelectedStudent(null)}
          quizId={quizId}
          studentId={selectedStudent.studentId}
          attemptNumber={selectedStudent.attemptNumber}
          studentName={selectedStudent.studentName}
        />
      )}
    </Box>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function QuizAssignmentDetailPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const quizIdNum = Number(quizId);

  const [activeTab, setActiveTab]   = useState(0);
  const [editOpen,  setEditOpen]    = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { data, isLoading, isError } = useTeacherQuizDetail(quizIdNum);
  const publishMutation = usePublishQuiz();
  const archiveMutation = useArchiveQuiz();
  const deleteMutation  = useDeleteQuiz();

  const quiz: QuizAssignmentDetail | undefined = data?.quiz;

  if (isLoading) {
    return (
      <DashboardLayout title="Loading…" breadcrumbs={[{ label: "Quiz Assignments", href: ROUTES.TEACHER.QUIZ_ASSIGNMENTS }, { label: "…" }]}>
        <NotebookPage>
          <Stack alignItems="center" py={8}><CircularProgress /></Stack>
        </NotebookPage>
      </DashboardLayout>
    );
  }

  if (isError || !quiz) {
    return (
      <DashboardLayout title="Not Found" breadcrumbs={[{ label: "Quiz Assignments", href: ROUTES.TEACHER.QUIZ_ASSIGNMENTS }]}>
        <NotebookPage>
          <Alert severity="error">Quiz assignment not found.</Alert>
        </NotebookPage>
      </DashboardLayout>
    );
  }

  const isDraft = quiz.status === "draft";
  const existingIds = new Set(quiz.questions.map((q) => q.id));

  return (
    <DashboardLayout
      title={quiz.title}
      description={`${quiz.classroom_name ?? ""} · ${quiz.questions.length} question(s)`}
      breadcrumbs={[
        { label: "Dashboard", href: ROUTES.TEACHER.DASHBOARD },
        { label: "Quiz Assignments", href: ROUTES.TEACHER.QUIZ_ASSIGNMENTS },
        { label: quiz.title },
      ]}
    >
      <NotebookPage>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }} flexWrap="wrap" gap={1}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Button
                size="small"
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate(ROUTES.TEACHER.QUIZ_ASSIGNMENTS)}
                sx={{ mr: 1 }}
              >
                Back
              </Button>
              <StatusChip status={quiz.status} />
              {quiz.allow_retake && <Chip label="Retakes allowed" size="small" variant="outlined" />}
              {quiz.shuffle_questions && <Chip label="Shuffled" size="small" variant="outlined" />}
              {quiz.time_limit_minutes && (
                <Chip label={`${quiz.time_limit_minutes} min`} size="small" variant="outlined" />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Classroom: {quiz.classroom_name}
              {quiz.due_date && ` · Due: ${new Date(quiz.due_date).toLocaleString()}`}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            {isDraft && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditOutlinedIcon />}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
            )}
            {isDraft && quiz.questions.length > 0 && (
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={publishMutation.isPending
                  ? <CircularProgress size={14} color="inherit" />
                  : <PublishOutlinedIcon />}
                onClick={() => publishMutation.mutate(quizIdNum)}
                disabled={publishMutation.isPending}
              >
                Publish Quiz
              </Button>
            )}
            {quiz.status === "published" && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<ArchiveOutlinedIcon />}
                onClick={() => archiveMutation.mutate(quizIdNum)}
                disabled={archiveMutation.isPending}
              >
                Archive
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              Delete
            </Button>
          </Stack>
        </Stack>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
          <Tab label="Builder" />
          {(quiz.status === "published" || quiz.status === "archived") && (
            <Tab label="Results" />
          )}
        </Tabs>

        {/* Builder tab */}
        {activeTab === 0 && (
          <Box sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: isDraft ? "1fr 1fr" : "1fr" },
            gap: 3,
          }}>
            {/* Left: Question source builder (only in draft) */}
            {isDraft && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <QuestionSourceBuilder
                  quizId={quizIdNum}
                  existingQuestionIds={existingIds}
                />
              </Paper>
            )}

            {/* Right: Current questions */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Quiz Questions ({quiz.questions.length})
                </Typography>
                {!isDraft && (
                  <Chip
                    label="Published — read only"
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                )}
              </Stack>
              <QuizQuestionList
                quizId={quizIdNum}
                questions={quiz.questions}
                isDraft={isDraft}
              />
            </Paper>
          </Box>
        )}

        {/* Results tab */}
        {activeTab === 1 && <ResultsTab quizId={quizIdNum} />}
      </NotebookPage>

      {/* Edit dialog */}
      {editOpen && (
        <EditQuizDialog open={editOpen} onClose={() => setEditOpen(false)} quiz={quiz} />
      )}

      {/* Delete confirm */}
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Quiz Assignment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently delete "<strong>{quiz.title}</strong>". This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              deleteMutation.mutate(quizIdNum);
              setConfirmDeleteOpen(false);
            }}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}
