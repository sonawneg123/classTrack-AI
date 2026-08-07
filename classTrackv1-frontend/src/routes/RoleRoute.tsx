import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@app/AuthProvider";
import { ROUTES } from "@utils/constants";
import type { Role } from "@/types/common";

/**
 * Nest inside <ProtectedRoute> — assumes authentication has already been
 * confirmed, and additionally restricts access to the given roles.
 */
export function RoleRoute({ allowedRoles }: { allowedRoles: Role[] }) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={ROUTES.FORBIDDEN} replace />;
  }

  return <Outlet />;
}
