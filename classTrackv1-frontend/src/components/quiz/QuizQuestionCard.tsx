// src/components/quiz/QuizQuestionCard.tsx
//
// Sprint 6 — Reusable interactive quiz question card.
//
// Supports MCQ and True/False with proper radio-button semantics (accessible,
// keyboard-navigable, one selection at a time). Free-text types use a textarea.
//
// After submission:
//   - Input controls are disabled
//   - Correct/incorrect state is shown
//   - Correct answer is revealed
//   - Explanation is shown
//   - "Next Question" or "Try Again" controls are exposed

import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import type { Question } from "@/types/question";
import type { SubmitAttemptResponse } from "@/types/quizAttempt";

// ── Difficulty chip ────────────────────────────────────────────────────────────
function DiffChip({ difficulty }: { difficulty: string }) {
  const map: Record<string, "success" | "warning" | "error"> = {
    easy: "success", medium: "warning", hard: "hard" as "error",
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

// ── Props ──────────────────────────────────────────────────────────────────────
export interface QuizQuestionCardProps {
  /** The question to display */
  q: Question;
  /** Prior attempt result (pre-loaded from DB) — locks the card in submitted state */
  priorResult?: SubmitAttemptResponse | null;
  /** Whether to show a "Try Again" button after submission (practice mode) */
  allowRetry?: boolean;
  /** Called when the student clicks "Next Question" */
  onNext?: () => void;
  /** Called when the student clicks "Try Again" */
  onRetry?: () => void;
  /** Mutation state for the submit action */
  isPending?: boolean;
  /** Called with the selected answer when student submits */
  onSubmit?: (answer: string) => void;
  /** Result returned after submitting in this session */
  sessionResult?: SubmitAttemptResponse | null;
}

export function QuizQuestionCard({
  q,
  priorResult,
  allowRetry = false,
  onNext,
  onRetry,
  isPending = false,
  onSubmit,
  sessionResult,
}: QuizQuestionCardProps) {
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [freeText, setFreeText] = useState("");

  // Use session result if available; fall back to priorResult from DB
  const result = sessionResult ?? priorResult ?? null;
  const isSubmitted = result !== null;
  const isAutoScored = isSubmitted && result.isCorrect !== null;

  const isMcq = q.question_type === "mcq";
  const isTrueFalse = q.question_type === "true_false";
  const isChoice = isMcq || isTrueFalse;

  const hasAnswer = isChoice ? selectedOption !== "" : freeText.trim().length > 0;

  const handleSubmit = () => {
    if (!onSubmit) return;
    const answer = isChoice ? selectedOption : freeText.trim();
    if (!answer) return;
    onSubmit(answer);
  };

  const handleRetry = () => {
    setSelectedOption("");
    setFreeText("");
    if (onRetry) onRetry();
  };

  // ── Border color based on state ─────────────────────────────────────────────
  const borderColor = isSubmitted
    ? isAutoScored
      ? result.isCorrect
        ? "success.main"
        : "error.main"
      : "info.main"
    : "divider";

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 1.5, borderColor }}>
      {/* Header chips */}
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Chip
          label={q.question_type.replace(/_/g, " ")}
          size="small"
          variant="outlined"
          sx={{ fontSize: 11, textTransform: "capitalize" }}
        />
        <DiffChip difficulty={q.difficulty} />
        {q.marks && (
          <Chip
            label={`${q.marks} pt${Number(q.marks) !== 1 ? "s" : ""}`}
            size="small"
            sx={{ fontSize: 11 }}
          />
        )}
        {isSubmitted && isAutoScored && (
          result.isCorrect ? (
            <Chip
              icon={<CheckCircleOutlineIcon fontSize="small" />}
              label="Correct"
              color="success"
              size="small"
            />
          ) : (
            <Chip
              icon={<CancelOutlinedIcon fontSize="small" />}
              label="Incorrect"
              color="error"
              size="small"
            />
          )
        )}
        {isSubmitted && !isAutoScored && (
          <Chip label="Submitted — awaiting review" color="info" size="small" />
        )}
        {isSubmitted && result.attemptCount > 1 && (
          <Chip
            label={`Attempt #${result.attemptCount}`}
            size="small"
            variant="outlined"
            sx={{ fontSize: 11 }}
          />
        )}
      </Stack>

      {/* Question text */}
      <Typography variant="body1" fontWeight={500} sx={{ mb: 1.5 }}>
        {q.question_text}
      </Typography>

      {/* ── Input area (shown when not yet submitted) ─────────────────────── */}
      {!isSubmitted && (
        <>
          {isMcq && (
            <FormControl component="fieldset" fullWidth sx={{ mb: 1.5 }}>
              <RadioGroup
                value={selectedOption}
                onChange={(e) => setSelectedOption(e.target.value)}
              >
                {(q.options as string[]).map((option, i) => (
                  <FormControlLabel
                    key={i}
                    value={option}
                    disabled={isPending}
                    control={<Radio size="small" />}
                    label={
                      <Typography variant="body2">
                        <strong>{String.fromCharCode(65 + i)}.</strong>&nbsp;{option}
                      </Typography>
                    }
                    sx={{
                      border: "1px solid",
                      borderColor: selectedOption === option ? "primary.main" : "divider",
                      borderRadius: 1,
                      px: 1,
                      mb: 0.5,
                      mx: 0,
                      bgcolor: selectedOption === option ? "primary.50" : "transparent",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  />
                ))}
              </RadioGroup>
            </FormControl>
          )}

          {isTrueFalse && (
            <FormControl component="fieldset" sx={{ mb: 1.5 }}>
              <RadioGroup
                row
                value={selectedOption}
                onChange={(e) => setSelectedOption(e.target.value)}
              >
                {["true", "false"].map((v) => (
                  <FormControlLabel
                    key={v}
                    value={v}
                    disabled={isPending}
                    control={<Radio size="small" />}
                    label={<Typography variant="body2" sx={{ textTransform: "capitalize" }}>{v}</Typography>}
                    sx={{
                      border: "1px solid",
                      borderColor: selectedOption === v ? "primary.main" : "divider",
                      borderRadius: 1,
                      px: 1.5,
                      mr: 1,
                      bgcolor: selectedOption === v ? "primary.50" : "transparent",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  />
                ))}
              </RadioGroup>
            </FormControl>
          )}

          {!isMcq && !isTrueFalse && (
            <TextField
              fullWidth
              multiline={["short_answer", "descriptive", "scenario", "matching"].includes(q.question_type)}
              rows={["short_answer", "descriptive", "scenario", "matching"].includes(q.question_type) ? 3 : 1}
              size="small"
              placeholder="Type your answer…"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              disabled={isPending}
              sx={{ mb: 1.5 }}
            />
          )}

          <Button
            variant="contained"
            size="small"
            startIcon={
              isPending
                ? <CircularProgress size={14} color="inherit" />
                : <SendOutlinedIcon fontSize="small" />
            }
            onClick={handleSubmit}
            disabled={!hasAnswer || isPending || !onSubmit}
          >
            {isPending ? "Submitting…" : "Submit Answer"}
          </Button>
        </>
      )}

      {/* ── Result area (shown after submission) ─────────────────────────── */}
      {isSubmitted && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Your answer:{" "}
            <Box component="strong" sx={{ color: isAutoScored ? (result.isCorrect ? "success.main" : "error.main") : "text.primary" }}>
              {result.studentAnswer}
            </Box>
          </Typography>

          <Divider sx={{ my: 1.5 }} />

          <Typography variant="body2" color="success.dark" fontWeight={600} sx={{ mb: 0.5 }}>
            ✓ Correct answer: {result.correctAnswer}
          </Typography>

          {result.explanation && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
              <em>{result.explanation}</em>
            </Typography>
          )}

          {isAutoScored && (
            <Typography
              variant="body2"
              fontWeight={600}
              color={result.isCorrect ? "success.main" : "error.main"}
              sx={{ mb: 1.5 }}
            >
              Score: {result.score} / {q.marks}
            </Typography>
          )}

          <Stack direction="row" spacing={1} flexWrap="wrap">
            {allowRetry && (
              <Button size="small" variant="outlined" onClick={handleRetry}>
                Try Again
              </Button>
            )}
            {onNext && (
              <Button
                size="small"
                variant="contained"
                endIcon={<ArrowForwardIcon fontSize="small" />}
                onClick={onNext}
              >
                Next Question
              </Button>
            )}
          </Stack>
        </>
      )}
    </Paper>
  );
}
