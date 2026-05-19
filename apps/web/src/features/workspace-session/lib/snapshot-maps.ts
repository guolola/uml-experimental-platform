// Maps completed run snapshots into the record maps consumed by workspace state.

import type {
  WorkspaceRecord,
  WorkspaceDesignRunSnapshot,
  WorkspaceRunSnapshot,
} from "../../../entities/workspace/model";

export function snapshotToMaps(snapshot: WorkspaceRunSnapshot) {
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

export function designSnapshotToMaps(snapshot: WorkspaceDesignRunSnapshot) {
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
