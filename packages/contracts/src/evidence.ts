// Evidence package contract schemas for review items, artifacts, browser evidence, and repair records.
import { z } from "zod";
import { codeBusinessAssertionResultSchema } from "./code-generation.js";
import {
  coverageMatrixSchema,
  requirementBaselineSchema,
  requirementQualityReportSchema,
  traceabilityArtifactTypeSchema,
  traceabilityMatrixSchema,
} from "./requirements.js";

export const evidenceReviewDecisionSchema = z.object({
  id: z.string().min(1),
  reviewItemId: z.string().min(1),
  decision: z.enum(["approved", "rejected", "needs-repair", "accepted-risk"]),
  reviewerId: z.string().min(1).optional(),
  reviewerName: z.string().min(1).optional(),
  comment: z.string().min(1),
  decidedAt: z.string().min(1),
});
export type EvidenceReviewDecision = z.infer<
  typeof evidenceReviewDecisionSchema
>;

export const evidenceReviewItemSchema = z.object({
  id: z.string().min(1),
  source: z.enum([
    "requirement-quality",
    "coverage",
    "traceability",
    "business-assertion",
    "assumption",
    "conflict",
    "artifact",
  ]),
  status: z.enum(["pending", "resolved"]),
  severity: z.enum(["info", "warning", "error", "critical"]),
  requirementId: z.string().min(1).optional(),
  artifactType: traceabilityArtifactTypeSchema.optional(),
  artifactId: z.string().min(1).optional(),
  reason: z.string().min(1),
  decision: evidenceReviewDecisionSchema.optional(),
});
export type EvidenceReviewItem = z.infer<typeof evidenceReviewItemSchema>;

export const evidenceArtifactSummarySchema = z.object({
  artifactType: z.enum([
    "requirements-model",
    "design-model",
    "plantuml",
    "svg",
    "code",
    "test",
    "document",
    "browser",
  ]),
  artifactId: z.string().min(1),
  label: z.string().min(1).optional(),
  requirementIds: z.array(z.string().min(1)).default([]),
});
export type EvidenceArtifactSummary = z.infer<
  typeof evidenceArtifactSummarySchema
>;

export const evidenceFailureRecordSchema = z.object({
  id: z.string().min(1),
  stage: z.string().min(1).optional(),
  message: z.string().min(1),
  requirementId: z.string().min(1).optional(),
  artifactId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});
export type EvidenceFailureRecord = z.infer<typeof evidenceFailureRecordSchema>;

export const evidenceRepairRecordSchema = z.object({
  id: z.string().min(1),
  stage: z.string().min(1).optional(),
  attempt: z.number().int().min(1).optional(),
  kind: z.string().min(1),
  artifactId: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});
export type EvidenceRepairRecord = z.infer<typeof evidenceRepairRecordSchema>;

export const browserEvidenceRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["screenshot", "dom", "console", "network", "assertion"]),
  label: z.string().min(1),
  artifactId: z.string().min(1).optional(),
  status: z.enum(["passed", "failed", "pending-review"]),
  capturedAt: z.string().min(1),
});
export type BrowserEvidenceRecord = z.infer<typeof browserEvidenceRecordSchema>;

export const evidencePackageSchema = z.object({
  runId: z.string().min(1),
  generatedAt: z.string().min(1),
  status: z.enum(["complete", "blocked", "failed"]),
  requirementBaseline: requirementBaselineSchema.nullable(),
  qualityReport: requirementQualityReportSchema.nullable(),
  coverageMatrix: coverageMatrixSchema.nullable(),
  traceabilityMatrix: traceabilityMatrixSchema.nullable(),
  modelArtifacts: z.array(evidenceArtifactSummarySchema),
  codeArtifacts: z.array(evidenceArtifactSummarySchema),
  businessAssertionResults: codeBusinessAssertionResultSchema.nullable(),
  browserEvidence: z.array(browserEvidenceRecordSchema),
  reviewItems: z.array(evidenceReviewItemSchema),
  reviewDecisions: z.array(evidenceReviewDecisionSchema),
  failureRecords: z.array(evidenceFailureRecordSchema),
  repairRecords: z.array(evidenceRepairRecordSchema),
});
export type EvidencePackage = z.infer<typeof evidencePackageSchema>;
