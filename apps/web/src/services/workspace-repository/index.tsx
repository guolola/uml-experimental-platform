import {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  DesignDiagramModelSpec,
  CodeRunSnapshot,
  DocumentKind,
  DocumentLibraryItem,
  DocumentLibraryListResponse,
  DocumentStyleSettings,
  DocumentRunSnapshot,
  DesignPlantUmlArtifact,
  DesignModelTraceabilityEntry,
  EvidencePackage,
  EvidenceReviewDecision,
  RequirementModelTraceabilityEntry,
  DesignRunSnapshot,
  DesignSvgArtifact,
  DiagramModelSpec,
  PlantUmlArtifact,
  ProviderSettings,
  OnlyOfficeEditorConfigResponse,
  OnlyOfficeUiTheme,
  RenderStructuredModelResponse,
  RenderSvgResponse,
  RunEvent,
  RunSnapshot,
  SvgArtifact,
  ManagedProviderSettings,
  RepairRequirementRuleRequest,
  RepairRequirementRuleResponse,
  RequirementBaseline,
} from "@uml-platform/contracts";
import {
  getDesignArtifactId,
  getDesignModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../entities/diagram/model";
import type {
  ManualModelEditStatus,
  WorkspaceRecord,
} from "../../entities/workspace/model";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import {
  loadUserSettings,
  normalizeApiBaseUrl,
} from "../../shared/lib/user-settings";
import type { ModelCapability } from "../../shared/lib/model-catalog";
import {
  ApiClientError,
  buildApiUrl,
  downloadBlob,
  postJson,
  requestJson,
} from "../api-client";
import { subscribeToRunEvents } from "../sse-client";
import {
  clearRunHistoryItems,
  createRunHistoryTitle,
  deleteRunHistoryItem,
  isCodeRunSnapshot,
  isDesignRunSnapshot,
  isDocumentRunSnapshot,
  loadRunHistory,
  saveRunHistoryItem,
  type RunHistoryItem,
  type RunHistorySnapshot,
} from "../../features/history";

export { buildApiUrl } from "../api-client";

const PROJECT_ID_HEADER = "X-UML-Project-Id";
const PROJECT_REQUIRED_MESSAGE = "请先登录并进入项目";

interface WorkspaceRepositoryOptions {
  projectId?: string | null;
}

export interface ProviderSettingsInput {
  apiBaseUrl?: ProviderSettings["apiBaseUrl"];
  apiKey?: ProviderSettings["apiKey"];
  providerConfigId?: ManagedProviderSettings["providerConfigId"];
  model: ProviderSettings["model"];
}

export interface StartRunInput {
  requirementText: string;
  selectedDiagrams: DiagramType[];
  rules: RequirementRule[];
  providerSettings: ProviderSettingsInput;
}

export interface StartDesignRunInput {
  requirementText: string;
  rules: RequirementRule[];
  evidencePackage?: EvidencePackage | null;
  requirementModels: DiagramModelSpec[];
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  selectedDiagrams: DesignDiagramType[];
  existingDesignModels: DesignDiagramModelSpec[];
  existingDesignModelTraceability: DesignModelTraceabilityEntry[];
  existingDesignPlantUml: DesignPlantUmlArtifact[];
  existingDesignSvgArtifacts: DesignSvgArtifact[];
  providerSettings: ProviderSettingsInput;
}

export interface StartCodeRunInput {
  requirementText: string;
  rules: RequirementRule[];
  evidencePackage?: EvidencePackage | null;
  designModels: DesignDiagramModelSpec[];
  designPlantUml: DesignPlantUmlArtifact[];
  existingFiles: Record<string, string>;
  generationMode: "continue" | "regenerate";
  providerSettings: ProviderSettingsInput;
}

export interface StartDocumentRunInput {
  documentKind: DocumentKind;
  requirementText: string;
  evidencePackage?: EvidencePackage | null;
  rules: RequirementRule[];
  requirementModels: DiagramModelSpec[];
  requirementPlantUml: PlantUmlArtifact[];
  requirementSvgArtifacts: SvgArtifact[];
  designModels: DesignDiagramModelSpec[];
  designPlantUml: DesignPlantUmlArtifact[];
  designSvgArtifacts: DesignSvgArtifact[];
  providerSettings: ProviderSettingsInput;
  useAiText: boolean;
  documentStyle?: DocumentStyleSettings;
}

export interface WorkspaceRepository {
  loadWorkspace(): Promise<WorkspaceRecord>;
  updateRequirementText(text: string): Promise<void>;
  updateRequirementRules?(rules: RequirementRule[]): Promise<void>;
  updateRequirementBaseline?(baseline: RequirementBaseline): Promise<void>;
  repairRequirementRule?(
    input: RepairRequirementRuleRequest,
  ): Promise<RepairRequirementRuleResponse>;
  startRun(input: StartRunInput): Promise<{ runId: string }>;
  startDesignRun?(input: StartDesignRunInput): Promise<{ runId: string }>;
  startCodeRun?(input: StartCodeRunInput): Promise<{ runId: string }>;
  startDocumentRun?(input: StartDocumentRunInput): Promise<{ runId: string }>;
  subscribeToRun(
    runId: string,
    onEvent: (event: RunEvent) => void,
  ): Promise<void>;
  subscribeToDesignRun?(
    runId: string,
    onEvent: (event: RunEvent) => void,
  ): Promise<void>;
  subscribeToCodeRun?(
    runId: string,
    onEvent: (event: RunEvent) => void,
  ): Promise<void>;
  subscribeToDocumentRun?(
    runId: string,
    onEvent: (event: RunEvent) => void,
  ): Promise<void>;
  getRunSnapshot(runId: string): Promise<RunSnapshot>;
  getDesignRunSnapshot?(runId: string): Promise<DesignRunSnapshot>;
  getCodeRunSnapshot?(runId: string): Promise<CodeRunSnapshot>;
  getDocumentRunSnapshot?(runId: string): Promise<DocumentRunSnapshot>;
  getRunEvidence?(runId: string): Promise<EvidencePackage>;
  submitRunReviewDecision?(
    runId: string,
    decision: {
      reviewItemId: string;
      decision: EvidenceReviewDecision["decision"];
      comment: string;
    },
  ): Promise<EvidencePackage>;
  listDocuments?(): Promise<DocumentLibraryItem[]>;
  getOnlyOfficeEditorConfig?(
    documentId: string,
    uiTheme?: OnlyOfficeUiTheme,
  ): Promise<OnlyOfficeEditorConfigResponse>;
  downloadDocumentRun?(
    runId: string,
    defaultFileName?: string,
  ): Promise<{ blob: Blob; fileName: string }>;
  downloadDocument?(
    documentId: string,
    defaultFileName?: string,
  ): Promise<{ blob: Blob; fileName: string }>;
  renderPlantUml(
    diagramKind: DiagramType,
    plantUmlSource: string,
  ): Promise<RenderSvgResponse>;
  renderStructuredModel?(
    model: DiagramModelSpec | DesignDiagramModelSpec,
  ): Promise<RenderStructuredModelResponse>;
  saveRequirementModelEdit?(
    diagramKind: DiagramType,
    model: DiagramModelSpec,
    status: ManualModelEditStatus,
  ): Promise<void>;
  saveDesignModelEdit?(
    modelId: string,
    model: DesignDiagramModelSpec,
    status: ManualModelEditStatus,
  ): Promise<void>;
  saveManualModelRerender?(
    key: string,
    status: ManualModelEditStatus,
    artifact: {
      plantUmlSource: string;
      svgArtifact: SvgArtifact | DesignSvgArtifact;
    },
  ): Promise<void>;
  testProviderSettings(
    providerSettings: ProviderSettingsInput,
  ): Promise<{
    ok: boolean;
    message: string;
    capability: ModelCapability;
  }>;
  saveRunHistory(
    snapshot: RunHistorySnapshot,
    meta: { providerModel: string; durationMs?: number },
  ): Promise<RunHistoryItem>;
  listRunHistory(): Promise<RunHistoryItem[]>;
  restoreRunHistory(id: string): Promise<RunHistoryItem | null>;
  deleteRunHistory(id: string): Promise<RunHistoryItem[]>;
  clearRunHistory(): Promise<void>;
}

function createEmptyWorkspace(): WorkspaceRecord {
  return {
    id: "workspace-default",
    name: "软件工程实验平台",
    requirementText: "",
    selectedDiagramTypes: [],
    rules: [],
    requirementBaseline: null,
    requirementQualityReport: null,
    models: {},
    requirementModelTraceability: [],
    generatedDiagramTypes: [],
    plantUml: {},
    svgArtifacts: {},
    diagramErrors: {},
    selectedDesignDiagramTypes: [],
    designModels: {},
    designModelTraceability: [],
    generatedDesignDiagramTypes: [],
    designPlantUml: {},
    designSvgArtifacts: {},
    designDiagramErrors: {},
    manualModelEditStatus: {},
    codeSpec: null,
    codeBusinessLogic: null,
    codeFiles: {},
    codeEntryFile: null,
    codeDependencies: {},
    codeUiMockup: null,
    codeAgentPlan: [],
    codeSkills: [],
    codeSkillDiagnostics: [],
    codeSkillResourcePlan: null,
    codeSkillContext: null,
    codeDiagnostics: [],
    rulesVersion: 0,
    rulesBasedOnTextVersion: null,
    diagramVersions: {},
    currentStage: null,
    runStatus: "idle",
    runProgress: 0,
    runMessage: null,
    errorMessage: null,
  };
}

type ProjectWorkspaceResponse = {
  projectId: string;
  version: number;
  state?: Partial<WorkspaceRecord>;
  updatedAt?: string;
  updatedByUserId?: string | null;
  sourceRunId?: string | null;
};

type ProjectRunDetailResponse = {
  projectId?: string;
  run?: {
    runId?: string;
    model?: string | null;
    startedAt?: string | null;
    createdAt?: string | null;
  };
  snapshot?: RunHistorySnapshot;
};

type ProjectRunsResponse = {
  runs?: Array<{
    runId?: string;
    status?: string | null;
    startedAt?: string | null;
    updatedAt?: string | null;
    completedAt?: string | null;
    model?: string | null;
    snapshotAvailable?: boolean | null;
    canRestore?: boolean | null;
    documentDownloadAvailable?: boolean | null;
  }>;
};

function cloneWorkspace(workspace: WorkspaceRecord): WorkspaceRecord {
  return structuredClone(workspace) as WorkspaceRecord;
}

function mergeWorkspaceState(state?: Partial<WorkspaceRecord>): WorkspaceRecord {
  return {
    ...createEmptyWorkspace(),
    ...(state ?? {}),
  };
}

function applySnapshotToWorkspace(
  workspace: WorkspaceRecord,
  snapshot: RunHistorySnapshot,
): WorkspaceRecord {
  const next = cloneWorkspace(workspace);
  next.requirementText = snapshot.requirementText;
  next.runStatus = "idle";
  next.runProgress = 0;
  next.currentStage = null;
  next.runMessage = null;
  next.errorMessage = null;

  if (isDocumentRunSnapshot(snapshot)) {
    return next;
  }

  next.rules = [...snapshot.rules];
  next.requirementBaseline = snapshot.requirementBaseline ?? next.requirementBaseline ?? null;
  next.requirementQualityReport =
    snapshot.requirementBaseline?.qualityReport ?? next.requirementQualityReport ?? null;

  if (isCodeRunSnapshot(snapshot)) {
    next.designModels = Object.fromEntries(
      snapshot.designModels.map((model) => [getDesignModelId(model), model]),
    ) as WorkspaceRecord["designModels"];
    next.designPlantUml = Object.fromEntries(
      snapshot.designPlantUml.map((artifact) => [getDesignArtifactId(artifact), artifact.source]),
    ) as WorkspaceRecord["designPlantUml"];
    next.codeSpec = snapshot.spec;
    next.codeBusinessLogic = snapshot.businessLogic;
    next.codeFiles = { ...snapshot.files };
    next.codeEntryFile = snapshot.entryFile;
    next.codeDependencies = { ...snapshot.dependencies };
    next.codeUiMockup = snapshot.uiMockup;
    next.codeAgentPlan = [...snapshot.agentPlan];
    next.codeSkills = [...snapshot.selectedCodeSkills];
    next.codeSkillDiagnostics = [...snapshot.skillDiagnostics];
    next.codeSkillResourcePlan = snapshot.skillResourcePlan;
    next.codeSkillContext = snapshot.codeSkillContext;
    next.codeDiagnostics = [...snapshot.diagnostics];
    return next;
  }

  if (isDesignRunSnapshot(snapshot)) {
    const designRecords = mapDesignSnapshotToRecords(snapshot);
    const affected = new Set(snapshot.selectedDiagrams);
    next.selectedDesignDiagramTypes = [...snapshot.selectedDiagrams];
    next.designModels = { ...next.designModels, ...designRecords.modelMap };
    next.designModelTraceability = [
      ...next.designModelTraceability.filter(
        (entry) => !affected.has(entry.source.diagramKind as DesignDiagramType),
      ),
      ...snapshot.designModelTraceability,
    ];
    next.generatedDesignDiagramTypes = Array.from(
      new Set([...next.generatedDesignDiagramTypes, ...snapshot.selectedDiagrams]),
    );
    next.designPlantUml = { ...next.designPlantUml, ...designRecords.plantUmlMap };
    next.designSvgArtifacts = { ...next.designSvgArtifacts, ...designRecords.svgMap };
    next.designDiagramErrors = clearAndMergeDiagramErrors(
      next.designDiagramErrors,
      snapshot.diagramErrors,
      snapshot.selectedDiagrams,
    );
    next.models = {
      ...next.models,
      ...(Object.fromEntries(
        snapshot.requirementModels.map((model) => [model.diagramKind, model]),
      ) as WorkspaceRecord["models"]),
    };
    next.requirementModelTraceability = mergeRequirementTraceability(
      next.requirementModelTraceability,
      snapshot.requirementModelTraceability,
      snapshot.requirementModels.map((model) => model.diagramKind),
    );
    return next;
  }

  const records = mapSnapshotToRecords(snapshot);
  const nextRulesVersion = next.rulesVersion + 1;
  const affected = snapshot.selectedDiagrams;
  next.selectedDiagramTypes = [...snapshot.selectedDiagrams];
  next.rulesVersion = nextRulesVersion;
  next.rulesBasedOnTextVersion = 0;
  if (affected.length === 0) {
    return next;
  }
  next.models = { ...next.models, ...records.modelMap };
  next.requirementModelTraceability = mergeRequirementTraceability(
    next.requirementModelTraceability,
    snapshot.requirementModelTraceability ?? [],
    affected,
  );
  next.generatedDiagramTypes = Array.from(
    new Set([...next.generatedDiagramTypes, ...snapshot.selectedDiagrams]),
  );
  next.plantUml = { ...next.plantUml, ...records.plantUmlMap };
  next.svgArtifacts = { ...next.svgArtifacts, ...records.svgMap };
  next.diagramErrors = clearAndMergeDiagramErrors(
    next.diagramErrors,
    snapshot.diagramErrors,
    affected,
  );
  next.diagramVersions = {
    ...next.diagramVersions,
    ...Object.fromEntries(affected.map((diagram) => [diagram, nextRulesVersion])),
  };
  return next;
}

function clearAndMergeDiagramErrors<T extends string, V>(
  current: Partial<Record<T, V>>,
  incoming: Partial<Record<T, V>>,
  affected: readonly T[],
) {
  const next = { ...current };
  for (const diagram of affected) {
    delete next[diagram];
  }
  return { ...next, ...incoming };
}

function mergeRequirementTraceability(
  current: WorkspaceRecord["requirementModelTraceability"],
  incoming: WorkspaceRecord["requirementModelTraceability"],
  affectedDiagrams: readonly DiagramType[],
) {
  const affected = new Set<DiagramType>(affectedDiagrams);
  return [
    ...current.filter((entry) => !affected.has(entry.target.diagramKind as DiagramType)),
    ...incoming.filter((entry) => affected.has(entry.target.diagramKind as DiagramType)),
  ];
}

function stableWorkspaceState(workspace: WorkspaceRecord): Partial<WorkspaceRecord> {
  const {
    currentStage: _currentStage,
    runStatus: _runStatus,
    runProgress: _runProgress,
    runMessage: _runMessage,
    errorMessage: _errorMessage,
    ...state
  } = workspace;
  return state;
}

function mapSnapshotToRecords(snapshot: RunSnapshot) {
  return {
    modelMap: Object.fromEntries(
      snapshot.models.map((model) => [model.diagramKind, model]),
    ) as Partial<Record<DiagramType, DiagramModelSpec>>,
    plantUmlMap: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [artifact.diagramKind, artifact.source]),
    ) as Partial<Record<DiagramType, string>>,
    svgMap: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [artifact.diagramKind, artifact]),
    ) as Partial<Record<DiagramType, SvgArtifact>>,
  };
}

function mapDesignSnapshotToRecords(snapshot: DesignRunSnapshot) {
  return {
    modelMap: Object.fromEntries(
      snapshot.models.map((model) => [getDesignModelId(model), model]),
    ) as WorkspaceRecord["designModels"],
    plantUmlMap: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [getDesignArtifactId(artifact), artifact.source]),
    ) as WorkspaceRecord["designPlantUml"],
    svgMap: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [getDesignArtifactId(artifact), artifact]),
    ) as WorkspaceRecord["designSvgArtifacts"],
  };
}

function documentTimestamp(date = new Date()) {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(
    date.getSeconds(),
  )}`;
  return `${datePart}-${timePart}-${pad(date.getMilliseconds(), 3)}`;
}

function documentFileName(documentKind: DocumentKind, date = new Date()) {
  const timestamp = documentTimestamp(date);
  return documentKind === "requirementsSpec"
    ? `需求规格说明书-${timestamp}.docx`
    : `软件设计说明书-${timestamp}.docx`;
}

function normalizeProjectId(projectId?: string | null) {
  const normalized = projectId?.trim();
  return normalized ? normalized : null;
}

function getProjectIdFromPath(pathname: string) {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function projectHeaders(projectId: string | null) {
  return projectId ? { [PROJECT_ID_HEADER]: projectId } : {};
}

function requireProjectScope(projectId: string | null) {
  if (!projectId) throw new Error(PROJECT_REQUIRED_MESSAGE);
  return projectId;
}

function withProjectHeaders<
  T extends RequestInit & { errorMessage?: string; defaultFileName?: string },
>(projectId: string | null, options: T): T {
  return {
    ...options,
    headers: {
      ...projectHeaders(projectId),
      ...options.headers,
    },
  } as T;
}

async function readRunSnapshot(runId: string, projectId: string | null = null) {
  return requestJson<RunSnapshot>(`/api/runs/${runId}`, {
    errorMessage: "读取运行快照失败",
    headers: projectHeaders(projectId),
  });
}

async function readDesignRunSnapshot(runId: string, projectId: string | null = null) {
  return requestJson<DesignRunSnapshot>(`/api/design-runs/${runId}`, {
    errorMessage: "读取设计运行快照失败",
    headers: projectHeaders(projectId),
  });
}

async function readCodeRunSnapshot(runId: string, projectId: string | null = null) {
  try {
    return await requestJson<CodeRunSnapshot>(`/api/code-runs/${runId}`, {
      errorMessage: "读取代码运行快照失败",
      headers: projectHeaders(projectId),
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      throw new Error("代码生成任务已丢失，可能是本地 API 服务重启，请重新生成");
    }
    throw error;
  }
}

async function readDocumentRunSnapshot(runId: string, projectId: string | null = null) {
  return requestJson<DocumentRunSnapshot>(`/api/document-runs/${runId}`, {
    errorMessage: "读取说明书运行快照失败",
    headers: projectHeaders(projectId),
  });
}

async function readRunEvidencePackage(runId: string, projectId: string | null = null) {
  const scopedProjectId = requireProjectScope(projectId);
  const response = await requestJson<{ evidencePackage: EvidencePackage }>(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/runs/${encodeURIComponent(runId)}/evidence`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "读取可信证据包失败",
    }),
  );
  return response.evidencePackage;
}

async function postRunReviewDecision(
  runId: string,
  decision: {
    reviewItemId: string;
    decision: EvidenceReviewDecision["decision"];
    comment: string;
  },
  projectId: string | null = null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  const response = await postJson<{ evidencePackage: EvidencePackage }>(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/runs/${encodeURIComponent(runId)}/review-decisions`,
    decision,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "提交人工复核决策失败",
    }),
  );
  return response.evidencePackage;
}

async function downloadDocumentRunFile(
  runId: string,
  defaultFileName?: string,
  projectId: string | null = null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return downloadBlob(
    `/api/document-runs/${runId}/download`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "下载说明书失败",
      defaultFileName: defaultFileName ?? "说明书.docx",
    }),
  );
}

async function listDocumentLibraryItems(projectId: string | null = null) {
  const scopedProjectId = requireProjectScope(projectId);
  const response = await requestJson<DocumentLibraryListResponse>(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/documents`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "读取说明书列表失败",
    }),
  );
  return response.documents;
}

async function readOnlyOfficeEditorConfig(
  documentId: string,
  uiTheme?: OnlyOfficeUiTheme,
  projectId: string | null = null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  const query = uiTheme ? `?uiTheme=${encodeURIComponent(uiTheme)}` : "";
  return requestJson<OnlyOfficeEditorConfigResponse>(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/documents/${encodeURIComponent(documentId)}/editor-config${query}`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "读取 OnlyOffice 编辑器配置失败",
    }),
  );
}

async function downloadDocumentFile(
  documentId: string,
  defaultFileName?: string,
  projectId: string | null = null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return downloadBlob(
    `/api/projects/${encodeURIComponent(scopedProjectId)}/documents/${encodeURIComponent(documentId)}/download`,
    withProjectHeaders(scopedProjectId, {
      errorMessage: "下载说明书失败",
      defaultFileName: defaultFileName ?? "说明书.docx",
    }),
  );
}

async function streamProjectRunEvents(
  endpoint: string,
  projectId: string,
  onEvent: (event: RunEvent) => void,
) {
  const response = await fetch(buildApiUrl(endpoint), {
    credentials: "include",
    headers: projectHeaders(projectId),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload && typeof payload === "object" && "message" in payload) {
        const payloadMessage = payload.message;
        if (typeof payloadMessage === "string" && payloadMessage.trim()) {
          message = payloadMessage;
        }
      }
    } catch {
      // Keep the status-based permission message when the SSE endpoint has no JSON body.
    }
    throw new ApiClientError(message, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  const flushEvent = (chunk: string) => {
    const data = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) return;
    const event = JSON.parse(data) as RunEvent;
    onEvent(event);
    if (event.type === "failed") {
      throw new Error(event.message);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const chunks = buffer.split(/\r?\n\r?\n/);
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      flushEvent(chunk);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    flushEvent(buffer);
  }
}

async function waitForCodeRunSnapshot(
  runId: string,
  onEvent: (event: RunEvent) => void,
  projectId: string | null = null,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const snapshot = await readCodeRunSnapshot(runId, projectId);
    if (snapshot.status === "completed") {
      onEvent({ type: "completed", snapshot });
      return;
    }
    if (snapshot.status === "failed") {
      throw new Error(snapshot.errorMessage ?? "代码生成失败");
    }
    onEvent({
      type: "stage_progress",
      stage: snapshot.currentStage ?? "write_code_files",
      progress: snapshot.currentStage ? 70 : 10,
      message: "SSE 已断开，正在通过快照轮询等待代码生成任务",
    });
  }
  throw new Error("代码 SSE 订阅失败，轮询等待超时");
}

async function waitForDocumentRunSnapshot(
  runId: string,
  onEvent: (event: RunEvent) => void,
  projectId: string | null = null,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const snapshot = await readDocumentRunSnapshot(runId, projectId);
    if (snapshot.status === "completed") {
      onEvent({ type: "completed", snapshot });
      return;
    }
    if (snapshot.status === "failed") {
      throw new Error(snapshot.errorMessage ?? "说明书生成失败");
    }
    onEvent({
      type: "stage_progress",
      stage: snapshot.currentStage ?? "generate_document_text",
      progress: snapshot.currentStage === "render_document_file" ? 90 : 55,
      message: "SSE 已断开，正在通过快照轮询等待说明书生成任务",
    });
  }
  throw new Error("说明书 SSE 订阅失败，轮询等待超时");
}

function normalizeProjectHistoryResponse(payload: unknown): RunHistoryItem[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as {
    history?: RunHistoryItem[];
    items?: RunHistoryItem[];
    runs?: Array<Partial<RunHistoryItem> & { snapshot?: RunHistorySnapshot }>;
  };
  const candidates = record.history ?? record.items ?? record.runs ?? [];
  return candidates.filter((item): item is RunHistoryItem => {
    return (
      !!item &&
      typeof item.id === "string" &&
      typeof item.createdAt === "string" &&
      typeof item.title === "string" &&
      typeof item.providerModel === "string" &&
      !!item.snapshot
    );
  });
}

export function createHttpWorkspaceRepository(
  options: WorkspaceRepositoryOptions = {},
): WorkspaceRepository {
  const projectId = normalizeProjectId(options.projectId);
  let localRequirementText = "";
  let localRequirementRules: RequirementRule[] = [];
  let localRequirementBaseline: RequirementBaseline | null = null;
  let projectWorkspace: WorkspaceRecord | null = null;
  let projectWorkspaceVersion = 0;

  async function loadProjectWorkspace() {
    const scopedProjectId = requireProjectScope(projectId);
    const response = await requestJson<ProjectWorkspaceResponse>(
      `/api/projects/${encodeURIComponent(scopedProjectId)}/workspace`,
      withProjectHeaders(scopedProjectId, {
        errorMessage: "读取项目工作台失败",
      }),
    );
    projectWorkspaceVersion = response.version;
    projectWorkspace = mergeWorkspaceState(response.state);
    await hydrateEmptyProjectWorkspaceFromLatestRun();
    return cloneWorkspace(projectWorkspace);
  }

  async function ensureProjectWorkspace() {
    if (projectWorkspace) return projectWorkspace;
    await loadProjectWorkspace();
    return projectWorkspace ?? createEmptyWorkspace();
  }

  async function saveProjectWorkspace(
    workspace: WorkspaceRecord,
    sourceRunId?: string | null,
  ) {
    const scopedProjectId = requireProjectScope(projectId);
    const response = await requestJson<ProjectWorkspaceResponse>(
      `/api/projects/${encodeURIComponent(scopedProjectId)}/workspace`,
      withProjectHeaders(scopedProjectId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseVersion: projectWorkspaceVersion,
          state: stableWorkspaceState(workspace),
          sourceRunId: sourceRunId ?? null,
        }),
        errorMessage: "保存项目工作台失败",
      }),
    );
    projectWorkspaceVersion = response.version;
    projectWorkspace = mergeWorkspaceState(response.state);
    return cloneWorkspace(projectWorkspace);
  }

  async function readProjectRunDetail(runId: string) {
    const scopedProjectId = requireProjectScope(projectId);
    return requestJson<ProjectRunDetailResponse>(
      `/api/projects/${encodeURIComponent(scopedProjectId)}/runs/${encodeURIComponent(runId)}`,
      withProjectHeaders(scopedProjectId, {
        errorMessage: "读取项目运行详情失败",
      }),
    );
  }

  async function readProjectRuns() {
    const scopedProjectId = requireProjectScope(projectId);
    return requestJson<ProjectRunsResponse>(
      `/api/projects/${encodeURIComponent(scopedProjectId)}/runs`,
      withProjectHeaders(scopedProjectId, {
        errorMessage: "读取项目运行历史失败",
      }),
    );
  }

  async function persistSnapshotAsProjectWorkspace(
    snapshot: RunHistorySnapshot,
  ) {
    const current = await ensureProjectWorkspace();
    const next = applySnapshotToWorkspace(current, snapshot);
    try {
      return await saveProjectWorkspace(next, snapshot.runId);
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 409) {
        throw error;
      }
      await loadProjectWorkspace();
      const latest = projectWorkspace ?? createEmptyWorkspace();
      return saveProjectWorkspace(
        applySnapshotToWorkspace(latest, snapshot),
        snapshot.runId,
      );
    }
  }

  async function hydrateEmptyProjectWorkspaceFromLatestRun() {
    if (!projectWorkspace || projectWorkspace.requirementText.trim()) return;
    const runs = (await readProjectRuns()).runs ?? [];
    const candidates = runs
      .filter((run) => run.runId && run.snapshotAvailable && run.canRestore)
      .sort(
        (left, right) =>
          Number(left.documentDownloadAvailable) - Number(right.documentDownloadAvailable),
      );
    for (const run of candidates) {
      const detail = await readProjectRunDetail(run.runId!);
      if (!detail.snapshot || isDocumentRunSnapshot(detail.snapshot)) continue;
      projectWorkspace = applySnapshotToWorkspace(projectWorkspace, detail.snapshot);
      try {
        await saveProjectWorkspace(projectWorkspace, detail.snapshot.runId);
      } catch (error) {
        if (!(error instanceof ApiClientError) || (error.status !== 403 && error.status !== 409)) {
          throw error;
        }
      }
      return;
    }
  }

  return {
    async loadWorkspace() {
      if (projectId) {
        return loadProjectWorkspace();
      }
      const workspace = createEmptyWorkspace();
      workspace.requirementText = localRequirementText;
      workspace.rules = [...localRequirementRules];
      workspace.requirementBaseline = localRequirementBaseline;
      workspace.requirementQualityReport =
        localRequirementBaseline?.qualityReport ?? null;
      return workspace;
    },

    async updateRequirementText(text: string) {
      if (projectId) {
        const workspace = await ensureProjectWorkspace();
        workspace.requirementText = text;
        await saveProjectWorkspace(workspace);
        return;
      }
      localRequirementText = text;
    },

    async updateRequirementRules(rules: RequirementRule[]) {
      if (projectId) {
        const workspace = await ensureProjectWorkspace();
        workspace.rules = [...rules];
        await saveProjectWorkspace(workspace);
        return;
      }
      localRequirementRules = [...rules];
    },

    async updateRequirementBaseline(baseline: RequirementBaseline) {
      if (projectId) {
        const workspace = await ensureProjectWorkspace();
        workspace.requirementBaseline = baseline;
        workspace.requirementQualityReport = baseline.qualityReport;
        await saveProjectWorkspace(workspace);
        return;
      }
      localRequirementBaseline = structuredClone(baseline) as RequirementBaseline;
    },

    async repairRequirementRule(input: RepairRequirementRuleRequest) {
      const scopedProjectId = requireProjectScope(projectId);
      return postJson<RepairRequirementRuleResponse>(
        "/api/runs/requirement-rule-repair",
        {
          ...input,
          projectId: scopedProjectId,
        },
        {
          errorMessage: "智能修复失败",
          headers: projectHeaders(scopedProjectId),
        },
      );
    },

    async startRun(input: StartRunInput) {
      const scopedProjectId = requireProjectScope(projectId);
      return postJson<{ runId: string }>("/api/runs", input, {
        errorMessage: "启动生成失败",
        headers: projectHeaders(scopedProjectId),
      });
    },

    async startDesignRun(input: StartDesignRunInput) {
      const scopedProjectId = requireProjectScope(projectId);
      return postJson<{ runId: string }>("/api/design-runs", input, {
        errorMessage: "启动设计生成失败",
        headers: projectHeaders(scopedProjectId),
      });
    },

    async startCodeRun(input: StartCodeRunInput) {
      const scopedProjectId = requireProjectScope(projectId);
      return postJson<{ runId: string }>("/api/code-runs", input, {
        errorMessage: "启动代码生成失败",
        headers: projectHeaders(scopedProjectId),
      });
    },

    async startDocumentRun(input: StartDocumentRunInput) {
      const scopedProjectId = requireProjectScope(projectId);
      return postJson<{ runId: string }>(
        "/api/document-runs",
        input,
        withProjectHeaders(scopedProjectId, {
          errorMessage: "启动说明书生成失败",
        }),
      );
    },

    async subscribeToRun(runId: string, onEvent: (event: RunEvent) => void) {
      const scopedProjectId = requireProjectScope(projectId);
      if (projectId) {
        try {
          await streamProjectRunEvents(`/api/runs/${runId}/events`, scopedProjectId, onEvent);
          return;
        } catch (error) {
          if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
            throw error;
          }
          const snapshot = await readRunSnapshot(runId, scopedProjectId);
          if (snapshot.status === "failed") {
            throw new Error(snapshot.errorMessage ?? "生成失败");
          }
          if (snapshot.status !== "completed") {
            throw error;
          }
          return;
        }
      }
      const subscription = subscribeToRunEvents(`/api/runs/${runId}/events`, {
        onEvent,
        onError: async () => {
          const snapshot = await readRunSnapshot(runId, projectId);
          if (snapshot.status === "failed") {
            throw new Error(snapshot.errorMessage ?? "生成失败");
          }
          if (snapshot.status !== "completed") {
            throw new Error("SSE 订阅失败");
          }
        },
      });
      await subscription.closed;
    },

    async subscribeToDesignRun(runId: string, onEvent: (event: RunEvent) => void) {
      const scopedProjectId = requireProjectScope(projectId);
      if (projectId) {
        try {
          await streamProjectRunEvents(`/api/design-runs/${runId}/events`, scopedProjectId, onEvent);
          return;
        } catch (error) {
          if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
            throw error;
          }
          const snapshot = await readDesignRunSnapshot(runId, scopedProjectId);
          if (snapshot.status === "failed") {
            throw new Error(snapshot.errorMessage ?? "设计生成失败");
          }
          if (snapshot.status !== "completed") {
            throw error;
          }
          return;
        }
      }
      const subscription = subscribeToRunEvents(
        `/api/design-runs/${runId}/events`,
        {
          onEvent,
          onError: async () => {
            const snapshot = await readDesignRunSnapshot(runId, projectId);
            if (snapshot.status === "failed") {
              throw new Error(snapshot.errorMessage ?? "设计生成失败");
            }
            if (snapshot.status !== "completed") {
              throw new Error("设计 SSE 订阅失败");
            }
          },
        },
      );
      await subscription.closed;
    },

    async subscribeToCodeRun(runId: string, onEvent: (event: RunEvent) => void) {
      const scopedProjectId = requireProjectScope(projectId);
      if (projectId) {
        try {
          await streamProjectRunEvents(`/api/code-runs/${runId}/events`, scopedProjectId, onEvent);
          return;
        } catch (error) {
          if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
            throw error;
          }
          await waitForCodeRunSnapshot(runId, onEvent, scopedProjectId);
          return;
        }
      }
      const subscription = subscribeToRunEvents(`/api/code-runs/${runId}/events`, {
        onEvent,
        onError: () => waitForCodeRunSnapshot(runId, onEvent, projectId),
      });
      await subscription.closed;
    },

    async subscribeToDocumentRun(runId: string, onEvent: (event: RunEvent) => void) {
      const scopedProjectId = requireProjectScope(projectId);
      if (projectId) {
        try {
          await streamProjectRunEvents(`/api/document-runs/${runId}/events`, scopedProjectId, onEvent);
          return;
        } catch (error) {
          if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
            throw error;
          }
          await waitForDocumentRunSnapshot(runId, onEvent, scopedProjectId);
          return;
        }
      }
      const subscription = subscribeToRunEvents(
        `/api/document-runs/${runId}/events`,
        {
          onEvent,
          onError: () => waitForDocumentRunSnapshot(runId, onEvent, projectId),
        },
      );
      await subscription.closed;
    },

    async getRunSnapshot(runId: string) {
      return readRunSnapshot(runId, requireProjectScope(projectId));
    },

    async getDesignRunSnapshot(runId: string) {
      return readDesignRunSnapshot(runId, requireProjectScope(projectId));
    },

    async getCodeRunSnapshot(runId: string) {
      return readCodeRunSnapshot(runId, requireProjectScope(projectId));
    },

    async getDocumentRunSnapshot(runId: string) {
      return readDocumentRunSnapshot(runId, requireProjectScope(projectId));
    },

    async getRunEvidence(runId: string) {
      return readRunEvidencePackage(runId, requireProjectScope(projectId));
    },

    async submitRunReviewDecision(runId, decision) {
      return postRunReviewDecision(runId, decision, requireProjectScope(projectId));
    },

    async listDocuments() {
      return listDocumentLibraryItems(projectId);
    },

    async getOnlyOfficeEditorConfig(
      documentId: string,
      uiTheme?: OnlyOfficeUiTheme,
    ) {
      return readOnlyOfficeEditorConfig(documentId, uiTheme, projectId);
    },

    async downloadDocumentRun(runId: string, defaultFileName?: string) {
      return downloadDocumentRunFile(runId, defaultFileName, projectId);
    },

    async downloadDocument(documentId: string, defaultFileName?: string) {
      return downloadDocumentFile(documentId, defaultFileName, projectId);
    },

    async renderPlantUml(diagramKind, plantUmlSource) {
      const scopedProjectId = requireProjectScope(projectId);
      return postJson<RenderSvgResponse>(
        "/api/render/svg",
        {
          diagramKind,
          plantUmlSource,
        },
        {
          errorMessage: "渲染 PlantUML 失败",
          headers: projectHeaders(scopedProjectId),
        },
      );
    },

    async renderStructuredModel(model) {
      const scopedProjectId = requireProjectScope(projectId);
      return postJson<RenderStructuredModelResponse>(
        "/api/render/model",
        { model },
        {
          errorMessage: "重绘结构化模型失败",
          headers: projectHeaders(scopedProjectId),
        },
      );
    },

    async saveRequirementModelEdit(diagramKind, model, status) {
      const workspace = await ensureProjectWorkspace();
      workspace.models = { ...workspace.models, [diagramKind]: model };
      workspace.manualModelEditStatus = {
        ...workspace.manualModelEditStatus,
        [diagramKind]: status,
      };
      await saveProjectWorkspace(workspace);
    },

    async saveDesignModelEdit(modelId, model, status) {
      const workspace = await ensureProjectWorkspace();
      workspace.designModels = { ...workspace.designModels, [modelId]: model };
      workspace.manualModelEditStatus = {
        ...workspace.manualModelEditStatus,
        [modelId]: status,
      };
      await saveProjectWorkspace(workspace);
    },

    async saveManualModelRerender(key, status, artifact) {
      const workspace = await ensureProjectWorkspace();
      workspace.manualModelEditStatus = {
        ...workspace.manualModelEditStatus,
        [key]: status,
      };
      if (key in workspace.designModels) {
        workspace.designPlantUml = {
          ...workspace.designPlantUml,
          [key]: artifact.plantUmlSource,
        };
        workspace.designSvgArtifacts = {
          ...workspace.designSvgArtifacts,
          [key]: artifact.svgArtifact as DesignSvgArtifact,
        };
      } else {
        const diagramKind = key as DiagramType;
        workspace.plantUml = {
          ...workspace.plantUml,
          [diagramKind]: artifact.plantUmlSource,
        };
        workspace.svgArtifacts = {
          ...workspace.svgArtifacts,
          [diagramKind]: artifact.svgArtifact as SvgArtifact,
        };
      }
      await saveProjectWorkspace(workspace);
    },

    async testProviderSettings(providerSettings) {
      const payload = await postJson<{
        ok?: boolean;
        message?: string;
        capability?: ModelCapability;
      }>("/api/provider/test", providerSettings, {
        errorMessage: "连接测试失败",
      });
      if (!payload.ok || !payload.capability) {
        throw new Error(payload.message ?? "连接测试失败");
      }
      return {
        ok: true,
        message: payload.message ?? "Provider connection ok",
        capability: payload.capability,
      };
    },

    async saveRunHistory(snapshot, meta) {
      if (projectId) {
        await persistSnapshotAsProjectWorkspace(snapshot);
        return {
          id: snapshot.runId,
          createdAt: new Date().toISOString(),
          title: createRunHistoryTitle(snapshot.requirementText),
          snapshot,
          providerModel: meta.providerModel,
          durationMs: meta.durationMs,
        };
      }
      throw new Error(PROJECT_REQUIRED_MESSAGE);
    },

    async listRunHistory() {
      if (projectId) {
        const payload = await readProjectRuns();
        const embeddedHistory = normalizeProjectHistoryResponse(payload);
        if (embeddedHistory.length > 0) return embeddedHistory;
        const runs = payload.runs ?? [];
        const details = await Promise.all(
          runs
            .filter((run) => run.runId && run.snapshotAvailable && run.canRestore !== false)
            .map(async (run) => {
              try {
                const detail = await readProjectRunDetail(run.runId!);
                if (!detail.snapshot) return null;
                return {
                  id: detail.snapshot.runId,
                  createdAt:
                    detail.run?.startedAt ??
                    detail.run?.createdAt ??
                    run.startedAt ??
                    run.updatedAt ??
                    new Date().toISOString(),
                  title: createRunHistoryTitle(detail.snapshot.requirementText),
                  snapshot: detail.snapshot,
                  providerModel: detail.run?.model ?? run.model ?? "默认模型",
                } satisfies RunHistoryItem;
              } catch {
                return null;
              }
            }),
        );
        return details.filter((item): item is RunHistoryItem => Boolean(item));
      }
      throw new Error(PROJECT_REQUIRED_MESSAGE);
    },

    async restoreRunHistory(id) {
      if (projectId) {
        const detail = await readProjectRunDetail(id);
        if (!detail.snapshot) return null;
        await persistSnapshotAsProjectWorkspace(detail.snapshot);
        return {
          id: detail.snapshot.runId,
          createdAt:
            detail.run?.startedAt ??
            detail.run?.createdAt ??
            new Date().toISOString(),
          title: createRunHistoryTitle(detail.snapshot.requirementText),
          snapshot: detail.snapshot,
          providerModel: detail.run?.model ?? "默认模型",
        };
      }
      throw new Error(PROJECT_REQUIRED_MESSAGE);
    },

    async deleteRunHistory(id) {
      if (projectId) {
        await requestJson(
          `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(id)}`,
          withProjectHeaders(projectId, {
            method: "DELETE",
            errorMessage: "删除项目运行历史失败",
          }),
        );
        const history = await readProjectRuns();
        return normalizeProjectHistoryResponse(history);
      }
      throw new Error(PROJECT_REQUIRED_MESSAGE);
    },

    async clearRunHistory() {
      if (projectId) {
        await requestJson(
          `/api/projects/${encodeURIComponent(projectId)}/runs`,
          withProjectHeaders(projectId, {
            method: "DELETE",
            errorMessage: "清空项目运行历史失败",
          }),
        );
        return;
      }
      throw new Error(PROJECT_REQUIRED_MESSAGE);
    },
  };
}

export function createMockWorkspaceRepository(
  seed: Partial<WorkspaceRecord> = {},
  snapshotFactory?: (
    input: StartRunInput,
    runId: string,
  ) => RunSnapshot,
): WorkspaceRepository {
  const defaultWorkspace = createEmptyWorkspace();
  let workspace: WorkspaceRecord = {
    ...defaultWorkspace,
    ...seed,
    models: { ...defaultWorkspace.models, ...seed.models },
    requirementModelTraceability: seed.requirementModelTraceability
      ? [...seed.requirementModelTraceability]
      : [],
    plantUml: { ...defaultWorkspace.plantUml, ...seed.plantUml },
    svgArtifacts: { ...defaultWorkspace.svgArtifacts, ...seed.svgArtifacts },
    diagramVersions: {
      ...defaultWorkspace.diagramVersions,
      ...seed.diagramVersions,
    },
    designModels: { ...defaultWorkspace.designModels, ...seed.designModels },
    designModelTraceability: seed.designModelTraceability
      ? [...seed.designModelTraceability]
      : [],
    designPlantUml: {
      ...defaultWorkspace.designPlantUml,
      ...seed.designPlantUml,
    },
    designSvgArtifacts: {
      ...defaultWorkspace.designSvgArtifacts,
      ...seed.designSvgArtifacts,
    },
    rules: seed.rules ? [...seed.rules] : [],
    selectedDiagramTypes: seed.selectedDiagramTypes
      ? [...seed.selectedDiagramTypes]
      : [],
    generatedDiagramTypes: seed.generatedDiagramTypes
      ? [...seed.generatedDiagramTypes]
      : [],
    diagramErrors: { ...defaultWorkspace.diagramErrors, ...seed.diagramErrors },
    selectedDesignDiagramTypes: seed.selectedDesignDiagramTypes
      ? [...seed.selectedDesignDiagramTypes]
      : [],
    generatedDesignDiagramTypes: seed.generatedDesignDiagramTypes
      ? [...seed.generatedDesignDiagramTypes]
      : [],
    designDiagramErrors: {
      ...defaultWorkspace.designDiagramErrors,
      ...seed.designDiagramErrors,
    },
    manualModelEditStatus: {
      ...defaultWorkspace.manualModelEditStatus,
      ...seed.manualModelEditStatus,
    },
    codeFiles: { ...defaultWorkspace.codeFiles, ...seed.codeFiles },
    codeDependencies: {
      ...defaultWorkspace.codeDependencies,
      ...seed.codeDependencies,
    },
    codeUiMockup: seed.codeUiMockup ?? null,
  };
  const snapshots = new Map<string, RunSnapshot>();
  const designSnapshots = new Map<string, DesignRunSnapshot>();
  const codeSnapshots = new Map<string, CodeRunSnapshot>();
  const documentSnapshots = new Map<string, DocumentRunSnapshot>();
  const documentBuffers = new Map<string, Blob>();
  const documents = new Map<string, DocumentLibraryItem>();

  return {
    async loadWorkspace() {
      return {
        ...workspace,
        rules: [...workspace.rules],
        selectedDiagramTypes: [...workspace.selectedDiagramTypes],
        generatedDiagramTypes: [...workspace.generatedDiagramTypes],
        models: { ...workspace.models },
        requirementModelTraceability: [...workspace.requirementModelTraceability],
        plantUml: { ...workspace.plantUml },
        svgArtifacts: { ...workspace.svgArtifacts },
        diagramErrors: { ...workspace.diagramErrors },
        selectedDesignDiagramTypes: [...workspace.selectedDesignDiagramTypes],
        generatedDesignDiagramTypes: [...workspace.generatedDesignDiagramTypes],
        designModels: { ...workspace.designModels },
        designModelTraceability: [...workspace.designModelTraceability],
        designPlantUml: { ...workspace.designPlantUml },
        designSvgArtifacts: { ...workspace.designSvgArtifacts },
        designDiagramErrors: { ...workspace.designDiagramErrors },
        manualModelEditStatus: { ...workspace.manualModelEditStatus },
        codeSpec: workspace.codeSpec,
        codeBusinessLogic: workspace.codeBusinessLogic,
        codeFiles: { ...workspace.codeFiles },
        codeEntryFile: workspace.codeEntryFile,
        codeDependencies: { ...workspace.codeDependencies },
        codeUiMockup: workspace.codeUiMockup,
        codeAgentPlan: [...workspace.codeAgentPlan],
        codeSkills: [...workspace.codeSkills],
        codeSkillDiagnostics: [...workspace.codeSkillDiagnostics],
        codeSkillResourcePlan: workspace.codeSkillResourcePlan,
        codeSkillContext: workspace.codeSkillContext,
        codeDiagnostics: [...workspace.codeDiagnostics],
        rulesVersion: workspace.rulesVersion,
        rulesBasedOnTextVersion: workspace.rulesBasedOnTextVersion,
        diagramVersions: { ...workspace.diagramVersions },
      };
    },

    async updateRequirementText(text: string) {
      workspace = {
        ...workspace,
        requirementText: text,
      };
    },

    async updateRequirementRules(rules: RequirementRule[]) {
      workspace = {
        ...workspace,
        rules: [...rules],
      };
    },

    async updateRequirementBaseline(baseline: RequirementBaseline) {
      const nextBaseline = structuredClone(baseline) as RequirementBaseline;
      workspace = {
        ...workspace,
        requirementBaseline: nextBaseline,
        requirementQualityReport: nextBaseline.qualityReport,
      };
    },

    async repairRequirementRule() {
      throw new Error("当前环境不支持单项智能修复");
    },

    async startRun(input: StartRunInput) {
      const runId = `run-${Math.random().toString(36).slice(2, 10)}`;
      const snapshot =
        snapshotFactory?.(input, runId) ?? {
          runId,
          requirementText: input.requirementText,
          selectedDiagrams: input.selectedDiagrams,
          rules: input.rules.length > 0 ? input.rules : (workspace.rules as RequirementRule[]),
          models: Object.values(workspace.models),
          requirementModelTraceability: [...workspace.requirementModelTraceability],
          plantUml: Object.entries(workspace.plantUml).map(([diagramKind, source]) => ({
            diagramKind: diagramKind as DiagramType,
            source,
          })),
          svgArtifacts: Object.values(workspace.svgArtifacts),
          diagramErrors: workspace.diagramErrors,
          requirementTrace: [],
          currentStage: "render_svg",
          status: "completed",
          errorMessage: null,
        };
      snapshots.set(runId, snapshot);
      return { runId };
    },

    async startDesignRun(input: StartDesignRunInput) {
      const runId = `design-run-${Math.random().toString(36).slice(2, 10)}`;
      const snapshot: DesignRunSnapshot = {
        runId,
        requirementText: input.requirementText,
        selectedDiagrams: input.selectedDiagrams,
        rules: input.rules,
        requirementModels: input.requirementModels,
        requirementModelTraceability: input.requirementModelTraceability,
        models: Object.values(workspace.designModels),
        designModelTraceability: [...workspace.designModelTraceability],
        plantUml: Object.entries(workspace.designPlantUml).map(([artifactId, source]) => {
          const model = workspace.designModels[artifactId];
          const svgArtifact = workspace.designSvgArtifacts[artifactId];
          const diagramKind =
            model?.diagramKind ?? svgArtifact?.diagramKind ?? (artifactId as DesignDiagramType);
          return {
            diagramKind,
            modelId: model?.modelId ?? svgArtifact?.modelId,
            source,
          };
        }),
        svgArtifacts: Object.values(workspace.designSvgArtifacts),
        diagramErrors: workspace.designDiagramErrors,
        designTrace: [],
        currentStage: "render_svg",
        status: "completed",
        errorMessage: null,
      };
      designSnapshots.set(runId, snapshot);
      return { runId };
    },

    async startCodeRun(input: StartCodeRunInput) {
      const runId = `code-run-${Math.random().toString(36).slice(2, 10)}`;
      const mergedFiles =
        input.generationMode === "regenerate"
          ? {
              "/src/App.tsx":
                workspace.codeFiles["/src/App.tsx"] ??
                "export default function App() { return <main>重新生成的原型</main>; }",
            }
          : {
              ...workspace.codeFiles,
              ...input.existingFiles,
            };
      const snapshot: CodeRunSnapshot = {
        runId,
        requirementText: input.requirementText,
        rules: input.rules,
        designModels: input.designModels,
        designPlantUml: input.designPlantUml,
        spec: workspace.codeSpec,
        loadedCodeSkill: null,
        skillResourcePlan: null,
        codeSkillContext: null,
        appBlueprint: workspace.codeSpec?.appBlueprint ?? null,
        businessLogic: workspace.codeBusinessLogic,
        uiBlueprint: workspace.codeSpec?.uiBlueprint ?? null,
        uiMockup: null,
        uiReferenceSpec: null,
        uiFidelityReport: null,
        designTokens: null,
        componentRegistry: null,
        uiIr: null,
        visualDiffReport: null,
        repairLoopSummary: null,
        selectedCodeSkills: [],
        skillDiagnostics: [],
        filePlan: workspace.codeSpec?.filePlan ?? null,
        codeImplementationBrief: null,
        codeFileOperationManifest: null,
        fileGenerationDiagnostics: [],
        codeTrace: [],
        codeGenerationMode: "json_schema_operations",
        qualityDiagnostics: [],
        files: mergedFiles,
        entryFile: workspace.codeEntryFile,
        dependencies: workspace.codeDependencies,
        agentPlan: ["写入骨架", "生成核心界面", "检查预览入口"],
        generationMode: input.generationMode,
        changedFileCount: 0,
        diagnostics: [],
        codeContextHash: "mock",
        currentStage: "write_code_files",
        status: "completed",
        errorMessage: null,
      };
      codeSnapshots.set(runId, snapshot);
      return { runId };
    },

    async startDocumentRun(input: StartDocumentRunInput) {
      const runId = `document-run-${Math.random().toString(36).slice(2, 10)}`;
      const fileName = documentFileName(input.documentKind);
      const documentId = `doc-${input.documentKind}-${Math.random().toString(36).slice(2, 10)}`;
      const snapshot: DocumentRunSnapshot = {
        runId,
        documentKind: input.documentKind,
        requirementText: input.requirementText,
        documentId,
        sections: [
          { level: 1, title: "1 引言", body: ["Mock 说明书正文。"] },
          { level: 2, title: "1.1 编写目的", body: ["用于验证说明书生成流程。"] },
          { level: 3, title: "1.1.1 范围", body: ["当前为 Mock 快照。"] },
        ],
        fileName,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: 12,
        missingArtifacts: [],
        currentStage: "render_document_file",
        status: "completed",
        errorMessage: null,
      };
      const now = new Date().toISOString();
      documents.set(documentId, {
        id: documentId,
        workspaceId: "mock-workspace",
        documentKind: input.documentKind,
        title:
          input.documentKind === "requirementsSpec"
            ? "需求规格说明书"
            : "软件设计说明书",
        fileName,
        mimeType: snapshot.mimeType ?? "application/octet-stream",
        byteLength: snapshot.byteLength,
        version: 1,
        sourceRunId: runId,
        createdAt: now,
        updatedAt: now,
      });
      documentSnapshots.set(runId, snapshot);
      documentBuffers.set(
        runId,
        new Blob(["mock document"], {
          type: snapshot.mimeType ?? "application/octet-stream",
        }),
      );
      return { runId };
    },

    async subscribeToRun(runId, onEvent) {
      const snapshot = snapshots.get(runId);
      if (!snapshot) {
        throw new Error("Mock run not found");
      }
      onEvent({ type: "queued" });
      if (snapshot.rules.length > 0) {
        onEvent({
          type: "stage_started",
          stage: "extract_rules",
        });
      }
      onEvent({ type: "completed", snapshot });
    },

    async subscribeToCodeRun(runId, onEvent) {
      const snapshot = codeSnapshots.get(runId);
      if (!snapshot) {
        throw new Error("Mock code run not found");
      }
      onEvent({ type: "queued" });
      onEvent({
        type: "stage_started",
        stage: "plan_code",
      });
      onEvent({
        type: "stage_started",
        stage: "write_code_files",
      });
      onEvent({
        type: "code_file_changed",
        path: "/src/App.tsx",
        content: snapshot.files["/src/App.tsx"] ?? "export default function App() { return null; }",
        reason: "Mock 生成器写入入口组件",
      });
      onEvent({ type: "completed", snapshot });
    },

    async subscribeToDocumentRun(runId, onEvent) {
      const snapshot = documentSnapshots.get(runId);
      if (!snapshot) {
        throw new Error("Mock document run not found");
      }
      onEvent({ type: "queued" });
      onEvent({ type: "stage_started", stage: "generate_document_text" });
      onEvent({
        type: "stage_progress",
        stage: "generate_document_text",
        progress: 55,
        message: "正在生成说明书正文",
      });
      onEvent({ type: "stage_started", stage: "render_document_file" });
      onEvent({
        type: "artifact_ready",
        stage: "render_document_file",
        artifactKind: "document",
      });
      onEvent({ type: "completed", snapshot });
    },

    async subscribeToDesignRun(runId, onEvent) {
      const snapshot = designSnapshots.get(runId);
      if (!snapshot) {
        throw new Error("Mock design run not found");
      }
      onEvent({ type: "queued" });
      onEvent({
        type: "stage_started",
        stage: "generate_design_sequence",
      });
      onEvent({ type: "completed", snapshot });
    },

    async getRunSnapshot(runId) {
      const snapshot = snapshots.get(runId);
      if (!snapshot) {
        throw new Error("Mock run not found");
      }
      const { modelMap, plantUmlMap, svgMap } = mapSnapshotToRecords(snapshot);
      workspace = {
        ...workspace,
        requirementText: snapshot.requirementText,
        selectedDiagramTypes: [...snapshot.selectedDiagrams],
        generatedDiagramTypes: [...snapshot.selectedDiagrams],
        rules: [...snapshot.rules],
        requirementBaseline: snapshot.requirementBaseline ?? workspace.requirementBaseline,
        requirementQualityReport:
          snapshot.requirementBaseline?.qualityReport ??
          workspace.requirementQualityReport,
        models: modelMap,
        plantUml: plantUmlMap,
        svgArtifacts: svgMap,
        diagramErrors: snapshot.diagramErrors,
      };
      return snapshot;
    },

    async getDesignRunSnapshot(runId) {
      const snapshot = designSnapshots.get(runId);
      if (!snapshot) {
        throw new Error("Mock design run not found");
      }
      const { modelMap, plantUmlMap, svgMap } = mapDesignSnapshotToRecords(snapshot);
      workspace = {
        ...workspace,
        selectedDesignDiagramTypes: [...snapshot.selectedDiagrams],
        generatedDesignDiagramTypes: Array.from(
          new Set([
            ...workspace.generatedDesignDiagramTypes,
            ...snapshot.selectedDiagrams,
          ]),
        ),
        designModels: { ...workspace.designModels, ...modelMap },
        designPlantUml: { ...workspace.designPlantUml, ...plantUmlMap },
        designSvgArtifacts: { ...workspace.designSvgArtifacts, ...svgMap },
        designDiagramErrors: {
          ...workspace.designDiagramErrors,
          ...snapshot.diagramErrors,
        },
      };
      return snapshot;
    },

    async getCodeRunSnapshot(runId) {
      const snapshot = codeSnapshots.get(runId);
      if (!snapshot) {
        throw new Error("Mock code run not found");
      }
      workspace = {
        ...workspace,
        codeSpec: snapshot.spec,
        codeFiles: { ...snapshot.files },
        codeEntryFile: snapshot.entryFile,
        codeDependencies: { ...snapshot.dependencies },
        codeUiMockup: snapshot.uiMockup,
        codeAgentPlan: [...snapshot.agentPlan],
        codeSkills: [...snapshot.selectedCodeSkills],
        codeSkillDiagnostics: [...snapshot.skillDiagnostics],
        codeSkillResourcePlan: snapshot.skillResourcePlan,
        codeSkillContext: snapshot.codeSkillContext,
        codeDiagnostics: [...snapshot.diagnostics],
      };
      return snapshot;
    },

    async getDocumentRunSnapshot(runId) {
      const snapshot = documentSnapshots.get(runId);
      if (!snapshot) {
        throw new Error("Mock document run not found");
      }
      return snapshot;
    },

    async getRunEvidence(runId) {
      const snapshot =
        snapshots.get(runId) ??
        designSnapshots.get(runId) ??
        codeSnapshots.get(runId) ??
        documentSnapshots.get(runId);
      if (!snapshot?.evidencePackage) {
        throw new Error("Mock evidence package not found");
      }
      return snapshot.evidencePackage;
    },

    async submitRunReviewDecision(runId, decision) {
      const snapshot =
        snapshots.get(runId) ??
        designSnapshots.get(runId) ??
        codeSnapshots.get(runId) ??
        documentSnapshots.get(runId);
      if (!snapshot?.evidencePackage) {
        throw new Error("Mock evidence package not found");
      }
      const resolved = {
        ...snapshot.evidencePackage,
        status: "complete" as const,
        reviewItems: snapshot.evidencePackage.reviewItems.map((item) =>
          item.id === decision.reviewItemId
            ? {
                ...item,
                status: "resolved" as const,
                decision: {
                  id: "DEC-MOCK",
                  reviewItemId: decision.reviewItemId,
                  decision: decision.decision,
                  comment: decision.comment,
                  decidedAt: new Date().toISOString(),
                },
              }
            : item,
        ),
        reviewDecisions: [
          ...snapshot.evidencePackage.reviewDecisions.filter(
            (item) => item.reviewItemId !== decision.reviewItemId,
          ),
          {
            id: "DEC-MOCK",
            reviewItemId: decision.reviewItemId,
            decision: decision.decision,
            comment: decision.comment,
            decidedAt: new Date().toISOString(),
          },
        ],
      };
      snapshot.evidencePackage = resolved;
      return resolved;
    },

    async listDocuments() {
      return Array.from(documents.values()).sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
    },

    async getOnlyOfficeEditorConfig(documentId, uiTheme = "theme-dark") {
      const document = documents.get(documentId);
      if (!document) {
        throw new Error("Mock document not found");
      }
      return {
        document,
        documentServerUrl: "http://127.0.0.1:8080",
        config: {
          documentType: "word",
          document: {
            fileType: "docx",
            key: `${document.id}-v${document.version}`,
            title: document.fileName,
            url: `/api/documents/${document.id}/file`,
          },
          editorConfig: {
            callbackUrl: `/api/documents/${document.id}/onlyoffice/callback`,
            mode: "edit",
            lang: "zh-CN",
            customization: {
              uiTheme,
            },
          },
        },
      };
    },

    async downloadDocumentRun(runId, defaultFileName) {
      const snapshot = documentSnapshots.get(runId);
      const blob = documentBuffers.get(runId);
      if (!snapshot || !blob) {
        throw new Error("Mock document file not found");
      }
      return {
        blob,
        fileName: snapshot.fileName ?? defaultFileName ?? "说明书.docx",
      };
    },

    async downloadDocument(documentId, defaultFileName) {
      const document = documents.get(documentId);
      const runId = document?.sourceRunId;
      const blob = runId ? documentBuffers.get(runId) : null;
      if (!document || !blob) {
        throw new Error("Mock document file not found");
      }
      return {
        blob,
        fileName: document.fileName ?? defaultFileName ?? "说明书.docx",
      };
    },

    async renderPlantUml(diagramKind, plantUmlSource) {
      return {
        svg: `<svg><text>${diagramKind}</text></svg>`,
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: plantUmlSource.length,
          durationMs: 1,
        },
      };
    },

    async renderStructuredModel(model) {
      const source = `@startuml\n' ${model.title}\n@enduml`;
      return {
        plantUmlSource: source,
        svg: `<svg><text>${model.diagramKind}</text></svg>`,
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: source.length,
          durationMs: 1,
        },
      };
    },

    async saveRequirementModelEdit(diagramKind, model, status) {
      workspace = {
        ...workspace,
        models: { ...workspace.models, [diagramKind]: model },
        manualModelEditStatus: {
          ...workspace.manualModelEditStatus,
          [diagramKind]: status,
        },
      };
    },

    async saveDesignModelEdit(modelId, model, status) {
      workspace = {
        ...workspace,
        designModels: { ...workspace.designModels, [modelId]: model },
        manualModelEditStatus: {
          ...workspace.manualModelEditStatus,
          [modelId]: status,
        },
      };
    },

    async saveManualModelRerender(key, status, artifact) {
      const isDesign = key in workspace.designModels;
      workspace = {
        ...workspace,
        manualModelEditStatus: {
          ...workspace.manualModelEditStatus,
          [key]: status,
        },
        ...(isDesign
          ? {
              designPlantUml: {
                ...workspace.designPlantUml,
                [key]: artifact.plantUmlSource,
              },
              designSvgArtifacts: {
                ...workspace.designSvgArtifacts,
                [key]: artifact.svgArtifact as DesignSvgArtifact,
              },
            }
          : {
              plantUml: {
                ...workspace.plantUml,
                [key as DiagramType]: artifact.plantUmlSource,
              },
              svgArtifacts: {
                ...workspace.svgArtifacts,
                [key as DiagramType]: artifact.svgArtifact as SvgArtifact,
              },
            }),
      };
    },

    async testProviderSettings() {
      return {
        ok: true,
        message: "Provider connection ok",
        capability: {
          supportsJsonSchema: true,
          modeLabel: "严格结构化",
        },
      };
    },

    async saveRunHistory(snapshot, meta) {
      return saveRunHistoryItem(snapshot, meta);
    },

    async listRunHistory() {
      return loadRunHistory();
    },

    async restoreRunHistory(id) {
      return loadRunHistory().find((item) => item.id === id) ?? null;
    },

    async deleteRunHistory(id) {
      return deleteRunHistoryItem(id);
    },

    async clearRunHistory() {
      clearRunHistoryItems();
    },
  };
}

const WorkspaceRepositoryContext = createContext<WorkspaceRepository | null>(null);
const defaultWorkspaceRepository = createHttpWorkspaceRepository();

export function WorkspaceRepositoryProvider({
  children,
  repository,
  projectId,
}: {
  children: ReactNode;
  repository?: WorkspaceRepository;
  projectId?: string | null;
}) {
  const [routeProjectId, setRouteProjectId] = useState(() =>
    typeof window === "undefined" ? null : getProjectIdFromPath(window.location.pathname),
  );

  useEffect(() => {
    if (projectId !== undefined) return;
    const syncProjectId = () => {
      setRouteProjectId(getProjectIdFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", syncProjectId);
    window.addEventListener("uml-route-change", syncProjectId);
    return () => {
      window.removeEventListener("popstate", syncProjectId);
      window.removeEventListener("uml-route-change", syncProjectId);
    };
  }, [projectId]);

  const scopedProjectId = normalizeProjectId(
    projectId === undefined ? routeProjectId : projectId,
  );
  const value = useMemo(
    () =>
      repository ??
      (scopedProjectId
        ? createHttpWorkspaceRepository({ projectId: scopedProjectId })
        : defaultWorkspaceRepository),
    [repository, scopedProjectId],
  );

  return (
    <WorkspaceRepositoryContext.Provider value={value}>
      {children}
    </WorkspaceRepositoryContext.Provider>
  );
}

export function useWorkspaceRepository() {
  const value = useContext(WorkspaceRepositoryContext);
  if (!value) {
    throw new Error(
      "useWorkspaceRepository must be used within WorkspaceRepositoryProvider",
    );
  }
  return value;
}

export function createStartRunInput(
  requirementText: string,
  selectedDiagrams: DiagramType[],
  rules: RequirementRule[] = [],
): StartRunInput {
  const settings = loadUserSettings();
  const rawApiBaseUrl = settings.apiBaseUrl.trim();
  const apiKey = settings.apiKey.trim();
  const providerConfigId = settings.providerConfigId.trim();
  const model = settings.defaultModel.trim();

  if (!model) {
    throw new Error("请先在设置中选择默认模型");
  }
  if (providerConfigId) {
    return {
      requirementText,
      selectedDiagrams,
      rules,
      providerSettings: {
        providerConfigId,
        model,
      },
    };
  }

  if (!rawApiBaseUrl) {
    throw new Error("请先在设置中选择托管供应商配置，或在显式 legacy/dev 备选中填写 API Base URL");
  }
  let apiBaseUrl = "";
  try {
    apiBaseUrl = normalizeApiBaseUrl(rawApiBaseUrl);
  } catch {
    throw new Error("设置中的 API Base URL 不是合法地址");
  }
  if (!apiKey) {
    throw new Error("请先在设置中选择托管供应商配置，或在显式 legacy/dev 备选中填写 API Key");
  }

  return {
    requirementText,
    selectedDiagrams,
    rules,
    providerSettings: {
      apiBaseUrl,
      apiKey,
      model,
    },
  };
}

export function createStartDesignRunInput(
  requirementText: string,
  rules: RequirementRule[],
  requirementModels: DiagramModelSpec[],
  requirementModelTraceability: RequirementModelTraceabilityEntry[],
  selectedDiagrams: DesignDiagramType[],
  existingDesignModels: DesignDiagramModelSpec[] = [],
  existingDesignModelTraceability: DesignModelTraceabilityEntry[] = [],
  existingDesignPlantUml: DesignPlantUmlArtifact[] = [],
  existingDesignSvgArtifacts: DesignSvgArtifact[] = [],
): StartDesignRunInput {
  const base = createStartRunInput(requirementText, []);
  return {
    requirementText,
    rules,
    requirementModels,
    requirementModelTraceability,
    selectedDiagrams,
    existingDesignModels,
    existingDesignModelTraceability,
    existingDesignPlantUml,
    existingDesignSvgArtifacts,
    providerSettings: base.providerSettings,
  };
}

export function createStartCodeRunInput(
  requirementText: string,
  rules: RequirementRule[],
  designModels: DesignDiagramModelSpec[],
  designPlantUml: DesignPlantUmlArtifact[] = [],
  existingFiles: Record<string, string> = {},
  generationMode: "continue" | "regenerate" = "continue",
): StartCodeRunInput {
  const base = createStartRunInput(requirementText, []);
  return {
    requirementText,
    rules,
    designModels,
    designPlantUml,
    existingFiles: generationMode === "regenerate" ? {} : existingFiles,
    generationMode,
    providerSettings: base.providerSettings,
  };
}

export function createStartDocumentRunInput(
  documentKind: DocumentKind,
  requirementText: string,
  rules: RequirementRule[],
  requirementModels: DiagramModelSpec[],
  requirementPlantUml: PlantUmlArtifact[],
  requirementSvgArtifacts: SvgArtifact[],
  designModels: DesignDiagramModelSpec[],
  designPlantUml: DesignPlantUmlArtifact[],
  designSvgArtifacts: DesignSvgArtifact[],
  documentStyle?: DocumentStyleSettings,
): StartDocumentRunInput {
  const base = createStartRunInput(requirementText, []);
  return {
    documentKind,
    requirementText,
    rules,
    requirementModels,
    requirementPlantUml,
    requirementSvgArtifacts,
    designModels,
    designPlantUml,
    designSvgArtifacts,
    providerSettings: base.providerSettings,
    useAiText: true,
    documentStyle,
  };
}
