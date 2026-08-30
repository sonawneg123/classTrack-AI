// src/pages/teacher/QuizResultsPage.tsx
//
// Teacher Quiz Results — Sprint 5 (updated Sprint 7)
// Shows student attempt data for questions across topics.
//
// Teacher browses Curriculum → Subject → Chapter → Topic via the
// CurriculumNavigator instead of typing a raw Topic ID.
// Once a topic is selected the existing useTopicResults hook loads results.

import { useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage, NotebookCard } from "@components/notebook";
import { EmptyState } from "@components/feedback/EmptyState";
import { CurriculumNavigator } from "@components/curriculum/CurriculumNavigator";
import type { TopicSelection } from "@components/curriculum/CurriculumNavigator";
import { useTopicResults } from "@features/questions/hooks/useQuestions";
import type { TeacherQuizResult } from "@/types/quizAttempt";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function ScoreCell({ row }: { row: TeacherQuizResult }) {
  if (row.is_correct === null) {
    return (
      <Tooltip title="Unscored (free-text)">
        <HelpOutlineIcon fontSize="small" color="disabled" />
      </Tooltip>
    );
  }
  return row.is_correct ? (
    <Tooltip title="Correct">
      <CheckCircleOutlineIcon fontSize="small" color="success" />
    </Tooltip>
  ) : (
    <Tooltip title="Incorrect">
      <CancelOutlinedIcon fontSize="small" color="error" />
    </Tooltip>
  );
}

function ScoreSummary({ attempts }: { attempts: TeacherQuizResult[] }) {
  const total     = attempts.length;
  const correct   = attempts.filter((a) => a.is_correct === true).length;
  const incorrect = attempts.filter((a) => a.is_correct === false).length;
  const unscored  = attempts.filter((a) => a.is_correct === null).length;
  const pct       = total > 0 ? Math.round((correct / (total - unscored || 1)) * 100) : 0;

  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 2 }}>
      <Chip label={`Total attempts: ${total}`} size="small" />
      <Chip label={`Correct: ${correct}`} color="success" size="small" />
      <Chip label={`Incorrect: ${incorrect}`} color="error" size="small" />
      {unscored > 0 && <Chip label={`Unscored: ${unscored}`} color="default" size="small" />}
      {total > unscored && (
        <Chip label={`Accuracy: ${pct}%`} color={pct >= 60 ? "success" : "warning"} size="small" />
      )}
    </Stack>
  );
}

// ── Per-question collapsed section ────────────────────────────────────────────

function QuestionResultGroup({ questionText, questionType, attempts }: {
  questionText: string;
  questionType: string;
  attempts: TeacherQuizResult[];
}) {
  const [open, setOpen] = useState(false);
  const correct   = attempts.filter((a) => a.is_correct === true).length;
  const incorrect = attempts.filter((a) => a.is_correct === false).length;
  const unscored  = attempts.filter((a) => a.is_correct === null).length;

  return (
    <Paper variant="outlined" sx={{ mb: 2, borderRadius: 2, overflow: "hidden" }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 2, py: 1.5,
          cursor: "pointer",
          "&:hover": { bgcolor: "action.hover" },
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
            {questionText}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip label={questionType.replace("_", " ")} size="small" variant="outlined" sx={{ fontSize: 11 }} />
            <Chip label={`${attempts.length} attempt(s)`} size="small" />
            {correct > 0   && <Chip label={`✓ ${correct}`} color="success" size="small" />}
            {incorrect > 0 && <Chip label={`✗ ${incorrect}`} color="error"   size="small" />}
            {unscored > 0  && <Chip label={`? ${unscored}`} color="default"  size="small" />}
          </Stack>
        </Box>
        <IconButton size="small">
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Divider />
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell>Answer</TableCell>
                <TableCell align="center">Result</TableCell>
                <TableCell align="right">Score</TableCell>
                <TableCell align="right">Attempts</TableCell>
                <TableCell>Last Attempted</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attempts.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{a.student_name}</Typography>
                    <Typography variant="caption" color="text.secondary">@{a.student_username}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.student_answer}
                    </Typography>
                  </TableCell>
                  <TableCell align="center"><ScoreCell row={a} /></TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {a.score !== null ? `${a.score} / ${a.marks}` : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip label={a.attempt_count} size="small" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{fmtDate(a.last_attempted_at)}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── Skeleton loader ────────────────────────────────────────────────────────────

function ResultsSkeleton() {
  return (
    <Stack spacing={1.5}>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rounded" height={72} />
      ))}
    </Stack>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function QuizResultsPage() {
  const [topic, setTopic] = useState<TopicSelection | null>(null);

  // Status: pending = initial load; error = fetch failed; success + empty = no attempts
  // Using status === "pending" (not isLoading) so a background refetch never
  // replaces existing results with a full-page spinner.
  const {
    data,
    status,
    fetchStatus,
    isError,
    error,
    refetch,
  } = useTopicResults(topic ? topic.topicId : null);

  const attempts   = data?.attempts ?? [];
  const isInitial  = status === "pending" && fetchStatus === "fetching";
  const isBgFetch  = status === "success"  && fetchStatus === "fetching";

  // Group attempts by question
  const byQuestion = attempts.reduce<Record<number, TeacherQuizResult[]>>((acc, a) => {
    (acc[a.question_id] ??= []).push(a);
    return acc;
  }, {});

  const questionIds = Object.keys(byQuestion).map(Number);

  return (
    <DashboardLayout
      title="Quiz Results"
      description="View student attempt data for published questions."
      breadcrumbs={[
        { label: "Dashboard", href: "/teacher/dashboard" },
        { label: "Question Bank", href: "/teacher/question-bank" },
        { label: "Quiz Results" },
      ]}
    >
      <NotebookPage>
        {/* ── Topic selector ──────────────────────────────────────────────── */}
        <NotebookCard sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <TuneIcon fontSize="small" color="primary" />
            <Typography variant="body2" fontWeight={600}>
              Select a topic to view student results
            </Typography>
            {isBgFetch && (
              <CircularProgress size={14} sx={{ ml: 1 }} />
            )}
          </Stack>

          <CurriculumNavigator onTopicSelect={setTopic} />

          {topic && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1.5, display: "block" }}
            >
              Showing results for: <strong>{topic.topicName}</strong>
            </Typography>
          )}
        </NotebookCard>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {isError && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={
              <Typography
                variant="caption"
                color="primary"
                sx={{ cursor: "pointer", fontWeight: 600 }}
                onClick={() => refetch()}
              >
                Retry
              </Typography>
            }
          >
            {(error as Error)?.message ?? "Failed to load results."}
          </Alert>
        )}

        {/* ── Initial loading skeleton ────────────────────────────────────── */}
        {topic && isInitial && <ResultsSkeleton />}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {topic && status === "success" && !isBgFetch && attempts.length === 0 && (
          <NotebookCard>
            <EmptyState
              icon={<QuizOutlinedIcon fontSize="inherit" />}
              title="No attempts yet"
              description="No students have attempted questions in this topic yet."
            />
          </NotebookCard>
        )}

        {/* ── No topic selected ───────────────────────────────────────────── */}
        {!topic && status !== "pending" && (
          <NotebookCard>
            <EmptyState
              icon={<TuneIcon fontSize="inherit" />}
              title="Select a topic"
              description="Choose Curriculum → Subject → Chapter → Topic above to view student results."
            />
          </NotebookCard>
        )}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {attempts.length > 0 && (
          <>
            <ScoreSummary attempts={attempts} />
            {questionIds.map((qId) => {
              const qAttempts = byQuestion[qId];
              const first = qAttempts[0];
              return (
                <QuestionResultGroup
                  key={qId}
                  questionText={first.question_text}
                  questionType={first.question_type}
                  attempts={qAttempts}
                />
              );
            })}
          </>
        )}
      </NotebookPage>
    </DashboardLayout>
  );
}
