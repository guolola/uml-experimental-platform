// Owns run history data contracts, local persistence compaction, and snapshot summaries.
import type {
  CodeRunSnapshot,
  DesignRunSnapshot,
  DocumentKind,
  DocumentRunSnapshot,
  RunSnapshot,
} from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
} from "../diagram/model";
import { formatCodeDiagnosticSummary } from "../../shared/lib/code-diagnostics";

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
  runKind?: string | null;
  stage?: string | null;
  stageLabel?: string | null;
  summary?: string | null;
  sourceRunId?: string | null;
  sourceAction?: string | null;
  sourceRunStatus?: string | null;
  derivedRunIds?: string[] | null;
  latestAction?: string | null;
  latestActionRunId?: string | null;
  latestActionAt?: string | null;
  errorMessage?: string | null;
  documentKind?: DocumentKind | null;
  documentId?: string | null;
  documentFileName?: string | null;
  documentVersion?: number | null;
  documentStatus?: string | null;
  documentRestoreAvailable?: boolean | null;
  documentByteLength?: number | null;
  diagramErrorCount?: number | null;
  diagramErrorSummary?: RunHistoryDiagramErrorSummary[] | null;
  partialFailure?: boolean | null;
  missingArtifactCount?: number | null;
  missingArtifactSummary?: string[] | null;
  codeDiagnosticCount?: number | null;
  codeDiagnosticSummary?: string[] | null;
  codeQualityIssueCount?: number | null;
  canRestore?: boolean | null;
  snapshotAvailable?: boolean | null;
  documentDownloadAvailable?: boolean | null;
}

export interface RunHistoryDiagramErrorSummary {
  diagramId: string;
  stage?: string | null;
  message: string;
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

function baseDiagramId(diagramId: string) {
  return diagramId.split(":")[0] ?? diagramId;
}

function getRequirementDiagramLabel(diagramId: string) {
  const id = baseDiagramId(diagramId);
  return id in DIAGRAM_META
    ? DIAGRAM_META[id as keyof typeof DIAGRAM_META].label
    : diagramId;
}

function getDesignDiagramLabel(diagramId: string) {
  const id = baseDiagramId(diagramId);
  return id in DESIGN_DIAGRAM_META
    ? DESIGN_DIAGRAM_META[id as keyof typeof DESIGN_DIAGRAM_META].label
    : diagramId;
}

function summarizeDiagramError(error: RunHistoryDiagramErrorSummary) {
  const details = [error.stage, error.message].filter(Boolean).join("：");
  return details || error.message;
}

export function formatRunHistoryDiagramErrorSummary(
  errors: RunHistoryDiagramErrorSummary[] | null | undefined,
  options: { design?: boolean } = {},
) {
  if (!errors || errors.length === 0) return null;
  const labelFor = options.design ? getDesignDiagramLabel : getRequirementDiagramLabel;
  const preview = errors
    .slice(0, 2)
    .map((error) => `${labelFor(error.diagramId)}（${summarizeDiagramError(error)}）`)
    .join("、");
  const suffix = errors.length > 2 ? `等 ${errors.length} 张图` : `${errors.length} 张图`;
  return `图级失败 ${suffix}：${preview}`;
}

export function formatDocumentMissingArtifactSummary(
  missingArtifacts: string[] | null | undefined,
  totalCount?: number | null,
) {
  const normalized = (missingArtifacts ?? [])
    .map((artifact) => artifact.trim())
    .filter(Boolean);
  const count = totalCount ?? normalized.length;
  if (count <= 0 || normalized.length === 0) return null;
  const preview = normalized.slice(0, 2).join("、");
  const suffix =
    count > 2
      ? `等 ${count} 项`
      : `${count} 项`;
  return `缺失图 ${suffix}：${preview}`;
}

function readSnapshotDiagramErrorSummary(
  snapshot: RunHistorySnapshot,
): RunHistoryDiagramErrorSummary[] {
  if (!("diagramErrors" in snapshot)) return [];
  return Object.entries(snapshot.diagramErrors).flatMap(([diagramId, value]) => {
    const message = value?.error?.message;
    if (!message) return [];
    return [
      {
        diagramId,
        stage: value.stage,
        message,
      },
    ];
  });
}

export function getRunHistorySnapshotSummary(snapshot: RunHistorySnapshot) {
  if (isDocumentRunSnapshot(snapshot)) {
    return [
      `${snapshot.fileName ?? "说明书.docx"} · ${snapshot.byteLength} bytes`,
      formatDocumentMissingArtifactSummary(snapshot.missingArtifacts),
    ].filter(Boolean).join(" · ");
  }

  if (isCodeRunSnapshot(snapshot)) {
    if (snapshot.status === "failed" && snapshot.generationMode === "regenerate") {
      return "代码重新生成失败，已保留上一版代码";
    }
    return [
      `代码文件 ${Object.keys(snapshot.files).length} 个`,
      formatCodeDiagnosticSummary({
        diagnostics: snapshot.diagnostics,
        fileGenerationDiagnostics: snapshot.fileGenerationDiagnostics,
        qualityDiagnostics: snapshot.qualityDiagnostics,
      }),
    ].filter(Boolean).join(" · ");
  }

  if (isDesignRunSnapshot(snapshot)) {
    const labels = snapshot.selectedDiagrams
      .map((diagram) => DESIGN_DIAGRAM_META[diagram].label)
      .join("、");
    const diagramErrors = formatRunHistoryDiagramErrorSummary(
      readSnapshotDiagramErrorSummary(snapshot),
      { design: true },
    );
    return [labels || "设计模型", diagramErrors].filter(Boolean).join(" · ");
  }

  if (
    snapshot.status === "failed" &&
    snapshot.selectedDiagrams.length === 0
  ) {
    return [
      "需求规则抽取失败",
      snapshot.error?.message,
    ].filter(Boolean).join("：");
  }

  const requestedLabels = snapshot.requestedDiagrams
    ?.map((diagram) => DIAGRAM_META[diagram].label)
    .join("、");
  const labels = snapshot.selectedDiagrams
    .map((diagram) => DIAGRAM_META[diagram].label)
    .join("、");
  const dependencyLabels = snapshot.dependencyDiagrams
    ?.map((diagram) => DIAGRAM_META[diagram].label)
    .join("、");
  const targetSummary =
    requestedLabels && dependencyLabels
      ? `请求${requestedLabels}，自动补齐${dependencyLabels}`
      : labels;
  const diagramErrors = formatRunHistoryDiagramErrorSummary(
    readSnapshotDiagramErrorSummary(snapshot),
  );
  return [targetSummary || "仅规则", diagramErrors].filter(Boolean).join(" · ");
}
