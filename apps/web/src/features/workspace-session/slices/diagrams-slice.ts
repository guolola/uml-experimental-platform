// Owns requirement-level diagram selection, generated artifacts, and version markers.
import { useState } from "react";
import type { DiagramType } from "../../../entities/diagram/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

export function useDiagramsSlice() {
  const [models, setModels] = useState<WorkspaceRecord["models"]>({});
  const [selectedDiagrams, setSelectedDiagrams] = useState<DiagramType[]>([]);
  const [plantUml, setPlantUml] = useState<WorkspaceRecord["plantUml"]>({});
  const [svgArtifacts, setSvgArtifacts] = useState<WorkspaceRecord["svgArtifacts"]>(
    {},
  );
  const [diagramErrors, setDiagramErrors] = useState<WorkspaceRecord["diagramErrors"]>(
    {},
  );
  const [generatedDiagrams, setGeneratedDiagrams] = useState<DiagramType[]>([]);
  const [diagramVersions, setDiagramVersions] = useState<
    Partial<Record<DiagramType, number>>
  >({});

  return {
    models,
    setModels,
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
  };
}
