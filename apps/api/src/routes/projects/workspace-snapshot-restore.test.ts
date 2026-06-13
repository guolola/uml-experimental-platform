// Verifies project workspace snapshot restoration across requirement, design, code, and document artifacts.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DesignDiagramModelSpec,
  DesignRunSnapshot,
  DesignSvgArtifact,
  DiagramModelSpec,
  RunSnapshot,
} from "@uml-platform/contracts";
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

function requirementUseCaseModel(): DiagramModelSpec {
  return {
    diagramKind: "usecase",
    title: "用例模型",
    summary: "当前需求用例。",
    notes: [],
    actors: [],
    useCases: [
      {
        id: "uc-1",
        name: "查看座位",
        goal: "查看可预约座位。",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  } as DiagramModelSpec;
}

function sequenceDesignModel(
  modelId: string,
  sourceUseCaseId: string,
): DesignDiagramModelSpec {
  return {
    diagramKind: "sequence",
    modelId,
    sourceUseCaseId,
    sourceUseCaseName: sourceUseCaseId,
    title: `${sourceUseCaseId}用例实现设计`,
    summary: "用例实现时序。",
    notes: [],
    participants: [],
    messages: [],
    fragments: [],
  };
}

function classDesignModel(): DesignDiagramModelSpec {
  return {
    diagramKind: "class",
    modelId: "class",
    title: "设计类图",
    summary: "静态设计模型。",
    notes: [],
    classes: [],
    interfaces: [],
    enums: [],
    relationships: [],
  };
}

function designSvgArtifact(
  diagramKind: "sequence" | "class",
  modelId: string,
): DesignSvgArtifact {
  return {
    diagramKind,
    modelId,
    svg: `<svg data-model-id="${modelId}" />`,
    renderMeta: {
      engine: "plantuml",
      generatedAt: "2026-06-10T00:00:00.000Z",
      sourceLength: 32,
      durationMs: 1,
    },
  };
}

function designSnapshot(
  overrides: Partial<DesignRunSnapshot> = {},
): DesignRunSnapshot {
  return {
    runId: "design-run-restore",
    requirementText: "",
    selectedDiagrams: ["sequence"],
    requestedDiagrams: ["sequence"],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    requirementModels: [requirementUseCaseModel()],
    requirementModelTraceability: [],
    models: [],
    designModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    designTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
    ...overrides,
  };
}

test("restore replaces old design records by successful selected design kind", () => {
  const oldSequence = sequenceDesignModel("sequence:uc_old", "uc_old");
  const newSequence = sequenceDesignModel("sequence:uc-1", "uc-1");
  const snapshot = designSnapshot({
    models: [newSequence],
    plantUml: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc-1",
        source: "@startuml\n@enduml",
      },
    ],
    svgArtifacts: [designSvgArtifact("sequence", "sequence:uc-1")],
    designModelTraceability: [
      {
        source: {
          diagramKind: "usecase",
          elementId: "uc-1",
          elementKind: "useCase",
          label: "查看座位",
        },
        targets: [
          {
            modelId: "sequence:uc-1",
            diagramKind: "sequence",
            elementId: "message-1",
            elementKind: "message",
            label: "查看座位",
          },
        ],
      },
    ],
  });

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      designModels: {
        "sequence:uc_old": oldSequence,
        class: classDesignModel(),
      },
      designPlantUml: {
        "sequence:uc_old": "@startuml\n' old\n@enduml",
        class: "@startuml\nclass Existing\n@enduml",
      },
      designSvgArtifacts: {
        "sequence:uc_old": designSvgArtifact("sequence", "sequence:uc_old"),
        class: designSvgArtifact("class", "class"),
      },
      designInputFingerprints: {
        "sequence:uc_old": "old-fp",
        class: "class-fp",
      },
      designModelTraceability: [
        {
          source: {
            diagramKind: "usecase",
            elementId: "uc_old",
            elementKind: "useCase",
            label: "旧用例",
          },
          targets: [
            {
              modelId: "sequence:uc_old",
              diagramKind: "sequence",
              elementId: "old-message",
              elementKind: "message",
              label: "旧消息",
            },
          ],
        },
        {
          source: {
            diagramKind: "usecase",
            elementId: "uc-1",
            elementKind: "useCase",
            label: "查看座位",
          },
          targets: [
            {
              modelId: "class",
              diagramKind: "class",
              elementId: "Existing",
              elementKind: "class",
              label: "Existing",
            },
          ],
        },
      ],
    },
    snapshot,
    mode: "merge",
  });

  assert.deepEqual(
    Object.keys(restored.designModels as Record<string, unknown>).sort(),
    ["class", "sequence:uc-1"],
  );
  assert.deepEqual(
    Object.keys(restored.designPlantUml as Record<string, unknown>).sort(),
    ["class", "sequence:uc-1"],
  );
  assert.deepEqual(
    Object.keys(restored.designSvgArtifacts as Record<string, unknown>).sort(),
    ["class", "sequence:uc-1"],
  );
  assert.equal(
    (restored.designInputFingerprints as Record<string, string>)["sequence:uc_old"],
    undefined,
  );
  assert.equal(
    (restored.designModelTraceability as Array<{ targets: Array<{ modelId?: string }> }>)
      .some((entry) =>
        entry.targets.some((target) => target.modelId === "sequence:uc_old"),
      ),
    false,
  );
});

test("restore preserves old design records when selected design kind failed", () => {
  const oldSequence = sequenceDesignModel("sequence:uc_old", "uc_old");
  const snapshot = designSnapshot({
    status: "failed",
    models: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {
      sequence: {
        stage: "generate_design_models",
        error: {
          code: "PLATFORM_PROVIDER_TIMEOUT",
          message: "当前模型服务响应超时，请稍后重试。",
          category: "platform_provider",
          retryable: true,
        },
      },
    },
  });

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      designModels: {
        "sequence:uc_old": oldSequence,
      },
      designPlantUml: {
        "sequence:uc_old": "@startuml\n' old\n@enduml",
      },
      designSvgArtifacts: {
        "sequence:uc_old": designSvgArtifact("sequence", "sequence:uc_old"),
      },
    },
    snapshot,
    mode: "merge",
  });

  assert.deepEqual(Object.keys(restored.designModels as Record<string, unknown>), [
    "sequence:uc_old",
  ]);
  assert.deepEqual(
    Object.keys(restored.designPlantUml as Record<string, unknown>),
    ["sequence:uc_old"],
  );
  assert.ok((restored.designDiagramErrors as Record<string, unknown>).sequence);
});

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
  const svgArtifacts = restored.svgArtifacts as Record<
    string,
    { modelId?: string }
  >;
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

test("restore does not mark context requirement models generated without artifacts", () => {
  const snapshot = createEmptySnapshot(
    "run-class-restore",
    "用户可以浏览活动并报名。",
    ["class"],
    [],
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.models = [
    {
      diagramKind: "usecase",
      modelId: "usecase",
      title: "上下文用例模型",
      summary: "来自早前运行。",
      notes: [],
      actors: [],
      useCases: [],
      relationships: [],
    } as DiagramModelSpec,
    {
      diagramKind: "class",
      modelId: "class",
      title: "领域概念模型",
      summary: "本次运行生成。",
      notes: [],
      classes: [],
      interfaces: [],
      enums: [],
      relationships: [],
    } as DiagramModelSpec,
  ];
  snapshot.plantUml = [
    {
      diagramKind: "class",
      source: "@startuml\nclass Activity\n@enduml",
    },
  ];
  snapshot.svgArtifacts = [
    {
      diagramKind: "class",
      svg: "<svg><text>Activity</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: "2026-06-08T00:00:00.000Z",
        sourceLength: 32,
        durationMs: 1,
      },
    },
  ];

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      models: {
        usecase: {
          diagramKind: "usecase",
          modelId: "usecase",
          title: "旧用例模型",
          summary: "旧状态。",
          notes: [],
          actors: [],
          useCases: [],
          relationships: [],
        },
      },
      plantUml: {
        usecase: "@startuml\nusecase Old\n@enduml",
      },
      svgArtifacts: {
        usecase: {
          diagramKind: "usecase",
          svg: "<svg><text>Old</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: "2026-06-08T00:00:00.000Z",
            sourceLength: 24,
            durationMs: 1,
          },
        },
      },
      generatedDiagramTypes: ["usecase"],
      diagramVersions: { usecase: 1 },
    },
    snapshot,
    mode: "restore",
  });

  const models = restored.models as Record<string, DiagramModelSpec>;
  const plantUml = restored.plantUml as Record<string, string>;
  const svgArtifacts = restored.svgArtifacts as Record<
    string,
    { diagramKind?: string }
  >;
  assert.deepEqual(restored.generatedDiagramTypes, ["class"]);
  assert.deepEqual(Object.keys(models), ["class"]);
  assert.deepEqual(Object.keys(plantUml), ["class"]);
  assert.deepEqual(Object.keys(svgArtifacts), ["class"]);
  assert.deepEqual(restored.diagramVersions, { class: 1 });
});

test("restore preserves existing artifacts when selected diagram only has an error", () => {
  const snapshot = createEmptySnapshot(
    "run-activity-timeout",
    "用户可以浏览活动并报名。",
    ["activity"],
    [],
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.models = [
    {
      diagramKind: "usecase",
      modelId: "usecase",
      title: "上下文用例模型",
      summary: "已有模型。",
      notes: [],
      actors: [],
      useCases: [],
      relationships: [],
    } as DiagramModelSpec,
    {
      diagramKind: "class",
      modelId: "class",
      title: "领域概念模型",
      summary: "已有模型。",
      notes: [],
      classes: [],
      interfaces: [],
      enums: [],
      relationships: [],
    } as DiagramModelSpec,
    {
      diagramKind: "deployment",
      modelId: "deployment",
      title: "部署需求模型",
      summary: "上一子任务成功生成。",
      notes: [],
      nodes: [],
      databases: [],
      components: [],
      externalSystems: [],
      artifacts: [],
      relationships: [],
    } as DiagramModelSpec,
  ];
  snapshot.diagramErrors = {
    activity: {
      stage: "generate_models",
      error: {
        code: "PLATFORM_PROVIDER_TIMEOUT",
        message: "当前模型服务响应超时，请稍后重试。",
        category: "platform_provider",
        retryable: true,
      },
    },
  };

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      generatedDiagramTypes: ["usecase", "class", "deployment"],
      models: Object.fromEntries(
        snapshot.models.map((model) => [model.diagramKind, model]),
      ),
      plantUml: {
        usecase: "@startuml\nusecase Existing\n@enduml",
        class: "@startuml\nclass Existing\n@enduml",
        deployment: "@startuml\nnode Existing\n@enduml",
      },
      svgArtifacts: {
        usecase: { diagramKind: "usecase", svg: "<svg>usecase</svg>" },
        class: { diagramKind: "class", svg: "<svg>class</svg>" },
        deployment: { diagramKind: "deployment", svg: "<svg>deployment</svg>" },
      },
    },
    snapshot,
    mode: "merge",
  });

  assert.deepEqual(restored.generatedDiagramTypes, [
    "usecase",
    "class",
    "deployment",
  ]);
  assert.deepEqual(
    Object.keys(restored.plantUml as Record<string, unknown>).sort(),
    ["class", "deployment", "usecase"],
  );
  assert.deepEqual(
    Object.keys(restored.svgArtifacts as Record<string, unknown>).sort(),
    ["class", "deployment", "usecase"],
  );
  assert.equal(
    (restored.models as Record<string, unknown>).activity,
    undefined,
  );
  assert.equal(
    (restored.diagramErrors as Record<string, { error: { code: string } }>)
      .activity.error.code,
    "PLATFORM_PROVIDER_TIMEOUT",
  );
});
