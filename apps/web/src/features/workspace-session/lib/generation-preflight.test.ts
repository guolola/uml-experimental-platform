// Verifies design generation preflight resumes failed batches without rerunning successful diagrams.
import { describe, expect, it } from "vitest";
import type { DesignDiagramModelSpec } from "@uml-platform/contracts";
import type { DesignDiagramType } from "../../../entities/diagram/model";
import { createEmptyWorkspace } from "../../../services/workspace-repository/workspace-state";
import { designInputFingerprint } from "../../../shared/lib/fingerprint";
import { analyzeDesignGenerationPreflight } from "./generation-preflight";

function designModel(diagramKind: DesignDiagramModelSpec["diagramKind"]) {
  return {
    diagramKind,
    modelId: `${diagramKind}:model`,
    title: diagramKind,
    summary: diagramKind,
    notes: [],
  } as DesignDiagramModelSpec;
}

function basePreflightInput() {
  const workspace = createEmptyWorkspace();
  const currentFingerprint = designInputFingerprint([], []);
  const classModel = designModel("class");
  const tableModel = designModel("table");
  const componentModel = designModel("component");

  return {
    designDiagramErrors: {
      component: {
        stage: "render_svg" as const,
        error: {
          code: "RUN_RENDER_FAILED" as const,
          message: "组件图渲染失败",
          category: "render" as const,
          retryable: true,
        },
      },
    },
    designInputFingerprints: {
      [classModel.modelId!]: currentFingerprint,
      [tableModel.modelId!]: currentFingerprint,
      [componentModel.modelId!]: currentFingerprint,
    },
    designModels: {
      [classModel.modelId!]: classModel,
      [tableModel.modelId!]: tableModel,
      [componentModel.modelId!]: componentModel,
    },
    designSvgArtifacts: {
      [tableModel.modelId!]: {
        diagramKind: "table" as const,
        modelId: tableModel.modelId,
        svg: "<svg data-kind=\"table\" />",
        renderMeta: {
          engine: "plantuml" as const,
          generatedAt: "2026-06-19T00:00:00.000Z",
          sourceLength: 18,
          durationMs: 1,
        },
      },
    },
    diagramInputFingerprints: workspace.diagramInputFingerprints,
    diagramVersions: workspace.diagramVersions,
    generatedDiagrams: workspace.generatedDiagramTypes,
    manualModelEditStatus: workspace.manualModelEditStatus,
    models: workspace.models,
    requirementBaseline: null,
    requirementInputFingerprint: null,
    requirementModelTraceability: workspace.requirementModelTraceability,
    requirementReviewCandidates: workspace.requirementReviewCandidates,
    requirementText: "",
    rules: [],
    rulesBasedOnTextVersion: null,
    rulesVersion: workspace.rulesVersion,
    selectedDesignDiagrams: ["table", "component"] as DesignDiagramType[],
    textVersion: 0,
  };
}

describe("analyzeDesignGenerationPreflight", () => {
  it("resumes failed batch design generation without rerunning successful artifacts", () => {
    const preflight = analyzeDesignGenerationPreflight(basePreflightInput());

    expect(preflight.status).toBe("ready");
    if (preflight.status !== "ready") return;
    expect(preflight.requestedDiagrams).toEqual(["component"]);
  });

  it("keeps a single successful diagram request as an explicit regenerate action", () => {
    const preflight = analyzeDesignGenerationPreflight({
      ...basePreflightInput(),
      only: ["table"],
      selectedDesignDiagrams: ["table"],
    });

    expect(preflight.status).toBe("ready");
    if (preflight.status !== "ready") return;
    expect(preflight.requestedDiagrams).toEqual(["table"]);
  });
});
