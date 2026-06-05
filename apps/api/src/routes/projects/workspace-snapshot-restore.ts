// Restores persisted run snapshots into the project workspace state without browser round-trips.
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
    next.requirementBaseline =
      snapshot.requirementBaseline ??
      (next.requirementBaseline as unknown) ??
      null;
    next.requirementQualityReport =
      snapshot.requirementBaseline?.qualityReport ??
      (next.requirementQualityReport as unknown) ??
      null;
  }

  const workspaceRequirementFingerprint = snapshotInputFingerprint({
    requirementText: stringValue(next.requirementText),
    rules: arrayValue(next.rules),
  });

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
    const affected = new Set(snapshot.selectedDiagrams);
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
    next.designModels = {
      ...recordValue(next.designModels),
      ...designRecords.modelMap,
    };
    next.designModelTraceability = [
      ...arrayValue(next.designModelTraceability).filter(
        (entry) =>
          !affected.has(
            readNestedString(entry, ["source", "diagramKind"]) as DesignDiagramKind,
          ),
      ),
      ...snapshot.designModelTraceability,
    ];
    next.generatedDesignDiagramTypes = uniqueStrings([
      ...stringArrayValue(next.generatedDesignDiagramTypes),
      ...snapshot.selectedDiagrams,
    ]);
    next.designInputFingerprints = {
      ...recordValue(next.designInputFingerprints),
      ...Object.fromEntries(
        Object.keys(designRecords.modelMap).map((modelId) => [
          modelId,
          currentDesignFingerprint,
        ]),
      ),
    };
    next.designPlantUml = {
      ...recordValue(next.designPlantUml),
      ...designRecords.plantUmlMap,
    };
    next.designSvgArtifacts = {
      ...recordValue(next.designSvgArtifacts),
      ...designRecords.svgMap,
    };
    next.designDiagramErrors = clearAndMergeDiagramErrors(
      recordValue(next.designDiagramErrors),
      snapshot.diagramErrors,
      snapshot.selectedDiagrams,
    );
    next.models = {
      ...clearScopedRecords(recordValue(next.models), requirementDiagrams),
      ...Object.fromEntries(
        snapshot.requirementModels.map((model) => [getRequirementModelId(model), model]),
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
  const modelDiagrams = uniqueStrings(
    snapshot.models.map((model) => model.diagramKind),
  ) as DiagramKind[];
  const artifactDiagrams = uniqueStrings([
    ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
    ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ...Object.keys(snapshot.diagramErrors).map((key) => key.split(":")[0] ?? key),
  ]) as DiagramKind[];
  const affected = uniqueStrings([
    ...snapshot.selectedDiagrams,
    ...modelDiagrams,
    ...artifactDiagrams,
  ]) as DiagramKind[];
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

  next.models = {
    ...clearScopedRecords(recordValue(next.models), affected),
    ...records.modelMap,
  };
  next.requirementModelTraceability = mergeRequirementTraceability(
    arrayValue(
      next.requirementModelTraceability,
    ) as RequirementModelTraceabilityEntry[],
    snapshot.requirementModelTraceability ?? [],
    affected,
  );
  next.generatedDiagramTypes = uniqueStrings([
    ...stringArrayValue(next.generatedDiagramTypes),
    ...affected,
  ]);
  next.plantUml = {
    ...clearScopedRecords(recordValue(next.plantUml), affected),
    ...records.plantUmlMap,
  };
  next.svgArtifacts = {
    ...clearScopedRecords(recordValue(next.svgArtifacts), affected),
    ...records.svgMap,
  };
  next.diagramErrors = clearAndMergeDiagramErrors(
    recordValue(next.diagramErrors),
    snapshot.diagramErrors,
    affected,
  );
  next.diagramVersions = {
    ...recordValue(next.diagramVersions),
    ...Object.fromEntries(affected.map((diagram) => [diagram, nextRulesVersion])),
  };
  next.diagramInputFingerprints = {
    ...recordValue(next.diagramInputFingerprints),
    ...Object.fromEntries(
      affected.map((diagram) => [diagram, workspaceRequirementFingerprint]),
    ),
  };
  return next;
}

function isCodeRunSnapshot(snapshot: RestorableRunSnapshot): snapshot is CodeRunSnapshot {
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
  artifact: Pick<DesignPlantUmlArtifact | DesignSvgArtifact, "diagramKind" | "modelId">,
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
  const next = { ...current };
  for (const diagram of affected) {
    delete next[diagram];
    for (const key of Object.keys(next)) {
      if (key.startsWith(`${diagram}:`)) {
        delete next[key];
      }
    }
  }
  return next;
}

function mergeRequirementTraceability(
  current: RequirementModelTraceabilityEntry[],
  incoming: RequirementModelTraceabilityEntry[],
  affectedDiagrams: readonly DiagramKind[],
) {
  const affected = new Set<DiagramKind>(affectedDiagrams);
  return [
    ...current.filter((entry) => !affected.has(entry.target.diagramKind as DiagramKind)),
    ...incoming.filter((entry) => affected.has(entry.target.diagramKind as DiagramKind)),
  ];
}

function fingerprintMatches(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return normalizeSnapshotFingerprint(storedFingerprint) === currentFingerprint;
}

function snapshotInputFingerprint(value: unknown) {
  return JSON.stringify(sortFingerprintValue(value));
}

function designInputFingerprint(
  requirementModels: unknown[],
  requirementModelTraceability: unknown[],
) {
  return snapshotInputFingerprint(
    normalizeDesignInputFingerprintValue({
      requirementModels,
      requirementModelTraceability,
    }),
  );
}

function normalizeSnapshotFingerprint(fingerprint: string | null | undefined) {
  if (!fingerprint) return fingerprint ?? null;
  try {
    return snapshotInputFingerprint(JSON.parse(fingerprint));
  } catch {
    return fingerprint;
  }
}

function sortFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortFingerprintValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortFingerprintValue(entry)]),
  );
}

const DIAGRAM_FINGERPRINT_ORDER = ["usecase", "class", "activity", "deployment"];

function normalizeDesignInputFingerprintValue(value: unknown) {
  const record = isRecord(value) ? value : {};
  return {
    requirementModels: sortByFingerprintKey(
      Array.isArray(record.requirementModels) ? record.requirementModels : [],
      designModelFingerprintKey,
    ),
    requirementModelTraceability: sortByFingerprintKey(
      Array.isArray(record.requirementModelTraceability)
        ? record.requirementModelTraceability
        : [],
      traceabilityFingerprintKey,
    ),
  };
}

function sortByFingerprintKey<T>(values: T[], keyFor: (value: T) => string) {
  return values
    .map((value, index) => ({ index, key: keyFor(value), value }))
    .sort((left, right) => left.key.localeCompare(right.key) || left.index - right.index)
    .map((entry) => entry.value);
}

function designModelFingerprintKey(value: unknown) {
  const record = isRecord(value) ? value : {};
  const diagramKind = compactFingerprintValue(record.diagramKind);
  const modelId = compactFingerprintValue(record.modelId);
  const rank = DIAGRAM_FINGERPRINT_ORDER.indexOf(diagramKind);
  const orderedRank = rank >= 0 ? rank : DIAGRAM_FINGERPRINT_ORDER.length;
  return [
    String(orderedRank).padStart(2, "0"),
    diagramKind,
    modelId,
    snapshotInputFingerprint(value),
  ].join(":");
}

function traceabilityFingerprintKey(value: unknown) {
  const record = isRecord(value) ? value : {};
  return [
    modelElementRefFingerprintKey(record.source),
    Array.isArray(record.targets)
      ? sortByFingerprintKey(record.targets, modelElementRefFingerprintKey).join("|")
      : "",
    compactFingerprintValue(record.ruleId),
    snapshotInputFingerprint(value),
  ].join(":");
}

function modelElementRefFingerprintKey(value: unknown) {
  const record = isRecord(value) ? value : {};
  return [
    compactFingerprintValue(record.modelId),
    compactFingerprintValue(record.diagramKind),
    compactFingerprintValue(record.elementId),
  ].join(":");
}

function compactFingerprintValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().toLowerCase()
    : "";
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
