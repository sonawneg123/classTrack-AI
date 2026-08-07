import { useRef, useState, type SyntheticEvent } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@app/AuthProvider";
import { getErrorMessage } from "@utils/apiError";
import { getDashboardPathForRole } from "@utils/roleRoutes";
import type { Role } from "@/types/common";
import type { EmailLoginPayload, StudentLoginPayload } from "@/types/auth";
import {
  emailLoginSchema,
  studentLoginSchema,
  type LoginFormValues,
} from "../schemas/loginSchema";

const ROLE_TABS: { value: Role; label: string }[] = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "admin", label: "Admin" },
];

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState<Role>("teacher");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Kept in a ref so the resolver below always validates against the
  // *currently selected* role tab — react-hook-form calls `resolver` fresh
  // on every validation, so reading a ref here (rather than closing over
  // `role` state at mount time) keeps it accurate across tab switches.
  const roleRef = useRef(role);
  roleRef.current = role;

  const resolver: Resolver<LoginFormValues> = (values, context, options) => {
    const schema = roleRef.current === "student" ? studentLoginSchema : emailLoginSchema;
    // Both schemas validate into the same LoginFormValues shape (see
    // loginSchema.ts) — the cast just bridges zodResolver's per-schema
    // inferred type to that shared shape.
    return zodResolver(schema)(values, context, options) as ReturnType<
      Resolver<LoginFormValues>
    >;
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver,
    defaultValues: { email: "", username: "", password: "" },
  });

  const redirectTo = (location.state as { from?: string } | null)?.from;

  const handleRoleChange = (_event: SyntheticEvent, next: Role) => {
    setRole(next);
    setFormError(null);
    reset({ email: "", username: "", password: "" });
  };

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      const user =
        role === "student"
          ? await login(role, { username: values.username!, password: values.password } satisfies StudentLoginPayload)
          : await login(role, { email: values.email!, password: values.password } satisfies EmailLoginPayload);
      navigate(redirectTo ?? getDashboardPathForRole(user.role), {
        replace: true,
      });
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Tabs
        value={role}
        onChange={handleRoleChange}
        variant="fullWidth"
        sx={{ mb: 3, minHeight: 40 }}
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

      <Box
        component="form"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        sx={{ display: "flex", flexDirection: "column", gap: 2.5, width: "100%" }}
      >
        {formError && (
          <Alert severity="error" onClose={() => setFormError(null)}>
            {formError}
          </Alert>
        )}

        {role === "student" ? (
          <TextField
            label="Username"
            autoComplete="username"
            autoFocus
            fullWidth
            error={Boolean(errors.username)}
            helperText={errors.username?.message}
            {...register("username")}
          />
        ) : (
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            fullWidth
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            {...register("email")}
          />
        )}

        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
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

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting}
          startIcon={
            isSubmitting ? (
              <CircularProgress size={18} color="inherit" />
            ) : undefined
          }
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </Box>
    </Box>
  );
}
