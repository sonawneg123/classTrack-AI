import type { ReactNode } from "react";
import { DashboardCard } from "@components/cards/DashboardCard";
import { LoadingSkeleton } from "@components/feedback/LoadingSkeleton";
import { EmptyState } from "@components/feedback/EmptyState";

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  height?: number;
  children: ReactNode;
}

export function ChartContainer({
  title,
  subtitle,
  isLoading,
  isEmpty,
  height = 280,
  children,
}: ChartContainerProps) {
  return (
    <DashboardCard title={title} subtitle={subtitle}>
      {isLoading ? (
        <LoadingSkeleton variant="chart" height={height} />
      ) : isEmpty ? (
        <EmptyState title="No data yet" description="Data will appear here once it's available." />
      ) : (
        <div style={{ width: "100%", height }}>{children}</div>
      )}
    </DashboardCard>
  );
}
