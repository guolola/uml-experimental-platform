import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { useMonaco, type Monaco } from "@monaco-editor/react";
import type * as TypeScript from "typescript";
import {
  SandpackProvider,
  useSandpack,
  type SandpackFiles,
} from "@codesandbox/sandpack-react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  Loader2,
  Maximize2,
  Play,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ModelPicker } from "../../../shared/ui/model-picker";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../../shared/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { downloadTextFile } from "../../../shared/lib/download";
import { getModelCapability } from "../../../shared/lib/model-catalog";
import {
  loadUserSettings,
  patchUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from "../../../shared/lib/user-settings";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceSession } from "../../workspace-session/state";
import type { CodeBusinessLogic } from "@uml-platform/contracts";

const DEFAULT_FILES: Record<string, string> = {
  "/src/App.tsx": [
    "import { WorkspaceShell } from './components/WorkspaceShell';",
    "",
    "export default function App() {",
    "  return <WorkspaceShell />;",
    "}",
  ].join("\n"),
  "/src/components/WorkspaceShell.tsx": [
    "export function WorkspaceShell() {",
    "  return (",
    "    <main className=\"empty-state\">",
    "      <div>",
    "        <span className=\"eyebrow\">UML Prototype</span>",
    "        <h1>等待生成前端原型</h1>",
    "        <p>先在设计页生成设计模型，再回到代码页生成可编辑、可预览的 React 原型。</p>",
    "      </div>",
    "    </main>",
    "  );",
    "}",
  ].join("\n"),
  "/src/domain/types.ts": [
    "export interface PrototypeRecord {",
    "  id: string;",
    "  name: string;",
    "  status: string;",
    "}",
  ].join("\n"),
  "/src/data/mock-data.ts": [
    "import type { PrototypeRecord } from '../domain/types';",
    "",
    "export const mockData: PrototypeRecord[] = [];",
  ].join("\n"),
  "/src/styles.css": [
    "body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f7f8fa; color: #1d1f23; }",
    ".empty-state { min-height: 100vh; display: grid; place-items: center; padding: 32px; }",
    ".empty-state > div { max-width: 560px; border: 1px solid #e5e7eb; background: #fff; padding: 24px; }",
    ".eyebrow { color: #337dff; font-size: 12px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }",
    "h1 { margin: 8px 0; font-size: 24px; }",
    "p { margin: 0; color: #6b7280; }",
  ].join("\n"),
  "/src/main.tsx": [
    "import React from 'react';",
    "import { createRoot } from 'react-dom/client';",
    "import './styles.css';",
    "import App from './App';",
    "",
    "createRoot(document.getElementById('root')!).render(",
    "  <React.StrictMode>",
    "    <App />",
    "  </React.StrictMode>,",
    ");",
  ].join("\n"),
  "/index.html":
    [
      "<!doctype html>",
      "<html>",
      "  <head>",
      "    <meta charset=\"UTF-8\" />",
      "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
      "    <title>UML Prototype</title>",
      "  </head>",
      "  <body>",
      "    <div id=\"root\"></div>",
      "    <script type=\"module\" src=\"/src/main.tsx\"></script>",
      "  </body>",
      "</html>",
    ].join("\n"),
  "/public/index.html":
    [
      "<!doctype html>",
      "<html>",
      "  <head>",
      "    <meta charset=\"UTF-8\" />",
      "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
      "    <title>UML Prototype</title>",
      "  </head>",
      "  <body>",
      "    <div id=\"root\"></div>",
      "  </body>",
      "</html>",
    ].join("\n"),
};

const DEFAULT_EXPANDED_DIRS = new Set([
  "/src",
  "/src/components",
  "/src/data",
  "/src/domain",
]);

type FileTreeNode = {
  type: "directory" | "file";
  name: string;
  path: string;
  children: FileTreeNode[];
};

type PreviewBuildResult = {
  srcDoc: string;
  objectUrls: string[];
};

const MONACO_REACT_TYPES = `
declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module "react" {
  export type CSSProperties = Record<string, any>;
  export type ReactNode = any;
  export type SVGProps<T = any> = Record<string, any> & { ref?: any };
  export type ComponentType<P = Record<string, any>> = (props: P) => any;
  export type FC<P = Record<string, any>> = ComponentType<P>;
  export const StrictMode: any;
  export const Fragment: any;
  export function createElement(...args: any[]): any;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useRef<T>(value: T): { current: T };
  export function useState<T>(value: T | (() => T)): [T, (next: T | ((current: T) => T)) => void];
  const React: {
    StrictMode: any;
    Fragment: any;
    createElement: typeof createElement;
  };
  export default React;
}

declare module "react/jsx-runtime" {
  export const Fragment: any;
  export function jsx(...args: any[]): any;
  export function jsxs(...args: any[]): any;
}

declare module "react-dom/client" {
  export function createRoot(element: Element | DocumentFragment | null): {
    render(node: any): void;
    unmount(): void;
  };
}

declare module "*.css" {
  const content: string;
  export default content;
}
`;

const MONACO_LUCIDE_TYPES = `
declare module "lucide-react" {
  import type { ComponentType, SVGProps } from "react";
  export type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;
  export const Activity: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const BarChart3: LucideIcon;
  export const Bell: LucideIcon;
  export const Calendar: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const Circle: LucideIcon;
  export const Clock: LucideIcon;
  export const Code2: LucideIcon;
  export const Database: LucideIcon;
  export const Download: LucideIcon;
  export const Edit: LucideIcon;
  export const Edit3: LucideIcon;
  export const Eye: LucideIcon;
  export const FileCode2: LucideIcon;
  export const FileText: LucideIcon;
  export const Filter: LucideIcon;
  export const Folder: LucideIcon;
  export const FolderTree: LucideIcon;
  export const Home: LucideIcon;
  export const Info: LucideIcon;
  export const LayoutDashboard: LucideIcon;
  export const Loader2: LucideIcon;
  export const LogIn: LucideIcon;
  export const LogOut: LucideIcon;
  export const Mail: LucideIcon;
  export const Menu: LucideIcon;
  export const MoreHorizontal: LucideIcon;
  export const Pencil: LucideIcon;
  export const Play: LucideIcon;
  export const Plus: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Save: LucideIcon;
  export const Search: LucideIcon;
  export const Settings: LucideIcon;
  export const Shield: LucideIcon;
  export const Trash: LucideIcon;
  export const Trash2: LucideIcon;
  export const User: LucideIcon;
  export const Users: LucideIcon;
  export const X: LucideIcon;
  export const XCircle: LucideIcon;
}
`;

let monacoConfigured = false;

function languageForPath(path: string) {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".html")) return "html";
  return "plaintext";
}

function fileLabel(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function sortFileTreeNodes(nodes: FileTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    sortFileTreeNodes(node.children);
  }
}

function buildFileTree(paths: string[]) {
  const root: FileTreeNode = {
    type: "directory",
    name: "",
    path: "/",
    children: [],
  };
  const directories = new Map<string, FileTreeNode>([["/", root]]);

  for (const path of paths) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const parts = normalizedPath.split("/").filter(Boolean);
    let current = root;

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const nodePath = `/${parts.slice(0, index + 1).join("/")}`;
      const isFile = index === parts.length - 1;

      if (isFile) {
        if (!current.children.some((node) => node.path === nodePath)) {
          current.children.push({
            type: "file",
            name,
            path: nodePath,
            children: [],
          });
        }
        continue;
      }

      let directory = directories.get(nodePath);
      if (!directory) {
        directory = {
          type: "directory",
          name,
          path: nodePath,
          children: [],
        };
        directories.set(nodePath, directory);
        current.children.push(directory);
      }
      current = directory;
    }
  }

  sortFileTreeNodes(root.children);
  return root.children;
}

function parentDirectoriesForPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, index) => `/${parts.slice(0, index + 1).join("/")}`);
}

function toSandpackFiles(files: Record<string, string>, activeFile: string): SandpackFiles {
  return Object.fromEntries(
    Object.entries(files).map(([path, code]) => [
      path,
      {
        code,
        active: path === activeFile,
      },
    ]),
  );
}

const PREVIEW_IMPORT_MAP = {
  react: "https://esm.sh/react@18.3.1",
  "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
  "react/jsx-dev-runtime": "https://esm.sh/react@18.3.1/jsx-dev-runtime",
  "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
  "lucide-react": "https://esm.sh/lucide-react@0.487.0?external=react",
};

function normalizePreviewPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  const normalized: string[] = [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }

  return `/${normalized.join("/")}`;
}

function isPreviewLocalImport(specifier: string) {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/")
  );
}

function resolvePreviewImport(
  fromPath: string,
  specifier: string,
  files: Record<string, string>,
) {
  if (!isPreviewLocalImport(specifier)) return null;

  const fromDirectory = fromPath.split("/").slice(0, -1).join("/") || "/";
  const rawPath = specifier.startsWith("@/")
    ? `/src/${specifier.slice(2)}`
    : specifier.startsWith("/")
      ? specifier
      : `${fromDirectory}/${specifier}`;
  const normalizedPath = normalizePreviewPath(rawPath);
  const candidates = [
    normalizedPath,
    `${normalizedPath}.tsx`,
    `${normalizedPath}.ts`,
    `${normalizedPath}.jsx`,
    `${normalizedPath}.js`,
    `${normalizedPath}.css`,
    `${normalizedPath}/index.tsx`,
    `${normalizedPath}/index.ts`,
    `${normalizedPath}/index.jsx`,
    `${normalizedPath}/index.js`,
  ];

  return candidates.find((candidate) => files[candidate] !== undefined) ?? null;
}

function previewErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "预览构建失败";
}

function previewModuleUrl(source: string) {
  return `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(source)))}`;
}

async function buildLocalPreviewDocument(
  files: Record<string, string>,
  preferredEntryFile: string,
  buildId: string,
): Promise<PreviewBuildResult> {
  const ts: typeof TypeScript = await import("typescript");

  const entryFile = files["/src/main.tsx"]
    ? "/src/main.tsx"
    : files[preferredEntryFile]
      ? preferredEntryFile
      : Object.keys(files).find((path) => /\.(tsx|ts|jsx|js)$/.test(path));

  if (!entryFile) {
    throw new Error("没有找到可运行的入口文件。");
  }

  const objectUrls: string[] = [];
  const compiledUrls = new Map<string, string>();
  const compilingFiles = new Set<string>();
  const importExpressionPattern =
    /((?:import|export)\s+(?:[^'"]*?\s+from\s*)?["'])([^"']+)(["'])/g;

  const compileFile = (path: string): string => {
    const existingUrl = compiledUrls.get(path);
    if (existingUrl) return existingUrl;

    const source = files[path];
    if (source === undefined) {
      throw new Error(`预览文件不存在: ${path}`);
    }

    if (compilingFiles.has(path)) {
      throw new Error(`检测到循环导入，暂时无法预览: ${path}`);
    }
    compilingFiles.add(path);

    if (path.endsWith(".css")) {
      const cssModule = [
        "const style = document.createElement('style');",
        `style.dataset.previewFile = ${JSON.stringify(path)};`,
        `style.textContent = ${JSON.stringify(source)};`,
        "document.head.appendChild(style);",
        "export default style.textContent;",
      ].join("\n");
      const url = previewModuleUrl(cssModule);
      compiledUrls.set(path, url);
      compilingFiles.delete(path);
      return url;
    }

    const output = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        isolatedModules: true,
        resolveJsonModule: true,
      },
      reportDiagnostics: false,
    }).outputText;

    const rewrittenOutput = output.replace(
      importExpressionPattern,
      (match, prefix: string, specifier: string, quote: string) => {
        if (!isPreviewLocalImport(specifier)) return match;

        const resolvedPath = resolvePreviewImport(path, specifier, files);
        if (!resolvedPath) {
          throw new Error(`${path} 无法解析导入 ${specifier}`);
        }

        return `${prefix}${compileFile(resolvedPath)}${quote}`;
      },
    );

    const url = previewModuleUrl(rewrittenOutput);
    compiledUrls.set(path, url);
    compilingFiles.delete(path);
    return url;
  };

  const entryUrl = compileFile(entryFile);
  const importMap = JSON.stringify({ imports: PREVIEW_IMPORT_MAP });
  const srcDoc = [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "    <style>",
    "      html, body, #root { min-height: 100%; margin: 0; }",
    "      body { background: #ffffff; }",
    "    </style>",
    `    <script type="importmap">${importMap}</script>`,
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    "    <script>",
    `      const buildId = ${JSON.stringify(buildId)};`,
    "      const report = (type, message) => parent.postMessage({ source: 'local-prototype-preview', buildId, type, message }, '*');",
    "      window.addEventListener('error', (event) => report('error', event.message || '预览运行出错'));",
    "      window.addEventListener('unhandledrejection', (event) => {",
    "        const reason = event.reason;",
    "        report('error', reason && reason.message ? reason.message : String(reason || '预览运行出错'));",
    "      });",
    "    </script>",
    "    <script type=\"module\">",
    `      import(${JSON.stringify(entryUrl)})`,
    "        .then(() => parent.postMessage({ source: 'local-prototype-preview', buildId, type: 'ready' }, '*'))",
    "        .catch((error) => parent.postMessage({ source: 'local-prototype-preview', buildId, type: 'error', message: error && error.message ? error.message : String(error) }, '*'));",
    "    </script>",
    "  </body>",
    "</html>",
  ].join("\n");

  return { srcDoc, objectUrls };
}

function configureMonacoForPrototype(monaco: Monaco) {
  if (monacoConfigured) return;

  const ts = monaco.languages.typescript;
  const compilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    isolatedModules: true,
    noEmit: true,
    resolveJsonModule: true,
    strict: false,
    baseUrl: "file:///",
  };

  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  ts.typescriptDefaults.setEagerModelSync(true);
  ts.typescriptDefaults.addExtraLib(
    MONACO_REACT_TYPES,
    "file:///node_modules/@types/react-prototype/index.d.ts",
  );
  ts.typescriptDefaults.addExtraLib(
    MONACO_LUCIDE_TYPES,
    "file:///node_modules/@types/lucide-react/index.d.ts",
  );

  monacoConfigured = true;
}

function shouldSyncMonacoModel(path: string) {
  return /\.(ts|tsx|js|jsx)$/.test(path);
}

function monacoUriForPath(monaco: Monaco, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return monaco.Uri.parse(`file://${normalizedPath}`);
}

function isMonacoManualCancelation(reason: unknown) {
  if (!reason || typeof reason !== "object") return false;
  const value = reason as { type?: unknown; msg?: unknown };
  return (
    value.type === "cancelation" &&
    value.msg === "operation is manually canceled"
  );
}

function ensureVisibleFile(files: Record<string, string>, current: string | null) {
  if (current && files[current]) return current;
  if (files["/src/App.tsx"]) return "/src/App.tsx";
  return Object.keys(files).sort()[0] ?? "/src/App.tsx";
}

function MonacoFileModelSync({
  files,
}: {
  files: Record<string, string>;
}) {
  const monaco = useMonaco();
  const createdModelUrisRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!monaco) return;

    configureMonacoForPrototype(monaco);
    const activeUris = new Set<string>();

    for (const [path, code] of Object.entries(files)) {
      if (!shouldSyncMonacoModel(path)) continue;

      const uri = monacoUriForPath(monaco, path);
      const uriString = uri.toString();
      activeUris.add(uriString);

      const existingModel = monaco.editor.getModel(uri);
      if (existingModel) {
        if (existingModel.getValue() !== code) {
          existingModel.setValue(code);
        }
        continue;
      }

      monaco.editor.createModel(code, languageForPath(path), uri);
      createdModelUrisRef.current.add(uriString);
    }

    for (const uriString of [...createdModelUrisRef.current]) {
      if (activeUris.has(uriString)) continue;

      const model = monaco.editor.getModel(monaco.Uri.parse(uriString));
      model?.dispose();
      createdModelUrisRef.current.delete(uriString);
    }
  }, [files, monaco]);

  return null;
}

function EditorBridge({
  activeFile,
  files,
  onChange,
}: {
  activeFile: string;
  files: Record<string, string>;
  onChange: (path: string, value: string) => void;
}) {
  const value = files[activeFile] ?? "";

  return (
    <Editor
      height="100%"
      path={activeFile}
      value={value}
      language={languageForPath(activeFile)}
      theme="vs-dark"
      beforeMount={configureMonacoForPrototype}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
      onChange={(next) => {
        const code = next ?? "";
        onChange(activeFile, code);
      }}
    />
  );
}

function SandpackFileSync({
  files,
}: {
  files: Record<string, string>;
}) {
  const { sandpack } = useSandpack();
  const updateFileRef = useRef(sandpack.updateFile);
  const syncedFilesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    updateFileRef.current = sandpack.updateFile;
  }, [sandpack.updateFile]);

  useEffect(() => {
    const previousFiles = syncedFilesRef.current;
    for (const [path, code] of Object.entries(files)) {
      if (previousFiles[path] !== code) {
        updateFileRef.current(path, code);
      }
    }
    syncedFilesRef.current = { ...files };
  }, [files]);

  return null;
}

function FileTree({
  nodes,
  activeFile,
  expandedDirs,
  onToggleDirectory,
  onSelectFile,
}: {
  nodes: FileTreeNode[];
  activeFile: string;
  expandedDirs: Set<string>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const renderNode = (node: FileTreeNode, depth: number) => {
    const isDirectory = node.type === "directory";
    const isExpanded = expandedDirs.has(node.path);

    if (isDirectory) {
      const DirectoryIcon = isExpanded ? FolderOpen : Folder;
      return (
        <div key={node.path}>
          <button
            type="button"
            onClick={() => onToggleDirectory(node.path)}
            aria-expanded={isExpanded}
            data-testid={`file-tree-dir-${node.path}`}
            className="flex h-8 w-full items-center gap-1.5 px-2 text-left text-xs text-sidebar-foreground/85 transition-colors hover:bg-muted hover:text-sidebar-foreground"
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {isExpanded ? (
              <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
            )}
            <DirectoryIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </button>
          {isExpanded &&
            node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        type="button"
        onClick={() => onSelectFile(node.path)}
        data-testid={`file-tree-file-${node.path}`}
        className={cn(
          "flex h-8 w-full items-center gap-2 px-2 text-left text-xs transition-colors",
          activeFile === node.path
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-muted hover:text-sidebar-foreground",
        )}
        style={{ paddingLeft: 24 + depth * 14 }}
      >
        <FileCode2 className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
    );
  };

  return <>{nodes.map((node) => renderNode(node, 0))}</>;
}

function LocalPrototypePreview({
  files,
  entryFile,
}: {
  files: Record<string, string>;
  entryFile: string;
}) {
  const buildIndexRef = useRef(0);
  const activeBuildIdRef = useRef("");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [previewState, setPreviewState] = useState<{
    srcDoc: string;
    buildError: string | null;
    runtimeError: string | null;
    ready: boolean;
  }>({
    srcDoc: "",
    buildError: null,
    runtimeError: null,
    ready: false,
  });

  useEffect(() => {
    const buildId = `preview-${Date.now()}-${buildIndexRef.current + 1}`;
    buildIndexRef.current += 1;
    activeBuildIdRef.current = buildId;
    let objectUrls: string[] = [];
    let disposed = false;

    setPreviewState({
      srcDoc: "",
      buildError: null,
      runtimeError: null,
      ready: false,
    });

    void buildLocalPreviewDocument(files, entryFile, buildId)
      .then((result) => {
        if (disposed) {
          for (const url of result.objectUrls) {
            URL.revokeObjectURL(url);
          }
          return;
        }
        objectUrls = result.objectUrls;
        setPreviewState({
          srcDoc: result.srcDoc,
          buildError: null,
          runtimeError: null,
          ready: false,
        });
      })
      .catch((error) => {
        if (disposed) return;
        setPreviewState({
          srcDoc: "",
          buildError: previewErrorMessage(error),
          runtimeError: null,
          ready: false,
        });
      });

    return () => {
      disposed = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [entryFile, files]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as {
        source?: string;
        buildId?: string;
        type?: string;
        message?: string;
      };

      if (
        data.source !== "local-prototype-preview" ||
        data.buildId !== activeBuildIdRef.current
      ) {
        return;
      }

      if (data.type === "ready") {
        setPreviewState((current) => ({
          ...current,
          ready: true,
          runtimeError: null,
        }));
        return;
      }

      if (data.type === "error") {
        setPreviewState((current) => ({
          ...current,
          ready: false,
          runtimeError: data.message ?? "预览运行出错",
        }));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const previewMessage =
    previewState.buildError ??
    previewState.runtimeError ??
    (previewState.ready ? null : "预览正在编译");
  const isError = Boolean(previewState.buildError || previewState.runtimeError);

  const openPreviewWindow = () => {
    if (!previewState.srcDoc) {
      toast.error(previewState.buildError ?? "预览还没有准备好");
      return;
    }

    const blobUrl = URL.createObjectURL(
      new Blob([previewState.srcDoc], { type: "text/html" }),
    );
    const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      URL.revokeObjectURL(blobUrl);
      toast.error("新窗口被浏览器拦截，请允许弹窗后重试");
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  };

  return (
    <div className="relative h-full overflow-hidden border border-border bg-background">
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-8 bg-background/95 shadow-sm"
          title="全览"
          aria-label="全览"
          onClick={() => setFullscreenOpen(true)}
          disabled={!previewState.srcDoc}
        >
          <Maximize2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-8 bg-background/95 shadow-sm"
          title="新窗口打开"
          aria-label="新窗口打开"
          onClick={openPreviewWindow}
          disabled={!previewState.srcDoc}
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>
      {previewMessage && (
        <div
          data-testid="local-preview-status"
          className={cn(
            "absolute left-3 right-3 top-3 z-10 rounded-md border px-3 py-2 text-xs shadow-sm",
            isError
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-background/95 text-muted-foreground",
          )}
        >
          {previewMessage}
        </div>
      )}
      {previewState.srcDoc ? (
        <iframe
          title="Prototype Preview"
          sandbox="allow-scripts"
          srcDoc={previewState.srcDoc}
          className="h-full w-full bg-white"
        />
      ) : (
        <div className="grid h-full place-items-center px-6 text-center text-xs text-muted-foreground">
          {previewState.buildError ?? "暂无可预览内容"}
        </div>
      )}
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col gap-3 p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Maximize2 className="size-4 text-primary" />
              原型全览
            </DialogTitle>
          </DialogHeader>
          <div className="relative min-h-0 flex-1 overflow-hidden border border-border bg-background">
            {previewMessage && (
              <div
                className={cn(
                  "absolute left-3 right-3 top-3 z-10 rounded-md border px-3 py-2 text-xs shadow-sm",
                  isError
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border bg-background/95 text-muted-foreground",
                )}
              >
                {previewMessage}
              </div>
            )}
            {previewState.srcDoc ? (
              <iframe
                title="Prototype Full Preview"
                sandbox="allow-scripts"
                srcDoc={previewState.srcDoc}
                className="h-full w-full bg-white"
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-xs text-muted-foreground">
                {previewState.buildError ?? "暂无可预览内容"}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildBusinessRuleSections(businessLogic: CodeBusinessLogic | null) {
  if (!businessLogic) return [];

  return [
    {
      title: "权限边界",
      items: businessLogic.permissions.flatMap((permission) => {
        const allowed =
          permission.allowedActions.length > 0
            ? `${permission.actor} 可执行：${permission.allowedActions.join("、")}`
            : null;
        const restricted =
          permission.restrictedActions.length > 0
            ? `${permission.actor} 不可执行：${permission.restrictedActions.join("、")}`
            : null;
        return [allowed, restricted].filter((item): item is string => Boolean(item));
      }),
    },
    {
      title: "前端操作",
      items: businessLogic.frontendOperations,
    },
    {
      title: "状态与异常",
      items: [
        ...businessLogic.stateMachines.flatMap((machine) =>
          machine.transitions.map((transition) => `${machine.entity}: ${transition}`),
        ),
        ...businessLogic.edgeCases,
      ],
    },
    {
      title: "模型溯源",
      items: businessLogic.plantUmlTraceability,
    },
  ].filter((section) => section.items.length > 0);
}

function BusinessRulesPanel({
  businessLogic,
}: {
  businessLogic: CodeBusinessLogic | null;
}) {
  const sections = buildBusinessRuleSections(businessLogic);
  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-border bg-card px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <FileText className="size-3.5" />
        业务规则说明
        <Badge variant="outline" className="font-mono">
          平台展示
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <div
            key={section.title}
            className="min-w-0 rounded-md border border-border bg-background p-3"
          >
            <div className="mb-2 text-xs font-semibold text-foreground">
              {section.title}
            </div>
            <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
              {section.items.slice(0, 5).map((item, index) => (
                <li key={`${section.title}:${index}`} className="line-clamp-2">
                  {item}
                </li>
              ))}
            </ul>
            {section.items.length > 5 && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                另有 {section.items.length - 5} 条
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CodeGenerationPage() {
  const {
    requirementText,
    designModels,
    codeSpec,
    codeBusinessLogic,
    codeFiles,
    codeEntryFile,
    codeDependencies,
    codeSkills,
    codeSkillDiagnostics,
    codeSkillContext,
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
  const initialFiles = useMemo(
    () =>
      Object.keys(codeFiles).length > 0
        ? { ...DEFAULT_FILES, ...codeFiles }
        : DEFAULT_FILES,
    [codeFiles],
  );
  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [activeFile, setActiveFile] = useState(() =>
    ensureVisibleFile(initialFiles, codeEntryFile),
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    () => new Set(DEFAULT_EXPANDED_DIRS),
  );

  useEffect(() => {
    setFiles(initialFiles);
    setActiveFile((current) => ensureVisibleFile(initialFiles, current));
  }, [initialFiles]);

  useEffect(() => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      for (const directory of parentDirectoriesForPath(activeFile)) {
        next.add(directory);
      }
      return next;
    });
  }, [activeFile]);

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
  const sortedFiles = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const fileTree = useMemo(() => buildFileTree(sortedFiles), [sortedFiles]);
  const visibleDependencies = {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.487.0",
    ...codeDependencies,
  };
  const sandpackBundlerUrl =
    typeof window === "undefined"
      ? "/sandpack/index.html"
      : new URL("/sandpack/index.html", window.location.origin).toString();
  const sandpackFiles = useMemo(
    () => toSandpackFiles(files, activeFile),
    [activeFile, files],
  );

  const updateModel = (model: string) => {
    setDefaultModel(model);
    patchUserSettings({ defaultModel: model });
  };

  const updateFile = (path: string, value: string) => {
    setFiles((current) => ({ ...current, [path]: value }));
    updateCodeFile(path, value);
  };

  const toggleDirectory = (path: string) => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
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
      {(codeSkills.length > 0 ||
        codeSkillDiagnostics.length > 0 ||
        (codeSkillContext?.actionResults.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">Agent Skills</span>
          {codeSkills.map((skill) => (
            <Badge key={`${skill.source}:${skill.name}`} variant="secondary">
              {skill.name}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                {skill.source}
              </span>
            </Badge>
          ))}
          {codeSkillDiagnostics.length > 0 && (
            <Badge variant="outline">
              {codeSkillDiagnostics.length} 条技能诊断
            </Badge>
          )}
          {codeSkillContext?.actionResults.map((action) => (
            <Badge
              key={action.name}
              variant={action.status === "completed" ? "secondary" : "outline"}
              title={action.errorMessage ?? action.description}
            >
              {action.name}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                {action.status}
              </span>
            </Badge>
          ))}
        </div>
      )}

      <BusinessRulesPanel businessLogic={codeBusinessLogic} />

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
                <div className="flex min-w-0 items-center gap-2">
                  <Play className="size-3.5 text-primary" />
                  <span className="text-xs font-semibold">预览</span>
                  {codeSpec && (
                    <span className="truncate text-xs text-muted-foreground">
                      {codeSpec.appName}
                    </span>
                  )}
                </div>
                <Badge variant="secondary" className="font-mono">
                  Local TSX
                </Badge>
              </div>
              <div className="relative min-h-0 flex-1 bg-muted/40 p-2">
                <LocalPrototypePreview files={files} entryFile="/src/main.tsx" />
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </SandpackProvider>
    </div>
  );
}
