// Owns run evidence package storage and unresolved-review gate decisions.
import type { FastifyReply } from "fastify";
import type {
  EvidencePackage,
  EvidenceReviewDecision,
  RunStage,
} from "@uml-platform/contracts";
import type { RunRecord } from "../records/run-record-store.js";
import {
  assertEvidencePackageAllowsDownstream,
  buildEvidencePackage,
} from "./evidence-package.js";

export function evidenceArtifactStage(record: RunRecord): RunStage {
  if (record.snapshot.currentStage) return record.snapshot.currentStage;
  if ("files" in record.snapshot) return "write_code_files";
  if ("documentKind" in record.snapshot) return "render_document_file";
  return "render_svg";
}

export function buildAndStoreEvidencePackage(record: RunRecord) {
  const evidencePackage = buildEvidencePackage({
    snapshot: record.snapshot,
    reviewDecisions: record.snapshot.evidencePackage?.reviewDecisions ?? [],
  });
  record.snapshot.evidencePackage = evidencePackage;
  return evidencePackage;
}

export function storeEvidenceReviewDecision(
  record: RunRecord,
  decision: EvidenceReviewDecision,
) {
  const existingDecisions =
    record.snapshot.evidencePackage?.reviewDecisions.filter(
      (existing) => existing.reviewItemId !== decision.reviewItemId,
    ) ?? [];
  const evidencePackage = buildEvidencePackage({
    snapshot: record.snapshot,
    reviewDecisions: [...existingDecisions, decision],
  });
  record.snapshot.evidencePackage = evidencePackage;
  return evidencePackage;
}

export function rejectBlockedEvidencePackage(
  reply: FastifyReply,
  evidencePackage: EvidencePackage | null | undefined,
) {
  if (evidencePackage === undefined) return null;
  try {
    assertEvidencePackageAllowsDownstream(evidencePackage);
    return null;
  } catch (error) {
    reply.code(409);
    return {
      message: `EvidencePackage review is unresolved: ${
        error instanceof Error ? error.message : "unknown review gate failure"
      }`,
    };
  }
}
