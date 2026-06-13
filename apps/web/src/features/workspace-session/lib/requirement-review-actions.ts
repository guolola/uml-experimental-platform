// Provides requirement review persistence, repair, and rule mutation actions for the session provider.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type {
  AtomicRequirement,
  AtomicRequirementField,
  RequirementBaseline,
  RequirementQualityReport,
} from "@uml-platform/contracts";
import type { DiagramType } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import {
  createStartRunInput,
  type WorkspaceRepository,
} from "../../../services/workspace-repository";
import type { GenerationResultDialogState } from "../components/generation-dialogs";
import {
  REVIEWABLE_REQUIREMENT_FIELDS,
  isRequirementBlocking,
  markRequirementReviewed,
  mergeReviewedRequirement,
  rebuildRequirementReviewQualityReport,
  uniqueIssueMessages,
} from "./requirement-review";

interface RequirementRuleCreateInput {
  category: RequirementRule["category"];
  relatedDiagrams: DiagramType[];
  text: string;
}

interface RequirementReviewActionsInput {
  clearRequirementRulesBase: () => void;
  createRequirementRuleBase: (input: RequirementRuleCreateInput) => void;
  deleteRequirementRuleBase: (id: string) => void;
  openGenerationResultDialog: (state: GenerationResultDialogState) => void;
  repository: WorkspaceRepository;
  requirementBaseline: RequirementBaseline | null;
  requirementReviewCandidates: WorkspaceRecord["requirementReviewCandidates"];
  requirementText: string;
  rules: RequirementRule[];
  selectedDiagrams: DiagramType[];
  setRequirementBaseline: Dispatch<SetStateAction<RequirementBaseline | null>>;
  setRequirementQualityReport: Dispatch<
    SetStateAction<RequirementQualityReport | null>
  >;
  setRequirementReviewCandidates: Dispatch<
    SetStateAction<WorkspaceRecord["requirementReviewCandidates"]>
  >;
  updateRequirementRuleBase: (
    id: string,
    patch: Partial<RequirementRule>,
  ) => void;
}

export function useRequirementReviewActions({
  clearRequirementRulesBase,
  createRequirementRuleBase,
  deleteRequirementRuleBase,
  openGenerationResultDialog,
  repository,
  requirementBaseline,
  requirementReviewCandidates,
  requirementText,
  rules,
  selectedDiagrams,
  setRequirementBaseline,
  setRequirementQualityReport,
  setRequirementReviewCandidates,
  updateRequirementRuleBase,
}: RequirementReviewActionsInput) {
  const persistRequirementBaseline = useCallback(
    async (next: RequirementBaseline) => {
      if (!repository.updateRequirementBaseline) {
        throw new Error("当前环境不支持保存需求复核结果");
      }
      await repository.updateRequirementBaseline(next);
      setRequirementBaseline(next);
      setRequirementQualityReport(next.qualityReport);
    },
    [repository, setRequirementBaseline, setRequirementQualityReport],
  );

  const persistRequirementReviewCandidates = useCallback(
    async (next: WorkspaceRecord["requirementReviewCandidates"]) => {
      setRequirementReviewCandidates(next);
      await repository.updateRequirementReviewCandidates?.(next);
    },
    [repository, setRequirementReviewCandidates],
  );

  const persistRequirementReviewState = useCallback(
    async (
      nextBaseline: RequirementBaseline,
      nextCandidates: WorkspaceRecord["requirementReviewCandidates"],
    ) => {
      if (repository.updateRequirementReviewState) {
        await repository.updateRequirementReviewState(
          nextBaseline,
          nextCandidates,
        );
      } else {
        await repository.updateRequirementBaseline?.(nextBaseline);
        await repository.updateRequirementReviewCandidates?.(nextCandidates);
      }
      setRequirementBaseline(nextBaseline);
      setRequirementQualityReport(nextBaseline.qualityReport);
      setRequirementReviewCandidates(nextCandidates);
    },
    [
      repository,
      setRequirementBaseline,
      setRequirementQualityReport,
      setRequirementReviewCandidates,
    ],
  );

  const clearRequirementReviewCandidates = useCallback(() => {
    setRequirementReviewCandidates({});
    void repository.updateRequirementReviewCandidates?.({});
  }, [repository, setRequirementReviewCandidates]);

  const createRequirementRule = useCallback(
    (input: RequirementRuleCreateInput) => {
      clearRequirementReviewCandidates();
      createRequirementRuleBase(input);
    },
    [clearRequirementReviewCandidates, createRequirementRuleBase],
  );

  const updateRequirementRule = useCallback(
    (id: string, patch: Partial<RequirementRule>) => {
      clearRequirementReviewCandidates();
      updateRequirementRuleBase(id, patch);
    },
    [clearRequirementReviewCandidates, updateRequirementRuleBase],
  );

  const deleteRequirementRule = useCallback(
    (id: string) => {
      clearRequirementReviewCandidates();
      deleteRequirementRuleBase(id);
    },
    [clearRequirementReviewCandidates, deleteRequirementRuleBase],
  );

  const clearRequirementRules = useCallback(() => {
    clearRequirementReviewCandidates();
    clearRequirementRulesBase();
  }, [clearRequirementReviewCandidates, clearRequirementRulesBase]);

  const showRequirementReviewSaveFailure = useCallback(
    (error: unknown, ruleId: string) => {
      openGenerationResultDialog({
        title: "保存失败",
        tone: "destructive",
        message: "复核结果没有保存，请稍后重试。",
        details: [
          error instanceof Error ? error.message : "项目工作台保存失败。",
        ],
        ruleId,
        stageLabel: "需求规则",
        targetLabel:
          rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则",
      });
    },
    [openGenerationResultDialog, rules],
  );

  const updateRequirementAiSuggestionReview = useCallback(
    async (
      ruleId: string,
      decision: "accept-ai" | "accept-manual" | "reject",
      fieldValues: Partial<Record<AtomicRequirementField, string>> = {},
    ) => {
      if (!requirementBaseline) return;
      const next = structuredClone(requirementBaseline) as RequirementBaseline;
      const requirement = next.requirements.find(
        (item) => item.sourceRuleId === ruleId,
      );
      if (!requirement) return;
      const targetLabel =
        rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则";

      if (decision === "accept-manual") {
        for (const field of REVIEWABLE_REQUIREMENT_FIELDS) {
          const rawValue = fieldValues[field];
          if (rawValue === undefined) continue;
          const value = rawValue.trim();
          if (field === "acceptanceCriteria") {
            requirement.acceptanceCriteria = value
              .split(/[；;\n]/)
              .map((item) => item.trim())
              .filter(Boolean);
          } else {
            requirement[field] = value || null;
          }
          requirement.fieldProvenance[field] = {
            source: "manual",
            status: value ? "accepted" : "pending-review",
            value: value || null,
            originalValue:
              requirement.fieldProvenance[field]?.originalValue ??
              requirement.fieldProvenance[field]?.value ??
              null,
            rationale: "用户编辑后保存，并重新运行需求质量检查。",
          };
        }
      } else {
        for (const [field, provenance] of Object.entries(
          requirement.fieldProvenance,
        )) {
          if (
            provenance?.source !== "ai-suggested" ||
            provenance.status !== "pending-review"
          ) {
            continue;
          }
          requirement.fieldProvenance[
            field as keyof typeof requirement.fieldProvenance
          ] = {
            ...provenance,
            status: decision === "reject" ? "rejected" : "accepted",
            rationale:
              decision === "reject"
                ? "用户已拒绝本次智能修复建议。"
                : "用户已采纳本次智能修复建议。",
          };
        }
      }

      if (decision === "reject") {
        requirement.status = "pending-review";
      } else if (requirement.status !== "conflict") {
        requirement.confidence = Math.max(requirement.confidence, 0.72);
        requirement.status = Object.values(requirement.fieldProvenance).some(
          (item) =>
            item?.status === "pending-review" || item?.status === "rejected",
        )
          ? "pending-review"
          : "accepted";
      }

      next.qualityReport = rebuildRequirementReviewQualityReport(next);
      const relatedIssues = next.qualityReport.issues.filter(
        (issue) => issue.requirementId === requirement.id,
      );
      const stillBlocked = relatedIssues.some(isRequirementBlocking);
      if (stillBlocked && decision === "accept-manual") {
        for (const field of Object.keys(
          fieldValues,
        ) as AtomicRequirementField[]) {
          const provenance = requirement.fieldProvenance[field];
          if (provenance?.source === "manual") {
            requirement.fieldProvenance[field] = {
              ...provenance,
              status: "pending-review",
              rationale: "编辑稿已保存，但质量检查仍未通过。",
            };
          }
        }
        requirement.status = "pending-review";
        next.qualityReport = rebuildRequirementReviewQualityReport(next);
      }

      try {
        await persistRequirementBaseline(next);
      } catch (error) {
        showRequirementReviewSaveFailure(error, ruleId);
        return;
      }

      if (decision === "reject") {
        openGenerationResultDialog({
          title: "字段建议已拒绝",
          tone: "warning",
          message: "智能修复补齐建议已标记为拒绝，需求仍保留待确认提示。",
          details: uniqueIssueMessages(relatedIssues),
          requirementId: requirement.id,
          ruleId,
          stageLabel: "需求规则",
          targetLabel,
        });
      } else if (stillBlocked) {
        openGenerationResultDialog({
          title: "字段仍需确认",
          tone: "warning",
          message: "编辑稿已保存，当前需求仍保留质量提示。",
          details: uniqueIssueMessages(relatedIssues),
          requirementId: requirement.id,
          ruleId,
          stageLabel: "需求规则",
          targetLabel,
        });
      } else {
        openGenerationResultDialog({
          title: "字段已保存",
          tone: "success",
          message:
            decision === "accept-manual"
              ? "手动编辑后的字段已保存。"
              : "智能修复补齐字段已采纳并保存。",
          requirementId: requirement.id,
          ruleId,
          stageLabel: "需求规则",
          targetLabel,
        });
      }
    },
    [
      openGenerationResultDialog,
      persistRequirementBaseline,
      requirementBaseline,
      rules,
      showRequirementReviewSaveFailure,
    ],
  );

  const acceptRequirementAiSuggestions = useCallback(
    async (
      ruleId: string,
      mode: "ai-accepted" | "manual-edited" = "ai-accepted",
      fieldValues?: Partial<Record<AtomicRequirementField, string>>,
    ) => {
      await updateRequirementAiSuggestionReview(
        ruleId,
        mode === "manual-edited" ? "accept-manual" : "accept-ai",
        fieldValues,
      );
    },
    [updateRequirementAiSuggestionReview],
  );

  const rejectRequirementAiSuggestions = useCallback(
    async (ruleId: string) => {
      await updateRequirementAiSuggestionReview(ruleId, "reject");
    },
    [updateRequirementAiSuggestionReview],
  );

  const confirmRequirementQualityHint = useCallback(
    async (ruleId: string) => {
      if (!requirementBaseline) return;
      const requirement = requirementBaseline.requirements.find(
        (item) => item.sourceRuleId === ruleId,
      );
      if (!requirement) return;
      const reviewedRequirement = markRequirementReviewed(requirement);
      const nextBaseline = mergeReviewedRequirement(
        requirementBaseline,
        reviewedRequirement,
      );
      try {
        await persistRequirementBaseline(nextBaseline);
      } catch (error) {
        showRequirementReviewSaveFailure(error, ruleId);
        return;
      }
      openGenerationResultDialog({
        title: "需求提示已确认",
        tone: "success",
        message: "当前需求质量提示已标记为已确认，可继续后续生成。",
        requirementId: reviewedRequirement.id,
        ruleId,
        stageLabel: "需求规则",
        targetLabel:
          rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则",
      });
    },
    [
      openGenerationResultDialog,
      persistRequirementBaseline,
      requirementBaseline,
      rules,
      showRequirementReviewSaveFailure,
    ],
  );

  const repairRequirementRuleCandidate = useCallback(
    async (
      ruleId: string,
      baselineOverride?: RequirementBaseline,
      rulesOverride?: RequirementRule[],
    ): Promise<
      WorkspaceRecord["requirementReviewCandidates"][string] | null
    > => {
      const baseline = baselineOverride ?? requirementBaseline;
      if (!baseline) return null;
      const activeRules = rulesOverride ?? rules;
      const rule = activeRules.find((item) => item.id === ruleId);
      const requirement = baseline.requirements.find(
        (item) => item.sourceRuleId === ruleId,
      );
      if (!rule || !requirement) return null;
      const createdAt = new Date().toISOString();
      if (!repository.repairRequirementRule) {
        return {
          ruleId,
          beforeRequirement: structuredClone(requirement) as AtomicRequirement,
          afterRequirement: null,
          repairRationale: null,
          blockingReasons: [],
          status: "failed",
          errorMessage: "当前环境不支持单项智能修复",
          createdAt,
        };
      }
      try {
        const runInput = createStartRunInput(
          requirementText,
          selectedDiagrams,
          activeRules,
        );
        const repairResult = await repository.repairRequirementRule({
          requirementText,
          rule,
          baseline,
          providerSettings: runInput.providerSettings,
        });
        return {
          ruleId,
          beforeRequirement: structuredClone(requirement) as AtomicRequirement,
          afterRequirement: repairResult.requirement,
          repairRationale: repairResult.repairRationale,
          blockingReasons: repairResult.blockingReasons,
          status: "pending",
          errorMessage: null,
          createdAt,
        };
      } catch (error) {
        return {
          ruleId,
          beforeRequirement: structuredClone(requirement) as AtomicRequirement,
          afterRequirement: null,
          repairRationale: null,
          blockingReasons: [],
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "模型返回内容无法解析。",
          createdAt,
        };
      }
    },
    [repository, requirementBaseline, requirementText, rules, selectedDiagrams],
  );

  const repairRequirementRuleCandidates = useCallback(
    async (
      ruleIds: string[],
      baselineOverride?: RequirementBaseline,
      rulesOverride?: RequirementRule[],
    ): Promise<WorkspaceRecord["requirementReviewCandidates"]> => {
      const baseline = baselineOverride ?? requirementBaseline;
      if (!baseline || ruleIds.length === 0) return {};
      const activeRules = rulesOverride ?? rules;
      const createdAt = new Date().toISOString();
      const requirementByRuleId = new Map(
        baseline.requirements
          .filter((requirement) => requirement.sourceRuleId)
          .map((requirement) => [requirement.sourceRuleId!, requirement]),
      );
      const failedCandidate = (
        ruleId: string,
        errorMessage: string,
      ): WorkspaceRecord["requirementReviewCandidates"][string] | null => {
        const requirement = requirementByRuleId.get(ruleId);
        if (!requirement) return null;
        return {
          ruleId,
          beforeRequirement: structuredClone(requirement) as AtomicRequirement,
          afterRequirement: null,
          repairRationale: null,
          blockingReasons: [],
          status: "failed",
          errorMessage,
          createdAt,
        };
      };
      if (!repository.repairRequirementRules) {
        return Object.fromEntries(
          ruleIds
            .map(
              (ruleId) =>
                [
                  ruleId,
                  failedCandidate(ruleId, "当前环境不支持批量智能修复"),
                ] as const,
            )
            .filter(
              (
                entry,
              ): entry is readonly [
                string,
                WorkspaceRecord["requirementReviewCandidates"][string],
              ] => Boolean(entry[1]),
            ),
        );
      }
      try {
        const runInput = createStartRunInput(
          requirementText,
          selectedDiagrams,
          activeRules,
        );
        const repairResult = await repository.repairRequirementRules({
          requirementText,
          rules: activeRules,
          targetRuleIds: ruleIds,
          baseline,
          providerSettings: runInput.providerSettings,
        });
        const nextCandidates: WorkspaceRecord["requirementReviewCandidates"] =
          {};
        for (const candidate of repairResult.candidates) {
          const requirement = requirementByRuleId.get(candidate.ruleId);
          if (!requirement) continue;
          nextCandidates[candidate.ruleId] = {
            ruleId: candidate.ruleId,
            beforeRequirement: structuredClone(
              requirement,
            ) as AtomicRequirement,
            afterRequirement: candidate.requirement,
            repairRationale: candidate.repairRationale,
            blockingReasons: candidate.blockingReasons,
            status: "pending",
            errorMessage: null,
            createdAt,
          };
        }
        for (const failure of repairResult.failures) {
          const candidate = failedCandidate(
            failure.ruleId,
            failure.errorMessage,
          );
          if (candidate) nextCandidates[failure.ruleId] = candidate;
        }
        for (const ruleId of ruleIds) {
          if (nextCandidates[ruleId]) continue;
          const candidate = failedCandidate(
            ruleId,
            "批量智能修复没有返回当前规则结果",
          );
          if (candidate) nextCandidates[ruleId] = candidate;
        }
        return nextCandidates;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "模型返回内容无法解析。";
        return Object.fromEntries(
          ruleIds
            .map(
              (ruleId) =>
                [ruleId, failedCandidate(ruleId, errorMessage)] as const,
            )
            .filter(
              (
                entry,
              ): entry is readonly [
                string,
                WorkspaceRecord["requirementReviewCandidates"][string],
              ] => Boolean(entry[1]),
            ),
        );
      }
    },
    [repository, requirementBaseline, requirementText, rules, selectedDiagrams],
  );

  const repairRequirementRule = useCallback(
    async (ruleId: string) => {
      const candidate = await repairRequirementRuleCandidate(ruleId);
      if (!candidate) return;
      await persistRequirementReviewCandidates({
        ...requirementReviewCandidates,
        [ruleId]: candidate,
      });
      if (candidate.status === "failed") {
        openGenerationResultDialog({
          title: "智能修复失败",
          tone: "destructive",
          message: candidate.errorMessage ?? "当前规则没有完成智能修复。",
          requirementId: candidate.beforeRequirement.id,
          ruleId,
          stageLabel: "需求规则",
          targetLabel:
            rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则",
        });
      }
    },
    [
      openGenerationResultDialog,
      persistRequirementReviewCandidates,
      repairRequirementRuleCandidate,
      requirementReviewCandidates,
      rules,
    ],
  );

  const decideRequirementReviewCandidate = useCallback(
    async (ruleId: string, decision: "accepted" | "rejected") => {
      if (!requirementBaseline) return;
      const candidate = requirementReviewCandidates[ruleId];
      if (!candidate) return;
      const selectedRequirement =
        decision === "accepted" && candidate.afterRequirement
          ? candidate.afterRequirement
          : candidate.beforeRequirement;
      const reviewedRequirement = markRequirementReviewed(selectedRequirement);
      const nextBaseline = mergeReviewedRequirement(
        requirementBaseline,
        reviewedRequirement,
      );
      const nextCandidates = {
        ...requirementReviewCandidates,
        [ruleId]: {
          ...candidate,
          status: decision,
          errorMessage: null,
        },
      };
      try {
        await persistRequirementReviewState(nextBaseline, nextCandidates);
      } catch (error) {
        showRequirementReviewSaveFailure(error, ruleId);
        return;
      }
      openGenerationResultDialog({
        title: decision === "accepted" ? "修复结果已采纳" : "修复结果已拒绝",
        tone: "success",
        message:
          decision === "accepted"
            ? "已保留修复后的需求规则，并标记为已确认。"
            : "已回到修复前的需求规则，并标记为已确认。",
        requirementId: reviewedRequirement.id,
        ruleId,
        stageLabel: "需求规则",
        targetLabel:
          rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则",
      });
    },
    [
      openGenerationResultDialog,
      persistRequirementReviewState,
      requirementBaseline,
      requirementReviewCandidates,
      rules,
      showRequirementReviewSaveFailure,
    ],
  );

  return {
    acceptRequirementAiSuggestions,
    clearRequirementRules,
    confirmRequirementQualityHint,
    createRequirementRule,
    decideRequirementReviewCandidate,
    deleteRequirementRule,
    persistRequirementReviewCandidates,
    rejectRequirementAiSuggestions,
    repairRequirementRule,
    repairRequirementRuleCandidates,
    updateRequirementRule,
  };
}
