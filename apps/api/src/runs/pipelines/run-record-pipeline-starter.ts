// Starts the correct pipeline for an existing queued run record and owns shared failure handling.
import {
  failedRunEventSchema,
  stageProgressRunEventSchema,
  type CodeRunSnapshot,
  type DiagramKind,
  type ProviderSettings,
  type RunStage,
  type StartDocumentRunRequest,
} from "@uml-platform/contracts";
import type { LlmTransport, StreamChatCompletionInput } from "../../llm.js";
import {
  createScheduledLlmTransport,
  type LlmScheduler,
  type LlmScheduleStatus,
} from "../../adapters/llm/llm-scheduler.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { ProviderTaskType } from "../../provider-configs/provider-usage-tracker.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { isRunCancelled, isRunCancelledError } from "../records/run-cancellation.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import type { BillingService } from "../../billing/billing-service.js";

type RequirementPipeline = (
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) => Promise<void>;

type DesignPipeline = (
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) => Promise<void>;

type CodePipeline = (
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
) => Promise<void>;

type DocumentPipeline = (
  record: RunRecord,
  input: StartDocumentRunRequest,
  documentLibrary: DocumentLibrary,
  workspaceId: string,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  pngRenderClient: PngRenderClient,
) => Promise<void>;

const LLM_SUBTASK_LABELS: Record<string, string> = {
  usecase: "用例模型",
  class: "类模型",
  activity: "总体业务流程",
  deployment: "部署需求模型",
  prototype: "原型界面关系",
  analysis: "需求分析模型",
  sequence: "用例实现设计",
  table: "数据库设计",
};

const KNOWN_LLM_DIAGRAM_KINDS = new Set([
  "usecase",
  "class",
  "activity",
  "deployment",
  "prototype",
  "analysis",
  "sequence",
  "table",
]);

function deriveLlmSubtaskContext(input: StreamChatCompletionInput) {
  const prompt = String(input.messages.at(-1)?.content ?? "");
  const match =
    prompt.match(/只生成以下设计图类型：\s*\n?([^\n]+)/) ??
    prompt.match(/只生成以下图类型：\s*\n?([^\n]+)/);
  const selected = match?.[1]
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const diagramKind =
    selected?.length === 1 && KNOWN_LLM_DIAGRAM_KINDS.has(selected[0]!)
      ? selected[0]!
      : prompt.includes("生成设计阶段用例实现设计") ||
          prompt.includes("生成设计阶段顺序图结构化模型")
        ? "sequence"
        : null;
  if (!diagramKind) return {};
  return {
    diagramKind: diagramKind as DiagramKind,
    subtaskId: diagramKind,
    subtaskLabel: LLM_SUBTASK_LABELS[diagramKind] ?? diagramKind,
  };
}

function projectDocumentWorkspaceId(projectId: string) {
  return `project-${projectId}`;
}

function taskTypeForRecord(record: RunRecord): ProviderTaskType {
  const snapshot = record.snapshot;
  if ("documentKind" in snapshot) return "document_generation";
  if ("files" in snapshot) return "code_generation";
  if ("designModelTraceability" in snapshot) return "design_modeling";
  return "requirements_to_uml";
}

function documentInputFromSnapshot(record: RunRecord): StartDocumentRunRequest {
  const snapshot = record.snapshot;
  if (!("documentKind" in snapshot)) {
    throw new Error("Run record is not a document run");
  }
  return {
    projectId: record.metadata?.projectId,
    documentKind: snapshot.documentKind,
    requirementText: snapshot.requirementText,
    requirementBaseline: snapshot.requirementBaseline,
    evidencePackage: snapshot.evidencePackage,
    rules: [],
    requirementModels: [],
    requirementPlantUml: [],
    requirementSvgArtifacts: [],
    designModels: [],
    designModelTraceability: [],
    designPlantUml: [],
    designSvgArtifacts: [],
    useAiText: true,
  };
}

function createRunLlmTransport({
  record,
  providerSettings,
  providerConfigId,
  taskType,
  llmTransport,
  llmScheduler,
}: {
  record: RunRecord;
  providerSettings: ProviderSettings;
  providerConfigId: string | null;
  taskType: ProviderTaskType;
  llmTransport: LlmTransport;
  llmScheduler?: LlmScheduler;
}) {
  if (!llmScheduler) return llmTransport;
  const emitQueueStatus = (
    status: LlmScheduleStatus,
    context: {
      diagramKind?: string | null;
      subtaskId?: string | null;
      subtaskLabel?: string | null;
    },
  ) => {
    const stage = record.snapshot.currentStage ?? "generate_models";
    if (isRunCancelled(record)) return;
    const queueText =
      status.status === "queued"
        ? `模型调用排队中：前方 ${status.queueAhead ?? 0} 个模型调用`
        : status.status === "running"
          ? "模型调用开始执行"
          : status.status === "cancelled"
            ? "模型调用已取消"
            : "模型调用完成";
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message: queueText,
        subtaskStatus:
          status.status === "queued"
            ? "queued"
            : status.status === "running"
              ? "running"
              : status.status === "completed"
                ? "completed"
                : "failed",
        diagramKind: context.diagramKind,
        subtaskId: context.subtaskId,
        subtaskLabel: context.subtaskLabel,
        queuePosition: status.queuePosition,
        queueAhead: status.queueAhead,
        waitMs: status.waitMs,
        estimatedWaitMs: status.estimatedWaitMs,
        queueReason: status.queueReason,
      }),
    );
  };
  return createScheduledLlmTransport({
    transport: llmTransport,
    scheduler: llmScheduler,
    context: {
      runId: record.snapshot.runId,
      projectId: record.metadata?.projectId,
      userId: record.metadata?.userId,
      providerConfigId,
      model: providerSettings.model,
      taskType,
    },
    deriveContext: deriveLlmSubtaskContext,
    onStatus: emitQueueStatus,
  });
}

function createEntitlementConfirmingTransport({
  record,
  transport,
  billingEntitlements,
}: {
  record: RunRecord;
  transport: LlmTransport;
  billingEntitlements?: Pick<BillingService, "confirmRunUsage">;
}): LlmTransport {
  if (!billingEntitlements) return transport;
  let confirmation: Promise<unknown> | null = null;
  return {
    async *streamChatCompletion(input) {
      // Billing confirmation happens exactly once, at the first real LLM call.
      confirmation ??= billingEntitlements.confirmRunUsage(record.snapshot.runId);
      await confirmation;
      yield* transport.streamChatCompletion(input);
    },
  };
}

export function handleRunPipelineError(
  record: RunRecord,
  error: unknown,
  addCodeDiagnostic: (
    snapshot: CodeRunSnapshot,
    stage: RunStage,
    message: string,
  ) => void,
) {
  if (isRunCancelledError(error) || isRunCancelled(record)) return;
  record.snapshot.status = "failed";
  record.snapshot.errorMessage =
    error instanceof Error ? error.message : "Unknown run error";
  if ("files" in record.snapshot) {
    addCodeDiagnostic(
      record.snapshot as CodeRunSnapshot,
      record.snapshot.currentStage ?? "write_code_files",
      record.snapshot.errorMessage,
    );
  }
  emitEvent(
    record,
    failedRunEventSchema.parse({
      type: "failed",
      stage: record.snapshot.currentStage ?? undefined,
      message: record.snapshot.errorMessage,
    }),
  );
}

export function startRunRecordPipeline({
  record,
  providerSettings,
  providerConfigId,
  llmTransport,
  llmScheduler,
  renderClient,
  pngRenderClient,
  documentLibrary,
  runStagePipeline,
  runDesignStagePipeline,
  runCodeStagePipeline,
  runDocumentStagePipeline,
  addCodeDiagnostic,
  documentInput,
  billingEntitlements,
}: {
  record: RunRecord;
  providerSettings: ProviderSettings;
  providerConfigId: string | null;
  llmTransport: LlmTransport;
  llmScheduler?: LlmScheduler;
  renderClient: RenderClient;
  pngRenderClient: PngRenderClient;
  documentLibrary: DocumentLibrary;
  runStagePipeline: RequirementPipeline;
  runDesignStagePipeline: DesignPipeline;
  runCodeStagePipeline: CodePipeline;
  runDocumentStagePipeline: DocumentPipeline;
  documentInput?: StartDocumentRunRequest;
  billingEntitlements?: Pick<BillingService, "confirmRunUsage" | "releaseRunUsage">;
  addCodeDiagnostic: (
    snapshot: CodeRunSnapshot,
    stage: RunStage,
    message: string,
  ) => void;
}) {
  const taskType = taskTypeForRecord(record);
  const scheduledTransport = createRunLlmTransport({
    record,
    providerSettings,
    providerConfigId,
    taskType,
    llmTransport,
    llmScheduler,
  });

  const entitlementTransport = createEntitlementConfirmingTransport({
    record,
    transport: scheduledTransport,
    billingEntitlements,
  });

  const runPromise =
    taskType === "document_generation"
      ? runDocumentStagePipeline(
          record,
          documentInput ?? documentInputFromSnapshot(record),
          documentLibrary,
          projectDocumentWorkspaceId(record.metadata?.projectId ?? "default"),
          providerSettings,
          entitlementTransport,
          pngRenderClient,
        )
      : taskType === "code_generation"
        ? runCodeStagePipeline(record, providerSettings, entitlementTransport)
        : taskType === "design_modeling"
          ? runDesignStagePipeline(
              record,
              providerSettings,
              entitlementTransport,
              renderClient,
            )
          : runStagePipeline(record, providerSettings, entitlementTransport, renderClient);

  void runPromise
    .catch((error) => handleRunPipelineError(record, error, addCodeDiagnostic))
    .finally(() => {
      void billingEntitlements?.releaseRunUsage(record.snapshot.runId);
    });
}
