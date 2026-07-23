// Renders the dialog used to create a manual requirement rule.
import { DIAGRAM_ORDER, getDiagramLabel, type DiagramType } from "../../../entities/diagram/model";
import { useTranslation } from "react-i18next";
import {
  RULE_CATEGORY_ORDER,
  type RequirementRule,
} from "../../../entities/requirement-rule/model";
import { Button } from "../../../shared/ui/button";
import { Checkbox } from "../../../shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { SelectControl } from "../../../shared/ui/select";

interface NewRequirementRuleDialogProps {
  canEditRequirements: boolean;
  generating: boolean;
  newRuleCanSubmit: boolean;
  newRuleCategory: RequirementRule["category"];
  newRuleDiagrams: DiagramType[];
  newRuleError: string | null;
  newRuleText: string;
  onCategoryChange: (category: RequirementRule["category"]) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  onTextChange: (text: string) => void;
  onToggleDiagram: (diagram: DiagramType, checked: boolean) => void;
  open: boolean;
}

export function NewRequirementRuleDialog({
  canEditRequirements,
  generating,
  newRuleCanSubmit,
  newRuleCategory,
  newRuleDiagrams,
  newRuleError,
  newRuleText,
  onCategoryChange,
  onOpenChange,
  onSubmit,
  onTextChange,
  onToggleDiagram,
  open,
}: NewRequirementRuleDialogProps) {
  const { t } = useTranslation();
  const categoryKey = (category: RequirementRule["category"]) => ({ "业务规则": "business", "功能需求": "functional", "外部接口": "externalInterface", "界面需求": "interface", "数据需求": "data", "非功能需求": "nonFunctional", "部署需求": "deployment", "异常处理": "exception" } as const)[category];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("requirements.newRule.title")}</DialogTitle>
          <DialogDescription>
            {t("requirements.newRule.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t("requirements.newRule.type")}</span>
            <SelectControl
              value={newRuleCategory}
              onValueChange={(value) =>
                onCategoryChange(value as RequirementRule["category"])
              }
              className="h-9"
              disabled={generating || !canEditRequirements}
              options={RULE_CATEGORY_ORDER.map((category) => ({
                value: category,
                label: t(`requirements.categories.${categoryKey(category)}`),
              }))}
            />
          </label>

          <div className="grid gap-2 text-sm">
            <span className="font-medium">{t("requirements.newRule.models")}</span>
            <div className="grid grid-cols-2 gap-2">
              {DIAGRAM_ORDER.map((diagram) => (
                <label
                  key={`new-rule:${diagram}`}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground"
                >
                  <Checkbox
                    checked={newRuleDiagrams.includes(diagram)}
                    onCheckedChange={(value) =>
                      onToggleDiagram(diagram, Boolean(value))
                    }
                    disabled={generating || !canEditRequirements}
                  />
                  {getDiagramLabel(diagram, t)}
                </label>
              ))}
            </div>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{t("requirements.newRule.text")}</span>
            <textarea
              value={newRuleText}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder={t("requirements.newRule.placeholder")}
              className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
              disabled={generating || !canEditRequirements}
            />
          </label>

          {newRuleError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {newRuleError}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={generating || !newRuleCanSubmit || !canEditRequirements}
          >
            {t("requirements.newRule.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
