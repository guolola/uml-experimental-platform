// Verifies workspace snapshot merge rules that are shared by repository implementations.
import { describe, expect, it } from "vitest";
import type {
  AtomicRequirement,
  DiagramModelSpec,
  RequirementBaseline,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../entities/workspace/model";
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
});
