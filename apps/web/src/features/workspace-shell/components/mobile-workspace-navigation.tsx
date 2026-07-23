// Provides compact workspace navigation without leaking mobile layout logic into feature pages.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Code2,
  FileText,
  ListTree,
  Palette,
  TestTube2,
  Wrench,
} from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/dialog";
import { cn } from "../../../shared/ui/utils";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import {
  stageForSelection,
  useWorkspaceShell,
  type WorkspaceStage,
} from "../state";
import { SidebarMenu } from "./sidebar-menu";

const mobileStages: Array<{
  id: WorkspaceStage;
  labelKey: string;
  label?: string;
  icon: typeof FileText;
  open: (shell: ReturnType<typeof useWorkspaceShell>) => void;
}> = [
  {
    id: "system-requirements",
    labelKey: "workspace.tabs.labels.systemRequirements",
    label: "系统需求",
    icon: FileText,
    open: (shell) => shell.openSystemRequirements(),
  },
  {
    id: "feasibility",
    labelKey: "workspace.tabs.labels.feasibility",
    label: "可行性",
    icon: Wrench,
    open: (shell) => shell.openFeasibilityHome(),
  },
  {
    id: "requirements",
    labelKey: "workspace.tabs.labels.requirements",
    icon: FileText,
    open: (shell) => shell.openRequirementsText(),
  },
  {
    id: "design",
    labelKey: "workspace.tabs.labels.design",
    icon: Palette,
    open: (shell) => shell.openDesignHome(),
  },
  {
    id: "code",
    labelKey: "workspace.tabs.labels.code",
    icon: Code2,
    open: (shell) => shell.openWorkspacePlaceholder("code", "代码"),
  },
  {
    id: "test",
    labelKey: "workspace.tabs.labels.tests",
    icon: TestTube2,
    open: (shell) => shell.openTestHome(),
  },
  {
    id: "documents",
    labelKey: "workspace.tabs.labels.documents",
    icon: BookOpen,
    open: (shell) => shell.openDocumentsHome(),
  },
];

export function MobileWorkspaceNavigation({
  projectRuns = [],
}: {
  projectRuns?: PlatformRunSummary[];
} = {}) {
  const { t } = useTranslation();
  const shell = useWorkspaceShell();
  const activeStage = stageForSelection(shell.selection);
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <>
      <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className="absolute bottom-[78px] left-3 z-30 h-10 rounded-full border border-border bg-card px-3 text-xs shadow-lg"
            aria-label={t("workspace.mobile.openProjectNavigation")}
          >
            <ListTree className="size-4" />
            {t("workspace.mobile.projectNavigation")}
          </Button>
        </DialogTrigger>
        <DialogContent className="bottom-0 left-0 top-auto flex h-[85dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-b-none rounded-t-xl p-0 sm:max-w-none">
          <DialogHeader className="border-b border-border px-4 py-3 text-left">
            <DialogTitle>{t("workspace.mobile.projectNavigation")}</DialogTitle>
            <DialogDescription>
              {t("workspace.mobile.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <SidebarMenu
              projectRuns={projectRuns}
              onNavigateItemSelect={() => setNavigationOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <nav
        aria-label={t("workspace.mobile.stageNavigation")}
        className="grid h-[66px] shrink-0 grid-cols-7 border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur"
      >
        {mobileStages.map((stage) => {
          const Icon = stage.icon;
          const active = activeStage === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium text-muted-foreground transition-colors",
                active && "bg-primary/10 text-primary",
              )}
              onClick={() => stage.open(shell)}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="max-w-full truncate">{stage.label ?? t(stage.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
