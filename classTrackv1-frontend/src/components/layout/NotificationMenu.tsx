import { useState, type MouseEvent } from "react";
import {
  Badge,
  Box,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Menu,
  Typography,
} from "@mui/material";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import { useNotifications } from "@features/dashboard/hooks/useDashboardQueries";
import { EmptyState } from "@components/feedback/EmptyState";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";

export function NotificationMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const { data: notifications, isLoading } = useNotifications();

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  return (
    <>
      <IconButton onClick={handleOpen} size="large">
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsNoneOutlinedIcon />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        slotProps={{ paper: { sx: { width: 360, maxHeight: 420 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2">Notifications</Typography>
        </Box>
        <Divider />

        {isLoading ? (
          <LoadingSkeleton variant="list" rows={3} />
        ) : !notifications || notifications.length === 0 ? (
          <EmptyState title="You're all caught up" description="No new notifications." />
        ) : (
          <List dense disablePadding>
            {notifications.map((notification) => (
              <ListItem
                key={notification.id}
                sx={{
                  alignItems: "flex-start",
                  bgcolor: notification.read ? "transparent" : "action.hover",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <ListItemText
                  primary={notification.title}
                  secondary={
                    <>
                      <Typography variant="body2" color="text.secondary" component="span" display="block">
                        {notification.description}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {notification.createdAt}
                      </Typography>
                    </>
                  }
                  primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Menu>
    </>
  );
}
