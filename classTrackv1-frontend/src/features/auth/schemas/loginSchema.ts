import { z } from "zod";

/**
 * Password strength is enforced at registration/reset time on the backend
 * (min 6 chars there) — the LOGIN validators (auth.validator.js) only
 * require a non-empty string, since login just compares against a stored
 * hash. Matching that here: a stricter client-side rule would incorrectly
 * block valid logins for accounts with shorter passwords.
 */
const password = z.string().min(1, "Password is required");

/**
 * Both schemas validate into the SAME shape (LoginFormValues, below) —
 * one field is required and format-checked, the other stays optional and
 * unused for that role. This lets the login form use a single `useForm`
 * generic (not a union), so every `register(...)` call type-checks
 * cleanly regardless of which role tab is active.
 */
export const emailLoginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  username: z.string().optional(),
  password,
});

export const studentLoginSchema = z.object({
  email: z.string().optional(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters"),
  password,
});

export interface LoginFormValues {
  email?: string;
  username?: string;
  password: string;
}
