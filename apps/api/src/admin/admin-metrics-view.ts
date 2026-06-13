// Builds admin metrics read models from run records, provider usage, and document counts.
import type { DocumentLibrary } from "../documents/library/document-library.js";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { RunRecordStore } from "../runs/records/run-record-store.js";
import {
  artifactCountsForTask,
  averageDuration,
  buildGenerationBreakdown,
  isGenerationTaskType,
  isInWindow,
  percentage,
  shanghaiDateString,
  shanghaiDayWindow,
  taskTypeForSnapshot,
} from "../runs/records/admin-run-summaries.js";
import type { ProviderUsageTracker } from "../provider-configs/provider-usage-tracker.js";
import {
  listMetricDocuments,
  metric,
  modelUsageByTask,
} from "./admin-route-presenters.js";

type BuildAdminMetricsInput = {
  authStore: AuthStore;
  documentLibrary: DocumentLibrary;
  providerUsageTracker?: ProviderUsageTracker;
  queryDate?: unknown;
  runs: RunRecordStore;
};

type InvalidAdminMetricsDate = {
  ok: false;
  message: string;
};

type ValidAdminMetricsView = {
  ok: true;
  view: {
    generatedAt: string;
    metricWindow: {
      timeZone: "Asia/Shanghai";
      startAt: string;
      endAt: string;
    };
    metrics: ReturnType<typeof metric>[];
    totalGenerationBreakdown: ReturnType<typeof buildGenerationBreakdown>;
    generationBreakdown: ReturnType<typeof buildGenerationBreakdown>;
  };
};

export async function buildAdminMetricsView({
  authStore,
  documentLibrary,
  providerUsageTracker,
  queryDate,
  runs,
}: BuildAdminMetricsInput): Promise<InvalidAdminMetricsDate | ValidAdminMetricsView> {
  const now = new Date();
  const selectedDate = queryDate === undefined ? shanghaiDateString(now) : queryDate;
  if (typeof selectedDate !== "string") {
    return { ok: false, message: "date must use YYYY-MM-DD" };
  }

  const selectedWindow = shanghaiDayWindow(selectedDate, now);
  if (!selectedWindow) {
    return { ok: false, message: "date must be a valid non-future YYYY-MM-DD" };
  }

  const allTimeWindow = {
    startIso: "1970-01-01T00:00:00.000Z",
    endIso: now.toISOString(),
  };
  const records = Array.from(runs.values());
  const generationRecords = records.filter((record) =>
    isGenerationTaskType(taskTypeForSnapshot(record.snapshot)),
  );
  const selectedRecords = generationRecords.filter((record) =>
    isInWindow(record.metadata?.createdAt, selectedWindow),
  );
  const [users, projects, documents, selectedModelUsageByTask, allModelUsageByTask] =
    await Promise.all([
      authStore.listUsers(),
      authStore.listProjects(),
      listMetricDocuments(documentLibrary),
      modelUsageByTask(providerUsageTracker, selectedWindow),
      modelUsageByTask(providerUsageTracker, allTimeWindow),
    ]);
  const selectedDocuments = documents.filter((document) =>
    isInWindow(document.createdAt, selectedWindow),
  );
  const generationBreakdown = buildGenerationBreakdown(
    selectedRecords,
    selectedModelUsageByTask,
    selectedDocuments,
  );
  const totalGenerationBreakdown = buildGenerationBreakdown(
    generationRecords,
    allModelUsageByTask,
    documents,
  );
  const completed = generationRecords.filter(
    (record) => record.snapshot.status === "completed",
  ).length;
  const failed = generationRecords.filter((record) => record.snapshot.status === "failed").length;
  const duration = averageDuration(
    generationRecords.filter((record) => record.terminal || record.metadata?.completedAt),
  );
  const modelCallCount = Array.from(allModelUsageByTask.values()).reduce(
    (total, value) => total + value,
    0,
  );
  const documentGenerationCount = artifactCountsForTask(
    "document_generation",
    generationRecords.filter((record) =>
      taskTypeForSnapshot(record.snapshot) === "document_generation" &&
      record.snapshot.status === "completed",
    ),
    documents,
  ).reduce((total, item) => total + item.value, 0);

  return {
    ok: true,
    view: {
      generatedAt: now.toISOString(),
      metricWindow: {
        timeZone: "Asia/Shanghai",
        startAt: selectedWindow.startIso,
        endAt: selectedWindow.endIso,
      },
      metrics: [
        metric("用户数", String(users.length)),
        metric("项目数", String(projects.length)),
        metric("生成次数", String(generationRecords.length)),
        metric("成功率", percentage(completed, generationRecords.length)),
        metric("失败率", percentage(failed, generationRecords.length)),
        metric("平均耗时", duration.label),
        metric("模型调用量", String(modelCallCount)),
        metric("文档生成量", String(documentGenerationCount)),
      ],
      totalGenerationBreakdown,
      generationBreakdown,
    },
  };
}
