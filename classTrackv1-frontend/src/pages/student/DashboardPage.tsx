import { Box, Button, Stack, Typography } from "@mui/material";
import { useAuth } from "@app/AuthProvider";

/**
 * Placeholder Student dashboard — proves role-based routing end to end.
 * Replaced with the real dashboard layout in Module 4.
 */
export default function StudentDashboardPage() {
  const { user, logout } = useAuth();

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1.5,
        px: 3,
        textAlign: "center",
      }}
    >
      <Typography variant="overline" color="text.secondary">
        Student area
      </Typography>
      <Typography variant="h3">Welcome, {user?.name}</Typography>
      <Typography variant="body1" color="text.secondary">
        Signed in as {user?.profile.email ?? user?.profile.username} ({user?.role})
      </Typography>
      <Stack direction="row" spacing={2} mt={3}>
        <Button variant="outlined" color="inherit" onClick={() => logout()}>
          Log out
        </Button>
      </Stack>
    </Box>
  );
}
