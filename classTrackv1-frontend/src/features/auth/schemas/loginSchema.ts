import { z } from "zod";

/**
 * Password for login: just non-empty (server verifies against hash).
 */
const loginPassword = z.string().min(1, "Password is required");

/**
 * Shared email validation rule.
 */
export const emailField = z
  .string()
  .min(1, "Email is required")
  .email("Enter a valid email address");

/**
 * Both admin/teacher and student tabs now authenticate by email.
 * Both schemas validate into the SAME shape (LoginFormValues) so
 * the login form can use a single `useForm` generic.
 */
export const emailLoginSchema = z.object({
  email: emailField,
  password: loginPassword,
});

export const studentLoginSchema = z.object({
  email: emailField,
  password: loginPassword,
});

export interface LoginFormValues {
  email: string;
  password: string;
}
