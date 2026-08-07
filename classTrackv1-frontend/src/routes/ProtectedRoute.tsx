import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@app/AuthProvider";
import { FullPageLoader } from "@components/FullPageLoader";
import { ROUTES } from "@utils/constants";

/**
 * Guards any nested route tree behind a valid session. While the auth
 * context is bootstrapping (checking persisted tokens) we show a loader
 * instead of flashing the login page.
 */
export function ProtectedRoute() {
  const { status, isAuthenticated } = useAuth();
  const location = useLocation();

  if (status === "bootstrapping") {
    return <FullPageLoader label="Checking your session…" />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={ROUTES.LOGIN}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}
