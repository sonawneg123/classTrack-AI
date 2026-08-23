/**
 * src/pages/teacher/PendingEvaluationsPage.tsx
 *
 * Teacher Pending Evaluations — cross-classroom view of all submissions
 * that require attention (status 'submitted', 'analyzing', or 'failed'
 * with no teacher score yet).
 *
 * Backed by: GET /teacher/pending-evaluations  (new endpoint)
 *
 * Clicking a row navigates to the existing SubmissionDetailPage:
 *   /teacher/submissions/:submissionId
 */
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import AssignmentLateOutlinedIcon from "@mui/icons-material/AssignmentLateOutlined";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookCard } from "@components/notebook";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import { ErrorBoundary } from "@components/feedback/ErrorBoundary";
import { usePendingEvaluations } from "@features/teacher/hooks/usePendingEvaluations";
import { ROUTES } from "@utils/constants";
import type { PendingEvaluation } from "@/types/grading";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusChip({ status }: { status: PendingEvaluation["status"] }) {
  if (status === "submitted") {
    return (
      <Chip
        label="Awaiting AI"
        size="small"
        color="info"
        icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: 13 }} />}
      />
    );
  }
  if (status === "analyzing") {
    return (
      <Chip
        label="AI Analyzing…"
        size="small"
        color="warning"
        icon={<CircularProgress size={12} />}
      />
    );
  }
  if (status === "analyzed") {
    return (
      <Chip
        label="Awaiting Review"
        size="small"
        color="success"
        icon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 13 }} />}
      />
    );
  }
  // failed
  return (
    <Chip
      label="Analysis Failed"
      size="small"
      color="error"
      icon={<ErrorOutlineIcon sx={{ fontSize: 13 }} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const CRUMBS = [
  { label: "Dashboard", href: ROUTES.TEACHER.DASHBOARD },
  { label: "Pending Evaluations" },
];

export default function PendingEvaluationsPage() {
  const { data, isLoading, isError, error } = usePendingEvaluations();

  const submissions = data?.submissions ?? [];

  return (
    <DashboardLayout
      title="Pending Evaluations"
      description="Student submissions that have not yet been fully evaluated. Click a row to review."
      breadcrumbs={CRUMBS}
    >
      <ErrorBoundary section="pending evaluations">
        {isError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {(error as Error)?.message ?? "Failed to load pending evaluations."}
          </Alert>
        )}

        {isLoading ? (
          <NotebookCard>
            <LoadingSkeleton variant="list" rows={6} />
          </NotebookCard>
        ) : submissions.length === 0 ? (
          <NotebookCard>
            <EmptyState
              icon={<AutoAwesomeOutlinedIcon fontSize="inherit" />}
              title="No pending evaluations"
              description="All submissions across your classrooms have been evaluated. Great work!"
            />
          </NotebookCard>
        ) : (
          <NotebookCard disablePadding>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Assignment</TableCell>
                    <TableCell>Classroom</TableCell>
                    <TableCell>Student</TableCell>
                    <TableCell align="center">Attempt</TableCell>
                    <TableCell align="center">AI Status</TableCell>
                    <TableCell align="center">AI Score</TableCell>
                    <TableCell>Submitted</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {submissions.map((sub) => (
                    <SubmissionRow key={sub.id} sub={sub} />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Summary footer */}
            <Box
              sx={{
                px: 2,
                py: 1.25,
                borderTop: "1px solid",
                borderColor: "divider",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <AssignmentLateOutlinedIcon fontSize="small" color="warning" />
              <Typography variant="caption" color="text.secondary">
                {submissions.length} submission{submissions.length !== 1 ? "s" : ""} pending evaluation
              </Typography>
            </Box>
          </NotebookCard>
        )}
      </ErrorBoundary>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function SubmissionRow({ sub }: { sub: PendingEvaluation }) {
  const navigate = useNavigate();
  const detailPath = ROUTES.TEACHER.SUBMISSION_DETAIL(sub.id);

  return (
    <TableRow
      hover
      sx={{ cursor: "pointer" }}
      onClick={() => navigate(detailPath)}
    >
      <TableCell>
        <Typography variant="body2" fontWeight={600}>
          {sub.task_title}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {sub.classroom_name}
        </Typography>
      </TableCell>
      <TableCell>
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {sub.student_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
            {sub.student_username}
          </Typography>
        </Box>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2">#{sub.attempt_number}</Typography>
      </TableCell>
      <TableCell align="center">
        <StatusChip status={sub.status} />
      </TableCell>
      <TableCell align="center">
        {sub.ai_score !== null && sub.ai_score !== undefined ? (
          <Typography variant="body2">{sub.ai_score}</Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">—</Typography>
        )}
      </TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(sub.submitted_at)}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Tooltip title="Open submission detail">
          <IconButton
            size="small"
            color="primary"
            component={RouterLink}
            to={detailPath}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}
