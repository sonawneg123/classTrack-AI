// src/pages/student/PracticePage.tsx
//
// Sprint 6 — Student AI Practice (updated Sprint 7)
// A completely separate experience from the teacher-managed Question Bank.
//
// Flow:
//   1. Student browses Curriculum → Subject → Chapter → Topic via the
//      StudentCurriculumNavigator (calls /student/knowledge/* endpoints,
//      NOT the teacher-only /knowledge/* endpoints).
//   2. Student selects type, difficulty, count.
//   3. Clicks "Generate Practice".
//   4. Questions appear inline, one at a time.
//   5. Student selects/types an answer and submits.
//   6. Instant correctness feedback + explanation revealed.
//   7. "Next Question" moves to the next card.
//
// These questions are:
//   - Marked as "AI Practice" (status = 'practice')
//   - NOT sent to the teacher's approval queue
//   - NOT visible in the teacher's assignment pool
//   - Private to this student

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormHelperText,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage, NotebookCard } from "@components/notebook";
import { EmptyState } from "@components/feedback/EmptyState";
import { QuizQuestionCard } from "@components/quiz/QuizQuestionCard";
import { StudentCurriculumNavigator } from "@components/curriculum/StudentCurriculumNavigator";
import type { TopicSelection } from "@components/curriculum/StudentCurriculumNavigator";
import {
  useGeneratePractice,
  useSubmitPracticeAttempt,
} from "@features/practice/hooks/usePractice";
import type { Question, QuestionType, QuestionDifficulty } from "@/types/question";
import type { SubmitAttemptResponse } from "@/types/quizAttempt";

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

// ── AI generation progress animation ──────────────────────────────────────────
// Shows an animated indeterminate progress bar + descriptive steps while the
// AI is generating questions. This replaces the single spinner icon so the
// student knows the system is working.

// ── AI generation stage-based progress ───────────────────────────────────────
// Represents real backend stages in the RAG pipeline.
// Steps advance every ~2.5 s to avoid misleading fake percentages.
// The actual request lifecycle controls visibility — progress hides on success/error.

const GENERATION_STAGE_LABELS = [
  "Understanding selected topic",
  "Searching learning material",
  "Building practice questions",
  "Checking question quality",
];

// Approximate wall-clock time each stage takes (used to advance stepper)
const STAGE_DURATIONS_MS = [800, 4000, 8000, 2000];

function GenerationProgress({ topicName }: { topicName: string | null }) {
  const [activeStep, setActiveStep] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stepIdx = 0;
    // Advance through stages based on approximate durations
    function advance() {
      stepIdx++;
      if (stepIdx < GENERATION_STAGE_LABELS.length) {
        setActiveStep(stepIdx);
        const delay = STAGE_DURATIONS_MS[stepIdx] ?? 3000;
        intervalRef.current = setTimeout(advance, delay);
      }
    }
    intervalRef.current = setTimeout(advance, STAGE_DURATIONS_MS[0]);
    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, []);

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <AutoAwesomeIcon color="primary" sx={{ fontSize: 24 }} />
        <Typography variant="subtitle2" fontWeight={700}>
          Generating AI Practice Questions
        </Typography>
      </Stack>
      {topicName && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          Topic: <strong>{topicName}</strong>
        </Typography>
      )}

      {/* Stage stepper — real backend stages */}
      <Stepper activeStep={activeStep} orientation="vertical" sx={{ mb: 2 }}>
        {GENERATION_STAGE_LABELS.map((label, idx) => (
          <Step key={label} completed={idx < activeStep}>
            <StepLabel
              optional={
                idx === activeStep ? (
                  <Typography variant="caption" color="primary">
                    In progress…
                  </Typography>
                ) : null
              }
            >
              <Typography variant="body2" fontWeight={idx === activeStep ? 700 : 400}>
                Step {idx + 1}: {label}
              </Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      <LinearProgress sx={{ borderRadius: 1, height: 4 }} color="primary" />

      {/* Skeleton placeholders */}
      <Stack spacing={1} sx={{ mt: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={36} animation="wave" />
        ))}
      </Stack>
    </Paper>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function PracticeProgress({
  total,
  answered,
  correct,
}: {
  total: number;
  answered: number;
  correct: number;
}) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  const scorePct = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
        <Typography variant="body2" fontWeight={600}>
          Progress:
        </Typography>
        <Chip label={`${answered} / ${total} answered`} size="small" />
        {answered > 0 && (
          <Chip
            label={`${correct} correct (${scorePct}%)`}
            size="small"
            color={scorePct >= 80 ? "success" : scorePct >= 50 ? "warning" : "error"}
          />
        )}
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={scorePct >= 80 ? "success" : scorePct >= 50 ? "warning" : "error"}
        sx={{ height: 6, borderRadius: 1 }}
      />
    </Paper>
  );
}

// ── All questions finished banner ─────────────────────────────────────────────
function SessionComplete({
  total,
  correct,
  onGenerateMore,
}: {
  total: number;
  correct: number;
  onGenerateMore: () => void;
}) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return (
    <Paper variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: 2 }}>
      <CheckCircleOutlineIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
      <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
        Practice Session Complete!
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        You answered {total} question{total !== 1 ? "s" : ""} and scored {correct} correct ({pct}%).
      </Typography>
      <Button variant="contained" startIcon={<AutoAwesomeIcon />} onClick={onGenerateMore}>
        Generate More Practice
      </Button>
    </Paper>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function PracticePage() {
  // ── Form state ───────────────────────────────────────────────────────────────
  const [topic, setTopic]           = useState<TopicSelection | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [difficulty, setDifficulty]   = useState<QuestionDifficulty>("medium");
  const [count, setCount]             = useState<number>(5);

  // ── Practice session state ────────────────────────────────────────────────────
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex]         = useState(0);
  const [results, setResults]                   = useState<Map<number, SubmitAttemptResponse>>(new Map());

  const generateMutation = useGeneratePractice();
  const submitMutation   = useSubmitPracticeAttempt();

  // ── Session stats ─────────────────────────────────────────────────────────────
  const answered   = results.size;
  const correct    = Array.from(results.values()).filter((r) => r.isCorrect === true).length;
  const sessionDone = sessionQuestions.length > 0 && currentIndex >= sessionQuestions.length;

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleGenerate = () => {
    if (!topic) return;

    generateMutation.mutate(
      {
        topicId:      topic.topicId,
        questionType,
        difficulty,
        count,
      },
      {
        onSuccess: (data) => {
          if (data.questions.length > 0) {
            setSessionQuestions(data.questions);
            setCurrentIndex(0);
            setResults(new Map());
          }
        },
      }
    );
  };

  const handleSubmit = useCallback(
    (questionId: number, answer: string) => {
      submitMutation.mutate(
        { questionId, studentAnswer: answer },
        {
          onSuccess: (result) => {
            setResults((prev) => new Map(prev).set(questionId, result));
          },
        }
      );
    },
    [submitMutation]
  );

  const handleNext = () => {
    setCurrentIndex((i) => i + 1);
  };

  const handleRetry = (questionId: number) => {
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(questionId);
      return next;
    });
  };

  const handleGenerateMore = () => {
    setSessionQuestions([]);
    setCurrentIndex(0);
    setResults(new Map());
    generateMutation.reset();
  };

  const currentQuestion = sessionQuestions[currentIndex] ?? null;

  return (
    <DashboardLayout
      title="Practice with AI"
      description="Generate personalised AI practice questions from your syllabus. Results are private to you."
      breadcrumbs={[
        { label: "Dashboard", href: "/student/dashboard" },
        { label: "Practice with AI" },
      ]}
    >
      <NotebookPage>
        {/* ── Label: AI Practice (not an assignment) ─────────────────────── */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <ScienceOutlinedIcon color="primary" />
          <Typography variant="subtitle2" color="primary" fontWeight={700}>
            AI Practice Mode
          </Typography>
          <Chip
            label="Private to you"
            size="small"
            color="info"
            variant="outlined"
            sx={{ fontSize: 11 }}
          />
          <Chip
            label="Not graded"
            size="small"
            color="default"
            variant="outlined"
            sx={{ fontSize: 11 }}
          />
        </Stack>

        {/* ── Generation form ───────────────────────────────────────────────── */}
        <NotebookCard title="Generate Practice Questions" sx={{ mb: 3 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* ── Topic selector ─────────────────────────────────────────── */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <TuneIcon fontSize="small" color="primary" />
                <Typography variant="body2" fontWeight={600}>
                  Select a topic
                </Typography>
              </Stack>
              <StudentCurriculumNavigator
                onTopicSelect={setTopic}
                disabled={generateMutation.isPending}
              />
              {topic && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: "block" }}
                >
                  Selected: <strong>{topic.topicName}</strong>
                </Typography>
              )}
            </Box>

            {/* ── Question options ───────────────────────────────────────── */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Question Type</InputLabel>
                <Select
                  label="Question Type"
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                  disabled={generateMutation.isPending}
                >
                  {QUESTION_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>
                      {t.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Difficulty</InputLabel>
                <Select
                  label="Difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
                  disabled={generateMutation.isPending}
                >
                  {DIFFICULTIES.map((d) => (
                    <MenuItem key={d.value} value={d.value}>
                      {d.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Count</InputLabel>
                <Select
                  label="Count"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  disabled={generateMutation.isPending}
                >
                  {[1, 3, 5, 10, 15].map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>Max 15</FormHelperText>
              </FormControl>
            </Stack>

            <Box>
              <Button
                variant="contained"
                startIcon={
                  generateMutation.isPending ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <AutoAwesomeIcon />
                  )
                }
                onClick={handleGenerate}
                disabled={!topic || generateMutation.isPending}
              >
                {generateMutation.isPending ? "Generating…" : "Generate Practice"}
              </Button>
            </Box>

            {generateMutation.isError && (
              <Alert
                severity="error"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={handleGenerate}
                  >
                    Retry
                  </Button>
                }
              >
                {(generateMutation.error as Error)?.message ?? "Generation failed. Please try again."}
              </Alert>
            )}

            {generateMutation.isSuccess && sessionQuestions.length === 0 && (
              /* Distinguish INSUFFICIENT_CONTEXT from generic empty result */
              generateMutation.data?.code === "INSUFFICIENT_CONTEXT" ? (
                <Alert
                  severity="info"
                  icon={<ScienceOutlinedIcon fontSize="inherit" />}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      startIcon={<RefreshIcon />}
                      onClick={handleGenerate}
                    >
                      Try Again
                    </Button>
                  }
                >
                  <strong>No relevant learning material was found for this topic.</strong>
                  <br />
                  Ask your teacher to upload more material for this topic, then try again.
                </Alert>
              ) : (
                <Alert severity="warning">
                  No new questions were generated. This topic may have no uploaded
                  knowledge base content, or all questions were duplicates.
                </Alert>
              )
            )}
          </Stack>
        </NotebookCard>

        {/* ── AI generation progress ──────────────────────────────────────── */}
        {generateMutation.isPending && (
          <GenerationProgress topicName={topic?.topicName ?? null} />
        )}

        {/* ── Practice session ─────────────────────────────────────────────── */}
        {!generateMutation.isPending && sessionQuestions.length > 0 && (
          <>
            {/* Progress bar */}
            <PracticeProgress
              total={sessionQuestions.length}
              answered={answered}
              correct={correct}
            />

            {/* Session complete */}
            {sessionDone ? (
              <SessionComplete
                total={sessionQuestions.length}
                correct={correct}
                onGenerateMore={handleGenerateMore}
              />
            ) : (
              currentQuestion && (
                <>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 1, fontWeight: 600 }}
                  >
                    Question {currentIndex + 1} of {sessionQuestions.length}
                  </Typography>

                  <QuizQuestionCard
                    key={currentQuestion.id}
                    q={currentQuestion}
                    allowRetry={true}
                    isPending={submitMutation.isPending}
                    onSubmit={(answer) => handleSubmit(currentQuestion.id, answer)}
                    sessionResult={results.get(currentQuestion.id) ?? null}
                    onNext={
                      results.has(currentQuestion.id)
                        ? handleNext
                        : undefined
                    }
                    onRetry={
                      results.has(currentQuestion.id)
                        ? () => handleRetry(currentQuestion.id)
                        : undefined
                    }
                  />
                </>
              )
            )}
          </>
        )}

        {/* ── No topic selected (initial state) ───────────────────────────── */}
        {!generateMutation.isPending && sessionQuestions.length === 0 && !generateMutation.isError && !generateMutation.isSuccess && (
          <NotebookCard>
            <EmptyState
              icon={<ScienceOutlinedIcon fontSize="inherit" />}
              title="Choose a topic to get started"
              description="Select Curriculum → Subject → Chapter → Topic above, then click Generate Practice."
            />
          </NotebookCard>
        )}
      </NotebookPage>
    </DashboardLayout>
  );
}
