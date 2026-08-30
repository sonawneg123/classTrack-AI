// src/pages/student/TakeQuizPage.tsx
//
// Sprint 7 — Student: Take Quiz
//
// State machine:
//   A = Not Started / no in-progress attempt  → Show intro + "Start Quiz"
//   B = In Progress                            → Show all questions, collect answers, Submit
//   C = Submitted                              → Show score banner + per-question results
//
// Security:
//   - correct_answer is NEVER rendered in the DOM during State B
//   - QuizQuestionCard in State B has no priorResult prop
//   - Submit button disabled while processing
//   - Confirmation dialog before final submit

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage } from "@components/notebook";
import { QuizQuestionCard } from "@components/quiz/QuizQuestionCard";
import {
  useStudentQuizDetail,
  useStartQuiz,
  useSubmitQuiz,
  useMyAttempts,
} from "@features/quizAssignments/hooks/useQuizAssignments";
import { ROUTES } from "@utils/constants";
import type {
  QuizAssignmentQuestion,
  QuizSubmitResult,
  QuizAnswerResult,
} from "@/types/quizAssignment";
import type { Question } from "@/types/question";
import type { SubmitAttemptResponse } from "@/types/quizAttempt";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Map a QuizAssignmentQuestion to the Question shape expected by QuizQuestionCard */
function toQuestion(q: QuizAssignmentQuestion): Question {
  return {
    id:                   q.id,
    question_type:        q.question_type,
    difficulty:           q.difficulty,
    marks:                q.marks_override ?? q.marks,
    question_text:        q.question_text,
    options:              q.options,
    correct_answer:       q.correct_answer,
    explanation:          q.explanation,
    status:               "published" as const,
    curriculum_id:        q.curriculum_id ?? 0,
    subject_id:           q.subject_id ?? 0,
    chapter_id:           q.chapter_id ?? 0,
    topic_id:             q.topic_id ?? 0,
    source_document_id:   0,
    source_chunk_id:      0,
    generation_model:     "",
    generation_provider:  "",
    created_by:           0,
    created_by_role:      "teacher",
    approved_by:          null,
    approved_at:          null,
    rejected_reason:      null,
    created_at:           "",
    updated_at:           "",
  };
}

/** Map a QuizAnswerResult to the SubmitAttemptResponse shape for QuizQuestionCard */
function toAttemptResponse(
  r: QuizAnswerResult,
  questionId: number
): SubmitAttemptResponse {
  return {
    attemptId:     0,
    questionId,
    studentAnswer: r.studentAnswer,
    isCorrect:     r.isCorrect,
    score:         r.score,
    attemptCount:  1,
    correctAnswer: r.correctAnswer,
    explanation:   r.explanation,
  };
}

// ── Score banner ───────────────────────────────────────────────────────────────
function ScoreBanner({ totalScore, maxScore }: { totalScore: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const color = pct >= 70 ? "success" : pct >= 50 ? "warning" : "error";

  return (
    <Paper
      sx={{
        p: 3, mb: 3, textAlign: "center", borderRadius: 2,
        bgcolor: `${color}.light`, border: "1px solid", borderColor: `${color}.main`,
      }}
    >
      <CheckCircleOutlineIcon sx={{ fontSize: 40, color: `${color}.main`, mb: 1 }} />
      <Typography variant="h4" fontWeight={700} color={`${color}.main`}>
        {totalScore} / {maxScore}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {pct}% · {pct >= 70 ? "Great work!" : pct >= 50 ? "Good effort!" : "Keep practicing!"}
      </Typography>
    </Paper>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function TakeQuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate   = useNavigate();
  const quizIdNum  = Number(quizId);

  // Local state
  const [answers, setAnswers]           = useState<Record<number, string>>({});
  const [submitResult, setSubmitResult] = useState<QuizSubmitResult | null>(null);
  const [confirmOpen, setConfirmOpen]   = useState(false);

  // Queries / mutations
  const { data: quizData, isLoading, isError } = useStudentQuizDetail(quizIdNum);
  const startMutation   = useStartQuiz();
  const submitMutation  = useSubmitQuiz();
  const attemptsQuery   = useMyAttempts(quizIdNum);

  const quiz           = quizData?.quiz;
  const latestAttempt  = quiz?.latest_attempt;

  // Determine state
  const isInProgress = latestAttempt?.status === "in_progress";
  const isSubmitted  = submitResult !== null || latestAttempt?.status === "submitted";

  // Loading
  if (isLoading) {
    return (
      <DashboardLayout title="Loading Quiz…" breadcrumbs={[{ label: "My Quizzes", href: ROUTES.STUDENT.QUIZ_ASSIGNMENTS }]}>
        <NotebookPage>
          <Stack alignItems="center" py={8}><CircularProgress /></Stack>
        </NotebookPage>
      </DashboardLayout>
    );
  }

  if (isError || !quiz) {
    return (
      <DashboardLayout title="Not Found" breadcrumbs={[{ label: "My Quizzes", href: ROUTES.STUDENT.QUIZ_ASSIGNMENTS }]}>
        <NotebookPage>
          <Alert severity="error">Quiz not found or not available.</Alert>
        </NotebookPage>
      </DashboardLayout>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const questionCount = quiz.questions.length;

  // ── State A: Intro / Not started ──────────────────────────────────────────

  const renderIntro = () => (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, maxWidth: 600 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>{quiz.title}</Typography>
      <Stack spacing={1} sx={{ mb: 2.5 }}>
        {quiz.instructions && (
          <Typography variant="body2" color="text.secondary">{quiz.instructions}</Typography>
        )}
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={`${questionCount} questions`} size="small" />
          {quiz.time_limit_minutes && (
            <Chip label={`${quiz.time_limit_minutes} min limit`} size="small" color="warning" />
          )}
          {quiz.due_date && (
            <Chip label={`Due: ${new Date(quiz.due_date).toLocaleDateString()}`} size="small" />
          )}
          {quiz.allow_retake && <Chip label="Retakes allowed" size="small" color="success" />}
        </Stack>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Answer all questions and submit at the end. You will see your score immediately.
      </Typography>

      <Button
        variant="contained"
        size="large"
        onClick={() => startMutation.mutate(quizIdNum)}
        disabled={startMutation.isPending}
        startIcon={startMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
      >
        {startMutation.isPending ? "Starting…" : "Start Quiz"}
      </Button>
    </Paper>
  );

  // ── State B: In Progress ──────────────────────────────────────────────────

  const handleAnswer = (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = () => {
    const payload = Object.entries(answers).map(([qId, studentAnswer]) => ({
      questionId: Number(qId),
      studentAnswer,
    }));
    submitMutation.mutate(
      { quizId: quizIdNum, answers: payload },
      { onSuccess: (result) => setSubmitResult(result) }
    );
    setConfirmOpen(false);
  };

  const renderInProgress = () => (
    <Box>
      {/* Progress indicator */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {answeredCount} / {questionCount} answered
        </Typography>
        <Chip
          label={`${questionCount} questions`}
          size="small"
          color={answeredCount === questionCount ? "success" : "default"}
        />
      </Stack>

      {/* Questions — correct answers NOT revealed here */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        {quiz.questions.map((q, i) => {
          const qShape = toQuestion(q);
          const currentAnswer = answers[q.id];
          return (
            <Box key={q.id}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                Question {i + 1} of {questionCount}
              </Typography>
              {/* Use QuizQuestionCard without priorResult — correct answer stays hidden */}
              <QuizQuestionCard
                q={qShape}
                // No priorResult, no sessionResult — correct answer never in DOM
                onSubmit={(answer) => handleAnswer(q.id, answer)}
                sessionResult={currentAnswer
                  ? {
                      attemptId:     0,
                      questionId:    q.id,
                      studentAnswer: currentAnswer,
                      isCorrect:     null,      // not scored yet — just "recorded"
                      score:         null,
                      attemptCount:  1,
                      correctAnswer: "",         // intentionally empty — not revealed
                      explanation:   null,
                    }
                  : undefined}
                isPending={false}
                allowRetry={false}
              />
            </Box>
          );
        })}
      </Stack>

      {/* Submit button */}
      <Paper
        sx={{ p: 2, position: "sticky", bottom: 16, bgcolor: "background.paper",
              borderRadius: 2, border: "1px solid", borderColor: "divider" }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" color="text.secondary">
            {answeredCount === questionCount
              ? "All questions answered — ready to submit."
              : `${questionCount - answeredCount} question(s) unanswered.`}
          </Typography>
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={
              submitMutation.isPending
                ? <CircularProgress size={16} color="inherit" />
                : <SendOutlinedIcon />
            }
            disabled={answeredCount === 0 || submitMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {submitMutation.isPending ? "Submitting…" : "Submit Quiz"}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );

  // ── State C: Submitted / Result ───────────────────────────────────────────

  const renderResult = () => {
    // Use submitResult if available (just submitted), otherwise the quiz detail
    // has the latest_attempt with score
    const score    = submitResult?.totalScore ?? Number(latestAttempt?.score ?? 0);
    const maxScore = submitResult?.maxScore ?? Number(latestAttempt?.max_score ?? 0);

    // Build a map of per-question results from submitResult
    const resultMap = new Map<number, QuizAnswerResult>();
    if (submitResult) {
      for (const r of submitResult.answers) {
        resultMap.set(r.questionId, r);
      }
    }

    const attempts = attemptsQuery.data?.attempts ?? [];

    return (
      <Box>
        <ScoreBanner totalScore={score} maxScore={maxScore} />

        {/* Per-question results (only if we have submitResult from this session) */}
        {submitResult && (
          <Stack spacing={2} sx={{ mb: 3 }}>
            {quiz.questions.map((q) => {
              const qShape   = toQuestion(q);
              const r        = resultMap.get(q.id);
              const priorRes = r ? toAttemptResponse(r, q.id) : undefined;
              return (
                <QuizQuestionCard
                  key={q.id}
                  q={qShape}
                  priorResult={priorRes}
                  allowRetry={false}
                />
              );
            })}
          </Stack>
        )}

        {/* Previous attempts */}
        {attempts.length > 1 && (
          <Box sx={{ mb: 3 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              Attempt History
            </Typography>
            <Stack spacing={0.75}>
              {attempts.map((a) => (
                <Paper key={a.id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2">Attempt #{a.attempt_number}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {a.score !== null && a.max_score !== null && (
                        <Typography variant="body2" fontWeight={500}>
                          {Number(a.score)}/{Number(a.max_score)}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "In progress"}
                      </Typography>
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        {/* Action buttons */}
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate(ROUTES.STUDENT.QUIZ_ASSIGNMENTS)}
          >
            Back to My Quizzes
          </Button>
          {quiz.allow_retake && (
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={() => {
                setAnswers({});
                setSubmitResult(null);
                startMutation.mutate(quizIdNum);
              }}
              disabled={startMutation.isPending}
            >
              Retake Quiz
            </Button>
          )}
        </Stack>
      </Box>
    );
  };

  return (
    <DashboardLayout
      title={quiz.title}
      description={quiz.classroom_name ?? ""}
      breadcrumbs={[
        { label: "Dashboard", href: ROUTES.STUDENT.DASHBOARD },
        { label: "My Quizzes", href: ROUTES.STUDENT.QUIZ_ASSIGNMENTS },
        { label: quiz.title },
      ]}
    >
      <NotebookPage>
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(ROUTES.STUDENT.QUIZ_ASSIGNMENTS)}
          sx={{ mb: 2 }}
        >
          Back
        </Button>

        {/* Render the correct state */}
        {isSubmitted && renderResult()}
        {!isSubmitted && isInProgress && renderInProgress()}
        {!isSubmitted && !isInProgress && renderIntro()}
      </NotebookPage>

      {/* Submit confirmation dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Submit Quiz?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            You have answered <strong>{answeredCount}</strong> of <strong>{questionCount}</strong> questions.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
            Once submitted, your answers cannot be changed.
            {!quiz.allow_retake && " Retakes are not allowed."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
          >
            Confirm Submit
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}
