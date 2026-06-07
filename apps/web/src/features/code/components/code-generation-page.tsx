import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SandpackProvider } from "@codesandbox/sandpack-react";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Download,
  FolderTree,
  Info,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ModelPicker } from "../../../shared/ui/model-picker";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../../shared/ui/resizable";
import { downloadTextFile } from "../../../shared/lib/download";
import {
  getModelCapability,
} from "../../../shared/lib/model-catalog";
import {
  loadUserSettings,
  patchUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from "../../../shared/lib/user-settings";
import { cn } from "../../../shared/ui/utils";
import { DEFAULT_FILES } from "../lib/default-prototype-files";
import { fileLabel } from "../lib/file-paths";
import { isMonacoManualCancelation } from "../lib/monaco-extra-libs";
import { FileTree } from "./file-tree";
import { EditorBridge, MonacoFileModelSync } from "./file-editor";
import {
  LocalPrototypePreview,
  SandpackFileSync,
  type LocalPrototypePreviewHandle,
} from "./prototype-preview";
import { useWorkspaceSession } from "../../workspace-session/state";
import {
  MobileStatusPill,
  MobileStatusRail,
} from "../../workspace-shell/components/mobile-density";
import { useCompactViewport } from "../../workspace-shell/hooks/use-compact-viewport";
import { usePrototypeFiles } from "../hooks/use-prototype-files";


























export function CodeGenerationPage() {
  const {
    requirementText,
    designModels,
    codeSpec,
    codeFiles,
    codeEditVersion,
    codeEntryFile,
    codeDependencies,
    generating,
    runProgress,
    runMessage,
    generateCodePrototype,
    updateCodeFile,
  } = useWorkspaceSession();
  const compactViewport = useCompactViewport();
  const [mobilePane, setMobilePane] = useState<"files" | "editor" | "preview">("editor");
  const [defaultModel, setDefaultModel] = useState(
    () => loadUserSettings().defaultModel,
  );
  const {
    files,
    activeFile,
    setActiveFile,
    expandedDirs,
    sortedFiles,
    fileTree,
    updateFile,
    toggleDirectory,
  } = usePrototypeFiles({
    defaultFiles: DEFAULT_FILES,
    generatedFiles: codeFiles,
    entryFile: codeEntryFile,
    onFileChange: updateCodeFile,
  });
  const previewRef = useRef<LocalPrototypePreviewHandle | null>(null);
  const previewEditVersionRef = useRef(codeEditVersion);
  const manualPreviewEditPendingRef = useRef(false);
  const [previewFiles, setPreviewFiles] = useState<Record<string, string>>(() => ({ ...files }));
  const [previewState, setPreviewState] = useState<"success" | "pending" | "building" | "error">(
    () => (Object.keys(codeFiles).length > 0 ? "success" : "pending"),
  );
  const previewSandpackFiles = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(previewFiles).map(([path, code]) => [
          path,
          {
            code,
            active: path === activeFile,
          },
        ]),
      ),
    [activeFile, previewFiles],
  );

  useEffect(() => {
    const syncSettings = () => {
      setDefaultModel(loadUserSettings().defaultModel);
    };
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
  }, []);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isMonacoManualCancelation(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () =>
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  const modelCapability = getModelCapability(defaultModel);
  const designModelCount = Object.values(designModels).filter(Boolean).length;
  const canGenerate = designModelCount > 0 && requirementText.trim().length > 0;
  const generatedFileCount = Object.keys(codeFiles).length;
  const previewReady = generatedFileCount > 0 && Boolean(codeEntryFile || codeFiles["/src/main.tsx"]);
  const hasPreviewFiles = Object.keys(previewFiles).length > 0;
  const isRepairingGeneratedPrototype =
    generating &&
    previewReady &&
    /修复|覆盖检查|质量|验证|repair/i.test(runMessage ?? "");
  const codeStatus = isRepairingGeneratedPrototype
      ? {
          tone: "primary" as const,
          icon: Loader2,
          title: "预览已就绪，仍在完善输出",
          message:
            runMessage ??
            "可先查看和编辑当前原型，后台仍在补齐质量检查发现的问题。",
        }
      : generating
        ? {
            tone: "primary" as const,
            icon: Loader2,
            title: "正在生成前端原型",
            message: runMessage ?? "生成完成前，预览会在代码文件写入后自动刷新。",
          }
        : previewState === "pending" && previewReady
          ? {
              tone: "primary" as const,
              icon: Info,
              title: "有未运行的修改",
              message: "当前编辑内容尚未构建到预览，点击“运行预览”后再查看最新效果。",
            }
          : previewState === "building" && hasPreviewFiles
            ? {
                tone: "primary" as const,
                icon: Loader2,
                title: "正在构建预览",
                message: "正在把当前编辑内容构建到右侧预览。",
              }
            : previewState === "error" && hasPreviewFiles
              ? {
                  tone: "destructive" as const,
                  icon: AlertTriangle,
                  title: "预览构建失败",
                  message: "请根据预览区域的错误修复代码，然后再次运行预览。",
                }
              : previewReady
                ? {
                    tone: "success" as const,
                    icon: CheckCircle2,
                    title: "预览已更新",
                    message: "当前预览已经使用最新生成结果完成构建，可以查看、继续生成、重新生成或导出。",
                  }
                : canGenerate
                  ? {
                      tone: "muted" as const,
                      icon: Info,
                      title: "设计模型已就绪",
                      message: "点击“启动生成”后，代码区和预览区会随着文件生成自动更新。",
              }
            : null;
  const visibleDependencies = {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.487.0",
    "@radix-ui/react-checkbox": "^1.1.4",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-switch": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.3",
    "class-variance-authority": "^0.7.1",
    clsx: "^2.1.1",
    "tailwind-merge": "^3.2.0",
    ...codeDependencies,
  };
  const sandpackBundlerUrl =
    typeof window === "undefined"
      ? "/sandpack/index.html"
      : new URL("/sandpack/index.html", window.location.origin).toString();
  const updateModel = (model: string) => {
    setDefaultModel(model);
    patchUserSettings({ defaultModel: model });
  };

  useEffect(() => {
    if (!previewReady) return;
    if (manualPreviewEditPendingRef.current) return;
    if (codeEditVersion !== previewEditVersionRef.current) return;

    setPreviewFiles({ ...files });
    setPreviewState("success");
  }, [codeEditVersion, files, previewReady]);

  const handleFileChange = (path: string, value: string) => {
    manualPreviewEditPendingRef.current = true;
    updateFile(path, value);
    if (previewReady) {
      setPreviewState("pending");
    }
  };

  const runPreview = () => {
    manualPreviewEditPendingRef.current = false;
    previewEditVersionRef.current = codeEditVersion;
    setPreviewFiles({ ...files });
    setPreviewState("building");
  };

  const handlePreviewBuildStart = useCallback(() => {
    setPreviewState((current) => (current === "pending" ? current : "building"));
  }, []);

  const handlePreviewBuildReady = useCallback(() => {
    if (manualPreviewEditPendingRef.current) return;
    setPreviewState("success");
  }, []);

  const handlePreviewBuildError = useCallback(() => {
    if (manualPreviewEditPendingRef.current) return;
    setPreviewState("error");
  }, []);

  const exportBundle = () => {
    downloadTextFile(
      "frontend-prototype.sandpack.json",
      JSON.stringify(
        {
          spec: codeSpec,
          files,
          entryFile: activeFile,
          dependencies: visibleDependencies,
        },
        null,
        2,
      ),
      "application/json",
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div
        className={cn(
          "flex min-h-12 items-center gap-2 border-b border-border px-3",
          compactViewport && "min-h-0 flex-col items-stretch py-2",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            compactViewport && "w-full",
          )}
        >
          <Code2 className="size-4 text-primary" />
          <span className="truncate text-sm font-semibold">前端原型代码</span>
          {!compactViewport && (
            <>
              <Badge variant="secondary" className="font-mono">
                {sortedFiles.length} files
              </Badge>
              <Badge variant={modelCapability.supportsJsonSchema ? "secondary" : "outline"}>
                {modelCapability.modeLabel}
              </Badge>
            </>
          )}
        </div>
        {compactViewport && (
          <MobileStatusRail>
            <MobileStatusPill className="font-mono">
              {sortedFiles.length} files
            </MobileStatusPill>
            <MobileStatusPill>{modelCapability.modeLabel}</MobileStatusPill>
            <MobileStatusPill>设计模型 {designModelCount}</MobileStatusPill>
            {generating && (
              <MobileStatusPill>
                <Loader2 className="size-3.5 animate-spin" />
                {runProgress}%
              </MobileStatusPill>
            )}
          </MobileStatusRail>
        )}
        {!compactViewport && generating && (
          <div className="ml-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span className="truncate">{runMessage ?? "正在生成代码"}</span>
            <span className="font-mono">{runProgress}%</span>
          </div>
        )}
        <div
          className={cn(
            "ml-auto flex items-center gap-2",
            compactViewport && "ml-0 w-full overflow-x-auto pb-1",
          )}
        >
          <ModelPicker
            value={defaultModel}
            onValueChange={updateModel}
            align="end"
            triggerClassName={cn("h-8 bg-card", compactViewport && "h-10 shrink-0")}
          />
          <Button
            size="sm"
            className={cn("h-8", compactViewport && "h-10 shrink-0")}
            onClick={() =>
              void generateCodePrototype(
            generatedFileCount > 0 ? "continue" : "regenerate",
              )
            }
            disabled={!canGenerate || generating}
          >
            {generating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : generatedFileCount > 0 ? (
              <RefreshCw className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
            {generatedFileCount > 0 ? "继续生成" : "启动生成"}
          </Button>
          {generatedFileCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8", compactViewport && "h-10 shrink-0")}
              onClick={() => void generateCodePrototype("regenerate")}
              disabled={!canGenerate || generating}
            >
              {generating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              重新生成
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8", compactViewport && "h-10 shrink-0")}
            onClick={exportBundle}
            disabled={sortedFiles.length === 0}
          >
            <Download className="size-3.5" /> 导出
          </Button>
        </div>
      </div>

      {!canGenerate && (
        <div className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          <span>请先输入需求并生成设计模型，代码页会根据设计阶段模型生成 React 原型。</span>
        </div>
      )}
      {modelCapability.warning && (
        <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {modelCapability.warning}
        </div>
      )}
      {codeStatus && (
        <div
          className={cn(
            "flex items-start gap-2 border-b px-3 py-2 text-xs",
            codeStatus.tone === "destructive" &&
              "border-destructive/40 bg-destructive/10 text-destructive",
            codeStatus.tone === "success" &&
              "border-success/30 bg-success/10 text-success",
            codeStatus.tone === "primary" &&
              "border-primary/30 bg-primary/10 text-primary",
            codeStatus.tone === "muted" &&
              "border-border bg-muted/30 text-muted-foreground",
          )}
        >
          <codeStatus.icon
            className={cn(
              "mt-0.5 size-3.5 shrink-0",
              codeStatus.icon === Loader2 && "animate-spin",
            )}
          />
          <div className="min-w-0">
            <span className="font-semibold">{codeStatus.title}</span>
            <span className="mx-1 text-muted-foreground">·</span>
            <span className="text-foreground/80">{codeStatus.message}</span>
            {generating && (
              <span className="ml-2 font-mono text-muted-foreground">
                {runProgress}%
              </span>
            )}
          </div>
        </div>
      )}
      <SandpackProvider
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{
          display: "flex",
          flex: "1 1 0%",
          minHeight: 0,
          overflow: "hidden",
        }}
        template="vite-react-ts"
        files={previewSandpackFiles}
        customSetup={{
          entry: "/src/main.tsx",
          dependencies: visibleDependencies,
        }}
        options={{
          activeFile,
          visibleFiles: sortedFiles,
          bundlerURL: sandpackBundlerUrl,
          initMode: "immediate",
          recompileMode: "delayed",
          recompileDelay: 500,
        }}
      >
        <MonacoFileModelSync files={files} />
        <SandpackFileSync files={previewFiles} />
        {compactViewport ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="grid w-full min-w-0 grid-cols-3 gap-1 border-b border-border bg-card px-2 py-2">
              {[
                { id: "files" as const, label: "文件" },
                { id: "editor" as const, label: "编辑" },
                { id: "preview" as const, label: "预览" },
              ].map((pane) => (
                <button
                  key={pane.id}
                  type="button"
                  aria-pressed={mobilePane === pane.id}
                  className={cn(
                    "h-8 min-w-0 rounded-md text-xs font-medium transition-colors",
                    mobilePane === pane.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                  onClick={() => setMobilePane(pane.id)}
                >
                  {pane.label}
                </button>
              ))}
            </div>
            {mobilePane === "files" && (
              <aside className="min-h-0 flex-1 bg-sidebar">
                <div className="flex h-10 items-center gap-2 border-b border-border px-3 text-xs font-semibold text-muted-foreground">
                  <FolderTree className="size-3.5" />
                  文件
                </div>
                <div className="min-h-0 overflow-auto py-2">
                  <FileTree
                    nodes={fileTree}
                    activeFile={activeFile}
                    expandedDirs={expandedDirs}
                    onToggleDirectory={toggleDirectory}
                    onSelectFile={(path) => {
                      setActiveFile(path);
                      setMobilePane("editor");
                    }}
                  />
                </div>
              </aside>
            )}
            {mobilePane === "editor" && (
              <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex h-10 items-end gap-1 overflow-x-auto border-b border-border bg-card px-2 pt-1">
                  {sortedFiles.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => setActiveFile(path)}
                      className={cn(
                        "h-8 max-w-40 shrink-0 truncate rounded-t-md border border-b-0 px-3 text-xs",
                        activeFile === path
                          ? "border-border bg-background text-foreground"
                          : "border-transparent text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {fileLabel(path)}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 bg-zinc-950">
                  <EditorBridge
                    activeFile={activeFile}
                    files={files}
                    onChange={handleFileChange}
                  />
                </div>
              </section>
            )}
            {mobilePane === "preview" && (
              <section className="flex min-h-0 flex-1 flex-col bg-card">
                <div className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="新窗口查看预览"
                    aria-label="新窗口查看预览"
                    onClick={() => previewRef.current?.openPreviewWindow()}
                  >
                    <Play className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold">预览</span>
                    {codeSpec && (
                      <span className="truncate text-xs text-muted-foreground">
                        {codeSpec.appName}
                      </span>
                    )}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7"
                    onClick={runPreview}
                    disabled={!previewReady || previewState === "building"}
                  >
                    {previewState === "building" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    运行预览
                  </Button>
                </div>
                <div className="relative min-h-0 flex-1 bg-muted/40 p-2">
                  <LocalPrototypePreview
                    ref={previewRef}
                    files={previewFiles}
                    entryFile="/src/main.tsx"
                    onBuildError={handlePreviewBuildError}
                    onBuildReady={handlePreviewBuildReady}
                    onBuildStart={handlePreviewBuildStart}
                  />
                </div>
              </section>
            )}
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
            <ResizablePanel defaultSize={58} minSize={34}>
              <div className="grid h-full min-h-0 grid-cols-[210px_minmax(0,1fr)] border-r border-border">
                <aside className="min-h-0 border-r border-border bg-sidebar">
                  <div className="flex h-10 items-center gap-2 border-b border-border px-3 text-xs font-semibold text-muted-foreground">
                    <FolderTree className="size-3.5" />
                    文件
                  </div>
                  <div className="min-h-0 overflow-auto py-2">
                    <FileTree
                      nodes={fileTree}
                      activeFile={activeFile}
                      expandedDirs={expandedDirs}
                      onToggleDirectory={toggleDirectory}
                      onSelectFile={setActiveFile}
                    />
                  </div>
                </aside>
                <section className="flex min-h-0 min-w-0 flex-col">
                  <div className="flex h-10 items-end gap-1 overflow-x-auto border-b border-border bg-card px-2 pt-1">
                    {sortedFiles.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setActiveFile(path)}
                        className={cn(
                          "h-8 max-w-40 shrink-0 truncate rounded-t-md border border-b-0 px-3 text-xs",
                          activeFile === path
                            ? "border-border bg-background text-foreground"
                            : "border-transparent text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {fileLabel(path)}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-0 flex-1 bg-zinc-950">
                    <EditorBridge
                      activeFile={activeFile}
                      files={files}
                      onChange={handleFileChange}
                    />
                  </div>
                </section>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-border/70" />
            <ResizablePanel defaultSize={42} minSize={28}>
              <section className="flex h-full min-h-0 flex-col bg-card">
                <div className="flex h-10 items-center justify-between border-b border-border px-3">
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="新窗口查看预览"
                    aria-label="新窗口查看预览"
                    onClick={() => previewRef.current?.openPreviewWindow()}
                  >
                    <Play className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold">预览</span>
                    {codeSpec && (
                      <span className="truncate text-xs text-muted-foreground">
                        {codeSpec.appName}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7"
                      onClick={runPreview}
                      disabled={!previewReady || previewState === "building"}
                    >
                      {previewState === "building" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      运行预览
                    </Button>
                    <Badge variant="secondary" className="font-mono">
                      Local TSX
                    </Badge>
                  </div>
                </div>
                <div className="relative min-h-0 flex-1 bg-muted/40 p-2">
                  <LocalPrototypePreview
                    ref={previewRef}
                    files={previewFiles}
                    entryFile="/src/main.tsx"
                    onBuildError={handlePreviewBuildError}
                    onBuildReady={handlePreviewBuildReady}
                    onBuildStart={handlePreviewBuildStart}
                  />
                </div>
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </SandpackProvider>
    </div>
  );
}
