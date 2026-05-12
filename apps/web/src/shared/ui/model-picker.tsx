import { Check, Cpu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "./utils";
import {
  MODEL_VENDORS,
  getModelCapability,
  getModelDisplayName,
  getModelOption,
  getModelVendor,
} from "../lib/model-catalog";

export function ModelPicker({
  value,
  onValueChange,
  align = "start",
  triggerClassName,
  fullWidth = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  align?: "start" | "center" | "end";
  triggerClassName?: string;
  fullWidth?: boolean;
}) {
  const display = getModelDisplayName(value);
  const selectedVendor = getModelVendor(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent",
            fullWidth && "w-full justify-between rounded-md px-3 py-2 text-left",
            triggerClassName,
          )}
          title="切换模型"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{display.triggerLabel}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-56">
        {MODEL_VENDORS.map((vendor) => (
          <DropdownMenuSub key={vendor.id}>
            <DropdownMenuSubTrigger className="gap-2 text-xs">
              <span className="font-medium">{vendor.label}</span>
              {selectedVendor.id === vendor.id && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {getModelOption(value)?.shortLabel}
                </span>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52">
              {vendor.models.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onSelect={() => onValueChange(model.id)}
                  className="flex items-center justify-between gap-3 text-xs"
                  title={model.fullLabel}
                >
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2">
                      <span>{model.shortLabel}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {getModelCapability(model.id).modeLabel}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {model.fullLabel}
                    </span>
                  </span>
                  {model.id === value && (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
