import { z } from "zod";
import { emailField } from "./loginSchema";
import { mobileField, registrationPasswordField } from "./studentRegisterSchema";

export const teacherCodeField = z
  .string()
  .min(4, "Enter a valid teacher registration code")
  .max(32, "Teacher code is too long")
  .regex(
    /^[A-Za-z0-9\-]+$/,
    "Teacher code should only contain letters, numbers, or dashes"
  );

export const teacherRegisterSchema = z
  .object({
    name: z
      .string()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name is too long"),
    email: emailField,
    mobile: mobileField.optional().or(z.literal("")),
    teacherCode: teacherCodeField,
    password: registrationPasswordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type TeacherRegisterFormValues = z.infer<typeof teacherRegisterSchema>;
