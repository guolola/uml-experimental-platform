// Renders requirement model traceability proof dialogs for the authoring page.
import type { Dispatch, SetStateAction } from "react";
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
import type { RequirementModelRepairRecord } from "../lib/requirement-target-view-model";
import { stageRepairCopy } from "../lib/requirement-review-view-model";

export interface RequirementModelRepairResult {
  targetLabel: string;
}

interface RequirementTraceabilityDialogsProps {
  modelRepairResult: RequirementModelRepairResult | null;
  records: RequirementModelRepairRecord[];
  setModelRepairResult: Dispatch<
    SetStateAction<RequirementModelRepairResult | null>
  >;
  setTraceabilityDialogOpen: Dispatch<SetStateAction<boolean>>;
  traceabilityDialogOpen: boolean;
}

export function RequirementTraceabilityDialogs({
  modelRepairResult,
  records,
  setModelRepairResult,
  setTraceabilityDialogOpen,
  traceabilityDialogOpen,
}: RequirementTraceabilityDialogsProps) {
  return (
    <>
      <Dialog
        open={traceabilityDialogOpen}
        onOpenChange={setTraceabilityDialogOpen}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>需求模型追踪证明</DialogTitle>
            <DialogDescription>
              查看需求规则到需求模型元素的覆盖解释；这些内容用于审计和排查，不影响当前页面编辑。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  覆盖证明
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  共 {records.length} 项
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-success/35 bg-success/10 text-success"
              >
                证明已补齐
              </Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5"
                >
                  <div className="text-muted-foreground">
                    问题原因：{stageRepairCopy(record.reason)}
                  </div>
                  <div className="mt-1 text-foreground">
                    补齐方式：{stageRepairCopy(record.repair)}
                  </div>
                  <div className="mt-1 font-medium text-success">
                    证明状态：{record.status}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-8"
                    onClick={() =>
                      setModelRepairResult({ targetLabel: record.targetLabel })
                    }
                  >
                    重新补齐证明
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setTraceabilityDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(modelRepairResult)}
        onOpenChange={(open) => {
          if (!open) setModelRepairResult(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>单项证明补齐完成</DialogTitle>
            <DialogDescription>
              已只重新检查当前需求模型覆盖证明，没有重新生成全部需求模型。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <div>
              <span className="font-medium">阶段：</span>需求模型
            </div>
            <div>
              <span className="font-medium">对象：</span>
              {modelRepairResult?.targetLabel}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setModelRepairResult(null)}>
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
