// Registers run endpoints and delegates lifecycle work to pipelines and record stores.
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  codeRunSnapshotSchema,
  documentRunSnapshotSchema,
  designRunSnapshotSchema,
  evidenceReviewDecisionSchema,
  artifactReadyRunEventSchema,
  queuedRunEventSchema,
  runSnapshotSchema,
  repairRequirementRulesRequestSchema,
  repairRequirementRuleRequestSchema,
  startCodeRunRequestSchema,
  startCodeRunResponseSchema,
  startDesignRunRequestSchema,
  startDesignRunResponseSchema,
  startDocumentRunRequestSchema,
  startDocumentRunResponseSchema,
  startRunRequestSchema,
  startRunResponseSchema,
  type CodeRunSnapshot,
  type DocumentLibraryItem,
  type ProviderSettings,
  type RunStage,
  type StartCodeRunRequest,
  type StartDesignRunRequest,
  type StartDocumentRunRequest,
  type StartRunRequest,
} from "@uml-platform/contracts";
import type { LlmTransport } from "../../llm.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import type { LlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import { projectDocumentWorkspaceId } from "../../documents/library/project-document-workspace.js";
import {
  createEmptyCodeSnapshot,
  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptySnapshot,
} from "../../runs/records/snapshots.js";
import {
  emitEvent,
  refreshProjectRunRecordsIfAvailable,
  refreshRunRecordIfAvailable,
  type RunRecord,
  type RunRecordStore,
} from "../../runs/records/run-record-store.js";
import { cancelRunRecord } from "../../runs/records/run-actions.js";
import {
  projectRecordMatchesFilters,
  queryValue,
  summarizeRunRecord,
} from "../../runs/records/run-record-summaries.js";
import { registerRunEventsRoute } from "../../runs/records/run-events.js";
import {
  buildAndStoreEvidencePackage,
  evidenceArtifactStage,
  rejectBlockedEvidencePackage,
  storeEvidenceReviewDecision,
} from "../../runs/evidence/run-evidence-gates.js";
import { assertRequirementBaselineAllowsDownstream } from "../../runs/baselines/requirement-baseline.js";
import { stageProgressValue } from "../../runs/pipelines/shared/pipeline-events.js";
import {
  handleRunPipelineError,
  startRunRecordPipeline,
} from "../../runs/pipelines/run-record-pipeline-starter.js";
import {
  checkGenerationUsageLimit,
  checkProviderUsageLimit,
  recordGenerationUsage,
  recordProviderUsage,
  rememberProviderSettings,
  resolveProviderConfigIdForRun,
  resolveProviderSettingsForRun,
} from "../../runs/providers/run-provider-gates.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type {
  ProviderTaskType,
  ProviderRateLimitPolicy,
  ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import { resolveProviderRateLimitPolicy } from "../../provider-configs/provider-usage-tracker.js";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import type { BillingService } from "../../billing/billing-service.js";
import { reserveBillingRunUsage } from "../../runs/billing/run-billing-gates.js";
import { RUN_ROUTE_CONFIG } from "./run-route-config.js";
import {
  resolveCodeRunInput,
  resolveDesignRunInput,
  resolveDocumentRunInput,
  resolveRequirementRunInput,
  type LoadProjectWorkspaceForRun,
} from "./run-input-resolution.js";
import {
  applyBatchRequirementRepairSuggestions,
  applyRequirementRepairSuggestion,
  buildRequirementRuleRepairMessages,
  buildRequirementRulesRepairMessages,
} from "../../runs/repairs/requirement-rule-repair.js";
import { collectTextResult } from "../../runs/pipelines/shared/structured-output.js";
import {
  getRepairRequirementRuleResponseFormat,
  getRepairRequirementRulesResponseFormat,
} from "../../adapters/llm/response-formats/index.js";
import {
  canReadProjectRuns,
  canReadRunRecord,
  defaultRunAccessGuard,
  metadataForStartedRun,
  resolveProjectRunPermission,
  runAccessDeniedMessage,
  type RunAccessGuard,
} from "./run-access.js";
import { createProjectRunAction } from "../../runs/actions/project-run-actions.js";
import {
  completeOfflineDemoCodeRun,
  completeOfflineDemoDesignRun,
  completeOfflineDemoRequirementRun,
  createOfflineDemoDocumentInput,
  createOfflineDemoRequirementRuleRepair,
  createOfflineDemoRequirementRulesRepair,
  isOfflineDemoProject,
  offlineDemoLlmTransport,
  offlineDemoProviderSettings,
} from "../../runs/demo/offline-demo-runs.js";
import {
  attachProjectWorkspaceSync,
  type ProjectWorkspaceSync,
} from "./project-workspace-sync.js";
import {
  flushRunStoreIfAvailable,
  type RunQueue,
} from "../../runs/queue/run-queue.js";

export type { RunAccessContext, RunAccessGuard } from "./run-access.js";

function isActiveRunRecord(record: RunRecord) {
  return (
    !record.terminal &&
    (record.snapshot.status === "running" || record.snapshot.status === "queued")
  );
}

function documentWorkspaceIdForRun(record: RunRecord) {
  const projectId = record.metadata?.projectId;
  return projectId ? projectDocumentWorkspaceId(projectId) : null;
}

async function currentDocumentForRun(
  record: RunRecord,
  documentLibrary: DocumentLibrary,
): Promise<DocumentLibraryItem | null> {
  if (!("documentKind" in record.snapshot)) return null;
  const workspaceId = documentWorkspaceIdForRun(record);
  if (!workspaceId || !record.snapshot.documentId) return null;
  if (typeof documentLibrary.getDocument !== "function") return null;
  return documentLibrary.getDocument(workspaceId, record.snapshot.documentId, {
    includeDeleted: true,
  });
}

async function summarizeRunRecordWithCurrentDocument(
  record: RunRecord,
  documentLibrary: DocumentLibrary,
) {
  const summary = summarizeRunRecord(record);
  const document = await currentDocumentForRun(record, documentLibrary);
  if (!document) return summary;
  return {
    ...summary,
    documentDownloadAvailable:
      summary.documentDownloadAvailable && document.status === "active",
    documentId: document.id,
    documentFileName: document.fileName,
    documentVersion: document.version,
    documentStatus: document.status,
    documentRestoreAvailable: document.status === "deleted",
    documentByteLength: document.byteLength,
  };
}

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

export function registerRunRoutes({
  app,
  runs,
  documentLibrary,
  llmTransport,
  renderClient,
  pngRenderClient,
  defaultSseAllowOrigin,
  runStagePipeline,
  runDesignStagePipeline,
  runCodeStagePipeline,
  runDocumentStagePipeline,
  addCodeDiagnostic,
  runAccessGuard = defaultRunAccessGuard,
  providerConfigs,
  resolveProjectDefaultProviderConfig,
  resolveProjectName,
  providerUsageTracker,
  generationUsage,
  billingEntitlements,
  providerRateLimitPolicy = resolveProviderRateLimitPolicy(),
  llmScheduler,
  loadProjectWorkspace,
  syncProjectWorkspace,
  runQueue,
}: {
  app: FastifyInstance;
  runs: RunRecordStore;
  documentLibrary: DocumentLibrary;
  llmTransport: LlmTransport;
  renderClient: RenderClient;
  pngRenderClient: PngRenderClient;
  defaultSseAllowOrigin: string;
  runStagePipeline: RequirementPipeline;
  runDesignStagePipeline: DesignPipeline;
  runCodeStagePipeline: CodePipeline;
  runDocumentStagePipeline: DocumentPipeline;
  addCodeDiagnostic: (
    snapshot: CodeRunSnapshot,
    stage: RunStage,
    message: string,
  ) => void;
  runAccessGuard?: RunAccessGuard;
  providerConfigs?: ProviderConfigStore;
  resolveProjectDefaultProviderConfig?: (projectId: string) => Promise<string | null>;
  resolveProjectName?: (projectId: string) => Promise<string | null | undefined>;
  providerUsageTracker?: ProviderUsageTracker;
  generationUsage?: GenerationUsageService;
  billingEntitlements?: Pick<
    BillingService,
    "reserveRunUsage" | "confirmRunUsage" | "releaseRunUsage" | "compensateRunUsage"
  >;
  providerRateLimitPolicy?: ProviderRateLimitPolicy;
  llmScheduler?: LlmScheduler;
  loadProjectWorkspace?: LoadProjectWorkspaceForRun;
  syncProjectWorkspace?: ProjectWorkspaceSync;
  runQueue?: RunQueue;
}) {
  const sideEffectRecords = new WeakSet<RunRecord>();
  const attachRunSideEffects = (record: RunRecord) => {
    if (sideEffectRecords.has(record)) return;
    sideEffectRecords.add(record);
    attachProjectWorkspaceSync(record, syncProjectWorkspace);
    runQueue?.attachEventPublisher(record);
  };

  const startRecordPipeline = async ({
    record,
    providerSettings,
    providerConfigId,
    documentInput,
  }: {
    record: RunRecord;
    providerSettings: ProviderSettings;
    providerConfigId: string | null;
    documentInput?: StartDocumentRunRequest;
  }) => {
    attachRunSideEffects(record);
    if (runQueue?.enabled) {
      await flushRunStoreIfAvailable(runs);
      await runQueue.enqueueRun({ record, documentInput });
      return;
    }
    startRunRecordPipeline({
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
  };

  const isOfflineDemoRun = async (projectId: string | null | undefined) => {
    if (!projectId) return false;
    if (isOfflineDemoProject(projectId)) return true;
    if (!resolveProjectName) return false;
    return isOfflineDemoProject(projectId, await resolveProjectName(projectId));
  };

  const handleOfflineDemoError = (record: RunRecord, error: unknown) => {
    handleRunPipelineError(record, error, addCodeDiagnostic);
  };

  const rejectBlockedRequirementBaseline = (
    reply: FastifyReply,
    baseline: StartDesignRunRequest["requirementBaseline"] | StartCodeRunRequest["requirementBaseline"] | StartDocumentRunRequest["requirementBaseline"],
  ) => {
    if (!baseline) return null;
    try {
      assertRequirementBaselineAllowsDownstream(baseline);
      return null;
    } catch (error) {
      reply.code(409);
      return {
        message:
          error instanceof Error
            ? error.message
            : "RequirementBaseline blocked downstream generation",
      };
    }
  };

  app.post("/api/runs/requirement-rule-repair", async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const input = repairRequirementRuleRequestSchema.parse(request.body);
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      return createOfflineDemoRequirementRuleRepair(input);
    }
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      resolveProjectDefaultProviderConfig,
      request,
      reply,
    });
    if (!providerSettings) {
      return {
        message: "Runs must use an admin-managed provider config with an allowed model.",
      };
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
      metadata,
      resolveProjectDefaultProviderConfig,
    });
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "requirements_to_uml",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;

    let rawOutput = "";
    try {
      rawOutput = await collectTextResult(
        llmTransport,
        providerSettings,
        buildRequirementRuleRepairMessages(input),
        () => undefined,
        getRepairRequirementRuleResponseFormat(providerSettings.model),
      );
      const result = applyRequirementRepairSuggestion(input, rawOutput);
      await recordProviderUsage({
        usageTracker: providerUsageTracker,
        providerConfigId,
        metadata,
        request,
        taskType: "requirements_to_uml",
      });
      return result;
    } catch (error) {
      reply.code(422);
      return {
        message:
          error instanceof Error
            ? `智能修复失败：${error.message}`
            : "智能修复失败：模型返回内容无法解析",
        rawOutput,
      };
    }
  });

  app.post("/api/runs/requirement-rule-repairs", async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const input = repairRequirementRulesRequestSchema.parse(request.body);
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      return createOfflineDemoRequirementRulesRepair(input);
    }
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      resolveProjectDefaultProviderConfig,
      request,
      reply,
    });
    if (!providerSettings) {
      return {
        message:
          "Runs must use an admin-managed provider config with an allowed model.",
      };
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
      metadata,
      resolveProjectDefaultProviderConfig,
    });
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "requirements_to_uml",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;

    let rawOutput = "";
    try {
      rawOutput = await collectTextResult(
        llmTransport,
        providerSettings,
        buildRequirementRulesRepairMessages(input),
        () => undefined,
        getRepairRequirementRulesResponseFormat(providerSettings.model),
      );
      const result = applyBatchRequirementRepairSuggestions(input, rawOutput);
      await recordProviderUsage({
        usageTracker: providerUsageTracker,
        providerConfigId,
        metadata,
        request,
        taskType: "requirements_to_uml",
      });
      return result;
    } catch (error) {
      reply.code(422);
      return {
        message:
          error instanceof Error
            ? `批量智能修复失败：${error.message}`
            : "批量智能修复失败：模型返回内容无法解析",
        rawOutput,
      };
    }
  });

  app.post(RUN_ROUTE_CONFIG.requirements.startPath, async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const resolvedInput = await resolveRequirementRunInput(
      request.body,
      metadata,
      loadProjectWorkspace,
    );
    if (!resolvedInput.ok) {
      reply.code(resolvedInput.statusCode);
      return resolvedInput.body;
    }
    const input = resolvedInput.input;
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      const runId = randomUUID();
      const record: RunRecord = {
        snapshot: createEmptySnapshot(
          runId,
          input.requirementText,
          input.selectedDiagrams,
          input.rules,
          {
            models: input.contextModels,
            requirementModelTraceability: input.contextRequirementModelTraceability,
            analysisTargetUseCaseIds: input.analysisTargetUseCaseIds,
            requestedDiagrams: input.requestedDiagrams,
            dependencyDiagrams: input.dependencyDiagrams,
          },
        ),
        events: [],
        listeners: new Set(),
        terminal: false,
        metadata,
      };
      runs.set(runId, record);
      attachRunSideEffects(record);
      emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
      void completeOfflineDemoRequirementRun(record, input).catch((error) =>
        handleOfflineDemoError(record, error),
      );
      reply.code(202);
      return startRunResponseSchema.parse({ runId });
    }
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      resolveProjectDefaultProviderConfig,
      request,
      reply,
    });
    if (!providerSettings) {
      return {
        message: "Runs must use an admin-managed provider config with an allowed model.",
      };
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
      metadata,
      resolveProjectDefaultProviderConfig,
    });
    const generationLimitCheck = await checkGenerationUsageLimit({
      generationUsage,
      runAccessGuard,
      request,
      reply,
    });
    if (generationLimitCheck !== true) return generationLimitCheck;
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "requirements_to_uml",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;
    const runId = randomUUID();
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements,
      metadata,
      runId,
      taskType: "requirements_to_uml",
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "requirements_to_uml",
    });
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard,
      request,
      taskType: "requirements_to_uml",
      providerConfigId,
    });
    const record: RunRecord = {
      snapshot: createEmptySnapshot(
        runId,
        input.requirementText,
        input.selectedDiagrams,
        input.rules,
        {
          models: input.contextModels,
          requirementModelTraceability: input.contextRequirementModelTraceability,
          analysisTargetUseCaseIds: input.analysisTargetUseCaseIds,
          requestedDiagrams: input.requestedDiagrams,
          dependencyDiagrams: input.dependencyDiagrams,
        },
      ),
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata,
    };
    rememberProviderSettings(record, input.providerSettings, {
      providerConfigId,
      model: providerSettings.model,
    });
    runs.set(runId, record);
    attachRunSideEffects(record);

    // Routes create queued records; pipelines advance them to running/completed/failed.
    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    await startRecordPipeline({
      record,
      providerSettings,
      providerConfigId,
    });

    reply.code(202);
    return startRunResponseSchema.parse({ runId });
  });

  app.post(RUN_ROUTE_CONFIG.design.startPath, async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const resolvedInput = await resolveDesignRunInput(
      request.body,
      metadata,
      loadProjectWorkspace,
    );
    if (!resolvedInput.ok) {
      reply.code(resolvedInput.statusCode);
      return resolvedInput.body;
    }
    const input = resolvedInput.input;
    const blockedBaseline = rejectBlockedRequirementBaseline(
      reply,
      input.requirementBaseline,
    );
    if (blockedBaseline) return blockedBaseline;
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      const runId = randomUUID();
      const record: RunRecord = {
        snapshot: createEmptyDesignSnapshot(runId, input),
        events: [],
        listeners: new Set(),
        terminal: false,
        metadata,
      };
      runs.set(runId, record);
      attachRunSideEffects(record);
      emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
      void completeOfflineDemoDesignRun(record, input).catch((error) =>
        handleOfflineDemoError(record, error),
      );
      reply.code(202);
      return startDesignRunResponseSchema.parse({ runId });
    }
    const blockedEvidence = rejectBlockedEvidencePackage(
      reply,
      input.evidencePackage,
    );
    if (blockedEvidence) return blockedEvidence;
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      resolveProjectDefaultProviderConfig,
      request,
      reply,
    });
    if (!providerSettings) {
      return {
        message: "Runs must use an admin-managed provider config with an allowed model.",
      };
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
      metadata,
      resolveProjectDefaultProviderConfig,
    });
    const generationLimitCheck = await checkGenerationUsageLimit({
      generationUsage,
      runAccessGuard,
      request,
      reply,
    });
    if (generationLimitCheck !== true) return generationLimitCheck;
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "design_modeling",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;
    const runId = randomUUID();
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements,
      metadata,
      runId,
      taskType: "design_modeling",
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "design_modeling",
    });
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard,
      request,
      taskType: "design_modeling",
      providerConfigId,
    });
    const record: RunRecord = {
      snapshot: createEmptyDesignSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata,
    };
    rememberProviderSettings(record, input.providerSettings, {
      providerConfigId,
      model: providerSettings.model,
    });
    runs.set(runId, record);
    attachRunSideEffects(record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    await startRecordPipeline({
      record,
      providerSettings,
      providerConfigId,
    });

    reply.code(202);
    return startDesignRunResponseSchema.parse({ runId });
  });

  app.post(RUN_ROUTE_CONFIG.code.startPath, async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const resolvedInput = await resolveCodeRunInput(
      request.body,
      metadata,
      loadProjectWorkspace,
    );
    if (!resolvedInput.ok) {
      reply.code(resolvedInput.statusCode);
      return resolvedInput.body;
    }
    const input = resolvedInput.input;
    const blockedBaseline = rejectBlockedRequirementBaseline(
      reply,
      input.requirementBaseline,
    );
    if (blockedBaseline) return blockedBaseline;
    if (await isOfflineDemoRun(input.projectId ?? metadata?.projectId)) {
      const runId = randomUUID();
      const record: RunRecord = {
        snapshot: createEmptyCodeSnapshot(runId, input),
        events: [],
        listeners: new Set(),
        terminal: false,
        metadata,
      };
      runs.set(runId, record);
      attachRunSideEffects(record);
      emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
      void completeOfflineDemoCodeRun(record, input).catch((error) =>
        handleOfflineDemoError(record, error),
      );
      reply.code(202);
      return startCodeRunResponseSchema.parse({ runId });
    }
    const blockedEvidence = rejectBlockedEvidencePackage(
      reply,
      input.evidencePackage,
    );
    if (blockedEvidence) return blockedEvidence;
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      resolveProjectDefaultProviderConfig,
      request,
      reply,
    });
    if (!providerSettings) {
      return {
        message: "Runs must use an admin-managed provider config with an allowed model.",
      };
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
      metadata,
      resolveProjectDefaultProviderConfig,
    });
    const generationLimitCheck = await checkGenerationUsageLimit({
      generationUsage,
      runAccessGuard,
      request,
      reply,
    });
    if (generationLimitCheck !== true) return generationLimitCheck;
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "code_generation",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;
    const runId = randomUUID();
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements,
      metadata,
      runId,
      taskType: "code_generation",
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "code_generation",
    });
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard,
      request,
      taskType: "code_generation",
      providerConfigId,
    });
    const record: RunRecord = {
      snapshot: createEmptyCodeSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata,
    };
    rememberProviderSettings(record, input.providerSettings, {
      providerConfigId,
      model: providerSettings.model,
    });
    runs.set(runId, record);
    attachRunSideEffects(record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    await startRecordPipeline({
      record,
      providerSettings,
      providerConfigId,
    });

    reply.code(202);
    return startCodeRunResponseSchema.parse({ runId });
  });

  app.post(RUN_ROUTE_CONFIG.document.startPath, async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "manage_documents",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    if (!metadata?.projectId) {
      reply.code(401);
      return { error: { message: "请先登录并进入项目" } };
    }
    const resolvedInput = await resolveDocumentRunInput(
      request.body,
      metadata,
      loadProjectWorkspace,
    );
    if (!resolvedInput.ok) {
      reply.code(resolvedInput.statusCode);
      return resolvedInput.body;
    }
    const input = resolvedInput.input;
    const blockedBaseline = rejectBlockedRequirementBaseline(
      reply,
      input.requirementBaseline,
    );
    if (blockedBaseline) return blockedBaseline;
    if (await isOfflineDemoRun(input.projectId ?? metadata.projectId)) {
      const demoInput = createOfflineDemoDocumentInput(input);
      const runId = randomUUID();
      const record: RunRecord = {
        snapshot: createEmptyDocumentSnapshot(runId, demoInput),
        events: [],
        listeners: new Set(),
        terminal: false,
        metadata,
      };
      runs.set(runId, record);
      attachRunSideEffects(record);
      emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
      // Demo documents use the normal DOCX assembly boundary with AI text disabled.
      void runDocumentStagePipeline(
        record,
        demoInput,
        documentLibrary,
        projectDocumentWorkspaceId(metadata.projectId),
        offlineDemoProviderSettings,
        offlineDemoLlmTransport,
        pngRenderClient,
      ).catch((error) => {
        handleRunPipelineError(record, error, addCodeDiagnostic);
      });
      reply.code(202);
      return startDocumentRunResponseSchema.parse({ runId });
    }
    const blockedEvidence = rejectBlockedEvidencePackage(
      reply,
      input.evidencePackage,
    );
    if (blockedEvidence) return blockedEvidence;
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: input.providerSettings,
      metadata,
      providerConfigs,
      resolveProjectDefaultProviderConfig,
      request,
      reply,
    });
    if (!providerSettings) {
      return {
        message: "Runs must use an admin-managed provider config with an allowed model.",
      };
    }
    const providerConfigId = await resolveProviderConfigIdForRun({
      providerSettings: input.providerSettings,
      metadata,
      resolveProjectDefaultProviderConfig,
    });
    const generationLimitCheck = await checkGenerationUsageLimit({
      generationUsage,
      runAccessGuard,
      request,
      reply,
    });
    if (generationLimitCheck !== true) return generationLimitCheck;
    const limitCheck = await checkProviderUsageLimit({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "document_generation",
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType: "document_generation",
    });
    if (input.documentKind === "requirementsSpec" && input.requirementModels.length === 0) {
      reply.code(400);
      return { message: "请先在需求页生成需求模型，再导出需求规格说明书" };
    }
    if (input.documentKind === "softwareDesignSpec" && input.designModels.length === 0) {
      reply.code(400);
      return { message: "请先在设计页生成设计模型，再导出软件设计说明书" };
    }
    const runId = randomUUID();
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements,
      metadata,
      runId,
      taskType: "document_generation",
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard,
      request,
      taskType: "document_generation",
      providerConfigId,
    });

    const record: RunRecord = {
      snapshot: createEmptyDocumentSnapshot(runId, input),
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata,
    };
    rememberProviderSettings(record, input.providerSettings, {
      providerConfigId,
      model: providerSettings.model,
    });
    runs.set(runId, record);
    attachRunSideEffects(record);

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    await startRecordPipeline({
      record,
      providerSettings,
      providerConfigId,
      documentInput: input,
    });

    reply.code(202);
    return startDocumentRunResponseSchema.parse({ runId });
  });

  app.get("/api/projects/:projectId/runs", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await canReadProjectRuns(request, reply, projectId, runAccessGuard))) {
      return runAccessDeniedMessage(reply);
    }

    await refreshProjectRunRecordsIfAvailable(runs, projectId);
    const projectRunRecords = Array.from(runs.values())
      .filter((record) => record.metadata?.projectId === projectId)
      .filter((record) => projectRecordMatchesFilters(record, request.query))
      .sort((left, right) =>
        (right.metadata?.createdAt ?? "").localeCompare(
          left.metadata?.createdAt ?? "",
        ),
      );
    const projectRuns = await Promise.all(
      projectRunRecords.map((record) =>
        summarizeRunRecordWithCurrentDocument(record, documentLibrary),
      ),
    );

    return {
      generatedAt: new Date().toISOString(),
      projectId,
      runs: projectRuns,
    };
  });

  app.get("/api/projects/:projectId/runs/:runId", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    if (!(await canReadProjectRuns(request, reply, projectId, runAccessGuard))) {
      return runAccessDeniedMessage(reply);
    }

    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }

    const includeEvents = queryValue(request.query, "includeEvents") === "true";
    return {
      projectId,
      run: await summarizeRunRecordWithCurrentDocument(record, documentLibrary),
      snapshot: record.snapshot,
      ...(includeEvents ? { events: record.events } : {}),
    };
  });

  app.delete("/api/projects/:projectId/runs", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);

    await refreshProjectRunRecordsIfAvailable(runs, projectId);
    const projectRecords = Array.from(runs.entries()).filter(
      ([, record]) => record.metadata?.projectId === projectId,
    );
    const activeRunIds = projectRecords
      .filter(([, record]) => isActiveRunRecord(record))
      .map(([runId]) => runId);
    if (activeRunIds.length > 0) {
      reply.code(409);
      return {
        message: "Active runs cannot be deleted",
        activeRunIds,
      };
    }

    const deletedRunIds = projectRecords.map(([runId]) => runId);
    for (const runId of deletedRunIds) {
      runs.delete(runId);
    }

    return {
      projectId,
      deletedRunIds,
    };
  });

  app.get("/api/projects/:projectId/runs/:runId/evidence", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    if (!(await canReadProjectRuns(request, reply, projectId, runAccessGuard))) {
      return runAccessDeniedMessage(reply);
    }

    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }

    return {
      projectId,
      evidencePackage: buildAndStoreEvidencePackage(record),
    };
  });

  app.post("/api/projects/:projectId/runs/:runId/review-decisions", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);

    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }

    const body = request.body as {
      reviewItemId?: unknown;
      decision?: unknown;
      reviewerId?: unknown;
      reviewerName?: unknown;
      comment?: unknown;
    };
    const decision = evidenceReviewDecisionSchema.parse({
      id: `DEC-${randomUUID()}`,
      reviewItemId: body.reviewItemId,
      decision: body.decision,
      reviewerId: typeof body.reviewerId === "string" ? body.reviewerId : access.userId,
      reviewerName: body.reviewerName,
      comment: body.comment,
      decidedAt: new Date().toISOString(),
    });
    const evidencePackage = storeEvidenceReviewDecision(record, decision);
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: evidenceArtifactStage(record),
        artifactKind: "evidencePackage",
        evidencePackage,
      }),
    );

    return { projectId, evidencePackage };
  });

  app.delete("/api/projects/:projectId/runs/:runId", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);

    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }
    if (isActiveRunRecord(record)) {
      reply.code(409);
      return { message: "Active runs cannot be deleted" };
    }

    runs.delete(runId);
    reply.code(204);
    return reply.send();
  });

  app.post("/api/projects/:projectId/runs/:runId/cancel", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);

    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }
    if (record.terminal) {
      reply.code(409);
      return { message: "Terminal runs cannot be cancelled again" };
    }

    llmScheduler?.cancelRun(runId);
    await runQueue?.cancelRun(runId);
    await billingEntitlements?.releaseRunUsage(runId);
    return cancelRunRecord(record, runId);
  });

  app.post("/api/projects/:projectId/runs/:runId/retry", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);
    await refreshRunRecordIfAvailable(runs, runId);
    return createProjectRunAction({
      request,
      reply,
      action: "retry",
      projectId,
      runId,
      actorUserId: access.userId,
      runs,
      runAccessGuard,
      providerConfigs,
      resolveProjectDefaultProviderConfig,
      providerUsageTracker,
      generationUsage,
      billingEntitlements,
      providerRateLimitPolicy,
      startRecordPipeline,
    });
  });

  app.post("/api/projects/:projectId/runs/:runId/rerun", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const access = await resolveProjectRunPermission(
      request,
      reply,
      projectId,
      "start_runs",
      runAccessGuard,
    );
    if (!access) return runAccessDeniedMessage(reply);
    await refreshRunRecordIfAvailable(runs, runId);
    return createProjectRunAction({
      request,
      reply,
      action: "rerun",
      projectId,
      runId,
      actorUserId: access.userId,
      runs,
      runAccessGuard,
      providerConfigs,
      resolveProjectDefaultProviderConfig,
      providerUsageTracker,
      generationUsage,
      billingEntitlements,
      providerRateLimitPolicy,
      startRecordPipeline,
    });
  });

  app.get(RUN_ROUTE_CONFIG.requirements.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return { message: RUN_ROUTE_CONFIG.requirements.notFoundMessage };
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"))) {
      return reply;
    }
    return runSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.design.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return { message: RUN_ROUTE_CONFIG.design.notFoundMessage };
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"))) {
      return reply;
    }
    return designRunSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.code.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return {
        message: RUN_ROUTE_CONFIG.code.lostSnapshotMessage,
      };
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"))) {
      return reply;
    }
    return codeRunSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.document.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return { message: RUN_ROUTE_CONFIG.document.notFoundMessage };
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"))) {
      return reply;
    }
    return documentRunSnapshotSchema.parse(record.snapshot);
  });

  app.get(RUN_ROUTE_CONFIG.document.downloadPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = await refreshRunRecordIfAvailable(runs, runId);
    if (!record) {
      reply.code(404);
      return { message: "Document file not found" };
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_documents"))) {
      return reply;
    }
    const snapshot = documentRunSnapshotSchema.parse(record.snapshot);
    if (snapshot.status !== "completed") {
      reply.code(409);
      return { message: "Document run has not completed successfully" };
    }
    const currentDocument = await currentDocumentForRun(record, documentLibrary);
    if (currentDocument?.status === "deleted") {
      reply.code(409);
      return { message: "Document has been deleted. Restore it before downloading." };
    }
    let documentBuffer = record.documentBuffer;
    if (!documentBuffer && record.metadata?.projectId && snapshot.documentId) {
      documentBuffer = await documentLibrary.getDocumentBuffer(
        projectDocumentWorkspaceId(record.metadata.projectId),
        snapshot.documentId,
      ) ?? undefined;
    }
    if (!documentBuffer) {
      reply.code(404);
      return { message: "Document file not found" };
    }
    reply.header(
      "Content-Type",
      snapshot.mimeType ??
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(currentDocument?.fileName ?? snapshot.fileName ?? "说明书.docx")}`,
    );
    return documentBuffer;
  });

  for (const route of [
    RUN_ROUTE_CONFIG.requirements,
    RUN_ROUTE_CONFIG.design,
    RUN_ROUTE_CONFIG.code,
    RUN_ROUTE_CONFIG.document,
  ]) {
    registerRunEventsRoute({
      app,
      runs,
      path: route.eventsPath,
      notFoundMessage: route.notFoundMessage,
      defaultAllowOrigin: defaultSseAllowOrigin,
      canReadRunRecord: (request, reply, record) =>
        canReadRunRecord(request, reply, record, runAccessGuard, "view_runs"),
    });
  }
}
