import { useState, type MouseEvent } from "react";
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Pagination,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import { DashboardCard } from "@components/cards/DashboardCard";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";
import type { Task, TaskListParams, TaskSortBy, TaskStatusFilter } from "@/types/task";
import type { PaginationMeta } from "@/types/classroom";

interface TaskTableProps {
  tasks: Task[];
  pagination?: PaginationMeta;
  params: TaskListParams;
  isLoading: boolean;
  onParamsChange: (next: TaskListParams) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onTogglePublish: (task: Task) => void;
  onArchive: (task: Task) => void;
  onRestore: (task: Task) => void;
  onDuplicate: (task: Task) => void;
  onCreateFirst: () => void;
}

const sortColumns: { key: TaskSortBy; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "dueDate", label: "Due date" },
  { key: "createdAt", label: "Created" },
  { key: "submissionCount", label: "Submissions" },
];

function formatDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString() : "—";
}

export function TaskTable({
  tasks,
  pagination,
  params,
  isLoading,
  onParamsChange,
  onEdit,
  onDelete,
  onTogglePublish,
  onArchive,
  onRestore,
  onDuplicate,
  onCreateFirst,
}: TaskTableProps) {
  const [searchInput, setSearchInput] = useState(params.search ?? "");
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuTarget, setMenuTarget] = useState<Task | null>(null);

  const openMenu = (event: MouseEvent<HTMLElement>, task: Task) => {
    setMenuAnchor(event.currentTarget);
    setMenuTarget(task);
  };
  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuTarget(null);
  };

  const handleSort = (key: TaskSortBy) => {
    const sortDir = params.sortBy === key && params.sortDir === "asc" ? "desc" : "asc";
    onParamsChange({ ...params, sortBy: key, sortDir, page: 1 });
  };

  const handleStatusChange = (_: unknown, next: TaskStatusFilter | null) => {
    if (next) onParamsChange({ ...params, status: next, page: 1 });
  };

  const handleSearchSubmit = () => {
    onParamsChange({ ...params, search: searchInput.trim() || undefined, page: 1 });
  };

  return (
    <DashboardCard disablePadding>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        sx={{ p: 2.5, pb: 2 }}
      >
        <TextField
          size="small"
          placeholder="Search assignments…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
          onBlur={handleSearchSubmit}
          sx={{ minWidth: { sm: 260 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <ToggleButtonGroup size="small" value={params.status} exclusive onChange={handleStatusChange}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="published">Published</ToggleButton>
          <ToggleButton value="unpublished">Draft</ToggleButton>
          <ToggleButton value="archived">Archived</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {isLoading ? (
        <LoadingSkeleton variant="list" rows={5} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<AssignmentOutlinedIcon fontSize="inherit" />}
          title={params.search || params.status !== "all" ? "No assignments match" : "No assignments yet"}
          description={
            params.search || params.status !== "all"
              ? "Try a different search term or status filter."
              : "Create your first assignment to get started."
          }
          actionLabel={!params.search && params.status === "all" ? "Create assignment" : undefined}
          onAction={!params.search && params.status === "all" ? onCreateFirst : undefined}
        />
      ) : (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {sortColumns.map((col) => (
                    <TableCell key={col.key}>
                      <TableSortLabel
                        active={params.sortBy === col.key}
                        direction={params.sortBy === col.key ? params.sortDir : "asc"}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                  <TableCell>Classroom</TableCell>
                  <TableCell>AI</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{task.title}</Typography>
                    </TableCell>
                    <TableCell>{formatDate(task.dueDate)}</TableCell>
                    <TableCell>{formatDate(task.createdAt)}</TableCell>
                    <TableCell>{task.submissionCount ?? 0}</TableCell>
                    <TableCell>{task.classroomName ?? "—"}</TableCell>
                    <TableCell>
                      {task.aiEvaluationEnabled ? (
                        <Tooltip title="AI evaluation enabled">
                          <AutoAwesomeOutlinedIcon fontSize="small" color="secondary" />
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.disabled">Off</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {task.isArchived ? (
                        <Chip label="Archived" size="small" variant="outlined" />
                      ) : (
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Tooltip title={task.isPublished ? "Unpublish" : "Publish"}>
                            <Switch
                              size="small"
                              checked={task.isPublished}
                              onChange={() => onTogglePublish(task)}
                            />
                          </Tooltip>
                          <Chip
                            label={task.isPublished ? "Published" : "Draft"}
                            size="small"
                            color={task.isPublished ? "success" : "default"}
                            variant={task.isPublished ? "filled" : "outlined"}
                          />
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={(e) => openMenu(e, task)}>
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {pagination && pagination.totalPages > 1 && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2.5 }}>
              <Pagination
                page={pagination.page}
                count={pagination.totalPages}
                onChange={(_, page) => onParamsChange({ ...params, page })}
                color="primary"
                size="small"
              />
            </Box>
          )}
        </>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {menuTarget && [
          <MenuItem key="edit" onClick={() => { onEdit(menuTarget); closeMenu(); }}>
            <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>,
          <MenuItem key="duplicate" onClick={() => { onDuplicate(menuTarget); closeMenu(); }}>
            <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Duplicate</ListItemText>
          </MenuItem>,
          menuTarget.isArchived ? (
            <MenuItem key="restore" onClick={() => { onRestore(menuTarget); closeMenu(); }}>
              <ListItemIcon><UnarchiveOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Restore</ListItemText>
            </MenuItem>
          ) : (
            <MenuItem key="archive" onClick={() => { onArchive(menuTarget); closeMenu(); }}>
              <ListItemIcon><ArchiveOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Archive</ListItemText>
            </MenuItem>
          ),
          <MenuItem key="delete" onClick={() => { onDelete(menuTarget); closeMenu(); }} sx={{ color: "error.main" }}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>,
        ]}
      </Menu>
    </DashboardCard>
  );
}
