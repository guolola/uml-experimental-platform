// Centralizes accepted-rule selection and freshness checks for feasibility artifacts and reports.
import {
  buildAcceptedRequirementSnapshot,
  snapshotInputFingerprint,
  type FeasibilityArtifactKind,
} from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

export type FeasibilityArtifactStatus = "ready" | "missing" | "stale";

export function acceptedFeasibilityRules(workspace: WorkspaceRecord) {
  return buildAcceptedRequirementSnapshot(
    workspace.rules,
    workspace.requirementBaseline,
  ).rules;
}

export function feasibilityArtifactState(workspace: WorkspaceRecord) {
  const requirementSource = buildAcceptedRequirementSnapshot(
    workspace.rules,
    workspace.requirementBaseline,
  );
  const rules = requirementSource.rules;
  const currentContextFingerprint = requirementSource.snapshot.fingerprint;
  const contextExists = Boolean(
    workspace.feasibilityContextModel &&
      workspace.feasibilityContextPlantUml &&
      workspace.feasibilityContextSvg,
  );
  const contextStale = Boolean(
    contextExists &&
      workspace.feasibilityContextFingerprint !== currentContextFingerprint,
  );
  const currentImplementationFingerprint = snapshotInputFingerprint({
    rules,
    contextModel: workspace.feasibilityContextModel,
    inputs: workspace.feasibilityInputs,
  });
  const implementationPlan = workspace.feasibilityImplementationPlan;
  const recommendedImplementation = implementationPlan?.candidates.find(
    (candidate) => candidate.id === implementationPlan.recommendedCandidateId,
  )?.implementation;
  const implementationExists = Boolean(
    implementationPlan && recommendedImplementation,
  );
  const implementationStale = Boolean(
    implementationExists &&
      workspace.feasibilityImplementationFingerprint !== currentImplementationFingerprint,
  );
  const contextStatus: FeasibilityArtifactStatus = !contextExists
    ? "missing"
    : contextStale
      ? "stale"
      : "ready";
  const implementationStatus: FeasibilityArtifactStatus = !implementationExists
    ? "missing"
    : implementationStale
      ? "stale"
      : "ready";
  // Refreshing context invalidates the implementation input, so guide users to update both.
  const requiredArtifacts: FeasibilityArtifactKind[] =
    contextStatus !== "ready"
      ? ["context", "implementation"]
      : implementationStatus !== "ready"
        ? ["implementation"]
        : [];
  return {
    contextExists,
    contextStale,
    contextStatus,
    implementationExists,
    implementationStale,
    implementationStatus,
    reportReady:
      contextStatus === "ready" && implementationStatus === "ready",
    requiredArtifacts,
    currentContextFingerprint,
    currentImplementationFingerprint,
    requirementSource: requirementSource.snapshot,
  };
}
