// Runs deterministic prototype quality checks and business-context file assembly.

import {
  codeGenerationSpecSchema,
  codeQualityDiagnosticSchema,
  codeVisualDiffReportSchema,
  type CodeAppBlueprint,
  type CodeBusinessLogic,
  type CodeFilePlan,
  type CodeGenerationSpec,
  type CodeQualityDiagnostic,
  type CodeRunSnapshot,
  type CodeUiBlueprint,
  type CodeUiIr,
  type CodeVisualDiffReport,
} from "@uml-platform/contracts";
import { normalizeFilePath } from "../../../normalizers/code/code-operation-normalizer.js";
import { type RunRecord } from "../../records/run-record-store.js";
import { addCodeDiagnostic } from "./code-run-diagnostics.js";
import { emitCodeFileChanged } from "./code-file-mutations.js";

export function isBlankCodeFile(content: string | undefined) {
  return !content || content.trim().length === 0;
}

export function ensureRequiredPrototypeFiles(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  scaffold: Record<string, string>,
) {
  const requiredFiles = [
    "/src/App.tsx",
    "/src/components/WorkspaceShell.tsx",
    "/src/domain/types.ts",
    "/src/data/mock-data.ts",
    "/src/styles.css",
  ];

  for (const path of requiredFiles) {
    if (isBlankCodeFile(snapshot.files[path])) {
      emitCodeFileChanged(
        record,
        snapshot,
        path,
        scaffold[path],
        "补齐缺失的模块化原型文件",
      );
      addCodeDiagnostic(
        snapshot,
        "verify_code_preview",
        `已补齐缺失或空白文件 ${path}`,
      );
    }
  }
}

export function validatePrototypeFileContents(snapshot: CodeRunSnapshot) {
  const realNetworkPattern =
    /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b|https?:\/\/(?!localhost|127\.0\.0\.1)/;
  for (const [path, content] of Object.entries(snapshot.files)) {
    if (!path.startsWith("/src/")) continue;
    if (realNetworkPattern.test(content)) {
      addCodeDiagnostic(
        snapshot,
        "verify_code_preview",
        `${path} 包含真实网络请求痕迹，第一版原型应改用 /src/data/mock-data.ts。`,
      );
    }
  }
}

function normalizePreviewPath(path: string) {
  const normalized: string[] = [];
  for (const part of path.split("/").filter(Boolean)) {
    if (part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  return `/${normalized.join("/")}`;
}

function resolvePreviewImport(
  fromPath: string,
  specifier: string,
  files: CodeRunSnapshot["files"],
) {
  const fromDirectory = fromPath.split("/").slice(0, -1).join("/") || "/";
  const rawPath = specifier.startsWith("@/")
    ? `/src/${specifier.slice(2)}`
    : specifier.startsWith("/")
      ? specifier
      : `${fromDirectory}/${specifier}`;
  const normalizedPath = normalizePreviewPath(rawPath);
  return [
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
  ].find((candidate) => files[candidate] !== undefined);
}

// Mirrors the browser preview's local module traversal so missing or cyclic
// imports fail the server run before a completed terminal event is emitted.
export function validatePrototypePreviewGraph(snapshot: CodeRunSnapshot) {
  const entryFile = snapshot.files["/src/main.tsx"]
    ? "/src/main.tsx"
    : snapshot.entryFile && snapshot.files[snapshot.entryFile]
      ? snapshot.entryFile
      : Object.keys(snapshot.files).find((path) => /\.(tsx|ts|jsx|js)$/u.test(path));
  if (!entryFile) return ["没有找到可运行的入口文件。"];

  const errors: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const importPattern =
    /(?:import|export)\s+(?!type\b)(?:[^'"]*?\s+from\s*)?["']([^"']+)["']/gu;

  const visit = (path: string) => {
    if (visited.has(path)) return;
    if (visiting.has(path)) {
      errors.push(`检测到循环导入，暂时无法预览: ${path}`);
      return;
    }
    visiting.add(path);
    const source = snapshot.files[path];
    if (source === undefined) {
      errors.push(`预览文件不存在: ${path}`);
      visiting.delete(path);
      return;
    }
    if (!path.endsWith(".css")) {
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1] ?? "";
        if (
          !specifier.startsWith(".") &&
          !specifier.startsWith("/") &&
          !specifier.startsWith("@/")
        ) {
          continue;
        }
        const resolved = resolvePreviewImport(path, specifier, snapshot.files);
        if (!resolved) {
          errors.push(`${path} 无法解析导入 ${specifier}`);
          continue;
        }
        visit(resolved);
      }
    }
    visiting.delete(path);
    visited.add(path);
  };

  visit(entryFile);
  return Array.from(new Set(errors));
}

export function buildCodeGenerationSpecFromBlueprints(
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
  filePlan: CodeFilePlan | null,
  uiIr: CodeUiIr | null = null,
): CodeGenerationSpec {
  return codeGenerationSpecSchema.parse({
    appName: appBlueprint.appName,
    summary: appBlueprint.coreWorkflow,
    theme: uiBlueprint.theme,
    pages: appBlueprint.pages,
    components:
      filePlan?.files
        .filter((file) => file.kind === "component")
        .map((file, index) => ({
          id: `component-${index + 1}`,
          name: file.path.split("/").at(-1)?.replace(/\.(tsx|ts|jsx|js)$/, "") ?? file.path,
          responsibility: file.responsibility,
          sourceDiagramIds: [],
        })) ?? [
        {
          id: "component-workspace-shell",
          name: "WorkspaceShell",
          responsibility: "组织原型导航、页面切换和全局布局",
          sourceDiagramIds: [],
        },
      ],
    interactions: appBlueprint.pages.map((page) => ({
      id: `interaction-${page.id}`,
      trigger: `进入${page.name}`,
      behavior: page.purpose,
      sourceDiagramIds: page.sourceDiagramIds,
    })),
    dataEntities: [
      {
        id: "entity-domain-record",
        name: `${appBlueprint.domain}业务数据`,
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string", required: true },
          { name: "status", type: "string", required: false },
        ],
        sourceDiagramIds: [],
      },
    ],
    implementationNotes: [
      uiBlueprint.visualLanguage,
      uiBlueprint.navigationModel,
      "页面按业务流程拆分到 /src/pages，复用展示拆分到 /src/components。",
    ],
    appBlueprint,
    uiBlueprint,
    uiReferenceSpec: null,
    uiIr,
    filePlan,
  });
}

export function createDefaultCodeTheme(appName: string): CodeUiBlueprint["theme"] {
  return {
    name: `${appName}业务原型`,
    primaryColor: "#2563eb",
    backgroundColor: "#f8fafc",
    surfaceColor: "#ffffff",
    textColor: "#0f172a",
    accentColor: "#f97316",
    density: "compact",
    tone: "由前端设计执行器根据业务逻辑进一步推导界面气质",
  };
}

export function buildCodeGenerationSpecFromBusinessLogic(
  businessLogic: CodeBusinessLogic,
  uiBlueprint: CodeUiBlueprint | null = null,
): CodeGenerationSpec {
  const pages = businessLogic.pageFlows.map((flow) => ({
    id: flow.id,
    name: flow.name,
    route: flow.route.startsWith("/") ? flow.route : `/${flow.route}`,
    purpose: flow.purpose,
    sourceDiagramIds: flow.sourceRefs,
  }));
  const entities = businessLogic.businessEntities.length
    ? businessLogic.businessEntities
    : [
        {
          id: "entity-domain-record",
          name: "业务记录",
          description: businessLogic.domainSummary,
          fields: ["id:string", "name:string", "status:string"],
          relationships: [],
        },
      ];

  return codeGenerationSpecSchema.parse({
    appName: businessLogic.appName,
    summary: businessLogic.coreWorkflow,
    theme: uiBlueprint?.theme ?? createDefaultCodeTheme(businessLogic.appName),
    pages,
    components: [
      {
        id: "component-workspace-shell",
        name: "WorkspaceShell",
        responsibility: "组织原型导航、页面切换和全局布局",
        sourceDiagramIds: [],
      },
      {
        id: "component-domain-table",
        name: "DomainDataTable",
        responsibility: "展示业务实体列表、筛选、状态和主要操作",
        sourceDiagramIds: businessLogic.plantUmlTraceability,
      },
      {
        id: "component-detail-panel",
        name: "DetailPanel",
        responsibility: "承载详情、审批、提交、异常和状态切换",
        sourceDiagramIds: businessLogic.plantUmlTraceability,
      },
    ],
    interactions: businessLogic.frontendOperations.map((operation, index) => ({
      id: `interaction-${index + 1}`,
      trigger: operation,
      behavior: operation,
      sourceDiagramIds: businessLogic.plantUmlTraceability,
    })),
    dataEntities: entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      fields: entity.fields.map((field) => {
        const [name, type = "string"] = field.split(":");
        return {
          name: name.trim() || field,
          type: type.trim() || "string",
          required: true,
        };
      }),
      sourceDiagramIds: businessLogic.plantUmlTraceability,
    })),
    implementationNotes: [
      businessLogic.domainSummary,
      businessLogic.coreWorkflow,
      uiBlueprint?.visualLanguage ??
        "前端设计执行器负责从业务逻辑推导页面主题、导航、布局密度、组件结构和状态表达。",
      uiBlueprint?.navigationModel ??
        "新链路不单独生成 uiBlueprint，导航模型由前端设计执行器在代码生成阶段确定。",
      "新链路由前端设计执行器直接生成 React 文件操作，不依赖界面图或 UI IR。",
    ],
    appBlueprint: null,
    uiBlueprint,
    uiReferenceSpec: null,
    uiIr: null,
    filePlan: null,
  });
}

export function appendMarkdownList(lines: string[], title: string, values: string[]) {
  const filtered = values.map((value) => value.trim()).filter(Boolean);
  if (filtered.length === 0) return;
  lines.push(`## ${title}`, "");
  for (const value of filtered) {
    lines.push(`- ${value}`);
  }
  lines.push("");
}

export function buildBusinessContextMarkdown(snapshot: CodeRunSnapshot) {
  const businessLogic = snapshot.businessLogic;
  const lines = [
    "# Business Context",
    "",
    "此文件由平台根据设计模型和实现模型自动维护，用于承载项目背景、权限边界、设计溯源和服务边界。",
    "这些说明性内容供代码页查看，不应直接渲染到业务原型 UI 中。",
    "",
  ];

  if (!businessLogic) {
    appendMarkdownList(lines, "设计模型", snapshot.designModels.map((model) => model.diagramKind));
    return `${lines.join("\n").trim()}\n`;
  }

  lines.push("## 项目背景", "");
  lines.push(`- 应用名称：${businessLogic.appName}`);
  lines.push(`- 领域摘要：${businessLogic.domainSummary}`);
  lines.push(`- 核心流程：${businessLogic.coreWorkflow}`, "");

  appendMarkdownList(
    lines,
    "权限边界",
    businessLogic.permissions.map(
      (permission) =>
        `${permission.actor}：${permission.allowedActions.join("、")}${
          permission.restrictedActions.length
            ? `；不可执行：${permission.restrictedActions.join("、")}`
            : ""
        }`,
    ),
  );
  appendMarkdownList(lines, "前端必须实现的操作", businessLogic.frontendOperations);
  appendMarkdownList(lines, "异常与边界条件", businessLogic.edgeCases);
  appendMarkdownList(lines, "PlantUML 溯源", businessLogic.plantUmlTraceability);
  appendMarkdownList(lines, "输入设计模型", snapshot.designModels.map((model) => model.diagramKind));

  return `${lines.join("\n").trim()}\n`;
}

export function upsertBusinessContextMarkdown(record: RunRecord, snapshot: CodeRunSnapshot) {
  emitCodeFileChanged(
    record,
    snapshot,
    "/BUSINESS_CONTEXT.md",
    buildBusinessContextMarkdown(snapshot),
    "写入业务说明文档，供代码页查看，不进入业务 UI",
  );
}

export function addBusinessCoverageTerm(terms: Set<string>, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized.length < 2) return;
  terms.add(normalized);
}

export function extractBusinessCoverageTerms(businessLogic: CodeBusinessLogic) {
  const terms = new Set<string>();
  addBusinessCoverageTerm(terms, businessLogic.appName);
  for (const page of businessLogic.pageFlows) {
    addBusinessCoverageTerm(terms, page.name);
    addBusinessCoverageTerm(terms, page.purpose);
    for (const action of page.userActions) addBusinessCoverageTerm(terms, action);
    for (const state of page.states) addBusinessCoverageTerm(terms, state);
  }
  for (const entity of businessLogic.businessEntities) {
    addBusinessCoverageTerm(terms, entity.name);
    for (const field of entity.fields) {
      addBusinessCoverageTerm(terms, field.split(":")[0]);
    }
  }
  for (const operation of businessLogic.frontendOperations) {
    addBusinessCoverageTerm(terms, operation);
  }
  for (const edgeCase of businessLogic.edgeCases) {
    addBusinessCoverageTerm(terms, edgeCase);
  }
  return [...terms];
}

const nearBlackMainBackgroundPattern =
  /(?:--(?:bg|background)\s*:\s*(?:#(?:0{3}|000000|030304|050506)\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|black\b)|background(?:-color)?\s*:\s*(?:#(?:0{3}|000000|030304|050506)\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|black\b))/i;

export function hasRequiredThemeTokens(styles: string) {
  return ["--bg", "--surface", "--text", "--muted", "--primary", "--border"].every(
    (token) => styles.includes(token),
  );
}

export function hasDarkThemeDefinition(styles: string) {
  return /\[data-theme=["']?dark["']?\]|\.dark\b|data-theme\s*=\s*["']dark["']/i.test(
    styles,
  );
}

export function hasThemeToggleLogic(filesText: string) {
  return /data-theme|setAttribute\(["']data-theme|useState[^\n]*(?:theme|dark)|setTheme|浅色|深色|Light|Dark/i.test(
    filesText,
  );
}

export function hasUnsafePreviewNavigation(filesText: string) {
  return /\bBrowserRouter\b|\bcreateBrowserRouter\b|\bhistory\.(?:pushState|replaceState)\b|\bwindow\.history\.(?:pushState|replaceState)\b|\bwindow\.location\b|\blocation\.(?:href|assign|replace)\b|\bdocument\.location\b/i.test(
    filesText,
  );
}

export function hasAbsoluteUrlNavigation(filesText: string) {
  return /\b(?:navigate|setRoute|setCurrentRoute|open|href|src)\s*[=:]?\s*\(\s*["'`]https?:\/\/|\b(?:href|to)\s*=\s*["'`]https?:\/\/|\bhistory\.(?:pushState|replaceState)\s*\([^)]*["'`]https?:\/\//i.test(
    filesText,
  );
}

export function hasDocumentTitleSetter(snapshot: CodeRunSnapshot, filesText: string) {
  return !snapshot.businessLogic?.appName?.trim() || filesText.includes("document.title");
}

export function countTailwindUtilityClassHits(filesText: string) {
  return (
    filesText.match(
      /\b(?:flex|inline-flex|grid|items-center|items-start|justify-center|justify-between|rounded(?:-[\w:[\]/.-]+)?|bg-[\w:[\]/#%.-]+|text-[\w:[\]/#%.-]+|p[trblxy]?-[\w[\]/.-]+|m[trblxy]?-[\w[\]/.-]+|gap-[\w[\]/.-]+|space-[xy]-[\w[\]/.-]+|shadow(?:-[\w[\]/.-]+)?|border(?:-[\w[\]/.-]+)?|ring(?:-[\w[\]/.-]+)?|hover:|focus:|focus-visible:|dark:|sm:|md:|lg:|xl:)\b/g,
    ) ?? []
  ).length;
}

export function findMissingLocalUiComponentImports(snapshot: CodeRunSnapshot) {
  const missing = new Set<string>();
  const importPattern =
    /from\s+["'](?:@\/components\/ui\/([^"']+)|(?:\.{1,2}\/)+[^"']*components\/ui\/([^"']+))["']/g;
  for (const content of Object.values(snapshot.files)) {
    for (const match of content.matchAll(importPattern)) {
      const importName = (match[1] ?? match[2] ?? "").replace(/\.(tsx?|jsx?)$/, "");
      if (!importName || importName.includes("*")) {
        continue;
      }
      const normalizedName = importName.split("/")[0];
      const candidates = [
        `/src/components/ui/${normalizedName}.tsx`,
        `/src/components/ui/${normalizedName}/index.tsx`,
      ];
      if (!candidates.some((candidate) => !isBlankCodeFile(snapshot.files[candidate]))) {
        missing.add(`/src/components/ui/${normalizedName}.tsx`);
      }
    }
  }
  return [...missing];
}

function localUiImportPath(importName: string) {
  const normalizedName = importName
    .replace(/\.(tsx?|jsx?)$/, "")
    .split("/")[0];
  if (!normalizedName || normalizedName.includes("*")) return null;
  return {
    displayPath: `/src/components/ui/${normalizedName}.tsx`,
    candidates: [
      `/src/components/ui/${normalizedName}.tsx`,
      `/src/components/ui/${normalizedName}/index.tsx`,
    ],
  };
}

function exportedNamesFromSource(source: string) {
  const names = new Set<string>();
  const declarationPattern =
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(declarationPattern)) {
    if (match[1]) names.add(match[1]);
  }
  const namedExportPattern = /export\s*\{([^}]+)\}/g;
  for (const match of source.matchAll(namedExportPattern)) {
    const specifiers = (match[1] ?? "").split(",");
    for (const specifier of specifiers) {
      const cleaned = specifier.trim().replace(/^type\s+/, "");
      if (!cleaned) continue;
      const exportedName = cleaned.includes(" as ")
        ? cleaned.split(/\s+as\s+/).at(-1)
        : cleaned;
      if (exportedName) names.add(exportedName.trim());
    }
  }
  return names;
}

function importedExportNames(specifierList: string) {
  return specifierList
    .split(",")
    .map((specifier) => specifier.trim().replace(/^type\s+/, ""))
    .map((specifier) => specifier.split(/\s+as\s+/)[0]?.trim() ?? "")
    .filter(Boolean);
}

export function findMissingLocalUiNamedExports(snapshot: CodeRunSnapshot) {
  const missing = new Map<string, Set<string>>();
  const importPattern =
    /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["'](?:@\/components\/ui\/([^"']+)|(?:\.{1,2}\/)+[^"']*components\/ui\/([^"']+))["']/g;
  for (const content of Object.values(snapshot.files)) {
    for (const match of content.matchAll(importPattern)) {
      const isTypeOnlyImport = Boolean(match[1]);
      if (isTypeOnlyImport) continue;
      const importInfo = localUiImportPath(match[3] ?? match[4] ?? "");
      if (!importInfo) continue;
      const targetPath = importInfo.candidates.find(
        (candidate) => !isBlankCodeFile(snapshot.files[candidate]),
      );
      if (!targetPath) continue;
      const exportedNames = exportedNamesFromSource(snapshot.files[targetPath] ?? "");
      for (const importedName of importedExportNames(match[2] ?? "")) {
        if (exportedNames.has(importedName)) continue;
        const names = missing.get(importInfo.displayPath) ?? new Set<string>();
        names.add(importedName);
        missing.set(importInfo.displayPath, names);
      }
    }
  }
  return Array.from(missing.entries()).map(([path, names]) => ({
    path,
    names: Array.from(names).sort(),
  }));
}

// Deterministic quality audit catches broken previews before users see generated code.
export function auditCodePrototypeQuality(snapshot: CodeRunSnapshot): CodeQualityDiagnostic {
  const issues: CodeQualityDiagnostic["issues"] = [];
  const filePaths = Object.keys(snapshot.files);
  const filesText = Object.values(snapshot.files).join("\n");
  const stylesText = snapshot.files["/src/styles.css"] ?? "";
  const pageFiles = filePaths.filter((path) => /^\/src\/pages\/.+\.tsx$/.test(path));
  const componentFiles = filePaths.filter((path) =>
    /^\/src\/components\/.+\.tsx$/.test(path),
  );
  const uiComponentFiles = filePaths.filter((path) =>
    /^\/src\/components\/ui\/.+\.tsx$/.test(path),
  );
  const requiredFiles = [
    "/src/App.tsx",
    "/src/components/WorkspaceShell.tsx",
    "/src/domain/types.ts",
    "/src/data/mock-data.ts",
    "/src/styles.css",
  ];

  for (const path of requiredFiles) {
    if (isBlankCodeFile(snapshot.files[path])) {
      issues.push({ severity: "error", path, message: "必要原型文件缺失或为空" });
    }
  }

  for (const plannedFile of snapshot.filePlan?.files ?? []) {
    if (plannedFile.path === "/index.html" || plannedFile.path === "/src/main.tsx") {
      continue;
    }
    if (isBlankCodeFile(snapshot.files[normalizeFilePath(plannedFile.path)])) {
      issues.push({
        severity: "error",
        path: plannedFile.path,
        message: "文件计划中的文件未生成",
      });
    }
  }

  if (pageFiles.length < 2) {
    issues.push({
      severity: "error",
      message: "页面文件不足，至少需要 2 个 /src/pages/* 页面文件",
    });
  }
  if (componentFiles.length < 3) {
    issues.push({
      severity: "error",
      message: "组件文件不足，至少需要 3 个 /src/components/* 组件文件",
    });
  }
  if (isBlankCodeFile(snapshot.files["/src/lib/utils.ts"])) {
    issues.push({
      severity: "error",
      path: "/src/lib/utils.ts",
      message:
        "缺少 shadcn 风格 cn 工具文件；必须生成 /src/lib/utils.ts，并使用 clsx + tailwind-merge 提供 cn()",
    });
  }
  if (uiComponentFiles.length < 3) {
    issues.push({
      severity: "error",
      path: "/src/components/ui",
      message:
        "本地 shadcn 风格 UI 组件不足；至少需要 3 个 /src/components/ui/* 组件，默认包含 button、badge、card",
    });
  }
  if (!/class-variance-authority|cva\s*\(/.test(filesText)) {
    issues.push({
      severity: "error",
      message:
        "未检测到 class-variance-authority/cva variants；至少一个本地 UI 组件必须使用 cva 定义 variants",
    });
  }
  if (!/\bcn\s*\(/.test(filesText)) {
    issues.push({
      severity: "error",
      message:
        "未检测到 cn() className 组合；本地 UI 组件和页面必须通过 cn() 组合 Tailwind className",
    });
  }
  if (countTailwindUtilityClassHits(filesText) < 20) {
    issues.push({
      severity: "error",
      message:
        "Tailwind utility class 使用不足，页面仍像主要依赖普通 CSS；必须以 Tailwind utility class 主导布局、间距、圆角、颜色和响应式",
    });
  }
  for (const missingPath of findMissingLocalUiComponentImports(snapshot)) {
    issues.push({
      severity: "error",
      path: missingPath,
      message: "引用了本地 shadcn 风格组件但缺少对应源码文件，必须补齐 /src/components/ui/*",
    });
  }
  for (const missingExport of findMissingLocalUiNamedExports(snapshot)) {
    issues.push({
      severity: "error",
      path: missingExport.path,
      message: `本地 shadcn 风格组件缺少命名导出 ${missingExport.names.join("、")}，引用方无法在预览中加载`,
    });
  }
  if (filePaths.filter((path) => path.startsWith("/src/")).length < 8) {
    issues.push({
      severity: "error",
      message: "文件数量不足，原型仍像单文件或少文件实现",
    });
  }
  if (!snapshot.files[snapshot.entryFile ?? ""]) {
    issues.push({
      severity: "error",
      path: snapshot.entryFile ?? undefined,
      message: "入口文件不存在或未设置",
    });
  }

  if (nearBlackMainBackgroundPattern.test(stylesText)) {
    issues.push({
      severity: "error",
      path: "/src/styles.css",
      message:
        "页面主背景使用了纯黑或近纯黑颜色，生成原型必须默认浅色主题，深色只能作为可切换模式",
    });
  }
  if (!hasRequiredThemeTokens(stylesText) || !hasDarkThemeDefinition(stylesText)) {
    issues.push({
      severity: "error",
      path: "/src/styles.css",
      message:
        "样式缺少浅色默认与深色模式 CSS variables，至少需要 :root、[data-theme=\"dark\"] 以及 --bg/--surface/--text/--muted/--primary/--border",
    });
  }
  if (!hasThemeToggleLogic(filesText)) {
    issues.push({
      severity: "error",
      message:
        "原型缺少可见的浅色/深色主题切换逻辑，需要在顶部栏等位置提供主题切换控件",
    });
  }
  if (hasUnsafePreviewNavigation(filesText) || hasAbsoluteUrlNavigation(filesText)) {
    issues.push({
      severity: "error",
      message:
        "原型使用了真实浏览器路由或绝对 URL 导航，srcdoc 预览会触发 SecurityError；必须改为内存模拟路由或普通 React state 页面切换",
    });
  }
  if (!hasDocumentTitleSetter(snapshot, filesText)) {
    issues.push({
      severity: "error",
      path: "/src/App.tsx",
      message:
        "应用标题没有通过 React 设置 document.title；不要修改 /index.html，应在运行时设置为业务应用名称",
    });
  }

  const realNetworkPattern =
    /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b|https?:\/\/(?!localhost|127\.0\.0\.1)/;
  for (const [path, content] of Object.entries(snapshot.files)) {
    if (path.startsWith("/src/") && realNetworkPattern.test(content)) {
      issues.push({
        severity: "warning",
        path,
        message: "检测到真实网络请求痕迹，第一版原型应使用本地 mock 数据",
      });
    }
  }

  if (snapshot.businessLogic) {
    const terms = extractBusinessCoverageTerms(snapshot.businessLogic);
    const matchedTerms = terms.filter((term) => filesText.includes(term));
    const minimumMatches = Math.min(4, Math.max(2, Math.ceil(terms.length * 0.2)));
    if (terms.length > 0 && matchedTerms.length < minimumMatches) {
      issues.push({
        severity: "error",
        message:
          "生成文件没有体现足够的业务逻辑关键词，疑似只保留了稳定骨架或空泛原型",
      });
    }
  }

  return codeQualityDiagnosticSchema.parse({
    passed: issues.every((issue) => issue.severity !== "error"),
    metrics: {
      fileCount: filePaths.length,
      pageFileCount: pageFiles.length,
      componentFileCount: componentFiles.length,
    },
    issues,
  });
}

export function appendCodeQualityIssue(
  diagnostic: CodeQualityDiagnostic,
  issue: CodeQualityDiagnostic["issues"][number],
): CodeQualityDiagnostic {
  const issues = [...diagnostic.issues, issue];
  return codeQualityDiagnosticSchema.parse({
    ...diagnostic,
    passed: issues.every((item) => item.severity !== "error"),
    issues,
  });
}

// Preview structure verification checks render-critical files without changing SSE shapes.
export function verifyRenderedPreviewStructure(snapshot: CodeRunSnapshot): CodeVisualDiffReport {
  const filesText = Object.values(snapshot.files).join("\n");
  const stylesText = snapshot.files["/src/styles.css"] ?? "";
  const findings: string[] = [];
  const repairSuggestions: string[] = [];

  const entryPath = snapshot.entryFile ?? "/src/App.tsx";
  if (!snapshot.files[entryPath] || isBlankCodeFile(snapshot.files[entryPath])) {
    findings.push("入口文件缺失或为空，预览无法稳定渲染。");
    repairSuggestions.push("补齐 /src/App.tsx，并确保它挂载 WorkspaceShell 或主页面组件。");
  }

  if (/\bthrow new Error\b|TODO:\s*render|return\s+null\s*;/i.test(filesText)) {
    findings.push("检测到明显的未实现或主动报错代码。");
    repairSuggestions.push("移除未实现占位逻辑，改为可渲染的业务空态或 mock 数据展示。");
  }

  if (!/WorkspaceShell|SidebarNav|nav|navigation|侧边|导航/i.test(filesText)) {
    findings.push("没有检测到主导航或 WorkspaceShell 结构。");
    repairSuggestions.push("按 UI IR 增加主导航，并展示页面切换入口。");
  }

  if (!/DataTable|MetricCard|DetailPanel|table|card|列表|表格|详情|统计/i.test(filesText)) {
    findings.push("没有检测到核心业务数据区域。");
    repairSuggestions.push("补齐统计卡片、表格或详情面板，绑定 mock-data.ts 中的业务数据。");
  }

  if (!/ActionButton|<button|role=["']button["']|主要操作|新增|提交|保存|处理/i.test(filesText)) {
    findings.push("没有检测到主要操作按钮。");
    repairSuggestions.push("为主页面增加一个清晰的主要操作入口，并使用 token 样式。");
  }

  if (!/@media|clamp\(|minmax\(|flex-wrap|grid-template-columns:\s*repeat\(|max-width:\s*100%|overflow-x:\s*auto/i.test(filesText)) {
    findings.push("没有检测到基础响应式布局策略，窄 iframe 与新窗口宽 viewport 可能表现不稳定。");
    repairSuggestions.push("补齐响应式 CSS：使用 media query、flex-wrap、minmax grid、max-width:100% 或 overflow-x:auto，确保窄宽 viewport 都可用。");
  }

  if (/min-width:\s*(?:9\d{2,}|\d{4,})px|width:\s*(?:9\d{2,}|\d{4,})px|100vw/i.test(filesText)) {
    findings.push("检测到可能导致窄预览横向溢出的固定宽度或 100vw 用法。");
    repairSuggestions.push("移除大固定宽度和 100vw 容器，改用 width:100%、max-width、minmax 或容器内滚动。");
  }

  if (nearBlackMainBackgroundPattern.test(stylesText)) {
    findings.push("页面主背景使用了纯黑或近纯黑颜色，默认浅色主题要求未满足。");
    repairSuggestions.push("将默认主题改为浅色 CSS variables，并把柔和深色仅放入 [data-theme=\"dark\"] 模式。");
  }

  if (!hasRequiredThemeTokens(stylesText) || !hasDarkThemeDefinition(stylesText)) {
    findings.push("未检测到完整的浅色/深色主题 token 定义。");
    repairSuggestions.push("在 /src/styles.css 中补齐 :root 与 [data-theme=\"dark\"]，包含 --bg、--surface、--text、--muted、--primary、--border。");
  }

  if (!hasThemeToggleLogic(filesText)) {
    findings.push("未检测到浅色/深色主题切换控件或 data-theme 切换逻辑。");
    repairSuggestions.push("在顶部栏增加主题切换按钮，使用 React state 控制 data-theme 或 class。");
  }

  if (hasUnsafePreviewNavigation(filesText) || hasAbsoluteUrlNavigation(filesText)) {
    findings.push("检测到真实浏览器路由、history API、window.location 或绝对 URL 导航，srcdoc 预览可能抛出 SecurityError。");
    repairSuggestions.push("保留 businessLogic 中的 route 字符串作为模拟路径，使用 React state 切换页面；删除 BrowserRouter、history.pushState/replaceState、window.location 和绝对 URL 跳转。");
  }

  if (!hasDocumentTitleSetter(snapshot, filesText)) {
    findings.push("未检测到通过 React 设置业务应用 document.title。");
    repairSuggestions.push("在 /src/App.tsx 中用 useEffect 设置 document.title 为 businessLogic.appName，不要生成或修改 /index.html。");
  }

  if (snapshot.uiIr && !/--color-primary|--space-3|--radius-md/.test(filesText)) {
    findings.push("未检测到 UI IR 要求的 token CSS variables 使用。");
    repairSuggestions.push("在 /src/styles.css 定义并在组件中使用 --color-primary、--space-3、--radius-md 等变量。");
  }

  const passed = findings.length === 0;
  return codeVisualDiffReportSchema.parse({
    passed,
    checkedAt: new Date().toISOString(),
    findings,
    repairSuggestions,
    summary: passed
      ? "结构化预览验证通过：入口、导航、业务区、主要操作和基础响应式策略均已具备。"
      : `结构化预览验证发现 ${findings.length} 个问题。`,
  });
}
