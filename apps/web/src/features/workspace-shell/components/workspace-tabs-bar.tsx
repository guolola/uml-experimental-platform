import { X } from "lucide-react";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceShell } from "../state";

export function WorkspaceTabsBar() {
  const {
    openTabs,
    activeTabId,
    activateWorkspaceTab,
    closeWorkspaceTab,
  } = useWorkspaceShell();

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-background px-4 [scrollbar-width:thin]">
      {openTabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={cn(
              "group flex h-8 max-w-52 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
              active
                ? "border-border bg-card text-foreground shadow-sm"
                : "border-transparent bg-secondary/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title={tab.label}
          >
            <button
              type="button"
              onClick={() => activateWorkspaceTab(tab.id)}
              className="min-w-0 flex-1 truncate text-left"
            >
              {tab.label}
            </button>
            <button
              type="button"
              aria-label={`关闭 ${tab.label}`}
              onClick={(event) => {
                event.stopPropagation();
                closeWorkspaceTab(tab.id);
              }}
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground",
                active ? "opacity-100" : "opacity-70 group-hover:opacity-100",
              )}
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
