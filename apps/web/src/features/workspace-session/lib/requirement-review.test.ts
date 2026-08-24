// Verifies requirement review cannot clear semantic-loss gates merely by marking a rule accepted.
import { describe, expect, it } from "vitest";
import type {
  AtomicRequirement,
  RequirementBaseline,
} from "@uml-platform/contracts";
import {
  markRequirementReviewed,
  mergeReviewedRequirement,
  rebuildRequirementReviewQualityReport,
} from "./requirement-review";

function notificationRequirement(): AtomicRequirement {
  return {
    id: "REQ-007",
    sourceFragment:
      "预约成功、取消和开始前1小时通过站内消息通知；通知失败则重试，并记录最终状态。",
    type: "functional",
    actor: "系统",
    subject: null,
    action: "发送站内消息通知；通知失败则重试并记录最终状态",
    object: "站内消息通知",
    condition: "通知失败",
    outcome: "系统记录最终状态",
    confidence: 0.69,
    status: "pending-review",
    criticality: "critical",
    acceptanceCriteria: [
      "预约成功、取消和开始前1小时通过站内消息通知；通知失败则重试，并记录最终状态。",
    ],
    fieldProvenance: {},
    sourceRuleId: "r7",
  };
}

function baseline(): RequirementBaseline {
  const requirement = notificationRequirement();
  return {
    runId: "run-semantic-review",
    sourceDocumentId: "inline-requirement",
    requirements: [requirement],
    assumptions: [],
    conflicts: [],
    qualityReport: {
      runId: "run-semantic-review",
      status: "blocked",
      summary: "智能修复删除了原始语义。",
      issues: [
        {
          id: "SEM-REQ-007-LOSS",
          requirementId: requirement.id,
          severity: "critical",
          code: "semantic-loss",
          message: "智能修复删除了原始语义：预约成功、取消、开始前1小时。",
          blocksDownstream: true,
        },
      ],
      blockingIssueIds: ["SEM-REQ-007-LOSS"],
      reviewRequiredRequirementIds: [requirement.id],
    },
    createdAt: "2026-07-30T00:00:00.000Z",
  };
}

describe("requirement semantic review gates", () => {
  it("keeps semantic-loss issues blocking after a generic accept operation", () => {
    const source = baseline();
    const reviewed = markRequirementReviewed(source.requirements[0]!);
    const merged = mergeReviewedRequirement(source, reviewed);

    expect(merged.qualityReport.status).toBe("blocked");
    expect(merged.qualityReport.blockingIssueIds).toEqual([
      "SEM-REQ-007-LOSS",
    ]);
    expect(
      rebuildRequirementReviewQualityReport(merged).issues[0]?.code,
    ).toBe("semantic-loss");
  });
});
