import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramModelSpec, RunSnapshot } from "@uml-platform/contracts";
import { createEmptySnapshot } from "../../runs/records/snapshots.js";
import { restoreRunSnapshotToWorkspaceState } from "./workspace-snapshot-restore.js";

function analysisModel(useCaseId: string, title: string): DiagramModelSpec {
  return {
    diagramKind: "analysis",
    modelId: `analysis:${useCaseId}`,
    sourceUseCaseId: useCaseId,
    sourceUseCaseName: title,
    title: `${title}需求分析模型`,
    summary: `根据${title}事件流生成。`,
    notes: [],
    participants: [
      {
        id: `actor_${useCaseId}`,
        name: "用户",
        participantType: "actor",
      },
    ],
    messages: [],
    fragments: [],
  };
}

test("restore keeps requirement analysis model instances keyed by modelId", () => {
  const snapshot = createEmptySnapshot(
    "run-analysis-restore",
    "用户可以检索并预约设备。",
    ["analysis"],
    [],
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.models = [
    analysisModel("uc_search", "检索设备"),
    analysisModel("uc_reserve", "提交预约"),
  ];
  snapshot.plantUml = snapshot.models.map((model) => ({
    diagramKind: "analysis",
    modelId: model.modelId,
    source: `@startuml\n' ${model.modelId}\n@enduml`,
  }));
  snapshot.svgArtifacts = snapshot.models.map((model) => ({
    diagramKind: "analysis",
    modelId: model.modelId,
    svg: `<svg data-model-id="${model.modelId}" />`,
    renderMeta: {
      engine: "plantuml",
      generatedAt: "2026-06-04T00:00:00.000Z",
      sourceLength: 32,
      durationMs: 1,
    },
  }));

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      models: {
        analysis: analysisModel("old", "旧分析"),
      },
      plantUml: {
        analysis: "@startuml\n' old\n@enduml",
      },
      svgArtifacts: {
        analysis: {
          diagramKind: "analysis",
          svg: "<svg data-old />",
          renderMeta: {
            engine: "plantuml",
            generatedAt: "2026-06-04T00:00:00.000Z",
            sourceLength: 16,
            durationMs: 1,
          },
        },
      },
    },
    snapshot,
    mode: "merge",
  });

  const models = restored.models as Record<string, DiagramModelSpec>;
  const plantUml = restored.plantUml as Record<string, string>;
  const svgArtifacts = restored.svgArtifacts as Record<string, { modelId?: string }>;
  assert.equal(models.analysis, undefined);
  assert.deepEqual(Object.keys(models).sort(), [
    "analysis:uc_reserve",
    "analysis:uc_search",
  ]);
  assert.deepEqual(Object.keys(plantUml).sort(), [
    "analysis:uc_reserve",
    "analysis:uc_search",
  ]);
  assert.deepEqual(Object.keys(svgArtifacts).sort(), [
    "analysis:uc_reserve",
    "analysis:uc_search",
  ]);
});
