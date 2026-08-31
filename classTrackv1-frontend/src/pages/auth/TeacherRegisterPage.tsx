import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
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
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { Link as RouterLink, Navigate } from "react-router-dom";
import { authApi } from "@features/auth/api/authApi";
import { tokenStorage } from "@services/tokenStorage";
import { useAuth } from "@app/AuthProvider";
import { getErrorMessage } from "@utils/apiError";
import { APP_NAME, ROUTES } from "@utils/constants";
import {
  teacherRegisterSchema,
  type TeacherRegisterFormValues,
} from "@features/auth/schemas/teacherRegisterSchema";

// ── Password requirement hint items ──────────────────────────────────────────
const PASSWORD_HINTS = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "At least one letter", test: (v: string) => /[A-Za-z]/.test(v) },
  { label: "At least one number", test: (v: string) => /[0-9]/.test(v) },
];

export default function TeacherRegisterPage() {
  const { isAuthenticated, user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TeacherRegisterFormValues>({
    resolver: zodResolver(teacherRegisterSchema),
    defaultValues: {
      name: "",
      email: "",
      mobile: "",
      teacherCode: "",
      password: "",
      confirmPassword: "",
    },
  });

  const passwordValue = watch("password");

  // Already signed in — redirect to their dashboard
  if (isAuthenticated && user) {
    if (user.role === "teacher") return <Navigate to={ROUTES.TEACHER.DASHBOARD} replace />;
    if (user.role === "admin") return <Navigate to={ROUTES.ADMIN.DASHBOARD} replace />;
    return <Navigate to={ROUTES.STUDENT.DASHBOARD} replace />;
  }

  // Registration success state
  if (registered) {
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
            maxWidth: 460,
            p: { xs: 3, sm: 5 },
            border: "1px solid",
            borderColor: "divider",
            textAlign: "center",
          }}
        >
          <CheckCircleOutline sx={{ fontSize: 56, color: "success.main", mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Teacher account created!
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Your teacher account has been created successfully. You can now sign
            in with your email and password.
          </Typography>
          <Button
            component={RouterLink}
            to={ROUTES.LOGIN}
            variant="contained"
            size="large"
            fullWidth
          >
            Go to Sign In
          </Button>
        </Paper>
      </Box>
    );
  }

  const onSubmit = async (values: TeacherRegisterFormValues) => {
    setFormError(null);
    try {
      const result = await authApi.registerTeacher({
        name: values.name,
        email: values.email,
        mobile: values.mobile || undefined,
        teacherCode: values.teacherCode.replace(/-/g, ""), // strip dashes before submit
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      tokenStorage.setTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      setRegistered(true);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

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
        {/* Header */}
        <Stack spacing={0.5} mb={4} textAlign="center">
          <Typography variant="h4">{APP_NAME}</Typography>
          <Typography variant="h6" fontWeight={600}>
            Teacher Registration
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Fill in your details. You will need a teacher registration code from
            your administrator.
          </Typography>
        </Stack>

        <Box
          component="form"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
        >
          {/* Server error */}
          {formError && (
            <Alert severity="error" onClose={() => setFormError(null)}>
              {formError}
            </Alert>
          )}

          {/* Full name */}
          <TextField
            label="Full name"
            autoComplete="name"
            autoFocus
            fullWidth
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
            {...register("name")}
          />

          {/* Email */}
          <TextField
            label="Email address"
            type="email"
            autoComplete="email"
            fullWidth
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            {...register("email")}
          />

          {/* Mobile (optional) */}
          <TextField
            label="Mobile number (optional)"
            type="tel"
            autoComplete="tel"
            fullWidth
            placeholder="+91 98765 43210"
            error={Boolean(errors.mobile)}
            helperText={
              errors.mobile?.message ??
              "Include your country code, e.g. +91 for India"
            }
            {...register("mobile")}
          />

          {/* Teacher registration code */}
          <TextField
            label="Teacher Registration Code"
            autoComplete="off"
            fullWidth
            placeholder="e.g. ABCD-1234"
            error={Boolean(errors.teacherCode)}
            helperText={
              errors.teacherCode?.message ??
              "Enter the code provided by your administrator."
            }
            inputProps={{
              style: { textTransform: "uppercase" },
              "aria-label": "Teacher registration code",
            }}
            {...register("teacherCode")}
          />

          <Divider sx={{ my: 0.5 }} />

          {/* Password */}
          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            fullWidth
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            {...register("password")}
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

          {/* Password requirements */}
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
                  >
                    {ok ? "✓" : "○"} {label}
                  </Typography>
                );
              })}
            </Stack>
          )}

          {/* Confirm password */}
          <TextField
            label="Confirm password"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            fullWidth
            error={Boolean(errors.confirmPassword)}
            helperText={errors.confirmPassword?.message}
            {...register("confirmPassword")}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
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

          {/* Submit */}
          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={isSubmitting}
            startIcon={
              isSubmitting ? (
                <CircularProgress size={18} color="inherit" />
              ) : undefined
            }
            sx={{ mt: 0.5 }}
          >
            {isSubmitting ? "Creating account…" : "Create Teacher Account"}
          </Button>

          {/* Login link */}
          <Typography variant="body2" align="center" color="text.secondary">
            Already have an account?{" "}
            <Link
              component={RouterLink}
              to={ROUTES.LOGIN}
              underline="hover"
              color="primary"
            >
              Sign in
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
