// src/pages/student/QuizAssignmentsPage.tsx
//
// Sprint 7 — Student: My Assigned Quizzes
// Lists all published quiz assignments for the student's classroom.

import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookPage } from "@components/notebook";
import { useStudentQuizzes } from "@features/quizAssignments/hooks/useQuizAssignments";
import { ROUTES } from "@utils/constants";
import type { AttemptStatus, StudentQuizView } from "@/types/quizAssignment";

// ── Attempt status chip ────────────────────────────────────────────────────────
function AttemptChip({ status, allowRetake }: { status?: AttemptStatus; allowRetake: boolean }) {
  if (!status) {
    return <Chip label="Not Started" size="small" color="default" sx={{ fontSize: 11 }} />;
  }
  if (status === "in_progress") {
    return <Chip label="In Progress" size="small" color="info" sx={{ fontSize: 11 }} />;
  }
  // submitted
  if (allowRetake) {
    return <Chip label="Submitted · Retake Available" size="small" color="success" sx={{ fontSize: 11 }} />;
  }
  return <Chip label="Submitted" size="small" color="success" sx={{ fontSize: 11 }} />;
}

export default function StudentQuizAssignmentsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useStudentQuizzes();
  const quizzes: StudentQuizView[] = (data?.quizzes as StudentQuizView[]) ?? [];

  return (
    <DashboardLayout
      title="My Quizzes"
      description="Quiz assignments from your teacher."
      breadcrumbs={[
        { label: "Dashboard", href: ROUTES.STUDENT.DASHBOARD },
        { label: "My Quizzes" },
      ]}
    >
      <NotebookPage>
        {isLoading && (
          <Stack alignItems="center" py={6}><CircularProgress size={32} /></Stack>
        )}

        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>Failed to load quizzes. Please refresh.</Alert>
        )}

        {!isLoading && quizzes.length === 0 && (
          <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 2 }}>
            <QuizOutlinedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No quizzes assigned yet. Check back later.
            </Typography>
          </Paper>
        )}

        {!isLoading && quizzes.length > 0 && (
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell><strong>Quiz</strong></TableCell>
                  <TableCell><strong>Classroom</strong></TableCell>
                  <TableCell align="center"><strong>Questions</strong></TableCell>
                  <TableCell align="center"><strong>Status</strong></TableCell>
                  <TableCell align="center"><strong>Score</strong></TableCell>
                  <TableCell><strong>Due Date</strong></TableCell>
                  <TableCell align="right"></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quizzes.map((q) => (
                  <TableRow
                    key={q.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(ROUTES.STUDENT.TAKE_QUIZ(q.id))}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{q.title}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{q.classroom_name}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">{Number(q.question_count)}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <AttemptChip
                        status={q.attempt_status}
                        allowRetake={q.allow_retake}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {q.attempt_status === "submitted" && q.attempt_score !== null && q.attempt_max_score
                        ? <Typography variant="body2">{Number(q.attempt_score)}/{Number(q.attempt_max_score)}</Typography>
                        : <Typography variant="body2" color="text.disabled">—</Typography>
                      }
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {q.due_date ? new Date(q.due_date).toLocaleDateString() : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="small"
                        variant="contained"
                        endIcon={<OpenInNewOutlinedIcon fontSize="small" />}
                        onClick={() => navigate(ROUTES.STUDENT.TAKE_QUIZ(q.id))}
                      >
                        {q.attempt_status === "in_progress" ? "Continue" : q.attempt_status === "submitted" ? "View" : "Start"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </NotebookPage>
    </DashboardLayout>
  );
}
