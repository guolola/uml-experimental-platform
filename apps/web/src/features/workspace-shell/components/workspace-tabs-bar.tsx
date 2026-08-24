import { MoreHorizontal, X } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/dropdown-menu";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceShell } from "../state";
import { useCompactViewport } from "../hooks/use-compact-viewport";

function localizeWorkspaceTabLabel(label: string, t: TFunction) {
  const exact: Record<string, string> = {
    需求: t("workspace.tabs.labels.requirements"),
    设计: t("workspace.tabs.labels.design"),
    代码: t("workspace.tabs.labels.code"),
    测试: t("workspace.tabs.labels.tests"),
    说明书: t("workspace.tabs.labels.documents"),
    系统需求: t("workspace.tabs.labels.systemRequirements"),
    可行性分析: t("workspace.tabs.labels.feasibility"),
    需求模型: t("workspace.tabs.labels.requirements"),
    设计模型: t("workspace.tabs.labels.design"),
    "系统上下文图（系统环境图）": t("workspace.tabs.labels.contextDiagram"),
    上下文跟踪矩阵: t("workspace.tabs.labels.contextTrace"),
    上下文元素: t("workspace.tabs.labels.contextElements"),
    上下文关系: t("workspace.tabs.labels.contextRelations"),
    实现方案: t("workspace.tabs.labels.implementation"),
    跟踪矩阵: t("workspace.tabs.labels.traceability"),
  };
  return exact[label] ?? label;
}

export function WorkspaceTabsBar() {
  const { t } = useTranslation();
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
  const compactViewport = useCompactViewport();

  if (compactViewport) {
    return (
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-2">
        <div
          data-testid="workspace-mobile-tab-strip"
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:thin]"
        >
          {openTabs.map((tab) => {
            const active = tab.id === activeTabId;
            const tabLabel = localizeWorkspaceTabLabel(tab.label, t);
            return (
              <div
                key={tab.id}
                className={cn(
                  "group flex h-8 w-28 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[12px] font-medium transition-colors",
                  active
                    ? "border-border bg-card text-foreground shadow-sm"
                    : "border-transparent bg-secondary/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title={tabLabel}
              >
                <button
                  type="button"
                  onClick={() => activateWorkspaceTab(tab.id)}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left"
                >
                  {tabLabel}
                </button>
                <button
                  type="button"
                  aria-label={t("workspace.tabs.closeTab", { label: tabLabel })}
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
              aria-label={t("workspace.tabs.actions")}
              title={t("workspace.tabs.actions")}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuLabel>{t("workspace.tabs.openTabs")}</DropdownMenuLabel>
            {openTabs.map((tab) => (
              <DropdownMenuItem key={tab.id} onSelect={() => activateWorkspaceTab(tab.id)}>
                <span className="max-w-32 truncate">{localizeWorkspaceTabLabel(tab.label, t)}</span>
                {tab.id === activeTabId && (
                  <span className="ml-auto text-xs text-primary">{t("workspace.tabs.current")}</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => closeOtherWorkspaceTabs(activeTabId)}>
              {t("workspace.tabs.closeOthers")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => closeWorkspaceTabsByStage(activeTabId)}>
              {t("workspace.tabs.closeSameStage")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={openRequirementsText}>{t("workspace.tabs.requirementsHome")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={openDesignHome}>{t("workspace.tabs.designHome")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openWorkspacePlaceholder("code", t("workspace.tabs.code"))}>
              {t("workspace.tabs.codeHome")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

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
              title={localizeWorkspaceTabLabel(tab.label, t)}
            >
              <button
                type="button"
                onClick={() => activateWorkspaceTab(tab.id)}
                className="min-w-0 flex-1 cursor-pointer truncate text-left"
              >
                {localizeWorkspaceTabLabel(tab.label, t)}
              </button>
              <button
                type="button"
                aria-label={t("workspace.tabs.closeTab", {
                  label: localizeWorkspaceTabLabel(tab.label, t),
                })}
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
            aria-label={t("workspace.tabs.actions")}
            title={t("workspace.tabs.actions")}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={() => closeOtherWorkspaceTabs(activeTabId)}>
            {t("workspace.tabs.closeOthers")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => closeWorkspaceTabsByStage(activeTabId)}>
            {t("workspace.tabs.closeSameStage")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openRequirementsText}>{t("workspace.tabs.requirementsHome")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={openDesignHome}>{t("workspace.tabs.designHome")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openWorkspacePlaceholder("code", t("workspace.tabs.code"))}>
            {t("workspace.tabs.codeHome")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
