// Maps project run API summaries into the shared run history item contract.
import {
  createRunHistoryTitle,
  type RunHistoryItem,
  type RunHistorySnapshot,
} from "../../entities/run-history";

export type ProjectRunDetailResponse = {
  projectId?: string;
  run?: {
    runId?: string;
    model?: string | null;
    status?: string | null;
    stage?: string | null;
    runKind?: string | null;
    documentKind?: string | null;
    snapshotAvailable?: boolean | null;
    canRestore?: boolean | null;
    documentDownloadAvailable?: boolean | null;
    startedAt?: string | null;
    createdAt?: string | null;
    completedAt?: string | null;
    updatedAt?: string | null;
  };
  snapshot?: RunHistorySnapshot;
};

export type ProjectRunsResponse = {
  runs?: Array<{
    runId?: string;
    status?: string | null;
    stage?: string | null;
    runKind?: string | null;
    documentKind?: string | null;
    createdAt?: string | null;
    startedAt?: string | null;
    updatedAt?: string | null;
    completedAt?: string | null;
    model?: string | null;
    snapshotAvailable?: boolean | null;
    canRestore?: boolean | null;
    documentDownloadAvailable?: boolean | null;
  }>;
};

export function normalizeProjectHistoryResponse(payload: unknown): RunHistoryItem[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as {
    history?: RunHistoryItem[];
    items?: RunHistoryItem[];
    runs?: ProjectRunsResponse["runs"];
  };
  const persisted = record.history ?? record.items;
  if (persisted) {
    return persisted.filter((item): item is RunHistoryItem => {
      return (
        !!item &&
        typeof item.id === "string" &&
        typeof item.createdAt === "string" &&
        typeof item.title === "string" &&
        typeof item.providerModel === "string"
      );
    });
  }
  return (record.runs ?? [])
    .map((run) => projectRunSummaryToHistoryItem(run))
    .filter((item): item is RunHistoryItem => item !== null);
}

export function projectRunSummaryToHistoryItem(
  run:
    | NonNullable<ProjectRunsResponse["runs"]>[number]
    | ProjectRunDetailResponse["run"],
  snapshot?: RunHistorySnapshot | null,
): RunHistoryItem | null {
  const runId = run?.runId?.trim();
  if (!runId) return null;
  const createdAt =
    run.completedAt ??
    run.startedAt ??
    run.createdAt ??
    run.updatedAt ??
    new Date().toISOString();
  const title = snapshot
    ? createRunHistoryTitle(snapshot.requirementText)
    : projectRunStageTitle(run);
  return {
    id: runId,
    createdAt,
    title,
    snapshot: snapshot ?? null,
    providerModel: run.model ?? "默认模型",
    status: run.status ?? null,
    stageLabel: snapshot ? null : projectRunKindLabel(run),
    summary: snapshot ? null : projectRunSummary(run),
    canRestore: run.canRestore ?? Boolean(snapshot),
    snapshotAvailable: run.snapshotAvailable ?? Boolean(snapshot),
    documentDownloadAvailable: run.documentDownloadAvailable ?? false,
  };
}

function projectRunStageTitle(run: ProjectRunDetailResponse["run"]) {
  if (!run) return "运行历史";
  if (run.documentKind === "requirementsSpec") return "生成需求规格说明书";
  if (run.documentKind === "softwareDesignSpec") return "生成软件设计说明书";
  const stage = run.stage ?? "";
  if (stage === "render_svg") {
    return run.runKind === "design" ? "渲染设计图表" : "渲染需求图表";
  }
  if (stage.includes("generate_tests")) return "生成测试用例";
  if (stage.includes("sequence")) return "生成用例实现设计";
  if (stage.includes("design")) return "生成设计模型";
  if (stage.includes("code")) return "生成代码原型";
  if (stage.includes("document")) return "生成说明书";
  if (stage.includes("extract_rules")) return "抽取需求规则";
  if (stage.includes("generate_models")) return "生成需求模型";
  if (run.runKind === "design") return "设计模型生成";
  if (run.runKind === "code") return "代码原型生成";
  if (run.runKind === "document") return "说明书生成";
  return "需求模型生成";
}

function projectRunKindLabel(run: ProjectRunDetailResponse["run"]) {
  if (!run) return "运行阶段";
  if (run.runKind === "design") return "设计阶段";
  if (run.runKind === "code") return "代码原型";
  if (run.runKind === "document") return "说明书";
  return "需求阶段";
}

function projectRunSummary(run: ProjectRunDetailResponse["run"]) {
  const parts = [
    run?.stage ? `阶段 ${run.stage}` : null,
    run?.snapshotAvailable ? "快照可恢复" : null,
    run?.documentDownloadAvailable ? "文档可下载" : null,
  ].filter(Boolean);
  return parts.join(" · ") || "运行摘要";
}
