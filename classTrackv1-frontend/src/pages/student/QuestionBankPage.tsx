// src/pages/student/QuestionBankPage.tsx
//
// Student Question Bank — Sprint 3 + Sprint 4 + Sprint 6
//
// This page shows:
//   1. "My Generated Questions" — questions this student generated that are
//      pending teacher approval (status = pending_approval / approved / rejected).
//      These are NOT practice questions — they entered the teacher's review flow.
//
//   2. "Published Questions" — teacher-approved + published questions for a topic.
//      Students can attempt these using the QuizQuestionCard component.
//
// Sprint 6 change:
//   - Student AI Practice questions (status = 'practice') now live at /student/practice.
//   - The "My Questions" section no longer shows 'practice' status questions.
//   - The AttemptQuestionCard is replaced with the reusable QuizQuestionCard.
//   - MCQ options now use radio buttons (fixes the "plain text options" bug).
//   - "Show Answer" button removed. Answer revealed only after submission.

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage, NotebookCard } from "@components/notebook";
import { QuizQuestionCard } from "@components/quiz/QuizQuestionCard";
import {
  useMyQuestions,
  usePublishedQuestions,
  useSubmitAttempt,
  useMyAttempts,
} from "@features/questions/hooks/useQuestions";
import { ROUTES } from "@utils/constants";
import type { Question, QuestionStatus } from "@/types/question";
import type { SubmitAttemptResponse } from "@/types/quizAttempt";

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
    practice:         "info",
  };
  const labels: Record<QuestionStatus, string> = {
    generated:        "Generated",
    validated:        "Validated",
    pending_approval: "Pending Approval",
    approved:         "Approved",
    published:        "Published",
    rejected:         "Rejected",
    archived:         "Archived",
    practice:         "AI Practice",
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
    <Chip
      label={difficulty}
      color={map[difficulty] ?? "default"}
      size="small"
      variant="outlined"
      sx={{ textTransform: "capitalize", fontSize: 11 }}
    />
  );
}

// ── My question card (teacher-review lifecycle questions only) ─────────────────
// Shows pending/approved/rejected status but NO interactive quiz UI.
// The student submitted these for teacher review — they can see the status.
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
              {i + 1}. {p.left} ⇔ {p.right}
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
    "warning.main";

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 1.5, borderColor }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
        <Chip label={q.question_type.replace(/_/g, " ")} size="small" variant="outlined" sx={{ fontSize: 11 }} />
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

      {/* Answer preview is only relevant for the student's reference */}
      <Button size="small" sx={{ mt: 1 }} onClick={() => setShowAnswer((v) => !v)}>
        {showAnswer ? "Hide Answer" : "Preview Answer"}
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

// ── Score summary bar ─────────────────────────────────────────────────────────
function TopicScoreSummary({
  published,
  attemptsMap,
}: {
  published: Question[];
  attemptsMap: Map<number, SubmitAttemptResponse>;
}) {
  if (!published.length) return null;

  const attempted  = published.filter((q) => attemptsMap.has(q.id)).length;
  const correct    = published.filter((q) => attemptsMap.get(q.id)?.isCorrect === true).length;
  const autoScored = published.filter((q) => {
    const r = attemptsMap.get(q.id);
    return r !== undefined && r.isCorrect !== null;
  }).length;

  if (!attempted) return null;

  const pct = autoScored > 0 ? Math.round((correct / autoScored) * 100) : null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <Typography variant="body2" fontWeight={600}>Progress:</Typography>
        <Chip label={`${attempted} / ${published.length} attempted`} size="small" />
        {pct !== null && (
          <Chip
            label={`${correct} / ${autoScored} correct (${pct}%)`}
            size="small"
            color={pct >= 80 ? "success" : pct >= 50 ? "warning" : "error"}
          />
        )}
      </Stack>
      {pct !== null && (
        <LinearProgress
          variant="determinate"
          value={pct}
          color={pct >= 80 ? "success" : pct >= 50 ? "warning" : "error"}
          sx={{ mt: 1, borderRadius: 1, height: 6 }}
        />
      )}
    </Paper>
  );
}

// ── Published questions section ───────────────────────────────────────────────
// Uses the reusable QuizQuestionCard with radio buttons for MCQ.
function PublishedQuestionsSection({
  topicId,
  topicIdNum,
}: {
  topicId: string;
  topicIdNum: number;
}) {
  const publishedQuery  = usePublishedQuestions(topicIdNum);
  const myAttemptsQuery = useMyAttempts(topicIdNum);
  const submitMutation  = useSubmitAttempt();

  // Session results (not yet persisted to server cache)
  const [sessionResults, setSessionResults] = useState<Map<number, SubmitAttemptResponse>>(
    new Map()
  );

  // Build prior-attempt map from the DB-fetched attempts
  const priorAttemptMap = new Map(
    (myAttemptsQuery.data?.attempts ?? []).map((a) => [
      a.question_id,
      {
        attemptId:     a.id,
        questionId:    a.question_id,
        studentAnswer: a.student_answer,
        isCorrect:     a.is_correct,
        score:         a.score !== null ? Number(a.score) : null,
        attemptCount:  a.attempt_count,
        correctAnswer: a.correct_answer,
        explanation:   a.explanation,
      } as SubmitAttemptResponse,
    ])
  );

  // Merge session results on top of prior results
  const effectiveResults = new Map([...priorAttemptMap, ...sessionResults]);

  const publishedQuestions = publishedQuery.data?.questions ?? [];

  const handleSubmit = (questionId: number, answer: string) => {
    submitMutation.mutate(
      { questionId, studentAnswer: answer },
      {
        onSuccess: (result) => {
          setSessionResults((prev) => new Map(prev).set(questionId, result));
        },
      }
    );
  };

  const handleRetry = (questionId: number) => {
    setSessionResults((prev) => {
      const next = new Map(prev);
      next.delete(questionId);
      return next;
    });
  };

  return (
    <Accordion
      defaultExpanded
      elevation={0}
      sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}
    >
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
          <Stack alignItems="center" py={2}>
            <CircularProgress size={24} />
          </Stack>
        )}
        {!publishedQuery.isLoading && publishedQuestions.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
            No published questions for this topic yet.
          </Typography>
        )}
        {publishedQuestions.length > 0 && (
          <TopicScoreSummary
            published={publishedQuestions}
            attemptsMap={effectiveResults}
          />
        )}
        {publishedQuestions.map((q) => (
          <QuizQuestionCard
            key={q.id}
            q={q}
            priorResult={priorAttemptMap.get(q.id) ?? null}
            sessionResult={sessionResults.get(q.id) ?? null}
            allowRetry={true}
            isPending={submitMutation.isPending}
            onSubmit={(answer) => handleSubmit(q.id, answer)}
            onRetry={() => handleRetry(q.id)}
          />
        ))}
      </AccordionDetails>
    </Accordion>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StudentQuestionBankPage() {
  const [topicId, setTopicId] = useState<string>("");
  const navigate = useNavigate();

  const topicIdNum = topicId ? Number(topicId) : undefined;

  // Only fetch student-generated questions that are in the teacher review lifecycle
  // (status IN: pending_approval, approved, rejected — NOT practice or published)
  const myQuestionsQuery = useMyQuestions(topicIdNum);

  const pendingAndApproved = (myQuestionsQuery.data?.questions ?? []).filter(
    (q) => !["published", "archived", "practice"].includes(q.status)
  );

  return (
    <DashboardLayout
      title="Question Bank"
      description="View published questions from your teacher and attempt them for practice."
      breadcrumbs={[
        { label: "Dashboard", href: "/student/dashboard" },
        { label: "Question Bank" },
      ]}
    >
      <NotebookPage>

        {/* ── Banner: redirect to AI Practice ─────────────────────────────── */}
        <NotebookCard sx={{ mb: 3, bgcolor: "primary.50", borderColor: "primary.200" }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <ScienceOutlinedIcon color="primary" fontSize="small" />
                <Typography variant="subtitle2" fontWeight={700} color="primary">
                  Want to practice with AI?
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Use <strong>Practice with AI</strong> to generate private AI practice questions
                from your knowledge base. Your practice sessions are private to you and do not go
                to your teacher.
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => navigate(ROUTES.STUDENT.PRACTICE)}
              sx={{ whiteSpace: "nowrap" }}
            >
              Practice with AI
            </Button>
          </Stack>
        </NotebookCard>

        {/* ── Topic filter ─────────────────────────────────────────────────── */}
        <NotebookCard title="Browse by Topic" sx={{ mb: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
            <Box
              component="input"
              type="number"
              placeholder="Enter Topic ID"
              value={topicId}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopicId(e.target.value)}
              min={1}
              style={{
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 14,
                width: 160,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Enter the topic ID to load published questions and your question history.
            </Typography>
          </Stack>
        </NotebookCard>

        {/* ── My generated questions (teacher review lifecycle) ────────────── */}
        {topicId && (
          <NotebookCard
            title={
              myQuestionsQuery.isLoading
                ? "My Questions (loading…)"
                : `My Questions in Teacher Review (${pendingAndApproved.length})`
            }
            subtitle="Questions you submitted for teacher review. Status updates as your teacher reviews them."
            sx={{ mb: 3 }}
          >
            {myQuestionsQuery.isLoading && (
              <Stack alignItems="center" py={2}>
                <CircularProgress size={24} />
              </Stack>
            )}
            {myQuestionsQuery.isError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                Failed to load your questions. Please refresh.
              </Alert>
            )}
            {!myQuestionsQuery.isLoading && pendingAndApproved.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                No questions in the teacher review queue for this topic.
                {" "}Visit <strong>Practice with AI</strong> to generate private practice questions.
              </Typography>
            )}
            {pendingAndApproved.map((q) => (
              <MyQuestionCard key={q.id} q={q} />
            ))}
          </NotebookCard>
        )}

        {/* ── Published questions with interactive quiz UI ──────────────────── */}
        {topicIdNum && (
          <PublishedQuestionsSection
            topicId={topicId}
            topicIdNum={topicIdNum}
          />
        )}
      </NotebookPage>
    </DashboardLayout>
  );
}
