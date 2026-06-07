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
}) {
  return (
    <div
      data-workspace-density="status-rail"
      className={cn(
        "-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0",
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
}) {
  return (
    <div
      data-workspace-density="rail"
      className={cn(
        "-mx-1 flex min-w-0 snap-x gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:gap-2 md:overflow-visible md:px-0 md:pb-0",
        className,
      )}
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
        "min-w-[168px] shrink-0 snap-start md:min-w-0 md:shrink",
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
}) {
  return (
    <div
      data-workspace-density="compact-grid"
      className={cn(
        "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(156px,1fr))] gap-2 md:gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
