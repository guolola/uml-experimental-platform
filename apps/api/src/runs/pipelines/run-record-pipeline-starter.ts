// Starts the correct pipeline for an existing queued run record and owns shared failure handling.
import {
  failedRunEventSchema,
  stageProgressRunEventSchema,
  type CodeRunSnapshot,
  type DiagramKind,
  type ProviderSettings,
  type RunError,
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
import { projectDocumentWorkspaceId } from "../../documents/library/project-document-workspace.js";
import type { ProviderTaskType } from "../../provider-configs/provider-usage-tracker.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { isRunCancelled, isRunCancelledError } from "../records/run-cancellation.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import type { BillingService } from "../../billing/billing-service.js";
import {
  isPlatformProviderRunError,
  normalizeRunError,
} from "./shared/errors.js";
import { runFeasibilityStagePipeline } from "./feasibility-pipeline.js";

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

const REQUIREMENT_LLM_SUBTASK_LABELS: Record<string, string> = {
  function: "功能结构图",
  usecase: "用例模型",
  class: "类模型",
  activity: "总体业务流程",
  deployment: "部署需求模型",
  prototype: "原型界面关系",
  analysis: "需求分析模型",
};

const DESIGN_LLM_SUBTASK_LABELS: Record<string, string> = {
  architecture: "总体架构图",
  sequence: "用例实现设计",
  class: "设计类图",
  activity: "界面关系图",
  component: "组件（构件）关系",
  deployment: "部署设计",
  table: "数据库设计",
};

const KNOWN_LLM_DIAGRAM_KINDS = new Set([
  "function",
  "usecase",
  "class",
  "activity",
  "deployment",
  "prototype",
  "analysis",
  "architecture",
  "sequence",
  "component",
  "table",
]);

function deriveLlmSubtaskContext(input: StreamChatCompletionInput) {
  const prompt = String(input.messages.at(-1)?.content ?? "");
  const designMatch = prompt.match(/只生成以下设计图类型：\s*\n?([^\n]+)/);
  const requirementMatch = prompt.match(/只生成以下图类型：\s*\n?([^\n]+)/);
  const match = designMatch ?? requirementMatch;
  const selected = match?.[1]
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const isDesignSequencePrompt =
    prompt.includes("生成设计阶段用例实现设计") ||
    prompt.includes("生成设计阶段顺序图结构化模型");
  const diagramKind =
    selected?.length === 1 && KNOWN_LLM_DIAGRAM_KINDS.has(selected[0]!)
      ? selected[0]!
      : isDesignSequencePrompt
        ? "sequence"
        : null;
  if (!diagramKind) return {};
  const labels =
    designMatch || isDesignSequencePrompt
      ? DESIGN_LLM_SUBTASK_LABELS
      : REQUIREMENT_LLM_SUBTASK_LABELS;
  return {
    diagramKind: diagramKind as DiagramKind,
    subtaskId: diagramKind,
    subtaskLabel: labels[diagramKind] ?? diagramKind,
  };
}

function taskTypeForRecord(record: RunRecord): ProviderTaskType {
  const snapshot = record.snapshot;
  if ("selectedArtifacts" in snapshot) return "feasibility_analysis";
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
    coverageMatrix: snapshot.coverageMatrix,
    traceabilityMatrix: snapshot.traceabilityMatrix,
    rules: [],
    requirementModels: [],
    requirementModelTraceability: [],
    requirementPlantUml: [],
    requirementSvgArtifacts: [],
    designModels: [],
    designModelTraceability: [],
    designPlantUml: [],
    designSvgArtifacts: [],
    feasibilityImplementationPlan: snapshot.feasibilityImplementationPlan,
    feasibilityInputs: snapshot.feasibilityInputs,
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
            : "模型调用完成，正在解析结果";
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
                ? "running"
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
  if (isRunCancelledError(error) || isRunCancelled(record)) return null;
  const runError = normalizeRunError(error);
  record.snapshot.status = "failed";
  record.snapshot.error = runError;
  if ("files" in record.snapshot) {
    addCodeDiagnostic(
      record.snapshot as CodeRunSnapshot,
      record.snapshot.currentStage ?? "write_code_files",
      runError.message,
    );
  }
  emitEvent(
    record,
    failedRunEventSchema.parse({
      type: "failed",
      stage: record.snapshot.currentStage ?? undefined,
      error: runError,
    }),
  );
  return runError;
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
  billingEntitlements?: Pick<
    BillingService,
    "confirmRunUsage" | "releaseRunUsage" | "compensateRunUsage"
  >;
  addCodeDiagnostic: (
    snapshot: CodeRunSnapshot,
    stage: RunStage,
    message: string,
  ) => void;
}) {
  void runRunRecordPipeline({
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
  });
}

export function startFeasibilityRecordPipeline({
  record,
  providerSettings,
  providerConfigId,
  llmTransport,
  llmScheduler,
  renderClient,
  billingEntitlements,
}: {
  record: RunRecord;
  providerSettings: ProviderSettings;
  providerConfigId: string | null;
  llmTransport: LlmTransport;
  llmScheduler?: LlmScheduler;
  renderClient: RenderClient;
  billingEntitlements?: Pick<
    BillingService,
    "confirmRunUsage" | "releaseRunUsage" | "compensateRunUsage"
  >;
}) {
  const scheduledTransport = createRunLlmTransport({
    record,
    providerSettings,
    providerConfigId,
    taskType: "feasibility_analysis",
    llmTransport,
    llmScheduler,
  });
  const entitlementTransport = createEntitlementConfirmingTransport({
    record,
    transport: scheduledTransport,
    billingEntitlements,
  });
  void (async () => {
    let terminalError: RunError | null = null;
    try {
      await runFeasibilityStagePipeline(
        record,
        providerSettings,
        entitlementTransport,
        renderClient,
      );
    } catch (error) {
      terminalError = handleRunPipelineError(record, error, () => undefined);
    } finally {
      if (terminalError && isPlatformProviderRunError(terminalError)) {
        await billingEntitlements?.compensateRunUsage({
          runId: record.snapshot.runId,
          errorCode: terminalError.code,
          reason: terminalError.message,
        });
      } else {
        await billingEntitlements?.releaseRunUsage(record.snapshot.runId);
      }
    }
  })();
}

export async function runRunRecordPipeline({
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
  billingEntitlements?: Pick<
    BillingService,
    "confirmRunUsage" | "releaseRunUsage" | "compensateRunUsage"
  >;
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
    taskType === "feasibility_analysis"
      ? runFeasibilityStagePipeline(
          record,
          providerSettings,
          entitlementTransport,
          renderClient,
        )
      : taskType === "document_generation"
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

  let terminalError: RunError | null = null;
  try {
    await runPromise;
  } catch (error) {
    terminalError = handleRunPipelineError(record, error, addCodeDiagnostic);
  } finally {
    if (terminalError && isPlatformProviderRunError(terminalError)) {
      await billingEntitlements?.compensateRunUsage({
        runId: record.snapshot.runId,
        errorCode: terminalError.code,
        reason: terminalError.message,
      });
      return;
    }
    await billingEntitlements?.releaseRunUsage(record.snapshot.runId);
  }
}
