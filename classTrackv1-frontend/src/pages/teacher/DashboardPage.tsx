import { Box, List, ListItem, ListItemText, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import InsertChartOutlinedIcon from "@mui/icons-material/InsertChartOutlined";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { NotebookCard, NotebookStatCard } from "@components/notebook";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import { useTeacherDashboard } from "@features/teacher/hooks/useTeacherDashboard";
import { ROUTES } from "@utils/constants";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

/**
 * Teacher Dashboard — notebook-themed, consistent with the Student dashboard
 * and Admin reference screenshots. Backed by GET /v1/teacher/dashboard.
 */
export default function TeacherDashboardPage() {
  const { data, isLoading } = useTeacherDashboard();
  const navigate = useNavigate();

  return (
    <DashboardLayout
      title="Dashboard"
      description="An overview of your classrooms and recent activity."
    >
      {/* ── Stat cards ────────────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          {isLoading ? (
            <NotebookCard><LoadingSkeleton variant="card" /></NotebookCard>
          ) : (
            <NotebookStatCard
              label="Total Classrooms"
              value={data?.totalClassrooms ?? 0}
              icon={<MeetingRoomOutlinedIcon />}
              color="primary"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          {isLoading ? (
            <NotebookCard><LoadingSkeleton variant="card" /></NotebookCard>
          ) : (
            <NotebookStatCard
              label="Total Students"
              value={data?.totalStudents ?? 0}
              icon={<SchoolOutlinedIcon />}
              color="secondary"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          {isLoading ? (
            <NotebookCard><LoadingSkeleton variant="card" /></NotebookCard>
          ) : (
            <NotebookStatCard
              label="Active Assignments"
              value={data?.activeAssignments ?? 0}
              icon={<AssignmentOutlinedIcon />}
              color="success"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          {isLoading ? (
            <NotebookCard><LoadingSkeleton variant="card" /></NotebookCard>
          ) : (
            <NotebookStatCard
              label="Pending Evaluations"
              value={data?.pendingEvaluations ?? 0}
              icon={<RateReviewOutlinedIcon />}
              color={data?.pendingEvaluations ? "warning" : "success"}
              onClick={() => navigate(ROUTES.TEACHER.EVALUATIONS)}
            />
          )}
        </Grid>
      </Grid>

      {/* ── Recent activity ───────────────────────────────────────────── */}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <NotebookCard title="Assignment Activity" subtitle="Coming soon — submission trends will appear here" sx={{ minHeight: 260 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 200,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Chart coming soon
              </Typography>
            </Box>
          </NotebookCard>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <NotebookCard title="Recent Activity" subtitle="Latest posts and submissions" disablePadding>
            {isLoading ? (
              <LoadingSkeleton variant="list" rows={4} />
            ) : !data?.recentActivity || data.recentActivity.length === 0 ? (
              <EmptyState
                icon={<InsertChartOutlinedIcon fontSize="inherit" />}
                title="No activity yet"
                description="Activity will show up here once assignments and submissions start coming in."
              />
            ) : (
              <List disablePadding>
                {data.recentActivity.map((item) => (
                  <ListItem key={`${item.type}-${item.id}`} divider>
                    <ListItemText
                      primary={
                        item.type === "task_posted"
                          ? `New assignment: ${item.label}`
                          : `Submission received: ${item.label}`
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {item.classroom_name} · {timeAgo(item.occurred_at)}
                        </Typography>
                      }
                      primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </NotebookCard>
        </Grid>
      </Grid>
    </DashboardLayout>
  );
}
