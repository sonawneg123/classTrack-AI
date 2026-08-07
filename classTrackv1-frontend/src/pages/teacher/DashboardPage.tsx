import { Box, Grid, List, ListItem, ListItemText, Typography } from "@mui/material";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import InsertChartOutlinedIcon from "@mui/icons-material/InsertChartOutlined";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { StatCard } from "@components/cards/StatCard";
import { DashboardCard } from "@components/cards/DashboardCard";
import { ChartContainer } from "@components/charts/ChartContainer";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import { useTeacherDashboard } from "@features/teacher/hooks/useTeacherDashboard";

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
 * Real Teacher Dashboard — stats, recent activity, and trend chart
 * placeholders, all backed by GET /v1/teacher/dashboard (a single
 * aggregated backend call, no N+1).
 */
export default function TeacherDashboardPage() {
  const { data, isLoading } = useTeacherDashboard();

  return (
    <DashboardLayout
      title="Dashboard"
      description="An overview of your classrooms and recent activity."
    >
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          {isLoading ? (
            <DashboardCard><LoadingSkeleton variant="card" /></DashboardCard>
          ) : (
            <StatCard
              label="Total Classrooms"
              value={data?.totalClassrooms ?? 0}
              icon={<MeetingRoomOutlinedIcon />}
              color="primary"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          {isLoading ? (
            <DashboardCard><LoadingSkeleton variant="card" /></DashboardCard>
          ) : (
            <StatCard
              label="Total Students"
              value={data?.totalStudents ?? 0}
              icon={<SchoolOutlinedIcon />}
              color="secondary"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          {isLoading ? (
            <DashboardCard><LoadingSkeleton variant="card" /></DashboardCard>
          ) : (
            <StatCard
              label="Active Assignments"
              value={data?.activeAssignments ?? 0}
              icon={<AssignmentOutlinedIcon />}
              color="success"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          {isLoading ? (
            <DashboardCard><LoadingSkeleton variant="card" /></DashboardCard>
          ) : (
            <StatCard
              label="Pending Evaluations"
              value={data?.pendingEvaluations ?? 0}
              icon={<RateReviewOutlinedIcon />}
              color="warning"
            />
          )}
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <ChartContainer
            title="Assignment activity"
            subtitle="Coming soon"
            isEmpty
            height={260}
          >
            <Box />
          </ChartContainer>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <DashboardCard title="Recent Activity" subtitle="Latest posts and submissions" disablePadding>
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
          </DashboardCard>
        </Grid>
      </Grid>
    </DashboardLayout>
  );
}
