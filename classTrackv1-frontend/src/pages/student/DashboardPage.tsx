/**
 * src/pages/student/DashboardPage.tsx
 *
 * Student Dashboard — notebook-themed redesign.
 * Backed entirely by GET /student/tasks (existing endpoint, no new backend call).
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookCard, NotebookStatCard, NotebookPage } from "@components/notebook";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import { useAuth } from "@app/AuthProvider";
import { useMyAssignments } from "@features/student/hooks/useMyAssignments";
import { ROUTES } from "@utils/constants";
import type { StudentAssignment } from "@/types/studentAssignment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null): string {
  if (!d) return "No due date";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSubStatusChip(
  status: NonNullable<StudentAssignment["submission_status"]>,
  aiEnabled: number
): { label: string; color: "info" | "success" | "warning" | "error" | "default" } {
  if (status === "submitted" && !aiEnabled) {
    return { label: "Awaiting review", color: "info" };
  }
  const map: Record<
    NonNullable<StudentAssignment["submission_status"]>,
    { label: string; color: "info" | "success" | "warning" | "error" | "default" }
  > = {
    submitted: { label: "Submitted", color: "info" },
    analyzing: { label: "AI Analyzing…", color: "warning" },
    analyzed: { label: "Graded", color: "success" },
    failed: { label: "Analysis Failed", color: "error" },
  };
  return map[status];
}

// ---------------------------------------------------------------------------
// Recent activity list
// ---------------------------------------------------------------------------
function RecentActivityList({ assignments }: { assignments: StudentAssignment[] }) {
  const navigate = useNavigate();
  const recent = useMemo(
    () => assignments.filter((a) => a.submission_id !== null).slice(0, 6),
    [assignments]
  );

  if (recent.length === 0) {
    return (
      <EmptyState
        icon={<AutoAwesomeOutlinedIcon fontSize="inherit" />}
        title="No submissions yet"
        description="Submit your first assignment to see activity here."
      />
    );
  }

  return (
    <List disablePadding>
      {recent.map((a) => {
        const sub = a.submission_status ?? "submitted";
        const chip = getSubStatusChip(sub, a.ai_evaluation_enabled);
        return (
          <ListItem
            key={a.id}
            divider
            sx={{ py: 1.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
            onClick={() => navigate(ROUTES.STUDENT.ASSIGNMENT_DETAIL(a.id))}
          >
            <ListItemText
              primary={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" fontWeight={600}>
                    {a.title}
                  </Typography>
                  <Chip
                    size="small"
                    label={chip.label}
                    color={chip.color}
                    variant="outlined"
                  />
                </Box>
              }
              secondary={
                <Typography variant="caption" color="text.secondary">
                  {a.effective_score !== null
                    ? `Score: ${a.effective_score} / ${a.max_score}`
                    : "Awaiting result"}
                  {a.teacher_score !== null ? " · Teacher scored" : ""}
                </Typography>
              }
            />
          </ListItem>
        );
      })}
    </List>
  );
}

// ---------------------------------------------------------------------------
// Upcoming assignments list
// ---------------------------------------------------------------------------
function UpcomingList({ assignments }: { assignments: StudentAssignment[] }) {
  const navigate = useNavigate();
  const upcoming = useMemo(
    () => assignments.filter((a) => a.assignment_status === "upcoming").slice(0, 5),
    [assignments]
  );

  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={<ScheduleOutlinedIcon fontSize="inherit" />}
        title="No upcoming assignments"
        description="Nothing due soon — check back later."
      />
    );
  }

  return (
    <List disablePadding>
      {upcoming.map((a) => (
        <ListItem
          key={a.id}
          divider
          sx={{ py: 1.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
          onClick={() => navigate(ROUTES.STUDENT.ASSIGNMENT_DETAIL(a.id))}
        >
          <ListItemText
            primary={
              <Typography variant="body2" fontWeight={600}>
                {a.title}
              </Typography>
            }
            secondary={
              <Typography variant="caption" color="text.secondary">
                Due {formatDate(a.due_date)}
                {a.late_submission_allowed ? " · Late OK" : ""}
              </Typography>
            }
          />
        </ListItem>
      ))}
    </List>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------
export default function StudentDashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useMyAssignments();

  const stats = useMemo(() => {
    const all = data ?? [];
    return {
      total:     all.length,
      upcoming:  all.filter((a) => a.assignment_status === "upcoming").length,
      submitted: all.filter((a) => a.assignment_status === "submitted").length,
      overdue:   all.filter((a) => a.assignment_status === "overdue").length,
      pending:   all.filter((a) => a.assignment_status === "pending").length,
    };
  }, [data]);

  const classroomName = user?.profile.classroomId
    ? `Classroom #${user.profile.classroomId}`
    : "Your Classroom";

  return (
    <DashboardLayout
      title={`Welcome back, ${user?.name ?? "Student"}!`}
      description={`${classroomName} · Your notebook`}
    >
      <NotebookPage showMargin sx={{ p: 0.5, borderRadius: 2, mb: 3 }}>
        {/* ── Student identity card ──────────────────────────────────── */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            px: 3,
            py: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {(user?.name ?? "S")[0].toUpperCase()}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
              {user?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              @{user?.profile.username ?? "student"} · Student
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <MeetingRoomOutlinedIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {classroomName}
            </Typography>
          </Box>
        </Box>
      </NotebookPage>

      {/* ── Stat cards ──────────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          {isLoading ? (
            <NotebookCard><LoadingSkeleton variant="card" /></NotebookCard>
          ) : (
            <NotebookStatCard
              label="Total Assignments"
              value={stats.total}
              icon={<AssignmentOutlinedIcon />}
              color="primary"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          {isLoading ? (
            <NotebookCard><LoadingSkeleton variant="card" /></NotebookCard>
          ) : (
            <NotebookStatCard
              label="Upcoming"
              value={stats.upcoming}
              icon={<ScheduleOutlinedIcon />}
              color="info"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          {isLoading ? (
            <NotebookCard><LoadingSkeleton variant="card" /></NotebookCard>
          ) : (
            <NotebookStatCard
              label="Submitted"
              value={stats.submitted}
              icon={<CheckCircleOutlineIcon />}
              color="success"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          {isLoading ? (
            <NotebookCard><LoadingSkeleton variant="card" /></NotebookCard>
          ) : (
            <NotebookStatCard
              label="Pending"
              value={stats.pending}
              icon={<HourglassEmptyOutlinedIcon />}
              color="warning"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          {isLoading ? (
            <NotebookCard><LoadingSkeleton variant="card" /></NotebookCard>
          ) : (
            <NotebookStatCard
              label="Overdue"
              value={stats.overdue}
              icon={<WarningAmberOutlinedIcon />}
              color={stats.overdue > 0 ? "error" : "success"}
            />
          )}
        </Grid>
      </Grid>

      {/* ── Two-column: upcoming + recent activity ───────────────────── */}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          <NotebookCard title="Upcoming Assignments" subtitle="Click to open" disablePadding>
            {isLoading ? (
              <LoadingSkeleton variant="list" rows={4} />
            ) : (
              <UpcomingList assignments={data ?? []} />
            )}
          </NotebookCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <NotebookCard title="Recent Activity" subtitle="Your latest submissions" disablePadding>
            {isLoading ? (
              <LoadingSkeleton variant="list" rows={4} />
            ) : (
              <RecentActivityList assignments={data ?? []} />
            )}
          </NotebookCard>
        </Grid>
      </Grid>

      {/* ── Quick action ─────────────────────────────────────────────── */}
      <Box sx={{ mt: 3, display: "flex", justifyContent: "center" }}>
        <Button
          variant="contained"
          startIcon={<AssignmentOutlinedIcon />}
          href={ROUTES.STUDENT.ASSIGNMENTS}
          size="large"
        >
          View All Assignments
        </Button>
      </Box>
    </DashboardLayout>
  );
}
