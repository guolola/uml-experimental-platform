// Shared Bento-style model target card used by workspace generation stages.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Checkbox } from "../../../shared/ui/checkbox";
import { cn } from "../../../shared/ui/utils";

type ModelBentoCardProps = {
  label: string;
  english: string;
  description: string;
  icon: LucideIcon;
  selected: boolean;
  disabled?: boolean;
  countLabel?: ReactNode;
  pendingReview?: boolean;
  title?: string;
  ariaLabel: string;
  checkboxLabel: string;
  status: ReactNode;
  details?: ReactNode;
  className?: string;
  statusClassName?: string;
  onSelectedChange: (selected: boolean) => void;
};

export function ModelBentoCard({
  label,
  english,
  description,
  icon: Icon,
  selected,
  disabled = false,
  countLabel,
  pendingReview = false,
  title,
  ariaLabel,
  checkboxLabel,
  status,
  details,
  className,
  statusClassName,
  onSelectedChange,
}: ModelBentoCardProps) {
  const handleToggle = () => {
    if (!disabled) {
      onSelectedChange(!selected);
    }
  };

  return (
    <article
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      onClick={handleToggle}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleToggle();
        }
      }}
      className={cn(
        "group relative flex min-h-[236px] min-w-0 flex-col justify-between overflow-hidden rounded-lg border border-border/80 bg-card/90 bg-gradient-to-br from-card/95 to-card/60 p-4 shadow-sm shadow-primary/5 backdrop-blur-[10px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:p-5",
        selected &&
          "border-primary/35 shadow-lg shadow-primary/10 ring-1 ring-primary/10",
        disabled
          ? "cursor-not-allowed border-dashed bg-muted/30 opacity-85 shadow-none"
          : "cursor-pointer hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md hover:shadow-primary/10",
        className,
      )}
    >
      {selected && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-primary/80"
        />
      )}

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/10 bg-primary/10 text-primary shadow-inner shadow-primary/5",
                disabled && "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3
                  className={cn(
                    "text-base font-semibold leading-6 text-foreground",
                    selected && "text-primary",
                    disabled && "text-muted-foreground",
                  )}
                >
                  {label}
                </h3>
                <span className="font-mono text-xs leading-5 text-muted-foreground">
                  {english}
                </span>
                {pendingReview && (
                  <Badge
                    variant="warning"
                    className="rounded-md px-1.5 py-0 text-[10px]"
                  >
                    待审
                  </Badge>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {countLabel !== undefined && (
              <span
                className={cn(
                  "rounded-md bg-accent px-2 py-0.5 font-mono text-xs font-semibold text-accent-foreground",
                  disabled && "bg-muted text-muted-foreground",
                )}
              >
                {countLabel}
              </span>
            )}
            <Checkbox
              checked={selected}
              disabled={disabled}
              name={checkboxLabel}
              aria-label={checkboxLabel}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onCheckedChange={(value) => onSelectedChange(Boolean(value))}
            />
          </div>
        </div>

        {details && <div className="mt-4">{details}</div>}
      </div>

      <div
        className={cn(
          "mt-5 rounded-lg border border-border/70 bg-secondary/80 px-3 py-3 text-xs leading-5 text-muted-foreground",
          disabled && "border-dashed bg-muted/50",
          statusClassName,
        )}
      >
        {status}
      </div>
    </article>
  );
}
