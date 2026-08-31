import { useEffect, useState } from "react";
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
import {
  CheckCircleOutline,
  ErrorOutline,
  HourglassEmpty,
} from "@mui/icons-material";
import { Link as RouterLink, Navigate, useSearchParams } from "react-router-dom";
import { authApi } from "@features/auth/api/authApi";
import { useAuth } from "@app/AuthProvider";
import { getDashboardPathForRole } from "@utils/roleRoutes";
import { getAuthErrorMessage } from "@utils/apiError";
import { ROUTES } from "@utils/constants";

type VerificationState =
  | "verifying"    // auto-verifying token from URL
  | "success"      // verification succeeded
  | "error"        // invalid / expired token
  | "no_token";    // no token in URL

const resendSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  role: z.enum(["admin", "teacher"], { required_error: "Role is required" }),
});

type ResendFormValues = z.infer<typeof resendSchema>;

export default function VerifyEmailPage() {
  const { isAuthenticated, user } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<VerificationState>(
    token ? "verifying" : "no_token"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendFormValues>({
    resolver: zodResolver(resendSchema),
    defaultValues: { email: "", role: "teacher" },
  });

  useEffect(() => {
    if (!token) {
      setState("no_token");
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        // Token is from URL — never displayed to the user.
        await authApi.verifyEmail(token!);
        if (!cancelled) setState("success");
      } catch (error) {
        if (!cancelled) {
          const { message } = getAuthErrorMessage(error);
          setErrorMessage(message);
          setState("error");
        }
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Redirect authenticated users to their dashboard
  if (isAuthenticated && user) {
    return <Navigate to={getDashboardPathForRole(user.role)} replace />;
  }

  const onResend = async (values: ResendFormValues) => {
    setResendError(null);
    try {
      await authApi.resendVerification(values.email, values.role);
      setResendSent(true);
    } catch (error) {
      const { message } = getAuthErrorMessage(error);
      setResendError(message);
    }
  };

  // ── Verifying state ──────────────────────────────────────────────────────────
  if (state === "verifying") {
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
          <HourglassEmpty
            sx={{ fontSize: 56, color: "text.secondary", mb: 2 }}
            aria-hidden="true"
          />
          <CircularProgress size={24} sx={{ mb: 2 }} aria-label="Verifying your email" />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Verifying your email
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Please wait while we verify your email address…
          </Typography>
        </Paper>
      </Box>
    );
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (state === "success") {
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
          <CheckCircleOutline
            sx={{ fontSize: 56, color: "success.main", mb: 2 }}
            aria-hidden="true"
          />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Email verified!
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Your email has been verified. You can now sign in to your account.
          </Typography>
          <Button
            component={RouterLink}
            to={ROUTES.LOGIN}
            variant="contained"
            size="large"
            fullWidth
          >
            Continue to Sign In
          </Button>
        </Paper>
      </Box>
    );
  }

  // ── Error state (invalid / expired token) ───────────────────────────────────
  if (state === "error") {
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
          py: 4,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 460,
            p: { xs: 3, sm: 5 },
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack spacing={2} alignItems="center" textAlign="center" mb={3}>
            <ErrorOutline sx={{ fontSize: 56, color: "error.main" }} aria-hidden="true" />
            <Typography variant="h5" fontWeight={700}>
              Verification failed
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {errorMessage || "This verification link is invalid or has expired."}
            </Typography>
          </Stack>

          {/* Resend verification form — for admin/teacher only (backend contract) */}
          {!resendSent ? (
            <Box
              component="form"
              noValidate
              onSubmit={handleSubmit(onResend)}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
              aria-label="Request a new verification email"
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Request a new verification email
              </Typography>

              {resendError && (
                <Alert severity="error" role="alert" aria-live="polite">
                  {resendError}
                </Alert>
              )}

              <TextField
                label="Your email address"
                type="email"
                autoComplete="email"
                fullWidth
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
                inputProps={{ "aria-label": "Email address" }}
                {...register("email")}
              />

              <TextField
                label="Account type"
                select
                fullWidth
                error={Boolean(errors.role)}
                helperText={errors.role?.message ?? "Select whether you are a Teacher or Admin"}
                defaultValue="teacher"
                SelectProps={{ native: true }}
                inputProps={{ "aria-label": "Account type" }}
                {...register("role")}
              >
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </TextField>

              <Button
                type="submit"
                variant="outlined"
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
                {isSubmitting ? "Sending…" : "Resend verification email"}
              </Button>
            </Box>
          ) : (
            <Alert severity="success" role="status" aria-live="polite">
              If an account with that email exists and is unverified, a new
              verification link has been sent. Check your inbox.
            </Alert>
          )}

          <Box sx={{ mt: 3, textAlign: "center" }}>
            <Link
              component={RouterLink}
              to={ROUTES.LOGIN}
              variant="body2"
              underline="hover"
              color="primary"
            >
              ← Back to Sign In
            </Link>
          </Box>
        </Paper>
      </Box>
    );
  }

  // ── No token state ───────────────────────────────────────────────────────────
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
        <ErrorOutline
          sx={{ fontSize: 56, color: "warning.main", mb: 2 }}
          aria-hidden="true"
        />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Verification link required
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          This page requires a verification link from your email. Please check
          your inbox for the verification email.
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
