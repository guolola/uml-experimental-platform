// Verifies EvidencePackage assembly and review gating from run snapshots.
import assert from "node:assert/strict";
import test from "node:test";
import { runSnapshotSchema, type EvidenceReviewDecision } from "@uml-platform/contracts";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import {
  assertEvidencePackageAllowsDownstream,
  buildEvidencePackage,
} from "./evidence-package.js";

const generatedAt = "2026-05-24T00:00:00.000Z";

test("buildEvidencePackage blocks unresolved not-modelable coverage review items", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-evidence-blocked",
    requirementText: "系统响应时间不超过2秒。",
    rules: [
      {
        id: "r1",
        category: "非功能需求",
        text: "系统响应时间不超过2秒。",
        relatedDiagrams: ["deployment"],
      },
    ],
    createdAt: generatedAt,
  });
  const snapshot = runSnapshotSchema.parse({
    runId: "run-evidence-blocked",
    requirementText: "系统响应时间不超过2秒。",
    selectedDiagrams: ["deployment"],
    rules: [],
    requirementBaseline: baseline,
    coverageMatrix: {
      runId: "run-evidence-blocked",
      rows: [
        {
          requirementId: "REQ-001",
          status: "not-modelable",
          rationale: "Requirement needs alternative evidence.",
          modelElements: [],
          designElements: [],
          codeArtifacts: [],
          tests: [],
          reviewItems: ["alternative-evidence:REQ-001"],
        },
      ],
    },
    traceabilityMatrix: { runId: "run-evidence-blocked", links: [], diagnostics: [] },
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "render_svg",
    status: "completed",
    errorMessage: null,
  });

  const evidence = buildEvidencePackage({ snapshot, generatedAt });

  assert.equal(evidence.status, "blocked");
  assert.equal(evidence.reviewItems.length, 1);
  assert.equal(evidence.reviewItems[0]?.source, "coverage");
  assert.equal(evidence.reviewItems[0]?.status, "pending");
  assert.throws(
    () => assertEvidencePackageAllowsDownstream(evidence),
    /EvidencePackage review gate failed/,
  );
});

test("buildEvidencePackage resolves review items with durable human decisions", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-evidence-reviewed",
    requirementText: "系统响应时间不超过2秒。",
    rules: [
      {
        id: "r1",
        category: "非功能需求",
        text: "系统响应时间不超过2秒。",
        relatedDiagrams: ["deployment"],
      },
    ],
    createdAt: generatedAt,
  });
  const snapshot = runSnapshotSchema.parse({
    runId: "run-evidence-reviewed",
    requirementText: "系统响应时间不超过2秒。",
    selectedDiagrams: ["deployment"],
    rules: [],
    requirementBaseline: baseline,
    coverageMatrix: {
      runId: "run-evidence-reviewed",
      rows: [
        {
          requirementId: "REQ-001",
          status: "not-modelable",
          rationale: "Requirement needs alternative evidence.",
          modelElements: [],
          designElements: [],
          codeArtifacts: [],
          tests: [],
          reviewItems: ["alternative-evidence:REQ-001"],
        },
      ],
    },
    traceabilityMatrix: { runId: "run-evidence-reviewed", links: [], diagnostics: [] },
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "render_svg",
    status: "completed",
    errorMessage: null,
  });
  const initialEvidence = buildEvidencePackage({ snapshot, generatedAt });
  const decisions: EvidenceReviewDecision[] = [
    {
      id: "DEC-001",
      reviewItemId: initialEvidence.reviewItems[0]!.id,
      decision: "accepted-risk",
      reviewerId: "reviewer-1",
      comment: "用压测报告作为替代证据。",
      decidedAt: generatedAt,
    },
  ];

  const reviewedEvidence = buildEvidencePackage({
    snapshot,
    generatedAt,
    reviewDecisions: decisions,
  });

  assert.equal(reviewedEvidence.status, "complete");
  assert.equal(reviewedEvidence.reviewItems[0]?.status, "resolved");
  assert.deepEqual(reviewedEvidence.reviewDecisions, decisions);
  assert.doesNotThrow(() => assertEvidencePackageAllowsDownstream(reviewedEvidence));
});

test("assertEvidencePackageAllowsDownstream blocks failed browser evidence", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-browser-evidence",
    requirementText: "审批人必须能拒绝重复审批。",
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "审批人必须能拒绝重复审批。",
        relatedDiagrams: ["activity"],
      },
    ],
    createdAt: generatedAt,
  });
  const snapshot = runSnapshotSchema.parse({
    runId: "run-browser-evidence",
    requirementText: "审批人必须能拒绝重复审批。",
    selectedDiagrams: ["activity"],
    rules: [],
    requirementBaseline: baseline,
    coverageMatrix: {
      runId: "run-browser-evidence",
      rows: [
        {
          requirementId: "REQ-001",
          status: "covered",
          rationale: "Browser workflow must verify idempotency.",
          modelElements: ["activity:approve"],
          designElements: [],
          codeArtifacts: ["src/workflow.ts"],
          tests: ["browser:idempotency"],
          reviewItems: [],
        },
      ],
    },
    traceabilityMatrix: { runId: "run-browser-evidence", links: [], diagnostics: [] },
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "render_svg",
    status: "completed",
    errorMessage: null,
  });
  const evidence = {
    ...buildEvidencePackage({ snapshot, generatedAt }),
    browserEvidence: [
      {
        id: "BR-001",
        kind: "assertion" as const,
        label: "重复审批幂等性",
        artifactId: "REQ-001",
        status: "failed" as const,
        capturedAt: generatedAt,
      },
    ],
  };

  assert.throws(
    () => assertEvidencePackageAllowsDownstream(evidence),
    /browser evidence/,
  );
});
