// Owns run history data contracts, local persistence compaction, and Markdown export helpers.
import type {
  CodeRunSnapshot,
  DesignRunSnapshot,
  DocumentRunSnapshot,
  RunSnapshot,
} from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  type DesignDiagramType,
  type DiagramType,
} from "../diagram/model";

export const RUN_HISTORY_STORAGE_KEY = "uml-platform.run-history.v1";
export const RUN_HISTORY_LIMIT = 12;

const TRACE_TEXT_PREVIEW_LIMIT = 2_000;
const PARSED_DATA_PREVIEW_LIMIT = 3_000;
const SKILL_OUTPUT_PREVIEW_LIMIT = 1_500;
const DIAGNOSTIC_TEXT_PREVIEW_LIMIT = 1_000;

export type RunHistorySnapshot =
  | RunSnapshot
  | DesignRunSnapshot
  | CodeRunSnapshot
  | DocumentRunSnapshot;

export interface RunHistoryItem {
  id: string;
  createdAt: string;
  title: string;
  snapshot?: RunHistorySnapshot | null;
  providerModel: string;
  durationMs?: number;
  status?: string | null;
  stageLabel?: string | null;
  summary?: string | null;
  canRestore?: boolean | null;
  snapshotAvailable?: boolean | null;
  documentDownloadAvailable?: boolean | null;
}

export class RunHistoryStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunHistoryStorageError";
  }
}

export function isCodeRunSnapshot(
  snapshot: RunHistorySnapshot,
): snapshot is CodeRunSnapshot {
  return "files" in snapshot;
}

export function isDesignRunSnapshot(
  snapshot: RunHistorySnapshot,
): snapshot is DesignRunSnapshot {
  return "requirementModels" in snapshot;
}

export function isDocumentRunSnapshot(
  snapshot: RunHistorySnapshot,
): snapshot is DocumentRunSnapshot {
  return "documentKind" in snapshot;
}

export function createRunHistoryTitle(requirementText: string) {
  const normalized = requirementText.trim().replace(/\s+/g, " ");
  if (!normalized) return "未命名运行";
  return normalized.length > 32 ? `${normalized.slice(0, 32)}...` : normalized;
}

function safeParseHistory(value: string | null): RunHistoryItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RunHistoryItem => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<RunHistoryItem>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.createdAt === "string" &&
        typeof candidate.title === "string" &&
        typeof candidate.providerModel === "string"
      );
    });
  } catch {
    return [];
  }
}

export function loadRunHistory(): RunHistoryItem[] {
  return safeParseHistory(localStorage.getItem(RUN_HISTORY_STORAGE_KEY));
}

function truncateText(value: string | undefined, limit: number) {
  if (!value || value.length <= limit) return value;
  return `${value.slice(0, limit)}\n\n[已截断，原始长度 ${value.length} 字符]`;
}

function stringifyPreview(value: unknown, limit: number) {
  if (value === undefined) return undefined;
  const text =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return String(value);
          }
        })();
  return {
    preview: truncateText(text, limit) ?? "",
    truncated: text.length > limit,
  };
}

function compactTraceEntries<T extends Record<string, unknown>>(entries: T[]) {
  return entries.map((entry) => ({
    ...entry,
    rawOutput: truncateText(entry.rawOutput as string | undefined, TRACE_TEXT_PREVIEW_LIMIT),
    plantUmlSource: truncateText(
      entry.plantUmlSource as string | undefined,
      TRACE_TEXT_PREVIEW_LIMIT,
    ),
    errorMessage: truncateText(
      entry.errorMessage as string | undefined,
      DIAGNOSTIC_TEXT_PREVIEW_LIMIT,
    ),
    parsedData:
      entry.parsedData === undefined
        ? undefined
        : stringifyPreview(entry.parsedData, PARSED_DATA_PREVIEW_LIMIT),
  }));
}

function compactCodeSnapshot(snapshot: CodeRunSnapshot): CodeRunSnapshot {
  return {
    ...snapshot,
    loadedCodeSkill: null,
    uiMockup: snapshot.uiMockup
      ? {
          ...snapshot.uiMockup,
          prompt:
            truncateText(snapshot.uiMockup.prompt, DIAGNOSTIC_TEXT_PREVIEW_LIMIT) ??
            snapshot.uiMockup.prompt,
          imageDataUrl: null,
        }
      : null,
    skillResourcePreviews: snapshot.skillResourcePreviews
      ? {
          ...snapshot.skillResourcePreviews,
          previews: snapshot.skillResourcePreviews.previews.map((preview) => ({
            ...preview,
            sampleRows: [],
            errorMessage: truncateText(
              preview.errorMessage,
              DIAGNOSTIC_TEXT_PREVIEW_LIMIT,
            ),
          })),
        }
      : null,
    codeSkillContext: snapshot.codeSkillContext
      ? {
          ...snapshot.codeSkillContext,
          designSystem: truncateText(
            snapshot.codeSkillContext.designSystem,
            SKILL_OUTPUT_PREVIEW_LIMIT,
          ) ?? "",
          stackGuidelines: truncateText(
            snapshot.codeSkillContext.stackGuidelines,
            SKILL_OUTPUT_PREVIEW_LIMIT,
          ) ?? "",
          domainGuidelines: truncateText(
            snapshot.codeSkillContext.domainGuidelines,
            SKILL_OUTPUT_PREVIEW_LIMIT,
          ) ?? "",
          actionResults: snapshot.codeSkillContext.actionResults.map((result) => ({
            ...result,
            stdout: truncateText(result.stdout, SKILL_OUTPUT_PREVIEW_LIMIT) ?? "",
            stderr:
              truncateText(result.stderr, DIAGNOSTIC_TEXT_PREVIEW_LIMIT) ?? "",
            errorMessage: truncateText(
              result.errorMessage,
              DIAGNOSTIC_TEXT_PREVIEW_LIMIT,
            ),
          })),
        }
      : null,
    codeImplementationBrief: null,
    codeFileOperationManifest: null,
    fileGenerationDiagnostics: snapshot.fileGenerationDiagnostics.map((diagnostic) => ({
      ...diagnostic,
      message: truncateText(diagnostic.message, DIAGNOSTIC_TEXT_PREVIEW_LIMIT) ?? "",
    })),
    codeTrace: compactTraceEntries(snapshot.codeTrace) as CodeRunSnapshot["codeTrace"],
    diagnostics: snapshot.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      message: truncateText(diagnostic.message, DIAGNOSTIC_TEXT_PREVIEW_LIMIT) ?? "",
    })),
  };
}

export function compactRunHistorySnapshot(
  snapshot: RunHistorySnapshot,
): RunHistorySnapshot {
  if (isCodeRunSnapshot(snapshot)) {
    return compactCodeSnapshot(snapshot);
  }
  if (isDesignRunSnapshot(snapshot)) {
    return {
      ...snapshot,
      designTrace: compactTraceEntries(
        snapshot.designTrace,
      ) as DesignRunSnapshot["designTrace"],
    };
  }
  if (!isDocumentRunSnapshot(snapshot)) {
    return {
      ...snapshot,
      requirementTrace: compactTraceEntries(
        snapshot.requirementTrace,
      ) as RunSnapshot["requirementTrace"],
    };
  }
  return snapshot;
}

function compactRunHistoryItem(item: RunHistoryItem): RunHistoryItem {
  if (!item.snapshot) return item;
  return {
    ...item,
    snapshot: compactRunHistorySnapshot(item.snapshot),
  };
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export function persistRunHistory(items: RunHistoryItem[]) {
  let next = items.slice(0, RUN_HISTORY_LIMIT).map(compactRunHistoryItem);

  while (next.length > 0) {
    try {
      localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        throw error;
      }
      if (next.length === 1) {
        throw new RunHistoryStorageError(
          "历史快照过大，已跳过保存，不影响当前结果。",
        );
      }
      next = next.slice(0, -1);
    }
  }

  localStorage.setItem(RUN_HISTORY_STORAGE_KEY, "[]");
  return [];
}

export function saveRunHistoryItem(
  snapshot: RunHistorySnapshot,
  meta: {
    providerModel: string;
    durationMs?: number;
    createdAt?: string;
  },
) {
  const item: RunHistoryItem = {
    id: snapshot.runId,
    createdAt: meta.createdAt ?? new Date().toISOString(),
    title: createRunHistoryTitle(snapshot.requirementText),
    snapshot,
    providerModel: meta.providerModel,
    durationMs: meta.durationMs,
  };
  const existing = loadRunHistory().filter((entry) => entry.id !== item.id);
  const next = [item, ...existing].slice(0, RUN_HISTORY_LIMIT);
  const saved = persistRunHistory(next);
  return saved[0] ?? compactRunHistoryItem(item);
}

export function deleteRunHistoryItem(id: string) {
  const next = loadRunHistory().filter((item) => item.id !== id);
  return persistRunHistory(next);
}

export function clearRunHistoryItems() {
  persistRunHistory([]);
}

export function getRunHistorySnapshotLabel(snapshot: RunHistorySnapshot) {
  if (isDocumentRunSnapshot(snapshot)) return "说明书";
  if (isCodeRunSnapshot(snapshot)) return "代码原型";
  if (isDesignRunSnapshot(snapshot)) return "设计阶段";
  return "需求阶段";
}

export function getRunHistorySnapshotSummary(snapshot: RunHistorySnapshot) {
  if (isDocumentRunSnapshot(snapshot)) {
    return `${snapshot.fileName ?? "说明书.docx"} · ${snapshot.byteLength} bytes`;
  }

  if (isCodeRunSnapshot(snapshot)) {
    return `代码文件 ${Object.keys(snapshot.files).length} 个`;
  }

  if (isDesignRunSnapshot(snapshot)) {
    const labels = snapshot.selectedDiagrams
      .map((diagram) => DESIGN_DIAGRAM_META[diagram].label)
      .join("、");
    return labels || "设计模型";
  }

  const labels = snapshot.selectedDiagrams
    .map((diagram) => DIAGRAM_META[diagram].label)
    .join("、");
  return labels || "仅规则";
}

function appendRulesSection(
  lines: string[],
  snapshot: RunSnapshot | DesignRunSnapshot | CodeRunSnapshot,
) {
  lines.push("## 需求规则", "");
  if (snapshot.rules.length === 0) {
    lines.push("暂无规则。", "");
    return;
  }

  for (const rule of snapshot.rules) {
    lines.push(`- \`${rule.id}\` **[${rule.category}]** ${rule.text}`);
  }
  lines.push("");
}

function appendRequirementsDiagrams(lines: string[], snapshot: RunSnapshot) {
  lines.push("## UML 图", "");
  const diagramKinds = new Set<DiagramType>([
    ...snapshot.selectedDiagrams,
    ...snapshot.models.map((model) => model.diagramKind),
    ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
    ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ...(Object.keys(snapshot.diagramErrors) as DiagramType[]),
  ]);

  if (diagramKinds.size === 0) {
    lines.push("暂无图产物。", "");
  }

  for (const diagramKind of diagramKinds) {
    const model = snapshot.models.find((item) => item.diagramKind === diagramKind);
    const svg = snapshot.svgArtifacts.find((item) => item.diagramKind === diagramKind);
    const error = snapshot.diagramErrors[diagramKind];
    lines.push(`### ${DIAGRAM_META[diagramKind].label}`, "");
    if (model) {
      lines.push(`- 标题: ${model.title}`);
      lines.push(`- 摘要: ${model.summary}`);
    }
    lines.push(`- SVG: ${svg ? "成功" : "未生成"}`);
    if (error) {
      lines.push(`- 失败阶段: \`${error.stage}\``);
      lines.push(`- 失败原因: ${error.error.message}`);
    }
    lines.push("");
  }
}

function appendDesignDiagrams(lines: string[], snapshot: DesignRunSnapshot) {
  lines.push("## 设计图", "");
  const diagramKinds = new Set<DesignDiagramType>([
    ...snapshot.selectedDiagrams,
    ...snapshot.models.map((model) => model.diagramKind),
    ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
    ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ...(Object.keys(snapshot.diagramErrors).map((key) =>
      key.startsWith("sequence:") ? "sequence" : key,
    ) as DesignDiagramType[]),
  ]);

  if (diagramKinds.size === 0) {
    lines.push("暂无设计图产物。", "");
  }

  for (const diagramKind of diagramKinds) {
    const model = snapshot.models.find((item) => item.diagramKind === diagramKind);
    const svg = snapshot.svgArtifacts.find((item) => item.diagramKind === diagramKind);
    const error = snapshot.diagramErrors[diagramKind];
    lines.push(`### ${DESIGN_DIAGRAM_META[diagramKind].label}`, "");
    if (model) {
      lines.push(`- 标题: ${model.title}`);
      lines.push(`- 摘要: ${model.summary}`);
    }
    lines.push(`- SVG: ${svg ? "成功" : "未生成"}`);
    if (error) {
      lines.push(`- 失败阶段: \`${error.stage}\``);
      lines.push(`- 失败原因: ${error.error.message}`);
    }
    lines.push("");
  }

  const sequenceErrors = Object.entries(snapshot.diagramErrors).filter(([key]) =>
    key.startsWith("sequence:"),
  );
  for (const [modelId, error] of sequenceErrors) {
    const model = snapshot.models.find((item) => item.modelId === modelId);
    lines.push(`### ${model?.title ?? modelId}`, "");
    lines.push("- SVG: 未生成");
    lines.push(`- 失败阶段: \`${error.stage}\``);
    lines.push(`- 失败原因: ${error.error.message}`);
    lines.push("");
  }
}

function appendCodePrototype(lines: string[], snapshot: CodeRunSnapshot) {
  lines.push("## 代码原型", "");
  if (snapshot.appBlueprint) {
    lines.push(`- 应用蓝图: ${snapshot.appBlueprint.appName}`);
    lines.push(`- 业务领域: ${snapshot.appBlueprint.domain}`);
    lines.push(`- 页面数: ${snapshot.appBlueprint.pages.length}`);
  }
  lines.push(`- 入口文件: \`${snapshot.entryFile ?? "未设置"}\``);
  lines.push(`- 文件数: ${Object.keys(snapshot.files).length}`);
  const latestQuality = snapshot.qualityDiagnostics.at(-1);
  if (latestQuality) {
    lines.push(
      `- 质量检查: ${latestQuality.passed ? "通过" : "需修复"}（页面 ${latestQuality.metrics.pageFileCount} 个，组件 ${latestQuality.metrics.componentFileCount} 个）`,
    );
  }
  if (snapshot.uiMockup) {
    lines.push(`- 界面设计图: ${snapshot.uiMockup.status === "completed" ? "已生成" : "生成失败"}`);
    lines.push(`- 图片模型: \`${snapshot.uiMockup.model}\``);
    if (snapshot.uiMockup.status === "failed" && snapshot.uiMockup.errorMessage) {
      lines.push(`- 设计图失败原因: ${snapshot.uiMockup.errorMessage}`);
    }
  }
  if (snapshot.uiReferenceSpec) {
    lines.push(
      `- 设计图解析: ${snapshot.uiReferenceSpec.fallbackReason ? `降级（${snapshot.uiReferenceSpec.fallbackReason}）` : "已完成"}`,
    );
  }
  if (snapshot.uiFidelityReport) {
    lines.push(
      `- 设计图还原检查: ${snapshot.uiFidelityReport.passed ? "基本贴合" : "需要修复"} - ${snapshot.uiFidelityReport.summary}`,
    );
    if (snapshot.uiFidelityReport.missing.length > 0) {
      lines.push(`- 未还原特征: ${snapshot.uiFidelityReport.missing.join("；")}`);
    }
  }
  lines.push(
    `- 依赖: ${
      Object.keys(snapshot.dependencies).length > 0
        ? Object.entries(snapshot.dependencies)
            .map(([name, version]) => `\`${name}@${version}\``)
            .join("、")
        : "默认 React/Sandpack 依赖"
    }`,
  );
  lines.push("");

  for (const path of Object.keys(snapshot.files).sort()) {
    lines.push(`### ${path}`, "", "```tsx", snapshot.files[path], "```", "");
  }
}

function appendDocumentSpec(lines: string[], snapshot: DocumentRunSnapshot) {
  lines.push("## 说明书", "");
  lines.push(
    `- 类型: ${
      snapshot.documentKind === "requirementsSpec"
        ? "需求规格说明书"
        : "软件设计说明书"
    }`,
  );
  lines.push(`- 文件: ${snapshot.fileName ?? "未生成"}`);
  lines.push(`- 大小: ${snapshot.byteLength} bytes`);
  if (snapshot.missingArtifacts.length > 0) {
    lines.push(`- 缺失图: ${snapshot.missingArtifacts.join("、")}`);
  }
  lines.push("");

  for (const section of snapshot.sections) {
    lines.push(`${"#".repeat(section.level + 1)} ${section.title}`, "");
    for (const paragraph of section.body) {
      lines.push(paragraph, "");
    }
    if (section.diagramKind) {
      lines.push(`- 图示: ${section.diagramKind}`, "");
    }
  }
}

export function buildRunMarkdownReport(snapshot: RunHistorySnapshot) {
  const lines: string[] = [];
  lines.push("# 软件工程实训平台 · 运行报告", "");
  lines.push(`- Run ID: \`${snapshot.runId}\``);
  lines.push(`- 阶段: ${getRunHistorySnapshotLabel(snapshot)}`);
  lines.push(`- 状态: \`${snapshot.status}\``);
  lines.push(`- 当前阶段: \`${snapshot.currentStage ?? "none"}\``);
  if (snapshot.error) {
    lines.push(`- 全局错误: ${snapshot.error.message}`);
  }
  lines.push("");

  if (snapshot.requirementText.trim()) {
    lines.push("## 需求文本", "", snapshot.requirementText.trim(), "");
  }

  if (!isDocumentRunSnapshot(snapshot)) {
    appendRulesSection(lines, snapshot);
  }

  if (isDocumentRunSnapshot(snapshot)) {
    appendDocumentSpec(lines, snapshot);
  } else if (isCodeRunSnapshot(snapshot)) {
    appendCodePrototype(lines, snapshot);
  } else if (isDesignRunSnapshot(snapshot)) {
    appendDesignDiagrams(lines, snapshot);
  } else {
    appendRequirementsDiagrams(lines, snapshot);
  }

  return lines.join("\n");
}
