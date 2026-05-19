import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type {
  DesignDiagramModelSpec,
  CodeRunSnapshot,
  DocumentKind,
  DocumentStyleSettings,
  DocumentRunSnapshot,
  DesignPlantUmlArtifact,
  DesignRunSnapshot,
  DesignSvgArtifact,
  DiagramModelSpec,
  PlantUmlArtifact,
  ProviderSettings,
  RenderSvgResponse,
  RunEvent,
  RunSnapshot,
  SvgArtifact,
} from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "../../entities/diagram/model";
import type { WorkspaceRecord } from "../../entities/workspace/model";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import {
  loadUserSettings,
  normalizeApiBaseUrl,
} from "../../shared/lib/user-settings";
import type { ModelCapability } from "../../shared/lib/model-catalog";
import {
  ApiClientError,
  downloadBlob,
  postJson,
  requestJson,
} from "../api-client";
import { subscribeToRunEvents } from "../sse-client";
import {
  clearRunHistoryItems,
  deleteRunHistoryItem,
  loadRunHistory,
  saveRunHistoryItem,
  type RunHistoryItem,
  type RunHistorySnapshot,
} from "../../features/history";

export { buildApiUrl } from "../api-client";

export interface ProviderSettingsInput {
  apiBaseUrl: ProviderSettings["apiBaseUrl"];
  apiKey: ProviderSettings["apiKey"];
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
  requirementModels: DiagramModelSpec[];
  selectedDiagrams: DesignDiagramType[];
  providerSettings: ProviderSettingsInput;
}

export interface StartCodeRunInput {
  requirementText: string;
  rules: RequirementRule[];
  designModels: DesignDiagramModelSpec[];
  designPlantUml: DesignPlantUmlArtifact[];
  existingFiles: Record<string, string>;
  generationMode: "continue" | "regenerate";
  providerSettings: ProviderSettingsInput;
}

export interface StartDocumentRunInput {
  documentKind: DocumentKind;
  requirementText: string;
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
  downloadDocumentRun?(
    runId: string,
    defaultFileName?: string,
  ): Promise<{ blob: Blob; fileName: string }>;
  renderPlantUml(
    diagramKind: DiagramType,
    plantUmlSource: string,
  ): Promise<RenderSvgResponse>;
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
    models: {},
    generatedDiagramTypes: [],
    plantUml: {},
    svgArtifacts: {},
    diagramErrors: {},
    selectedDesignDiagramTypes: [],
    designModels: {},
    generatedDesignDiagramTypes: [],
    designPlantUml: {},
    designSvgArtifacts: {},
    designDiagramErrors: {},
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
      snapshot.models.map((model) => [model.diagramKind, model]),
    ) as Partial<Record<DesignDiagramType, DesignDiagramModelSpec>>,
    plantUmlMap: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [artifact.diagramKind, artifact.source]),
    ) as Partial<Record<DesignDiagramType, string>>,
    svgMap: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [artifact.diagramKind, artifact]),
    ) as Partial<Record<DesignDiagramType, DesignSvgArtifact>>,
  };
}

async function readRunSnapshot(runId: string) {
  return requestJson<RunSnapshot>(`/api/runs/${runId}`, {
    errorMessage: "读取运行快照失败",
  });
}

async function readDesignRunSnapshot(runId: string) {
  return requestJson<DesignRunSnapshot>(`/api/design-runs/${runId}`, {
    errorMessage: "读取设计运行快照失败",
  });
}

async function readCodeRunSnapshot(runId: string) {
  try {
    return await requestJson<CodeRunSnapshot>(`/api/code-runs/${runId}`, {
      errorMessage: "读取代码运行快照失败",
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      throw new Error("代码生成任务已丢失，可能是本地 API 服务重启，请重新生成");
    }
    throw error;
  }
}

async function readDocumentRunSnapshot(runId: string) {
  return requestJson<DocumentRunSnapshot>(`/api/document-runs/${runId}`, {
    errorMessage: "读取说明书运行快照失败",
  });
}

async function downloadDocumentRunFile(runId: string, defaultFileName?: string) {
  return downloadBlob(`/api/document-runs/${runId}/download`, {
    errorMessage: "下载说明书失败",
    defaultFileName: defaultFileName ?? "说明书.docx",
  });
}

async function waitForCodeRunSnapshot(
  runId: string,
  onEvent: (event: RunEvent) => void,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const snapshot = await readCodeRunSnapshot(runId);
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
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const snapshot = await readDocumentRunSnapshot(runId);
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

export function createHttpWorkspaceRepository(): WorkspaceRepository {
  let localRequirementText = "";
  let localRequirementRules: RequirementRule[] = [];

  return {
    async loadWorkspace() {
      const workspace = createEmptyWorkspace();
      workspace.requirementText = localRequirementText;
      workspace.rules = [...localRequirementRules];
      return workspace;
    },

    async updateRequirementText(text: string) {
      localRequirementText = text;
    },

    async updateRequirementRules(rules: RequirementRule[]) {
      localRequirementRules = [...rules];
    },

    async startRun(input: StartRunInput) {
      return postJson<{ runId: string }>("/api/runs", input, {
        errorMessage: "启动生成失败",
      });
    },

    async startDesignRun(input: StartDesignRunInput) {
      return postJson<{ runId: string }>("/api/design-runs", input, {
        errorMessage: "启动设计生成失败",
      });
    },

    async startCodeRun(input: StartCodeRunInput) {
      return postJson<{ runId: string }>("/api/code-runs", input, {
        errorMessage: "启动代码生成失败",
      });
    },

    async startDocumentRun(input: StartDocumentRunInput) {
      return postJson<{ runId: string }>("/api/document-runs", input, {
        errorMessage: "启动说明书生成失败",
      });
    },

    async subscribeToRun(runId: string, onEvent: (event: RunEvent) => void) {
      const subscription = subscribeToRunEvents(`/api/runs/${runId}/events`, {
        onEvent,
        onError: async () => {
          const snapshot = await readRunSnapshot(runId);
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
      const subscription = subscribeToRunEvents(
        `/api/design-runs/${runId}/events`,
        {
          onEvent,
          onError: async () => {
            const snapshot = await readDesignRunSnapshot(runId);
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
      const subscription = subscribeToRunEvents(`/api/code-runs/${runId}/events`, {
        onEvent,
        onError: () => waitForCodeRunSnapshot(runId, onEvent),
      });
      await subscription.closed;
    },

    async subscribeToDocumentRun(runId: string, onEvent: (event: RunEvent) => void) {
      const subscription = subscribeToRunEvents(
        `/api/document-runs/${runId}/events`,
        {
          onEvent,
          onError: () => waitForDocumentRunSnapshot(runId, onEvent),
        },
      );
      await subscription.closed;
    },

    async getRunSnapshot(runId: string) {
      return readRunSnapshot(runId);
    },

    async getDesignRunSnapshot(runId: string) {
      return readDesignRunSnapshot(runId);
    },

    async getCodeRunSnapshot(runId: string) {
      return readCodeRunSnapshot(runId);
    },

    async getDocumentRunSnapshot(runId: string) {
      return readDocumentRunSnapshot(runId);
    },

    async downloadDocumentRun(runId: string, defaultFileName?: string) {
      return downloadDocumentRunFile(runId, defaultFileName);
    },

    async renderPlantUml(diagramKind, plantUmlSource) {
      return postJson<RenderSvgResponse>("/api/render/svg", {
        diagramKind,
        plantUmlSource,
      }, {
        errorMessage: "渲染 PlantUML 失败",
      });
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
    plantUml: { ...defaultWorkspace.plantUml, ...seed.plantUml },
    svgArtifacts: { ...defaultWorkspace.svgArtifacts, ...seed.svgArtifacts },
    diagramVersions: {
      ...defaultWorkspace.diagramVersions,
      ...seed.diagramVersions,
    },
    designModels: { ...defaultWorkspace.designModels, ...seed.designModels },
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

  return {
    async loadWorkspace() {
      return {
        ...workspace,
        rules: [...workspace.rules],
        selectedDiagramTypes: [...workspace.selectedDiagramTypes],
        generatedDiagramTypes: [...workspace.generatedDiagramTypes],
        models: { ...workspace.models },
        plantUml: { ...workspace.plantUml },
        svgArtifacts: { ...workspace.svgArtifacts },
        diagramErrors: { ...workspace.diagramErrors },
        selectedDesignDiagramTypes: [...workspace.selectedDesignDiagramTypes],
        generatedDesignDiagramTypes: [...workspace.generatedDesignDiagramTypes],
        designModels: { ...workspace.designModels },
        designPlantUml: { ...workspace.designPlantUml },
        designSvgArtifacts: { ...workspace.designSvgArtifacts },
        designDiagramErrors: { ...workspace.designDiagramErrors },
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

    async startRun(input: StartRunInput) {
      const runId = `run-${Math.random().toString(36).slice(2, 10)}`;
      const snapshot =
        snapshotFactory?.(input, runId) ?? {
          runId,
          requirementText: input.requirementText,
          selectedDiagrams: input.selectedDiagrams,
          rules: input.rules.length > 0 ? input.rules : (workspace.rules as RequirementRule[]),
          models: Object.values(workspace.models),
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
        models: Object.values(workspace.designModels),
        plantUml: Object.entries(workspace.designPlantUml).map(([diagramKind, source]) => ({
          diagramKind: diagramKind as DesignDiagramType,
          source,
        })),
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
      const fileName =
        input.documentKind === "requirementsSpec"
          ? "需求规格说明书.docx"
          : "软件设计说明书.docx";
      const snapshot: DocumentRunSnapshot = {
        runId,
        documentKind: input.documentKind,
        requirementText: input.requirementText,
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
        generatedDesignDiagramTypes: [...snapshot.selectedDiagrams],
        designModels: modelMap,
        designPlantUml: plantUmlMap,
        designSvgArtifacts: svgMap,
        designDiagramErrors: snapshot.diagramErrors,
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
}: {
  children: ReactNode;
  repository?: WorkspaceRepository;
}) {
  const value = useMemo(
    () => repository ?? defaultWorkspaceRepository,
    [repository],
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
  const model = settings.defaultModel.trim();

  if (!rawApiBaseUrl) {
    throw new Error("请先在设置中填写 API Base URL");
  }
  let apiBaseUrl = "";
  try {
    apiBaseUrl = normalizeApiBaseUrl(rawApiBaseUrl);
  } catch {
    throw new Error("设置中的 API Base URL 不是合法地址");
  }
  if (!apiKey) {
    throw new Error("请先在设置中填写 API Key");
  }
  if (!model) {
    throw new Error("请先在设置中选择默认模型");
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
  selectedDiagrams: DesignDiagramType[],
): StartDesignRunInput {
  const base = createStartRunInput(requirementText, []);
  return {
    requirementText,
    rules,
    requirementModels,
    selectedDiagrams,
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
