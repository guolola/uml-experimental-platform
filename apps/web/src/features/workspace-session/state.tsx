import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  DiagramModelSpec,
  RunEvent,
  RunStage,
} from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "../../entities/diagram/model";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import type {
  RunStatus,
  WorkspaceRecord,
  WorkspaceDesignRunSnapshot,
  WorkspaceRunSnapshot,
} from "../../entities/workspace/model";
import {
  createStartDesignRunInput,
  createStartRunInput,
  useWorkspaceRepository,
} from "../../services/workspace-repository";
import type { RunHistoryItem } from "../history";

interface DiagnosticEvent {
  id: string;
  at: string;
  label: string;
  detail: string | null;
}

interface RunDiagnostics {
  runId: string | null;
  providerModel: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  activeStage: RunStage | null;
  streamText: string;
  chunkCount: number;
  stageStartedAt: Partial<Record<RunStage, string>>;
  stageMessages: Partial<Record<string, string>>;
  events: DiagnosticEvent[];
}

interface WorkspaceSessionState {
  requirementText: string;
  setRequirementText: (value: string) => void;
  rules: RequirementRule[];
  models: WorkspaceRecord["models"];
  selectedDiagrams: DiagramType[];
  setSelectedDiagrams: (value: DiagramType[]) => void;
  plantUml: Partial<Record<DiagramType, string>>;
  svgArtifacts: WorkspaceRecord["svgArtifacts"];
  diagramErrors: WorkspaceRecord["diagramErrors"];
  selectedDesignDiagrams: DesignDiagramType[];
  setSelectedDesignDiagrams: (value: DesignDiagramType[]) => void;
  designModels: WorkspaceRecord["designModels"];
  designPlantUml: WorkspaceRecord["designPlantUml"];
  designSvgArtifacts: WorkspaceRecord["designSvgArtifacts"];
  designDiagramErrors: WorkspaceRecord["designDiagramErrors"];
  generatedDesignDiagrams: DesignDiagramType[];
  generatedDiagrams: DiagramType[];
  generating: boolean;
  runStatus: RunStatus;
  runProgress: number;
  runMessage: string | null;
  errorMessage: string | null;
  generateRules: () => Promise<void>;
  generateDiagrams: (only?: DiagramType[]) => Promise<void>;
  generateDesignDiagrams: (only?: DesignDiagramType[]) => Promise<void>;
  rulesForDiagram: (diagram: DiagramType) => RequirementRule[];
  textVersion: number;
  rulesVersion: number;
  rulesBasedOnTextVersion: number | null;
  diagramVersions: Partial<Record<DiagramType, number>>;
  isRulesStale: boolean;
  staleDiagrams: DiagramType[];
  historyItems: RunHistoryItem[];
  refreshHistory: () => Promise<void>;
  restoreRunHistory: (id: string) => Promise<void>;
  deleteRunHistory: (id: string) => Promise<void>;
  clearRunHistory: () => Promise<void>;
  renderPlantUml: (diagram: DiagramType, source: string) => Promise<void>;
  currentRunDiagnostics: RunDiagnostics;
}

type RunMode =
  | { kind: "rules-only" }
  | { kind: "full-diagrams" }
  | { kind: "partial-diagrams"; diagrams: DiagramType[] };

const WorkspaceSessionContext = createContext<WorkspaceSessionState | null>(null);
const MAX_DIAGNOSTIC_STREAM_CHARS = 30_000;

function createEmptyRunUiState() {
  return {
    runStatus: "idle" as RunStatus,
    runProgress: 0,
    runMessage: null as string | null,
    errorMessage: null as string | null,
  };
}

function createEmptyDiagnostics(): RunDiagnostics {
  return {
    runId: null,
    providerModel: null,
    startedAt: null,
    finishedAt: null,
    activeStage: null,
    streamText: "",
    chunkCount: 0,
    stageStartedAt: {},
    stageMessages: {},
    events: [],
  };
}

function appendDiagnosticStream(current: string, chunk: string) {
  const next = current + chunk;
  if (next.length <= MAX_DIAGNOSTIC_STREAM_CHARS) {
    return next;
  }
  return next.slice(next.length - MAX_DIAGNOSTIC_STREAM_CHARS);
}

function summarizeEvent(event: RunEvent): DiagnosticEvent {
  const at = new Date().toISOString();
  const suffix = `${at}:${Math.random().toString(36).slice(2, 8)}`;
  switch (event.type) {
    case "queued":
      return { id: `${suffix}:queued`, at, label: "queued", detail: "任务已进入队列" };
    case "stage_started":
      return {
        id: `${suffix}:stage_started:${event.stage}`,
        at,
        label: "stage_started",
        detail: event.stage,
      };
    case "stage_progress":
      return {
        id: `${suffix}:stage_progress:${event.stage}:${event.progress}`,
        at,
        label: "stage_progress",
        detail: event.message ?? `${event.stage} ${event.progress}%`,
      };
    case "artifact_ready":
      return {
        id: `${suffix}:artifact_ready:${event.artifactKind}:${event.diagramKind ?? "all"}`,
        at,
        label: "artifact_ready",
        detail: [event.stage, event.artifactKind, event.diagramKind].filter(Boolean).join(" · "),
      };
    case "completed":
      return {
        id: `${suffix}:completed`,
        at,
        label: "completed",
        detail: `完成，SVG ${event.snapshot.svgArtifacts.length} 个`,
      };
    case "failed":
      return {
        id: `${suffix}:failed`,
        at,
        label: "failed",
        detail: event.message,
      };
    case "llm_chunk":
      return {
        id: `${suffix}:llm_chunk:${event.stage}`,
        at,
        label: "llm_chunk",
        detail: `${event.stage} 收到模型输出`,
      };
  }
}

function snapshotToMaps(snapshot: WorkspaceRunSnapshot) {
  return {
    models: Object.fromEntries(
      snapshot.models.map((model) => [model.diagramKind, model]),
    ) as WorkspaceRecord["models"],
    plantUml: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [artifact.diagramKind, artifact.source]),
    ) as WorkspaceRecord["plantUml"],
    svgArtifacts: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [artifact.diagramKind, artifact]),
    ) as WorkspaceRecord["svgArtifacts"],
  };
}

function designSnapshotToMaps(snapshot: WorkspaceDesignRunSnapshot) {
  return {
    models: Object.fromEntries(
      snapshot.models.map((model) => [model.diagramKind, model]),
    ) as WorkspaceRecord["designModels"],
    plantUml: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [artifact.diagramKind, artifact.source]),
    ) as WorkspaceRecord["designPlantUml"],
    svgArtifacts: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [artifact.diagramKind, artifact]),
    ) as WorkspaceRecord["designSvgArtifacts"],
  };
}

function getProgressFromEvent(event: RunEvent) {
  switch (event.type) {
    case "queued":
      return 5;
    case "stage_started":
      switch (event.stage) {
        case "extract_rules":
          return 20;
        case "generate_models":
          return 65;
        case "generate_design_sequence":
          return 45;
        case "generate_design_models":
          return 70;
        case "generate_plantuml":
          return 80;
        case "render_svg":
          return 95;
      }
      return null;
    case "stage_progress":
      return event.progress;
    case "completed":
      return 100;
    case "failed":
      return 100;
    case "llm_chunk":
    case "artifact_ready":
      return null;
  }
}

export function WorkspaceSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const repository = useWorkspaceRepository();
  const [requirementText, setRequirementTextRaw] = useState("");
  const [rules, setRules] = useState<RequirementRule[]>([]);
  const [models, setModels] = useState<WorkspaceRecord["models"]>({});
  const [selectedDiagrams, setSelectedDiagrams] = useState<DiagramType[]>([]);
  const [plantUml, setPlantUml] = useState<WorkspaceRecord["plantUml"]>({});
  const [svgArtifacts, setSvgArtifacts] = useState<WorkspaceRecord["svgArtifacts"]>(
    {},
  );
  const [diagramErrors, setDiagramErrors] = useState<WorkspaceRecord["diagramErrors"]>(
    {},
  );
  const [selectedDesignDiagrams, setSelectedDesignDiagrams] = useState<
    DesignDiagramType[]
  >([]);
  const [designModels, setDesignModels] = useState<WorkspaceRecord["designModels"]>(
    {},
  );
  const [designPlantUml, setDesignPlantUml] = useState<
    WorkspaceRecord["designPlantUml"]
  >({});
  const [designSvgArtifacts, setDesignSvgArtifacts] = useState<
    WorkspaceRecord["designSvgArtifacts"]
  >({});
  const [designDiagramErrors, setDesignDiagramErrors] = useState<
    WorkspaceRecord["designDiagramErrors"]
  >({});
  const [generatedDiagrams, setGeneratedDiagrams] = useState<DiagramType[]>([]);
  const [generatedDesignDiagrams, setGeneratedDesignDiagrams] = useState<
    DesignDiagramType[]
  >([]);
  const [runUiState, setRunUiState] = useState(createEmptyRunUiState);
  const [textVersion, setTextVersion] = useState(0);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [rulesBasedOnTextVersion, setRulesBasedOnTextVersion] = useState<
    number | null
  >(null);
  const [diagramVersions, setDiagramVersions] = useState<
    Partial<Record<DiagramType, number>>
  >({});
  const [historyItems, setHistoryItems] = useState<RunHistoryItem[]>([]);
  const [currentRunDiagnostics, setCurrentRunDiagnostics] =
    useState(createEmptyDiagnostics);

  const runRequestIdRef = useRef(0);

  useEffect(() => {
    let active = true;

    void repository.loadWorkspace().then((workspace) => {
      if (!active) return;
      setRequirementTextRaw(workspace.requirementText);
      setRules(workspace.rules);
      setModels(workspace.models);
      setSelectedDiagrams(workspace.selectedDiagramTypes);
      setPlantUml(workspace.plantUml);
      setSvgArtifacts(workspace.svgArtifacts);
      setDiagramErrors(workspace.diagramErrors);
      setSelectedDesignDiagrams(workspace.selectedDesignDiagramTypes);
      setDesignModels(workspace.designModels);
      setDesignPlantUml(workspace.designPlantUml);
      setDesignSvgArtifacts(workspace.designSvgArtifacts);
      setDesignDiagramErrors(workspace.designDiagramErrors);
      setGeneratedDiagrams(workspace.generatedDiagramTypes);
      setGeneratedDesignDiagrams(workspace.generatedDesignDiagramTypes);
      setRulesVersion(workspace.rulesVersion);
      setRulesBasedOnTextVersion(workspace.rulesBasedOnTextVersion);
      setDiagramVersions(workspace.diagramVersions);
      setRunUiState({
        runStatus: workspace.runStatus,
        runProgress: workspace.runProgress,
        runMessage: workspace.runMessage,
        errorMessage: workspace.errorMessage,
      });
      setTextVersion(0);
      void repository.listRunHistory().then((items) => {
        if (active) {
          setHistoryItems(items);
        }
      });
    });

    return () => {
      active = false;
    };
  }, [repository]);

  const setRequirementText = useCallback(
    (value: string) => {
      setRequirementTextRaw((prev) => {
        if (prev !== value) {
          setTextVersion((current) => current + 1);
        }
        return value;
      });
      void repository.updateRequirementText(value);
    },
    [repository],
  );

  const rulesForDiagram = useCallback(
    (diagram: DiagramType) =>
      rules.filter((rule) => rule.relatedDiagrams.includes(diagram)),
    [rules],
  );

  const applyRunSnapshot = useCallback(
    (
      snapshot: WorkspaceRunSnapshot,
      baseTextVersion: number,
      mode: RunMode,
    ) => {
      const nextRulesVersion = rulesVersion + 1;
      const mapped = snapshotToMaps(snapshot);

      setRules(snapshot.rules);
      setRulesVersion(nextRulesVersion);
      setRulesBasedOnTextVersion(baseTextVersion);
      setDiagramErrors((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of mode.diagrams) {
            delete next[diagram];
          }
          for (const [diagram, error] of Object.entries(snapshot.diagramErrors)) {
            next[diagram as DiagramType] = error;
          }
          return next;
        }
        return snapshot.diagramErrors;
      });

      if (mode.kind === "rules-only") {
        return;
      }

      setModels((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of mode.diagrams) {
            delete next[diagram];
          }
          for (const [diagram, model] of Object.entries(mapped.models)) {
            next[diagram as DiagramType] = model;
          }
          return next;
        }
        return mapped.models;
      });

      setPlantUml((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of mode.diagrams) {
            delete next[diagram];
          }
          for (const [diagram, source] of Object.entries(mapped.plantUml)) {
            next[diagram as DiagramType] = source;
          }
          return next;
        }
        return mapped.plantUml;
      });

      setSvgArtifacts((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of mode.diagrams) {
            delete next[diagram];
          }
          for (const [diagram, artifact] of Object.entries(mapped.svgArtifacts)) {
            next[diagram as DiagramType] = artifact;
          }
          return next;
        }
        return mapped.svgArtifacts;
      });

      const affectedDiagrams =
        mode.kind === "partial-diagrams"
          ? mode.diagrams
          : [...snapshot.selectedDiagrams];

      setGeneratedDiagrams((current) => {
        if (mode.kind === "partial-diagrams") {
          return Array.from(new Set([...current, ...affectedDiagrams]));
        }
        return [...snapshot.selectedDiagrams];
      });

      setDiagramVersions((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of affectedDiagrams) {
            next[diagram] = nextRulesVersion;
          }
          return next;
        }
        return Object.fromEntries(
          snapshot.selectedDiagrams.map((diagram) => [diagram, nextRulesVersion]),
        ) as Partial<Record<DiagramType, number>>;
      });
    },
    [rulesVersion],
  );

  const applyDesignRunSnapshot = useCallback(
    (
      snapshot: WorkspaceDesignRunSnapshot,
      requestedDiagrams: DesignDiagramType[],
    ) => {
      const mapped = designSnapshotToMaps(snapshot);
      setSelectedDesignDiagrams([...requestedDiagrams]);
      setDesignModels((current) => ({
        ...current,
        ...mapped.models,
      }));
      setDesignPlantUml((current) => ({
        ...current,
        ...mapped.plantUml,
      }));
      setDesignSvgArtifacts((current) => ({
        ...current,
        ...mapped.svgArtifacts,
      }));
      setDesignDiagramErrors((current) => ({
        ...current,
        ...snapshot.diagramErrors,
      }));
      setGeneratedDesignDiagrams((current) =>
        Array.from(new Set([...current, ...snapshot.selectedDiagrams])),
      );
    },
    [],
  );

  const applyRestoredSnapshot = useCallback((snapshot: WorkspaceRunSnapshot) => {
    const restoredRulesVersion = rulesVersion + 1;
    const mapped = snapshotToMaps(snapshot);
    setRequirementTextRaw(snapshot.requirementText);
    void repository.updateRequirementText(snapshot.requirementText);
    setRules(snapshot.rules);
    setModels(mapped.models);
    setSelectedDiagrams([...snapshot.selectedDiagrams]);
    setPlantUml(mapped.plantUml);
    setSvgArtifacts(mapped.svgArtifacts);
    setDiagramErrors(snapshot.diagramErrors);
    setGeneratedDiagrams([...snapshot.selectedDiagrams]);
    setRulesVersion(restoredRulesVersion);
    setRulesBasedOnTextVersion(textVersion);
    setDiagramVersions(
      Object.fromEntries(
        snapshot.selectedDiagrams.map((diagram) => [diagram, restoredRulesVersion]),
      ),
    );
    setRunUiState({
      runStatus: snapshot.status,
      runProgress: snapshot.status === "completed" || snapshot.status === "failed" ? 100 : 0,
      runMessage: snapshot.status === "completed" ? "已恢复历史快照" : null,
      errorMessage: snapshot.errorMessage,
    });
  }, [repository, rulesVersion, textVersion]);

  const refreshHistory = useCallback(async () => {
    setHistoryItems(await repository.listRunHistory());
  }, [repository]);

  const restoreRunHistory = useCallback(
    async (id: string) => {
      const item = await repository.restoreRunHistory(id);
      if (!item) {
        throw new Error("历史快照不存在");
      }
      applyRestoredSnapshot(item.snapshot);
    },
    [applyRestoredSnapshot, repository],
  );

  const deleteRunHistory = useCallback(
    async (id: string) => {
      setHistoryItems(await repository.deleteRunHistory(id));
    },
    [repository],
  );

  const clearRunHistory = useCallback(async () => {
    await repository.clearRunHistory();
    setHistoryItems([]);
  }, [repository]);

  const saveHistorySnapshot = useCallback(
    async (
      snapshot: WorkspaceRunSnapshot,
      meta: { providerModel: string; durationMs?: number },
    ) => {
      await repository.saveRunHistory(snapshot, meta);
      setHistoryItems(await repository.listRunHistory());
    },
    [repository],
  );

  const runGeneration = useCallback(
    async (diagrams: DiagramType[], mode: RunMode) => {
      const runRequestId = ++runRequestIdRef.current;
      const baseTextVersion = textVersion;
      let lastCompletedSnapshot: WorkspaceRunSnapshot | null = null;
      let runId: string | null = null;
      const startedAtMs = Date.now();
      let providerModel = "";

      try {
        const startInput = createStartRunInput(requirementText, diagrams);
        providerModel = startInput.providerSettings.model;
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "任务已进入队列",
          errorMessage: null,
        });
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startRun(
          startInput,
        );
        runId = started.runId;
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToRun(runId, (event) => {
          if (runRequestId !== runRequestIdRef.current) {
            return;
          }

          const progress = getProgressFromEvent(event);
          if (event.type === "completed") {
            lastCompletedSnapshot = event.snapshot as WorkspaceRunSnapshot;
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt:
              event.type === "completed" || event.type === "failed"
                ? diagnosticEvent.at
                : current.finishedAt,
            activeStage:
              "stage" in event
                ? event.stage
                : current.activeStage,
            streamText:
              event.type === "llm_chunk"
                ? appendDiagnosticStream(current.streamText, event.chunk)
                : current.streamText,
            chunkCount:
              event.type === "llm_chunk"
                ? current.chunkCount + 1
                : current.chunkCount,
            stageStartedAt:
              event.type === "stage_started"
                ? { ...current.stageStartedAt, [event.stage]: diagnosticEvent.at }
                : current.stageStartedAt,
            stageMessages:
              event.type === "stage_progress" && event.message
                ? { ...current.stageMessages, [event.stage]: event.message }
                : current.stageMessages,
            events: [...current.events, diagnosticEvent].slice(-80),
          }));

          setRunUiState((current) => ({
            runStatus:
              event.type === "queued"
                ? "queued"
                : event.type === "failed"
                  ? "failed"
                  : event.type === "completed"
                    ? "completed"
                    : "running",
            runProgress: progress ?? current.runProgress,
            runMessage:
              event.type === "stage_progress"
                ? event.message ?? current.runMessage
                : event.type === "queued"
                  ? "任务已进入队列"
                  : event.type === "completed"
                    ? "生成完成"
                    : event.type === "failed"
                      ? event.message
                      : current.runMessage,
            errorMessage:
              event.type === "failed" ? event.message : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getRunSnapshot(runId)) ?? lastCompletedSnapshot;
        if (!snapshot || runRequestId !== runRequestIdRef.current) {
          return;
        }

        applyRunSnapshot(snapshot, baseTextVersion, mode);
        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "生成完成",
          errorMessage: null,
        });
      } catch (error) {
        if (runRequestId !== runRequestIdRef.current) {
          return;
        }
        if (runId) {
          try {
            const failedSnapshot = await repository.getRunSnapshot(runId);
            await saveHistorySnapshot(failedSnapshot, {
              providerModel,
              durationMs: Date.now() - startedAtMs,
            });
          } catch {
            // The visible error state below is more useful than a secondary history failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: error instanceof Error ? error.message : "生成失败",
        });
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local`,
              at: new Date().toISOString(),
              label: "failed",
              detail: error instanceof Error ? error.message : "生成失败",
            },
          ].slice(-80),
        }));
      }
    },
    [applyRunSnapshot, repository, requirementText, saveHistorySnapshot, textVersion],
  );

  const runDesignGeneration = useCallback(
    async (diagrams: DesignDiagramType[]) => {
      const runRequestId = ++runRequestIdRef.current;
      let lastCompletedSnapshot: WorkspaceDesignRunSnapshot | null = null;
      let runId: string | null = null;
      const startedAtMs = Date.now();
      let providerModel = "";

      try {
        if (
          !repository.startDesignRun ||
          !repository.subscribeToDesignRun ||
          !repository.getDesignRunSnapshot
        ) {
          throw new Error("当前仓储未实现设计阶段生成能力");
        }
        const startInput = createStartDesignRunInput(
          requirementText,
          rules,
          Object.values(models).filter(
            (model): model is DiagramModelSpec => Boolean(model),
          ),
          diagrams,
        );
        providerModel = startInput.providerSettings.model;
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "设计生成任务已进入队列",
          errorMessage: null,
        });
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startDesignRun(startInput);
        runId = started.runId;
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToDesignRun(runId, (event) => {
          if (runRequestId !== runRequestIdRef.current) {
            return;
          }

          const progress = getProgressFromEvent(event);
          if (event.type === "completed") {
            lastCompletedSnapshot = event.snapshot as WorkspaceDesignRunSnapshot;
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt:
              event.type === "completed" || event.type === "failed"
                ? diagnosticEvent.at
                : current.finishedAt,
            activeStage:
              "stage" in event
                ? event.stage
                : current.activeStage,
            streamText:
              event.type === "llm_chunk"
                ? appendDiagnosticStream(current.streamText, event.chunk)
                : current.streamText,
            chunkCount:
              event.type === "llm_chunk"
                ? current.chunkCount + 1
                : current.chunkCount,
            stageStartedAt:
              event.type === "stage_started"
                ? { ...current.stageStartedAt, [event.stage]: diagnosticEvent.at }
                : current.stageStartedAt,
            stageMessages:
              event.type === "stage_progress" && event.message
                ? { ...current.stageMessages, [event.stage]: event.message }
                : current.stageMessages,
            events: [...current.events, diagnosticEvent].slice(-80),
          }));

          setRunUiState((current) => ({
            runStatus:
              event.type === "queued"
                ? "queued"
                : event.type === "failed"
                  ? "failed"
                  : event.type === "completed"
                    ? "completed"
                    : "running",
            runProgress: progress ?? current.runProgress,
            runMessage:
              event.type === "stage_progress"
                ? event.message ?? current.runMessage
                : event.type === "queued"
                  ? "设计生成任务已进入队列"
                  : event.type === "completed"
                    ? "设计生成完成"
                    : event.type === "failed"
                      ? event.message
                      : current.runMessage,
            errorMessage:
              event.type === "failed" ? event.message : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getDesignRunSnapshot(runId)) ?? lastCompletedSnapshot;
        if (!snapshot || runRequestId !== runRequestIdRef.current) {
          return;
        }

        applyDesignRunSnapshot(snapshot, diagrams);
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "设计生成完成",
          errorMessage: null,
        });
      } catch (error) {
        if (runRequestId !== runRequestIdRef.current) {
          return;
        }
        if (runId) {
          try {
            const failedSnapshot = await repository.getDesignRunSnapshot(runId);
            applyDesignRunSnapshot(failedSnapshot, diagrams);
          } catch {
            // The visible error state below is more useful than a secondary snapshot failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: error instanceof Error ? error.message : "设计生成失败",
        });
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local`,
              at: new Date().toISOString(),
              label: "failed",
              detail: error instanceof Error ? error.message : "设计生成失败",
            },
          ].slice(-80),
        }));
      }
    },
    [applyDesignRunSnapshot, models, repository, requirementText, rules],
  );

  const renderPlantUml = useCallback(
    async (diagram: DiagramType, source: string) => {
      try {
        const rendered = await repository.renderPlantUml(diagram, source);
        setPlantUml((current) => ({ ...current, [diagram]: source }));
        setSvgArtifacts((current) => ({
          ...current,
          [diagram]: {
            diagramKind: diagram,
            svg: rendered.svg,
            renderMeta: rendered.renderMeta,
          },
        }));
        setDiagramErrors((current) => {
          const next = { ...current };
          delete next[diagram];
          return next;
        });
        setGeneratedDiagrams((current) =>
          current.includes(diagram) ? current : [...current, diagram],
        );
      } catch (error) {
        setDiagramErrors((current) => ({
          ...current,
          [diagram]: {
            stage: "render_svg",
            message: error instanceof Error ? error.message : "PlantUML 渲染失败",
          },
        }));
        throw error;
      }
    },
    [repository],
  );

  const generateRules = useCallback(async () => {
    await runGeneration([], { kind: "rules-only" });
  }, [runGeneration]);

  const generateDiagrams = useCallback(
    async (only?: DiagramType[]) => {
      const diagrams = only ?? selectedDiagrams;
      if (diagrams.length === 0) {
        return;
      }

      await runGeneration(
        diagrams,
        only
          ? { kind: "partial-diagrams", diagrams }
          : { kind: "full-diagrams" },
      );
    },
    [runGeneration, selectedDiagrams],
  );

  const generateDesignDiagrams = useCallback(
    async (only?: DesignDiagramType[]) => {
      const diagrams = only ?? selectedDesignDiagrams;
      if (diagrams.length === 0) {
        return;
      }

      await runDesignGeneration(diagrams);
    },
    [runDesignGeneration, selectedDesignDiagrams],
  );

  const isRulesStale =
    rules.length > 0 &&
    rulesBasedOnTextVersion !== null &&
    rulesBasedOnTextVersion !== textVersion;

  const staleDiagrams = generatedDiagrams.filter(
    (diagram) => (diagramVersions[diagram] ?? -1) !== rulesVersion,
  );

  const generating =
    runUiState.runStatus === "queued" || runUiState.runStatus === "running";

  const value = useMemo<WorkspaceSessionState>(
    () => ({
      requirementText,
      setRequirementText,
      rules,
      models,
      selectedDiagrams,
      setSelectedDiagrams,
      plantUml,
      svgArtifacts,
      diagramErrors,
      selectedDesignDiagrams,
      setSelectedDesignDiagrams,
      designModels,
      designPlantUml,
      designSvgArtifacts,
      designDiagramErrors,
      generatedDesignDiagrams,
      generatedDiagrams,
      generating,
      runStatus: runUiState.runStatus,
      runProgress: runUiState.runProgress,
      runMessage: runUiState.runMessage,
      errorMessage: runUiState.errorMessage,
      generateRules,
      generateDiagrams,
      generateDesignDiagrams,
      rulesForDiagram,
      textVersion,
      rulesVersion,
      rulesBasedOnTextVersion,
      diagramVersions,
      isRulesStale,
      staleDiagrams,
      historyItems,
      refreshHistory,
      restoreRunHistory,
      deleteRunHistory,
      clearRunHistory,
      renderPlantUml,
      currentRunDiagnostics,
    }),
    [
      requirementText,
      setRequirementText,
      rules,
      models,
      selectedDiagrams,
      plantUml,
      svgArtifacts,
      diagramErrors,
      selectedDesignDiagrams,
      designModels,
      designPlantUml,
      designSvgArtifacts,
      designDiagramErrors,
      generatedDesignDiagrams,
      generatedDiagrams,
      generating,
      runUiState,
      generateRules,
      generateDiagrams,
      generateDesignDiagrams,
      rulesForDiagram,
      textVersion,
      rulesVersion,
      rulesBasedOnTextVersion,
      diagramVersions,
      isRulesStale,
      staleDiagrams,
      historyItems,
      refreshHistory,
      restoreRunHistory,
      deleteRunHistory,
      clearRunHistory,
      renderPlantUml,
      currentRunDiagnostics,
    ],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession() {
  const value = useContext(WorkspaceSessionContext);
  if (!value) {
    throw new Error(
      "useWorkspaceSession must be used within WorkspaceSessionProvider",
    );
  }
  return value;
}
