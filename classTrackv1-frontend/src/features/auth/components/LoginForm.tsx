import { useState, type SyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
import { useAuth } from "@app/AuthProvider";
import { getAuthErrorMessage } from "@utils/apiError";
import { getDashboardPathForRole } from "@utils/roleRoutes";
import type { Role } from "@/types/common";
import type { EmailLoginPayload, StudentLoginPayload } from "@/types/auth";
import {
  emailLoginSchema,
  studentLoginSchema,
} from "../schemas/loginSchema";
import { ROUTES } from "@utils/constants";

const ROLE_TABS: { value: Role; label: string }[] = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "admin", label: "Admin" },
];

// The form field name differs by role:
//   admin / teacher → "email"
//   student         → "identifier" (email OR mobile)
type EmailFormValues = { email: string; password: string };
type StudentFormValues = { identifier: string; password: string };

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState<Role>("teacher");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);

  const isStudent = role === "student";

  // Admin/teacher form — email field
  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Student form — identifier field (email OR mobile)
  const studentForm = useForm<StudentFormValues>({
    resolver: zodResolver(studentLoginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const { formState: emailErrors, register: registerEmail } = emailForm;
  const { formState: studentErrors, register: registerStudent } = studentForm;

  const redirectTo = (location.state as { from?: string } | null)?.from;

  const handleRoleChange = (_event: SyntheticEvent, next: Role) => {
    setRole(next);
    setFormError(null);
    setErrorType(null);
    emailForm.reset({ email: "", password: "" });
    studentForm.reset({ identifier: "", password: "" });
  };

  const onSubmitEmail = async (values: EmailFormValues) => {
    setFormError(null);
    setErrorType(null);
    try {
      const payload: EmailLoginPayload = {
        email: values.email,
        password: values.password,
      };
      const user = await login(role, payload);
      navigate(redirectTo ?? getDashboardPathForRole(user.role), { replace: true });
    } catch (error) {
      const { message, type } = getAuthErrorMessage(error);
      setFormError(message);
      setErrorType(type);
    }
  };

  const onSubmitStudent = async (values: StudentFormValues) => {
    setFormError(null);
    setErrorType(null);
    try {
      const payload: StudentLoginPayload = {
        identifier: values.identifier,
        password: values.password,
      };
      const user = await login(role, payload);
      navigate(redirectTo ?? getDashboardPathForRole(user.role), { replace: true });
    } catch (error) {
      const { message, type } = getAuthErrorMessage(error);
      setFormError(message);
      setErrorType(type);
    }
  };

  const isSubmitting = isStudent
    ? studentForm.formState.isSubmitting
    : emailForm.formState.isSubmitting;

  return (
    <Box sx={{ width: "100%" }}>
      <Tabs
        value={role}
        onChange={handleRoleChange}
        variant="fullWidth"
        sx={{ mb: 3, minHeight: 40 }}
        aria-label="Sign in as"
      >
        {ROLE_TABS.map((tab) => (
          <Tab
            key={tab.value}
            value={tab.value}
            label={tab.label}
            sx={{ minHeight: 40, py: 1 }}
          />
        ))}
      </Tabs>

      {isStudent ? (
        /* ── Student login form — email OR mobile ────────────────────────── */
        <Box
          component="form"
          noValidate
          onSubmit={studentForm.handleSubmit(onSubmitStudent)}
          sx={{ display: "flex", flexDirection: "column", gap: 2.5, width: "100%" }}
          aria-label="Student sign in form"
        >
          {formError && (
            <Alert
              severity={
                errorType === "network" || errorType === "server" ? "warning" : "error"
              }
              onClose={() => { setFormError(null); setErrorType(null); }}
              role="alert"
              aria-live="polite"
            >
              {formError}
            </Alert>
          )}

          <TextField
            label="Email or mobile number"
            autoComplete="username"
            autoFocus
            fullWidth
            error={Boolean(studentErrors.errors.identifier)}
            helperText={studentErrors.errors.identifier?.message}
            inputProps={{ "aria-label": "Email or mobile number" }}
            placeholder="e.g. student@school.com or +91 9876543210"
            {...registerStudent("identifier")}
          />

          <Box>
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              fullWidth
              error={Boolean(studentErrors.errors.password)}
              helperText={studentErrors.errors.password?.message}
              inputProps={{ "aria-label": "Password" }}
              {...registerStudent("password")}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((prev) => !prev)}
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
            <Box sx={{ mt: 0.75, textAlign: "right" }}>
              <Link
                component={RouterLink}
                to={ROUTES.FORGOT_PASSWORD}
                variant="body2"
                underline="hover"
                color="text.secondary"
              >
                Forgot your password?
              </Link>
            </Box>
          </Box>

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            startIcon={
              isSubmitting ? (
                <CircularProgress size={18} color="inherit" aria-hidden="true" />
              ) : undefined
            }
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>

          <Typography variant="body2" align="center" color="text.secondary">
            New student?{" "}
            <Link
              component={RouterLink}
              to={ROUTES.STUDENT_REGISTER}
              underline="hover"
              color="primary"
            >
              Create student account
            </Link>
          </Typography>
        </Box>
      ) : (
        /* ── Admin / Teacher login form — email only ─────────────────────── */
        <Box
          component="form"
          noValidate
          onSubmit={emailForm.handleSubmit(onSubmitEmail)}
          sx={{ display: "flex", flexDirection: "column", gap: 2.5, width: "100%" }}
          aria-label="Sign in form"
        >
          {formError && (
            <Alert
              severity={
                errorType === "network" || errorType === "server" ? "warning" : "error"
              }
              onClose={() => { setFormError(null); setErrorType(null); }}
              role="alert"
              aria-live="polite"
            >
              {formError}
              {errorType === "email_unverified" && (role === "admin" || role === "teacher") && (
                <Box component="span" sx={{ display: "block", mt: 0.5 }}>
                  <Link
                    component={RouterLink}
                    to={ROUTES.LOGIN}
                    underline="hover"
                    color="inherit"
                    sx={{ fontWeight: 600 }}
                  >
                    Contact your administrator to resend the verification email.
                  </Link>
                </Box>
              )}
            </Alert>
          )}

          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            fullWidth
            error={Boolean(emailErrors.errors.email)}
            helperText={emailErrors.errors.email?.message}
            inputProps={{ "aria-label": "Email address" }}
            {...registerEmail("email")}
          />

          <Box>
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              fullWidth
              error={Boolean(emailErrors.errors.password)}
              helperText={emailErrors.errors.password?.message}
              inputProps={{ "aria-label": "Password" }}
              {...registerEmail("password")}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((prev) => !prev)}
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
            <Box sx={{ mt: 0.75, textAlign: "right" }}>
              <Link
                component={RouterLink}
                to={ROUTES.FORGOT_PASSWORD}
                variant="body2"
                underline="hover"
                color="text.secondary"
              >
                Forgot your password?
              </Link>
            </Box>
          </Box>

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            startIcon={
              isSubmitting ? (
                <CircularProgress size={18} color="inherit" aria-hidden="true" />
              ) : undefined
            }
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>

          {role === "teacher" && (
            <Typography variant="body2" align="center" color="text.secondary">
              New teacher?{" "}
              <Link
                component={RouterLink}
                to={ROUTES.TEACHER_REGISTER}
                underline="hover"
                color="primary"
              >
                Create teacher account
              </Link>
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
