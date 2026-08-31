import { z } from "zod";
import { emailField } from "./loginSchema";

/**
 * Mobile validation: accepts common formats, server normalises to E.164.
 * Accepted examples:
 *   +919876543210, +91 98765 43210, 09876543210, 9876543210
 */
export const mobileField = z
  .string()
  .min(7, "Enter a valid mobile number")
  .max(20, "Mobile number is too long")
  .regex(
    /^\+?[\d\s\-]{7,15}$/,
    "Enter a valid mobile number (digits, spaces, or dashes only)"
  );

/**
 * Password requirements for self-registration.
 * Min 8 chars, must contain at least one letter and one digit.
 */
export const registrationPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const classCodeField = z
  .string()
  .min(4, "Enter a valid classroom code")
  .max(12, "Classroom code is too long")
  .regex(/^[A-Za-z0-9]+$/, "Classroom code should only contain letters and numbers");

export const studentRegisterSchema = z
  .object({
    name: z
      .string()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name is too long"),
    email: emailField,
    mobile: mobileField,
    classCode: classCodeField,
    password: registrationPasswordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type StudentRegisterFormValues = z.infer<typeof studentRegisterSchema>;
