import type { RunSnapshot } from "@uml-platform/contracts";
import { DIAGRAM_META, type DiagramType } from "../../entities/diagram/model";

export const RUN_HISTORY_STORAGE_KEY = "uml-platform.run-history.v1";
export const RUN_HISTORY_LIMIT = 30;

export interface RunHistoryItem {
  id: string;
  createdAt: string;
  title: string;
  snapshot: RunSnapshot;
  providerModel: string;
  durationMs?: number;
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
        typeof candidate.providerModel === "string" &&
        !!candidate.snapshot
      );
    });
  } catch {
    return [];
  }
}

export function loadRunHistory(): RunHistoryItem[] {
  return safeParseHistory(localStorage.getItem(RUN_HISTORY_STORAGE_KEY));
}

export function persistRunHistory(items: RunHistoryItem[]) {
  localStorage.setItem(
    RUN_HISTORY_STORAGE_KEY,
    JSON.stringify(items.slice(0, RUN_HISTORY_LIMIT)),
  );
}

export function saveRunHistoryItem(
  snapshot: RunSnapshot,
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
  persistRunHistory(next);
  return item;
}

export function deleteRunHistoryItem(id: string) {
  const next = loadRunHistory().filter((item) => item.id !== id);
  persistRunHistory(next);
  return next;
}

export function clearRunHistoryItems() {
  persistRunHistory([]);
}

export function buildRunMarkdownReport(snapshot: RunSnapshot) {
  const lines: string[] = [];
  lines.push("# UML 实验平台 · 运行报告", "");
  lines.push(`- Run ID: \`${snapshot.runId}\``);
  lines.push(`- 状态: \`${snapshot.status}\``);
  lines.push(`- 当前阶段: \`${snapshot.currentStage ?? "none"}\``);
  if (snapshot.errorMessage) {
    lines.push(`- 全局错误: ${snapshot.errorMessage}`);
  }
  lines.push("");

  if (snapshot.requirementText.trim()) {
    lines.push("## 需求文本", "", snapshot.requirementText.trim(), "");
  }

  lines.push("## 需求规则", "");
  if (snapshot.rules.length === 0) {
    lines.push("暂无规则。", "");
  } else {
    for (const rule of snapshot.rules) {
      lines.push(`- \`${rule.id}\` **[${rule.category}]** ${rule.text}`);
    }
    lines.push("");
  }

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
      lines.push(`- 失败原因: ${error.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
