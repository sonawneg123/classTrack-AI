/**
 * ResetPasswordPage.tsx
 *
 * Complete password-reset experience:
 *  1. On mount — validate the token with the backend.  The token lives only
 *     in the URL query param and is sent directly to the backend — never
 *     displayed, never logged, never put into state as visible text.
 *  2. If valid — show the reset form with the account's name + email so the
 *     user can confirm which account they are resetting.  Account identity
 *     comes entirely from the backend; nothing is read from the URL.
 *  3. If invalid/expired/used — show a professional "invalid link" screen.
 *  4. On submit — call the reset endpoint, then show a success screen with
 *     a prominent "Sign in" button.
 *
 * Security invariants preserved:
 *  - Raw token is never stored in React state, never logged, never rendered
 *    as visible text.
 *  - Account email / name are fetched from the backend — not from the URL.
 *  - Generic error message for any token problem (no enumeration of whether
 *    the token was invalid vs expired vs already used).
 */
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  CheckCircleOutline,
  ErrorOutline,
  LockReset,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { Link as RouterLink, Navigate, useSearchParams } from "react-router-dom";
import { authApi } from "@features/auth/api/authApi";
import { useAuth } from "@app/AuthProvider";
import { getDashboardPathForRole } from "@utils/roleRoutes";
import { getAuthErrorMessage } from "@utils/apiError";
import { APP_NAME, ROUTES } from "@utils/constants";

// ---------------------------------------------------------------------------
// Password schema — must match backend policy:
//   _assertPasswordStrength: min 8 chars
//   validator resetPassword:  min 6 (legacy); we enforce min 8 (stricter client-side)
//   studentRegister:          min 8, max 128
// ---------------------------------------------------------------------------
const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password is too long"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// Password hint requirements displayed while the user types
const PASSWORD_HINTS = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "At most 128 characters", test: (v: string) => v.length <= 128 },
];

// ---------------------------------------------------------------------------
// Shared card wrapper — keeps every "state" screen visually consistent
// ---------------------------------------------------------------------------
function PageCard({
  children,
  textAlign = "inherit",
}: {
  children: React.ReactNode;
  textAlign?: "inherit" | "center";
}) {
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
          maxWidth: 440,
          p: { xs: 3, sm: 5 },
          border: "1px solid",
          borderColor: "divider",
          textAlign,
        }}
      >
        {children}
      </Paper>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// State 1 — Verifying token on mount
// ---------------------------------------------------------------------------
function VerifyingScreen() {
  return (
    <PageCard textAlign="center">
      <CircularProgress size={48} aria-label="Verifying reset link" sx={{ mb: 2 }} />
      <Typography variant="h6" fontWeight={600} gutterBottom>
        Verifying reset link…
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Please wait while we validate your password reset link.
      </Typography>
    </PageCard>
  );
}

// ---------------------------------------------------------------------------
// State 2 — Invalid / expired / used token
// ---------------------------------------------------------------------------
function InvalidTokenScreen() {
  return (
    <PageCard textAlign="center">
      <ErrorOutline sx={{ fontSize: 56, color: "error.main", mb: 2 }} aria-hidden="true" />
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Reset link expired
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        This password reset link is no longer valid. Reset links expire after
        60 minutes and can only be used once. Please request a new one.
      </Typography>
      <Button
        component={RouterLink}
        to={ROUTES.FORGOT_PASSWORD}
        variant="contained"
        size="large"
        fullWidth
        sx={{ mb: 1.5 }}
      >
        Request new reset link
      </Button>
      <Typography variant="body2" color="text.secondary">
        <Link
          component={RouterLink}
          to={ROUTES.LOGIN}
          underline="hover"
          color="primary"
        >
          Back to Sign In
        </Link>
      </Typography>
    </PageCard>
  );
}

// ---------------------------------------------------------------------------
// State 3 — Missing token (no ?token= in URL)
// ---------------------------------------------------------------------------
function MissingTokenScreen() {
  return (
    <PageCard textAlign="center">
      <ErrorOutline sx={{ fontSize: 56, color: "error.main", mb: 2 }} aria-hidden="true" />
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Invalid reset link
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        This password reset link is missing required information. Please check
        that you copied the full link from your email, or request a new one.
      </Typography>
      <Button
        component={RouterLink}
        to={ROUTES.FORGOT_PASSWORD}
        variant="contained"
        size="large"
        fullWidth
        sx={{ mb: 1.5 }}
      >
        Request a new link
      </Button>
      <Typography variant="body2" color="text.secondary">
        <Link
          component={RouterLink}
          to={ROUTES.LOGIN}
          underline="hover"
          color="primary"
        >
          Back to Sign In
        </Link>
      </Typography>
    </PageCard>
  );
}

// ---------------------------------------------------------------------------
// State 4 — Success
// ---------------------------------------------------------------------------
function SuccessScreen() {
  return (
    <PageCard textAlign="center">
      <CheckCircleOutline
        sx={{ fontSize: 56, color: "success.main", mb: 2 }}
        aria-hidden="true"
      />
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Password reset successful
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Your password has been updated successfully. You've been signed out of
        all other devices for your security. You can now sign in with your new
        password.
      </Typography>
      <Button
        component={RouterLink}
        to={ROUTES.LOGIN}
        variant="contained"
        size="large"
        fullWidth
      >
        Sign in
      </Button>
    </PageCard>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ResetPasswordPage() {
  const { isAuthenticated, user } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  // Token validation state
  type ValidState = "verifying" | "invalid" | "valid";
  const [tokenState, setTokenState] = useState<ValidState>(token ? "verifying" : "invalid");

  // Account identity returned by the backend (never from the URL)
  const [accountName, setAccountName] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  // Form state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const passwordValue = watch("newPassword");

  // Validate the token on mount (only when a token is present)
  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }

    let cancelled = false;
    authApi
      .validateResetToken(token)
      .then((account) => {
        if (cancelled) return;
        setAccountName(account.name);
        setAccountEmail(account.email);
        setTokenState("valid");
      })
      .catch(() => {
        if (cancelled) return;
        setTokenState("invalid");
      });

    return () => {
      cancelled = true;
    };
    // token is stable for the lifetime of the page — ESLint exhaustive-deps is correct here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect already-authenticated users to their dashboard
  if (isAuthenticated && user) {
    return <Navigate to={getDashboardPathForRole(user.role)} replace />;
  }

  // No token in URL at all
  if (!token) return <MissingTokenScreen />;

  // Checking the token with the backend
  if (tokenState === "verifying") return <VerifyingScreen />;

  // Token is invalid / expired / used
  if (tokenState === "invalid") return <InvalidTokenScreen />;

  // Password reset completed
  if (success) return <SuccessScreen />;

  // ---------------------------------------------------------------------------
  // Main reset form (tokenState === "valid")
  // ---------------------------------------------------------------------------
  const onSubmit = async (values: ResetPasswordFormValues) => {
    setFormError(null);
    try {
      // Token is read from URL — never displayed, never logged here.
      await authApi.resetPassword(token, values.newPassword);
      setSuccess(true);
    } catch (error) {
      const { message } = getAuthErrorMessage(error);
      setFormError(message);
    }
  };

  return (
    <PageCard>
      {/* ── Header ── */}
      <Stack spacing={0.5} mb={3} textAlign="center">
        <Typography variant="h4" fontWeight={700}>
          {APP_NAME}
        </Typography>
        <Typography variant="h6" fontWeight={600}>
          Reset your password
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Choose a strong new password for your account.
        </Typography>
      </Stack>

      {/* ── Account identity card ── */}
      {(accountName || accountEmail) && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 2,
              py: 1.5,
              bgcolor: "action.hover",
              borderRadius: 2,
              mb: 3,
            }}
          >
            <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main", fontSize: 16 }}>
              <LockReset fontSize="small" />
            </Avatar>
            <Box>
              {accountName && (
                <Typography variant="body2" fontWeight={600} color="text.primary">
                  {accountName}
                </Typography>
              )}
              {accountEmail && (
                <Typography variant="caption" color="text.secondary">
                  {accountEmail}
                </Typography>
              )}
            </Box>
          </Box>
          <Divider sx={{ mb: 3 }} />
        </>
      )}

      {/* ── Form ── */}
      <Box
        component="form"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
        aria-label="Reset password form"
      >
        {formError && (
          <Alert
            severity="error"
            onClose={() => setFormError(null)}
            role="alert"
            aria-live="polite"
          >
            {formError}
            {(formError.toLowerCase().includes("invalid") ||
              formError.toLowerCase().includes("expired")) && (
              <Box component="span" sx={{ display: "block", mt: 0.5 }}>
                <Link
                  component={RouterLink}
                  to={ROUTES.FORGOT_PASSWORD}
                  underline="hover"
                  color="inherit"
                  sx={{ fontWeight: 600 }}
                >
                  Request a new reset link →
                </Link>
              </Box>
            )}
          </Alert>
        )}

        {/* New password */}
        <TextField
          label="New password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          autoFocus
          fullWidth
          error={Boolean(errors.newPassword)}
          helperText={errors.newPassword?.message}
          inputProps={{ "aria-label": "New password" }}
          {...register("newPassword")}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((p) => !p)}
                    edge="end"
                    tabIndex={-1}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />

        {/* Password requirement hints */}
        {passwordValue && (
          <Stack spacing={0.5} sx={{ mt: -1 }}>
            {PASSWORD_HINTS.map(({ label, test }) => {
              const ok = test(passwordValue);
              return (
                <Typography
                  key={label}
                  variant="caption"
                  sx={{
                    color: ok ? "success.main" : "text.disabled",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                  aria-label={`${label}: ${ok ? "met" : "not met"}`}
                >
                  {ok ? "✓" : "○"} {label}
                </Typography>
              );
            })}
          </Stack>
        )}

        {/* Confirm password */}
        <TextField
          label="Confirm new password"
          type={showConfirm ? "text" : "password"}
          autoComplete="new-password"
          fullWidth
          error={Boolean(errors.confirmPassword)}
          helperText={errors.confirmPassword?.message}
          inputProps={{ "aria-label": "Confirm new password" }}
          {...register("confirmPassword")}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={
                      showConfirm ? "Hide confirm password" : "Show confirm password"
                    }
                    onClick={() => setShowConfirm((p) => !p)}
                    edge="end"
                    tabIndex={-1}
                  >
                    {showConfirm ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
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
          sx={{ mt: 0.5 }}
        >
          {isSubmitting ? "Updating password…" : "Reset password"}
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
    </PageCard>
  );
}
