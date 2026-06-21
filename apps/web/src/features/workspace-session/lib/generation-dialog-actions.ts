// Owns generation result and confirmation dialog state for the session provider.
import { useCallback, useRef, useState } from "react";
import {
  completedRunResultMessage,
  generationResultDialogGroup,
  type GenerationConfirmationDialogState,
  type GenerationResultDialogState,
} from "../components/generation-dialogs";
import type { GenerationConfirmationSummary } from "./generation-planning";
import { cancelledRunMessage } from "./run-events";

type CancelledRunDialogSnapshot = {
  error?: { message?: string } | null;
  runId?: string | null;
};

export function cancelledRunResultDialog(
  snapshot: CancelledRunDialogSnapshot,
  stageLabel: string,
): GenerationResultDialogState {
  return {
    title: "任务已取消",
    tone: "warning",
    message: cancelledRunMessage(snapshot),
    runId: snapshot.runId ?? null,
    stageLabel,
  };
}

export function failedRunResultDialog(input: {
  details: string[];
  message: string;
  runId: string | null;
  stageLabel: string;
}): GenerationResultDialogState {
  return {
    title: "生成失败",
    tone: "destructive",
    message: input.message,
    details: input.details,
    runId: input.runId,
    stageLabel: input.stageLabel,
  };
}

export function requirementRunCompletionDialog(input: {
  diagramFailureCount: number;
  isRulesOnly: boolean;
  qualityHintCount: number;
  repairFailedCount: number;
  repairPendingCount: number;
  runId: string;
}): GenerationResultDialogState {
  return {
    title:
      input.diagramFailureCount > 0
        ? "需求模型部分生成"
        : input.isRulesOnly
          ? "需求规则已生成"
          : "需求模型已生成",
    tone:
      input.qualityHintCount > 0 ||
      input.repairPendingCount > 0 ||
      input.repairFailedCount > 0 ||
      input.diagramFailureCount > 0
        ? "warning"
        : "success",
    message:
      input.repairFailedCount > 0
        ? `生成完成，但有 ${input.repairFailedCount} 条需求规则修复失败，请重试后确认。`
        : input.repairPendingCount > 0
          ? `生成完成，已生成 ${input.repairPendingCount} 条修复候选，请确认后继续生成模型。`
          : completedRunResultMessage({
              qualityHintCount: input.qualityHintCount,
              diagramFailureCount: input.diagramFailureCount,
            }),
    runId: input.runId,
    stageLabel: input.isRulesOnly ? "需求规则" : "需求模型",
    targetLabel: input.isRulesOnly ? "当前需求文本" : "已选需求模型",
  };
}

export function designRunCompletionDialog(input: {
  diagramFailureCount: number;
  qualityHintCount: number;
  runId: string;
}): GenerationResultDialogState {
  return {
    title: input.diagramFailureCount > 0 ? "设计模型部分生成" : "设计模型已生成",
    tone:
      input.qualityHintCount > 0 || input.diagramFailureCount > 0
        ? "warning"
        : "success",
    message: completedRunResultMessage({
      qualityHintCount: input.qualityHintCount,
      diagramFailureCount: input.diagramFailureCount,
    }),
    runId: input.runId,
    stageLabel: "设计模型",
    targetLabel: "已选设计图",
  };
}

export function codeRunCompletionDialog(snapshot: {
  changedFileCount?: number;
  generationMode?: "continue" | "regenerate";
  runId?: string | null;
}): GenerationResultDialogState {
  return {
    title: "代码原型已生成",
    tone: "success",
    message:
      snapshot.generationMode === "continue" && snapshot.changedFileCount === 0
        ? "本次未产生文件变更。"
        : snapshot.generationMode === "regenerate"
          ? "代码重新生成完成。"
          : "代码生成完成。",
    runId: snapshot.runId ?? null,
    stageLabel: "代码原型",
    targetLabel: "当前代码原型",
  };
}

export function documentRunCompletionDialog(input: {
  documentTitle: string;
  runId: string;
  missingArtifactCount?: number;
}): GenerationResultDialogState {
  const hasMissingArtifacts = (input.missingArtifactCount ?? 0) > 0;
  return {
    title: hasMissingArtifacts ? "说明书已生成但缺图" : "说明书已生成",
    tone: "success",
    message: hasMissingArtifacts
      ? `${input.documentTitle}已生成，但有 ${input.missingArtifactCount} 项图源缺失，请复核后交付。`
      : `${input.documentTitle}已生成。`,
    runId: input.runId,
    stageLabel: "说明书",
    targetLabel: input.documentTitle,
  };
}

export function useGenerationDialogActions() {
  const [generationResultDialog, setGenerationResultDialog] =
    useState<GenerationResultDialogState | null>(null);
  const [generationConfirmationDialog, setGenerationConfirmationDialog] =
    useState<GenerationConfirmationDialogState | null>(null);
  const closedGenerationResultDialogRef = useRef<{
    group: string;
    closedAt: number;
  } | null>(null);

  const openGenerationResultDialog = useCallback(
    (input: GenerationResultDialogState) => {
      const nextGroup = generationResultDialogGroup(input);
      const openedAt = Date.now();
      const isCompletion = input.tone !== "destructive";
      setGenerationResultDialog((current) => {
        const currentGroup = current
          ? generationResultDialogGroup(current)
          : null;
        if (isCompletion && currentGroup === nextGroup) {
          return current;
        }
        const recentlyClosed = closedGenerationResultDialogRef.current;
        if (
          isCompletion &&
          recentlyClosed &&
          recentlyClosed.group === nextGroup &&
          openedAt - recentlyClosed.closedAt < 10_000
        ) {
          return current;
        }
        return input;
      });
    },
    [],
  );

  const closeGenerationResultDialog = useCallback(() => {
    setGenerationResultDialog((current) => {
      if (current) {
        closedGenerationResultDialogRef.current = {
          group: generationResultDialogGroup(current),
          closedAt: Date.now(),
        };
      }
      return null;
    });
  }, []);

  const confirmGeneration = useCallback(
    (summary: GenerationConfirmationSummary) =>
      new Promise<boolean>((resolve) => {
        setGenerationConfirmationDialog((current) => {
          current?.resolve(false);
          return { ...summary, resolve };
        });
      }),
    [],
  );

  const closeGenerationConfirmationDialog = useCallback(
    (confirmed: boolean) => {
      setGenerationConfirmationDialog((current) => {
        current?.resolve(confirmed);
        return null;
      });
    },
    [],
  );

  return {
    closeGenerationConfirmationDialog,
    closeGenerationResultDialog,
    confirmGeneration,
    generationConfirmationDialog,
    generationResultDialog,
    openGenerationResultDialog,
  };
}
