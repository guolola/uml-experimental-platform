// Derives compact provenance badges for sidebar diagram entries from existing workflow state.
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import { DIAGRAM_META, DESIGN_DIAGRAM_META, type DesignDiagramType } from "../../../entities/diagram/model";

function formatRuleId(id: string) {
  const value = id.trim();
  const match = /^r(\d+)$/i.exec(value);
  return match ? `R${match[1]}` : value;
}

export type RequirementTraceBadge = {
  label: string;
  fullLabel: string;
};

export function buildRequirementDiagramTraceBadge(
  rules: RequirementRule[],
): RequirementTraceBadge | undefined {
  const ruleIds = Array.from(
    new Set(rules.map((rule) => formatRuleId(rule.id)).filter(Boolean)),
  );
  if (ruleIds.length === 0) {
    return undefined;
  }

  const visibleIds = ruleIds.slice(0, 3);
  return {
    label:
      ruleIds.length > visibleIds.length
        ? `${visibleIds.join(" ")} +${ruleIds.length - visibleIds.length}`
        : visibleIds.join(" "),
    fullLabel: ruleIds.join(", "),
  };
}

const DESIGN_UPSTREAM_BADGES: Record<DesignDiagramType, string[]> = {
  sequence: [DIAGRAM_META.usecase.label],
  class: [DIAGRAM_META.class.label, DESIGN_DIAGRAM_META.sequence.label],
  activity: [DIAGRAM_META.activity.label, DESIGN_DIAGRAM_META.sequence.label],
  deployment: [DIAGRAM_META.deployment.label, DESIGN_DIAGRAM_META.sequence.label],
  table: [DIAGRAM_META.class.label, DESIGN_DIAGRAM_META.sequence.label],
};

export function buildDesignDiagramTraceBadge(diagram: DesignDiagramType) {
  return DESIGN_UPSTREAM_BADGES[diagram];
}
