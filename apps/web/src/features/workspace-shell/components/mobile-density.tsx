// Provides compact mobile layout primitives for workspace pages without changing business data flow.
import type { ReactNode } from "react";
import { cn } from "../../../shared/ui/utils";

export const mobileTouchTargetClass = "min-h-11";

export function MobileStatusRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <div
      data-workspace-density="status-rail"
      className={cn(
        "grid min-w-0 grid-cols-2 gap-2 min-[430px]:grid-cols-3 md:flex md:flex-wrap",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MobileStatusPill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-workspace-density="status-pill"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground shadow-sm md:h-8",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MobileRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <div
      data-workspace-density="rail"
      className={cn("grid min-w-0 grid-cols-1 gap-2 md:grid md:gap-2", className)}
    >
      {children}
    </div>
  );
}

export function MobileRailCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-workspace-density="rail-card"
      className={cn(
        "min-w-0 snap-start",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MobileCompactGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <div
      data-workspace-density="compact-grid"
      data-mobile-card-density="two-column"
      className={cn(
        "grid min-w-0 grid-cols-2 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
