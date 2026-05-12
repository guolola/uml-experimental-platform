import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type {
  DesignDiagramModelSpec,
  DesignRunSnapshot,
  DesignSvgArtifact,
  DiagramModelSpec,
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
  clearRunHistoryItems,
  deleteRunHistoryItem,
  loadRunHistory,
  saveRunHistoryItem,
  type RunHistoryItem,
} from "../../features/history";

const APP_API_BASE_URL =
  import.meta.env.VITE_APP_API_BASE_URL ?? "http://127.0.0.1:4001";
const API_PATH_PREFIX = "/api";

export function buildApiUrl(path: string, baseUrl = APP_API_BASE_URL) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

  if (!normalizedBaseUrl) {
    return normalizedPath;
  }

  if (
    normalizedBaseUrl.endsWith(API_PATH_PREFIX) &&
    (normalizedPath === API_PATH_PREFIX ||
      normalizedPath.startsWith(`${API_PATH_PREFIX}/`))
  ) {
    const pathWithoutApiPrefix = normalizedPath.slice(API_PATH_PREFIX.length);
    return `${normalizedBaseUrl}${pathWithoutApiPrefix || "/"}`;
  }

  return `${normalizedBaseUrl}${normalizedPath}`;
}

export interface ProviderSettingsInput {
  apiBaseUrl: ProviderSettings["apiBaseUrl"];
  apiKey: ProviderSettings["apiKey"];
  model: ProviderSettings["model"];
}

export interface StartRunInput {
  requirementText: string;
  selectedDiagrams: DiagramType[];
  providerSettings: ProviderSettingsInput;
}

export interface StartDesignRunInput {
  requirementText: string;
  rules: RequirementRule[];
  requirementModels: DiagramModelSpec[];
  selectedDiagrams: DesignDiagramType[];
  providerSettings: ProviderSettingsInput;
}

export interface WorkspaceRepository {
  loadWorkspace(): Promise<WorkspaceRecord>;
  updateRequirementText(text: string): Promise<void>;
  startRun(input: StartRunInput): Promise<{ runId: string }>;
  startDesignRun?(input: StartDesignRunInput): Promise<{ runId: string }>;
  subscribeToRun(
    runId: string,
    onEvent: (event: RunEvent) => void,
  ): Promise<void>;
  subscribeToDesignRun?(
    runId: string,
    onEvent: (event: RunEvent) => void,
  ): Promise<void>;
  getRunSnapshot(runId: string): Promise<RunSnapshot>;
  getDesignRunSnapshot?(runId: string): Promise<DesignRunSnapshot>;
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
    snapshot: RunSnapshot,
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
    name: "UML 实验平台",
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
  const response = await fetch(buildApiUrl(`/api/runs/${runId}`));
  if (!response.ok) {
    throw new Error(`读取运行快照失败：HTTP ${response.status}`);
  }
  return (await response.json()) as RunSnapshot;
}

async function readDesignRunSnapshot(runId: string) {
  const response = await fetch(buildApiUrl(`/api/design-runs/${runId}`));
  if (!response.ok) {
    throw new Error(`读取设计运行快照失败：HTTP ${response.status}`);
  }
  return (await response.json()) as DesignRunSnapshot;
}

export function createHttpWorkspaceRepository(): WorkspaceRepository {
  let localRequirementText = "";

  return {
    async loadWorkspace() {
      const workspace = createEmptyWorkspace();
      workspace.requirementText = localRequirementText;
      return workspace;
    },

    async updateRequirementText(text: string) {
      localRequirementText = text;
    },

    async startRun(input: StartRunInput) {
      const response = await fetch(buildApiUrl("/api/runs"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        let message = `启动生成失败：HTTP ${response.status}`;
        try {
          const payload = (await response.json()) as { message?: string };
          if (payload.message) {
            message = payload.message;
          }
        } catch {
          // Ignore non-JSON error payloads and fall back to status text.
        }
        throw new Error(message);
      }

      return (await response.json()) as { runId: string };
    },

    async startDesignRun(input: StartDesignRunInput) {
      const response = await fetch(buildApiUrl("/api/design-runs"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        let message = `启动设计生成失败：HTTP ${response.status}`;
        try {
          const payload = (await response.json()) as { message?: string };
          if (payload.message) {
            message = payload.message;
          }
        } catch {
          // Ignore non-JSON error payloads and fall back to status text.
        }
        throw new Error(message);
      }

      return (await response.json()) as { runId: string };
    },

    async subscribeToRun(runId: string, onEvent: (event: RunEvent) => void) {
      await new Promise<void>((resolve, reject) => {
        const source = new EventSource(buildApiUrl(`/api/runs/${runId}/events`));
        let settled = false;

        source.onmessage = (message) => {
          try {
            const event = JSON.parse(message.data) as RunEvent;
            onEvent(event);
            if (event.type === "completed") {
              settled = true;
              source.close();
              resolve();
            }
            if (event.type === "failed") {
              settled = true;
              source.close();
              reject(new Error(event.message));
            }
          } catch (error) {
            settled = true;
            source.close();
            reject(error);
          }
        };

        source.onerror = () => {
          if (settled) {
            source.close();
            return;
          }
          source.close();
          void readRunSnapshot(runId)
            .then((snapshot) => {
              settled = true;
              if (snapshot.status === "failed") {
                reject(new Error(snapshot.errorMessage ?? "生成失败"));
                return;
              }
              if (snapshot.status === "completed") {
                resolve();
                return;
              }
              reject(new Error("SSE 订阅失败"));
            })
            .catch(() => {
              settled = true;
              reject(new Error("SSE 订阅失败"));
            });
        };
      });
    },

    async subscribeToDesignRun(runId: string, onEvent: (event: RunEvent) => void) {
      await new Promise<void>((resolve, reject) => {
        const source = new EventSource(
          buildApiUrl(`/api/design-runs/${runId}/events`),
        );
        let settled = false;

        source.onmessage = (message) => {
          try {
            const event = JSON.parse(message.data) as RunEvent;
            onEvent(event);
            if (event.type === "completed") {
              settled = true;
              source.close();
              resolve();
            }
            if (event.type === "failed") {
              settled = true;
              source.close();
              reject(new Error(event.message));
            }
          } catch (error) {
            settled = true;
            source.close();
            reject(error);
          }
        };

        source.onerror = () => {
          if (settled) {
            source.close();
            return;
          }
          source.close();
          void readDesignRunSnapshot(runId)
            .then((snapshot) => {
              settled = true;
              if (snapshot.status === "failed") {
                reject(new Error(snapshot.errorMessage ?? "设计生成失败"));
                return;
              }
              if (snapshot.status === "completed") {
                resolve();
                return;
              }
              reject(new Error("设计 SSE 订阅失败"));
            })
            .catch(() => {
              settled = true;
              reject(new Error("设计 SSE 订阅失败"));
            });
        };
      });
    },

    async getRunSnapshot(runId: string) {
      return readRunSnapshot(runId);
    },

    async getDesignRunSnapshot(runId: string) {
      return readDesignRunSnapshot(runId);
    },

    async renderPlantUml(diagramKind, plantUmlSource) {
      const response = await fetch(buildApiUrl("/api/render/svg"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          diagramKind,
          plantUmlSource,
        }),
      });

      if (!response.ok) {
        let message = `渲染 PlantUML 失败：HTTP ${response.status}`;
        try {
          const payload = (await response.json()) as { message?: string };
          if (payload.message) {
            message = payload.message;
          }
        } catch {
          // Ignore non-JSON error payloads and fall back to status text.
        }
        throw new Error(message);
      }

      return (await response.json()) as RenderSvgResponse;
    },

    async testProviderSettings(providerSettings) {
      const response = await fetch(buildApiUrl("/api/provider/test"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(providerSettings),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        capability?: ModelCapability;
      };
      if (!response.ok || !payload.ok || !payload.capability) {
        throw new Error(payload.message ?? `连接测试失败：HTTP ${response.status}`);
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
  };
  const snapshots = new Map<string, RunSnapshot>();
  const designSnapshots = new Map<string, DesignRunSnapshot>();

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
        diagramVersions: { ...workspace.diagramVersions },
      };
    },

    async updateRequirementText(text: string) {
      workspace = {
        ...workspace,
        requirementText: text,
      };
    },

    async startRun(input: StartRunInput) {
      const runId = `run-${Math.random().toString(36).slice(2, 10)}`;
      const snapshot =
        snapshotFactory?.(input, runId) ?? {
          runId,
          requirementText: input.requirementText,
          selectedDiagrams: input.selectedDiagrams,
          rules: workspace.rules as RequirementRule[],
          models: Object.values(workspace.models),
          plantUml: Object.entries(workspace.plantUml).map(([diagramKind, source]) => ({
            diagramKind: diagramKind as DiagramType,
            source,
          })),
          svgArtifacts: Object.values(workspace.svgArtifacts),
          diagramErrors: workspace.diagramErrors,
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
        currentStage: "render_svg",
        status: "completed",
        errorMessage: null,
      };
      designSnapshots.set(runId, snapshot);
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
