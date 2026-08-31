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
 * Admin/teacher login — email + password.
 */
export const emailLoginSchema = z.object({
  email: emailField,
  password: loginPassword,
});

/**
 * Student login — email OR mobile number + password.
 * The `identifier` field accepts either format; the backend resolves which
 * lookup to perform based on whether the value contains '@'.
 */
export const studentLoginSchema = z.object({
  identifier: z
    .string()
    .min(1, "Email or mobile number is required")
    .max(150, "Identifier is too long"),
  password: loginPassword,
});

/**
 * Union type for the login form values — the form stores either `email` (for
 * admin/teacher) or `identifier` (for student). We use a discriminated shape
 * so TypeScript is happy with both schemas sharing the same useForm generic.
 */
export type EmailLoginFormValues = z.infer<typeof emailLoginSchema>;
export type StudentLoginFormValues = z.infer<typeof studentLoginSchema>;

/**
 * @deprecated Use EmailLoginFormValues or StudentLoginFormValues instead.
 * Kept for the LoginForm component which uses a single useForm.
 */
export interface LoginFormValues {
  email?: string;
  identifier?: string;
  password: string;
}
