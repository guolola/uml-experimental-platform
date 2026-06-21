// Normalizes workspace records and merges saved run snapshots into repository state.
import {
  designDiagramKindFromRecordKey,
  designRecordBelongsToDiagramKinds,
  designTraceabilityTouchesDiagramKinds,
  type CodeRunSnapshot,
  type DesignRunSnapshot,
  type RequirementBaseline,
  type RunSnapshot,
} from "@uml-platform/contracts";
import {
  getDesignArtifactId,
  getDesignModelId,
  getRequirementArtifactId,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../entities/diagram/model";
import {
  isCodeRunSnapshot,
  isDesignRunSnapshot,
  isDocumentRunSnapshot,
  type RunHistorySnapshot,
} from "../../entities/run-history";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../entities/workspace/model";
import {
  designInputFingerprint,
  normalizeSnapshotFingerprint,
  snapshotInputFingerprint,
} from "../../shared/lib/fingerprint";

function requirementInputFingerprint(
  requirementText: string,
  rules: RequirementRule[],
) {
  return snapshotInputFingerprint({ requirementText, rules });
}

function fingerprintMatches(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return normalizeSnapshotFingerprint(storedFingerprint) === currentFingerprint;
}

function shouldPreserveCodeWorkspaceOnSnapshot(snapshot: CodeRunSnapshot) {
  if (snapshot.generationMode !== "regenerate") return false;
  if (snapshot.status === "cancelled") return true;
  return snapshot.status === "failed" && Object.keys(snapshot.files).length === 0;
}

function hasWholeDesignDiagramError(
  diagramErrors: DesignRunSnapshot["diagramErrors"],
  diagram: DesignDiagramType,
) {
  return Object.keys(diagramErrors).some((key) => {
    if (key === diagram) return true;
    if (key.startsWith(`${diagram}:`)) return false;
    return designDiagramKindFromRecordKey(key) === diagram;
  });
}

function successfulDesignDiagramsFromSnapshot(
  snapshot: DesignRunSnapshot,
  designRecords: ReturnType<typeof mapDesignSnapshotToRecords>,
) {
  const selectedDesignDiagrams = new Set(snapshot.selectedDiagrams);
  const artifactDesignDiagrams = Array.from(
    new Set(
      snapshot.svgArtifacts
        .filter((artifact) => {
          if (!selectedDesignDiagrams.has(artifact.diagramKind)) return false;
          if (hasWholeDesignDiagramError(snapshot.diagramErrors, artifact.diagramKind)) {
            return false;
          }
          const artifactId = artifact.modelId ?? artifact.diagramKind;
          return !snapshot.diagramErrors[artifactId];
        })
        .map((artifact) => artifact.diagramKind),
    ),
  );
  const modelDesignDiagrams = Array.from(
    new Set(
      Object.values(designRecords.modelMap)
        .filter((model) => {
          if (!selectedDesignDiagrams.has(model.diagramKind)) return false;
          if (hasWholeDesignDiagramError(snapshot.diagramErrors, model.diagramKind)) {
            return false;
          }
          return !snapshot.diagramErrors[getDesignModelId(model)];
        })
        .map((model) => model.diagramKind),
    ),
  );
  const successful = new Set([...artifactDesignDiagrams, ...modelDesignDiagrams]);
  return snapshot.selectedDiagrams.filter((diagram) => successful.has(diagram));
}

type RequirementReviewCandidate =
  WorkspaceRecord["requirementReviewCandidates"][string];

function reviewCandidateStillNeeded(
  baseline: RequirementBaseline,
  ruleId: string,
) {
  const qualityIssueRequirementIds = new Set(
    baseline.qualityReport.issues.map((issue) => issue.requirementId),
  );
  const reviewRequiredRequirementIds = new Set(
    baseline.qualityReport.reviewRequiredRequirementIds,
  );
  return baseline.requirements.some((requirement) => {
    if (requirement.sourceRuleId !== ruleId) return false;
    if (reviewRequiredRequirementIds.has(requirement.id)) return true;
    if (qualityIssueRequirementIds.has(requirement.id)) return true;
    if (requirement.status !== "accepted") return true;
    return Object.values(requirement.fieldProvenance).some(
      (provenance) =>
        provenance?.status === "pending-review" ||
        provenance?.status === "rejected",
    );
  });
}

function pruneRequirementReviewCandidatesForBaseline(
  candidates: WorkspaceRecord["requirementReviewCandidates"],
  baseline: RequirementBaseline,
) {
  const next = { ...candidates };
  for (const [ruleId, candidate] of Object.entries(next) as Array<
    [string, RequirementReviewCandidate]
  >) {
    if (
      (candidate.status === "pending" || candidate.status === "failed") &&
      !reviewCandidateStillNeeded(baseline, ruleId)
    ) {
      delete next[ruleId];
    }
  }
  return next;
}

function applyRequirementBaselineToWorkspace(
  workspace: WorkspaceRecord,
  baseline: RequirementBaseline,
) {
  workspace.requirementBaseline = baseline;
  workspace.requirementQualityReport = baseline.qualityReport;
  workspace.requirementReviewCandidates =
    pruneRequirementReviewCandidatesForBaseline(
      workspace.requirementReviewCandidates,
      baseline,
    );
}

export function createEmptyWorkspace(): WorkspaceRecord {
  return {
    id: "workspace-default",
    name: "软件工程实训平台",
    requirementText: "",
    selectedDiagramTypes: [],
    rules: [],
    requirementBaseline: null,
    requirementQualityReport: null,
    requirementReviewCandidates: {},
    autoGeneratedUpstreamReviews: {},
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
    requirementInputFingerprint: null,
    diagramInputFingerprints: {},
    designInputFingerprints: {},
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

export function cloneWorkspace(workspace: WorkspaceRecord): WorkspaceRecord {
  return structuredClone(workspace) as WorkspaceRecord;
}

type UseCaseScopedDiagram = "analysis" | "sequence";

function stringProperty(value: unknown, key: string) {
  if (!value || typeof value !== "object") return "";
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function currentUseCaseIds(models: WorkspaceRecord["models"]): Set<string> | null {
  const useCaseModel = models.usecase;
  if (!useCaseModel || typeof useCaseModel !== "object") return null;
  const useCases = (useCaseModel as { useCases?: unknown }).useCases;
  if (!Array.isArray(useCases)) return null;
  return new Set(
    useCases
      .map((useCase) => stringProperty(useCase, "id"))
      .filter(Boolean),
  );
}

function scopedSourceUseCaseId(
  recordKey: string,
  model: unknown,
  prefix: UseCaseScopedDiagram,
) {
  const explicit = stringProperty(model, "sourceUseCaseId");
  if (explicit) return explicit;
  const modelId = stringProperty(model, "modelId") || recordKey;
  return modelId.startsWith(`${prefix}:`) ? modelId.slice(prefix.length + 1) : "";
}

function isOrphanUseCaseScopedRecord(
  recordKey: string,
  model: unknown,
  prefix: UseCaseScopedDiagram,
  validUseCaseIds: Set<string>,
) {
  const diagramKind = stringProperty(model, "diagramKind");
  const scoped =
    recordKey.startsWith(`${prefix}:`) ||
    stringProperty(model, "modelId").startsWith(`${prefix}:`) ||
    diagramKind === prefix;
  if (!scoped) return false;
  const sourceUseCaseId = scopedSourceUseCaseId(recordKey, model, prefix);
  return Boolean(sourceUseCaseId && !validUseCaseIds.has(sourceUseCaseId));
}

function omitRecordKeys<T extends Record<string, unknown>>(
  record: T,
  deletedKeys: Set<string>,
) {
  if (deletedKeys.size === 0) return record;
  const next = { ...record };
  for (const key of deletedKeys) {
    delete next[key];
  }
  return next as T;
}

function cleanRequirementTraceability(
  traceability: WorkspaceRecord["requirementModelTraceability"],
  deletedModelIds: Set<string>,
) {
  if (deletedModelIds.size === 0) return traceability;
  return traceability.filter((entry) => {
    const modelId = entry.target.modelId;
    return !modelId || !deletedModelIds.has(modelId);
  });
}

function cleanDesignTraceability(
  traceability: WorkspaceRecord["designModelTraceability"],
  deletedModelIds: Set<string>,
  validUseCaseIds: Set<string>,
) {
  if (deletedModelIds.size === 0) return traceability;
  return traceability.flatMap((entry) => {
    if (entry.source.modelId && deletedModelIds.has(entry.source.modelId)) {
      return [];
    }
    if (
      entry.source.diagramKind === "usecase" &&
      !validUseCaseIds.has(entry.source.elementId)
    ) {
      return [];
    }
    const targets = entry.targets.filter(
      (target) => !target.modelId || !deletedModelIds.has(target.modelId),
    );
    if (targets.length === 0) return [];
    const upstreamDesignRefs = entry.upstreamDesignRefs?.filter(
      (target) => !target.modelId || !deletedModelIds.has(target.modelId),
    );
    return [
      {
        ...entry,
        targets,
        ...(upstreamDesignRefs ? { upstreamDesignRefs } : {}),
      },
    ];
  });
}

function hasRequirementDiagramRecord(
  workspace: WorkspaceRecord,
  diagramKind: DiagramType,
) {
  return (
    Boolean(workspace.models[diagramKind]) ||
    Boolean(workspace.plantUml[diagramKind]) ||
    Boolean(workspace.svgArtifacts[diagramKind]) ||
    Boolean(workspace.diagramErrors[diagramKind]) ||
    Object.entries(workspace.models).some(
      ([key, model]) => key.startsWith(`${diagramKind}:`) || model?.diagramKind === diagramKind,
    ) ||
    Object.keys(workspace.plantUml).some((key) => key.startsWith(`${diagramKind}:`)) ||
    Object.keys(workspace.svgArtifacts).some((key) => key.startsWith(`${diagramKind}:`)) ||
    Object.keys(workspace.diagramErrors).some((key) => key.startsWith(`${diagramKind}:`))
  );
}

function hasDesignDiagramRecord(
  workspace: WorkspaceRecord,
  diagramKind: DesignDiagramType,
) {
  return (
    Boolean(workspace.designModels[diagramKind]) ||
    Boolean(workspace.designPlantUml[diagramKind]) ||
    Boolean(workspace.designSvgArtifacts[diagramKind]) ||
    Boolean(workspace.designDiagramErrors[diagramKind]) ||
    Object.entries(workspace.designModels).some(
      ([key, model]) => key.startsWith(`${diagramKind}:`) || model.diagramKind === diagramKind,
    ) ||
    Object.keys(workspace.designPlantUml).some((key) => key.startsWith(`${diagramKind}:`)) ||
    Object.keys(workspace.designSvgArtifacts).some((key) => key.startsWith(`${diagramKind}:`)) ||
    Object.keys(workspace.designDiagramErrors).some((key) => key.startsWith(`${diagramKind}:`))
  );
}

function pruneUseCaseScopedWorkspace(workspace: WorkspaceRecord): WorkspaceRecord {
  const validUseCaseIds = currentUseCaseIds(workspace.models);
  if (!validUseCaseIds) return workspace;

  const deletedRequirementModelIds = new Set(
    Object.entries(workspace.models)
      .filter(([modelId, model]) =>
        isOrphanUseCaseScopedRecord(modelId, model, "analysis", validUseCaseIds),
      )
      .map(([modelId]) => modelId),
  );
  const deletedDesignModelIds = new Set(
    Object.entries(workspace.designModels)
      .filter(([modelId, model]) =>
        isOrphanUseCaseScopedRecord(modelId, model, "sequence", validUseCaseIds),
      )
      .map(([modelId]) => modelId),
  );
  if (deletedRequirementModelIds.size === 0 && deletedDesignModelIds.size === 0) {
    return workspace;
  }

  const next: WorkspaceRecord = {
    ...workspace,
    models: omitRecordKeys(workspace.models, deletedRequirementModelIds),
    plantUml: omitRecordKeys(workspace.plantUml, deletedRequirementModelIds),
    svgArtifacts: omitRecordKeys(workspace.svgArtifacts, deletedRequirementModelIds),
    diagramErrors: omitRecordKeys(workspace.diagramErrors, deletedRequirementModelIds),
    diagramInputFingerprints: omitRecordKeys(
      workspace.diagramInputFingerprints as Record<string, unknown>,
      deletedRequirementModelIds,
    ) as WorkspaceRecord["diagramInputFingerprints"],
    diagramVersions: omitRecordKeys(
      workspace.diagramVersions as Record<string, unknown>,
      deletedRequirementModelIds,
    ) as WorkspaceRecord["diagramVersions"],
    requirementModelTraceability: cleanRequirementTraceability(
      workspace.requirementModelTraceability,
      deletedRequirementModelIds,
    ),
    designModels: omitRecordKeys(workspace.designModels, deletedDesignModelIds),
    designPlantUml: omitRecordKeys(workspace.designPlantUml, deletedDesignModelIds),
    designSvgArtifacts: omitRecordKeys(
      workspace.designSvgArtifacts,
      deletedDesignModelIds,
    ),
    designDiagramErrors: omitRecordKeys(
      workspace.designDiagramErrors,
      deletedDesignModelIds,
    ),
    designInputFingerprints: omitRecordKeys(
      workspace.designInputFingerprints,
      deletedDesignModelIds,
    ),
    manualModelEditStatus: omitRecordKeys(
      workspace.manualModelEditStatus,
      new Set([...deletedRequirementModelIds, ...deletedDesignModelIds]),
    ),
    designModelTraceability: cleanDesignTraceability(
      workspace.designModelTraceability,
      deletedDesignModelIds,
      validUseCaseIds,
    ),
  };

  if (!hasRequirementDiagramRecord(next, "analysis")) {
    next.generatedDiagramTypes = next.generatedDiagramTypes.filter(
      (diagram) => diagram !== "analysis",
    );
  }
  if (!hasDesignDiagramRecord(next, "sequence")) {
    next.generatedDesignDiagramTypes = next.generatedDesignDiagramTypes.filter(
      (diagram) => diagram !== "sequence",
    );
  }
  return next;
}

export function mergeWorkspaceState(state?: Partial<WorkspaceRecord>): WorkspaceRecord {
  return pruneUseCaseScopedWorkspace({
    ...createEmptyWorkspace(),
    ...(state ?? {}),
  });
}

export function applySnapshotToWorkspace(
  workspace: WorkspaceRecord,
  snapshot: RunHistorySnapshot,
): WorkspaceRecord {
  const next = cloneWorkspace(workspace);
  const currentHasRequirementText = next.requirementText.trim().length > 0;
  const currentHasRequirements =
    next.requirementText.trim().length > 0 || next.rules.length > 0;
  if (
    !currentHasRequirementText &&
    snapshot.requirementText.trim().length > 0
  ) {
    next.requirementText = snapshot.requirementText;
  }
  next.runStatus = "idle";
  next.runProgress = 0;
  next.currentStage = null;
  next.runMessage = null;
  next.errorMessage = null;

  if (isDocumentRunSnapshot(snapshot)) {
    return next;
  }

  const snapshotRequirementFingerprint = requirementInputFingerprint(
    snapshot.requirementText,
    snapshot.rules,
  );
  const isRequirementSnapshot =
    !isCodeRunSnapshot(snapshot) && !isDesignRunSnapshot(snapshot);
  const isRulesOnlyRequirementSnapshot =
    isRequirementSnapshot &&
    snapshot.selectedDiagrams.length === 0 &&
    snapshot.models.length === 0 &&
    snapshot.plantUml.length === 0 &&
    snapshot.svgArtifacts.length === 0 &&
    Object.keys(snapshot.diagramErrors).length === 0;
  if (isRulesOnlyRequirementSnapshot || !currentHasRequirements) {
    next.requirementText = snapshot.requirementText;
    next.rules = [...snapshot.rules];
  }
  const workspaceRequirementFingerprint = requirementInputFingerprint(
    next.requirementText,
    next.rules,
  );
  if (
    snapshot.requirementBaseline &&
    (!currentHasRequirements ||
      fingerprintMatches(
        snapshotRequirementFingerprint,
        workspaceRequirementFingerprint,
      ))
  ) {
    applyRequirementBaselineToWorkspace(next, snapshot.requirementBaseline);
  }

  if (isCodeRunSnapshot(snapshot)) {
    next.designModels = Object.fromEntries(
      snapshot.designModels.map((model) => [getDesignModelId(model), model]),
    ) as WorkspaceRecord["designModels"];
    next.designModelTraceability = [];
    next.designPlantUml = Object.fromEntries(
      snapshot.designPlantUml.map((artifact) => [
        getDesignArtifactId(artifact),
        artifact.source,
      ]),
    ) as WorkspaceRecord["designPlantUml"];
    next.designSvgArtifacts = {};
    next.designDiagramErrors = {};
    next.generatedDesignDiagramTypes = Array.from(
      new Set(snapshot.designModels.map((model) => model.diagramKind)),
    );
    next.designInputFingerprints = {};
    next.selectedDiagramTypes = [];
    next.selectedDesignDiagramTypes = [];
    next.codeSpec = snapshot.spec;
    next.codeBusinessLogic = snapshot.businessLogic;
    if (!shouldPreserveCodeWorkspaceOnSnapshot(snapshot)) {
      next.codeFiles = { ...snapshot.files };
      next.codeEntryFile = snapshot.entryFile;
      next.codeDependencies = { ...snapshot.dependencies };
    }
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
    const erroredDesignDiagrams = new Set(
      Object.keys(snapshot.diagramErrors)
        .map(designDiagramKindFromRecordKey)
        .filter((diagram): diagram is DesignDiagramType => Boolean(diagram)),
    );
    const successfulAffectedDesignDiagrams =
      successfulDesignDiagramsFromSnapshot(snapshot, designRecords);
    const affectedForErrors = Array.from(
      new Set([
        ...snapshot.selectedDiagrams,
        ...successfulAffectedDesignDiagrams,
        ...erroredDesignDiagrams,
      ]),
    );
    const affectedDesignModelIds = Object.entries(next.designModels)
      .filter(([modelId, model]) =>
        designRecordBelongsToDiagramKinds(
          modelId,
          model,
          successfulAffectedDesignDiagrams,
        ),
      )
      .map(([modelId]) => modelId);
    const affectedDesignModelMap = keepDesignScopedRecord(
      designRecords.modelMap,
      successfulAffectedDesignDiagrams,
    );
    const requirementDiagrams = snapshot.requirementModels.map(
      (model) => model.diagramKind,
    );
    const currentRequirementVersion = fingerprintMatches(
      next.requirementInputFingerprint,
      workspaceRequirementFingerprint,
    )
      ? next.rulesVersion
      : next.rulesVersion + 1;
    const currentDesignFingerprint = designInputFingerprint(
      snapshot.requirementModels,
      snapshot.requirementModelTraceability,
    );
    next.selectedDesignDiagramTypes = [];
    if (successfulAffectedDesignDiagrams.length > 0) {
      next.designModels = {
        ...clearDesignScopedRecord(
          next.designModels,
          successfulAffectedDesignDiagrams,
        ),
        ...affectedDesignModelMap,
      };
    }
    next.designModelTraceability = mergeDesignTraceability(
      next.designModelTraceability,
      snapshot.designModelTraceability,
      successfulAffectedDesignDiagrams,
      affectedDesignModelIds,
    );
    next.generatedDesignDiagramTypes = Array.from(
      new Set([
        ...next.generatedDesignDiagramTypes,
        ...successfulAffectedDesignDiagrams,
      ]),
    );
    if (successfulAffectedDesignDiagrams.length > 0) {
      next.designInputFingerprints = {
        ...clearDesignScopedRecord(
          next.designInputFingerprints,
          successfulAffectedDesignDiagrams,
        ),
        ...Object.fromEntries(
          Object.keys(affectedDesignModelMap).map((modelId) => [
            modelId,
            currentDesignFingerprint,
          ]),
        ),
      };
      next.designPlantUml = {
        ...clearDesignScopedRecord(
          next.designPlantUml,
          successfulAffectedDesignDiagrams,
        ),
        ...keepDesignScopedRecord(
          designRecords.plantUmlMap,
          successfulAffectedDesignDiagrams,
        ),
      };
      next.designSvgArtifacts = {
        ...clearDesignScopedRecord(
          next.designSvgArtifacts,
          successfulAffectedDesignDiagrams,
        ),
        ...keepDesignScopedRecord(
          designRecords.svgMap,
          successfulAffectedDesignDiagrams,
        ),
      };
    }
    next.designDiagramErrors = clearAndMergeDiagramErrors(
      next.designDiagramErrors,
      snapshot.diagramErrors,
      affectedForErrors,
    );
    next.models = {
      ...clearRequirementScopedRecord(next.models, requirementDiagrams),
      ...(Object.fromEntries(
        snapshot.requirementModels.map((model) => [
          getRequirementModelId(model),
          model,
        ]),
      ) as WorkspaceRecord["models"]),
    };
    next.requirementModelTraceability = mergeRequirementTraceability(
      next.requirementModelTraceability,
      snapshot.requirementModelTraceability,
      requirementDiagrams,
    );
    next.selectedDiagramTypes = [];
    next.generatedDiagramTypes = Array.from(
      new Set([...next.generatedDiagramTypes, ...requirementDiagrams]),
    );
    next.requirementInputFingerprint = workspaceRequirementFingerprint;
    next.rulesVersion = currentRequirementVersion;
    next.rulesBasedOnTextVersion = 0;
      next.diagramInputFingerprints = {
        ...next.diagramInputFingerprints,
        ...Object.fromEntries(
          requirementDiagrams.map((diagram) => [
            diagram,
            snapshotRequirementFingerprint,
          ]),
        ),
      };
    next.diagramVersions = {
      ...next.diagramVersions,
      ...Object.fromEntries(
        requirementDiagrams.map((diagram) => [
          diagram,
          currentRequirementVersion,
        ]),
      ),
    };
    return next;
  }

  const records = mapSnapshotToRecords(snapshot);
  const erroredDiagrams = new Set(
    Object.keys(snapshot.diagramErrors)
      .map(diagramKindFromErrorKey)
      .filter((diagram): diagram is DiagramType => Boolean(diagram)),
  );
  const modelDiagrams = Array.from(
    new Set(
      Object.values(records.modelMap)
        .map((model) => model?.diagramKind)
        .filter((diagram): diagram is DiagramType =>
          Boolean(diagram && !erroredDiagrams.has(diagram)),
        ),
    ),
  );
  const artifactDiagrams = Array.from(
    new Set(
      [
        ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
        ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
      ].filter(
        (diagram): diagram is DiagramType => !erroredDiagrams.has(diagram),
      ),
    ),
  ) as DiagramType[];
  const selectedModelDiagrams = modelDiagrams.filter((diagram) =>
    snapshot.selectedDiagrams.includes(diagram),
  );
  const canFallbackToContextModels =
    snapshot.selectedDiagrams.length === 0 &&
    Object.keys(snapshot.diagramErrors).length === 0;
  const successfulAffected = Array.from(
    new Set(
      artifactDiagrams.length > 0
        ? artifactDiagrams
        : selectedModelDiagrams.length > 0
          ? selectedModelDiagrams
          : canFallbackToContextModels
            ? modelDiagrams
            : [],
    ),
  );
  const affectedForErrors = Array.from(
    new Set([
      ...snapshot.selectedDiagrams,
      ...successfulAffected,
      ...erroredDiagrams,
    ]),
  );
  const affected =
    affectedForErrors.length > 0 ? affectedForErrors : successfulAffected;
  const affectedModelMap = keepRequirementScopedRecord(
    records.modelMap,
    successfulAffected,
  );
  const inputChanged =
    next.requirementInputFingerprint !== null &&
    !fingerprintMatches(
      next.requirementInputFingerprint,
      workspaceRequirementFingerprint,
    );
  const nextRulesVersion = inputChanged
    ? next.rulesVersion + 1
    : next.rulesVersion || 1;
  next.selectedDiagramTypes = [];
  next.rulesVersion = nextRulesVersion;
  next.rulesBasedOnTextVersion = 0;
  next.requirementInputFingerprint = workspaceRequirementFingerprint;
  if (affected.length === 0) {
    return next;
  }
  if (successfulAffected.length > 0) {
    next.models = {
      ...clearRequirementScopedRecord(next.models, successfulAffected),
      ...affectedModelMap,
    };
  }
  next.requirementModelTraceability = mergeRequirementTraceability(
    next.requirementModelTraceability,
    snapshot.requirementModelTraceability ?? [],
    successfulAffected,
  );
  next.generatedDiagramTypes = Array.from(
    new Set([...next.generatedDiagramTypes, ...successfulAffected]),
  );
  if (successfulAffected.length > 0) {
    next.plantUml = {
      ...clearRequirementScopedRecord(next.plantUml, successfulAffected),
      ...keepRequirementScopedRecord(records.plantUmlMap, successfulAffected),
    };
    next.svgArtifacts = {
      ...clearRequirementScopedRecord(next.svgArtifacts, successfulAffected),
      ...keepRequirementScopedRecord(records.svgMap, successfulAffected),
    };
  }
  next.diagramErrors = clearAndMergeDiagramErrors(
    next.diagramErrors,
    snapshot.diagramErrors,
    affected,
  );
  next.diagramVersions = {
    ...next.diagramVersions,
    ...Object.fromEntries(
      successfulAffected.map((diagram) => [diagram, nextRulesVersion]),
    ),
  };
  next.diagramInputFingerprints = {
    ...next.diagramInputFingerprints,
    ...Object.fromEntries(
      successfulAffected.map((diagram) => [
        diagram,
        snapshotRequirementFingerprint,
      ]),
    ),
  };
  return next;
}

export function restoreSnapshotToWorkspace(
  workspace: WorkspaceRecord,
  snapshot: RunHistorySnapshot,
): WorkspaceRecord {
  const base = {
    ...createEmptyWorkspace(),
    id: workspace.id,
    name: workspace.name,
  };
  return applySnapshotToWorkspace(base, snapshot);
}

function clearAndMergeDiagramErrors<T extends string, V>(
  current: Partial<Record<T, V>>,
  incoming: Partial<Record<T, V>>,
  affected: readonly T[],
) {
  const next = { ...current };
  for (const diagram of affected) {
    delete next[diagram];
    for (const key of Object.keys(next)) {
      if (key.startsWith(`${diagram}:`)) {
        delete next[key as T];
      }
    }
  }
  return { ...next, ...incoming };
}

function diagramKindFromErrorKey(key: string) {
  const [candidate] = key.split(":");
  return candidate &&
    [
      "function",
      "usecase",
      "class",
      "activity",
      "deployment",
      "prototype",
      "analysis",
    ].includes(candidate)
    ? (candidate as DiagramType)
    : null;
}

function clearRequirementScopedRecord<T>(
  current: Record<string, T | undefined>,
  affectedDiagrams: readonly DiagramType[],
) {
  const affected = new Set(affectedDiagrams);
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => {
      if (affected.has(key as DiagramType)) return false;
      for (const diagram of affected) {
        if (key.startsWith(`${diagram}:`)) return false;
      }
      const diagramKind = (value as { diagramKind?: string } | undefined)
        ?.diagramKind;
      return !diagramKind || !affected.has(diagramKind as DiagramType);
    }),
  ) as Record<string, T | undefined>;
}

function keepRequirementScopedRecord<T>(
  current: Record<string, T | undefined>,
  affectedDiagrams: readonly DiagramType[],
) {
  const affected = new Set(affectedDiagrams);
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => {
      if (affected.has(key as DiagramType)) return true;
      for (const diagram of affected) {
        if (key.startsWith(`${diagram}:`)) return true;
      }
      const diagramKind = (value as { diagramKind?: string } | undefined)
        ?.diagramKind;
      return Boolean(diagramKind && affected.has(diagramKind as DiagramType));
    }),
  ) as Record<string, T | undefined>;
}

function clearDesignScopedRecord<T>(
  current: Record<string, T | undefined>,
  affectedDiagrams: readonly DesignDiagramType[],
) {
  return Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) =>
        !designRecordBelongsToDiagramKinds(key, value, affectedDiagrams),
    ),
  ) as Record<string, T | undefined>;
}

function keepDesignScopedRecord<T>(
  current: Record<string, T | undefined>,
  affectedDiagrams: readonly DesignDiagramType[],
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) =>
      designRecordBelongsToDiagramKinds(key, value, affectedDiagrams),
    ),
  ) as Record<string, T | undefined>;
}

function mergeDesignTraceability(
  current: WorkspaceRecord["designModelTraceability"],
  incoming: WorkspaceRecord["designModelTraceability"],
  affectedDiagrams: readonly DesignDiagramType[],
  deletedModelIds: readonly string[],
) {
  if (affectedDiagrams.length === 0 && deletedModelIds.length === 0) {
    return current;
  }
  return [
    ...current.filter(
      (entry) =>
        !designTraceabilityTouchesDiagramKinds(
          entry,
          affectedDiagrams,
          deletedModelIds,
        ),
    ),
    ...incoming.filter((entry) =>
      designTraceabilityTouchesDiagramKinds(entry, affectedDiagrams),
    ),
  ];
}

function mergeRequirementTraceability(
  current: WorkspaceRecord["requirementModelTraceability"],
  incoming: WorkspaceRecord["requirementModelTraceability"],
  affectedDiagrams: readonly DiagramType[],
) {
  const affected = new Set<DiagramType>(affectedDiagrams);
  return [
    ...current.filter(
      (entry) => !affected.has(entry.target.diagramKind as DiagramType),
    ),
    ...incoming.filter((entry) =>
      affected.has(entry.target.diagramKind as DiagramType),
    ),
  ];
}

export function stableWorkspaceState(
  workspace: WorkspaceRecord,
): Partial<WorkspaceRecord> {
  const pruned = pruneUseCaseScopedWorkspace(workspace);
  const {
    currentStage: _currentStage,
    runStatus: _runStatus,
    runProgress: _runProgress,
    runMessage: _runMessage,
    errorMessage: _errorMessage,
    ...state
  } = pruned;
  return state;
}

function mapSnapshotToRecords(snapshot: RunSnapshot) {
  return {
    modelMap: Object.fromEntries(
      snapshot.models.map((model) => [getRequirementModelId(model), model]),
    ) as WorkspaceRecord["models"],
    plantUmlMap: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [
        getRequirementArtifactId(artifact),
        artifact.source,
      ]),
    ) as WorkspaceRecord["plantUml"],
    svgMap: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [
        getRequirementArtifactId(artifact),
        artifact,
      ]),
    ) as WorkspaceRecord["svgArtifacts"],
  };
}

function mapDesignSnapshotToRecords(snapshot: DesignRunSnapshot) {
  return {
    modelMap: Object.fromEntries(
      snapshot.models.map((model) => [getDesignModelId(model), model]),
    ) as WorkspaceRecord["designModels"],
    plantUmlMap: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [
        getDesignArtifactId(artifact),
        artifact.source,
      ]),
    ) as WorkspaceRecord["designPlantUml"],
    svgMap: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [
        getDesignArtifactId(artifact),
        artifact,
      ]),
    ) as WorkspaceRecord["designSvgArtifacts"],
  };
}
