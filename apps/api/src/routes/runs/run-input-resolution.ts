// Resolves project-scoped run start commands into full pipeline request inputs.
import {
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
  return {
    ok: true,
    input: startDocumentRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      documentKind: command.documentKind,
      requirementText: stringValue(workspace.input.state.requirementText),
      requirementBaseline: workspace.input.state.requirementBaseline ?? null,
      rules: arrayValue(workspace.input.state.rules),
      requirementModels: presentRecordValues(workspace.input.state.models),
      requirementModelTraceability: arrayValue(
        workspace.input.state.requirementModelTraceability,
      ),
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
