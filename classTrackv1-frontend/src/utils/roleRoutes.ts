import { ROUTES } from "@utils/constants";
import type { Role } from "@/types/common";

export function getDashboardPathForRole(role: Role): string {
  switch (role) {
    case "admin":
      return ROUTES.ADMIN.DASHBOARD;
    case "teacher":
      return ROUTES.TEACHER.DASHBOARD;
    case "student":
      return ROUTES.STUDENT.DASHBOARD;
    default:
      return ROUTES.ROOT;
  }
}
