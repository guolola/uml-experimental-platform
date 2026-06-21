// Owns requirement text, rule editing, and rule version bookkeeping.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import type { DiagramType } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type {
  RequirementRulesUpdateMetadata,
  WorkspaceRepository,
} from "../../../services/workspace-repository";
import { requirementInputFingerprintFor } from "../lib/workspace-context";

type RequirementRuleCommitMetadata = Pick<
  RequirementRulesUpdateMetadata,
  | "requirementBaseline"
  | "requirementModelTraceability"
  | "requirementQualityReport"
  | "requirementReviewCandidates"
>;

export function ensureUniqueRequirementRuleIds(
  rules: RequirementRule[],
): RequirementRule[] {
  const usedRuleIds = new Set<string>();
  return rules.map((rule) => {
    const baseId = rule.id.trim() || "r";
    let candidate = baseId;
    let suffix = 2;
    while (usedRuleIds.has(candidate.toLowerCase())) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedRuleIds.add(candidate.toLowerCase());
    return candidate === rule.id ? rule : { ...rule, id: candidate };
  });
}

export function useRequirementsSlice(repository: WorkspaceRepository) {
  const [requirementText, setRequirementTextRaw] = useState("");
  const [rules, setRulesRaw] = useState<RequirementRule[]>([]);
  const [textVersion, setTextVersion] = useState(0);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [rulesBasedOnTextVersion, setRulesBasedOnTextVersion] = useState<
    number | null
  >(null);
  const [requirementInputFingerprint, setRequirementInputFingerprint] = useState<
    string | null
  >(null);
  const pendingTextSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTextSaveValueRef = useRef<string | null>(null);
  const pendingTextSavePromiseRef = useRef<Promise<void> | null>(null);

  const setRules = useCallback(
    (value: SetStateAction<RequirementRule[]>) => {
      setRulesRaw((current) => {
        const nextRules = typeof value === "function" ? value(current) : value;
        return ensureUniqueRequirementRuleIds(nextRules);
      });
    },
    [],
  );

  useEffect(
    () => () => {
      if (pendingTextSaveRef.current) {
        clearTimeout(pendingTextSaveRef.current);
      }
    },
    [],
  );

  const persistRequirementText = useCallback(
    (value: string) => {
      const savePromise = Promise.resolve(
        repository.updateRequirementText(value),
      ).finally(() => {
        if (pendingTextSavePromiseRef.current === savePromise) {
          pendingTextSavePromiseRef.current = null;
        }
      });
      pendingTextSavePromiseRef.current = savePromise;
      return savePromise;
    },
    [repository],
  );

  const savePendingRequirementText = useCallback(
    async (value: string) => {
      const priorSave = pendingTextSavePromiseRef.current;
      if (priorSave) {
        await priorSave;
      }
      await persistRequirementText(value);
    },
    [persistRequirementText],
  );

  const setRequirementText = useCallback(
    (value: string) => {
      setRequirementTextRaw((prev) => {
        if (prev !== value) {
          setTextVersion((current) => current + 1);
        }
        return value;
      });
      if (pendingTextSaveRef.current) {
        clearTimeout(pendingTextSaveRef.current);
      }
      pendingTextSaveValueRef.current = value;
      pendingTextSaveRef.current = setTimeout(() => {
        pendingTextSaveRef.current = null;
        const pendingValue = pendingTextSaveValueRef.current;
        pendingTextSaveValueRef.current = null;
        if (pendingValue !== null) {
          void savePendingRequirementText(pendingValue);
        }
      }, 500);
    },
    [savePendingRequirementText],
  );

  const flushRequirementTextSave = useCallback(async () => {
    if (pendingTextSaveRef.current) {
      clearTimeout(pendingTextSaveRef.current);
      pendingTextSaveRef.current = null;
      const pendingValue = pendingTextSaveValueRef.current;
      pendingTextSaveValueRef.current = null;
      if (pendingValue !== null) {
        await savePendingRequirementText(pendingValue);
        return;
      }
    }
    if (pendingTextSavePromiseRef.current) {
      await pendingTextSavePromiseRef.current;
    }
  }, [savePendingRequirementText]);

  const commitRequirementRules = useCallback(
    (
      nextRules: RequirementRule[],
      metadata: Partial<RequirementRuleCommitMetadata> = {},
    ) => {
      const uniqueRules = ensureUniqueRequirementRuleIds(nextRules);
      const nextRulesVersion = rulesVersion + 1;
      const nextRequirementInputFingerprint = requirementInputFingerprintFor(
        requirementText,
        uniqueRules,
      );
      setRules(uniqueRules);
      setRulesVersion(nextRulesVersion);
      setRulesBasedOnTextVersion(textVersion);
      setRequirementInputFingerprint(nextRequirementInputFingerprint);
      void repository.updateRequirementRules?.(uniqueRules, {
        requirementInputFingerprint: nextRequirementInputFingerprint,
        ...metadata,
        rulesBasedOnTextVersion: textVersion,
        rulesVersion: nextRulesVersion,
      });
    },
    [repository, requirementText, rulesVersion, textVersion],
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
    },
    metadata?: Partial<RequirementRuleCommitMetadata>) => {
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
      ], metadata);
    },
    [commitRequirementRules, getNextRequirementRuleId, rules],
  );

  const addRequirementRule = useCallback((metadata?: Partial<RequirementRuleCommitMetadata>) => {
    createRequirementRule({
      category: "功能需求",
      text: "待填写需求项",
      relatedDiagrams: ["usecase", "activity"],
    }, metadata);
  }, [createRequirementRule]);

  const updateRequirementRule = useCallback(
    (
      id: string,
      patch: Partial<RequirementRule>,
      metadata?: Partial<RequirementRuleCommitMetadata>,
    ) => {
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
        metadata,
      );
    },
    [commitRequirementRules, rules],
  );

  const deleteRequirementRule = useCallback(
    (id: string, metadata?: Partial<RequirementRuleCommitMetadata>) => {
      commitRequirementRules(
        rules.filter((rule) => rule.id !== id),
        metadata,
      );
    },
    [commitRequirementRules, rules],
  );

  const clearRequirementRules = useCallback((metadata?: Partial<RequirementRuleCommitMetadata>) => {
    commitRequirementRules([], metadata);
  }, [commitRequirementRules]);

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
    requirementInputFingerprint,
    setRequirementInputFingerprint,
    flushRequirementTextSave,
    commitRequirementRules,
    addRequirementRule,
    createRequirementRule,
    updateRequirementRule,
    deleteRequirementRule,
    clearRequirementRules,
    rulesForDiagram,
  };
}
