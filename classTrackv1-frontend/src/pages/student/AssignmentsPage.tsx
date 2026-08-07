import { useMemo, useState } from "react";
import {
  Box,
  Card,
  Chip,
  List,
  ListItem,
  ListItemText,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { ErrorBoundary } from "@components/feedback/ErrorBoundary";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import { useMyAssignments } from "@features/student/hooks/useMyAssignments";
import type { StudentAssignment } from "@/types/studentAssignment";

type TabKey = "upcoming" | "submitted" | "pending" | "overdue";

const TABS: { key: TabKey; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "submitted", label: "Submitted" },
  { key: "pending", label: "Pending" },
  { key: "overdue", label: "Overdue" },
];

const STATUS_CHIP: Record<TabKey, { label: string; color: "info" | "success" | "warning" | "error" }> = {
  upcoming: { label: "Upcoming", color: "info" },
  submitted: { label: "Submitted", color: "success" },
  pending: { label: "Pending", color: "warning" },
  overdue: { label: "Overdue", color: "error" },
};

function formatDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString() : "No due date";
}

export default function StudentAssignmentsPage() {
  const [tab, setTab] = useState<TabKey>("upcoming");
  const { data, isLoading } = useMyAssignments();

  const grouped = useMemo(() => {
    const groups: Record<TabKey, StudentAssignment[]> = { upcoming: [], submitted: [], pending: [], overdue: [] };
    (data ?? []).forEach((a) => groups[a.assignment_status].push(a));
    return groups;
  }, [data]);

  const activeList = grouped[tab];

  return (
    <DashboardLayout title="My Assignments" description="Track what's due, submitted, and overdue.">
      <ErrorBoundary section="your assignments">
        <Card variant="outlined">
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            {TABS.map((t) => (
              <Tab
                key={t.key}
                value={t.key}
                label={`${t.label} (${grouped[t.key].length})`}
              />
            ))}
          </Tabs>

          {isLoading ? (
            <LoadingSkeleton variant="list" rows={4} />
          ) : activeList.length === 0 ? (
            <EmptyState
              icon={<AssignmentOutlinedIcon fontSize="inherit" />}
              title={`No ${tab} assignments`}
              description="Check back later or switch tabs to see other assignments."
            />
          ) : (
            <List disablePadding>
              {activeList.map((a) => (
                <ListItem key={a.id} divider sx={{ py: 1.5 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <Typography variant="body2" fontWeight={600}>{a.title}</Typography>
                        <Chip
                          size="small"
                          label={STATUS_CHIP[a.assignment_status].label}
                          color={STATUS_CHIP[a.assignment_status].color}
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        Due {formatDate(a.due_date)}
                        {a.effective_score !== null && ` · Score: ${a.effective_score}/${a.max_score}`}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Card>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
