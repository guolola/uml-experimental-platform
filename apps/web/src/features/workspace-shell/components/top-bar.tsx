import {
  Boxes,
  Download,
  FileCode2,
  FileText,
  History,
  Moon,
  Palette,
  Settings,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import type { RunSnapshot } from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { SettingsDialog } from "../../settings/components/settings-dialog";
import { useTheme } from "../../../app/providers/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../shared/ui/dropdown-menu";
import { buildRunMarkdownReport } from "../../history";
import { downloadTextFile } from "../../../shared/lib/download";
import { useWorkspaceSession } from "../../workspace-session/state";
import { useWorkspaceShell } from "../state";

export type ShellRoutePath = "/" | "/exam" | "/tutorial" | "/about";

type TopBarProps = {
  currentRoute: ShellRoutePath;
  onNavigate: (route: ShellRoutePath) => void;
};

export function TopBar({ currentRoute, onNavigate }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const {
    requirementText,
    rules,
    models,
    svgArtifacts,
    diagramErrors,
    selectedDiagrams,
    runStatus,
    errorMessage,
  } =
    useWorkspaceSession();
  const { openHistoryDrawer } = useWorkspaceShell();

  const currentSnapshot = (): RunSnapshot => ({
    runId: "workspace-current",
    requirementText,
    selectedDiagrams,
    rules,
    models: Object.values(models).filter((model) => !!model),
    plantUml: [],
    svgArtifacts: Object.values(svgArtifacts).filter((artifact) => !!artifact),
    diagramErrors,
    currentStage: null,
    status: runStatus === "idle" ? "completed" as const : runStatus,
    errorMessage,
  });

  const exportMarkdown = () => {
    if (!rules.length && !requirementText.trim()) {
      toast.message("暂无内容可导出");
      return;
    }
    downloadTextFile(
      "uml-run-report.md",
      buildRunMarkdownReport(currentSnapshot()),
      "text/markdown",
    );
    toast.success("已导出 uml-run-report.md");
  };

  const exportJson = () => {
    downloadTextFile(
      "uml-run-snapshot.json",
      JSON.stringify(currentSnapshot(), null, 2),
      "application/json",
    );
    toast.success("已导出 uml-run-snapshot.json");
  };

  const navItems = [
    {
      label: "首页",
      route: "/" as const,
    },
    {
      label: "考试",
      route: "/exam" as const,
    },
    {
      label: "教程",
      route: "/tutorial" as const,
    },
    {
      label: "关于",
      route: "/about" as const,
    },
  ];

  return (
    <header className="flex h-16 shrink-0 flex-nowrap items-center gap-6 overflow-hidden border-b border-transparent bg-sidebar px-5 text-sidebar-foreground">
      <div className="flex shrink-0 items-center gap-3">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[conic-gradient(from_160deg,#31d0ff,#8b5cf6,#ff5db1,#31d0ff)] shadow-sm">
          <Boxes className="size-4 text-white" />
        </span>
        <span className="whitespace-nowrap text-[22px] font-semibold tracking-normal">
          UML 实验平台
        </span>
      </div>

      <nav className="flex min-w-0 items-center gap-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-current={currentRoute === item.route ? "page" : undefined}
            onClick={() => onNavigate(item.route)}
            className="h-10 px-4 text-[17px] font-semibold text-sidebar-foreground/88 transition-colors hover:text-primary"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-12 shrink-0 rounded-full bg-secondary text-secondary-foreground shadow-none hover:bg-muted"
            title="导出"
            aria-label="导出"
          >
            <Download className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel>导出当前工作区</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={exportMarkdown}>
            <FileText className="size-4" /> 运行报告
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              .md
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportJson}>
            <FileCode2 className="size-4" /> 当前快照
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              .json
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 rounded-full bg-secondary text-secondary-foreground shadow-none hover:bg-muted"
        title="历史快照"
        aria-label="历史"
        onClick={openHistoryDrawer}
      >
        <History className="size-5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 rounded-full bg-secondary text-secondary-foreground shadow-none hover:bg-muted"
        onClick={toggle}
        title={theme === "dark" ? "切换到浅色" : "切换到深色"}
      >
        {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 rounded-full bg-secondary text-secondary-foreground shadow-none hover:bg-muted"
        onClick={() => toast.message("设计规范正在接入")}
        title="设计规范"
        aria-label="设计规范"
      >
        <Palette className="size-5" />
      </Button>
      <SettingsDialog />
      <div className="hidden h-12 shrink-0 items-center gap-2 rounded-full bg-secondary px-2.5 pr-3 text-sm font-semibold text-secondary-foreground md:flex">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
          U
        </span>
        <span>uml</span>
        <Settings className="size-4 text-muted-foreground" />
      </div>
      </div>
    </header>
  );
}
