import type { Role } from "./common";

/** Role-specific safe profile fields, exactly as returned by GET /auth/me. */
export interface AuthUserProfile {
  isActive: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  // admin / teacher only
  email?: string | null;
  emailVerifiedAt?: string | null;
  // student only
  username?: string | null;
  classroomId?: number | null;
}

/** Canonical user shape used everywhere in the app — sourced from GET /auth/me,
 *  both right after login and on every session bootstrap, so there is only
 *  ever one shape of "the current user" to work with. */
export interface AuthUser {
  id: number;
  name: string;
  role: Role;
  permissions: string[];
  profile: AuthUserProfile;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Admin and teacher both authenticate with email + password. */
export interface EmailLoginPayload {
  email: string;
  password: string;
}

/** Students authenticate with username + password — no email on file. */
export interface StudentLoginPayload {
  username: string;
  password: string;
}

/** The `user` object embedded directly in a login response. Deliberately
 *  NOT used as the app's canonical AuthUser — it lacks `permissions` and
 *  `profile`, which only GET /auth/me provides. AuthProvider fetches /me
 *  immediately after login instead of trying to reshape this. */
export interface LoginResponseUser {
  id: number;
  name: string;
  role: Role;
  email?: string;
  username?: string;
  classroomId?: number;
  classroomName?: string;
}

export interface LoginResponseData extends TokenPair {
  permissions: string[];
  user: LoginResponseUser;
}

export interface RefreshResponseData {
  accessToken: string;
  refreshToken: string;
  permissions: string[];
}

/**
 * bootstrapping   — checking persisted tokens / fetching current user on app load
 * authenticated   — valid session, `user` is populated
 * unauthenticated — no valid session
 */
export type AuthStatus = "bootstrapping" | "authenticated" | "unauthenticated";
