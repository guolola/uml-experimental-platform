// Restores persisted run snapshots into the project workspace state without browser round-trips.
import {
  designDiagramKindFromRecordKey,
  designInputFingerprint,
  designRecordBelongsToDiagramKinds,
  designTraceabilityTouchesDiagramKinds,
  normalizeSnapshotFingerprint,
  snapshotInputFingerprint,
} from "@uml-platform/contracts";
import type {
  CodeRunSnapshot,
  DesignDiagramKind,
  DesignDiagramModelSpec,
  DesignPlantUmlArtifact,
  DesignRunSnapshot,
  DesignSvgArtifact,
  DiagramKind,
  DiagramModelSpec,
  DocumentRunSnapshot,
  PlantUmlArtifact,
  RequirementBaseline,
  RequirementModelTraceabilityEntry,
  RunSnapshot,
  SvgArtifact,
} from "@uml-platform/contracts";

export type RestorableRunSnapshot =
  | RunSnapshot
  | DesignRunSnapshot
  | CodeRunSnapshot;

type AnyRunSnapshot = RestorableRunSnapshot | DocumentRunSnapshot;
type WorkspaceState = Record<string, unknown>;

export function isRestorableRunSnapshot(
  snapshot: AnyRunSnapshot,
): snapshot is RestorableRunSnapshot {
  return !("documentKind" in snapshot);
}

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
    return Object.values(requirement.fieldProvenance).some((provenance) => {
      if (!provenance || typeof provenance !== "object") return false;
      const status = stringValue(
        (provenance as Record<string, unknown>).status,
      );
      return status === "pending-review" || status === "rejected";
    });
  });
}

function pruneRequirementReviewCandidatesForBaseline(
  candidates: unknown,
  baseline: RequirementBaseline,
) {
  const next = { ...recordValue(candidates) };
  for (const [ruleId, candidate] of Object.entries(next)) {
    const status = isRecord(candidate) ? stringValue(candidate.status) : "";
    if (
      (status === "pending" || status === "failed") &&
      !reviewCandidateStillNeeded(baseline, ruleId)
    ) {
      delete next[ruleId];
    }
  }
  return next;
}

function applyRequirementBaselineToWorkspaceState(
  state: WorkspaceState,
  baseline: RequirementBaseline,
) {
  state.requirementBaseline = baseline;
  state.requirementQualityReport = baseline.qualityReport;
  state.requirementReviewCandidates =
    pruneRequirementReviewCandidatesForBaseline(
      state.requirementReviewCandidates,
      baseline,
    );
}

export function restoreRunSnapshotToWorkspaceState({
  currentState,
  snapshot,
  mode = "merge",
}: {
  currentState?: WorkspaceState | null;
  snapshot: RestorableRunSnapshot;
  mode?: "merge" | "restore";
}) {
  const base = mode === "restore" ? {} : { ...(currentState ?? {}) };
  return applySnapshotToWorkspaceState(base, snapshot);
}

function applySnapshotToWorkspaceState(
  state: WorkspaceState,
  snapshot: RestorableRunSnapshot,
) {
  const next: WorkspaceState = { ...state };
  const currentRequirementText = stringValue(next.requirementText);
  const currentRules = arrayValue(next.rules);
  const currentHasRequirements =
    currentRequirementText.trim().length > 0 || currentRules.length > 0;

  if (!currentHasRequirements) {
    next.requirementText = snapshot.requirementText;
  }

  const snapshotRequirementFingerprint = snapshotInputFingerprint({
    requirementText: snapshot.requirementText,
    rules: snapshot.rules,
  });
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

  const workspaceRequirementFingerprint = snapshotInputFingerprint({
    requirementText: stringValue(next.requirementText),
    rules: arrayValue(next.rules),
  });
  if (
    snapshot.requirementBaseline &&
    (!currentHasRequirements ||
      fingerprintMatches(
        snapshotRequirementFingerprint,
        workspaceRequirementFingerprint,
      ))
  ) {
    applyRequirementBaselineToWorkspaceState(next, snapshot.requirementBaseline);
  }

  if (isCodeRunSnapshot(snapshot)) {
    next.designModels = Object.fromEntries(
      snapshot.designModels.map((model) => [getDesignModelId(model), model]),
    );
    next.designPlantUml = Object.fromEntries(
      snapshot.designPlantUml.map((artifact) => [
        getDesignArtifactId(artifact),
        artifact.source,
      ]),
    );
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
    const erroredDesignDiagrams = new Set(
      Object.keys(snapshot.diagramErrors)
        .map(designDiagramKindFromRecordKey)
        .filter((diagram): diagram is DesignDiagramKind => Boolean(diagram)),
    );
    const successfulAffectedDesignDiagrams =
      successfulDesignDiagramsFromSnapshot(snapshot, designRecords);
    const affectedForErrors = uniqueStrings([
      ...snapshot.selectedDiagrams,
      ...successfulAffectedDesignDiagrams,
      ...Array.from(erroredDesignDiagrams),
    ]) as DesignDiagramKind[];
    const affectedDesignModelIds = Object.entries(
      recordValue(next.designModels),
    )
      .filter(([modelId, model]) =>
        designRecordBelongsToDiagramKinds(
          modelId,
          model,
          successfulAffectedDesignDiagrams,
        ),
      )
      .map(([modelId]) => modelId);
    const affectedDesignModelMap = keepDesignScopedRecords(
      designRecords.modelMap,
      successfulAffectedDesignDiagrams,
    );
    const requestedDesignDiagrams =
      snapshot.requestedDiagrams ?? snapshot.selectedDiagrams;
    const requirementDiagrams = snapshot.requirementModels.map(
      (model) => model.diagramKind,
    );
    const currentRequirementVersion = fingerprintMatches(
      stringOrNull(next.requirementInputFingerprint),
      workspaceRequirementFingerprint,
    )
      ? numberValue(next.rulesVersion)
      : numberValue(next.rulesVersion) + 1;
    const currentDesignFingerprint = designInputFingerprint(
      snapshot.requirementModels,
      snapshot.requirementModelTraceability,
    );

    next.selectedDesignDiagramTypes = uniqueStrings([
      ...stringArrayValue(next.selectedDesignDiagramTypes),
      ...requestedDesignDiagrams,
    ]);
    if (successfulAffectedDesignDiagrams.length > 0) {
      next.designModels = {
        ...clearDesignScopedRecords(
          recordValue(next.designModels),
          successfulAffectedDesignDiagrams,
        ),
        ...affectedDesignModelMap,
      };
    }
    next.designModelTraceability = mergeDesignTraceability(
      arrayValue(
        next.designModelTraceability,
      ) as DesignRunSnapshot["designModelTraceability"],
      snapshot.designModelTraceability,
      successfulAffectedDesignDiagrams,
      affectedDesignModelIds,
    );
    next.generatedDesignDiagramTypes = uniqueStrings([
      ...stringArrayValue(next.generatedDesignDiagramTypes),
      ...successfulAffectedDesignDiagrams,
    ]);
    if (successfulAffectedDesignDiagrams.length > 0) {
      next.designInputFingerprints = {
        ...clearDesignScopedRecords(
          recordValue(next.designInputFingerprints),
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
        ...clearDesignScopedRecords(
          recordValue(next.designPlantUml),
          successfulAffectedDesignDiagrams,
        ),
        ...keepDesignScopedRecords(
          designRecords.plantUmlMap,
          successfulAffectedDesignDiagrams,
        ),
      };
      next.designSvgArtifacts = {
        ...clearDesignScopedRecords(
          recordValue(next.designSvgArtifacts),
          successfulAffectedDesignDiagrams,
        ),
        ...keepDesignScopedRecords(
          designRecords.svgMap,
          successfulAffectedDesignDiagrams,
        ),
      };
    }
    next.designDiagramErrors = clearAndMergeDiagramErrors(
      recordValue(next.designDiagramErrors),
      snapshot.diagramErrors,
      affectedForErrors,
    );
    next.models = {
      ...clearScopedRecords(recordValue(next.models), requirementDiagrams),
      ...Object.fromEntries(
        snapshot.requirementModels.map((model) => [
          getRequirementModelId(model),
          model,
        ]),
      ),
    };
    next.requirementModelTraceability = mergeRequirementTraceability(
      arrayValue(
        next.requirementModelTraceability,
      ) as RequirementModelTraceabilityEntry[],
      snapshot.requirementModelTraceability,
      requirementDiagrams,
    );
    next.selectedDiagramTypes = uniqueStrings([
      ...stringArrayValue(next.selectedDiagramTypes),
      ...requirementDiagrams,
    ]);
    next.generatedDiagramTypes = uniqueStrings([
      ...stringArrayValue(next.generatedDiagramTypes),
      ...requirementDiagrams,
    ]);
    next.requirementInputFingerprint = workspaceRequirementFingerprint;
    next.rulesVersion = currentRequirementVersion;
    next.rulesBasedOnTextVersion = 0;
    next.diagramInputFingerprints = {
      ...recordValue(next.diagramInputFingerprints),
      ...Object.fromEntries(
        requirementDiagrams.map((diagram) => [
          diagram,
          workspaceRequirementFingerprint,
        ]),
      ),
    };
    next.diagramVersions = {
      ...recordValue(next.diagramVersions),
      ...Object.fromEntries(
        requirementDiagrams.map((diagram) => [
          diagram,
          currentRequirementVersion,
        ]),
      ),
    };
    return next;
  }

  const records = mapRequirementSnapshotToRecords(snapshot);
  const erroredDiagrams = new Set(
    Object.keys(snapshot.diagramErrors)
      .map(diagramKindFromErrorKey)
      .filter((diagram): diagram is DiagramKind => Boolean(diagram)),
  );
  const modelDiagrams = uniqueStrings(
    Object.values(records.modelMap)
      .map((model) => model.diagramKind)
      .filter((diagram): diagram is DiagramKind =>
        Boolean(diagram && !erroredDiagrams.has(diagram)),
      ),
  ) as DiagramKind[];
  const artifactDiagrams = uniqueStrings(
    [
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ].filter(
      (diagram): diagram is DiagramKind => !erroredDiagrams.has(diagram),
    ),
  );
  const selectedModelDiagrams = modelDiagrams.filter((diagram) =>
    snapshot.selectedDiagrams.includes(diagram),
  );
  const canFallbackToContextModels =
    snapshot.selectedDiagrams.length === 0 &&
    Object.keys(snapshot.diagramErrors).length === 0;
  const successfulAffected = uniqueStrings(
    artifactDiagrams.length > 0
      ? artifactDiagrams
      : selectedModelDiagrams.length > 0
        ? selectedModelDiagrams
        : canFallbackToContextModels
          ? modelDiagrams
          : [],
  ) as DiagramKind[];
  const affectedForErrors = uniqueStrings([
    ...snapshot.selectedDiagrams,
    ...successfulAffected,
    ...Array.from(erroredDiagrams),
  ]) as DiagramKind[];
  const affected =
    affectedForErrors.length > 0 ? affectedForErrors : successfulAffected;
  const affectedModelMap = keepScopedRecords(
    records.modelMap,
    successfulAffected,
  );
  const inputChanged =
    next.requirementInputFingerprint !== null &&
    next.requirementInputFingerprint !== undefined &&
    !fingerprintMatches(
      stringOrNull(next.requirementInputFingerprint),
      workspaceRequirementFingerprint,
    );
  const nextRulesVersion = inputChanged
    ? numberValue(next.rulesVersion) + 1
    : numberValue(next.rulesVersion) || 1;

  next.selectedDiagramTypes = uniqueStrings([
    ...stringArrayValue(next.selectedDiagramTypes),
    ...affected,
  ]);
  next.rulesVersion = nextRulesVersion;
  next.rulesBasedOnTextVersion = 0;
  next.requirementInputFingerprint = workspaceRequirementFingerprint;
  if (affected.length === 0) {
    return next;
  }

  if (successfulAffected.length > 0) {
    next.models = {
      ...clearScopedRecords(recordValue(next.models), successfulAffected),
      ...affectedModelMap,
    };
  }
  next.requirementModelTraceability = mergeRequirementTraceability(
    arrayValue(
      next.requirementModelTraceability,
    ) as RequirementModelTraceabilityEntry[],
    snapshot.requirementModelTraceability ?? [],
    successfulAffected,
  );
  next.generatedDiagramTypes = uniqueStrings([
    ...stringArrayValue(next.generatedDiagramTypes),
    ...successfulAffected,
  ]);
  if (successfulAffected.length > 0) {
    next.plantUml = {
      ...clearScopedRecords(recordValue(next.plantUml), successfulAffected),
      ...keepScopedRecords(records.plantUmlMap, successfulAffected),
    };
    next.svgArtifacts = {
      ...clearScopedRecords(recordValue(next.svgArtifacts), successfulAffected),
      ...keepScopedRecords(records.svgMap, successfulAffected),
    };
  }
  next.diagramErrors = clearAndMergeDiagramErrors(
    recordValue(next.diagramErrors),
    snapshot.diagramErrors,
    affected,
  );
  next.diagramVersions = {
    ...recordValue(next.diagramVersions),
    ...Object.fromEntries(
      successfulAffected.map((diagram) => [diagram, nextRulesVersion]),
    ),
  };
  next.diagramInputFingerprints = {
    ...recordValue(next.diagramInputFingerprints),
    ...Object.fromEntries(
      successfulAffected.map((diagram) => [
        diagram,
        workspaceRequirementFingerprint,
      ]),
    ),
  };
  return next;
}

function isCodeRunSnapshot(
  snapshot: RestorableRunSnapshot,
): snapshot is CodeRunSnapshot {
  return "files" in snapshot;
}

function isDesignRunSnapshot(
  snapshot: RestorableRunSnapshot,
): snapshot is DesignRunSnapshot {
  return "requirementModels" in snapshot;
}

function getDesignModelId(
  model: Pick<DesignDiagramModelSpec, "diagramKind" | "modelId">,
) {
  return model.modelId ?? model.diagramKind;
}

function getDesignArtifactId(
  artifact: Pick<
    DesignPlantUmlArtifact | DesignSvgArtifact,
    "diagramKind" | "modelId"
  >,
) {
  return artifact.modelId ?? artifact.diagramKind;
}

function getRequirementModelId(
  model: Pick<DiagramModelSpec, "diagramKind"> & { modelId?: string | null },
) {
  return model.modelId ?? model.diagramKind;
}

function getRequirementArtifactId(
  artifact: Pick<PlantUmlArtifact | SvgArtifact, "diagramKind"> & {
    modelId?: string | null;
  },
) {
  return artifact.modelId ?? artifact.diagramKind;
}

function hasWholeDesignDiagramError(
  diagramErrors: DesignRunSnapshot["diagramErrors"],
  diagram: DesignDiagramKind,
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
  const artifactDesignDiagrams = uniqueStrings(
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
  ) as DesignDiagramKind[];
  const modelDesignDiagrams = uniqueStrings(
    Object.values(designRecords.modelMap)
      .filter((model) => {
        if (!selectedDesignDiagrams.has(model.diagramKind)) return false;
        if (hasWholeDesignDiagramError(snapshot.diagramErrors, model.diagramKind)) {
          return false;
        }
        return !snapshot.diagramErrors[getDesignModelId(model)];
      })
      .map((model) => model.diagramKind),
  ) as DesignDiagramKind[];
  const successful = new Set([...artifactDesignDiagrams, ...modelDesignDiagrams]);
  return snapshot.selectedDiagrams.filter((diagram) => successful.has(diagram));
}

function mapRequirementSnapshotToRecords(snapshot: RunSnapshot) {
  return {
    modelMap: Object.fromEntries(
      snapshot.models.map((model: DiagramModelSpec) => [
        getRequirementModelId(model),
        model,
      ]),
    ),
    plantUmlMap: Object.fromEntries(
      snapshot.plantUml.map((artifact: PlantUmlArtifact) => [
        getRequirementArtifactId(artifact),
        artifact.source,
      ]),
    ),
    svgMap: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact: SvgArtifact) => [
        getRequirementArtifactId(artifact),
        artifact,
      ]),
    ),
  };
}

function mapDesignSnapshotToRecords(snapshot: DesignRunSnapshot) {
  return {
    modelMap: Object.fromEntries(
      snapshot.models.map((model) => [getDesignModelId(model), model]),
    ),
    plantUmlMap: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [
        getDesignArtifactId(artifact),
        artifact.source,
      ]),
    ),
    svgMap: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [
        getDesignArtifactId(artifact),
        artifact,
      ]),
    ),
  };
}

function clearAndMergeDiagramErrors<T extends string>(
  current: Record<string, unknown>,
  incoming: Partial<Record<T, unknown>>,
  affected: readonly T[],
) {
  const next = { ...current };
  for (const diagram of affected) {
    delete next[diagram];
    for (const key of Object.keys(next)) {
      if (key.startsWith(`${diagram}:`)) {
        delete next[key];
      }
    }
  }
  return { ...next, ...incoming };
}

function clearScopedRecords(
  current: Record<string, unknown>,
  affected: readonly string[],
) {
  const affectedSet = new Set(affected);
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => {
      if (affectedSet.has(key)) return false;
      for (const diagram of affected) {
        if (key.startsWith(`${diagram}:`)) {
          return false;
        }
      }
      const diagramKind = readNestedString(value, ["diagramKind"]);
      return !diagramKind || !affectedSet.has(diagramKind);
    }),
  );
}

function keepScopedRecords<T>(
  current: Record<string, T>,
  affected: readonly string[],
) {
  const affectedSet = new Set(affected);
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => {
      if (affectedSet.has(key)) return true;
      for (const diagram of affected) {
        if (key.startsWith(`${diagram}:`)) {
          return true;
        }
      }
      const diagramKind = readNestedString(value, ["diagramKind"]);
      return Boolean(diagramKind && affectedSet.has(diagramKind));
    }),
  ) as Record<string, T>;
}

function clearDesignScopedRecords<T>(
  current: Record<string, T>,
  affected: readonly DesignDiagramKind[],
) {
  return Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) =>
        !designRecordBelongsToDiagramKinds(key, value, affected),
    ),
  );
}

function keepDesignScopedRecords<T>(
  current: Record<string, T>,
  affected: readonly DesignDiagramKind[],
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) =>
      designRecordBelongsToDiagramKinds(key, value, affected),
    ),
  ) as Record<string, T>;
}

function mergeDesignTraceability(
  current: DesignRunSnapshot["designModelTraceability"],
  incoming: DesignRunSnapshot["designModelTraceability"],
  affected: readonly DesignDiagramKind[],
  deletedModelIds: readonly string[],
) {
  if (affected.length === 0 && deletedModelIds.length === 0) {
    return current;
  }
  return [
    ...current.filter(
      (entry) =>
        !designTraceabilityTouchesDiagramKinds(entry, affected, deletedModelIds),
    ),
    ...incoming.filter((entry) =>
      designTraceabilityTouchesDiagramKinds(entry, affected),
    ),
  ];
}

function diagramKindFromErrorKey(key: string) {
  const [candidate] = key.split(":");
  return candidate &&
    [
      "usecase",
      "class",
      "activity",
      "deployment",
      "prototype",
      "analysis",
    ].includes(candidate)
    ? (candidate as DiagramKind)
    : null;
}

function mergeRequirementTraceability(
  current: RequirementModelTraceabilityEntry[],
  incoming: RequirementModelTraceabilityEntry[],
  affectedDiagrams: readonly DiagramKind[],
) {
  const affected = new Set<DiagramKind>(affectedDiagrams);
  return [
    ...current.filter(
      (entry) => !affected.has(entry.target.diagramKind as DiagramKind),
    ),
    ...incoming.filter((entry) =>
      affected.has(entry.target.diagramKind as DiagramKind),
    ),
  ];
}

function fingerprintMatches(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return normalizeSnapshotFingerprint(storedFingerprint) === currentFingerprint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readNestedString(value: unknown, path: readonly string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return typeof current === "string" ? current : "";
}
