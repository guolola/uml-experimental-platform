// Owns run trace mutation helpers shared by API pipelines and repair flows.
import {
  codeTraceEntrySchema,
  designDiagramKindSchema,
  designTraceEntrySchema,
  diagramKindSchema,
  requirementTraceEntrySchema,
  type CodeRunSnapshot,
  type CodeTraceEntry,
  type DesignDiagramKind,
  type DesignRunSnapshot,
  type DesignTraceEntry,
  type DiagramKind,
  type RequirementTraceEntry,
  type RunSnapshot,
} from "@uml-platform/contracts";
import { type AnyPlantUmlArtifact } from "../../../adapters/render/render-client.js";
import { type RunRecord } from "../../records/run-record-store.js";

function isRequirementRunRecord(record: RunRecord): record is RunRecord & {
  snapshot: RunSnapshot;
} {
  return (
    "models" in record.snapshot &&
    "plantUml" in record.snapshot &&
    "svgArtifacts" in record.snapshot &&
    Array.isArray((record.snapshot as RunSnapshot).requirementTrace) &&
    !("requirementModels" in record.snapshot) &&
    !("files" in record.snapshot)
  );
}

export function appendRequirementTrace(
  record: RunRecord,
  entry: Omit<RequirementTraceEntry, "createdAt">,
) {
  if (!isRequirementRunRecord(record)) {
    return;
  }

  record.snapshot.requirementTrace = [
    ...record.snapshot.requirementTrace,
    requirementTraceEntrySchema.parse({
      ...entry,
      createdAt: new Date().toISOString(),
    }),
  ];
}

function isDesignRunRecord(record: RunRecord): record is RunRecord & {
  snapshot: DesignRunSnapshot;
} {
  return (
    "requirementModels" in record.snapshot &&
    "selectedDiagrams" in record.snapshot &&
    Array.isArray((record.snapshot as DesignRunSnapshot).designTrace)
  );
}

export function appendDesignTrace(
  record: RunRecord,
  entry: Omit<DesignTraceEntry, "createdAt">,
) {
  if (!isDesignRunRecord(record)) {
    return;
  }

  record.snapshot.designTrace = [
    ...record.snapshot.designTrace,
    designTraceEntrySchema.parse({
      ...entry,
      createdAt: new Date().toISOString(),
    }),
  ];
}

function isCodeSnapshot(snapshot: RunRecord["snapshot"]): snapshot is CodeRunSnapshot {
  return "files" in snapshot && "entryFile" in snapshot;
}

export function appendCodeTrace(
  record: RunRecord,
  entry: Omit<CodeTraceEntry, "createdAt">,
) {
  if (!isCodeSnapshot(record.snapshot)) {
    return;
  }

  record.snapshot.codeTrace = [
    ...(record.snapshot.codeTrace ?? []),
    codeTraceEntrySchema.parse({
      ...entry,
      createdAt: new Date().toISOString(),
    }),
  ];
}

export function designDiagramKindFromArtifact(
  artifact: AnyPlantUmlArtifact,
): DesignDiagramKind | undefined {
  const parsed = designDiagramKindSchema.safeParse(artifact.diagramKind);
  return parsed.success ? parsed.data : undefined;
}

export function requirementDiagramKindFromArtifact(
  artifact: AnyPlantUmlArtifact,
): DiagramKind | undefined {
  const parsed = diagramKindSchema.safeParse(artifact.diagramKind);
  return parsed.success ? parsed.data : undefined;
}

