import { Box, Paper, Stack, Typography } from "@mui/material";
import { Navigate } from "react-router-dom";
import { LoginForm } from "@features/auth/components/LoginForm";
import { useAuth } from "@app/AuthProvider";
import { getDashboardPathForRole } from "@utils/roleRoutes";
import { APP_NAME } from "@utils/constants";

export default function LoginPage() {
  const { isAuthenticated, user } = useAuth();

  // Already signed in — send them straight to their dashboard instead of
  // showing the login form again.
  if (isAuthenticated && user) {
    return <Navigate to={getDashboardPathForRole(user.role)} replace />;
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 420,
          p: { xs: 3, sm: 5 },
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack spacing={0.5} mb={4} textAlign="center">
          <Typography variant="h4">{APP_NAME}</Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to your account
          </Typography>
        </Stack>

        <LoginForm />
      </Paper>
    </Box>
  );
}
