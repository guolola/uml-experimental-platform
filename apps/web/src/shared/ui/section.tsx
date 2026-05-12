import type { ReactNode } from "react";
import { cn } from "./utils";

export function Section({
  title,
  badge,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-2 px-3 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">{title}</h3>
          {badge}
        </div>
        {actions ? <div className="ml-auto shrink-0">{actions}</div> : null}
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}
