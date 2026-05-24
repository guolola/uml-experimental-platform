// Assembles auditable run evidence and enforces unresolved human-review gates.
import {
  evidencePackageSchema,
  type CodeRunSnapshot,
  type DesignRunSnapshot,
  type DocumentRunSnapshot,
  type EvidenceArtifactSummary,
  type EvidenceFailureRecord,
  type EvidencePackage,
  type EvidenceRepairRecord,
  type EvidenceReviewDecision,
  type EvidenceReviewItem,
  type RunSnapshot,
} from "@uml-platform/contracts";

type EvidenceSnapshot =
  | RunSnapshot
  | DesignRunSnapshot
  | CodeRunSnapshot
  | DocumentRunSnapshot;

type BuildEvidencePackageInput = {
  snapshot: EvidenceSnapshot;
  generatedAt?: string;
  reviewDecisions?: EvidenceReviewDecision[];
};

function reviewItemId(index: number) {
  return `REV-${String(index + 1).padStart(3, "0")}`;
}

function evidenceRecordId(prefix: string, index: number) {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function decisionForItem(
  itemId: string,
  reviewDecisions: EvidenceReviewDecision[],
) {
  return reviewDecisions.find((decision) => decision.reviewItemId === itemId);
}

function decisionResolvesGate(decision: EvidenceReviewDecision | undefined) {
  return Boolean(
    decision &&
      (decision.decision === "approved" || decision.decision === "accepted-risk"),
  );
}

function reviewSeverity(
  severity: "info" | "warning" | "error" | "critical" | "high" | "medium" | "low",
): EvidenceReviewItem["severity"] {
  if (severity === "critical") return "critical";
  if (severity === "high") return "error";
  if (severity === "medium") return "warning";
  if (severity === "low") return "info";
  return severity;
}

function withDecisionStatus(
  item: Omit<EvidenceReviewItem, "id" | "status">,
  index: number,
  reviewDecisions: EvidenceReviewDecision[],
): EvidenceReviewItem {
  const id = reviewItemId(index);
  const decision = decisionForItem(id, reviewDecisions);
  return {
    id,
    status: decisionResolvesGate(decision) ? "resolved" : "pending",
    ...item,
    decision,
  };
}

function buildReviewItems(
  snapshot: EvidenceSnapshot,
  reviewDecisions: EvidenceReviewDecision[],
) {
  const items: Array<Omit<EvidenceReviewItem, "id" | "status">> = [];
  const baseline = snapshot.requirementBaseline;

  for (const issue of baseline?.qualityReport.issues ?? []) {
    if (!issue.blocksDownstream && issue.code !== "low-confidence") continue;
    items.push({
      source: "requirement-quality",
      severity: issue.severity,
      requirementId: issue.requirementId,
      reason: issue.message,
    });
  }

  for (const assumption of baseline?.assumptions ?? []) {
    if (assumption.status !== "pending-review" && assumption.status !== "derived") continue;
    items.push({
      source: "assumption",
      severity: assumption.confidence < 0.7 ? "error" : "warning",
      requirementId: assumption.requirementId,
      reason: `${assumption.id} requires human decision: ${assumption.text}`,
    });
  }

  for (const conflict of baseline?.conflicts ?? []) {
    if (conflict.status === "resolved") continue;
    items.push({
      source: "conflict",
      severity: reviewSeverity(conflict.severity),
      requirementId: conflict.requirementIds[0],
      reason: conflict.description,
    });
  }

  for (const row of snapshot.coverageMatrix?.rows ?? []) {
    if (
      row.status !== "pending-review" &&
      row.status !== "conflict" &&
      row.status !== "not-modelable" &&
      row.status !== "partially-covered"
    ) {
      continue;
    }
    items.push({
      source: "coverage",
      severity: row.status === "conflict" ? "critical" : "error",
      requirementId: row.requirementId,
      reason: `${row.requirementId} coverage is ${row.status}: ${row.rationale}`,
    });
  }

  for (const diagnostic of snapshot.traceabilityMatrix?.diagnostics ?? []) {
    if (!diagnostic.blocksCompletion && diagnostic.code !== "pending-review") continue;
    items.push({
      source: "traceability",
      severity: diagnostic.severity,
      requirementId: diagnostic.requirementId,
      artifactType: diagnostic.artifactType,
      artifactId: diagnostic.artifactId,
      reason: diagnostic.message,
    });
  }

  if ("businessAssertionResults" in snapshot) {
    for (const assertion of snapshot.businessAssertionResults?.assertions ?? []) {
      if (assertion.status === "passed") continue;
      items.push({
        source: "business-assertion",
        severity: assertion.severity,
        requirementId: assertion.requirementId,
        artifactType: "test",
        artifactId: assertion.id,
        reason: assertion.message,
      });
    }
  }

  return items.map((item, index) =>
    withDecisionStatus(item, index, reviewDecisions),
  );
}

function modelArtifacts(snapshot: EvidenceSnapshot): EvidenceArtifactSummary[] {
  const artifacts: EvidenceArtifactSummary[] = [];
  const add = (
    artifactType: EvidenceArtifactSummary["artifactType"],
    artifactId: string,
    label?: string,
  ) => {
    artifacts.push({ artifactType, artifactId, label, requirementIds: [] });
  };

  if ("models" in snapshot) {
    for (const model of snapshot.models) {
      const id = "modelId" in model && model.modelId
        ? model.modelId
        : `${model.diagramKind}:${model.title}`;
      add(
        "designModelTraceability" in snapshot ? "design-model" : "requirements-model",
        id,
        model.title,
      );
    }
  }
  if ("requirementModels" in snapshot) {
    for (const model of snapshot.requirementModels) {
      add("requirements-model", `${model.diagramKind}:${model.title}`, model.title);
    }
  }
  if ("plantUml" in snapshot) {
    for (const plantUml of snapshot.plantUml) {
      add("plantuml", `${plantUml.diagramKind}:${plantUml.source.slice(0, 32)}`);
    }
  }
  if ("svgArtifacts" in snapshot) {
    for (const svg of snapshot.svgArtifacts) {
      add("svg", `${svg.diagramKind}:${svg.svg.slice(0, 32)}`);
    }
  }
  if ("documentId" in snapshot && snapshot.documentId) {
    add("document", snapshot.documentId, snapshot.fileName ?? undefined);
  }
  return artifacts;
}

function codeArtifacts(snapshot: EvidenceSnapshot): EvidenceArtifactSummary[] {
  if (!("files" in snapshot)) return [];
  return Object.keys(snapshot.files).map((path) => ({
    artifactType: "code" as const,
    artifactId: path,
    label: path,
    requirementIds: [],
  }));
}

function failureRecords(
  snapshot: EvidenceSnapshot,
  generatedAt: string,
): EvidenceFailureRecord[] {
  const records: EvidenceFailureRecord[] = [];
  if (snapshot.errorMessage) {
    records.push({
      id: evidenceRecordId("FAIL", records.length),
      stage: snapshot.currentStage ?? undefined,
      message: snapshot.errorMessage,
      createdAt: generatedAt,
    });
  }
  if ("diagramErrors" in snapshot) {
    for (const [artifactId, error] of Object.entries(snapshot.diagramErrors)) {
      records.push({
        id: evidenceRecordId("FAIL", records.length),
        stage: error.stage,
        artifactId,
        message: error.message,
        createdAt: generatedAt,
      });
    }
  }
  if ("diagnostics" in snapshot) {
    for (const diagnostic of snapshot.diagnostics) {
      records.push({
        id: evidenceRecordId("FAIL", records.length),
        stage: diagnostic.stage,
        message: diagnostic.message,
        createdAt: diagnostic.at,
      });
    }
  }
  return records;
}

function repairRecords(snapshot: EvidenceSnapshot): EvidenceRepairRecord[] {
  const records: EvidenceRepairRecord[] = [];
  const traces =
    "requirementTrace" in snapshot
      ? snapshot.requirementTrace
      : "designTrace" in snapshot
        ? snapshot.designTrace
        : "codeTrace" in snapshot
          ? snapshot.codeTrace
          : [];
  for (const trace of traces) {
    if (!trace.kind.includes("repair")) continue;
    records.push({
      id: evidenceRecordId("REPAIR", records.length),
      stage: trace.stage,
      attempt: trace.attempt,
      kind: trace.kind,
      artifactId:
        "path" in trace
          ? trace.path
          : "diagramKind" in trace
            ? trace.diagramKind
            : undefined,
      message: trace.errorMessage,
      createdAt: trace.createdAt,
    });
  }
  if ("repairLoopSummary" in snapshot && snapshot.repairLoopSummary) {
    records.push({
      id: evidenceRecordId("REPAIR", records.length),
      stage: "repair_code_files",
      kind: "code-repair-loop",
      message: snapshot.repairLoopSummary.repaired
        ? "Code repair loop changed files."
        : "Code repair loop did not change files.",
      createdAt: new Date().toISOString(),
    });
  }
  return records;
}

export function buildEvidencePackage({
  snapshot,
  generatedAt = new Date().toISOString(),
  reviewDecisions = [],
}: BuildEvidencePackageInput): EvidencePackage {
  const reviewItems = buildReviewItems(snapshot, reviewDecisions);
  const failures = failureRecords(snapshot, generatedAt);
  const status =
    snapshot.status === "failed" || failures.length > 0
      ? "failed"
      : reviewItems.some((item) => item.status === "pending")
        ? "blocked"
        : "complete";

  return evidencePackageSchema.parse({
    runId: snapshot.runId,
    generatedAt,
    status,
    requirementBaseline: snapshot.requirementBaseline,
    qualityReport: snapshot.requirementBaseline?.qualityReport ?? null,
    coverageMatrix: snapshot.coverageMatrix,
    traceabilityMatrix: snapshot.traceabilityMatrix,
    modelArtifacts: modelArtifacts(snapshot),
    codeArtifacts: codeArtifacts(snapshot),
    businessAssertionResults:
      "businessAssertionResults" in snapshot
        ? snapshot.businessAssertionResults
        : null,
    browserEvidence: [],
    reviewItems,
    reviewDecisions,
    failureRecords: failures,
    repairRecords: repairRecords(snapshot),
  });
}

export function attachEvidencePackage(
  snapshot: EvidenceSnapshot,
  reviewDecisions = snapshot.evidencePackage?.reviewDecisions ?? [],
) {
  const evidencePackage = buildEvidencePackage({ snapshot, reviewDecisions });
  snapshot.evidencePackage = evidencePackage;
  return evidencePackage;
}

export function assertEvidencePackageAllowsDownstream(
  evidencePackage: EvidencePackage | null | undefined,
): asserts evidencePackage is EvidencePackage {
  if (!evidencePackage) {
    throw new Error("EvidencePackage review gate failed: evidence package is missing");
  }
  if (evidencePackage.status === "failed") {
    throw new Error("EvidencePackage review gate failed: run evidence is failed");
  }
  const blockingBrowserEvidence = evidencePackage.browserEvidence.filter(
    (item) => item.status === "failed" || item.status === "pending-review",
  );
  if (blockingBrowserEvidence.length > 0) {
    throw new Error(
      `EvidencePackage review gate failed: browser evidence ${blockingBrowserEvidence
        .map((item) => `${item.id}:${item.label}:${item.status}`)
        .join("；")}`,
    );
  }
  const pending = evidencePackage.reviewItems.filter(
    (item) => item.status === "pending",
  );
  if (pending.length > 0) {
    throw new Error(
      `EvidencePackage review gate failed: ${pending
        .map((item) => `${item.id}:${item.reason}`)
        .join("；")}`,
    );
  }
}
