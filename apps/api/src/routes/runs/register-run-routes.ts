// Registers run endpoints and delegates lifecycle work to pipelines and record stores.
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  codeRunSnapshotSchema,
  documentRunSnapshotSchema,
  designRecordBelongsToDiagramKinds,
  designRunSnapshotSchema,
  designTraceabilityTouchesDiagramKinds,
  evidenceReviewDecisionSchema,
  artifactReadyRunEventSchema,
  queuedRunEventSchema,
  runSnapshotSchema,
  repairRequirementRulesRequestSchema,
  repairRequirementRulesResponseSchema,
  repairRequirementRuleRequestSchema,
  repairRequirementRuleResponseSchema,
  requirementRuleBatchRepairSuggestionSchema,
  requirementRuleRepairSuggestionSchema,
  startCodeRunCommandSchema,
  startCodeRunRequestSchema,
  startCodeRunResponseSchema,
  startDesignRunCommandSchema,
  startDesignRunRequestSchema,
  startDesignRunResponseSchema,
  startDocumentRunCommandSchema,
  startDocumentRunRequestSchema,
  startDocumentRunResponseSchema,
  startRunCommandSchema,
  startRunRequestSchema,
  startRunResponseSchema,
  type CodeRunSnapshot,
  type DesignDiagramKind,
  type EvidencePackage,
  type AtomicRequirement,
  type AtomicRequirementField,
  type ProjectPermission,
  type ProviderSettings,
  type ProviderSettingsInput,
  type RepairRequirementRuleRequest,
  type RepairRequirementRuleResponse,
  type RepairRequirementRulesRequest,
  type RequirementRuleRepairSuggestion,
  type RequirementFieldProvenance,
  type RequirementQualityIssue,
  type RunAction,
  type RunStage,
  type StartCodeRunCommand,
  type StartCodeRunRequest,
  type StartDesignRunCommand,
  type StartDesignRunRequest,
  type StartDocumentRunCommand,
  type StartDocumentRunRequest,
  type StartRunCommand,
  type StartRunRequest,
} from "@uml-platform/contracts";
import type { ChatMessage, LlmTransport } from "../../llm.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import type { LlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import {
  createEmptyCodeSnapshot,
  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptySnapshot,
} from "../../runs/records/snapshots.js";
import {
  emitEvent,
  type RunRecord,
  type RunRecordMetadata,
  type RunRecordStore,
} from "../../runs/records/run-record-store.js";
import {
  cancelRunRecord,
  createQueuedRunFromSource,
  isRetryableRun,
} from "../../runs/records/run-actions.js";
import { registerRunEventsRoute } from "../../runs/records/run-events.js";
import {
  assertEvidencePackageAllowsDownstream,
  buildEvidencePackage,
} from "../../runs/evidence/evidence-package.js";
import { stageProgressValue } from "../../runs/pipelines/shared/pipeline-events.js";
import { startRunRecordPipeline } from "../../runs/pipelines/run-record-pipeline-starter.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type {
  ProviderTaskType,
  ProviderRateLimitPolicy,
  ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import { resolveProviderRateLimitPolicy } from "../../provider-configs/provider-usage-tracker.js";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import type { BillingService } from "../../billing/billing-service.js";
import { RUN_ROUTE_CONFIG } from "./run-route-config.js";
import { parseJson } from "../../normalizers/json/parse-json.js";
import { rebuildRequirementBaselineQualityReport } from "../../runs/baselines/requirement-baseline.js";
import { collectTextResult } from "../../runs/pipelines/shared/structured-output.js";
import {
  getRepairRequirementRuleResponseFormat,
  getRepairRequirementRulesResponseFormat,
} from "../../adapters/llm/response-formats/index.js";

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

export interface RunAccessContext {
  userId?: string;
  projectId?: string;
  email?: string | null;
}

export interface RunAccessGuard {
  resolveRunAccess(request: FastifyRequest): Promise<RunAccessContext>;
  canAccessProject(input: {
    request: FastifyRequest;
    userId: string;
    projectId: string;
    permission: ProjectPermission;
    access: RunAccessContext;
  }): Promise<boolean>;
}

function stringHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const defaultRunAccessGuard: RunAccessGuard = {
  async resolveRunAccess(request) {
    return {
      userId: stringHeader(request, "x-uml-user-id"),
      projectId: stringHeader(request, "x-uml-project-id"),
    };
  },
  async canAccessProject({ projectId, access }) {
    // Placeholder project guard until the real auth/project membership layer lands.
    return access.projectId === projectId;
  },
};

function projectIdFromRequestBody(body: unknown) {
  if (!body || typeof body !== "object" || !("projectId" in body)) {
    return undefined;
  }
  const projectId = (body as { projectId?: unknown }).projectId;
  return typeof projectId === "string" && projectId.trim()
    ? projectId.trim()
    : undefined;
}

function organizationIdFromRequest(request: FastifyRequest) {
  return stringHeader(request, "x-uml-organization-id") ?? null;
}

function ipAddressFromRequest(request: FastifyRequest) {
  return stringHeader(request, "x-forwarded-for")?.split(",")[0]?.trim() ??
    request.ip ??
    null;
}

function runAccessDeniedMessage(reply: FastifyReply) {
  return {
    message:
      reply.statusCode === 401
        ? "Authentication required"
        : "Project access denied",
  };
}

async function canReadProjectRuns(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  runAccessGuard: RunAccessGuard,
) {
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) {
    reply.code(401);
    return false;
  }
  const allowed = await runAccessGuard.canAccessProject({
    request,
    userId: access.userId,
    projectId,
    permission: "view_runs",
    access,
  });
  if (!allowed) {
    reply.code(403);
    return false;
  }
  return true;
}

async function resolveProjectRunPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  permission: ProjectPermission,
  runAccessGuard: RunAccessGuard,
) {
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) {
    reply.code(401);
    return null;
  }
  const allowed = await runAccessGuard.canAccessProject({
    request,
    userId: access.userId,
    projectId,
    permission,
    access,
  });
  if (!allowed) {
    reply.code(403);
    return null;
  }
  return access;
}

async function metadataForStartedRun(
  request: FastifyRequest,
  reply: FastifyReply,
  runAccessGuard: RunAccessGuard,
  permission: ProjectPermission,
): Promise<RunRecordMetadata | null | undefined> {
  const access = await runAccessGuard.resolveRunAccess(request);
  const projectId = projectIdFromRequestBody(request.body) ?? access.projectId;
  const userId = access.userId;

  if (projectId) {
    if (!userId) {
      reply.code(401);
      return null;
    }
    if (
      !(await runAccessGuard.canAccessProject({
        request,
        userId,
        projectId,
        permission,
        access,
      }))
    ) {
      reply.code(403);
      return null;
    }
  }

  if (!userId && !projectId) {
    reply.code(401);
    return null;
  }
  return {
    userId,
    projectId,
    createdAt: new Date().toISOString(),
  };
}

function isManagedProviderSettings(
  providerSettings: ProviderSettingsInput | undefined,
): providerSettings is Extract<ProviderSettingsInput, { providerConfigId: string }> {
  return Boolean(providerSettings && "providerConfigId" in providerSettings);
}

async function resolveProviderSettingsForRun({
  providerSettings,
  metadata,
  providerConfigs,
  resolveProjectDefaultProviderConfig,
  request,
  reply,
}: {
  providerSettings: ProviderSettingsInput | undefined;
  metadata: RunRecordMetadata | undefined;
  providerConfigs?: ProviderConfigStore;
  resolveProjectDefaultProviderConfig?: (projectId: string) => Promise<string | null>;
  request: FastifyRequest;
  reply: FastifyReply;
}): Promise<ProviderSettings | null> {
  const isProjectRun = Boolean(metadata?.projectId);

  if (!providerSettings) {
    if (!isProjectRun || !metadata?.projectId || !providerConfigs || !resolveProjectDefaultProviderConfig) {
      reply.code(400);
      return null;
    }
    const providerConfigId = await resolveProjectDefaultProviderConfig(metadata.projectId);
    if (!providerConfigId) {
      reply.code(400);
      return null;
    }
    const providerConfig = await providerConfigs.get(providerConfigId);
    if (!providerConfig) {
      reply.code(400);
      return null;
    }
    providerSettings = {
      providerConfigId,
      model: providerConfig.defaultModel,
    };
  }

  if (isManagedProviderSettings(providerSettings)) {
    if (!isProjectRun) {
      reply.code(401);
      return null;
    }
    if (!providerConfigs) {
      reply.code(500);
      return null;
    }
    const providerConfig = await providerConfigs.get(providerSettings.providerConfigId);
    if (!providerConfig) {
      reply.code(400);
      return null;
    }
    if (!providerConfig.allowlisted) {
      reply.code(400);
      return null;
    }
    if (providerConfig.status !== "active") {
      reply.code(400);
      return null;
    }
    if (providerConfig.breakerState === "open") {
      reply.code(503);
      return null;
    }
    if (!providerConfig.allowedModels.includes(providerSettings.model)) {
      reply.code(400);
      return null;
    }
    const apiKey = await providerConfigs.getSecret(providerSettings.providerConfigId);
    if (!apiKey) {
      reply.code(400);
      return null;
    }
    return {
      apiBaseUrl: providerConfig.baseUrl,
      apiKey,
      model: providerSettings.model,
    };
  }

  reply.code(400);
  return null;
}

function providerConfigIdFromSettings(providerSettings: ProviderSettingsInput | undefined) {
  return isManagedProviderSettings(providerSettings)
    ? providerSettings.providerConfigId
    : null;
}

async function resolveProviderConfigIdForRun({
  providerSettings,
  metadata,
  resolveProjectDefaultProviderConfig,
}: {
  providerSettings: ProviderSettingsInput | undefined;
  metadata: RunRecordMetadata | undefined;
  resolveProjectDefaultProviderConfig?: (projectId: string) => Promise<string | null>;
}) {
  const explicitProviderConfigId = providerConfigIdFromSettings(providerSettings);
  if (explicitProviderConfigId) return explicitProviderConfigId;
  if (!metadata?.projectId || !resolveProjectDefaultProviderConfig) return null;
  return resolveProjectDefaultProviderConfig(metadata.projectId);
}

type ProjectWorkspaceForRun = {
  state?: unknown;
};

type LoadProjectWorkspaceForRun = (
  projectId: string,
) => Promise<ProjectWorkspaceForRun | Record<string, unknown> | null | undefined>;

type InputResolution<T> =
  | { ok: true; input: T }
  | { ok: false; statusCode: number; body: { message: string } };

function runInputResolutionError(statusCode: number, message: string): InputResolution<never> {
  return { ok: false, statusCode, body: { message } };
}

function recordValue(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringRecordValue(value: unknown) {
  return Object.fromEntries(
    Object.entries(recordValue(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function presentRecordValues(value: unknown) {
  return Object.values(recordValue(value)).filter(Boolean);
}

function compactRunInputText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function scopedDiagramKindFromKey(key: string) {
  return key.includes(":") ? key.split(":")[0] : key;
}

function readNestedText(value: unknown, key: string) {
  return compactRunInputText(recordValue(value)[key]);
}

function requirementPlantUmlArtifactsFromWorkspace(state: Record<string, unknown>) {
  return Object.entries(stringRecordValue(state.plantUml)).map(
    ([artifactId, source]) => ({
      diagramKind: scopedDiagramKindFromKey(artifactId),
      source,
    }),
  );
}

function designPlantUmlArtifactsFromWorkspace(state: Record<string, unknown>) {
  const designModels = recordValue(state.designModels);
  const designSvgArtifacts = recordValue(state.designSvgArtifacts);
  return Object.entries(stringRecordValue(state.designPlantUml)).map(
    ([artifactId, source]) => {
      const model = recordValue(designModels[artifactId]);
      const svgArtifact = recordValue(designSvgArtifacts[artifactId]);
      const modelId =
        readNestedText(model, "modelId") || readNestedText(svgArtifact, "modelId");
      return {
        diagramKind:
          readNestedText(model, "diagramKind") ||
          readNestedText(svgArtifact, "diagramKind") ||
          scopedDiagramKindFromKey(artifactId),
        ...(modelId ? { modelId } : {}),
        source,
      };
    },
  );
}

function codeFilesFromWorkspace(state: Record<string, unknown>) {
  return stringRecordValue(state.codeFiles);
}

async function loadWorkspaceStateForCommand({
  commandProjectId,
  metadata,
  loadProjectWorkspace,
}: {
  commandProjectId?: string;
  metadata: RunRecordMetadata | undefined;
  loadProjectWorkspace?: LoadProjectWorkspaceForRun;
}): Promise<InputResolution<{ projectId: string; state: Record<string, unknown> }>> {
  const projectId = commandProjectId ?? metadata?.projectId;
  if (!projectId) {
    return runInputResolutionError(
      400,
      "Project-scoped generation commands require a project id.",
    );
  }
  if (!loadProjectWorkspace) {
    return runInputResolutionError(
      500,
      "Project workspace loading is not configured for generation commands.",
    );
  }
  const workspace = await loadProjectWorkspace(projectId);
  if (!workspace) {
    return runInputResolutionError(404, "Project workspace not found.");
  }
  const state = isPlainRecord(workspace.state) ? workspace.state : workspace;
  if (!isPlainRecord(state)) {
    return runInputResolutionError(400, "Project workspace state is invalid.");
  }
  return { ok: true, input: { projectId, state } };
}

async function resolveRequirementRunInput(
  body: unknown,
  metadata: RunRecordMetadata | undefined,
  loadProjectWorkspace?: LoadProjectWorkspaceForRun,
): Promise<InputResolution<StartRunRequest>> {
  const legacy = startRunRequestSchema.safeParse(body);
  if (legacy.success) return { ok: true, input: legacy.data };

  const command: StartRunCommand = startRunCommandSchema.parse(body);
  const workspace = await loadWorkspaceStateForCommand({
    commandProjectId: command.projectId,
    metadata,
    loadProjectWorkspace,
  });
  if (!workspace.ok) return workspace;
  return {
    ok: true,
    input: startRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      requirementText: stringValue(workspace.input.state.requirementText),
      selectedDiagrams: command.selectedDiagrams,
      rules: arrayValue(workspace.input.state.rules),
      contextModels: presentRecordValues(workspace.input.state.models),
      contextRequirementModelTraceability: arrayValue(
        workspace.input.state.requirementModelTraceability,
      ),
      analysisTargetUseCaseIds: command.analysisTargetUseCaseIds,
      providerSettings: command.providerSettings,
    }),
  };
}

async function resolveDesignRunInput(
  body: unknown,
  metadata: RunRecordMetadata | undefined,
  loadProjectWorkspace?: LoadProjectWorkspaceForRun,
): Promise<InputResolution<StartDesignRunRequest>> {
  const legacy = startDesignRunRequestSchema.safeParse(body);
  if (legacy.success) {
    return { ok: true, input: filterReplacingDesignContext(legacy.data) };
  }

  const command: StartDesignRunCommand = startDesignRunCommandSchema.parse(body);
  const workspace = await loadWorkspaceStateForCommand({
    commandProjectId: command.projectId,
    metadata,
    loadProjectWorkspace,
  });
  if (!workspace.ok) return workspace;
  return {
    ok: true,
    input: filterReplacingDesignContext(startDesignRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      requirementBaseline: workspace.input.state.requirementBaseline,
      requirementModels: presentRecordValues(workspace.input.state.models),
      requirementModelTraceability: arrayValue(
        workspace.input.state.requirementModelTraceability,
      ),
      selectedDiagrams: command.selectedDiagrams,
      requestedDiagrams: command.requestedDiagrams,
      existingDesignModels: presentRecordValues(workspace.input.state.designModels),
      existingDesignModelTraceability: arrayValue(
        workspace.input.state.designModelTraceability,
      ),
      existingDesignPlantUml: designPlantUmlArtifactsFromWorkspace(
        workspace.input.state,
      ),
      existingDesignSvgArtifacts: presentRecordValues(
        workspace.input.state.designSvgArtifacts,
      ),
      providerSettings: command.providerSettings,
    })),
  };
}

function filterReplacingDesignContext(
  input: StartDesignRunRequest,
): StartDesignRunRequest {
  const replacingDiagrams = Array.from(
    new Set([
      ...input.selectedDiagrams,
      ...(input.requestedDiagrams ?? []),
    ]),
  ) as DesignDiagramKind[];
  if (replacingDiagrams.length === 0) return input;
  return {
    ...input,
    existingDesignModels: input.existingDesignModels.filter(
      (model) =>
        !designRecordBelongsToDiagramKinds(
          model.modelId ?? model.diagramKind,
          model,
          replacingDiagrams,
        ),
    ),
    existingDesignModelTraceability:
      input.existingDesignModelTraceability.filter(
        (entry) =>
          !designTraceabilityTouchesDiagramKinds(entry, replacingDiagrams),
      ),
    existingDesignPlantUml: input.existingDesignPlantUml.filter(
      (artifact) =>
        !designRecordBelongsToDiagramKinds(
          artifact.modelId ?? artifact.diagramKind,
          artifact,
          replacingDiagrams,
        ),
    ),
    existingDesignSvgArtifacts: input.existingDesignSvgArtifacts.filter(
      (artifact) =>
        !designRecordBelongsToDiagramKinds(
          artifact.modelId ?? artifact.diagramKind,
          artifact,
          replacingDiagrams,
        ),
    ),
  };
}

async function resolveCodeRunInput(
  body: unknown,
  metadata: RunRecordMetadata | undefined,
  loadProjectWorkspace?: LoadProjectWorkspaceForRun,
): Promise<InputResolution<StartCodeRunRequest>> {
  const legacy = startCodeRunRequestSchema.safeParse(body);
  if (legacy.success) return { ok: true, input: legacy.data };

  const command: StartCodeRunCommand = startCodeRunCommandSchema.parse(body);
  const workspace = await loadWorkspaceStateForCommand({
    commandProjectId: command.projectId,
    metadata,
    loadProjectWorkspace,
  });
  if (!workspace.ok) return workspace;
  return {
    ok: true,
    input: startCodeRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      requirementText: stringValue(workspace.input.state.requirementText),
      rules: arrayValue(workspace.input.state.rules),
      requirementBaseline: workspace.input.state.requirementBaseline ?? null,
      designModels: presentRecordValues(workspace.input.state.designModels),
      designPlantUml: designPlantUmlArtifactsFromWorkspace(workspace.input.state),
      existingFiles:
        command.generationMode === "regenerate"
          ? {}
          : codeFilesFromWorkspace(workspace.input.state),
      generationMode: command.generationMode,
      providerSettings: command.providerSettings,
      imageProviderSettings: command.imageProviderSettings,
    }),
  };
}

async function resolveDocumentRunInput(
  body: unknown,
  metadata: RunRecordMetadata | undefined,
  loadProjectWorkspace?: LoadProjectWorkspaceForRun,
): Promise<InputResolution<StartDocumentRunRequest>> {
  const legacy = startDocumentRunRequestSchema.safeParse(body);
  if (legacy.success) return { ok: true, input: legacy.data };

  const command: StartDocumentRunCommand = startDocumentRunCommandSchema.parse(body);
  const workspace = await loadWorkspaceStateForCommand({
    commandProjectId: command.projectId,
    metadata,
    loadProjectWorkspace,
  });
  if (!workspace.ok) return workspace;
  return {
    ok: true,
    input: startDocumentRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      documentKind: command.documentKind,
      requirementText: stringValue(workspace.input.state.requirementText),
      requirementBaseline: workspace.input.state.requirementBaseline ?? null,
      rules: arrayValue(workspace.input.state.rules),
      requirementModels: presentRecordValues(workspace.input.state.models),
      requirementPlantUml: requirementPlantUmlArtifactsFromWorkspace(
        workspace.input.state,
      ),
      requirementSvgArtifacts: presentRecordValues(
        workspace.input.state.svgArtifacts,
      ),
      designModels: presentRecordValues(workspace.input.state.designModels),
      designModelTraceability: arrayValue(
        workspace.input.state.designModelTraceability,
      ),
      designPlantUml: designPlantUmlArtifactsFromWorkspace(workspace.input.state),
      designSvgArtifacts: presentRecordValues(
        workspace.input.state.designSvgArtifacts,
      ),
      providerSettings: command.providerSettings,
      useAiText: command.useAiText,
      documentStyle: command.documentStyle,
    }),
  };
}

function snapshotProviderSettings(record: RunRecord) {
  const settings = (record.snapshot as { providerSettings?: unknown }).providerSettings;
  return settings && typeof settings === "object"
    ? (settings as ProviderSettingsInput)
    : undefined;
}

function rememberProviderSettings(
  record: RunRecord,
  providerSettings: ProviderSettingsInput | undefined,
  resolved?: { providerConfigId: string | null; model: string },
) {
  const settingsToRemember =
    providerSettings ??
    (resolved?.providerConfigId
      ? {
          providerConfigId: resolved.providerConfigId,
          model: resolved.model,
        }
      : undefined);
  if (!settingsToRemember) return;
  (record.snapshot as { providerSettings?: ProviderSettingsInput }).providerSettings =
    settingsToRemember;
}

function isActiveRun(record: RunRecord) {
  return (
    !record.terminal &&
    (record.snapshot.status === "queued" || record.snapshot.status === "running")
  );
}

function taskTypeForRun(record: RunRecord): ProviderTaskType {
  const snapshot = record.snapshot;
  if ("documentKind" in snapshot) return "document_generation";
  if ("files" in snapshot) return "code_generation";
  if ("designModelTraceability" in snapshot) return "design_modeling";
  return "requirements_to_uml";
}

async function recordProviderUsage({
  usageTracker,
  providerConfigId,
  metadata,
  request,
  taskType,
}: {
  usageTracker?: ProviderUsageTracker;
  providerConfigId: string | null;
  metadata?: RunRecordMetadata;
  request: FastifyRequest;
  taskType: ProviderTaskType;
}) {
  if (!usageTracker || !providerConfigId) return;
  await usageTracker.recordUsage({
    userId: metadata?.userId ?? null,
    projectId: metadata?.projectId ?? null,
    organizationId: organizationIdFromRequest(request),
    ipAddress: ipAddressFromRequest(request),
    providerConfigId,
    taskType,
    outcome: "success",
  });
}

async function checkProviderUsageLimit({
  usageTracker,
  providerConfigId,
  metadata,
  request,
  taskType,
  policy,
  reply,
}: {
  usageTracker?: ProviderUsageTracker;
  providerConfigId: string | null;
  metadata?: RunRecordMetadata;
  request: FastifyRequest;
  taskType: ProviderTaskType;
  policy: ProviderRateLimitPolicy;
  reply: FastifyReply;
}) {
  if (!usageTracker || !providerConfigId) return true;

  const decision = await usageTracker.checkLimit({
    userId: metadata?.userId ?? null,
    projectId: metadata?.projectId ?? null,
    organizationId: organizationIdFromRequest(request),
    ipAddress: ipAddressFromRequest(request),
    providerConfigId,
    taskType,
    limit: policy.limit,
    windowSeconds: policy.windowSeconds,
  });
  if (decision.allowed) return true;

  reply.code(429);
  return {
    message: "Provider rate limit exceeded",
    rateLimit: decision,
  };
}

async function checkGenerationUsageLimit({
  generationUsage,
  runAccessGuard,
  request,
  reply,
}: {
  generationUsage?: GenerationUsageService;
  runAccessGuard: RunAccessGuard;
  request: FastifyRequest;
  reply: FastifyReply;
}) {
  if (!generationUsage) return true;
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) return true;
  const decision = await generationUsage.checkGenerationLimit({
    userId: access.userId,
    email: access.email,
    ipAddress: ipAddressFromRequest(request),
  });
  if (decision.allowed) return true;

  reply.code(429);
  return {
    message: "Guest generation limit exceeded",
    generationUsage: decision.usage,
  };
}

async function recordGenerationUsage({
  generationUsage,
  runAccessGuard,
  request,
  taskType,
  providerConfigId,
}: {
  generationUsage?: GenerationUsageService;
  runAccessGuard: RunAccessGuard;
  request: FastifyRequest;
  taskType: ProviderTaskType;
  providerConfigId: string | null;
}) {
  if (!generationUsage) return;
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) return;
  await generationUsage.recordGenerationUsage({
    userId: access.userId,
    email: access.email,
    ipAddress: ipAddressFromRequest(request),
    taskType,
    providerConfigId,
  });
}

async function canReadRunRecord(
  request: FastifyRequest,
  reply: FastifyReply,
  record: RunRecord,
  runAccessGuard: RunAccessGuard,
  permission: ProjectPermission,
) {
  const metadata = record.metadata;
  if (!metadata?.userId && !metadata?.projectId) {
    reply.code(401).send({ message: "Authentication required" });
    return false;
  }

  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) {
    reply.code(401).send({ message: "Authentication required" });
    return false;
  }

  if (metadata.projectId) {
    const allowed = await runAccessGuard.canAccessProject({
      request,
      userId: access.userId,
      projectId: metadata.projectId,
      permission,
      access,
    });
    if (!allowed) {
      reply.code(403).send({ message: "Project access denied" });
      return false;
    }
    return true;
  }

  if (metadata.userId !== access.userId) {
    reply.code(403).send({ message: "Run access denied" });
    return false;
  }
  return true;
}

function queryValue(query: unknown, key: string) {
  if (!query || typeof query !== "object" || !(key in query)) return undefined;
  const value = (query as Record<string, unknown>)[key];
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readSnapshotModel(snapshot: RunRecord["snapshot"]) {
  const settings = "providerSettings" in snapshot ? snapshot.providerSettings : undefined;
  if (!settings || typeof settings !== "object" || !("model" in settings)) return undefined;
  const model = (settings as { model?: unknown }).model;
  return typeof model === "string" ? model : undefined;
}

function displayRunStatus(record: RunRecord) {
  if (
    record.terminal &&
    (record.snapshot.status === "running" || record.snapshot.status === "queued")
  ) {
    return "interrupted";
  }
  return record.snapshot.status;
}

function inferRunKind(snapshot: RunRecord["snapshot"]) {
  if ("documentKind" in snapshot) return "document";
  if ("files" in snapshot) return "code";
  if ("designModelTraceability" in snapshot) return "design";
  return "requirements";
}

function evidenceArtifactStage(record: RunRecord): RunStage {
  if (record.snapshot.currentStage) return record.snapshot.currentStage;
  if ("files" in record.snapshot) return "write_code_files";
  if ("documentKind" in record.snapshot) return "render_document_file";
  return "render_svg";
}

function buildAndStoreEvidencePackage(record: RunRecord) {
  const evidencePackage = buildEvidencePackage({
    snapshot: record.snapshot,
    reviewDecisions: record.snapshot.evidencePackage?.reviewDecisions ?? [],
  });
  record.snapshot.evidencePackage = evidencePackage;
  return evidencePackage;
}

function rejectBlockedEvidencePackage(
  reply: FastifyReply,
  evidencePackage: EvidencePackage | null | undefined,
) {
  if (evidencePackage === undefined) return null;
  try {
    assertEvidencePackageAllowsDownstream(evidencePackage);
    return null;
  } catch (error) {
    reply.code(409);
    return {
      message: `EvidencePackage review is unresolved: ${
        error instanceof Error ? error.message : "unknown review gate failure"
      }`,
    };
  }
}

function projectDocumentWorkspaceId(projectId: string) {
  return `project-${projectId}`;
}

function summarizeRunRecord(record: RunRecord) {
  const createdAt = record.metadata?.createdAt ?? new Date().toISOString();
  const status = displayRunStatus(record);
  const stage = record.snapshot.currentStage ?? status;
  const isActive = !record.terminal && (status === "running" || status === "queued");
  const snapshotAvailable = Boolean(record.snapshot);
  const documentDownloadAvailable =
    "documentKind" in record.snapshot &&
    typeof record.snapshot.documentId === "string" &&
    record.snapshot.documentId.trim().length > 0;
  return {
    runId: record.snapshot.runId,
    projectId: record.metadata?.projectId ?? null,
    status,
    stage,
    currentStage: record.snapshot.currentStage,
    error: record.snapshot.error,
    model: readSnapshotModel(record.snapshot) ?? null,
    runKind: inferRunKind(record.snapshot),
    documentKind:
      "documentKind" in record.snapshot ? record.snapshot.documentKind : null,
    createdByUserId: record.metadata?.userId ?? null,
    startedAt: createdAt,
    updatedAt: createdAt,
    completedAt: record.terminal ? createdAt : null,
    metadata: record.metadata ?? null,
    eventCount: record.events.length,
    terminal: record.terminal,
    snapshotAvailable,
    canRestore: snapshotAvailable && !isActive,
    documentDownloadAvailable,
  };
}

const REPAIRABLE_REQUIREMENT_FIELDS: AtomicRequirementField[] = [
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
];

const REQUIREMENT_FIELD_LABELS: Record<AtomicRequirementField, string> = {
  actor: "角色/执行者",
  subject: "主体",
  action: "动作",
  object: "对象",
  condition: "条件",
  outcome: "结果",
  acceptanceCriteria: "验收标准",
};

function currentRequirementFieldValue(
  requirement: AtomicRequirement,
  field: AtomicRequirementField,
) {
  if (field === "acceptanceCriteria") {
    return requirement.acceptanceCriteria.join("；");
  }
  return requirement[field] ?? "";
}

function nonEmptyOrNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readableFieldText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) => readableFieldText(item))
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .join("；");
    return text || null;
  }
  return null;
}

async function reserveBillingRunUsage({
  billingEntitlements,
  metadata,
  runId,
  taskType,
  reply,
}: {
  billingEntitlements?: Pick<BillingService, "reserveRunUsage">;
  metadata?: RunRecordMetadata;
  runId: string;
  taskType: ProviderTaskType;
  reply: FastifyReply;
}) {
  if (!billingEntitlements) return true;
  if (!metadata?.userId) {
    reply.code(401);
    return { message: "Authentication required" };
  }
  const decision = await billingEntitlements.reserveRunUsage({
    runId,
    userId: metadata.userId,
    projectId: metadata.projectId,
    taskType,
  });
  if (decision.allowed) return true;
  reply.code(decision.statusCode);
  return { error: decision.error };
}

function readableConfidence(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 && value <= 1 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  const percentMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*%$/u);
  const parsed = percentMatch
    ? Number(percentMatch[1]) / 100
    : Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return undefined;
  }
  return parsed;
}

function normalizeRequirementRepairSuggestionOutput(raw: unknown) {
  if (!isPlainRecord(raw)) {
    return raw;
  }
  const normalized: Record<string, unknown> = { ...raw };
  const confidence = readableConfidence(raw.confidence);
  if (confidence === undefined) {
    delete normalized.confidence;
  } else {
    normalized.confidence = confidence;
  }
  if (isPlainRecord(raw.fields)) {
    const fields = { ...raw.fields };
    for (const field of REPAIRABLE_REQUIREMENT_FIELDS) {
      const entry = fields[field];
      if (entry === null) {
        delete fields[field];
        continue;
      }
      if (!isPlainRecord(entry)) continue;
      fields[field] = {
        ...entry,
        value: readableFieldText(entry.value),
        originalValue: readableFieldText(entry.originalValue),
      };
    }
    normalized.fields = fields;
  }
  if (raw.status === null) delete normalized.status;
  if (raw.rationale === null) delete normalized.rationale;
  return normalized;
}

function applyParsedRequirementRepairSuggestion(
  input: RepairRequirementRuleRequest,
  suggestion: RequirementRuleRepairSuggestion,
) {
  const baseline = structuredClone(input.baseline) as RepairRequirementRuleRequest["baseline"];
  const requirement = baseline.requirements.find(
    (item) => item.sourceRuleId === input.rule.id,
  );
  if (!requirement) {
    throw new Error("当前规则没有对应的需求基线，无法单项修复");
  }

  const existingProvenance = requirement.fieldProvenance ?? {};
  const nextProvenance: RequirementFieldProvenance = { ...existingProvenance };
  for (const field of REPAIRABLE_REQUIREMENT_FIELDS) {
    const repaired = suggestion.fields[field];
    if (!repaired) continue;
    const value = repaired.value?.trim() ?? "";
    nextProvenance[field] = {
      ...repaired,
      value: value || repaired.value,
      originalValue: nonEmptyOrNull(
        repaired.originalValue ??
          existingProvenance[field]?.originalValue ??
          currentRequirementFieldValue(requirement, field),
      ),
    };
    if (!value) continue;
    if (field === "acceptanceCriteria") {
      requirement.acceptanceCriteria = value
        .split(/[；;\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    } else {
      requirement[field] = value;
    }
  }
  requirement.fieldProvenance = nextProvenance;
  if (typeof suggestion.confidence === "number") {
    requirement.confidence = suggestion.confidence;
  }
  if (suggestion.status) {
    requirement.status = suggestion.status;
  } else if (
    Object.values(nextProvenance).some(
      (item) => item?.source === "ai-suggested" && item.status === "pending-review",
    )
  ) {
    requirement.status = "pending-review";
  }

  const rebuiltBaseline = rebuildRequirementBaselineQualityReport(baseline);
  const repairedRequirement =
    rebuiltBaseline.requirements.find((item) => item.id === requirement.id) ??
    requirement;
  const blockingReasons = rebuiltBaseline.qualityReport.issues
    .filter(
      (issue): issue is RequirementQualityIssue & { requirementId: string } =>
        issue.requirementId === repairedRequirement.id && issue.blocksDownstream,
    )
    .map((issue) => issue.message);

  return repairRequirementRuleResponseSchema.parse({
    requirement: repairedRequirement,
    qualityReport: rebuiltBaseline.qualityReport,
    repairRationale:
      suggestion.rationale ??
      "已仅针对当前需求规则补齐结构化字段，并重新运行需求质量检查。",
    blockingReasons,
  });
}

function applyRequirementRepairSuggestion(
  input: RepairRequirementRuleRequest,
  rawOutput: string,
) {
  const suggestion = requirementRuleRepairSuggestionSchema.parse(
    normalizeRequirementRepairSuggestionOutput(parseJson(rawOutput)),
  );
  return applyParsedRequirementRepairSuggestion(input, suggestion);
}

function buildRequirementRuleRepairMessages(
  input: RepairRequirementRuleRequest,
): ChatMessage[] {
  const requirement = input.baseline.requirements.find(
    (item) => item.sourceRuleId === input.rule.id,
  );
  const issues = input.baseline.qualityReport.issues.filter(
    (issue) => !requirement || issue.requirementId === requirement.id,
  );
  return [
    {
      role: "system",
      content:
        "你是需求规则字段级修复助手。只修复当前一条需求规则的结构化字段，不改写原始需求文本，不重新生成全部规则。输出必须是 JSON。",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task:
            "根据原始需求文本、当前规则和质量问题，为当前 AtomicRequirement 生成字段级补齐建议。能从原文明确推出的字段可以 accepted；原文没有给出关键业务事实（例如预定值具体是多少）只能 pending-review，不能伪装为已确认。",
          outputRules: [
            "所有字段值必须是中文字符串或 null，不能返回数组或对象。",
            "originalValue 必须是字符串或 null；验收标准有多条时合并为一段中文文本。",
            "acceptanceCriteria.value 如需表达多条验收标准，请用中文分号分隔成一个字符串。",
          ],
          outputShape: {
            fields: Object.fromEntries(
              REPAIRABLE_REQUIREMENT_FIELDS.map((field) => [
                field,
                {
                  source: "ai-suggested",
                  status: "accepted 或 pending-review",
                  value: `${REQUIREMENT_FIELD_LABELS[field]}的中文建议值`,
                  originalValue: "原始值；没有提取到则为 null",
                  rationale: "中文修复原因",
                },
              ]),
            ),
            confidence: "0 到 1",
            status: "accepted 或 pending-review 或 conflict",
            rationale: "中文总体修复原因",
          },
          originalRequirementText: input.requirementText,
          currentRule: input.rule,
          currentRequirement: requirement,
          qualityIssues: issues,
        },
        null,
        2,
      ),
    },
  ];
}

function buildRequirementRulesRepairMessages(
  input: RepairRequirementRulesRequest,
): ChatMessage[] {
  const targetRuleIds = new Set(input.targetRuleIds);
  const targetRules = input.rules.filter((rule) => targetRuleIds.has(rule.id));
  const targetRequirements = input.baseline.requirements.filter(
    (requirement) =>
      requirement.sourceRuleId && targetRuleIds.has(requirement.sourceRuleId),
  );
  const targetRequirementIds = new Set(targetRequirements.map((item) => item.id));
  const issues = input.baseline.qualityReport.issues.filter(
    (issue) => !issue.requirementId || targetRequirementIds.has(issue.requirementId),
  );
  return [
    {
      role: "system",
      content:
        "你是需求规则批量字段级修复助手。一次性为多条需求规则生成结构化字段修复候选，不改写原始需求文本，不重新生成全部规则。输出必须是 JSON。",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task:
            "根据原始需求文本、当前规则、当前 AtomicRequirement 和质量问题，为所有 targetRuleIds 生成字段级补齐建议。每条 repairs 必须带 ruleId。能从原文明确推出的字段可以 accepted；原文没有给出关键业务事实只能 pending-review，不能伪装为已确认。",
          outputRules: [
            "只返回 targetRuleIds 中的规则，不要返回未知 ruleId。",
            "所有字段值必须是中文字符串或 null，不能返回数组或对象。",
            "originalValue 必须是字符串或 null；验收标准有多条时合并为一段中文文本。",
            "acceptanceCriteria.value 如需表达多条验收标准，请用中文分号分隔成一个字符串。",
            "confidence 必须是 0 到 1 的数字。",
          ],
          outputShape: {
            repairs: [
              {
                ruleId: "规则 id",
                fields: Object.fromEntries(
                  REPAIRABLE_REQUIREMENT_FIELDS.map((field) => [
                    field,
                    {
                      source: "ai-suggested",
                      status: "accepted 或 pending-review",
                      value: `${REQUIREMENT_FIELD_LABELS[field]}的中文建议值`,
                      originalValue: "原始值；没有提取到则为 null",
                      rationale: "中文修复原因",
                    },
                  ]),
                ),
                confidence: "0 到 1 的数字",
                status: "accepted 或 pending-review 或 conflict",
                rationale: "中文总体修复原因",
              },
            ],
          },
          originalRequirementText: input.requirementText,
          targetRuleIds: input.targetRuleIds,
          currentRules: targetRules,
          currentRequirements: targetRequirements,
          qualityIssues: issues,
        },
        null,
        2,
      ),
    },
  ];
}

function applyBatchRequirementRepairSuggestions(
  input: RepairRequirementRulesRequest,
  rawOutput: string,
) {
  const rawParsed = requirementRuleBatchRepairSuggestionSchema.parse(
    parseJson(rawOutput),
  );
  const repairsByRuleId = new Map<string, unknown>();
  for (const repair of rawParsed.repairs) {
    if (!repairsByRuleId.has(repair.ruleId)) {
      repairsByRuleId.set(repair.ruleId, repair);
    }
  }
  const candidates: Array<{
    ruleId: string;
    requirement: AtomicRequirement;
    qualityReport: RepairRequirementRuleResponse["qualityReport"];
    repairRationale: string;
    blockingReasons: string[];
  }> = [];
  const failures: Array<{ ruleId: string; errorMessage: string }> = [];

  for (const ruleId of input.targetRuleIds) {
    const rule = input.rules.find((item) => item.id === ruleId);
    const requirement = input.baseline.requirements.find(
      (item) => item.sourceRuleId === ruleId,
    );
    if (!rule || !requirement) {
      failures.push({
        ruleId,
        errorMessage: "当前规则没有对应的需求基线，无法批量修复",
      });
      continue;
    }
    const rawRepair = repairsByRuleId.get(ruleId);
    if (!rawRepair) {
      failures.push({
        ruleId,
        errorMessage: "模型未返回当前规则的修复候选",
      });
      continue;
    }
    try {
      const suggestion = requirementRuleRepairSuggestionSchema.parse(
        normalizeRequirementRepairSuggestionOutput(rawRepair),
      );
      const result = applyParsedRequirementRepairSuggestion(
        {
          projectId: input.projectId,
          requirementText: input.requirementText,
          rule,
          baseline: input.baseline,
          providerSettings: input.providerSettings,
        },
        suggestion,
      );
      candidates.push({ ruleId, ...result });
    } catch (error) {
      failures.push({
        ruleId,
        errorMessage:
          error instanceof Error ? error.message : "模型返回内容无法解析",
      });
    }
  }

  return repairRequirementRulesResponseSchema.parse({
    candidates,
    failures,
  });
}

function projectRecordMatchesFilters(record: RunRecord, query: unknown) {
  const status = queryValue(query, "status");
  if (status && record.snapshot.status !== status) return false;
  const stage = queryValue(query, "stage");
  if (stage && record.snapshot.currentStage !== stage) return false;
  const userId = queryValue(query, "userId");
  if (userId && record.metadata?.userId !== userId) return false;
  const model = queryValue(query, "model");
  if (model && readSnapshotModel(record.snapshot) !== model) return false;
  return true;
}

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
  providerUsageTracker,
  generationUsage,
  billingEntitlements,
  providerRateLimitPolicy = resolveProviderRateLimitPolicy(),
  llmScheduler,
  loadProjectWorkspace,
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
  providerUsageTracker?: ProviderUsageTracker;
  generationUsage?: GenerationUsageService;
  billingEntitlements?: Pick<
    BillingService,
    "reserveRunUsage" | "confirmRunUsage" | "releaseRunUsage" | "compensateRunUsage"
  >;
  providerRateLimitPolicy?: ProviderRateLimitPolicy;
  llmScheduler?: LlmScheduler;
  loadProjectWorkspace?: LoadProjectWorkspaceForRun;
}) {
  const startRecordPipeline = ({
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

  app.post("/api/runs/requirement-rule-repair", async (request, reply) => {
    const metadata = await metadataForStartedRun(
      request,
      reply,
      runAccessGuard,
      "start_runs",
    );
    if (metadata === null) return runAccessDeniedMessage(reply);
    const input = repairRequirementRuleRequestSchema.parse(request.body);
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

    // Routes create queued records; pipelines advance them to running/completed/failed.
    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    startRecordPipeline({
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

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    startRecordPipeline({
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

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    startRecordPipeline({
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

    emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));

    startRecordPipeline({
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

    const projectRuns = Array.from(runs.values())
      .filter((record) => record.metadata?.projectId === projectId)
      .filter((record) => projectRecordMatchesFilters(record, request.query))
      .sort((left, right) =>
        (right.metadata?.createdAt ?? "").localeCompare(
          left.metadata?.createdAt ?? "",
        ),
      )
      .map(summarizeRunRecord);

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

    const record = runs.get(runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }

    const includeEvents = queryValue(request.query, "includeEvents") === "true";
    return {
      projectId,
      run: summarizeRunRecord(record),
      snapshot: record.snapshot,
      ...(includeEvents ? { events: record.events } : {}),
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

    const record = runs.get(runId);
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

    const record = runs.get(runId);
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
    const existingDecisions =
      record.snapshot.evidencePackage?.reviewDecisions.filter(
        (existing) => existing.reviewItemId !== decision.reviewItemId,
      ) ?? [];
    const evidencePackage = buildEvidencePackage({
      snapshot: record.snapshot,
      reviewDecisions: [...existingDecisions, decision],
    });
    record.snapshot.evidencePackage = evidencePackage;
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

    const record = runs.get(runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }
    if (!record.terminal && (record.snapshot.status === "running" || record.snapshot.status === "queued")) {
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

    const record = runs.get(runId);
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }
    if (record.terminal) {
      reply.code(409);
      return { message: "Terminal runs cannot be cancelled again" };
    }

    llmScheduler?.cancelRun(runId);
    await billingEntitlements?.releaseRunUsage(runId);
    return cancelRunRecord(record, runId);
  });

  async function createProjectRunAction(
    request: FastifyRequest,
    reply: FastifyReply,
    action: Extract<RunAction, "retry" | "rerun">,
  ) {
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

    const source = runs.get(runId);
    if (!source || source.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }
    if (action === "retry" && !isRetryableRun(source)) {
      reply.code(409);
      return { message: "Only failed, cancelled, or interrupted runs can be retried" };
    }
    if (isActiveRun(source)) {
      reply.code(409);
      return { message: "Running or queued runs cannot be rerun" };
    }

    const metadata: RunRecordMetadata = {
      userId: access.userId,
      projectId,
      createdAt: new Date().toISOString(),
    };
    const providerSettingsInput = snapshotProviderSettings(source);
    const providerSettings = await resolveProviderSettingsForRun({
      providerSettings: providerSettingsInput,
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
      providerSettings: providerSettingsInput,
      metadata,
      resolveProjectDefaultProviderConfig,
    });
    const taskType = taskTypeForRun(source);
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
      taskType,
      policy: providerRateLimitPolicy,
      reply,
    });
    if (limitCheck !== true) return limitCheck;
    const newRunId = randomUUID();
    const billingCheck = await reserveBillingRunUsage({
      billingEntitlements,
      metadata,
      runId: newRunId,
      taskType,
      reply,
    });
    if (billingCheck !== true) return billingCheck;
    await recordProviderUsage({
      usageTracker: providerUsageTracker,
      providerConfigId,
      metadata,
      request,
      taskType,
    });
    await recordGenerationUsage({
      generationUsage,
      runAccessGuard,
      request,
      taskType,
      providerConfigId,
    });
    const result = createQueuedRunFromSource({
      runs,
      source,
      metadata,
      action,
      sourceRunId: runId,
      actorUserId: access.userId,
      runId: newRunId,
    });
    const newRecord = runs.get(result.runId);
    if (newRecord) {
      rememberProviderSettings(newRecord, providerSettingsInput, {
        providerConfigId,
        model: providerSettings.model,
      });
      startRecordPipeline({
        record: newRecord,
        providerSettings,
        providerConfigId,
      });
    }

    reply.code(202);
    return result;
  }

  app.post("/api/projects/:projectId/runs/:runId/retry", (request, reply) =>
    createProjectRunAction(request, reply, "retry"),
  );

  app.post("/api/projects/:projectId/runs/:runId/rerun", (request, reply) =>
    createProjectRunAction(request, reply, "rerun"),
  );

  app.get(RUN_ROUTE_CONFIG.requirements.snapshotPath, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const record = runs.get(runId);
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
    const record = runs.get(runId);
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
    const record = runs.get(runId);
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
    const record = runs.get(runId);
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
    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Document file not found" };
    }
    if (!(await canReadRunRecord(request, reply, record, runAccessGuard, "view_documents"))) {
      return reply;
    }
    const snapshot = documentRunSnapshotSchema.parse(record.snapshot);
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
      `attachment; filename*=UTF-8''${encodeURIComponent(snapshot.fileName ?? "说明书.docx")}`,
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
