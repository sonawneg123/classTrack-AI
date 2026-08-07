import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSnackbar } from "notistack";
import { authApi } from "@features/auth/api/authApi";
import { tokenStorage } from "@services/tokenStorage";
import { AUTH_SESSION_EXPIRED_EVENT } from "@utils/constants";
import type {
  AuthStatus,
  AuthUser,
  EmailLoginPayload,
  StudentLoginPayload,
} from "@/types/auth";
import type { Role } from "@/types/common";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (
    role: Role,
    credentials: EmailLoginPayload | StudentLoginPayload
  ) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("bootstrapping");
  const { enqueueSnackbar } = useSnackbar();

  // On first load: if tokens exist from a previous session, silently fetch
  // the current user to restore it (persistent login). The axios
  // interceptor transparently refreshes an expired access token here too.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!tokenStorage.hasSession()) {
        setStatus("unauthenticated");
        return;
      }
      try {
        const currentUser = await authApi.getCurrentUser();
        if (!cancelled) {
          setUser(currentUser);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          tokenStorage.clear();
          setUser(null);
          setStatus("unauthenticated");
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fired by the axios interceptor when a refresh attempt fails — keeps
  // context state in sync with token storage even outside the React tree.
  // Only toasts if the user actually had a session to lose (avoids a
  // spurious "session expired" toast for someone who was never logged in).
  useEffect(() => {
    function handleSessionExpired() {
      setUser((current) => {
        if (current) {
          enqueueSnackbar("Your session has expired. Please log in again.", {
            variant: "warning",
          });
        }
        return null;
      });
      setStatus("unauthenticated");
    }
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () =>
      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,
        handleSessionExpired
      );
  }, [enqueueSnackbar]);

  const login = useCallback(
    async (
      role: Role,
      credentials: EmailLoginPayload | StudentLoginPayload
    ): Promise<AuthUser> => {
      const { accessToken, refreshToken } =
        role === "admin"
          ? await authApi.loginAdmin(credentials as EmailLoginPayload)
          : role === "teacher"
            ? await authApi.loginTeacher(credentials as EmailLoginPayload)
            : await authApi.loginStudent(credentials as StudentLoginPayload);

      tokenStorage.setTokens({ accessToken, refreshToken });

      // Fetch the canonical, permission-rich user object — the login
      // response itself doesn't include `permissions`/`profile`, only
      // GET /auth/me does, so this keeps AuthUser to a single shape used
      // everywhere in the app rather than juggling two.
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
      setStatus("authenticated");

      enqueueSnackbar(`Welcome back, ${currentUser.name}.`, { variant: "success" });
      return currentUser;
    },
    [enqueueSnackbar]
  );

  const logout = useCallback(async () => {
    await authApi.logout(tokenStorage.getRefreshToken());
    tokenStorage.clear();
    setUser(null);
    setStatus("unauthenticated");
    enqueueSnackbar("You've been logged out.", { variant: "success" });
  }, [enqueueSnackbar]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated",
      login,
      logout,
    }),
    [user, status, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
