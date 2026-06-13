// Owns manual PlantUML render actions and artifact state updates.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { DiagramType } from "../../../entities/diagram/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { WorkspaceRepository } from "../../../services/workspace-repository";

type Setter<T> = Dispatch<SetStateAction<T>>;

interface PlantUmlRenderActionsInput {
  repository: WorkspaceRepository;
  setDiagramErrors: Setter<WorkspaceRecord["diagramErrors"]>;
  setGeneratedDiagrams: Setter<DiagramType[]>;
  setPlantUml: Setter<Partial<Record<DiagramType, string>>>;
  setSvgArtifacts: Setter<WorkspaceRecord["svgArtifacts"]>;
}

export function usePlantUmlRenderActions({
  repository,
  setDiagramErrors,
  setGeneratedDiagrams,
  setPlantUml,
  setSvgArtifacts,
}: PlantUmlRenderActionsInput) {
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
    [
      repository,
      setDiagramErrors,
      setGeneratedDiagrams,
      setPlantUml,
      setSvgArtifacts,
    ],
  );

  return { renderPlantUml };
}
