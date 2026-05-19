// Owns requirement text, rule editing, and rule version bookkeeping.
import { useCallback, useState } from "react";
import type { DiagramType } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRepository } from "../../../services/workspace-repository";

export function useRequirementsSlice(repository: WorkspaceRepository) {
  const [requirementText, setRequirementTextRaw] = useState("");
  const [rules, setRules] = useState<RequirementRule[]>([]);
  const [textVersion, setTextVersion] = useState(0);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [rulesBasedOnTextVersion, setRulesBasedOnTextVersion] = useState<
    number | null
  >(null);

  const setRequirementText = useCallback(
    (value: string) => {
      setRequirementTextRaw((prev) => {
        if (prev !== value) {
          setTextVersion((current) => current + 1);
        }
        return value;
      });
      void repository.updateRequirementText(value);
    },
    [repository],
  );

  const commitRequirementRules = useCallback(
    (nextRules: RequirementRule[]) => {
      setRules(nextRules);
      setRulesVersion((current) => current + 1);
      setRulesBasedOnTextVersion(textVersion);
      void repository.updateRequirementRules?.(nextRules);
    },
    [repository, textVersion],
  );

  const getNextRequirementRuleId = useCallback(() => {
    const used = new Set(rules.map((rule) => rule.id.toLowerCase()));
    const maxIndex = rules.reduce((max, rule) => {
      const match = /^r(\d+)$/i.exec(rule.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    let nextIndex = maxIndex + 1;
    while (used.has(`r${nextIndex}`)) {
      nextIndex += 1;
    }
    return `r${nextIndex}`;
  }, [rules]);

  const createRequirementRule = useCallback(
    (input: {
      category: RequirementRule["category"];
      text: string;
      relatedDiagrams: DiagramType[];
    }) => {
      const relatedDiagrams =
        input.relatedDiagrams.length > 0
          ? input.relatedDiagrams
          : (["usecase"] as DiagramType[]);
      commitRequirementRules([
        ...rules,
        {
          id: getNextRequirementRuleId(),
          category: input.category,
          text: input.text.trim() || "待填写需求项",
          relatedDiagrams,
        },
      ]);
    },
    [commitRequirementRules, getNextRequirementRuleId, rules],
  );

  const addRequirementRule = useCallback(() => {
    createRequirementRule({
      category: "功能需求",
      text: "待填写需求项",
      relatedDiagrams: ["usecase", "activity"],
    });
  }, [createRequirementRule]);

  const updateRequirementRule = useCallback(
    (id: string, patch: Partial<RequirementRule>) => {
      commitRequirementRules(
        rules.map((rule) =>
          rule.id === id
            ? {
                ...rule,
                ...patch,
                relatedDiagrams:
                  patch.relatedDiagrams && patch.relatedDiagrams.length > 0
                    ? patch.relatedDiagrams
                    : (patch.relatedDiagrams ?? rule.relatedDiagrams),
              }
            : rule,
        ),
      );
    },
    [commitRequirementRules, rules],
  );

  const deleteRequirementRule = useCallback(
    (id: string) => {
      commitRequirementRules(rules.filter((rule) => rule.id !== id));
    },
    [commitRequirementRules, rules],
  );

  const rulesForDiagram = useCallback(
    (diagram: DiagramType) =>
      rules.filter((rule) => rule.relatedDiagrams.includes(diagram)),
    [rules],
  );

  return {
    requirementText,
    setRequirementText,
    setRequirementTextRaw,
    rules,
    setRules,
    textVersion,
    setTextVersion,
    rulesVersion,
    setRulesVersion,
    rulesBasedOnTextVersion,
    setRulesBasedOnTextVersion,
    commitRequirementRules,
    addRequirementRule,
    createRequirementRule,
    updateRequirementRule,
    deleteRequirementRule,
    rulesForDiagram,
  };
}
