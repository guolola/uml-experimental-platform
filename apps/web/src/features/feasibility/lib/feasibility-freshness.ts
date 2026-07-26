// Centralizes accepted-rule selection and freshness checks for feasibility artifacts and reports.
import {
  snapshotInputFingerprint,
  type FeasibilityArtifactKind,
} from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

export type FeasibilityArtifactStatus = "ready" | "missing" | "stale";

export function acceptedFeasibilityRules(workspace: WorkspaceRecord) {
  const requirements = workspace.requirementBaseline?.requirements ?? [];
  if (requirements.length === 0) return workspace.rules;
  const acceptedIds = new Set(
    requirements
      .filter((requirement) => requirement.status === "accepted")
      .map((requirement) => requirement.sourceRuleId)
      .filter((id): id is string => Boolean(id)),
  );
  return workspace.rules.filter((rule) => acceptedIds.has(rule.id));
}

export function feasibilityArtifactState(workspace: WorkspaceRecord) {
  const rules = acceptedFeasibilityRules(workspace);
  const currentContextFingerprint = snapshotInputFingerprint({
    rules,
    requirementBaseline: workspace.requirementBaseline,
  });
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
  };
}
