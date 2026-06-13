// Coordinates auto-completed rule mapping merges with session state and repository persistence.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { DiagramType } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRunSnapshot } from "../../../entities/workspace/model";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import type { RequirementAutoUpstreamPlan } from "./generation-planning";
import {
  ensureAutoCompletedRuleMappings,
  mergeAutoCompletedRuleMappings,
} from "./generation-planning";
import { requirementInputFingerprintFor } from "./workspace-context";

type LatestRuleInputRef = {
  current: {
    rules: RequirementRule[];
  };
};

interface ResolveAutoCompletedRuleMappingInput {
  ruleMappingDiagrams: DiagramType[];
  rulesRunMode: RequirementAutoUpstreamPlan["rulesRunMode"];
  rulesSnapshot: WorkspaceRunSnapshot | null;
}

interface AutoCompletedRuleMappingActionsInput {
  latestInputRef: LatestRuleInputRef;
  repository: WorkspaceRepository;
  requirementText: string;
  rules: RequirementRule[];
  setRequirementInputFingerprint: Dispatch<SetStateAction<string | null>>;
  setRules: Dispatch<SetStateAction<RequirementRule[]>>;
  setRulesBasedOnTextVersion: Dispatch<SetStateAction<number | null>>;
  setRulesVersion: Dispatch<SetStateAction<number>>;
  textVersion: number;
}

export function useAutoCompletedRuleMappingActions({
  latestInputRef,
  repository,
  requirementText,
  rules,
  setRequirementInputFingerprint,
  setRules,
  setRulesBasedOnTextVersion,
  setRulesVersion,
  textVersion,
}: AutoCompletedRuleMappingActionsInput) {
  const resolveAutoCompletedRulesForRun = useCallback(
    ({
      ruleMappingDiagrams,
      rulesRunMode,
      rulesSnapshot,
    }: ResolveAutoCompletedRuleMappingInput) => {
      const rulesForRun =
        rulesSnapshot && rulesRunMode === "merge"
          ? ensureAutoCompletedRuleMappings(
              mergeAutoCompletedRuleMappings(rules, rulesSnapshot.rules),
              ruleMappingDiagrams,
            )
          : (rulesSnapshot?.rules ?? rules);

      if (rulesSnapshot && rulesRunMode === "merge") {
        setRules(rulesForRun);
        setRulesVersion((current) => current + 1);
        setRulesBasedOnTextVersion(textVersion);
        setRequirementInputFingerprint(
          requirementInputFingerprintFor(requirementText, rulesForRun),
        );
        latestInputRef.current = {
          ...latestInputRef.current,
          rules: rulesForRun,
        };
        void repository.updateRequirementRules?.(rulesForRun);
      }

      return {
        reviewedRuleIds:
          rulesRunMode === "replace"
            ? (rulesSnapshot?.rules.map((rule) => rule.id) ?? [])
            : [],
        rulesForRun,
      };
    },
    [
      latestInputRef,
      repository,
      requirementText,
      rules,
      setRequirementInputFingerprint,
      setRules,
      setRulesBasedOnTextVersion,
      setRulesVersion,
      textVersion,
    ],
  );

  return { resolveAutoCompletedRulesForRun };
}
