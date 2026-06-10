// Provides compact workspace navigation without leaking mobile layout logic into feature pages.
import {
  BookOpen,
  Code2,
  FileText,
  ListTree,
  Palette,
  TestTube2,
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
import {
  stageForSelection,
  useWorkspaceShell,
  type WorkspaceStage,
} from "../state";
import { SidebarMenu } from "./sidebar-menu";

const mobileStages: Array<{
  id: WorkspaceStage;
  label: string;
  icon: typeof FileText;
  open: (shell: ReturnType<typeof useWorkspaceShell>) => void;
}> = [
  {
    id: "requirements",
    label: "需求",
    icon: FileText,
    open: (shell) => shell.openRequirementsText(),
  },
  {
    id: "design",
    label: "设计",
    icon: Palette,
    open: (shell) => shell.openDesignHome(),
  },
  {
    id: "code",
    label: "代码",
    icon: Code2,
    open: (shell) => shell.openWorkspacePlaceholder("code", "代码"),
  },
  {
    id: "test",
    label: "测试",
    icon: TestTube2,
    open: (shell) => shell.openTestHome(),
  },
  {
    id: "documents",
    label: "说明书",
    icon: BookOpen,
    open: (shell) => shell.openDocumentsHome(),
  },
];

export function MobileWorkspaceNavigation() {
  const shell = useWorkspaceShell();
  const activeStage = stageForSelection(shell.selection);

  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className="absolute bottom-[78px] left-3 z-30 h-10 rounded-full border border-border bg-card px-3 text-xs shadow-lg"
            aria-label="打开项目导航"
          >
            <ListTree className="size-4" />
            项目导航
          </Button>
        </DialogTrigger>
        <DialogContent className="bottom-0 left-0 top-auto flex h-[85dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-b-none rounded-t-xl p-0 sm:max-w-none">
          <DialogHeader className="border-b border-border px-4 py-3 text-left">
            <DialogTitle>项目导航</DialogTitle>
            <DialogDescription>
              切换模型、图表、追踪矩阵和阶段内页面。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <SidebarMenu />
          </div>
        </DialogContent>
      </Dialog>

      <nav
        aria-label="工作台阶段"
        className="grid h-[66px] shrink-0 grid-cols-5 border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur"
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
              <span className="max-w-full truncate">{stage.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
