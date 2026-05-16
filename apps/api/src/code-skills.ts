import { spawn } from "node:child_process";
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
  codeSkillSelectionSchema,
  loadedCodeSkillSchema,
  type CodeBusinessLogic,
  type CodeSkillAction,
  type CodeSkillActionResult,
  type CodeSkillContext,
  type CodeSkillDiagnostics,
  type CodeSkillFile,
  type CodeSkillSelection,
  type LoadedCodeSkill,
} from "@uml-platform/contracts";

const WEB_DESIGN_SKILL_ALIAS = "@web-design";
const WEB_DESIGN_SKILL_NAME = "ui-ux-pro-max";
const MAX_SKILL_CONTENT_CHARS = 32000;
const MAX_MANIFEST_FILES = 80;
const ACTION_CONFIG_FILE = "skill.actions.json";

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

function skillSearchRoots() {
  const here = dirname(fileURLToPath(import.meta.url));
  const roots = [
    resolve(here, "code-skills"),
    resolve(here, "../src/code-skills"),
    ...projectRootCandidates().flatMap((root) => [
      resolve(root, "apps/api/src/code-skills"),
      resolve(root, "skills/code"),
    ]),
  ];
  return uniquePaths(roots).filter((path) => {
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
    throw new Error("@web-design skill missing: apps/api/src/code-skills/ui-ux-pro-max/SKILL.md");
  }
  if (result.skill.name !== WEB_DESIGN_SKILL_NAME) {
    result.diagnostics.push(
      codeSkillDiagnosticsSchema.parse({
        level: "warning",
        source: result.skill.location,
        message: `@web-design skill name 是 ${result.skill.name}，期望 ${WEB_DESIGN_SKILL_NAME}。`,
      }),
    );
  }
  return result;
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
    reason: "加载 ui-ux-pro-max，作为代码页前端设计执行 skill；alias @web-design 保持兼容。",
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

export async function resolveCodeSkillContext(
  skill: LoadedCodeSkill,
  businessLogic: CodeBusinessLogic,
): Promise<CodeSkillContext> {
  const query = buildSkillQuery(businessLogic);
  const { actions, diagnostics } = readSkillActions(skill);
  const actionResults: CodeSkillActionResult[] = [];
  const shouldRunChart = hasChartNeed(businessLogic);

  for (const action of actions) {
    if (action.when === "hasCharts" && !shouldRunChart) {
      const now = new Date().toISOString();
      actionResults.push(
        codeSkillActionResultSchema.parse({
          name: action.name,
          description: action.description,
          command: action.command,
          args: resolveActionArgs(action, query),
          outputFormat: action.outputFormat,
          status: "skipped",
          stdout: "",
          stderr: "",
          exitCode: null,
          errorMessage: "业务逻辑未体现图表/统计/趋势需求，跳过该 action。",
          startedAt: now,
          completedAt: now,
        }),
      );
      continue;
    }
    try {
      actionResults.push(await runAction(skill, action, query));
    } catch (error) {
      const now = new Date().toISOString();
      actionResults.push(
        codeSkillActionResultSchema.parse({
          name: action.name,
          description: action.description,
          command: action.command,
          args: resolveActionArgs(action, query),
          outputFormat: action.outputFormat,
          status: "failed",
          stdout: "",
          stderr: "",
          exitCode: null,
          errorMessage: error instanceof Error ? error.message : String(error),
          startedAt: now,
          completedAt: now,
        }),
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

  const outputFor = (name: string) =>
    actionResults.find((result) => result.name === name && result.status === "completed")?.stdout ?? "";

  return codeSkillContextSchema.parse({
    skillName: skill.name,
    alias: skill.alias,
    query,
    designSystem: outputFor("design-system"),
    stackGuidelines: outputFor("react-stack"),
    domainGuidelines: [outputFor("ux-guidelines"), outputFor("chart-guidelines")]
      .filter(Boolean)
      .join("\n\n"),
    actionResults,
    diagnostics,
  });
}

export function formatWebDesignSkillForPrompt(
  skill: LoadedWebDesignSkill,
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
    "<skill_context>",
    JSON.stringify(skillContext ?? null, null, 2),
    "</skill_context>",
    "</code_skill>",
  ].join("\n");
}
