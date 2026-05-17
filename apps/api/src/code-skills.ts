import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  codeSkillActionResultSchema,
  codeSkillActionSchema,
  codeSkillContextSchema,
  codeSkillDiagnosticsSchema,
  codeSkillFileSchema,
  codeSkillResourceDiscoveryPlanSchema,
  codeSkillResourcePreviewResultSchema,
  codeSkillResourcePlanSchema,
  codeSkillSelectionSchema,
  codeVisualDirectionSchema,
  loadedCodeSkillSchema,
  type CodeBusinessLogic,
  type CodeSkillAction,
  type CodeSkillActionResult,
  type CodeSkillContext,
  type CodeSkillDiagnostics,
  type CodeSkillFile,
  type CodeSkillResourceDiscoveryPlan,
  type CodeSkillResourcePreview,
  type CodeSkillResourcePreviewResult,
  type CodeSkillResourcePlan,
  type CodeSkillResourceRequest,
  type CodeSkillSelection,
  type CodeVisualDirection,
  type LoadedCodeSkill,
} from "@uml-platform/contracts";

const WEB_DESIGN_SKILL_ALIAS = "@web-design";
const WEB_DESIGN_SKILL_NAME = "ui-ux-pro-max";
const MAX_SKILL_CONTENT_CHARS = 32000;
const MAX_MANIFEST_FILES = 80;
const ACTION_CONFIG_FILE = "skill.actions.json";
const CODE_SKILL_ACTION_MODE_VALUES = ["csv", "python", "auto"] as const;
const WEB_REACT_BLOCKED_CSV_PATHS = new Set([
  "data/app-interface.csv",
  "data/draft.csv",
  "data/stacks/flutter.csv",
  "data/stacks/jetpack-compose.csv",
  "data/stacks/react-native.csv",
  "data/stacks/swiftui.csv",
]);
const WEB_REACT_BLOCKED_PLATFORM_PATTERN =
  /\b(mobile|ios|android|react native|flutter|swiftui|jetpack compose|expo|nativewind|reanimated|haptics?)\b/i;
const WEB_REACT_ALLOWED_PLATFORM_PATTERN = /\b(web|all|general|react|next\.?js|react\/next\.js)\b/i;

type CodeSkillActionMode = (typeof CODE_SKILL_ACTION_MODE_VALUES)[number];

export type LoadedWebDesignSkill = LoadedCodeSkill;

type SkillFrontmatter = Record<string, string | string[] | number | undefined>;

type SkillActionConfig = {
  actions?: unknown[];
};

function parseScalarOrList(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(raw: string) {
  const normalized = raw.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return { metadata: {} as SkillFrontmatter, content: normalized.trim() };
  }

  const end = normalized.indexOf("\n---", 3);
  if (end < 0) {
    return { metadata: {} as SkillFrontmatter, content: normalized.trim() };
  }

  const metadataText = normalized.slice(3, end).trim();
  const content = normalized.slice(end + "\n---".length).trim();
  const metadata: SkillFrontmatter = {};
  const lines = metadataText.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (value === "|" || value === ">") {
      const block: string[] = [];
      for (let next = index + 1; next < lines.length; next += 1) {
        if (/^[A-Za-z0-9_-]+:\s*/.test(lines[next])) break;
        block.push(lines[next].replace(/^\s{2,}/, ""));
        index = next;
      }
      metadata[key] = block.join("\n").trim();
    } else {
      metadata[key] = parseScalarOrList(value);
    }
  }

  return { metadata, content };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function projectRootCandidates() {
  const here = dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();
  return [
    resolve(here, "../../.."),
    resolve(cwd, "../.."),
    cwd,
  ];
}

function uniquePaths(paths: string[]) {
  return Array.from(new Set(paths.map((path) => resolve(path))));
}

function skillSearchRootCandidates() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envRoots = (process.env.UML_CODE_SKILLS_ROOT ?? "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const roots = [
    ...envRoots,
    resolve(here, "code-skills"),
    resolve(here, "../src/code-skills"),
    ...projectRootCandidates().flatMap((root) => [
      resolve(root, "apps/api/dist/code-skills"),
      resolve(root, "apps/api/src/code-skills"),
      resolve(root, "skills/code"),
    ]),
  ];
  return uniquePaths(roots);
}

function skillSearchRoots() {
  return skillSearchRootCandidates().filter((path) => {
    try {
      return existsSync(path) && statSync(path).isDirectory();
    } catch {
      return false;
    }
  });
}

function walkFiles(root: string, predicate: (path: string) => boolean, limit = 500) {
  const results: string[] = [];
  const visit = (dir: string) => {
    if (results.length >= limit) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= limit) return;
      const absolute = join(dir, entry);
      let stat;
      try {
        stat = statSync(absolute);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".git" || entry === "__pycache__") continue;
        visit(absolute);
      } else if (stat.isFile() && predicate(absolute)) {
        results.push(absolute);
      }
    }
  };
  visit(root);
  return results;
}

function classifySkillFile(relativePath: string): CodeSkillFile["kind"] {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized === "SKILL.md") return "skill";
  if (normalized === ACTION_CONFIG_FILE) return "config";
  if (normalized.startsWith("data/")) return "data";
  if (normalized.startsWith("scripts/")) return "script";
  if (normalized.startsWith("templates/")) return "template";
  if (normalized.startsWith("references/") || normalized.startsWith("reference/")) return "reference";
  return "other";
}

function createFileManifest(baseDir: string): CodeSkillFile[] {
  return walkFiles(
    baseDir,
    (path) => {
      const extension = extname(path).toLowerCase();
      return [".md", ".json", ".csv", ".py", ".txt"].includes(extension);
    },
    MAX_MANIFEST_FILES,
  ).map((path) => {
    const relativePath = relative(baseDir, path);
    return codeSkillFileSchema.parse({
      path,
      relativePath,
      kind: classifySkillFile(relativePath),
      size: statSync(path).size,
    });
  });
}

function discoverSkillMarkdownFiles() {
  return skillSearchRoots().flatMap((root) =>
    walkFiles(root, (path) => path.endsWith(`${sep}SKILL.md`) || path.endsWith("/SKILL.md"), 200),
  );
}

function loadSkillByNameOrAlias(nameOrAlias: string): {
  skill: LoadedCodeSkill;
  diagnostics: CodeSkillDiagnostics[];
} | null {
  const diagnostics: CodeSkillDiagnostics[] = [];
  for (const skillPath of discoverSkillMarkdownFiles()) {
    const raw = readFileSync(skillPath, "utf8");
    const { metadata, content } = parseFrontmatter(raw);
    const name = typeof metadata.name === "string" ? metadata.name : "";
    const aliases = asStringArray(metadata.aliases);
    const effectiveAliases = Array.from(new Set([...aliases, ...(name === WEB_DESIGN_SKILL_NAME ? [WEB_DESIGN_SKILL_ALIAS] : [])]));
    if (name !== nameOrAlias && !effectiveAliases.includes(nameOrAlias)) continue;

    const baseDir = dirname(skillPath);
    const description =
      typeof metadata.description === "string" && metadata.description.trim()
        ? metadata.description
        : `${name} skill`;
    const alias = effectiveAliases.includes(WEB_DESIGN_SKILL_ALIAS)
      ? WEB_DESIGN_SKILL_ALIAS
      : effectiveAliases[0] ?? `@${name}`;

    return {
      skill: loadedCodeSkillSchema.parse({
        alias,
        aliases: effectiveAliases,
        name,
        description,
        source: "project",
        location: skillPath,
        baseDir,
        fileManifest: createFileManifest(baseDir),
        content,
        loadedAt: new Date().toISOString(),
      }),
      diagnostics,
    };
  }
  return null;
}

export function loadWebDesignSkill(): {
  skill: LoadedWebDesignSkill;
  diagnostics: CodeSkillDiagnostics[];
} {
  const result = loadSkillByNameOrAlias(WEB_DESIGN_SKILL_NAME) ?? loadSkillByNameOrAlias(WEB_DESIGN_SKILL_ALIAS);
  if (!result) {
    throw new Error(
      `前端设计执行器 skill missing: SKILL.md. Scanned roots: ${skillSearchRootCandidates().join(", ")}`,
    );
  }
  if (result.skill.name !== WEB_DESIGN_SKILL_NAME) {
    result.diagnostics.push(
      codeSkillDiagnosticsSchema.parse({
        level: "warning",
        source: result.skill.location,
        message: "前端设计执行器 skill 元数据名称与平台默认配置不一致。",
      }),
    );
  }
  return result;
}

export function getCodeSkillRuntimeStatus() {
  const roots = skillSearchRootCandidates();
  const existingRoots = skillSearchRoots();
  const skill = loadSkillByNameOrAlias(WEB_DESIGN_SKILL_NAME) ?? loadSkillByNameOrAlias(WEB_DESIGN_SKILL_ALIAS);
  const actionMode = getCodeSkillActionMode();
  return {
    roots,
    existingRoots,
    hasUiUxProMaxSkill: Boolean(skill),
    uiUxProMaxSkillPath: skill?.skill.location ?? null,
    actionMode,
    pythonAvailable: isPythonAvailable(),
    pythonActionsOptional: true,
  };
}

export function toWebDesignSkillSelection(
  skill: LoadedWebDesignSkill,
): CodeSkillSelection {
  return codeSkillSelectionSchema.parse({
    alias: skill.alias,
    name: skill.name,
    description: skill.description,
    source: skill.source,
    location: skill.location,
    appliesTo: ["planning", "implementation", "repair", "audit"],
    priority: 100,
    reason: "加载前端设计执行器，作为代码页前端设计执行 skill；alias @web-design 保持兼容。",
  });
}

function readSkillActions(skill: LoadedCodeSkill): {
  actions: CodeSkillAction[];
  diagnostics: CodeSkillDiagnostics[];
} {
  const diagnostics: CodeSkillDiagnostics[] = [];
  const configPath = join(skill.baseDir, ACTION_CONFIG_FILE);
  if (!existsSync(configPath)) {
    return { actions: [], diagnostics };
  }
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8")) as SkillActionConfig;
    const actions = (config.actions ?? []).map((action) => codeSkillActionSchema.parse(action));
    return { actions, diagnostics };
  } catch (error) {
    diagnostics.push(
      codeSkillDiagnosticsSchema.parse({
        level: "warning",
        source: configPath,
        message: `读取 skill actions 失败：${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    return { actions: [], diagnostics };
  }
}

function getCodeSkillActionMode(): CodeSkillActionMode {
  const value = (process.env.UML_CODE_SKILL_ACTION_MODE ?? "csv").toLowerCase();
  return CODE_SKILL_ACTION_MODE_VALUES.includes(value as CodeSkillActionMode)
    ? (value as CodeSkillActionMode)
    : "csv";
}

function isPythonAvailable() {
  for (const command of ["python", "python3", "py"]) {
    try {
      const result = spawnSync(command, ["--version"], {
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        timeout: 3000,
      });
      if (!result.error && result.status === 0) return true;
    } catch {
      // Try the next command.
    }
  }
  return false;
}

function hasChartNeed(businessLogic: CodeBusinessLogic) {
  const text = [
    businessLogic.domainSummary,
    businessLogic.coreWorkflow,
    ...businessLogic.pageFlows.map((flow) => `${flow.name} ${flow.purpose} ${flow.userActions.join(" ")}`),
    ...businessLogic.frontendOperations,
  ].join(" ");
  return /图表|统计|趋势|报表|分析|dashboard|chart|analytics|metric|metrics/i.test(text);
}

function buildSkillQuery(businessLogic: CodeBusinessLogic) {
  const actors = businessLogic.actors.map((actor) => actor.name).slice(0, 4).join(" ");
  const pages = businessLogic.pageFlows.map((flow) => flow.name).slice(0, 6).join(" ");
  const operations = businessLogic.frontendOperations.slice(0, 8).join(" ");
  const entities = businessLogic.businessEntities.map((entity) => entity.name).slice(0, 6).join(" ");
  return [
    businessLogic.appName,
    businessLogic.domainSummary,
    businessLogic.coreWorkflow,
    actors,
    pages,
    entities,
    operations,
    "professional responsive accessible React prototype",
  ].filter(Boolean).join(" ").slice(0, 900);
}

function resolveActionArgs(action: CodeSkillAction, query: string) {
  return action.args.map((arg) => arg.replaceAll("{query}", query));
}

function validateActionArgsInsideSkill(skill: LoadedCodeSkill, args: string[]) {
  const baseDir = resolve(skill.baseDir);
  for (const arg of args) {
    if (!arg.endsWith(".py") && !arg.endsWith(".js") && !arg.endsWith(".mjs")) continue;
    const candidate = resolve(baseDir, arg);
    if (candidate !== baseDir && !candidate.startsWith(`${baseDir}${sep}`)) {
      throw new Error(`skill action script escapes skill directory: ${arg}`);
    }
    if (!existsSync(candidate)) {
      throw new Error(`skill action script missing: ${arg}`);
    }
  }
}

function runAction(skill: LoadedCodeSkill, action: CodeSkillAction, query: string): Promise<CodeSkillActionResult> {
  const startedAt = new Date().toISOString();
  const args = resolveActionArgs(action, query);
  validateActionArgsInsideSkill(skill, args);

  return new Promise((resolveResult) => {
    const child = spawn(action.command, args, {
      cwd: skill.baseDir,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      const completedAt = new Date().toISOString();
      resolveResult(
        codeSkillActionResultSchema.parse({
          name: action.name,
          description: action.description,
          command: action.command,
          args,
          outputFormat: action.outputFormat,
          status: "failed",
          stdout: "",
          stderr: "",
          exitCode: null,
          errorMessage: error.message,
          startedAt,
          completedAt,
        }),
      );
    });
    child.on("close", (exitCode) => {
      const completedAt = new Date().toISOString();
      const rawStdout = Buffer.concat(stdout).toString("utf8");
      const rawStderr = Buffer.concat(stderr).toString("utf8");
      resolveResult(
        codeSkillActionResultSchema.parse({
          name: action.name,
          description: action.description,
          command: action.command,
          args,
          outputFormat: action.outputFormat,
          status: exitCode === 0 ? "completed" : "failed",
          stdout: rawStdout.slice(0, action.maxOutputChars),
          stderr: rawStderr.slice(0, 4000),
          exitCode,
          errorMessage: exitCode === 0 ? undefined : `skill action exited with code ${exitCode}`,
          startedAt,
          completedAt,
        }),
      );
    });
  });
}

function tokenizeSkillQuery(query: string) {
  const lower = query.toLowerCase();
  const latin = lower.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const cjk = lower.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  return Array.from(new Set([...latin, ...cjk]));
}

function scoreSkillContextLine(line: string, tokens: string[]) {
  const lower = line.toLowerCase();
  return tokens.reduce((score, token) => score + (lower.includes(token) ? 1 : 0), 0);
}

function normalizeSkillRelativePath(value: string) {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function resolveSkillRelativeFile(skill: LoadedCodeSkill, relativePath: string) {
  const normalized = normalizeSkillRelativePath(relativePath);
  const baseDir = resolve(skill.baseDir);
  const filePath = resolve(baseDir, normalized);
  if (filePath !== baseDir && !filePath.startsWith(`${baseDir}${sep}`)) {
    throw new Error(`resource escapes skill directory: ${relativePath}`);
  }
  return { normalized, filePath };
}

function assertAllowedCsvResource(skill: LoadedCodeSkill, relativePath: string) {
  const { normalized, filePath } = resolveSkillRelativeFile(skill, relativePath);
  if (!normalized.startsWith("data/") || !normalized.endsWith(".csv")) {
    throw new Error(`only data/**/*.csv resources are allowed: ${relativePath}`);
  }
  if (WEB_REACT_BLOCKED_CSV_PATHS.has(normalized)) {
    throw new Error(`CSV resource is mobile/native-only and is not allowed for Web React prototypes: ${relativePath}`);
  }
  const listed = skill.fileManifest.some(
    (file) =>
      file.kind === "data" &&
      normalizeSkillRelativePath(file.relativePath) === normalized,
  );
  if (!listed) {
    throw new Error(`CSV resource is not in skill manifest: ${relativePath}`);
  }
  return { normalized, filePath };
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function filterCsvRowsForWebReact(header: string, rows: string[]) {
  const columns = splitCsvLine(header).map((column) => column.toLowerCase());
  const platformIndex = columns.findIndex((column) => column === "platform");
  const typeIndex = columns.findIndex((column) => column === "type");
  const scopedIndex = platformIndex >= 0 ? platformIndex : typeIndex;
  if (scopedIndex < 0) return rows;

  return rows.filter((row) => {
    const cells = splitCsvLine(row);
    const scope = cells[scopedIndex] ?? "";
    if (!scope) return true;
    if (WEB_REACT_BLOCKED_PLATFORM_PATTERN.test(scope)) return false;
    return WEB_REACT_ALLOWED_PLATFORM_PATTERN.test(scope) || !scope.trim();
  });
}

function readCsvContext(
  skill: LoadedCodeSkill,
  relativePath: string,
  query: string,
  maxChars: number,
  maxResults = 8,
) {
  const { filePath } = assertAllowedCsvResource(skill, relativePath);
  if (!existsSync(filePath)) return "";
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";

  const tokens = tokenizeSkillQuery(query);
  const header = lines[0].includes(",") ? lines[0] : "";
  const body = header ? filterCsvRowsForWebReact(header, lines.slice(1)) : lines;
  const ranked = body
    .map((line, index) => ({ line, index, score: scoreSkillContextLine(line, tokens) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked
    .filter((item) => item.score > 0)
    .slice(0, maxResults)
    .map((item) => item.line);
  const fallback = body.slice(0, Math.min(maxResults, body.length));
  const content = [header, ...(selected.length > 0 ? selected : fallback)]
    .filter(Boolean)
    .join("\n");
  return content.slice(0, maxChars);
}

function csvRowsForPreview(filePath: string) {
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { headers: [] as string[], rows: [] as string[] };
  }
  const headers = splitCsvLine(lines[0]);
  return { headers, rows: lines.slice(1) };
}

function previewCsvResource(
  skill: LoadedCodeSkill,
  relativePath: string,
  query: string,
): Omit<CodeSkillResourcePreview, "path"> {
  const { filePath } = assertAllowedCsvResource(skill, relativePath);
  if (!existsSync(filePath)) {
    return {
      rowCount: 0,
      headers: [],
      sampleRows: [],
      matchedHints: [],
      status: "failed",
      errorMessage: `${relativePath} 未找到。`,
    };
  }

  const { headers, rows } = csvRowsForPreview(filePath);
  const filteredRows = headers.length > 0
    ? filterCsvRowsForWebReact(headers.join(","), rows)
    : rows;
  const tokens = tokenizeSkillQuery(query);
  const ranked = filteredRows
    .map((line, index) => ({ line, index, score: scoreSkillContextLine(line, tokens) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked
    .filter((item) => item.score > 0)
    .slice(0, 4)
    .map((item) => item.line);
  const fallback = filteredRows.slice(0, Math.min(4, filteredRows.length));
  const sampleLines = selected.length > 0 ? selected : fallback;
  const sampleRows = sampleLines.map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(
      headers.slice(0, 12).map((header, index) => [header, cells[index] ?? ""]),
    );
  });

  return {
    rowCount: filteredRows.length,
    headers,
    sampleRows,
    matchedHints: tokens.filter((token) =>
      sampleLines.some((line) => line.toLowerCase().includes(token)),
    ).slice(0, 12),
    status: sampleRows.length > 0 ? "completed" : "skipped",
    errorMessage: sampleRows.length > 0 ? undefined : `${relativePath} 无可预览内容。`,
  };
}

function createCsvActionResult(
  name: string,
  description: string,
  relativePath: string,
  outputFormat: CodeSkillActionResult["outputFormat"],
  stdout: string,
): CodeSkillActionResult {
  const now = new Date().toISOString();
  return codeSkillActionResultSchema.parse({
    name,
    description,
    command: "node-csv-resolver",
    args: [relativePath],
    outputFormat,
    status: stdout ? "completed" : "skipped",
    stdout,
    stderr: "",
    exitCode: 0,
    errorMessage: stdout ? undefined : `${relativePath} 未找到或无可用内容。`,
    startedAt: now,
    completedAt: now,
  });
}

function csvPathForRequest(request: CodeSkillResourceRequest) {
  if (request.resourceType === "design-system") return "data/design.csv";
  if (request.resourceType === "stack") {
    const stack = (request.stack || request.name || "react").toLowerCase();
    return `data/stacks/${stack}.csv`;
  }
  if (request.resourceType === "domain") {
    const domain = (request.domain || request.name).toLowerCase();
    if (domain === "ux" || domain === "guidelines") return "data/ux-guidelines.csv";
    if (domain === "chart" || domain === "charts") return "data/charts.csv";
    return `data/${domain}.csv`;
  }
  if (request.resourceType === "csv") return request.csvPath;
  return "";
}

function createFailedActionResult(
  request: CodeSkillResourceRequest,
  command: string,
  errorMessage: string,
): CodeSkillActionResult {
  const now = new Date().toISOString();
  return codeSkillActionResultSchema.parse({
    name: request.name,
    description: request.reason,
    command,
    args: request.csvPath ? [request.csvPath] : [],
    outputFormat: "text",
    status: "failed",
    stdout: "",
    stderr: "",
    exitCode: null,
    errorMessage,
    startedAt: now,
    completedAt: now,
  });
}

function createDefaultSkillResourcePlan(
  skill: LoadedCodeSkill,
  businessLogic: CodeBusinessLogic,
): CodeSkillResourcePlan {
  const query = buildSkillQuery(businessLogic);
  const requests: CodeSkillResourceRequest[] = [
    {
      resourceType: "design-system",
      name: "design-system",
      query,
      csvPath: "",
      stack: "",
      domain: "",
      actionName: "",
      maxResults: 8,
      reason: "获取本业务原型的设计系统、视觉风格、颜色和密度建议。",
    },
    {
      resourceType: "stack",
      name: "react-stack",
      query,
      csvPath: "",
      stack: "react",
      domain: "",
      actionName: "",
      maxResults: 8,
      reason: "获取普通 React + TypeScript 原型实现规则。",
    },
    {
      resourceType: "csv",
      name: "visual-styles",
      query,
      csvPath: "data/styles.csv",
      stack: "",
      domain: "",
      actionName: "",
      maxResults: 8,
      reason: "获取适合业务视觉方向的 Web/General 风格规则。",
    },
    {
      resourceType: "csv",
      name: "product-patterns",
      query,
      csvPath: "data/products.csv",
      stack: "",
      domain: "",
      actionName: "",
      maxResults: 6,
      reason: "获取产品类型到页面模式、色彩和注意事项的映射。",
    },
    {
      resourceType: "csv",
      name: "color-palettes",
      query,
      csvPath: "data/colors.csv",
      stack: "",
      domain: "",
      actionName: "",
      maxResults: 6,
      reason: "获取浅色默认主题和可选深色主题的色彩灵感。",
    },
    {
      resourceType: "csv",
      name: "typography-system",
      query,
      csvPath: "data/typography.csv",
      stack: "",
      domain: "",
      actionName: "",
      maxResults: 6,
      reason: "获取字体气质、层级和排版建议。",
    },
    {
      resourceType: "domain",
      name: "ux-guidelines",
      query,
      csvPath: "",
      stack: "",
      domain: "ux",
      actionName: "",
      maxResults: 8,
      reason: "获取导航、表单、加载、空状态和可访问性 UX 规则。",
    },
  ];
  if (hasChartNeed(businessLogic)) {
    requests.push({
      resourceType: "domain",
      name: "chart-guidelines",
      query,
      csvPath: "",
      stack: "",
      domain: "chart",
      actionName: "",
      maxResults: 6,
      reason: "业务逻辑包含图表、统计、趋势或报表，需要图表呈现规则。",
    });
  }

  return codeSkillResourcePlanSchema.parse({
    skillName: skill.name,
    alias: skill.alias,
    query,
    requests,
    diagnostics: ["未获得模型声明的 skillResourcePlan，使用最小默认资源计划。"],
  });
}

export function fallbackCodeVisualDirection(
  businessLogic: CodeBusinessLogic,
): CodeVisualDirection {
  const productType = businessLogic.appName || "业务原型";
  return codeVisualDirectionSchema.parse({
    productType,
    targetAudience: businessLogic.actors.map((actor) => actor.name).slice(0, 4).join("、") || "业务用户",
    toneKeywords: ["professional", "friendly", "clear", "accessible"],
    styleKeywords: ["soft cards", "light SaaS", "business workflow", "responsive dashboard"],
    colorMood: "light, optimistic, trustworthy blue-green palette with warm neutral surfaces",
    typographyMood: "clean sans-serif hierarchy, readable labels, strong section titles",
    layoutMood: "responsive multi-page workspace with clear navigation and card-based sections",
    componentTexture: "soft shadows, subtle borders, rounded cards, calm status badges",
    interactionMood: "visible feedback, fast micro-interactions, clear loading and success states",
    avoidStyles: ["pure black default background", "React Native haptics", "mobile-only gestures", "generic admin table only"],
    promptBrief: `${productType} as a friendly professional Web React product, soft card-based layout, light blue-green palette, clear business workflow, polished SaaS visual system`,
  });
}

export function fallbackCodeSkillResourceDiscoveryPlan(
  skill: LoadedCodeSkill,
): CodeSkillResourceDiscoveryPlan {
  return codeSkillResourceDiscoveryPlanSchema.parse({
    skillName: skill.name,
    alias: skill.alias,
    requests: [
      ["data/styles.csv", "理解 Web/General 视觉风格。", "选择适合业务的表现风格。"],
      ["data/products.csv", "理解产品类型到页面模式的映射。", "匹配业务产品类型。"],
      ["data/colors.csv", "理解色彩系统。", "生成浅色默认主题和可选深色主题 token。"],
      ["data/typography.csv", "理解字体气质。", "生成清晰、有风格的字体层级。"],
      ["data/ux-guidelines.csv", "理解 Web/All UX 规则。", "保证表单、导航、反馈和可访问性。"],
      ["data/stacks/react.csv", "理解 React 实现规则。", "保证 React 原型可运行。"],
      ["data/icons.csv", "理解图标资源建议。", "辅助状态、空态和操作表达。"],
      ["data/ui-reasoning.csv", "理解产品类型推导规则。", "辅助视觉方向判断。"],
    ].map(([path, reason, expectedUse]) => ({ path, reason, expectedUse })),
    diagnostics: ["未获得模型声明的资源预览计划，使用默认 Web React 视觉核心资源预览。"],
  });
}

export function resolveCodeSkillResourcePreviews(
  skill: LoadedCodeSkill,
  discoveryPlan: CodeSkillResourceDiscoveryPlan,
  query: string,
): CodeSkillResourcePreviewResult {
  const parsedPlan = codeSkillResourceDiscoveryPlanSchema.parse(discoveryPlan);
  const diagnostics: CodeSkillDiagnostics[] = [];
  const previews = parsedPlan.requests.map((request) => {
    try {
      return {
        path: normalizeSkillRelativePath(request.path),
        ...previewCsvResource(skill, request.path, `${query} ${request.expectedUse}`),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(
        codeSkillDiagnosticsSchema.parse({
          level: "warning",
          source: skill.location,
          message: `skill resource preview ${request.path} 失败：${message}`,
        }),
      );
      return {
        path: normalizeSkillRelativePath(request.path),
        rowCount: 0,
        headers: [],
        sampleRows: [],
        matchedHints: [],
        status: "failed" as const,
        errorMessage: message,
      };
    }
  });

  return codeSkillResourcePreviewResultSchema.parse({
    skillName: skill.name,
    alias: skill.alias,
    previews,
    diagnostics,
  });
}

export function fallbackCodeSkillResourcePlan(
  skill: LoadedCodeSkill,
  businessLogic: CodeBusinessLogic,
): CodeSkillResourcePlan {
  return createDefaultSkillResourcePlan(skill, businessLogic);
}

export async function resolveCodeSkillContext(
  skill: LoadedCodeSkill,
  resourcePlan: CodeSkillResourcePlan,
): Promise<CodeSkillContext> {
  const parsedPlan = codeSkillResourcePlanSchema.parse(resourcePlan);
  const query = parsedPlan.query;
  const { actions, diagnostics } = readSkillActions(skill);
  const actionMode = getCodeSkillActionMode();
  const actionResults: CodeSkillActionResult[] = [];
  const completedByName = new Map<string, string>();

  for (const request of parsedPlan.requests) {
    if (request.resourceType === "action" && actionMode !== "csv") {
      const action = actions.find((candidate) => candidate.name === request.actionName);
      if (!action) {
        const failed = createFailedActionResult(
          request,
          "skill-action",
          `未授权或不存在的 skill action: ${request.actionName}`,
        );
        actionResults.push(failed);
        continue;
      }
      try {
        const result = await runAction(skill, action, request.query || query);
        actionResults.push(result);
        if (result.status === "completed") {
          completedByName.set(request.name, result.stdout);
          completedByName.set(action.name, result.stdout);
        }
      } catch (error) {
        actionResults.push(
          createFailedActionResult(
            request,
            action.command,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
      continue;
    }

    if (request.resourceType === "action" && actionMode === "csv") {
      diagnostics.push(
        codeSkillDiagnosticsSchema.parse({
          level: "warning",
          source: skill.location,
          message: `默认 csv 模式跳过 Python action ${request.actionName || request.name}；如需启用请设置 UML_CODE_SKILL_ACTION_MODE=python 或 auto。`,
        }),
      );
      continue;
    }

    try {
      const relativePath = csvPathForRequest(request);
      const stdout = readCsvContext(
        skill,
        relativePath,
        request.query || query,
        request.resourceType === "domain" && request.domain === "chart" ? 6000 : 8000,
        request.maxResults,
      );
      const result = createCsvActionResult(
        request.name,
        request.reason,
        relativePath,
        request.resourceType === "design-system" ? "markdown" : "json",
        stdout,
      );
      actionResults.push(result);
      if (result.status === "completed") {
        completedByName.set(request.name, result.stdout);
        completedByName.set(relativePath, result.stdout);
      }
    } catch (error) {
      actionResults.push(
        createFailedActionResult(
          request,
          "node-csv-resolver",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  for (const result of actionResults) {
    if (result.status === "failed") {
      diagnostics.push(
        codeSkillDiagnosticsSchema.parse({
          level: "warning",
          source: skill.location,
          message: `skill action ${result.name} 执行失败：${result.errorMessage ?? result.stderr}`,
        }),
      );
    }
  }

  if (actionMode === "auto" && actionResults.some((result) => result.status === "failed" && result.command !== "node-csv-resolver")) {
    diagnostics.push(
      codeSkillDiagnosticsSchema.parse({
        level: "warning",
        source: skill.location,
        message: "Python action 执行失败；已保留 CSV 结果，代码生成继续。",
      }),
    );
  }

  const outputFor = (...names: string[]) =>
    names
      .map((name) => completedByName.get(name))
      .find((value): value is string => Boolean(value)) ?? "";

  const domainOutputs = parsedPlan.requests
    .filter((request) => request.resourceType === "domain" || request.resourceType === "csv")
    .map((request) => outputFor(request.name, request.csvPath))
    .filter(Boolean);

  return codeSkillContextSchema.parse({
    skillName: skill.name,
    alias: skill.alias,
    query,
    designSystem: outputFor("design-system", "data/design.csv"),
    stackGuidelines: outputFor("react-stack", "data/stacks/react.csv"),
    domainGuidelines: domainOutputs.join("\n\n"),
    actionResults,
    diagnostics,
  });
}

export function formatWebDesignSkillForPrompt(
  skill: LoadedWebDesignSkill,
  resourcePlan?: CodeSkillResourcePlan | null,
  skillContext?: CodeSkillContext | null,
) {
  const manifest = skill.fileManifest.map((file) => ({
    relativePath: file.relativePath,
    kind: file.kind,
    size: file.size,
  }));
  return [
    `<code_skill alias="${skill.alias}" name="${skill.name}" source="${skill.source}">`,
    skill.content.slice(0, MAX_SKILL_CONTENT_CHARS),
    "",
    `Base directory for this skill: ${skill.baseDir}`,
    "Relative paths in this skill, such as scripts/, data/, templates/, and references/, are relative to this base directory.",
    "",
    "<skill_files>",
    JSON.stringify(manifest, null, 2),
    "</skill_files>",
    "",
    "<skill_resource_plan>",
    JSON.stringify(resourcePlan ?? null, null, 2),
    "</skill_resource_plan>",
    "",
    "<skill_context>",
    JSON.stringify(skillContext ?? null, null, 2),
    "</skill_context>",
    "</code_skill>",
  ].join("\n");
}
