// Renders the requirement quality hint and repair confirmation dialog.
import type {
  AtomicRequirement,
  AtomicRequirementField,
  RequirementQualityIssue,
} from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { Badge } from "../../../shared/ui/badge";
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
import {
  REQUIREMENT_FIELD_LABELS,
  REVIEWABLE_REQUIREMENT_FIELDS,
  requirementFieldStatusLabel,
  requirementFieldValue,
  requirementSourceLabel,
  requirementStateTone,
} from "../lib/requirement-review-view-model";

type RequirementFieldProvenanceEntry = [
  AtomicRequirementField,
  NonNullable<AtomicRequirement["fieldProvenance"][AtomicRequirementField]>,
];

export interface RequirementHintDetail {
  candidate: WorkspaceRecord["requirementReviewCandidates"][string] | null;
  fieldEntries: RequirementFieldProvenanceEntry[];
  qualityIssues: RequirementQualityIssue[];
  requirement: AtomicRequirement;
  rowState: string | null;
  rule: RequirementRule;
}

interface RequirementReviewDialogProps {
  generating: boolean;
  onConfirmQualityHint: (ruleId: string) => Promise<void>;
  onDecideReviewCandidate: (
    ruleId: string,
    decision: "accepted" | "rejected",
  ) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onRepairRequirementRule: (ruleId: string) => Promise<void>;
  visibleHintDetail: RequirementHintDetail | null;
}

export function RequirementReviewDialog({
  generating,
  onConfirmQualityHint,
  onDecideReviewCandidate,
  onOpenChange,
  onRepairRequirementRule,
  visibleHintDetail,
}: RequirementReviewDialogProps) {
  const pendingReviewCandidate =
    visibleHintDetail?.candidate?.status === "pending"
      ? visibleHintDetail.candidate
      : null;
  const failedReviewCandidate =
    visibleHintDetail?.candidate?.status === "failed"
      ? visibleHintDetail.candidate
      : null;
  const hasConfirmableQualityHint =
    Boolean(visibleHintDetail) &&
    !pendingReviewCandidate &&
    !failedReviewCandidate &&
    (visibleHintDetail?.rowState === "有待确认提示" ||
      visibleHintDetail?.requirement.status !== "accepted" ||
      (visibleHintDetail?.qualityIssues.length ?? 0) > 0);

  const close = () => onOpenChange(false);

  return (
    <Dialog open={Boolean(visibleHintDetail)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {pendingReviewCandidate ? "需求规则修复确认" : "需求质量提示"}
          </DialogTitle>
          <DialogDescription>
            {pendingReviewCandidate
              ? "对比修复前后的结构化需求，采纳或拒绝后都会标记为已确认。"
              : "查看当前需求的待确认原因；可确认当前提示，或生成修复结果后再采纳/拒绝。"}
          </DialogDescription>
        </DialogHeader>
        {visibleHintDetail && (
          <div className="max-h-[60vh] overflow-auto pr-1">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  {visibleHintDetail.rule.id}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-md px-2 py-1 text-xs",
                    requirementStateTone(visibleHintDetail.rowState),
                  )}
                >
                  {visibleHintDetail.rowState}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {visibleHintDetail.requirement.id}
                </span>
              </div>
              <div className="mt-2 text-foreground">
                {visibleHintDetail.rule.text}
              </div>
            </div>

            {visibleHintDetail.candidate && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  修复前后对比
                </h3>
                {visibleHintDetail.candidate.status === "failed" ? (
                  <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
                    {visibleHintDetail.candidate.errorMessage ??
                      "当前规则修复失败，请重新修复。"}
                  </div>
                ) : (
                  <div className="mt-2 overflow-hidden rounded-lg border border-border">
                    <div className="grid grid-cols-[120px_1fr_1fr] border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                      <div className="px-3 py-2">字段</div>
                      <div className="px-3 py-2">修复前</div>
                      <div className="px-3 py-2">修复后</div>
                    </div>
                    {REVIEWABLE_REQUIREMENT_FIELDS.map((field) => {
                      const beforeValue = requirementFieldValue(
                        visibleHintDetail.candidate!.beforeRequirement,
                        field,
                      );
                      const afterRequirement =
                        visibleHintDetail.candidate!.afterRequirement ??
                        visibleHintDetail.candidate!.beforeRequirement;
                      const afterValue = requirementFieldValue(afterRequirement, field);
                      const changed = beforeValue !== afterValue;
                      return (
                        <div
                          key={field}
                          className="grid grid-cols-[120px_1fr_1fr] border-b border-border last:border-b-0 text-xs leading-5"
                        >
                          <div className="px-3 py-2 font-medium text-foreground">
                            {REQUIREMENT_FIELD_LABELS[field]}
                          </div>
                          <div className="px-3 py-2 text-muted-foreground">
                            {beforeValue || "暂无字段值"}
                          </div>
                          <div
                            className={cn(
                              "px-3 py-2 text-foreground",
                              changed && "bg-success/10 text-success",
                            )}
                          >
                            {afterValue || "暂无字段值"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {visibleHintDetail.candidate.repairRationale && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {visibleHintDetail.candidate.repairRationale}
                  </div>
                )}
                {visibleHintDetail.candidate.blockingReasons.length > 0 && (
                  <div className="mt-2 grid gap-1">
                    {visibleHintDetail.candidate.blockingReasons.map((reason) => (
                      <div
                        key={reason}
                        className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning"
                      >
                        {reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">
                字段来源与待确认项
              </h3>
              <div className="mt-2 grid gap-2">
                {visibleHintDetail.fieldEntries.length > 0 ? (
                  visibleHintDetail.fieldEntries.map(([field, provenance]) => (
                    <div
                      key={field}
                      className="rounded-lg border border-border bg-card px-3 py-2 text-xs leading-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {REQUIREMENT_FIELD_LABELS[field]}
                        </span>
                        <Badge
                          variant="outline"
                          className="rounded-md px-1.5 py-0 text-[10px]"
                        >
                          {requirementSourceLabel(provenance.source)}
                        </Badge>
                        <span className="text-muted-foreground">
                          {requirementFieldStatusLabel(provenance.status)}
                        </span>
                      </div>
                      <div className="mt-1 text-foreground">
                        {requirementFieldValue(
                          visibleHintDetail.requirement,
                          field,
                        ) || "暂无字段值"}
                      </div>
                      {provenance.rationale && (
                        <div className="mt-1 text-muted-foreground">
                          {provenance.rationale}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    暂无字段来源提示。
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">质量提示</h3>
              <div className="mt-2 grid gap-2">
                {visibleHintDetail.qualityIssues.length > 0 ? (
                  visibleHintDetail.qualityIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning"
                    >
                      {issue.message}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    暂无额外质量提示。
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {visibleHintDetail && failedReviewCandidate ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void onRepairRequirementRule(visibleHintDetail.rule.id)}
              disabled={generating}
            >
              重新修复
            </Button>
          ) : null}
          {visibleHintDetail && !visibleHintDetail.candidate ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void onRepairRequirementRule(visibleHintDetail.rule.id)}
              disabled={generating}
            >
              智能修复
            </Button>
          ) : null}
          {visibleHintDetail && hasConfirmableQualityHint ? (
            <Button
              type="button"
              onClick={() =>
                void onConfirmQualityHint(visibleHintDetail.rule.id).then(close)
              }
              disabled={generating}
            >
              确认提示
            </Button>
          ) : null}
          {pendingReviewCandidate && visibleHintDetail ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void onDecideReviewCandidate(
                    visibleHintDetail.rule.id,
                    "rejected",
                  ).then(close)
                }
                disabled={generating}
              >
                拒绝
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void onDecideReviewCandidate(
                    visibleHintDetail.rule.id,
                    "accepted",
                  ).then(close)
                }
                disabled={generating}
              >
                采纳
              </Button>
            </>
          ) : (
            <Button type="button" onClick={close}>
              关闭
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
