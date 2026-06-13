// Renders generation result and confirmation dialogs used by the workspace session provider.
import { useRef } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { cn } from "../../../shared/ui/utils";
import type { GenerationConfirmationSummary } from "../lib/generation-planning";

export type GenerationResultDialogState = {
  title: string;
  message: string;
  tone: "success" | "warning" | "destructive";
  details?: string[];
  runId?: string | null;
  requirementId?: string | null;
  ruleId?: string | null;
  stageLabel?: string;
  targetLabel?: string | null;
};

export type GenerationConfirmationDialogState =
  GenerationConfirmationSummary & {
    resolve: (confirmed: boolean) => void;
  };

function sanitizeResultDialogCopy(text: string) {
  const cleaned = text
    .replace(/\bREQ-\d+\b/giu, "这条需求")
    .replace(/\bR\d+\b/giu, "这条规则")
    .replace(/\brun[-_a-z0-9]+\b/giu, "本次运行")
    .replace(/\b(runId|requirementId|ruleId|EvidencePackage)\b/giu, "")
    .replace(/\.docx\b/giu, "")
    .replace(/\bAI\b/giu, "智能修复")
    .replace(/\b[A-Za-z][A-Za-z0-9_.:/-]*\b/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([，。；：！？])/g, "$1")
    .replace(/[:：]\s*$/g, "")
    .trim();
  return cleaned || "技术细节已隐藏，请在当前阶段的问题列表查看详情。";
}

function resultDialogMessage(result: GenerationResultDialogState) {
  if (result.tone === "destructive" && /[A-Za-z]/u.test(result.message)) {
    return "生成过程中出现问题，请在当前阶段的问题列表查看详情。";
  }
  return sanitizeResultDialogCopy(result.message);
}

export function completedRunResultMessage({
  qualityHintCount,
  diagramFailureCount,
}: {
  qualityHintCount: number;
  diagramFailureCount: number;
}) {
  const parts: string[] = [];
  if (diagramFailureCount > 0) {
    parts.push(
      `生成已完成，但有 ${diagramFailureCount} 个模型生成失败，可在当前页面查看错误并重试。`,
    );
  } else {
    parts.push("生成完成。");
  }
  if (qualityHintCount > 0) {
    parts.push(`另有 ${qualityHintCount} 项质量提示，可在当前页面查看。`);
  }
  return parts.join(" ");
}

export function generationResultDialogGroup(
  result: GenerationResultDialogState,
) {
  const tone = result.tone === "destructive" ? "failure" : "completion";
  const runKey = result.runId ? `run:${result.runId}` : "";
  const stageKey = sanitizeResultDialogCopy(
    result.stageLabel ?? result.title ?? "生成结果",
  );
  return `${tone}:${runKey || stageKey}`;
}

export function GenerationResultDialog({
  result,
  onClose,
}: {
  result: GenerationResultDialogState | null;
  onClose: () => void;
}) {
  const lastResultRef = useRef<GenerationResultDialogState | null>(null);
  if (result) {
    lastResultRef.current = result;
  }
  const visibleResult = result ?? lastResultRef.current;
  if (!visibleResult) {
    return null;
  }
  const displayTitle = sanitizeResultDialogCopy(visibleResult.title);
  const displayMessage = resultDialogMessage(visibleResult);
  const isFailure = visibleResult.tone === "destructive";
  const Icon = isFailure ? XCircle : CheckCircle2;
  const iconLabel = isFailure ? "操作失败" : "操作成功";

  return (
    <Dialog open={Boolean(result)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[12px] border-border/60 bg-card p-[33px] text-center shadow-lg sm:max-w-[448px] [&_[data-slot=dialog-close]]:hidden">
        <DialogHeader className="items-center gap-0 space-y-0 text-center sm:text-center">
          <div className="mb-6 h-[80px] w-[80px]">
            <div
              aria-label={iconLabel}
              className={cn(
                "relative flex size-[80px] items-center justify-center rounded-full",
                isFailure
                  ? "bg-destructive/10 text-destructive"
                  : "bg-success/10 text-success",
              )}
            >
              <Icon className="size-10" strokeWidth={3} />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 rounded-full border opacity-20",
                  isFailure ? "border-destructive/20" : "border-success/20",
                )}
              />
            </div>
          </div>
          <DialogTitle className="text-center text-[20px] font-semibold leading-[28px] text-foreground">
            {displayTitle}
          </DialogTitle>
          <DialogDescription className="mx-auto mt-2 max-w-[280px] text-center text-[14px] leading-[20px] text-muted-foreground">
            {displayMessage}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 flex-row justify-center gap-3 sm:justify-center">
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-[8px] px-6 text-[14px] font-normal text-muted-foreground hover:bg-muted/60"
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="button"
            className="h-10 rounded-[8px] px-6 text-[14px] font-normal shadow-sm"
            onClick={onClose}
          >
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryGroup({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-[8px] border border-border bg-muted/40 p-3 text-left">
      <div className="text-[13px] font-medium text-foreground">{label}</div>
      <div className="mt-1 text-[13px] leading-5 text-muted-foreground">
        {items.join("、")}
      </div>
    </div>
  );
}

export function GenerationConfirmationDialog({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: GenerationConfirmationDialogState | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirmation) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-[12px] border-border/60 bg-card p-6 shadow-lg sm:max-w-[520px]">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-[20px] font-semibold leading-[28px] text-foreground">
            {confirmation.title}
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-5 text-muted-foreground">
            {confirmation.description}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-3">
          <SummaryGroup
            label="需求规则补齐"
            items={confirmation.ruleDependencyLabels ?? []}
          />
          <SummaryGroup
            label="需求模型补齐/更新"
            items={confirmation.requirementDependencyLabels ?? []}
          />
          <SummaryGroup label="新生成" items={confirmation.newLabels} />
          <SummaryGroup
            label="重新生成"
            items={confirmation.regeneratedLabels}
          />
          <SummaryGroup
            label="设计依赖补齐"
            items={confirmation.dependencyLabels}
          />
          <SummaryGroup label="保留不变" items={confirmation.keptLabels} />
          {(confirmation.ruleDependencyLabels?.length ?? 0) === 0 &&
            (confirmation.requirementDependencyLabels?.length ?? 0) === 0 &&
            confirmation.newLabels.length === 0 &&
            confirmation.regeneratedLabels.length === 0 &&
            confirmation.dependencyLabels.length === 0 && (
              <div className="rounded-[8px] border border-border bg-muted/40 p-3 text-left text-[13px] leading-5 text-muted-foreground">
                本次没有需要生成的模型。
              </div>
            )}
        </div>
        <DialogFooter className="mt-6 flex-row justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-[8px] px-6 text-[14px] font-normal text-muted-foreground hover:bg-muted/60"
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            type="button"
            className="h-10 rounded-[8px] px-6 text-[14px] font-normal shadow-sm"
            onClick={onConfirm}
          >
            确认生成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
