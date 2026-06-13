// Owns billing entitlement blocker state and result dialog copy for generation actions.
import { useCallback, useState } from "react";
import type { BillingEntitlementErrorResponse } from "@uml-platform/contracts";
import type { GenerationResultDialogState } from "../components/generation-dialogs";
import {
  billingEntitlementDialogDetails,
  billingEntitlementDialogTitle,
} from "./billing-entitlement";

export function useBillingGenerationBlock(
  openGenerationResultDialog: (state: GenerationResultDialogState) => void,
) {
  const [billingGenerationBlock, setBillingGenerationBlock] =
    useState<BillingEntitlementErrorResponse | null>(null);

  const clearBillingGenerationBlock = useCallback(() => {
    setBillingGenerationBlock(null);
  }, []);

  const openBillingEntitlementDialog = useCallback(
    (
      block: BillingEntitlementErrorResponse,
      input: { runId?: string | null; stageLabel: string },
    ) => {
      setBillingGenerationBlock(block);
      openGenerationResultDialog({
        title: billingEntitlementDialogTitle(block),
        tone: block.reason === "negative_balance" ? "destructive" : "warning",
        message: block.message,
        details: billingEntitlementDialogDetails(block),
        runId: input.runId,
        stageLabel: input.stageLabel,
        targetLabel: "生成权益",
      });
    },
    [openGenerationResultDialog],
  );

  return {
    billingGenerationBlock,
    clearBillingGenerationBlock,
    openBillingEntitlementDialog,
  };
}
