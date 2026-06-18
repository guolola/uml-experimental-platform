import { describe, expect, it } from "vitest";
import type { DiagramError } from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { DesignDiagramType } from "../../../entities/diagram/model";
import type { GenerationTask } from "../../workspace-session/model/session-state";
import {
  buildLineageGraph,
  collectLineagePath,
  groupLineageColumns,
  type LineageGraphInput,
} from "./lineage-graph-model";

const baseRule: RequirementRule = {
  id: "REQ-001",
  category: "功能需求",
  text: "用户登录后可以管理实验资源。",
  relatedDiagrams: ["usecase", "class"],
};

function model(diagramKind: "usecase" | "class") {
  return { diagramKind } as unknown as NonNullable<
    WorkspaceRecord["models"][typeof diagramKind]
  >;
}

function designModel(diagramKind: DesignDiagramType) {
  return { diagramKind, modelId: diagramKind } as unknown as WorkspaceRecord["designModels"][string];
}

function diagramError(message: string): DiagramError {
  return {
    stage: "generate_models",
    error: {
      code: "RUN_STRUCTURED_OUTPUT_INVALID",
      message,
      category: "generation",
      retryable: true,
    },
  };
}

function task(overrides: Partial<GenerationTask>): GenerationTask {
  return {
    clientTaskId: "task-1",
    runId: null,
    kind: "requirements",
    title: "生成需求模型",
    status: "running",
    progress: 30,
    message: null,
    errorMessage: null,
    previewReady: false,
    phaseSummary: null,
    technicalDetailsCollapsed: true,
    diagnostics: {
      runKind: "requirements",
      runId: null,
      providerModel: null,
      startedAt: null,
      finishedAt: null,
      activeStage: null,
      streamText: "",
      chunkCount: 0,
      stageStartedAt: {},
      stageMessages: {},
      events: [],
      uiMockup: null,
      uiReferenceSpec: null,
      uiFidelityReport: null,
      visualDirection: null,
      skillResourceDiscoveryPlan: null,
      skillResourcePreviews: null,
      skillResourcePlan: null,
      codeSkillContext: null,
      requirementTrace: [],
      designTrace: [],
      codeTrace: [],
    },
    subtasks: [],
    startedAt: "2026-06-16T10:00:00.000Z",
    finishedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<LineageGraphInput> = {}): LineageGraphInput {
  return {
    rules: [],
    isRulesStale: false,
    requirementReviewCandidates: {},
    models: {},
    generatedDiagrams: [],
    staleDiagrams: [],
    diagramErrors: {},
    selectedDiagrams: [],
    designModels: {},
    generatedDesignDiagrams: [],
    designDiagramErrors: {},
    selectedDesignDiagrams: [],
    staleDesignDiagrams: [],
    staleDesignModelIds: [],
    designStaleReasons: {},
    designTraceabilityStale: false,
    designGenerationBlockedReason: null,
    codeFiles: {},
    codeEntryFile: null,
    codeSpec: null,
    codeDiagnostics: [],
    generationTasks: [],
    historyItems: [],
    ...overrides,
  };
}

describe("buildLineageGraph", () => {
  it("creates an empty-state graph with rule and product placeholders", () => {
    const graph = buildLineageGraph(input());

    expect(graph.nodes.find((node) => node.id === "rule:empty")?.status).toBe(
      "not-generated",
    );
    expect(graph.nodes.find((node) => node.id === "code:prototype")?.status).toBe(
      "not-generated",
    );
    expect(
      graph.nodes.find((node) => node.id === "document:requirementsSpec")?.status,
    ).toBe("not-generated");
    expect(graph.edges.some((edge) => edge.source === "rule:empty")).toBe(true);
  });

  it("groups nodes into fixed left-to-right columns with stable node order", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: {
          usecase: model("usecase"),
          class: model("class"),
        },
        generatedDiagrams: ["class", "usecase"],
        designModels: {
          class: designModel("class"),
          sequence: designModel("sequence"),
        },
        generatedDesignDiagrams: ["class", "sequence"],
        codeFiles: { "src/App.tsx": "export default function App() { return null; }" },
      }),
    );

    const columns = groupLineageColumns(graph);

    expect(columns.map((column) => column.label)).toEqual([
      "需求规则",
      "需求模型",
      "设计模型",
      "产物",
    ]);
    expect(columns[0].nodes.map((node) => node.id)).toEqual(["rule:REQ-001"]);
    expect(columns[1].nodes.map((node) => node.id)).toEqual([
      "requirement-model:usecase",
      "requirement-model:class",
    ]);
    expect(columns[2].nodes.map((node) => node.id)).toEqual([
      "design-model:sequence",
      "design-model:class",
    ]);
    expect(columns[3].nodes.map((node) => node.id)).toEqual([
      "document:requirementsSpec",
      "document:softwareDesignSpec",
      "code:prototype",
    ]);
  });

  it("marks a completed core chain as current", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: {
          usecase: model("usecase"),
          class: model("class"),
        },
        generatedDiagrams: ["usecase", "class"],
        designModels: {
          sequence: designModel("sequence"),
          class: designModel("class"),
        },
        generatedDesignDiagrams: ["sequence", "class"],
        codeFiles: { "src/App.tsx": "export default function App() { return null; }" },
        codeEntryFile: "src/App.tsx",
      }),
    );

    expect(graph.nodes.find((node) => node.id === "rule:REQ-001")?.status).toBe(
      "current",
    );
    expect(
      graph.nodes.find((node) => node.id === "requirement-model:usecase")?.status,
    ).toBe("current");
    expect(
      graph.nodes.find((node) => node.id === "design-model:sequence")?.status,
    ).toBe("current");
    expect(graph.nodes.find((node) => node.id === "code:prototype")?.status).toBe(
      "current",
    );
  });

  it("keeps fresh design nodes current when only sibling design models are stale", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: {
          usecase: model("usecase"),
          class: model("class"),
        },
        generatedDiagrams: ["usecase", "class"],
        designModels: {
          class: designModel("class"),
          sequence: designModel("sequence"),
        },
        generatedDesignDiagrams: ["sequence", "class"],
        designTraceabilityStale: true,
        staleDesignDiagrams: ["sequence"],
        staleDesignModelIds: ["sequence"],
        designStaleReasons: {
          sequence: "上游需求模型或追踪指纹已变化，此设计模型需更新。",
        },
      }),
    );

    expect(
      graph.nodes.find((node) => node.id === "design-model:class")?.status,
    ).toBe("current");
    const sequenceNode = graph.nodes.find(
      (node) => node.id === "design-model:sequence",
    );
    expect(sequenceNode?.status).toBe("stale");
    expect(sequenceNode?.reason).toContain("上游需求模型或追踪指纹已变化");
  });

  it("marks stale downstream requirement nodes with stale-cause edges", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        isRulesStale: true,
        models: { class: model("class") },
        generatedDiagrams: ["class"],
        staleDiagrams: ["class"],
      }),
    );

    const staleNode = graph.nodes.find(
      (node) => node.id === "requirement-model:class",
    );
    expect(staleNode?.status).toBe("stale");
    expect(staleNode?.reason).toContain("需求规则已修改");
    expect(
      graph.edges.find(
        (edge) =>
          edge.source === "rule:REQ-001" &&
          edge.target === "requirement-model:class",
      )?.status,
    ).toBe("stale");
  });

  it("keeps failures local and marks blocked edges as errors", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        diagramErrors: {
          class: diagramError("Conflict in primary key definition."),
        },
      }),
    );

    expect(
      graph.nodes.find((node) => node.id === "requirement-model:class")?.status,
    ).toBe("error");
    expect(
      graph.nodes.find((node) => node.id === "requirement-model:usecase")?.status,
    ).not.toBe("error");
    expect(
      graph.edges.find(
        (edge) =>
          edge.source === "rule:REQ-001" &&
          edge.target === "requirement-model:class",
      )?.status,
    ).toBe("error");
  });

  it("shows running scoped generation tasks on the matching node", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        generationTasks: [
          task({
            subtasks: [
              {
                id: "generate_models:usecase",
                label: "用例模型",
                status: "running",
                message: null,
                errorMessage: null,
              },
            ],
          }),
        ],
      }),
    );

    expect(
      graph.nodes.find((node) => node.id === "requirement-model:usecase")?.status,
    ).toBe("running");
  });

  it("collects only directed upstream and downstream impact paths", () => {
    const graph = buildLineageGraph(
      input({
        rules: [baseRule],
        models: {
          usecase: model("usecase"),
          class: model("class"),
        },
        generatedDiagrams: ["usecase", "class"],
        designModels: {
          class: designModel("class"),
          sequence: designModel("sequence"),
        },
        generatedDesignDiagrams: ["sequence", "class"],
      }),
    );

    const path = collectLineagePath(graph, "requirement-model:class");

    expect(path.has("rule:REQ-001")).toBe(true);
    expect(path.has("design-model:class")).toBe(true);
    expect(path.has("document:requirementsSpec")).toBe(true);
    expect(path.has("requirement-model:usecase")).toBe(false);
  });
});
