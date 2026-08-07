import { useState, type ReactNode } from "react";
import { Box } from "@mui/material";
import { useAuth } from "@app/AuthProvider";
import { Sidebar } from "@components/layout/Sidebar";
import { Topbar } from "@components/layout/Topbar";
import { Footer } from "@components/layout/Footer";
import { PageHeader } from "@components/navigation/PageHeader";
import type { BreadcrumbItem } from "@components/navigation/Breadcrumbs";
import { SIDEBAR_WIDTH } from "./navConfig";

interface DashboardLayoutProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Shared chrome for every role dashboard: responsive sidebar (permanent on
 * desktop, drawer on mobile), sticky topbar, page header, scrollable
 * content area, and footer. Role comes from the authenticated user so the
 * sidebar nav automatically matches whoever is signed in.
 */
export function DashboardLayout({
  title,
  description,
  breadcrumbs,
  actions,
  children,
}: DashboardLayoutProps) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar role={user.role} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          width: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
        }}
      >
        <Topbar onMenuClick={() => setMobileOpen(true)} />

        <Box
          component="main"
          sx={{
            flex: 1,
            p: { xs: 2, sm: 3 },
            bgcolor: "background.default",
          }}
        >
          <PageHeader title={title} description={description} breadcrumbs={breadcrumbs} actions={actions} />
          {children}
        </Box>

        <Footer />
      </Box>
    </Box>
  );
}
