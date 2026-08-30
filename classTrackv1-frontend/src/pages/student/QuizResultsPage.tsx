// src/pages/student/QuizResultsPage.tsx
//
// Student Quiz Results — Sprint 5
// Shows the student's own quiz attempt history: scores, correct/incorrect,
// and topic-level progress. All data is fetched from GET /questions/my-attempts.

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Paper,
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
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage, NotebookCard } from "@components/notebook";
import { EmptyState } from "@components/feedback/EmptyState";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { useMyAttempts } from "@features/questions/hooks/useQuestions";
import type { QuizAttempt } from "@/types/quizAttempt";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function ResultIcon({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === null) {
    return (
      <Tooltip title="Pending review (free-text)">
        <HelpOutlineIcon fontSize="small" color="disabled" />
      </Tooltip>
    );
  }
  return isCorrect ? (
    <Tooltip title="Correct">
      <CheckCircleOutlineIcon fontSize="small" color="success" />
    </Tooltip>
  ) : (
    <Tooltip title="Incorrect">
      <CancelOutlinedIcon fontSize="small" color="error" />
    </Tooltip>
  );
}

// ── Overall stats strip ───────────────────────────────────────────────────────

function OverallStats({ attempts }: { attempts: QuizAttempt[] }) {
  const total     = attempts.length;
  const correct   = attempts.filter((a) => a.is_correct === true).length;
  const incorrect = attempts.filter((a) => a.is_correct === false).length;
  const unscored  = attempts.filter((a) => a.is_correct === null).length;
  const scored    = total - unscored;
  const pct       = scored > 0 ? Math.round((correct / scored) * 100) : null;

  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 3 }}>
      <Chip label={`Total: ${total}`} size="small" />
      <Chip label={`Correct: ${correct}`} color="success" size="small" />
      <Chip label={`Incorrect: ${incorrect}`} color="error" size="small" />
      {unscored > 0 && <Chip label={`Pending review: ${unscored}`} size="small" />}
      {pct !== null && (
        <Chip
          label={`Score: ${pct}%`}
          color={pct >= 60 ? "success" : "warning"}
          size="small"
        />
      )}
    </Stack>
  );
}

// ── Per-topic group ───────────────────────────────────────────────────────────

function TopicGroup({ topicId, attempts }: { topicId: number; attempts: QuizAttempt[] }) {
  const [open, setOpen] = useState(true);
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
          bgcolor: "action.selected",
          "&:hover": { bgcolor: "action.hover" },
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Topic #{topicId}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
            <Chip label={`${attempts.length} answered`} size="small" />
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
                <TableCell>Question</TableCell>
                <TableCell>Your Answer</TableCell>
                <TableCell align="center">Result</TableCell>
                <TableCell align="right">Score</TableCell>
                <TableCell align="right">Attempts</TableCell>
                <TableCell>Last Attempted</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attempts.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell sx={{ maxWidth: 280 }}>
                    <Typography variant="body2">
                      {a.question_text}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {a.question_type.replace("_", " ")} · {a.difficulty}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.student_answer}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <ResultIcon isCorrect={a.is_correct} />
                  </TableCell>
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StudentQuizResultsPage() {
  const { data, isLoading, isError } = useMyAttempts();
  const attempts = data?.attempts ?? [];

  // Group by topic_id
  const byTopic = useMemo(() => {
    return attempts.reduce<Record<number, QuizAttempt[]>>((acc, a) => {
      (acc[a.topic_id] ??= []).push(a);
      return acc;
    }, {});
  }, [attempts]);

  const topicIds = Object.keys(byTopic).map(Number);

  return (
    <DashboardLayout
      title="My Quiz Results"
      description="Your attempt history, scores, and topic-level progress."
      breadcrumbs={[
        { label: "Dashboard", href: "/student/dashboard" },
        { label: "My Quiz Results" },
      ]}
    >
      <NotebookPage>
        {/* Loading */}
        {isLoading && (
          <NotebookCard>
            <LoadingSkeleton variant="list" rows={4} />
          </NotebookCard>
        )}

        {/* Error */}
        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load results. Please refresh.
          </Alert>
        )}

        {/* Empty state */}
        {!isLoading && !isError && attempts.length === 0 && (
          <NotebookCard>
            <EmptyState
              icon={<QuizOutlinedIcon fontSize="inherit" />}
              title="No attempts yet"
              description="Answer some published questions in the Question Bank to see your results here."
            />
          </NotebookCard>
        )}

        {/* Stats + grouped results */}
        {!isLoading && attempts.length > 0 && (
          <>
            <OverallStats attempts={attempts} />
            {topicIds.map((tid) => (
              <TopicGroup key={tid} topicId={tid} attempts={byTopic[tid]} />
            ))}
          </>
        )}
      </NotebookPage>
    </DashboardLayout>
  );
}
