import { type MouseEvent } from "react";
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
import { useState } from "react";
import { useNotifications, useMarkNotificationRead } from "@features/notifications/hooks/useNotifications";
import { EmptyState } from "@components/feedback/EmptyState";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";

export function NotificationMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const { data, isLoading } = useNotifications();
  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markRead = useMarkNotificationRead();

  const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleItemClick = (id: number, isRead: boolean) => {
    if (!isRead) {
      markRead.mutate(id);
    }
  };

  return (
    <>
      <IconButton onClick={handleOpen} size="large">
        <Badge badgeContent={unreadCount > 0 ? unreadCount : undefined} color="error">
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
        ) : notifications.length === 0 ? (
          <EmptyState title="You're all caught up" description="No new notifications." />
        ) : (
          <List dense disablePadding>
            {notifications.map((n) => {
              const isRead = Boolean(n.is_read);
              return (
                <ListItem
                  key={n.id}
                  onClick={() => handleItemClick(n.id, isRead)}
                  sx={{
                    alignItems: "flex-start",
                    bgcolor: isRead ? "transparent" : "action.hover",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    cursor: isRead ? "default" : "pointer",
                  }}
                >
                  <ListItemText
                    primary={n.title}
                    secondary={
                      <>
                        {n.message && (
                          <Typography variant="body2" color="text.secondary" component="span" display="block">
                            {n.message}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.disabled">
                          {new Date(n.created_at).toLocaleString()}
                        </Typography>
                      </>
                    }
                    primaryTypographyProps={{ variant: "body2", fontWeight: isRead ? 400 : 600 }}
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </Menu>
    </>
  );
}
