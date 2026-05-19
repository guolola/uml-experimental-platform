import { useEffect, useRef, useState } from "react";
import { SandpackProvider } from "@codesandbox/sandpack-react";
import { AlertTriangle, Code2, Download, FolderTree, Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ModelPicker } from "../../../shared/ui/model-picker";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../../shared/ui/resizable";
import { downloadTextFile } from "../../../shared/lib/download";
import { getModelCapability } from "../../../shared/lib/model-catalog";
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
import { usePrototypeFiles } from "../hooks/use-prototype-files";


























export function CodeGenerationPage() {
  const {
    requirementText,
    designModels,
    codeSpec,
    codeFiles,
    codeEntryFile,
    codeDependencies,
    generating,
    runProgress,
    runMessage,
    errorMessage,
    generateCodePrototype,
    updateCodeFile,
  } = useWorkspaceSession();
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
    sandpackFiles,
    updateFile,
    toggleDirectory,
  } = usePrototypeFiles({
    defaultFiles: DEFAULT_FILES,
    generatedFiles: codeFiles,
    entryFile: codeEntryFile,
    onFileChange: updateCodeFile,
  });
  const previewRef = useRef<LocalPrototypePreviewHandle | null>(null);

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
      <div className="flex min-h-12 items-center gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Code2 className="size-4 text-primary" />
          <span className="truncate text-sm font-semibold">前端原型代码</span>
          <Badge variant="secondary" className="font-mono">
            {sortedFiles.length} files
          </Badge>
          <Badge variant={modelCapability.supportsJsonSchema ? "secondary" : "outline"}>
            {modelCapability.modeLabel}
          </Badge>
        </div>
        {generating && (
          <div className="ml-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span className="truncate">{runMessage ?? "正在生成代码"}</span>
            <span className="font-mono">{runProgress}%</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ModelPicker
            value={defaultModel}
            onValueChange={updateModel}
            align="end"
            triggerClassName="h-8 bg-card"
          />
          <Button
            size="sm"
            className="h-8"
            onClick={() =>
              void generateCodePrototype(
                Object.keys(codeFiles).length > 0 ? "continue" : "regenerate",
              )
            }
            disabled={!canGenerate || generating}
          >
            {generating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : Object.keys(codeFiles).length > 0 ? (
              <RefreshCw className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
            {Object.keys(codeFiles).length > 0 ? "继续生成" : "启动生成"}
          </Button>
          {Object.keys(codeFiles).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
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
            className="h-8"
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
      {errorMessage && !generating && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errorMessage}
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
        files={sandpackFiles}
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
        <SandpackFileSync files={files} />
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
                    onChange={updateFile}
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
                <Badge variant="secondary" className="font-mono">
                  Local TSX
                </Badge>
              </div>
              <div className="relative min-h-0 flex-1 bg-muted/40 p-2">
                <LocalPrototypePreview
                  ref={previewRef}
                  files={files}
                  entryFile="/src/main.tsx"
                />
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </SandpackProvider>
    </div>
  );
}
