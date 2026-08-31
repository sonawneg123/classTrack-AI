import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { MarkEmailRead } from "@mui/icons-material";
import { Link as RouterLink, Navigate } from "react-router-dom";
import { authApi } from "@features/auth/api/authApi";
import { useAuth } from "@app/AuthProvider";
import { getDashboardPathForRole } from "@utils/roleRoutes";
import { getAuthErrorMessage } from "@utils/apiError";
import { APP_NAME, ROUTES } from "@utils/constants";

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { isAuthenticated, user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  if (isAuthenticated && user) {
    return <Navigate to={getDashboardPathForRole(user.role)} replace />;
  }

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setFormError(null);
    try {
      await authApi.forgotPassword(values.email);
      setSubmitted(true);
    } catch (error) {
      const { message } = getAuthErrorMessage(error);
      setFormError(message);
    }
  };

  if (submitted) {
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
            textAlign: "center",
          }}
        >
          <MarkEmailRead
            sx={{ fontSize: 56, color: "success.main", mb: 2 }}
            aria-hidden="true"
          />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Check your email
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={1}>
            If an account exists for{" "}
            <Box component="strong" sx={{ color: "text.primary" }}>
              {getValues("email")}
            </Box>
            , we've sent a password reset link.
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            The link will expire in 60 minutes. Check your spam folder if you
            don't see it within a few minutes.
          </Typography>
          <Button
            component={RouterLink}
            to={ROUTES.LOGIN}
            variant="contained"
            size="large"
            fullWidth
          >
            Back to Sign In
          </Button>
        </Paper>
      </Box>
    );
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
        {/* Header */}
        <Stack spacing={0.5} mb={4} textAlign="center">
          <Typography variant="h4">{APP_NAME}</Typography>
          <Typography variant="h6" fontWeight={600}>
            Forgot your password?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter your email address and we'll send you a password reset link.
          </Typography>
        </Stack>

        <Box
          component="form"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
          aria-label="Forgot password form"
        >
          {formError && (
            <Alert
              severity="error"
              onClose={() => setFormError(null)}
              role="alert"
              aria-live="polite"
            >
              {formError}
            </Alert>
          )}

          <TextField
            label="Email address"
            type="email"
            autoComplete="email"
            autoFocus
            fullWidth
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            inputProps={{ "aria-label": "Email address" }}
            {...register("email")}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            startIcon={
              isSubmitting ? (
                <CircularProgress size={18} color="inherit" aria-hidden="true" />
              ) : undefined
            }
          >
            {isSubmitting ? "Sending reset link…" : "Send reset link"}
          </Button>

          <Typography variant="body2" align="center" color="text.secondary">
            <Link
              component={RouterLink}
              to={ROUTES.LOGIN}
              underline="hover"
              color="primary"
            >
              ← Back to Sign In
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
