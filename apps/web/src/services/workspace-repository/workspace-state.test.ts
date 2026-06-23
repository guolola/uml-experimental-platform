// Verifies workspace snapshot merge rules that are shared by repository implementations.
import { describe, expect, it } from "vitest";
import type {
  AtomicRequirement,
  CodeRunSnapshot,
  DesignDiagramModelSpec,
  DesignRunSnapshot,
  DiagramModelSpec,
  RequirementBaseline,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../entities/workspace/model";
import { snapshotInputFingerprint } from "../../shared/lib/fingerprint";
import {
  applySnapshotToWorkspace,
  createEmptyWorkspace,
} from "./workspace-state";

function createRule(id: string, text = `${id} 需求规则。`): RequirementRule {
  return {
    id,
    category: "业务规则",
    text,
    relatedDiagrams: ["usecase"],
  };
}

function createAtomicRequirement(
  overrides: Partial<AtomicRequirement> = {},
): AtomicRequirement {
  return {
    id: "REQ-001",
    sourceRuleId: "r1",
    sourceFragment: "用户通过邮箱注册账号。",
    sourceLocation: { section: "input", startOffset: 0, endOffset: 10 },
    type: "functional",
    actor: "用户",
    subject: "用户",
    action: "注册",
    object: "账号",
    condition: null,
    outcome: "系统创建账号",
    confidence: 0.86,
    status: "accepted",
    criticality: "high",
    acceptanceCriteria: ["用户提交邮箱后系统创建账号。"],
    priority: "must",
    fieldProvenance: {},
    ...overrides,
  };
}

function createBaseline(
  requirements: AtomicRequirement[],
  overrides: Partial<RequirementBaseline> = {},
): RequirementBaseline {
  return {
    runId: "run-baseline",
    sourceDocumentId: "inline-requirement",
    createdAt: "2026-06-18T00:00:00.000Z",
    assumptions: [],
    conflicts: [],
    requirements,
    qualityReport: {
      runId: "run-baseline",
      status: "passed",
      summary: "需求规则已确认。",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
    ...overrides,
  };
}

function useCaseModel(): DiagramModelSpec {
  return {
    diagramKind: "usecase",
    title: "需求用例模型",
    summary: "根据需求规则生成。",
    notes: [],
    actors: [],
    useCases: [],
    systemBoundaries: [],
    relationships: [],
  } as DiagramModelSpec;
}

function createSnapshot(
  overrides: Partial<RunSnapshot>,
): RunSnapshot {
  return {
    runId: "run-snapshot",
    requirementText: "",
    selectedDiagrams: ["usecase"],
    analysisTargetUseCaseIds: [],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    models: [useCaseModel()],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
    ...overrides,
  };
}

function createDesignSnapshot(
  overrides: Partial<DesignRunSnapshot>,
): DesignRunSnapshot {
  return {
    runId: "design-run-snapshot",
    requirementText: "图书馆管理系统",
    selectedDiagrams: ["table", "component"],
    requestedDiagrams: ["table", "component"],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    requirementModels: [],
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

function createCodeSnapshot(
  overrides: Partial<CodeRunSnapshot> = {},
): CodeRunSnapshot {
  return {
    runId: "code-run-snapshot",
    requirementText: "图书馆管理系统",
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: null,
    designModels: [],
    designPlantUml: [],
    spec: null,
    businessLogic: null,
    loadedCodeSkill: null,
    visualDirection: null,
    skillResourceDiscoveryPlan: null,
    skillResourcePreviews: null,
    skillResourcePlan: null,
    codeSkillContext: null,
    appBlueprint: null,
    uiBlueprint: null,
    uiMockup: null,
    uiReferenceSpec: null,
    uiFidelityReport: null,
    designTokens: null,
    componentRegistry: null,
    uiIr: null,
    visualDiffReport: null,
    businessAssertionResults: null,
    repairLoopSummary: null,
    selectedCodeSkills: [],
    skillDiagnostics: [],
    filePlan: null,
    codeImplementationBrief: null,
    codeFileOperationManifest: null,
    fileGenerationDiagnostics: [],
    codeTrace: [],
    codeGenerationMode: "json_schema_operations",
    qualityDiagnostics: [],
    files: { "/src/App.tsx": "export default function App() { return null; }" },
    entryFile: "/src/App.tsx",
    dependencies: {},
    agentPlan: [],
    generationMode: "continue",
    changedFileCount: 1,
    diagnostics: [],
    codeContextHash: null,
    currentStage: "verify_code_preview",
    status: "completed",
    error: null,
    ...overrides,
  };
}

function tableDesignModel(): DesignDiagramModelSpec {
  return {
    diagramKind: "table",
    title: "数据库设计",
    summary: "用户表。",
    notes: [],
    tables: [
      {
        id: "users",
        name: "users",
        columns: [
          {
            id: "id",
            name: "id",
            dataType: "VARCHAR",
            constraints: [],
            isPrimaryKey: true,
            isForeignKey: false,
            nullable: false,
          },
        ],
      },
    ],
    relationships: [],
  };
}

function createPendingCandidate(
  requirement: AtomicRequirement,
): WorkspaceRecord["requirementReviewCandidates"][string] {
  return {
    ruleId: requirement.sourceRuleId ?? "r1",
    beforeRequirement: requirement,
    afterRequirement: {
      ...requirement,
      status: "accepted",
    },
    repairRationale: "补齐缺失字段。",
    blockingReasons: [],
    status: "pending",
    errorMessage: null,
    createdAt: "2026-06-18T00:00:00.000Z",
  };
}

describe("applySnapshotToWorkspace", () => {
  it("keeps requirement run targets out of workspace draft selection", () => {
    const workspace: WorkspaceRecord = {
      ...createEmptyWorkspace(),
      selectedDiagramTypes: ["class" as const],
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createSnapshot({
        selectedDiagrams: ["usecase"],
        models: [useCaseModel()],
        plantUml: [{ diagramKind: "usecase", source: "@startuml\n@enduml" }],
      }),
    );

    expect(merged.selectedDiagramTypes).toEqual([]);
    expect(merged.generatedDiagramTypes).toEqual(["usecase"]);
  });

  it("stores snapshot input fingerprints for requirement diagrams restored after current input changed", () => {
    const rulesV1 = [createRule("r1", "用户可以查看座位。")];
    const rulesV2 = [createRule("r1", "用户可以查看并筛选座位。")];
    const snapshotFingerprint = snapshotInputFingerprint({
      requirementText: "座位预约系统 v1",
      rules: rulesV1,
    });
    const workspaceFingerprint = snapshotInputFingerprint({
      requirementText: "座位预约系统 v2",
      rules: rulesV2,
    });

    const merged = applySnapshotToWorkspace(
      {
        ...createEmptyWorkspace(),
        requirementText: "座位预约系统 v2",
        rules: rulesV2,
        requirementInputFingerprint: workspaceFingerprint,
        rulesVersion: 2,
      },
      createSnapshot({
        runId: "run-v1-usecase",
        requirementText: "座位预约系统 v1",
        rules: rulesV1,
        selectedDiagrams: ["usecase"],
        models: [useCaseModel()],
        plantUml: [{ diagramKind: "usecase", source: "@startuml\n@enduml" }],
      }),
    );

    expect(merged.requirementText).toBe("座位预约系统 v2");
    expect(merged.rules).toEqual(rulesV2);
    expect(merged.requirementInputFingerprint).toBe(workspaceFingerprint);
    expect(merged.diagramInputFingerprints.usecase).toBe(snapshotFingerprint);
    expect(merged.generatedDiagramTypes).toEqual(["usecase"]);
  });

  it("keeps design run targets out of workspace draft selection", () => {
    const workspace: WorkspaceRecord = {
      ...createEmptyWorkspace(),
      selectedDiagramTypes: ["class" as const],
      selectedDesignDiagramTypes: ["table" as const],
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createDesignSnapshot({
        selectedDiagrams: ["table", "component"],
        requestedDiagrams: ["component"],
        models: [tableDesignModel()],
        plantUml: [
          { diagramKind: "table", modelId: "table", source: "@startuml\n@enduml" },
        ],
      }),
    );

    expect(merged.selectedDiagramTypes).toEqual([]);
    expect(merged.selectedDesignDiagramTypes).toEqual([]);
    expect(merged.generatedDesignDiagramTypes).toEqual(["table"]);
  });

  it("does not rewrite requirement model fingerprints from design snapshots without requirement input", () => {
    const requirementText = "用户可以查看座位。";
    const rules = [createRule("r1", "用户可以查看座位。")];
    const currentFingerprint = snapshotInputFingerprint({
      requirementText,
      rules,
    });
    const existingUseCaseModel = useCaseModel();
    const merged = applySnapshotToWorkspace(
      {
        ...createEmptyWorkspace(),
        requirementText,
        rules,
        requirementInputFingerprint: currentFingerprint,
        rulesVersion: 3,
        rulesBasedOnTextVersion: 1,
        models: { usecase: existingUseCaseModel },
        generatedDiagramTypes: ["usecase"],
        diagramInputFingerprints: { usecase: currentFingerprint },
        diagramVersions: { usecase: 3 },
      },
      createDesignSnapshot({
        requirementText: "",
        rules: [],
        requirementModels: [
          {
            ...useCaseModel(),
            title: "空输入设计快照中的旧用例模型",
          },
        ],
        models: [tableDesignModel()],
        plantUml: [
          { diagramKind: "table", modelId: "table", source: "@startuml\n@enduml" },
        ],
      }),
    );

    expect(merged.requirementInputFingerprint).toBe(currentFingerprint);
    expect(merged.rulesVersion).toBe(3);
    expect(merged.rulesBasedOnTextVersion).toBe(1);
    expect(merged.diagramInputFingerprints.usecase).toBe(currentFingerprint);
    expect(merged.diagramVersions.usecase).toBe(3);
    expect(merged.models.usecase).toEqual(existingUseCaseModel);
    expect(merged.generatedDiagramTypes).toEqual(["usecase"]);
    expect(merged.generatedDesignDiagramTypes).toEqual(["table"]);
  });

  it("preserves existing code files when a regenerate code snapshot fails", () => {
    const workspace = {
      ...createEmptyWorkspace(),
      codeFiles: {
        "/src/App.tsx": "export default function App() { return <main>old</main>; }",
      },
      codeEntryFile: "/src/App.tsx",
      codeDependencies: { react: "latest" },
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createCodeSnapshot({
        files: {},
        entryFile: null,
        dependencies: {},
        generationMode: "regenerate",
        changedFileCount: 0,
        status: "failed",
        currentStage: "write_code_files",
        error: {
          code: "RUN_INTERNAL_ERROR",
          message: "代码重新生成失败",
          category: "generation",
          retryable: true,
        },
      }),
    );

    expect(merged.codeFiles).toEqual(workspace.codeFiles);
    expect(merged.codeEntryFile).toBe("/src/App.tsx");
    expect(merged.codeDependencies).toEqual({ react: "latest" });
  });

  it("clears stale rendered design artifacts when restoring code snapshots", () => {
    const tableModel = tableDesignModel();
    const workspace = {
      ...createEmptyWorkspace(),
      designModels: {
        "class:old": {
          diagramKind: "class",
          modelId: "class:old",
          title: "旧设计类图",
          summary: "旧上下文。",
          notes: [],
          classes: [],
          interfaces: [],
          enums: [],
          relationships: [],
        } as DesignDiagramModelSpec,
      },
      designModelTraceability: [
        {
          requirementModelId: "old-requirement",
          designModelId: "class:old",
          rationale: "旧追踪。",
        },
      ],
      designSvgArtifacts: {
        "class:old": {
          diagramKind: "class" as const,
          modelId: "class:old",
          svg: "<svg data-old=\"true\" />",
          renderMeta: {
            engine: "plantuml",
            generatedAt: "2026-06-18T00:00:00.000Z",
            sourceLength: 18,
            durationMs: 1,
          },
        },
      },
      generatedDesignDiagramTypes: ["class" as const],
      designInputFingerprints: { "class:old": "old-design-fingerprint" },
      designDiagramErrors: {
        "class:old": {
          stage: "render_svg" as const,
          error: {
            code: "RUN_RENDER_FAILED" as const,
            message: "旧设计图渲染失败",
            category: "render" as const,
            retryable: true,
          },
        },
      },
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createCodeSnapshot({
        designModels: [tableModel],
        designPlantUml: [
          {
            diagramKind: "table",
            modelId: "table",
            source: "@startuml\nclass users\n@enduml",
          },
        ],
      }),
    );

    expect(Object.keys(merged.designModels)).toEqual(["table"]);
    expect(merged.designPlantUml).toEqual({
      table: "@startuml\nclass users\n@enduml",
    });
    expect(merged.designModelTraceability).toEqual([]);
    expect(merged.designSvgArtifacts).toEqual({});
    expect(merged.designDiagramErrors).toEqual({});
    expect(merged.generatedDesignDiagramTypes).toEqual(["table"]);
    expect(merged.designInputFingerprints).toEqual({});
  });

  it("preserves existing code files when a regenerate code snapshot is cancelled before files are written", () => {
    const workspace = {
      ...createEmptyWorkspace(),
      codeFiles: {
        "/src/main.tsx": "import App from './App';",
        "/src/App.tsx": "export default function App() { return <main>old</main>; }",
      },
      codeEntryFile: "/src/main.tsx",
      codeDependencies: { react: "latest", vite: "latest" },
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createCodeSnapshot({
        files: {},
        entryFile: null,
        dependencies: {},
        generationMode: "regenerate",
        changedFileCount: 0,
        status: "cancelled",
        currentStage: "write_code_files",
        error: null,
      }),
    );

    expect(merged.codeFiles).toEqual(workspace.codeFiles);
    expect(merged.codeEntryFile).toBe("/src/main.tsx");
    expect(merged.codeDependencies).toEqual({ react: "latest", vite: "latest" });
    expect(merged.codeDiagnostics).toEqual([]);
  });

  it("applies requirement baseline from model snapshots when requirement input matches", () => {
    const requirementText = "用户通过邮箱注册账号，联系方式在认领通过前隐藏。";
    const rules = [
      createRule("r1", "用户通过邮箱注册账号。"),
      createRule("r6", "联系方式在认领通过前隐藏。"),
    ];
    const pendingRequirement = createAtomicRequirement({
      id: "REQ-006",
      sourceRuleId: "r6",
      sourceFragment: "联系方式在认领通过前隐藏。",
      actor: null,
      status: "pending-review",
    });
    const pendingBaseline = createBaseline([pendingRequirement], {
      runId: "run-pending-baseline",
      qualityReport: {
        runId: "run-pending-baseline",
        status: "pending-review",
        summary: "发现 1 个需求质量提示。",
        issues: [
          {
            id: "ISS-006",
            code: "missing-actor",
            message: "REQ-006 缺少明确角色/执行者。",
            severity: "warning",
            requirementId: "REQ-006",
            blocksDownstream: false,
          },
        ],
        blockingIssueIds: [],
        reviewRequiredRequirementIds: ["REQ-006"],
      },
    });
    const workspace = {
      ...createEmptyWorkspace(),
      requirementText,
      rules,
      requirementBaseline: createBaseline([
        createAtomicRequirement({
          id: "REQ-006",
          sourceRuleId: "r6",
          status: "accepted",
        }),
      ]),
      requirementQualityReport: createBaseline([]).qualityReport,
      requirementReviewCandidates: {
        r6: createPendingCandidate(pendingRequirement),
      },
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createSnapshot({
        runId: "run-pending-baseline",
        requirementText,
        rules,
        requirementBaseline: pendingBaseline,
      }),
    );

    expect(merged.requirementBaseline?.qualityReport.status).toBe(
      "pending-review",
    );
    expect(
      merged.requirementBaseline?.qualityReport.reviewRequiredRequirementIds,
    ).toEqual(["REQ-006"]);
    expect(merged.requirementReviewCandidates.r6?.status).toBe("pending");
  });

  it("keeps accepted review candidates over older pending snapshot baselines", () => {
    const requirementText = "用户通过邮箱注册账号，联系方式在认领通过前隐藏。";
    const rules = [
      createRule("r1", "用户通过邮箱注册账号。"),
      createRule("r6", "联系方式在认领通过前隐藏。"),
    ];
    const pendingRequirement = createAtomicRequirement({
      id: "REQ-006",
      sourceRuleId: "r6",
      sourceFragment: "联系方式在认领通过前隐藏。",
      actor: null,
      status: "pending-review",
    });
    const acceptedRequirement = createAtomicRequirement({
      id: "REQ-006",
      sourceRuleId: "r6",
      sourceFragment: "联系方式在认领通过前隐藏。",
      actor: "认领用户",
      status: "accepted",
    });
    const pendingBaseline = createBaseline([pendingRequirement], {
      runId: "run-pending-baseline",
      qualityReport: {
        runId: "run-pending-baseline",
        status: "pending-review",
        summary: "发现 1 个需求质量提示。",
        issues: [
          {
            id: "ISS-006",
            code: "missing-actor",
            message: "REQ-006 缺少明确角色/执行者。",
            severity: "warning",
            requirementId: "REQ-006",
            blocksDownstream: false,
          },
        ],
        blockingIssueIds: [],
        reviewRequiredRequirementIds: ["REQ-006"],
      },
    });

    const merged = applySnapshotToWorkspace(
      {
        ...createEmptyWorkspace(),
        requirementText,
        rules,
        requirementReviewCandidates: {
          r6: {
            ...createPendingCandidate(pendingRequirement),
            afterRequirement: acceptedRequirement,
            status: "accepted",
          },
        },
      },
      createSnapshot({
        runId: "run-pending-baseline",
        requirementText,
        rules,
        requirementBaseline: pendingBaseline,
      }),
    );

    expect(merged.requirementBaseline?.requirements[0]?.status).toBe("accepted");
    expect(merged.requirementBaseline?.requirements[0]?.actor).toBe("认领用户");
    expect(merged.requirementBaseline?.qualityReport.status).toBe("passed");
    expect(merged.requirementBaseline?.qualityReport.issues).toEqual([]);
    expect(
      merged.requirementBaseline?.qualityReport.reviewRequiredRequirementIds,
    ).toEqual([]);
    expect(merged.requirementReviewCandidates.r6?.status).toBe("accepted");
  });

  it("drops stale pending candidates when the new baseline has passed", () => {
    const requirementText = "用户通过邮箱注册账号。";
    const rules = [createRule("r1", "用户通过邮箱注册账号。")];
    const requirement = createAtomicRequirement({
      id: "REQ-001",
      sourceRuleId: "r1",
      status: "accepted",
    });
    const passedBaseline = createBaseline([requirement]);
    const workspace = {
      ...createEmptyWorkspace(),
      requirementText,
      rules,
      requirementBaseline: createBaseline([
        {
          ...requirement,
          status: "pending-review",
        },
      ]),
      requirementQualityReport: createBaseline([]).qualityReport,
      requirementReviewCandidates: {
        r1: createPendingCandidate(requirement),
      },
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createSnapshot({
        requirementText,
        rules,
        requirementBaseline: passedBaseline,
      }),
    );

    expect(merged.requirementBaseline?.qualityReport.status).toBe("passed");
    expect(merged.requirementReviewCandidates.r1).toBeUndefined();
  });

  it("restores missing requirement text without replacing existing rules", () => {
    const existingRules = [createRule("existing")];
    const merged = applySnapshotToWorkspace(
      {
        ...createEmptyWorkspace(),
        requirementText: "",
        rules: existingRules,
      },
      createSnapshot({
        requirementText: "用户可以发布动态并关注其他用户。",
        rules: [createRule("snapshot")],
      }),
    );

    expect(merged.requirementText).toBe("用户可以发布动态并关注其他用户。");
    expect(merged.rules).toEqual(existingRules);
  });

  it("persists successful design artifacts from failed partial snapshots", () => {
    const tableModel = tableDesignModel();
    const workspace: WorkspaceRecord = {
      ...createEmptyWorkspace(),
      generatedDesignDiagramTypes: ["class"],
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createDesignSnapshot({
        status: "failed",
        error: {
          code: "RUN_RENDER_FAILED",
          message: "组件图渲染失败",
          category: "render",
          retryable: true,
        },
        models: [tableModel],
        plantUml: [{ diagramKind: "table", source: "@startuml\n@enduml" }],
        svgArtifacts: [
          {
            diagramKind: "table",
            svg: "<svg data-kind=\"table\" />",
            renderMeta: {
              engine: "plantuml",
              generatedAt: "2026-06-18T00:00:00.000Z",
              sourceLength: 18,
              durationMs: 1,
            },
          },
        ],
        diagramErrors: {
          component: {
            stage: "render_svg",
            error: {
              code: "RUN_RENDER_FAILED",
              message: "组件图渲染失败",
              category: "render",
              retryable: true,
            },
          },
        },
      }),
    );

    expect(merged.generatedDesignDiagramTypes.sort()).toEqual(["class", "table"]);
    expect(merged.designModels.table).toEqual(tableModel);
    expect(merged.designSvgArtifacts.table?.svg).toContain("table");
    expect(merged.designDiagramErrors.component?.error.code).toBe(
      "RUN_RENDER_FAILED",
    );
  });
});
