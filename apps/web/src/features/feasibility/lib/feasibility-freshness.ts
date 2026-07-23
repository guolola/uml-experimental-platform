// Centralizes accepted-rule selection and freshness checks for feasibility artifacts and reports.
import { snapshotInputFingerprint } from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

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
  const contextStale = Boolean(
    workspace.feasibilityContextModel &&
      workspace.feasibilityContextFingerprint !== currentContextFingerprint,
  );
  const currentImplementationFingerprint = snapshotInputFingerprint({
    rules,
    contextModel: workspace.feasibilityContextModel,
    inputs: workspace.feasibilityInputs,
  });
  const implementationStale = Boolean(
    workspace.feasibilityImplementationPlan &&
      workspace.feasibilityImplementationFingerprint !== currentImplementationFingerprint,
  );
  return {
    contextStale,
    implementationStale,
    currentContextFingerprint,
    currentImplementationFingerprint,
  };
}
