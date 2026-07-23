// Renders the code generation workspace, including model selection, file browser, and preview actions.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SandpackProvider } from "@codesandbox/sandpack-react";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FolderTree,
  Info,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ModelPicker } from "../../../shared/ui/model-picker";
import { ScaledToolbar } from "../../../shared/ui/scale-to-fit";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../../shared/ui/resizable";
import {
  normalizeProviderModelCapability,
} from "../../../shared/lib/provider-model-display";
import {
  loadUserSettings,
  patchUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from "../../../shared/lib/user-settings";
import { cn } from "../../../shared/ui/utils";
import { formatCodeDiagnosticSummary } from "../../../shared/lib/code-diagnostics";
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
import { useCompactViewport } from "../../workspace-shell/hooks/use-compact-viewport";
import { usePrototypeFiles } from "../hooks/use-prototype-files";


























export function CodeGenerationPage() {
  const { t } = useTranslation();
  const {
    requirementText,
    designModels,
    codeSpec,
    codeFiles,
    codeEditVersion,
    codeEntryFile,
    codeDependencies,
    codeDiagnostics,
    generating,
    runProgress,
    runMessage,
    generateCodePrototype,
    updateCodeFile,
    recordCodePreviewDiagnostic,
    clearCodePreviewDiagnostics,
  } = useWorkspaceSession();
  const compactViewport = useCompactViewport();
  const [mobilePane, setMobilePane] = useState<"files" | "editor" | "preview">("editor");
  const [defaultModel, setDefaultModel] = useState(
    () => loadUserSettings().defaultModel,
  );
  const [providerModelCapabilities, setProviderModelCapabilities] = useState(
    () => loadUserSettings().providerModelCapabilities,
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
      const settings = loadUserSettings();
      setDefaultModel(settings.defaultModel);
      setProviderModelCapabilities(settings.providerModelCapabilities);
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

  const modelCapability = normalizeProviderModelCapability(
    defaultModel,
    providerModelCapabilities[defaultModel],
  );
  const designModelCount = Object.values(designModels).filter(Boolean).length;
  const requirementSourceMissing = requirementText.trim().length === 0;
  const canGenerate = designModelCount > 0 && !requirementSourceMissing;
  const generatedFileCount = Object.keys(codeFiles).length;
  const previewReady = generatedFileCount > 0 && Boolean(codeEntryFile || codeFiles["/src/main.tsx"]);
  const codeDiagnosticSummary = useMemo(
    () => formatCodeDiagnosticSummary({ diagnostics: codeDiagnostics }),
    [codeDiagnostics],
  );
  const hasPreviewFiles = Object.keys(previewFiles).length > 0;
  const isRepairingGeneratedPrototype =
    generating &&
    previewReady &&
    /修复|覆盖检查|质量|验证|repair/i.test(runMessage ?? "");
  const codeStatus = isRepairingGeneratedPrototype
      ? {
          tone: "primary" as const,
          icon: Loader2,
          title: t("code.status.previewReadyPolishing.title"),
          message:
            runMessage ??
            t("code.status.previewReadyPolishing.message"),
        }
      : generating
        ? {
            tone: "primary" as const,
            icon: Loader2,
            title: t("code.status.generating.title"),
            message: runMessage ?? t("code.status.generating.message"),
          }
        : previewState === "pending" && previewReady
          ? {
              tone: "primary" as const,
              icon: Info,
              title: t("code.status.pending.title"),
              message: t("code.status.pending.message"),
            }
          : previewState === "building" && hasPreviewFiles
            ? {
                tone: "primary" as const,
                icon: Loader2,
                title: t("code.status.building.title"),
                message: t("code.status.building.message"),
              }
            : previewState === "error" && hasPreviewFiles
              ? {
                  tone: "destructive" as const,
                  icon: AlertTriangle,
                  title: t("code.status.error.title"),
                  message: t("code.status.error.message"),
                }
              : previewReady
                ? requirementSourceMissing
                  ? {
                      tone: "warning" as const,
                      icon: AlertTriangle,
                      title: t("code.status.requirementMissing.title"),
                      message:
                        t("code.status.requirementMissing.message"),
                    }
                  : codeDiagnosticSummary
                  ? {
                      tone: "warning" as const,
                      icon: AlertTriangle,
                      title: t("code.status.diagnostics.title"),
                      message: t("code.status.diagnostics.message", { summary: codeDiagnosticSummary }),
                    }
                  : {
                      tone: "success" as const,
                      icon: CheckCircle2,
                      title: t("code.status.updated.title"),
                      message: t("code.status.updated.message"),
                    }
                : canGenerate
                  ? {
                      tone: "muted" as const,
                      icon: Info,
                      title: t("code.status.ready.title"),
                      message: t("code.status.ready.message"),
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
    clearCodePreviewDiagnostics();
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
    clearCodePreviewDiagnostics();
    setPreviewState((current) => (current === "pending" ? current : "building"));
  }, [clearCodePreviewDiagnostics]);

  const handlePreviewBuildReady = useCallback(() => {
    if (manualPreviewEditPendingRef.current) return;
    clearCodePreviewDiagnostics();
    setPreviewState("success");
  }, [clearCodePreviewDiagnostics]);

  const handlePreviewBuildError = useCallback((message: string) => {
    if (manualPreviewEditPendingRef.current) return;
    recordCodePreviewDiagnostic(message);
    setPreviewState("error");
  }, [recordCodePreviewDiagnostic]);

  return (
    <div
      data-testid="code-generation-page"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-3 lg:p-4"
    >
      <div
        data-testid="code-workspace-frame"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-sm"
      >
      <div className="border-b border-border px-3">
        <ScaledToolbar
          data-testid="code-generation-toolbar"
          minWidth={0}
          contentClassName="min-h-10 w-full gap-1.5"
        >
          <div className="flex min-w-0 shrink items-center gap-1.5">
            <Code2 className="size-4 text-primary" />
            <span className="hidden truncate text-sm font-semibold min-[430px]:inline">
              {t("code.title")}
            </span>
            <Badge variant="secondary" className="px-1.5 font-mono text-[11px]">
              {t("code.fileCount", { count: sortedFiles.length })}
            </Badge>
            <Badge
              variant={modelCapability.supportsJsonSchema ? "secondary" : "outline"}
              className="hidden px-1.5 text-[11px] min-[520px]:inline-flex"
            >
              {t(`code.modelModes.${modelCapability.structuredOutputMode}`)}
            </Badge>
            <Badge variant="secondary" className="hidden px-1.5 text-[11px] min-[520px]:inline-flex">
              {t("code.designModelCount", { count: designModelCount })}
            </Badge>
          </div>
          {generating && (
            <div className="ml-2 flex min-w-0 shrink items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              <span className="truncate">{runMessage ?? t("code.generatingCode")}</span>
              <span className="font-mono">{runProgress}%</span>
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
          <ModelPicker
            value={defaultModel}
            onValueChange={updateModel}
            align="end"
            triggerClassName="h-8 max-w-[150px] bg-card px-2 text-xs"
          />
          <Button
            size="sm"
            className="h-8 px-2 text-xs"
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
            <span className="hidden min-[430px]:inline">
              {generatedFileCount > 0 ? t("code.actions.continue") : t("code.actions.start")}
            </span>
            <span className="min-[430px]:hidden">
              {generatedFileCount > 0 ? t("code.actions.continueShort") : t("code.actions.generateShort")}
            </span>
          </Button>
          {generatedFileCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => void generateCodePrototype("regenerate")}
              disabled={!canGenerate || generating}
            >
              {generating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              <span className="hidden min-[430px]:inline">{t("code.actions.regenerate")}</span>
              <span className="min-[430px]:hidden">{t("code.actions.redoShort")}</span>
            </Button>
          )}
          </div>
        </ScaledToolbar>
      </div>

      {!canGenerate && (
        <div className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          <span>{t("code.missingPrerequisites")}</span>
        </div>
      )}
      {modelCapability.structuredOutputMode === "compatible" && defaultModel.trim() && (
        <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("code.compatibleWarning")}
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
            codeStatus.tone === "warning" &&
              "border-warning/40 bg-warning/10 text-warning",
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
            <div className="grid w-full min-w-0 grid-cols-3 gap-1 border-b border-border bg-card px-2 py-1.5">
              {[
                { id: "files" as const, label: t("code.panes.files") },
                { id: "editor" as const, label: t("code.panes.editor") },
                { id: "preview" as const, label: t("code.panes.preview") },
              ].map((pane) => (
                <button
                  key={pane.id}
                  type="button"
                  aria-pressed={mobilePane === pane.id}
                  className={cn(
                    "h-8 min-w-0 rounded-md text-[13px] font-medium transition-colors",
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
                  {t("code.panes.files")}
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
                <div
                  data-testid="code-file-tabs"
                  className="flex h-10 items-end gap-1 overflow-x-auto border-b border-border bg-card px-2 pt-1 [scrollbar-width:thin]"
                >
                  {sortedFiles.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => setActiveFile(path)}
                      className={cn(
                        "h-8 w-32 shrink-0 truncate rounded-t-md border border-b-0 px-3 text-xs",
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
                    title={t("code.preview.openWindow")}
                    aria-label={t("code.preview.openWindow")}
                    onClick={() => previewRef.current?.openPreviewWindow()}
                  >
                    <Play className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold">{t("code.panes.preview")}</span>
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
                    {t("code.actions.runPreview")}
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
                    {t("code.panes.files")}
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
                  <div
                    data-testid="code-file-tabs"
                    className="flex h-10 items-end gap-1 overflow-x-auto border-b border-border bg-card px-2 pt-1 [scrollbar-width:thin]"
                  >
                    {sortedFiles.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setActiveFile(path)}
                        className={cn(
                          "h-8 w-32 shrink-0 truncate rounded-t-md border border-b-0 px-3 text-xs",
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
                    title={t("code.preview.openWindow")}
                    aria-label={t("code.preview.openWindow")}
                    onClick={() => previewRef.current?.openPreviewWindow()}
                  >
                    <Play className="size-3.5 text-primary" />
                    <span className="text-xs font-semibold">{t("code.panes.preview")}</span>
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
                      {t("code.actions.runPreview")}
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
    </div>
  );
}
