// Resolves project-scoped run start commands into full pipeline request inputs.
import {
  buildAcceptedRequirementSnapshot,
  designInputFingerprint,
  normalizeSnapshotFingerprint,
  normalizeDesignInputFingerprint,
  snapshotInputFingerprint,
  designRecordBelongsToDiagramKinds,
  designTraceabilityTouchesDiagramKinds,
  startCodeRunCommandSchema,
  startCodeRunRequestSchema,
  startDesignRunCommandSchema,
  startDesignRunRequestSchema,
  startDocumentRunCommandSchema,
  startDocumentRunRequestSchema,
  startRunCommandSchema,
  startRunRequestSchema,
  type DesignDiagramKind,
  type DiagramKind,
  type StartCodeRunCommand,
  type StartCodeRunRequest,
  type StartDesignRunCommand,
  type StartDesignRunRequest,
  type StartDocumentRunCommand,
  type StartDocumentRunRequest,
  type StartRunCommand,
  type StartRunRequest,
} from "@uml-platform/contracts";

type RunInputMetadata = {
  projectId?: string;
};

type ProjectWorkspaceForRun = {
  state?: unknown;
};

export type LoadProjectWorkspaceForRun = (
  projectId: string,
) => Promise<ProjectWorkspaceForRun | Record<string, unknown> | null | undefined>;

type InputResolution<T> =
  | { ok: true; input: T }
  | { ok: false; statusCode: number; body: { message: string } };

type ProjectGenerationPreflightKind =
  | "requirements"
  | "design"
  | "code"
  | "requirementsSpec"
  | "softwareDesignSpec"
  | "feasibilityStudy";

function runInputResolutionError(statusCode: number, message: string): InputResolution<never> {
  return { ok: false, statusCode, body: { message } };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordValue(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function acceptedFeasibilityRules(state: Record<string, unknown>) {
  const rules = arrayValue(state.rules);
  const baseline = recordValue(state.requirementBaseline);
  const requirements = arrayValue(baseline.requirements);
  if (requirements.length === 0) return rules;
  const acceptedIds = new Set(
    requirements
      .filter((item) => recordValue(item).status === "accepted")
      .map((item) => stringValue(recordValue(item).sourceRuleId))
      .filter(Boolean),
  );
  return rules.filter((rule) => acceptedIds.has(stringValue(recordValue(rule).id)));
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

const DESIGN_DIAGRAM_ORDER: DesignDiagramKind[] = [
  "architecture",
  "sequence",
  "class",
  "activity",
  "table",
  "component",
  "deployment",
];

const DESIGN_MODEL_DEPENDENCY_MAP: Record<
  DesignDiagramKind,
  DesignDiagramKind[]
> = {
  architecture: [],
  sequence: [],
  activity: ["sequence"],
  class: ["sequence"],
  component: ["class"],
  deployment: ["component"],
  table: ["class"],
};

const DESIGN_REQUIREMENT_SOURCE_MAP: Record<DesignDiagramKind, DiagramKind[]> = {
  architecture: ["function"],
  sequence: ["usecase", "analysis"],
  activity: ["prototype"],
  class: ["class"],
  component: [],
  deployment: ["deployment"],
  table: [],
};

const REQUIREMENT_DIAGRAM_ORDER: DiagramKind[] = [
  "function",
  "activity",
  "usecase",
  "class",
  "prototype",
  "deployment",
  "analysis",
];

function isDesignDiagramKind(value: unknown): value is DesignDiagramKind {
  return DESIGN_DIAGRAM_ORDER.includes(value as DesignDiagramKind);
}

function isRequirementDiagramKind(value: unknown): value is DiagramKind {
  return REQUIREMENT_DIAGRAM_ORDER.includes(value as DiagramKind);
}

function orderedDesignDiagrams(diagrams: DesignDiagramKind[]) {
  const selected = new Set(diagrams);
  return DESIGN_DIAGRAM_ORDER.filter((diagram) => selected.has(diagram));
}

function orderedRequirementDiagrams(diagrams: DiagramKind[]) {
  const selected = new Set(diagrams);
  return REQUIREMENT_DIAGRAM_ORDER.filter((diagram) => selected.has(diagram));
}

function designDiagramKindFromWorkspaceRecord(value: unknown) {
  const diagramKind = recordValue(value).diagramKind;
  return isDesignDiagramKind(diagramKind) ? diagramKind : null;
}

function requirementDiagramKindFromWorkspaceRecord(value: unknown) {
  const diagramKind = recordValue(value).diagramKind;
  return isRequirementDiagramKind(diagramKind) ? diagramKind : null;
}

function resolveRequirementCommandTargets(input: {
  selectedDiagrams: DiagramKind[];
  requestedDiagrams?: DiagramKind[];
  dependencyDiagrams?: DiagramKind[];
  existingRequirementModels: unknown[];
}) {
  const requestedDiagrams = orderedRequirementDiagrams(
    input.requestedDiagrams ?? input.selectedDiagrams,
  );
  const dependencyDiagrams = new Set(input.dependencyDiagrams ?? []);
  const existing = new Set(
    input.existingRequirementModels.flatMap((model) => {
      const diagramKind = requirementDiagramKindFromWorkspaceRecord(model);
      return diagramKind ? [diagramKind] : [];
    }),
  );
  const selected = new Set(input.selectedDiagrams);
  if (
    selected.has("analysis") &&
    !selected.has("usecase") &&
    !existing.has("usecase")
  ) {
    dependencyDiagrams.add("usecase");
  }

  return {
    selectedDiagrams: orderedRequirementDiagrams([
      ...input.selectedDiagrams,
      ...dependencyDiagrams,
    ]),
    requestedDiagrams,
    dependencyDiagrams: orderedRequirementDiagrams([...dependencyDiagrams]),
  };
}

function resolveDesignCommandTargets(input: {
  selectedDiagrams: DesignDiagramKind[];
  requestedDiagrams?: DesignDiagramKind[];
  existingDesignModels: unknown[];
}) {
  const requestedDiagrams = orderedDesignDiagrams(
    input.requestedDiagrams ?? input.selectedDiagrams,
  );
  const requestedSet = new Set(input.selectedDiagrams);
  const existing = new Set(
    input.existingDesignModels.flatMap((model) => {
      const diagramKind = designDiagramKindFromWorkspaceRecord(model);
      return diagramKind ? [diagramKind] : [];
    }),
  );
  const dependencyDiagrams = new Set<DesignDiagramKind>();

  const includeDependenciesFor = (diagram: DesignDiagramKind) => {
    for (const dependency of DESIGN_MODEL_DEPENDENCY_MAP[diagram]) {
      if (existing.has(dependency) && !requestedSet.has(dependency)) {
        continue;
      }
      if (!existing.has(dependency) && !requestedSet.has(dependency)) {
        dependencyDiagrams.add(dependency);
      }
      includeDependenciesFor(dependency);
    }
  };

  for (const diagram of input.selectedDiagrams) {
    includeDependenciesFor(diagram);
  }

  return {
    selectedDiagrams: orderedDesignDiagrams([
      ...input.selectedDiagrams,
      ...dependencyDiagrams,
    ]),
    requestedDiagrams,
  };
}

function normalizedFingerprintMatches(
  storedFingerprint: unknown,
  activeFingerprint: string,
) {
  return (
    normalizeSnapshotFingerprint(
      typeof storedFingerprint === "string" ? storedFingerprint : null,
    ) === activeFingerprint
  );
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requirementModelIsStale(input: {
  diagram: DiagramKind;
  activeRequirementFingerprint: string;
  state: Record<string, unknown>;
}) {
  const diagramInputFingerprints = recordValue(input.state.diagramInputFingerprints);
  const diagramFingerprint = diagramInputFingerprints[input.diagram];
  if (typeof diagramFingerprint === "string" && diagramFingerprint.trim()) {
    return !normalizedFingerprintMatches(
      diagramFingerprint,
      input.activeRequirementFingerprint,
    );
  }

  const generatedDiagrams = new Set(
    arrayValue(input.state.generatedDiagramTypes).filter(isRequirementDiagramKind),
  );
  if (!generatedDiagrams.has(input.diagram)) return false;

  const diagramVersions = recordValue(input.state.diagramVersions);
  const diagramVersion = numberOrNull(diagramVersions[input.diagram]);
  const rulesVersion = numberOrNull(input.state.rulesVersion);
  if (diagramVersion !== null && rulesVersion !== null) {
    return diagramVersion !== rulesVersion;
  }

  const models = recordValue(input.state.models);
  if (!requirementDiagramKindFromWorkspaceRecord(models[input.diagram])) {
    return false;
  }
  const requirementInputFingerprint = input.state.requirementInputFingerprint;
  return (
    typeof requirementInputFingerprint === "string" &&
    requirementInputFingerprint.trim().length > 0 &&
    !normalizedFingerprintMatches(
      requirementInputFingerprint,
      input.activeRequirementFingerprint,
    )
  );
}

function activeRequirementFingerprintForState(state: Record<string, unknown>) {
  return snapshotInputFingerprint({
    requirementText: stringValue(state.requirementText),
    rules: arrayValue(state.rules),
  });
}

function requirementModelEntriesFromState(state: Record<string, unknown>) {
  return Object.entries(recordValue(state.models)).filter(([, model]) =>
    Boolean(requirementDiagramKindFromWorkspaceRecord(model)),
  );
}

function requirementModelDiagramsFromState(state: Record<string, unknown>) {
  return orderedRequirementDiagrams(
    requirementModelEntriesFromState(state)
      .map(([, model]) => requirementDiagramKindFromWorkspaceRecord(model))
      .filter((diagram): diagram is DiagramKind => Boolean(diagram)),
  );
}

function requiredExistingRequirementSourcesForDesign(input: {
  designDiagrams: DesignDiagramKind[];
  requirementModels: unknown[];
}) {
  const existingRequirementDiagrams = new Set(
    input.requirementModels.flatMap((model) => {
      const diagramKind = requirementDiagramKindFromWorkspaceRecord(model);
      return diagramKind ? [diagramKind] : [];
    }),
  );
  return orderedRequirementDiagrams(
    input.designDiagrams.flatMap((diagram) =>
      DESIGN_REQUIREMENT_SOURCE_MAP[diagram].filter((source) =>
        existingRequirementDiagrams.has(source),
      ),
    ),
  );
}

function staleRequirementModelDiagrams(input: {
  diagrams: DiagramKind[];
  state: Record<string, unknown>;
}) {
  const activeRequirementFingerprint = activeRequirementFingerprintForState(
    input.state,
  );
  return input.diagrams.filter((diagram) =>
    requirementModelIsStale({
      diagram,
      activeRequirementFingerprint,
      state: input.state,
    }),
  );
}

function rejectStaleRequirementModelsForDesignCommand(input: {
  designDiagrams: DesignDiagramKind[];
  requirementModels: unknown[];
  state: Record<string, unknown>;
}): InputResolution<never> | null {
  const staleSources = staleRequirementModelDiagrams({
    diagrams: requiredExistingRequirementSourcesForDesign({
      designDiagrams: input.designDiagrams,
      requirementModels: input.requirementModels,
    }),
    state: input.state,
  });
  if (staleSources.length === 0) return null;
  return runInputResolutionError(
    409,
    `Requirement models are stale for design generation: ${staleSources.join(", ")}. Update requirement models before starting design generation.`,
  );
}

function modelKeyForWorkspaceRecord(entry: [string, unknown]) {
  const [key, model] = entry;
  return readNestedText(model, "modelId") || key;
}

function modelKeysForWorkspaceRecord(entry: [string, unknown]) {
  const [key, model] = entry;
  const modelId = readNestedText(model, "modelId");
  return modelId && modelId !== key ? [key, modelId] : [key];
}

function recordHasAnyKey(
  record: Record<string, string>,
  keys: string[],
) {
  return keys.some((key) => Boolean(record[key]));
}

function recordValueForAnyKey(
  record: Record<string, string>,
  keys: string[],
) {
  for (const key of keys) {
    const value = record[key];
    if (value) return value;
  }
  return "";
}

function generatedDesignModelEntries(input: {
  state: Record<string, unknown>;
  includeAllWhenUngenerated: boolean;
}) {
  const allDesignModelEntries = Object.entries(
    recordValue(input.state.designModels),
  );
  const generatedDesignDiagrams = arrayValue(
    input.state.generatedDesignDiagramTypes,
  ).filter(isDesignDiagramKind);
  const generated = new Set(generatedDesignDiagrams);
  return allDesignModelEntries.filter(([, model]) => {
    const diagramKind = designDiagramKindFromWorkspaceRecord(model);
    return (
      (input.includeAllWhenUngenerated && generated.size === 0) ||
      Boolean(diagramKind && generated.has(diagramKind))
    );
  });
}

function designChainIssues(input: {
  state: Record<string, unknown>;
  includeAllWhenUngenerated: boolean;
  requireTraceability: boolean;
}) {
  const designModelEntries = generatedDesignModelEntries(input);
  const activeDesignFingerprint = designInputFingerprint(
    presentRecordValues(input.state.models),
    arrayValue(input.state.requirementModelTraceability),
  );
  const designInputFingerprints = stringRecordValue(
    input.state.designInputFingerprints,
  );
  const designPlantUml = stringRecordValue(input.state.designPlantUml);
  const missingFingerprints = designModelEntries
    .filter((entry) =>
      !recordHasAnyKey(designInputFingerprints, modelKeysForWorkspaceRecord(entry)),
    )
    .map(modelKeyForWorkspaceRecord);
  const staleFingerprints = designModelEntries
    .filter((entry) => {
      const fingerprint = recordValueForAnyKey(
        designInputFingerprints,
        modelKeysForWorkspaceRecord(entry),
      );
      return (
        Boolean(fingerprint) &&
        normalizeDesignInputFingerprint(fingerprint) !== activeDesignFingerprint
      );
    })
    .map(modelKeyForWorkspaceRecord);
  const missingPlantUml = designModelEntries
    .filter((entry) =>
      !recordHasAnyKey(designPlantUml, modelKeysForWorkspaceRecord(entry)),
    )
    .map(modelKeyForWorkspaceRecord);
  const missingTraceability =
    input.requireTraceability &&
    arrayValue(input.state.designModelTraceability).length === 0;
  return {
    missingFingerprints,
    staleFingerprints,
    missingPlantUml,
    missingTraceability,
    checkedModelCount: designModelEntries.length,
  };
}

function rejectIncompleteDesignChain(input: {
  state: Record<string, unknown>;
  includeAllWhenUngenerated: boolean;
  requireTraceability: boolean;
  messagePrefix: string;
}): InputResolution<never> | null {
  const issues = designChainIssues(input);
  if (issues.checkedModelCount === 0) return null;
  if (
    issues.missingFingerprints.length === 0 &&
    issues.staleFingerprints.length === 0 &&
    issues.missingPlantUml.length === 0 &&
    !issues.missingTraceability
  ) {
    return null;
  }

  const details = [
    issues.missingFingerprints.length > 0
      ? `缺少设计输入指纹：${issues.missingFingerprints.join("、")}`
      : null,
    issues.staleFingerprints.length > 0
      ? `设计输入指纹已过期：${issues.staleFingerprints.join("、")}`
      : null,
    issues.missingPlantUml.length > 0
      ? `缺少设计 PlantUML：${issues.missingPlantUml.join("、")}`
      : null,
    issues.missingTraceability ? "缺少设计到需求的元素级映射" : null,
  ].filter(Boolean);
  return runInputResolutionError(
    409,
    `${input.messagePrefix}${details.join("；")}`,
  );
}

function rejectProjectGenerationPreflight(input: {
  kind: ProjectGenerationPreflightKind;
  state: Record<string, unknown>;
  designDiagrams?: DesignDiagramKind[];
}): InputResolution<never> | null {
  const blockedRequirementReviews =
    rejectBlockingRequirementReviewsForProjectCommand(input.state);
  if (blockedRequirementReviews) return blockedRequirementReviews;

  const requirementSourceMissing =
    stringValue(input.state.requirementText).trim().length === 0;
  if (requirementSourceMissing && input.kind !== "feasibilityStudy") {
    return runInputResolutionError(
      409,
      "需求源为空，请先填写需求文本后再启动生成。",
    );
  }

  if (input.kind === "requirements") return null;

  if (input.kind === "feasibilityStudy") {
    const contextModel = recordValue(input.state.feasibilityContextModel);
    const contextPlantUml = stringValue(input.state.feasibilityContextPlantUml);
    const contextSvg = stringValue(input.state.feasibilityContextSvg);
    const implementationPlan = recordValue(input.state.feasibilityImplementationPlan);
    if (
      Object.keys(contextModel).length === 0 ||
      !contextPlantUml ||
      !contextSvg ||
      Object.keys(implementationPlan).length === 0
    ) {
      return runInputResolutionError(
        409,
        "可行性研究报告需要已完成的上下文图和实现方案。",
      );
    }
    const contextFingerprint = snapshotInputFingerprint({
      rules: acceptedFeasibilityRules(input.state),
      requirementBaseline: input.state.requirementBaseline ?? null,
    });
    if (
      normalizeSnapshotFingerprint(stringValue(input.state.feasibilityContextFingerprint)) !==
      contextFingerprint
    ) {
      return runInputResolutionError(409, "上下文图已过期，请先重新生成。");
    }
    const implementationFingerprint = snapshotInputFingerprint({
      rules: acceptedFeasibilityRules(input.state),
      contextModel,
      inputs: recordValue(input.state.feasibilityInputs),
    });
    if (
      normalizeSnapshotFingerprint(stringValue(input.state.feasibilityImplementationFingerprint)) !==
      implementationFingerprint
    ) {
      return runInputResolutionError(409, "实现方案已过期，请先重新生成。");
    }
    return null;
  }

  const requirementModelEntries = requirementModelEntriesFromState(input.state);
  if (requirementModelEntries.length === 0) {
    return runInputResolutionError(
      409,
      "缺少需求模型，请先生成需求模型后再启动下游生成。",
    );
  }

  if (input.kind === "design") {
    const staleRequirements = rejectStaleRequirementModelsForDesignCommand({
      designDiagrams: input.designDiagrams ?? [],
      requirementModels: requirementModelEntries.map(([, model]) => model),
      state: input.state,
    });
    if (staleRequirements) return staleRequirements;
  } else {
    const staleDiagrams = staleRequirementModelDiagrams({
      diagrams: requirementModelDiagramsFromState(input.state),
      state: input.state,
    });
    if (staleDiagrams.length > 0) {
      return runInputResolutionError(
        409,
        `需求模型已过期，请先重新生成需求模型：${staleDiagrams.join("、")}`,
      );
    }
  }

  if (
    (input.kind === "design" ||
      input.kind === "requirementsSpec" ||
      input.kind === "softwareDesignSpec") &&
    arrayValue(input.state.requirementModelTraceability).length === 0
  ) {
    return runInputResolutionError(
      409,
      "需求模型缺少元素级映射，请先重新生成需求模型。",
    );
  }

  if (
    input.kind === "requirementsSpec" ||
    input.kind === "softwareDesignSpec"
  ) {
    const requirementPlantUml = stringRecordValue(input.state.plantUml);
    const missingPlantUml = requirementModelEntries
      .map(modelKeyForWorkspaceRecord)
      .filter((modelId) => !requirementPlantUml[modelId]);
    if (missingPlantUml.length > 0) {
      return runInputResolutionError(
        409,
        `需求模型缺少 PlantUML，请先重新生成需求模型：${missingPlantUml.join("、")}`,
      );
    }
  }

  if (input.kind === "code" || input.kind === "softwareDesignSpec") {
    const designModelEntries = Object.entries(recordValue(input.state.designModels));
    if (designModelEntries.length === 0) {
      return runInputResolutionError(
        409,
        "缺少设计模型，请先生成设计模型后再启动下游生成。",
      );
    }

    const designDiagramErrorKeys = Object.keys(recordValue(input.state.designDiagramErrors));
    if (designDiagramErrorKeys.length > 0) {
      return runInputResolutionError(
        409,
        `设计图仍有渲染错误，请先重新生成设计模型：${designDiagramErrorKeys.join("、")}`,
      );
    }
  }

  if (input.kind === "code") {
    return rejectIncompleteDesignChain({
      state: input.state,
      includeAllWhenUngenerated: false,
      requireTraceability: false,
      messagePrefix:
        "设计模型已生成但链路元数据不完整，请先重新生成设计模型。",
    });
  }

  if (input.kind === "softwareDesignSpec") {
    return rejectIncompleteDesignChain({
      state: input.state,
      includeAllWhenUngenerated: true,
      requireTraceability: true,
      messagePrefix:
        "软件设计说明书需要完整且新鲜的设计链路，请先重新生成设计模型。",
    });
  }

  return null;
}

const REVIEWABLE_REQUIREMENT_FIELDS = [
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
];

function requirementHasPendingReviewField(requirement: Record<string, unknown>) {
  const fieldProvenance = recordValue(requirement.fieldProvenance);
  return REVIEWABLE_REQUIREMENT_FIELDS.some(
    (field) => recordValue(fieldProvenance[field]).status === "pending-review",
  );
}

function blockingRequirementReviewRuleIds(state: Record<string, unknown>) {
  const baseline = recordValue(state.requirementBaseline);
  const requirements = arrayValue(baseline.requirements);
  if (requirements.length === 0) return [];
  const candidates = recordValue(state.requirementReviewCandidates);
  const blockedRuleIds = new Set<string>();
  for (const requirementValue of requirements) {
    const requirement = recordValue(requirementValue);
    const sourceRuleId = stringValue(requirement.sourceRuleId);
    if (!sourceRuleId) continue;
    const candidateValue = candidates[sourceRuleId];
    const hasCandidate = isPlainRecord(candidateValue);
    if (!hasCandidate) continue;
    const candidate = recordValue(candidateValue);
    const candidatePending =
      candidate.status === "pending" || candidate.status === "failed";
    if (
      candidatePending ||
      requirement.status !== "accepted" ||
      requirementHasPendingReviewField(requirement)
    ) {
      blockedRuleIds.add(sourceRuleId);
    }
  }
  return Array.from(blockedRuleIds);
}

function rejectBlockingRequirementReviewsForProjectCommand(
  state: Record<string, unknown>,
): InputResolution<never> | null {
  const blockedRuleIds = blockingRequirementReviewRuleIds(state);
  if (blockedRuleIds.length === 0) return null;
  return runInputResolutionError(
    409,
    `请先确认需求规则修复结果后再启动生成：${blockedRuleIds.join(", ")}`,
  );
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
    ([artifactId, source]) => {
      const diagramKind = scopedDiagramKindFromKey(artifactId);
      return {
        diagramKind,
        ...(artifactId.includes(":") ? { modelId: artifactId } : {}),
        source,
      };
    },
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
  metadata: RunInputMetadata | undefined;
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

export async function resolveRequirementRunInput(
  body: unknown,
  metadata: RunInputMetadata | undefined,
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
  const preflight = rejectProjectGenerationPreflight({
    kind: "requirements",
    state: workspace.input.state,
  });
  if (preflight) return preflight;
  const contextModels = presentRecordValues(workspace.input.state.models);
  const requirementSource = buildAcceptedRequirementSnapshot(
    arrayValue(workspace.input.state.rules),
    workspace.input.state.requirementBaseline ?? null,
  );
  const requirementTargets = resolveRequirementCommandTargets({
    selectedDiagrams: command.selectedDiagrams,
    requestedDiagrams: command.requestedDiagrams,
    dependencyDiagrams: command.dependencyDiagrams,
    existingRequirementModels: contextModels,
  });
  return {
    ok: true,
    input: startRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      requirementText: stringValue(workspace.input.state.requirementText),
      selectedDiagrams: requirementTargets.selectedDiagrams,
      requestedDiagrams: requirementTargets.requestedDiagrams,
      dependencyDiagrams: requirementTargets.dependencyDiagrams,
      rules: requirementSource.rules,
      contextModels,
      contextRequirementModelTraceability: arrayValue(
        workspace.input.state.requirementModelTraceability,
      ),
      analysisTargetUseCaseIds: command.analysisTargetUseCaseIds,
      providerSettings: command.providerSettings,
    }),
  };
}

export async function resolveDesignRunInput(
  body: unknown,
  metadata: RunInputMetadata | undefined,
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
  const existingDesignModels = presentRecordValues(
    workspace.input.state.designModels,
  );
  const requirementModels = presentRecordValues(workspace.input.state.models);
  const designTargets = resolveDesignCommandTargets({
    selectedDiagrams: command.selectedDiagrams,
    requestedDiagrams: command.requestedDiagrams,
    existingDesignModels,
  });
  const preflight = rejectProjectGenerationPreflight({
    kind: "design",
    state: workspace.input.state,
    designDiagrams: designTargets.requestedDiagrams,
  });
  if (preflight) return preflight;
  return {
    ok: true,
    input: filterReplacingDesignContext(startDesignRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      requirementBaseline: workspace.input.state.requirementBaseline,
      requirementModels,
      requirementModelTraceability: arrayValue(
        workspace.input.state.requirementModelTraceability,
      ),
      selectedDiagrams: designTargets.selectedDiagrams,
      requestedDiagrams: designTargets.requestedDiagrams,
      existingDesignModels,
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

export async function resolveCodeRunInput(
  body: unknown,
  metadata: RunInputMetadata | undefined,
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
  const preflight = rejectProjectGenerationPreflight({
    kind: "code",
    state: workspace.input.state,
  });
  if (preflight) return preflight;
  return {
    ok: true,
    input: startCodeRunRequestSchema.parse({
      projectId: workspace.input.projectId,
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

export async function resolveDocumentRunInput(
  body: unknown,
  metadata: RunInputMetadata | undefined,
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
  const preflight = rejectProjectGenerationPreflight({
    kind: command.documentKind,
    state: workspace.input.state,
  });
  if (preflight) return preflight;
  return {
    ok: true,
    input: startDocumentRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      documentKind: command.documentKind,
      requirementText:
        stringValue(workspace.input.state.requirementText) ||
        (command.documentKind === "feasibilityStudy" ? "未提供/待确认" : ""),
      requirementBaseline: workspace.input.state.requirementBaseline ?? null,
      rules: command.documentKind === "feasibilityStudy"
        ? acceptedFeasibilityRules(workspace.input.state)
        : arrayValue(workspace.input.state.rules),
      requirementModels: [
        ...presentRecordValues(workspace.input.state.models),
        ...(command.documentKind === "feasibilityStudy"
          ? [workspace.input.state.feasibilityContextModel]
          : []),
      ],
      requirementModelTraceability: arrayValue(
        workspace.input.state.requirementModelTraceability,
      ),
      requirementPlantUml: [
        ...requirementPlantUmlArtifactsFromWorkspace(workspace.input.state),
        ...(command.documentKind === "feasibilityStudy"
          ? [{
              diagramKind: "context",
              modelId: "context",
              source: stringValue(workspace.input.state.feasibilityContextPlantUml),
            }]
          : []),
      ],
      requirementSvgArtifacts: [
        ...presentRecordValues(workspace.input.state.svgArtifacts),
        ...(command.documentKind === "feasibilityStudy"
          ? [{
              diagramKind: "context",
              modelId: "context",
              svg: stringValue(workspace.input.state.feasibilityContextSvg),
              renderMeta: {
                engine: "plantuml",
                generatedAt: new Date().toISOString(),
                sourceLength: stringValue(workspace.input.state.feasibilityContextPlantUml).length,
                durationMs: 0,
              },
            }]
          : []),
      ],
      designModels: presentRecordValues(workspace.input.state.designModels),
      designModelTraceability: arrayValue(
        workspace.input.state.designModelTraceability,
      ),
      designPlantUml: designPlantUmlArtifactsFromWorkspace(workspace.input.state),
      designSvgArtifacts: presentRecordValues(
        workspace.input.state.designSvgArtifacts,
      ),
      feasibilityImplementationPlan:
        workspace.input.state.feasibilityImplementationPlan ?? null,
      feasibilityInputs: workspace.input.state.feasibilityInputs ?? {},
      providerSettings: command.providerSettings,
      useAiText: command.useAiText,
      documentStyle: command.documentStyle,
    }),
  };
}
