// Verifies workspace stale derivation keeps design freshness scoped to individual models.
import { describe, expect, it } from "vitest";
import type {
  DesignDiagramModelSpec,
  DiagramModelSpec,
  RequirementModelTraceabilityEntry,
} from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import { createEmptyDiagnostics } from "./diagnostics";
import { createEmptyRunUiState } from "./run-ui-state";
import { deriveWorkspaceStatus } from "./workspace-derived-status";
import {
  designInputFingerprintFor,
  requirementInputFingerprintFor,
} from "./workspace-context";

const rule: RequirementRule = {
  id: "r1",
  category: "业务规则",
  text: "系统需要管理订单。",
  relatedDiagrams: ["class"],
};

const requirementClassModel = {
  diagramKind: "class",
  modelId: "class",
  title: "领域概念模型",
  summary: "订单领域模型。",
  notes: [],
  classes: [{ id: "order", name: "Order", attributes: [], operations: [] }],
  interfaces: [],
  enums: [],
  relationships: [],
} as unknown as DiagramModelSpec;

const requirementTrace: RequirementModelTraceabilityEntry[] = [
  {
    ruleId: "r1",
    target: {
      diagramKind: "class",
      elementId: "order",
      elementKind: "class",
      label: "Order",
      modelId: "class",
    },
  },
];

const designClassModel = {
  diagramKind: "class",
  modelId: "design-class",
  title: "设计类图",
  summary: "设计类。",
  notes: [],
  classes: [{ id: "order-service", name: "OrderService", attributes: [], operations: [] }],
  interfaces: [],
  enums: [],
  relationships: [],
} as unknown as DesignDiagramModelSpec;

const designTableModel = {
  diagramKind: "table",
  modelId: "design-table",
  title: "数据库设计",
  summary: "订单表。",
  notes: [],
  tables: [
    {
      id: "tbl-order",
      name: "orders",
      columns: [{ id: "col-order-id", name: "id", type: "uuid", nullable: false }],
    },
  ],
  relationships: [],
} as unknown as DesignDiagramModelSpec;

describe("deriveWorkspaceStatus", () => {
  it("keeps fresh design models current while marking only incomplete design traces stale", () => {
    const requirementFingerprint = requirementInputFingerprintFor("订单需求", [rule]);
    const designFingerprint = designInputFingerprintFor(
      [requirementClassModel],
      requirementTrace,
    );

    const status = deriveWorkspaceStatus({
      currentRunDiagnostics: createEmptyDiagnostics(),
      designInputFingerprints: {
        "design-class": designFingerprint,
        "design-table": designFingerprint,
      },
      designModelTraceability: [
        {
          source: {
            diagramKind: "class",
            elementId: "order-service",
            elementKind: "class",
            label: "OrderService",
            modelId: "design-class",
          },
          targets: [requirementTrace[0]!.target],
          rationale: "设计类承接订单领域概念。",
          confidence: "high",
        },
      ],
      designModels: {
        "design-class": designClassModel,
        "design-table": designTableModel,
      },
      diagramInputFingerprints: { class: requirementFingerprint },
      diagramVersions: { class: 1 },
      generatedDesignDiagrams: ["class", "table"],
      generatedDiagrams: ["class"],
      manualModelEditStatus: {},
      models: { class: requirementClassModel },
      requirementBaseline: null,
      requirementInputFingerprint: requirementFingerprint,
      requirementModelTraceability: requirementTrace,
      requirementReviewCandidates: {},
      requirementText: "订单需求",
      rules: [rule],
      rulesBasedOnTextVersion: 1,
      rulesVersion: 1,
      runUiState: createEmptyRunUiState(),
      textVersion: 1,
      visibleGenerationTask: null,
    });

    expect(status.designTraceabilityStale).toBe(true);
    expect(status.staleDesignModelIds).toEqual(["design-table"]);
    expect(status.staleDesignDiagrams).toEqual(["table"]);
    expect(status.designStaleReasons["design-table"]).toContain("追踪覆盖不完整");
    expect(status.designStaleReasons["design-class"]).toBeUndefined();
  });
});
