import { MoreHorizontal, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/dropdown-menu";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceShell } from "../state";

export function WorkspaceTabsBar() {
  const {
    openTabs,
    activeTabId,
    activateWorkspaceTab,
    closeWorkspaceTab,
    closeOtherWorkspaceTabs,
    closeWorkspaceTabsByStage,
    openRequirementsText,
    openDesignHome,
    openWorkspacePlaceholder,
  } = useWorkspaceShell();

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:thin]">
        {openTabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={cn(
                "group flex h-8 min-w-28 max-w-48 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
                active
                  ? "border-border bg-card text-foreground shadow-sm"
                  : "border-transparent bg-secondary/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={tab.label}
            >
              <button
                type="button"
                onClick={() => activateWorkspaceTab(tab.id)}
                className="min-w-0 flex-1 cursor-pointer truncate text-left"
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
                  "inline-flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground",
                  active ? "opacity-100" : "opacity-70 group-hover:opacity-100",
                )}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="标签页操作"
            title="标签页操作"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={() => closeOtherWorkspaceTabs(activeTabId)}>
            关闭其他标签
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => closeWorkspaceTabsByStage(activeTabId)}>
            关闭同阶段标签
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openRequirementsText}>回到需求首页</DropdownMenuItem>
          <DropdownMenuItem onSelect={openDesignHome}>回到设计首页</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openWorkspacePlaceholder("code", "代码")}>
            回到代码页
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
