import { describe, expect, it } from "vitest";
import type { EvidencePackage, RunSnapshot } from "@uml-platform/contracts";
import type { RunHistoryItem } from "../../../entities/run-history";
import {
  evidencePackageBlockReason,
  findBlockingEvidencePackage,
  latestEvidencePackageForScopes,
} from "./evidence-gate";

function evidencePackage(
  overrides: Partial<EvidencePackage> = {},
): EvidencePackage {
  return {
    runId: "requirements-run-evidence",
    generatedAt: "2026-06-21T00:00:00.000Z",
    status: "blocked",
    requirementBaseline: null,
    qualityReport: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    modelArtifacts: [],
    codeArtifacts: [],
    businessAssertionResults: null,
    browserEvidence: [],
    reviewItems: [
      {
        id: "review-coverage",
        source: "coverage",
        status: "pending",
        severity: "warning",
        reason: "覆盖项需要人工确认。",
      },
    ],
    reviewDecisions: [],
    failureRecords: [],
    repairRecords: [],
    ...overrides,
  };
}

function requirementsSnapshot(packageValue: EvidencePackage | null): RunSnapshot {
  return {
    runId: "requirements-run-evidence",
    requirementText: "订单系统需求",
    selectedDiagrams: ["class"],
    analysisTargetUseCaseIds: [],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    evidencePackage: packageValue,
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
  };
}

function historyItem(
  packageValue: EvidencePackage | null,
  overrides: Partial<RunHistoryItem> = {},
): RunHistoryItem {
  return {
    id: "requirements-run-evidence",
    createdAt: "2026-06-21T00:00:00.000Z",
    title: "需求模型生成",
    snapshot: requirementsSnapshot(packageValue),
    providerModel: "mock",
    runKind: "requirements",
    status: "completed",
    ...overrides,
  };
}

describe("evidence gate", () => {
  it("finds unresolved upstream evidence in run history", () => {
    const blocked = evidencePackage();
    const result = findBlockingEvidencePackage(
      [historyItem(blocked)],
      ["requirements"],
    );

    expect(result?.evidencePackage.runId).toBe("requirements-run-evidence");
    expect(result?.reason).toContain("证据包1 项待复核");
  });

  it("does not block after all evidence review items are resolved", () => {
    const complete = evidencePackage({
      status: "complete",
      reviewItems: [
        {
          id: "review-coverage",
          source: "coverage",
          status: "resolved",
          severity: "warning",
          reason: "覆盖项需要人工确认。",
        },
      ],
    });

    expect(evidencePackageBlockReason(complete)).toBeNull();
    expect(findBlockingEvidencePackage([historyItem(complete)], ["requirements"])).toBeNull();
    expect(latestEvidencePackageForScopes([historyItem(complete)], ["requirements"])).toBe(
      complete,
    );
  });
});
