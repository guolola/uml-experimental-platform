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
import { i18n } from "../../../shared/i18n/i18n";

type CancelledRunDialogSnapshot = {
  error?: { message?: string } | null;
  runId?: string | null;
};

export function cancelledRunResultDialog(
  snapshot: CancelledRunDialogSnapshot,
  stageLabel: string,
): GenerationResultDialogState {
  return {
    title: i18n.t("generation.dialog.titles.cancelled"),
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
    title: i18n.t("generation.dialog.titles.failed"),
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
        ? i18n.t("generation.dialog.titles.requirementsPartial")
        : input.isRulesOnly
          ? i18n.t("generation.dialog.titles.rulesCompleted")
          : i18n.t("generation.dialog.titles.requirementsCompleted"),
    tone:
      input.qualityHintCount > 0 ||
      input.repairPendingCount > 0 ||
      input.repairFailedCount > 0 ||
      input.diagramFailureCount > 0
        ? "warning"
        : "success",
    message:
      input.repairFailedCount > 0
        ? i18n.t("generation.dialog.repairFailedCount", { count: input.repairFailedCount })
        : input.repairPendingCount > 0
          ? i18n.t("generation.dialog.repairPendingCount", { count: input.repairPendingCount })
          : completedRunResultMessage({
              qualityHintCount: input.qualityHintCount,
              diagramFailureCount: input.diagramFailureCount,
            }),
    runId: input.runId,
    stageLabel: input.isRulesOnly ? i18n.t("generation.dialog.labels.rules") : i18n.t("generation.dialog.labels.requirementModels"),
    targetLabel: input.isRulesOnly ? i18n.t("generation.dialog.labels.currentText") : i18n.t("generation.dialog.labels.selectedRequirementModels"),
  };
}

export function designRunCompletionDialog(input: {
  diagramFailureCount: number;
  qualityHintCount: number;
  runId: string;
}): GenerationResultDialogState {
  return {
    title: input.diagramFailureCount > 0 ? i18n.t("generation.dialog.titles.designPartial") : i18n.t("generation.dialog.titles.designCompleted"),
    tone:
      input.qualityHintCount > 0 || input.diagramFailureCount > 0
        ? "warning"
        : "success",
    message: completedRunResultMessage({
      qualityHintCount: input.qualityHintCount,
      diagramFailureCount: input.diagramFailureCount,
    }),
    runId: input.runId,
    stageLabel: i18n.t("generation.dialog.labels.designModels"),
    targetLabel: i18n.t("generation.dialog.labels.selectedDesignModels"),
  };
}

export function codeRunCompletionDialog(snapshot: {
  changedFileCount?: number;
  generationMode?: "continue" | "regenerate";
  runId?: string | null;
}): GenerationResultDialogState {
  return {
    title: i18n.t("generation.dialog.titles.codeCompleted"),
    tone: "success",
    message:
      snapshot.generationMode === "continue" && snapshot.changedFileCount === 0
        ? i18n.t("generation.dialog.codeNoChanges")
        : snapshot.generationMode === "regenerate"
          ? i18n.t("generation.dialog.codeRegenerated")
          : i18n.t("generation.dialog.codeCompleted"),
    runId: snapshot.runId ?? null,
    stageLabel: i18n.t("generation.dialog.labels.codePrototype"),
    targetLabel: i18n.t("generation.dialog.labels.currentCodePrototype"),
  };
}

export function documentRunCompletionDialog(input: {
  documentTitle: string;
  runId: string;
  missingArtifactCount?: number;
}): GenerationResultDialogState {
  const hasMissingArtifacts = (input.missingArtifactCount ?? 0) > 0;
  return {
    title: hasMissingArtifacts ? i18n.t("generation.dialog.titles.documentMissing") : i18n.t("generation.dialog.titles.documentCompleted"),
    tone: "success",
    message: hasMissingArtifacts
      ? i18n.t("generation.dialog.documentMissing", { title: input.documentTitle, count: input.missingArtifactCount })
      : i18n.t("generation.dialog.documentCompleted", { title: input.documentTitle }),
    runId: input.runId,
    stageLabel: i18n.t("generation.dialog.labels.document"),
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
