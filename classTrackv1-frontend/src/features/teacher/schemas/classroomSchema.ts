import { z } from "zod";

export const classroomFormSchema = z.object({
  name: z
    .string()
    .min(2, "Classroom name must be at least 2 characters")
    .max(150, "Classroom name must be at most 150 characters"),
  subject: z.string().max(100, "Subject must be at most 100 characters").optional().or(z.literal("")),
  section: z.string().max(50, "Section must be at most 50 characters").optional().or(z.literal("")),
});

export type ClassroomFormSchema = z.infer<typeof classroomFormSchema>;
