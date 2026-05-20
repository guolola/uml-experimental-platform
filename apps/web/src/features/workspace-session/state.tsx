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
import { toast } from "sonner";
import type {
  DocumentKind,
  DocumentStyleSettings,
  DocumentRunSnapshot,
  DesignModelTraceabilityEntry,
  DesignDiagramModelSpec,
  DiagramModelSpec,
  ModelElementRef,
  RequirementModelTraceabilityEntry,
} from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "../../entities/diagram/model";
import type {
  WorkspaceRecord,
  WorkspaceCodeRunSnapshot,
  WorkspaceDesignRunSnapshot,
  WorkspaceRunSnapshot,
} from "../../entities/workspace/model";
import {
  createStartCodeRunInput,
  createStartDesignRunInput,
  createStartDocumentRunInput,
  createStartRunInput,
  useWorkspaceRepository,
} from "../../services/workspace-repository";
import { downloadBlobFile } from "../../shared/lib/download";
import {
  isCodeRunSnapshot,
  isDesignRunSnapshot,
  isDocumentRunSnapshot,
  type RunHistoryItem,
  type RunHistorySnapshot,
} from "../history";
import { useRunController } from "./run-controller";
import type {
  GenerationTask,
  GenerationTaskKind,
  RunMode,
  WorkspaceSessionState,
} from "./model/session-state";
import {
  notifyGenerationCompleted,
  notifyGenerationFailed,
  notifyGenerationResultStale,
  notifyGenerationStarted,
} from "./lib/notifications";
import { createEmptyRunUiState } from "./lib/run-ui-state";
import { snapshotInputFingerprint } from "./lib/fingerprint";
import {
  appendDiagnosticStream,
  createEmptyDiagnostics,
  getProgressFromEvent,
  summarizeEvent,
} from "./lib/diagnostics";
import {
  addLocalFailureToDiagnostics,
  assignTaskRunId,
  createClientTaskId,
  createGenerationTask,
  isTaskActive,
  updateTaskFromEvent,
} from "./lib/generation-tasks";
import { designSnapshotToMaps, snapshotToMaps } from "./lib/snapshot-maps";
import { useRequirementsSlice } from "./slices/requirements-slice";
import { useDiagramsSlice } from "./slices/diagrams-slice";
import { useDesignSlice } from "./slices/design-slice";
import { useCodeSlice } from "./slices/code-slice";
import { useRunDiagnosticsSlice } from "./slices/run-diagnostics-slice";





const WorkspaceSessionContext = createContext<WorkspaceSessionState | null>(null);

function refKey(diagramKind: string, elementId: string) {
  return `${diagramKind}:${elementId}`.toLowerCase();
}

function compactRefValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function activityNodeTraceabilityKind(nodeType: unknown) {
  switch (nodeType) {
    case "activity":
      return "activity";
    case "decision":
      return "decision";
    case "start":
      return "start-node";
    case "end":
      return "end-node";
    case "merge":
      return "merge-node";
    case "fork":
      return "fork-node";
    case "join":
      return "join-node";
    default:
      return "activity-node";
  }
}

function isBusinessTraceabilityKind(kind: string) {
  return ![
    "system-boundary",
    "swimlane",
    "start-node",
    "end-node",
    "merge-node",
    "fork-node",
    "join-node",
  ].includes(kind);
}

function collectTraceableRefKeys(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
) {
  const keys = new Set<string>();
  for (const model of models) {
    const diagramKind = model.diagramKind;
    const record = model as unknown as Record<string, unknown>;
    const listKeys: Array<[string, string]> = [
      ["actors", "actor"],
      ["useCases", "usecase"],
      ["systemBoundaries", "system-boundary"],
      ["classes", "class"],
      ["interfaces", "interface"],
      ["enums", "enum"],
      ["swimlanes", "swimlane"],
      ["nodes", diagramKind === "deployment" ? "deployment-node" : "activity-node"],
      ["databases", "database"],
      ["components", "component"],
      ["externalSystems", "external-system"],
      ["artifacts", "artifact"],
      ["participants", "participant"],
      ["messages", "message"],
      ["fragments", "fragment"],
      ["tables", "table"],
    ];
    const businessElementIds = new Set<string>();

    for (const [key, defaultKind] of listKeys) {
      const items = Array.isArray(record[key]) ? record[key] : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const itemRecord = item as Record<string, unknown>;
        const id = compactRefValue(itemRecord.id);
        const kind =
          key === "nodes" && diagramKind === "activity"
            ? activityNodeTraceabilityKind(itemRecord.type)
            : defaultKind;
        if (id && isBusinessTraceabilityKind(kind)) {
          keys.add(refKey(diagramKind, id));
          businessElementIds.add(id);
        }
        if (key === "tables") {
          const columns = Array.isArray(itemRecord.columns) ? itemRecord.columns : [];
          for (const column of columns) {
            if (!column || typeof column !== "object") continue;
            const columnId = compactRefValue((column as Record<string, unknown>).id);
            if (id && columnId) {
              keys.add(refKey(diagramKind, `${id}.${columnId}`));
              businessElementIds.add(`${id}.${columnId}`);
            }
          }
        }
      }
    }

    const relationships = Array.isArray(record.relationships)
      ? record.relationships
      : [];
    for (const relationship of relationships) {
      if (!relationship || typeof relationship !== "object") continue;
      const relationshipRecord = relationship as Record<string, unknown>;
      if (
        diagramKind === "activity" &&
        (!businessElementIds.has(compactRefValue(relationshipRecord.sourceId)) ||
          !businessElementIds.has(compactRefValue(relationshipRecord.targetId)))
      ) {
        continue;
      }
      const id = compactRefValue(relationshipRecord.id);
      if (id) keys.add(refKey(diagramKind, id));
    }
  }
  return keys;
}

function hasCompleteTraceabilityCoverage(
  modelRefs: Set<string>,
  refs: ModelElementRef[],
) {
  if (modelRefs.size === 0) return false;
  const covered = new Set(refs.map((ref) => refKey(ref.diagramKind, ref.elementId)));
  return Array.from(modelRefs).every((key) => covered.has(key));
}

function hasCompleteRequirementTraceability(
  models: Array<DiagramModelSpec | undefined>,
  traceability: RequirementModelTraceabilityEntry[],
) {
  const modelRefs = collectTraceableRefKeys(
    models.filter((model): model is DiagramModelSpec => Boolean(model)),
  );
  return hasCompleteTraceabilityCoverage(
    modelRefs,
    traceability.map((entry) => entry.target),
  );
}

function hasCompleteDesignTraceability(
  models: Array<DesignDiagramModelSpec | undefined>,
  traceability: DesignModelTraceabilityEntry[],
) {
  const modelRefs = collectTraceableRefKeys(
    models.filter((model): model is DesignDiagramModelSpec => Boolean(model)),
  );
  return hasCompleteTraceabilityCoverage(
    modelRefs,
    traceability.map((entry) => entry.source),
  );
}

















export function WorkspaceSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const repository = useWorkspaceRepository();
  const {
    requirementText,
    setRequirementText,
    setRequirementTextRaw,
    rules,
    setRules,
    textVersion,
    setTextVersion,
    rulesVersion,
    setRulesVersion,
    rulesBasedOnTextVersion,
    setRulesBasedOnTextVersion,
    addRequirementRule,
    createRequirementRule,
    updateRequirementRule,
    deleteRequirementRule,
    clearRequirementRules,
    rulesForDiagram,
  } = useRequirementsSlice(repository);
  const {
    models,
    setModels,
    requirementModelTraceability,
    setRequirementModelTraceability,
    selectedDiagrams,
    setSelectedDiagrams,
    plantUml,
    setPlantUml,
    svgArtifacts,
    setSvgArtifacts,
    diagramErrors,
    setDiagramErrors,
    generatedDiagrams,
    setGeneratedDiagrams,
    diagramVersions,
    setDiagramVersions,
  } = useDiagramsSlice();
  const {
    selectedDesignDiagrams,
    setSelectedDesignDiagrams,
    designModels,
    designModelTraceability,
    setDesignModelTraceability,
    setDesignModels,
    designPlantUml,
    setDesignPlantUml,
    designSvgArtifacts,
    setDesignSvgArtifacts,
    designDiagramErrors,
    setDesignDiagramErrors,
    generatedDesignDiagrams,
    setGeneratedDesignDiagrams,
  } = useDesignSlice();
  const {
    codeSpec,
    setCodeSpec,
    codeBusinessLogic,
    setCodeBusinessLogic,
    codeFiles,
    setCodeFiles,
    codeEntryFile,
    setCodeEntryFile,
    codeDependencies,
    setCodeDependencies,
    codeUiMockup,
    setCodeUiMockup,
    codeAgentPlan,
    setCodeAgentPlan,
    codeSkills,
    setCodeSkills,
    codeSkillDiagnostics,
    setCodeSkillDiagnostics,
    codeSkillResourcePlan,
    setCodeSkillResourcePlan,
    codeSkillContext,
    setCodeSkillContext,
    codeDiagnostics,
    setCodeDiagnostics,
    codeEditVersion,
    applyCodeRunSnapshot,
    updateCodeFile,
  } = useCodeSlice();
  const { currentRunDiagnostics, setCurrentRunDiagnostics } =
    useRunDiagnosticsSlice();
  const [runUiState, setRunUiState] = useState(createEmptyRunUiState);
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [selectedGenerationTaskId, setSelectedGenerationTaskId] =
    useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<RunHistoryItem[]>([]);

  const runController = useRunController();
  const latestInputRef = useRef({
    requirementText,
    rules,
    models,
    requirementModelTraceability,
    designModels,
    designModelTraceability,
    codeFiles,
    codeEditVersion,
  });

  useEffect(() => {
    latestInputRef.current = {
      requirementText,
      rules,
      models,
      requirementModelTraceability,
      designModels,
      designModelTraceability,
      codeFiles,
      codeEditVersion,
    };
  }, [
    codeEditVersion,
    codeFiles,
    designModelTraceability,
    designModels,
    models,
    requirementModelTraceability,
    requirementText,
    rules,
  ]);

  const selectGenerationTask = useCallback((id: string) => {
    setSelectedGenerationTaskId(id);
  }, []);

  const clearCompletedGenerationTasks = useCallback(() => {
    setGenerationTasks((current) => {
      const active = current.filter((task) => isTaskActive(task));
      setSelectedGenerationTaskId((selectedId) =>
        selectedId && active.some((task) => task.clientTaskId === selectedId)
          ? selectedId
          : active[0]?.clientTaskId ?? null,
      );
      return active;
    });
  }, []);

  const enqueueGenerationTask = useCallback(
    (input: {
      kind: GenerationTaskKind;
      title: string;
      providerModel: string | null;
      documentKind?: DocumentKind;
      message: string;
      startedAtMs: number;
    }) => {
      const clientTaskId = createClientTaskId(input.kind);
      const startedAt = new Date(input.startedAtMs).toISOString();
      const task = createGenerationTask({
        clientTaskId,
        kind: input.kind,
        title: input.title,
        providerModel: input.providerModel,
        documentKind: input.documentKind,
        message: input.message,
        startedAt,
      });
      setGenerationTasks((current) => [task, ...current].slice(0, 30));
      setSelectedGenerationTaskId(clientTaskId);
      return clientTaskId;
    },
    [],
  );

  const updateGenerationTask = useCallback(
    (
      clientTaskId: string,
      updater: (task: GenerationTask) => GenerationTask,
    ) => {
      setGenerationTasks((current) =>
        current.map((task) =>
          task.clientTaskId === clientTaskId ? updater(task) : task,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    let active = true;

    void repository.loadWorkspace().then((workspace) => {
      if (!active) return;
      setRequirementTextRaw(workspace.requirementText);
      setRules(workspace.rules);
      setModels(workspace.models);
      setRequirementModelTraceability(workspace.requirementModelTraceability ?? []);
      setSelectedDiagrams(workspace.selectedDiagramTypes);
      setPlantUml(workspace.plantUml);
      setSvgArtifacts(workspace.svgArtifacts);
      setDiagramErrors(workspace.diagramErrors);
      setSelectedDesignDiagrams(workspace.selectedDesignDiagramTypes);
      setDesignModels(workspace.designModels);
      setDesignModelTraceability(workspace.designModelTraceability ?? []);
      setDesignPlantUml(workspace.designPlantUml);
      setDesignSvgArtifacts(workspace.designSvgArtifacts);
      setDesignDiagramErrors(workspace.designDiagramErrors);
      setCodeSpec(workspace.codeSpec);
      setCodeBusinessLogic(workspace.codeBusinessLogic);
      setCodeFiles(workspace.codeFiles);
      setCodeEntryFile(workspace.codeEntryFile);
      setCodeDependencies(workspace.codeDependencies);
      setCodeUiMockup(workspace.codeUiMockup);
      setCodeAgentPlan(workspace.codeAgentPlan);
      setCodeSkills(workspace.codeSkills);
      setCodeSkillDiagnostics(workspace.codeSkillDiagnostics);
      setCodeSkillResourcePlan(workspace.codeSkillResourcePlan);
      setCodeSkillContext(workspace.codeSkillContext);
      setCodeDiagnostics(workspace.codeDiagnostics);
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
      setRequirementModelTraceability((current) => {
        const snapshotTraceability = snapshot.requirementModelTraceability ?? [];
        if (mode.kind === "partial-diagrams") {
          const affected = new Set(mode.diagrams);
          return [
            ...current.filter((entry) => !affected.has(entry.target.diagramKind as DiagramType)),
            ...snapshotTraceability.filter((entry) =>
              affected.has(entry.target.diagramKind as DiagramType),
            ),
          ];
        }
        return snapshotTraceability;
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
      setDesignModelTraceability((current) => {
        const affected = new Set(snapshot.selectedDiagrams);
        const snapshotTraceability = snapshot.designModelTraceability ?? [];
        return [
          ...current.filter((entry) => !affected.has(entry.source.diagramKind as DesignDiagramType)),
          ...snapshotTraceability,
        ];
      });
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



  const applyRestoredSnapshot = useCallback((snapshot: RunHistorySnapshot) => {
    const restoredRulesVersion = rulesVersion + 1;
    setRequirementTextRaw(snapshot.requirementText);
    void repository.updateRequirementText(snapshot.requirementText);
    setRules("rules" in snapshot ? snapshot.rules : []);
    setRulesVersion(restoredRulesVersion);
    setRulesBasedOnTextVersion(textVersion);

    if (isDocumentRunSnapshot(snapshot)) {
      setRunUiState({
        runStatus: snapshot.status,
        runProgress:
          snapshot.status === "completed" || snapshot.status === "failed" ? 100 : 0,
        runMessage: snapshot.status === "completed" ? "已恢复说明书记录" : null,
        errorMessage: snapshot.errorMessage,
      });
      setCurrentRunDiagnostics({
        ...createEmptyDiagnostics(),
        runKind: "document",
        runId: snapshot.runId,
        activeStage: snapshot.currentStage,
        finishedAt:
          snapshot.status === "completed" || snapshot.status === "failed"
            ? new Date().toISOString()
            : null,
        streamText: snapshot.errorMessage ?? "",
      });
      return;
    }

    if (isCodeRunSnapshot(snapshot)) {
      const restoredDesignModels = Object.fromEntries(
        snapshot.designModels.map((model) => [model.diagramKind, model]),
      ) as WorkspaceRecord["designModels"];
      const restoredDesignDiagrams = snapshot.designModels.map(
        (model) => model.diagramKind,
      );

      setModels({});
      setRequirementModelTraceability([]);
      setSelectedDiagrams([]);
      setPlantUml({});
      setSvgArtifacts({});
      setDiagramErrors({});
      setGeneratedDiagrams([]);
      setDiagramVersions({});
      setSelectedDesignDiagrams(restoredDesignDiagrams);
      setDesignModels(restoredDesignModels);
      setDesignModelTraceability([]);
      setDesignPlantUml({});
      setDesignSvgArtifacts({});
      setDesignDiagramErrors({});
      setGeneratedDesignDiagrams(restoredDesignDiagrams);
      applyCodeRunSnapshot(snapshot);
    } else if (isDesignRunSnapshot(snapshot)) {
      const mapped = designSnapshotToMaps(snapshot);
      const restoredRequirementModels = Object.fromEntries(
        snapshot.requirementModels.map((model) => [model.diagramKind, model]),
      ) as WorkspaceRecord["models"];
      const restoredRequirementDiagrams = snapshot.requirementModels.map(
        (model) => model.diagramKind,
      );

      setModels(restoredRequirementModels);
      setRequirementModelTraceability(snapshot.requirementModelTraceability ?? []);
      setSelectedDiagrams(restoredRequirementDiagrams);
      setPlantUml({});
      setSvgArtifacts({});
      setDiagramErrors({});
      setGeneratedDiagrams(restoredRequirementDiagrams);
      setDiagramVersions(
        Object.fromEntries(
          restoredRequirementDiagrams.map((diagram) => [
            diagram,
            restoredRulesVersion,
          ]),
        ),
      );
      setSelectedDesignDiagrams([...snapshot.selectedDiagrams]);
      setDesignModels(mapped.models);
      setDesignModelTraceability(snapshot.designModelTraceability ?? []);
      setDesignPlantUml(mapped.plantUml);
      setDesignSvgArtifacts(mapped.svgArtifacts);
      setDesignDiagramErrors(snapshot.diagramErrors);
      setGeneratedDesignDiagrams([...snapshot.selectedDiagrams]);
      setCodeSpec(null);
      setCodeBusinessLogic(null);
      setCodeFiles({});
      setCodeEntryFile(null);
      setCodeDependencies({});
      setCodeAgentPlan([]);
      setCodeSkills([]);
      setCodeSkillDiagnostics([]);
      setCodeSkillResourcePlan(null);
      setCodeSkillContext(null);
      setCodeDiagnostics([]);
    } else {
      const mapped = snapshotToMaps(snapshot);
      setModels(mapped.models);
      setRequirementModelTraceability(snapshot.requirementModelTraceability ?? []);
      setSelectedDiagrams([...snapshot.selectedDiagrams]);
      setPlantUml(mapped.plantUml);
      setSvgArtifacts(mapped.svgArtifacts);
      setDiagramErrors(snapshot.diagramErrors);
      setGeneratedDiagrams([...snapshot.selectedDiagrams]);
      setDiagramVersions(
        Object.fromEntries(
          snapshot.selectedDiagrams.map((diagram) => [
            diagram,
            restoredRulesVersion,
          ]),
        ),
      );
      setSelectedDesignDiagrams([]);
      setDesignModels({});
      setDesignModelTraceability([]);
      setDesignPlantUml({});
      setDesignSvgArtifacts({});
      setDesignDiagramErrors({});
      setGeneratedDesignDiagrams([]);
      setCodeSpec(null);
      setCodeBusinessLogic(null);
      setCodeFiles({});
      setCodeEntryFile(null);
      setCodeDependencies({});
      setCodeAgentPlan([]);
      setCodeSkills([]);
      setCodeSkillDiagnostics([]);
      setCodeSkillResourcePlan(null);
      setCodeSkillContext(null);
      setCodeDiagnostics([]);
    }

    setRunUiState({
      runStatus: snapshot.status,
      runProgress: snapshot.status === "completed" || snapshot.status === "failed" ? 100 : 0,
      runMessage: snapshot.status === "completed" ? "已恢复历史快照" : null,
      errorMessage: snapshot.errorMessage,
    });
    setCurrentRunDiagnostics({
      ...createEmptyDiagnostics(),
      runKind: isCodeRunSnapshot(snapshot)
        ? "code"
        : isDesignRunSnapshot(snapshot)
          ? "design"
          : "requirements",
      runId: snapshot.runId,
      activeStage: snapshot.currentStage,
      finishedAt:
        snapshot.status === "completed" || snapshot.status === "failed"
          ? new Date().toISOString()
          : null,
      streamText: snapshot.errorMessage ?? "",
      uiMockup: isCodeRunSnapshot(snapshot) ? snapshot.uiMockup : null,
      uiReferenceSpec: isCodeRunSnapshot(snapshot)
        ? snapshot.uiReferenceSpec
        : null,
      uiFidelityReport: isCodeRunSnapshot(snapshot)
        ? snapshot.uiFidelityReport
        : null,
      visualDirection: isCodeRunSnapshot(snapshot)
        ? snapshot.visualDirection
        : null,
      skillResourceDiscoveryPlan: isCodeRunSnapshot(snapshot)
        ? snapshot.skillResourceDiscoveryPlan
        : null,
      skillResourcePreviews: isCodeRunSnapshot(snapshot)
        ? snapshot.skillResourcePreviews
        : null,
      skillResourcePlan: isCodeRunSnapshot(snapshot)
        ? snapshot.skillResourcePlan
        : null,
      codeSkillContext: isCodeRunSnapshot(snapshot)
        ? snapshot.codeSkillContext
        : null,
      codeTrace: isCodeRunSnapshot(snapshot)
        ? snapshot.codeTrace ?? []
        : [],
      requirementTrace:
        !isCodeRunSnapshot(snapshot) && !isDesignRunSnapshot(snapshot)
          ? snapshot.requirementTrace ?? []
          : [],
      designTrace: isDesignRunSnapshot(snapshot)
        ? snapshot.designTrace ?? []
        : [],
    });
  }, [applyCodeRunSnapshot, repository, rulesVersion, textVersion]);

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
      snapshot: RunHistorySnapshot,
      meta: { providerModel: string; durationMs?: number },
    ) => {
      try {
        await repository.saveRunHistory(snapshot, meta);
        setHistoryItems(await repository.listRunHistory());
      } catch (error) {
        console.warn("Failed to save run history snapshot", error);
        toast.message("历史快照过大，已跳过保存，不影响当前结果");
        try {
          setHistoryItems(await repository.listRunHistory());
        } catch {
          // The generated result is more important than a secondary history refresh failure.
        }
      }
    },
    [repository],
  );

  const runGeneration = useCallback(
    async (diagrams: DiagramType[], mode: RunMode) => {
      const runRequestId = runController.beginRun("requirements");
      const baseTextVersion = textVersion;
      const rulesForRun = mode.kind === "rules-only" ? [] : rules;
      const baseInputFingerprint = snapshotInputFingerprint({
        requirementText,
        rules: rulesForRun,
      });
      let lastCompletedSnapshot: WorkspaceRunSnapshot | null = null;
      let runId: string | null = null;
      const startedAtMs = Date.now();
      let providerModel = "";
      let clientTaskId: string | null = null;

      try {
        const startInput = createStartRunInput(
          requirementText,
          diagrams,
          rulesForRun.filter(
            (rule) =>
              rule.id.trim() &&
              rule.text.trim() &&
              rule.relatedDiagrams.length > 0,
          ),
        );
        providerModel = startInput.providerSettings.model;
        clientTaskId = enqueueGenerationTask({
          kind: "requirements",
          title: mode.kind === "rules-only" ? "需求规则生成" : "需求模型生成",
          providerModel,
          message: "任务已进入队列",
          startedAtMs,
        });
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("requirements");
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "requirements",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startRun(
          startInput,
        );
        runId = started.runId;
        updateGenerationTask(clientTaskId, (task) =>
          assignTaskRunId(task, runId!, providerModel),
        );
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToRun(runId, (event) => {
          if (clientTaskId) {
            updateGenerationTask(clientTaskId, (task) =>
              updateTaskFromEvent(task, event, {
                queued: "任务已进入队列",
                completed: "生成完成",
              }),
            );
          }
          if (!runController.isCurrentRun(runRequestId, "requirements")) {
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
            designTrace:
              event.type === "completed" && "designTrace" in event.snapshot
                ? event.snapshot.designTrace ?? []
                : current.designTrace,
            requirementTrace:
              event.type === "completed" && "requirementTrace" in event.snapshot
                ? event.snapshot.requirementTrace ?? []
                : current.requirementTrace,
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
        if (!snapshot || !runController.isCurrentRun(runRequestId, "requirements")) {
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
        notifyGenerationCompleted("requirements");
        if (
          baseInputFingerprint !==
          snapshotInputFingerprint({
            requirementText: latestInputRef.current.requirementText,
            rules: mode.kind === "rules-only" ? [] : latestInputRef.current.rules,
          })
        ) {
          notifyGenerationResultStale();
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "生成失败";
        if (clientTaskId) {
          updateGenerationTask(clientTaskId, (task) => ({
            ...task,
            status: "failed",
            progress: 100,
            message: null,
            errorMessage: detail,
            finishedAt: new Date().toISOString(),
            diagnostics: addLocalFailureToDiagnostics(task.diagnostics, detail),
          }));
        }
        if (!runController.isCurrentRun(runRequestId, "requirements")) {
          return;
        }
        if (runId) {
          try {
            const failedSnapshot = await repository.getRunSnapshot(runId);
            setCurrentRunDiagnostics((current) => ({
              ...current,
              requirementTrace: failedSnapshot.requirementTrace ?? current.requirementTrace,
            }));
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
        notifyGenerationFailed(error instanceof Error ? `生成失败：${error.message}` : "生成失败");
      }
    },
    [applyRunSnapshot, repository, requirementText, rules, runController, saveHistorySnapshot, textVersion],
  );

  const runDesignGeneration = useCallback(
    async (diagrams: DesignDiagramType[]) => {
      const runRequestId = runController.beginRun("design");
      let lastCompletedSnapshot: WorkspaceDesignRunSnapshot | null = null;
      const baseInputFingerprint = snapshotInputFingerprint({
        requirementText,
        rules,
        models,
        requirementModelTraceability,
      });
      let runId: string | null = null;
      const startedAtMs = Date.now();
      let providerModel = "";
      let clientTaskId: string | null = null;

      try {
        const currentRulesStale =
          rules.length > 0 &&
          rulesBasedOnTextVersion !== null &&
          rulesBasedOnTextVersion !== textVersion;
        const currentStaleDiagrams = generatedDiagrams.filter(
          (diagram) => (diagramVersions[diagram] ?? -1) !== rulesVersion,
        );
        const requirementTraceabilityComplete = hasCompleteRequirementTraceability(
          Object.values(models),
          requirementModelTraceability,
        );
        if (currentRulesStale || currentStaleDiagrams.length > 0) {
          throw new Error("需求模型基于旧需求规则，请先重新生成需求模型");
        }
        if (generatedDiagrams.length > 0 && !requirementTraceabilityComplete) {
          throw new Error("需求模型缺少完整元素级映射，请先重新生成需求模型");
        }
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
          requirementModelTraceability,
          diagrams,
        );
        providerModel = startInput.providerSettings.model;
        clientTaskId = enqueueGenerationTask({
          kind: "design",
          title: "设计模型生成",
          providerModel,
          message: "设计生成任务已进入队列",
          startedAtMs,
        });
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "设计生成任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("design");
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "design",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startDesignRun(startInput);
        runId = started.runId;
        updateGenerationTask(clientTaskId, (task) =>
          assignTaskRunId(task, runId!, providerModel),
        );
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToDesignRun(runId, (event) => {
          if (clientTaskId) {
            updateGenerationTask(clientTaskId, (task) =>
              updateTaskFromEvent(task, event, {
                queued: "设计生成任务已进入队列",
                completed: "设计生成完成",
              }),
            );
          }
          if (!runController.isCurrentRun(runRequestId, "design")) {
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
            designTrace:
              event.type === "completed" && "designTrace" in event.snapshot
                ? event.snapshot.designTrace ?? []
                : current.designTrace,
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
        if (!snapshot || !runController.isCurrentRun(runRequestId, "design")) {
          return;
        }

        applyDesignRunSnapshot(snapshot, diagrams);
        setCurrentRunDiagnostics((current) => ({
          ...current,
          designTrace: snapshot.designTrace ?? [],
        }));
        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "设计生成完成",
          errorMessage: null,
        });
        notifyGenerationCompleted("design");
        if (
          baseInputFingerprint !==
          snapshotInputFingerprint({
            requirementText: latestInputRef.current.requirementText,
            rules: latestInputRef.current.rules,
            models: latestInputRef.current.models,
            requirementModelTraceability:
              latestInputRef.current.requirementModelTraceability,
          })
        ) {
          notifyGenerationResultStale();
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "设计生成失败";
        if (clientTaskId) {
          updateGenerationTask(clientTaskId, (task) => ({
            ...task,
            status: "failed",
            progress: 100,
            message: null,
            errorMessage: detail,
            finishedAt: new Date().toISOString(),
            diagnostics: addLocalFailureToDiagnostics(task.diagnostics, detail),
          }));
        }
        if (!runController.isCurrentRun(runRequestId, "design")) {
          return;
        }
        if (runId) {
          try {
            const failedSnapshot = await repository.getDesignRunSnapshot(runId);
            applyDesignRunSnapshot(failedSnapshot, diagrams);
            setCurrentRunDiagnostics((current) => ({
              ...current,
              designTrace: failedSnapshot.designTrace ?? [],
            }));
            await saveHistorySnapshot(failedSnapshot, {
              providerModel,
              durationMs: Date.now() - startedAtMs,
            });
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
        notifyGenerationFailed(
          error instanceof Error ? `设计生成失败：${error.message}` : "设计生成失败",
        );
      }
    },
    [
      applyDesignRunSnapshot,
      diagramVersions,
      generatedDiagrams,
      models,
      repository,
      requirementModelTraceability,
      requirementText,
      runController,
      rules,
      rulesBasedOnTextVersion,
      rulesVersion,
      saveHistorySnapshot,
      textVersion,
    ],
  );

  const runCodeGeneration = useCallback(async (
    generationMode: "continue" | "regenerate" = "continue",
  ) => {
    const runRequestId = runController.beginRun("code");
    const baseInputFingerprint = snapshotInputFingerprint({
      requirementText,
      rules,
      designModels,
      designModelTraceability,
    });
    const baseCodeEditVersion = codeEditVersion;
    let lastCompletedSnapshot: WorkspaceCodeRunSnapshot | null = null;
    let runId: string | null = null;
    const startedAtMs = Date.now();
    let providerModel = "";
    let clientTaskId: string | null = null;

    try {
      if (
        !repository.startCodeRun ||
        !repository.subscribeToCodeRun ||
        !repository.getCodeRunSnapshot
      ) {
        throw new Error("当前仓储未实现代码生成能力");
      }
      const availableDesignModels = Object.values(designModels).filter(
        (model): model is DesignDiagramModelSpec => Boolean(model),
      );
      if (availableDesignModels.length === 0) {
        throw new Error("请先生成设计模型，再生成前端原型代码");
      }
      const currentRulesStale =
        rules.length > 0 &&
        rulesBasedOnTextVersion !== null &&
        rulesBasedOnTextVersion !== textVersion;
      const currentStaleDiagrams = generatedDiagrams.filter(
        (diagram) => (diagramVersions[diagram] ?? -1) !== rulesVersion,
      );
      const requirementTraceabilityComplete = hasCompleteRequirementTraceability(
        Object.values(models),
        requirementModelTraceability,
      );
      const designTraceabilityComplete = hasCompleteDesignTraceability(
        Object.values(designModels),
        designModelTraceability,
      );
      if (currentRulesStale || currentStaleDiagrams.length > 0) {
        throw new Error("需求模型基于旧需求规则，请先重新生成需求模型");
      }
      if (generatedDiagrams.length > 0 && !requirementTraceabilityComplete) {
        throw new Error("需求模型缺少完整元素级映射，请先重新生成需求模型");
      }
      if (generatedDesignDiagrams.length > 0 && !designTraceabilityComplete) {
        throw new Error("设计模型缺少完整元素级映射，请先重新生成设计模型");
      }
      const availableDesignPlantUml = Object.entries(designPlantUml)
        .filter(([, source]) => source.trim().length > 0)
        .map(([diagramKind, source]) => ({
          diagramKind: diagramKind as DesignDiagramType,
          source,
        }));

      const startInput = createStartCodeRunInput(
        requirementText,
        rules,
        availableDesignModels,
        availableDesignPlantUml,
        codeFiles,
        generationMode,
      );
      providerModel = startInput.providerSettings.model;
      clientTaskId = enqueueGenerationTask({
        kind: "code",
        title: generationMode === "regenerate" ? "代码重新生成" : "代码生成",
        providerModel,
        message: "代码生成任务已进入队列",
        startedAtMs,
      });
      setRunUiState({
        runStatus: "queued",
        runProgress: 5,
        runMessage: "代码生成任务已进入队列",
        errorMessage: null,
      });
      notifyGenerationStarted("code");
      setCurrentRunDiagnostics({
        ...createEmptyDiagnostics(),
        runKind: "code",
        providerModel,
        startedAt: new Date(startedAtMs).toISOString(),
      });

      const started = await repository.startCodeRun(startInput);
      runId = started.runId;
      updateGenerationTask(clientTaskId, (task) =>
        assignTaskRunId(task, runId!, providerModel),
      );
      setCurrentRunDiagnostics((current) => ({
        ...current,
        runId,
        providerModel,
      }));

      await repository.subscribeToCodeRun(runId, (event) => {
        if (clientTaskId) {
          updateGenerationTask(clientTaskId, (task) =>
            updateTaskFromEvent(task, event, {
              queued: "代码生成任务已进入队列",
              completed:
                event.type === "completed" &&
                "files" in event.snapshot &&
                event.snapshot.generationMode === "continue" &&
                event.snapshot.changedFileCount === 0
                  ? "本次未产生文件变更"
                  : "代码生成完成",
              fileChanged: (path) => `已写入 ${path}`,
            }),
          );
        }
        if (!runController.isCurrentRun(runRequestId, "code")) {
          return;
        }

        const progress = getProgressFromEvent(event);
        if (event.type === "completed") {
          lastCompletedSnapshot = event.snapshot as WorkspaceCodeRunSnapshot;
        }
        if (event.type === "code_file_changed") {
          setCodeFiles((current) => ({
            ...current,
            [event.path]: event.content,
          }));
          setCodeEntryFile((current) => current ?? event.path);
        }
        if (event.type === "artifact_ready" && event.artifactKind === "uiMockup") {
          setCodeUiMockup(event.uiMockup ?? null);
        }
        if (event.type === "artifact_ready" && event.artifactKind === "codeSkills") {
          setCodeSkills(event.codeSkills ?? []);
          setCodeSkillDiagnostics(event.skillDiagnostics ?? []);
        }
        if (event.type === "artifact_ready" && event.artifactKind === "skillResourcePlan") {
          setCodeSkillResourcePlan(event.skillResourcePlan ?? null);
          setCodeSkillDiagnostics(event.skillDiagnostics ?? []);
        }
        if (event.type === "artifact_ready" && event.artifactKind === "codeSkillContext") {
          setCodeSkillContext(event.codeSkillContext ?? null);
          setCodeSkillDiagnostics(event.skillDiagnostics ?? []);
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
          uiMockup:
            event.type === "artifact_ready" && event.artifactKind === "uiMockup"
              ? event.uiMockup ?? current.uiMockup
              : current.uiMockup,
          uiReferenceSpec:
            event.type === "artifact_ready" && event.artifactKind === "uiReferenceSpec"
              ? event.uiReferenceSpec ?? current.uiReferenceSpec
              : event.type === "completed" && "uiReferenceSpec" in event.snapshot
                ? event.snapshot.uiReferenceSpec ?? current.uiReferenceSpec
              : current.uiReferenceSpec,
          uiFidelityReport:
            event.type === "artifact_ready" && event.artifactKind === "uiFidelityReport"
              ? event.uiFidelityReport ?? current.uiFidelityReport
              : event.type === "completed" && "uiFidelityReport" in event.snapshot
                ? event.snapshot.uiFidelityReport ?? current.uiFidelityReport
                : current.uiFidelityReport,
          visualDirection:
            event.type === "artifact_ready" && event.artifactKind === "visualDirection"
              ? event.visualDirection ?? current.visualDirection
              : event.type === "completed" && "visualDirection" in event.snapshot
                ? event.snapshot.visualDirection ?? current.visualDirection
                : current.visualDirection,
          skillResourceDiscoveryPlan:
            event.type === "artifact_ready" && event.artifactKind === "skillResourceDiscoveryPlan"
              ? event.skillResourceDiscoveryPlan ?? current.skillResourceDiscoveryPlan
              : event.type === "completed" && "skillResourceDiscoveryPlan" in event.snapshot
                ? event.snapshot.skillResourceDiscoveryPlan ?? current.skillResourceDiscoveryPlan
                : current.skillResourceDiscoveryPlan,
          skillResourcePreviews:
            event.type === "artifact_ready" && event.artifactKind === "skillResourcePreviews"
              ? event.skillResourcePreviews ?? current.skillResourcePreviews
              : event.type === "completed" && "skillResourcePreviews" in event.snapshot
                ? event.snapshot.skillResourcePreviews ?? current.skillResourcePreviews
                : current.skillResourcePreviews,
          skillResourcePlan:
            event.type === "artifact_ready" && event.artifactKind === "skillResourcePlan"
              ? event.skillResourcePlan ?? current.skillResourcePlan
              : event.type === "completed" && "skillResourcePlan" in event.snapshot
                ? event.snapshot.skillResourcePlan ?? current.skillResourcePlan
                : current.skillResourcePlan,
          codeSkillContext:
            event.type === "artifact_ready" && event.artifactKind === "codeSkillContext"
              ? event.codeSkillContext ?? current.codeSkillContext
              : event.type === "completed" && "codeSkillContext" in event.snapshot
                ? event.snapshot.codeSkillContext ?? current.codeSkillContext
                : current.codeSkillContext,
          codeTrace:
            event.type === "completed" && "codeTrace" in event.snapshot
              ? event.snapshot.codeTrace ?? []
              : current.codeTrace,
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
            event.type === "code_file_changed"
              ? `已写入 ${event.path}`
              : event.type === "stage_progress"
                ? event.message ?? current.runMessage
                : event.type === "queued"
                  ? "代码生成任务已进入队列"
                  : event.type === "completed"
                    ? "files" in event.snapshot &&
                      event.snapshot.generationMode === "continue" &&
                      event.snapshot.changedFileCount === 0
                      ? "本次未产生文件变更"
                      : "代码生成完成"
                    : event.type === "failed"
                      ? event.message
                      : current.runMessage,
          errorMessage:
            event.type === "failed" ? event.message : current.errorMessage,
        }));
      });

      const snapshot =
        (await repository.getCodeRunSnapshot(runId)) ?? lastCompletedSnapshot;
      if (!snapshot || !runController.isCurrentRun(runRequestId, "code")) {
        return;
      }

      applyCodeRunSnapshot(snapshot);
      setCurrentRunDiagnostics((current) => ({
        ...current,
        codeTrace: snapshot.codeTrace ?? [],
      }));
      await saveHistorySnapshot(snapshot, {
        providerModel,
        durationMs: Date.now() - startedAtMs,
      });
      setRunUiState({
        runStatus: "completed",
        runProgress: 100,
        runMessage:
          snapshot.generationMode === "continue" && snapshot.changedFileCount === 0
            ? "本次未产生文件变更"
            : "代码生成完成",
        errorMessage: null,
      });
      if (snapshot.generationMode === "continue" && snapshot.changedFileCount === 0) {
        toast.message("本次未产生文件变更");
      } else {
        toast.success(
          snapshot.generationMode === "regenerate" ? "代码重新生成完成" : "代码生成完成",
        );
      }
      if (
        baseInputFingerprint !==
        snapshotInputFingerprint({
            requirementText: latestInputRef.current.requirementText,
            rules: latestInputRef.current.rules,
            designModels: latestInputRef.current.designModels,
            designModelTraceability: latestInputRef.current.designModelTraceability,
          }) ||
          baseCodeEditVersion !== latestInputRef.current.codeEditVersion
      ) {
        notifyGenerationResultStale();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "代码生成失败";
      if (clientTaskId) {
        updateGenerationTask(clientTaskId, (task) => ({
          ...task,
          status: "failed",
          progress: 100,
          message: null,
          errorMessage: detail,
          finishedAt: new Date().toISOString(),
          diagnostics: addLocalFailureToDiagnostics(task.diagnostics, detail),
        }));
      }
      if (!runController.isCurrentRun(runRequestId, "code")) {
        return;
      }
      if (runId && repository.getCodeRunSnapshot) {
        try {
          const failedSnapshot = await repository.getCodeRunSnapshot(runId);
          applyCodeRunSnapshot(failedSnapshot);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            codeTrace: failedSnapshot.codeTrace ?? current.codeTrace,
          }));
          await saveHistorySnapshot(failedSnapshot, {
            providerModel,
            durationMs: Date.now() - startedAtMs,
          });
        } catch {
          // The visible error state below is more useful than a secondary snapshot failure.
        }
      }
      setRunUiState({
        runStatus: "failed",
        runProgress: 100,
        runMessage: null,
        errorMessage: error instanceof Error ? error.message : "代码生成失败",
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
            detail: error instanceof Error ? error.message : "代码生成失败",
          },
        ].slice(-80),
      }));
      notifyGenerationFailed(
        error instanceof Error ? `代码生成失败：${error.message}` : "代码生成失败",
      );
    }
  }, [
    applyCodeRunSnapshot,
    codeFiles,
    codeEditVersion,
    designModelTraceability,
    designModels,
    designPlantUml,
    diagramVersions,
    generatedDesignDiagrams,
    generatedDiagrams,
    models,
    repository,
    requirementModelTraceability,
    requirementText,
    runController,
    rules,
    rulesBasedOnTextVersion,
    rulesVersion,
    saveHistorySnapshot,
    textVersion,
  ]);

  const runDocumentGeneration = useCallback(
    async (documentKind: DocumentKind, documentStyle?: DocumentStyleSettings) => {
      const startedAtMs = Date.now();
      let providerModel = "";
      let runId: string | null = null;
      let lastCompletedSnapshot: DocumentRunSnapshot | null = null;
      let clientTaskId: string | null = null;

      try {
        if (
          !repository.startDocumentRun ||
          !repository.subscribeToDocumentRun ||
          !repository.getDocumentRunSnapshot
        ) {
          throw new Error("当前仓储未实现说明书生成能力");
        }

        const requirementModels = Object.values(models).filter(
          (model): model is DiagramModelSpec => Boolean(model),
        );
        const requirementPlantUml = Object.entries(plantUml)
          .filter((entry): entry is [DiagramType, string] => Boolean(entry[1]))
          .map(([diagramKind, source]) => ({ diagramKind, source }));
        const requirementSvgArtifacts = Object.values(svgArtifacts).filter(
          (artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact),
        );
        const availableDesignModels = Object.values(designModels).filter(
          (model): model is DesignDiagramModelSpec => Boolean(model),
        );
        const designPlantUmlList = Object.entries(designPlantUml)
          .filter((entry): entry is [DesignDiagramType, string] => Boolean(entry[1]))
          .map(([diagramKind, source]) => ({ diagramKind, source }));
        const designSvgArtifactList = Object.values(designSvgArtifacts).filter(
          (artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact),
        );

        if (documentKind === "requirementsSpec" && requirementModels.length === 0) {
          throw new Error("请先在需求页生成需求模型，再导出需求规格说明书");
        }
        if (documentKind === "softwareDesignSpec" && availableDesignModels.length === 0) {
          throw new Error("请先在设计页生成设计模型，再导出软件设计说明书");
        }
        const currentRulesStale =
          rules.length > 0 &&
          rulesBasedOnTextVersion !== null &&
          rulesBasedOnTextVersion !== textVersion;
        const currentStaleDiagrams = generatedDiagrams.filter(
          (diagram) => (diagramVersions[diagram] ?? -1) !== rulesVersion,
        );
        const requirementTraceabilityComplete = hasCompleteRequirementTraceability(
          Object.values(models),
          requirementModelTraceability,
        );
        const designTraceabilityComplete = hasCompleteDesignTraceability(
          Object.values(designModels),
          designModelTraceability,
        );
        if (
          documentKind === "requirementsSpec" &&
          (currentRulesStale ||
            currentStaleDiagrams.length > 0 ||
            (generatedDiagrams.length > 0 && !requirementTraceabilityComplete))
        ) {
          throw new Error("需求模型或元素级映射已过期，请先重新生成需求模型");
        }
        if (
          documentKind === "softwareDesignSpec" &&
          (currentRulesStale ||
            currentStaleDiagrams.length > 0 ||
            (generatedDiagrams.length > 0 && !requirementTraceabilityComplete) ||
            (generatedDesignDiagrams.length > 0 && !designTraceabilityComplete))
        ) {
          throw new Error("设计链路或元素级映射已过期，请先重新生成需求模型和设计模型");
        }

        const startInput = createStartDocumentRunInput(
          documentKind,
          requirementText,
          rules,
          requirementModels,
          requirementPlantUml,
          requirementSvgArtifacts,
          availableDesignModels,
          designPlantUmlList,
          designSvgArtifactList,
          documentStyle,
        );
        providerModel = startInput.providerSettings.model;
        const documentTitle =
          documentKind === "requirementsSpec"
            ? "需求规格说明书"
            : "软件设计说明书";
        clientTaskId = enqueueGenerationTask({
          kind: "document",
          documentKind,
          title: documentTitle,
          providerModel,
          message: `${documentTitle}生成任务已进入队列`,
          startedAtMs,
        });
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "说明书生成任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("document", documentKind);
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "document",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startDocumentRun(startInput);
        runId = started.runId;
        updateGenerationTask(clientTaskId, (task) =>
          assignTaskRunId(task, runId!, providerModel),
        );
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToDocumentRun(runId, (event) => {
          const progress = getProgressFromEvent(event);
          if (event.type === "completed" && "documentKind" in event.snapshot) {
            lastCompletedSnapshot = event.snapshot;
          }
          if (clientTaskId) {
            updateGenerationTask(clientTaskId, (task) =>
              updateTaskFromEvent(task, event, {
                queued: `${documentTitle}生成任务已进入队列`,
                completed: `${documentTitle}生成完成`,
              }),
            );
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt:
              event.type === "completed" || event.type === "failed"
                ? diagnosticEvent.at
                : current.finishedAt,
            activeStage: "stage" in event ? event.stage : current.activeStage,
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
                  ? "说明书生成任务已进入队列"
                  : event.type === "completed"
                    ? "说明书生成完成"
                    : event.type === "failed"
                      ? event.message
                      : current.runMessage,
            errorMessage:
              event.type === "failed" ? event.message : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getDocumentRunSnapshot(runId)) ?? lastCompletedSnapshot;
        if (!snapshot) {
          return null;
        }

        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "说明书生成完成",
          errorMessage: null,
        });
        toast.success(`${snapshot.fileName ?? `${documentTitle}.docx`} 已生成`);
        return snapshot;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "说明书生成失败";
        if (clientTaskId) {
          updateGenerationTask(clientTaskId, (task) => ({
            ...task,
            status: "failed",
            progress: 100,
            message: null,
            errorMessage: detail,
            finishedAt: new Date().toISOString(),
            diagnostics: addLocalFailureToDiagnostics(task.diagnostics, detail),
          }));
        }
        if (runId && repository.getDocumentRunSnapshot) {
          try {
            const failedSnapshot = await repository.getDocumentRunSnapshot(runId);
            await saveHistorySnapshot(failedSnapshot, {
              providerModel,
              durationMs: Date.now() - startedAtMs,
            });
          } catch {
            // The visible error state below is more useful than a secondary snapshot failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: error instanceof Error ? error.message : "说明书生成失败",
        });
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local-document`,
              at: new Date().toISOString(),
              label: "任务失败",
              detail: error instanceof Error ? error.message : "说明书生成失败",
            },
          ].slice(-80),
        }));
        notifyGenerationFailed(
          error instanceof Error
            ? `说明书生成失败：${error.message}`
            : "说明书生成失败",
        );
        return null;
      }
    },
    [
      designModelTraceability,
      designModels,
      designPlantUml,
      designSvgArtifacts,
      diagramVersions,
      generatedDesignDiagrams,
      generatedDiagrams,
      models,
      plantUml,
      repository,
      requirementModelTraceability,
      requirementText,
      runController,
      rules,
      rulesBasedOnTextVersion,
      rulesVersion,
      saveHistorySnapshot,
      svgArtifacts,
      textVersion,
    ],
  );

  const generateRequirementsSpec = useCallback(async (documentStyle?: DocumentStyleSettings) => {
    return runDocumentGeneration("requirementsSpec", documentStyle);
  }, [runDocumentGeneration]);

  const generateSoftwareDesignSpec = useCallback(async (documentStyle?: DocumentStyleSettings) => {
    return runDocumentGeneration("softwareDesignSpec", documentStyle);
  }, [runDocumentGeneration]);

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
            message: error instanceof Error ? error.message : "图源码渲染失败",
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

  const generateCodePrototype = useCallback(async (
    mode: "continue" | "regenerate" = "continue",
  ) => {
    await runCodeGeneration(mode);
  }, [runCodeGeneration]);

  const isRulesStale =
    rules.length > 0 &&
    rulesBasedOnTextVersion !== null &&
    rulesBasedOnTextVersion !== textVersion;

  const staleDiagrams = generatedDiagrams.filter(
    (diagram) => (diagramVersions[diagram] ?? -1) !== rulesVersion,
  );
  const requirementTraceabilityComplete = hasCompleteRequirementTraceability(
    Object.values(models),
    requirementModelTraceability,
  );
  const designTraceabilityComplete = hasCompleteDesignTraceability(
    Object.values(designModels),
    designModelTraceability,
  );
  const requirementTraceabilityStale =
    generatedDiagrams.length > 0 &&
    (isRulesStale || staleDiagrams.length > 0 || !requirementTraceabilityComplete);
  const designTraceabilityStale =
    generatedDesignDiagrams.length > 0 &&
    (requirementTraceabilityStale || !designTraceabilityComplete);
  const designGenerationBlockedReason =
    isRulesStale || staleDiagrams.length > 0
      ? "需求模型基于旧需求规则，请先重新生成需求模型"
      : generatedDiagrams.length > 0 && !requirementTraceabilityComplete
        ? "需求模型缺少完整元素级映射，请先重新生成需求模型"
        : null;

  const visibleGenerationTask = useMemo(() => {
    if (selectedGenerationTaskId) {
      const selected = generationTasks.find(
        (task) => task.clientTaskId === selectedGenerationTaskId,
      );
      if (selected) return selected;
    }
    return generationTasks.find(isTaskActive) ?? generationTasks[0] ?? null;
  }, [generationTasks, selectedGenerationTaskId]);

  const visibleRunStatus = visibleGenerationTask?.status ?? runUiState.runStatus;
  const visibleRunProgress = visibleGenerationTask?.progress ?? runUiState.runProgress;
  const visibleRunMessage = visibleGenerationTask?.message ?? runUiState.runMessage;
  const visibleErrorMessage =
    visibleGenerationTask?.errorMessage ?? runUiState.errorMessage;
  const visibleRunDiagnostics =
    visibleGenerationTask?.diagnostics ?? currentRunDiagnostics;

  const generating = generationTasks.some(
    (task) => task.kind !== "document" && isTaskActive(task),
  );

  const value = useMemo<WorkspaceSessionState>(
    () => ({
      requirementText,
      setRequirementText,
      rules,
      addRequirementRule,
      createRequirementRule,
      updateRequirementRule,
      deleteRequirementRule,
      clearRequirementRules,
      models,
      requirementModelTraceability,
      selectedDiagrams,
      setSelectedDiagrams,
      plantUml,
      svgArtifacts,
      diagramErrors,
      selectedDesignDiagrams,
      setSelectedDesignDiagrams,
      designModels,
      designModelTraceability,
      designPlantUml,
      designSvgArtifacts,
      designDiagramErrors,
      codeSpec,
      codeBusinessLogic,
      codeFiles,
      codeEntryFile,
      codeDependencies,
      codeUiMockup,
      codeAgentPlan,
      codeSkills,
      codeSkillDiagnostics,
      codeSkillResourcePlan,
      codeSkillContext,
      codeDiagnostics,
      updateCodeFile,
      generatedDesignDiagrams,
      generatedDiagrams,
      generating,
      runStatus: visibleRunStatus,
      runProgress: visibleRunProgress,
      runMessage: visibleRunMessage,
      errorMessage: visibleErrorMessage,
      generationTasks,
      selectedGenerationTaskId: visibleGenerationTask?.clientTaskId ?? null,
      selectGenerationTask,
      clearCompletedGenerationTasks,
      generateRules,
      generateDiagrams,
      generateDesignDiagrams,
      generateCodePrototype,
      generateRequirementsSpec,
      generateSoftwareDesignSpec,
      rulesForDiagram,
      textVersion,
      rulesVersion,
      rulesBasedOnTextVersion,
      diagramVersions,
      isRulesStale,
      staleDiagrams,
      requirementTraceabilityStale,
      designTraceabilityStale,
      designGenerationBlockedReason,
      historyItems,
      refreshHistory,
      restoreRunHistory,
      deleteRunHistory,
      clearRunHistory,
      renderPlantUml,
      currentRunDiagnostics: visibleRunDiagnostics,
    }),
    [
      requirementText,
      setRequirementText,
      rules,
      addRequirementRule,
      createRequirementRule,
      updateRequirementRule,
      deleteRequirementRule,
      clearRequirementRules,
      models,
      requirementModelTraceability,
      selectedDiagrams,
      plantUml,
      svgArtifacts,
      diagramErrors,
      selectedDesignDiagrams,
      designModels,
      designModelTraceability,
      designPlantUml,
      designSvgArtifacts,
      designDiagramErrors,
      codeSpec,
      codeBusinessLogic,
      codeFiles,
      codeEntryFile,
      codeDependencies,
      codeUiMockup,
      codeAgentPlan,
      codeSkills,
      codeSkillDiagnostics,
      codeSkillResourcePlan,
      codeSkillContext,
      codeDiagnostics,
      updateCodeFile,
      generatedDesignDiagrams,
      generatedDiagrams,
      generating,
      runUiState,
      visibleRunStatus,
      visibleRunProgress,
      visibleRunMessage,
      visibleErrorMessage,
      generationTasks,
      visibleGenerationTask,
      selectGenerationTask,
      clearCompletedGenerationTasks,
      generateRules,
      generateDiagrams,
      generateDesignDiagrams,
      generateCodePrototype,
      generateRequirementsSpec,
      generateSoftwareDesignSpec,
      rulesForDiagram,
      textVersion,
      rulesVersion,
      rulesBasedOnTextVersion,
      diagramVersions,
      isRulesStale,
      staleDiagrams,
      requirementTraceabilityStale,
      designTraceabilityStale,
      designGenerationBlockedReason,
      historyItems,
      refreshHistory,
      restoreRunHistory,
      deleteRunHistory,
      clearRunHistory,
      renderPlantUml,
      visibleRunDiagnostics,
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
