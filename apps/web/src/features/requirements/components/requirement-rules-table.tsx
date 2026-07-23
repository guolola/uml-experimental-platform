// Renders the requirement rule table, pagination, and inline review-status controls.
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type {
  AtomicRequirement,
  RequirementQualityIssue,
} from "@uml-platform/contracts";
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  RULE_CATEGORY_ORDER,
  type RequirementRule,
} from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { ScaledToolbar } from "../../../shared/ui/scale-to-fit";
import { SelectControl } from "../../../shared/ui/select";
import { cn } from "../../../shared/ui/utils";
import {
  requirementHintCount,
  requirementRowState,
  requirementStateTone,
  reviewCandidateDecisionLabel,
  reviewCandidateStateLabel,
} from "../lib/requirement-review-view-model";

export const REQUIREMENT_RULES_PER_PAGE = 8;
export const ALL_RULE_CATEGORIES = "";

const RULE_PAGE_SIZE_OPTIONS = [8, 12, 20, 50] as const;
const RULE_ROW_CLASS = "h-[46px] md:h-[60px]";

function categoryLabel(category: RequirementRule["category"], t: TFunction) {
  const key = {
    "业务规则": "business",
    "功能需求": "functional",
    "外部接口": "externalInterface",
    "界面需求": "interface",
    "数据需求": "data",
    "非功能需求": "nonFunctional",
    "部署需求": "deployment",
    "异常处理": "exception",
  }[category];
  return t(`requirements.categories.${key}`);
}

function statusLabel(status: string, t: TFunction) {
  const key = {
    "已编辑": "edited",
    "已生成": "generated",
    "已确认": "confirmed",
    "有待确认提示": "pending",
    "存在冲突提示": "conflict",
    "修复失败待重试": "repairFailed",
    "修复结果待确认": "repairPending",
    "已采纳修复": "repairAccepted",
    "已拒绝修复": "repairRejected",
  }[status];
  return key ? t(`requirements.statuses.${key}`) : status;
}

export type RequirementRuleCategoryFilter =
  | RequirementRule["category"]
  | typeof ALL_RULE_CATEGORIES;

interface RequirementRulesTableProps {
  canEditRequirements: boolean;
  currentRulePage: number;
  deleteRequirementRule: (id: string) => void;
  editBlockedReason: string;
  emptyRuleSlots: number;
  filteredRules: RequirementRule[];
  firstRuleIndex: number;
  generating: boolean;
  lastRuleIndex: number;
  onAddRule: () => void;
  onOpenHintDetail: (ruleId: string) => void;
  pagedRules: RequirementRule[];
  qualityIssuesByRequirementId: Map<string, RequirementQualityIssue[]>;
  query: string;
  requirementByRuleId: Map<string, AtomicRequirement>;
  requirementReviewCandidates: WorkspaceRecord["requirementReviewCandidates"];
  ruleCategoryFilter: RequirementRuleCategoryFilter;
  rulePageSize: number;
  rulesCount: number;
  safeRulePage: number;
  setCurrentRulePage: Dispatch<SetStateAction<number>>;
  setQuery: (query: string) => void;
  setRuleCategoryFilter: (filter: RequirementRuleCategoryFilter) => void;
  setRulePageSize: (pageSize: number) => void;
  totalRulePages: number;
  updateRequirementRule: (id: string, patch: Partial<RequirementRule>) => void;
}

export function RequirementRulesTable({
  canEditRequirements,
  currentRulePage,
  deleteRequirementRule,
  editBlockedReason,
  emptyRuleSlots,
  filteredRules,
  firstRuleIndex,
  generating,
  lastRuleIndex,
  onAddRule,
  onOpenHintDetail,
  pagedRules,
  qualityIssuesByRequirementId,
  query,
  requirementByRuleId,
  requirementReviewCandidates,
  ruleCategoryFilter,
  rulePageSize,
  rulesCount,
  safeRulePage,
  setCurrentRulePage,
  setQuery,
  setRuleCategoryFilter,
  setRulePageSize,
  totalRulePages,
  updateRequirementRule,
}: RequirementRulesTableProps) {
  const { t } = useTranslation();
  return (
    <section className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="min-w-0 max-w-full overflow-hidden border-b border-border bg-muted/40 px-3 py-3 md:px-6 md:py-6">
        <div
          data-testid="requirement-rules-toolbar"
          className="flex min-w-0 items-center justify-between gap-2 md:gap-8"
        >
          <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
            <div className="flex items-center gap-1.5 md:gap-2">
              <ListChecks className="size-4 text-primary md:size-5" />
              <h2 className="text-base font-semibold tracking-normal text-foreground md:text-xl">
                {t("requirements.table.title")}
              </h2>
            </div>
            <Badge
              variant="secondary"
              className="rounded-full border-0 px-2 py-0.5 font-mono text-[11px] font-bold md:px-2.5 md:text-xs"
            >
              {rulesCount}
            </Badge>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 md:shrink-0 md:gap-4">
            <div className="relative min-w-[78px] flex-1 md:w-64 md:flex-none">
              <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground md:left-3 md:size-3.5" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("requirements.table.search")}
                className="h-8 rounded-lg bg-background pl-7 text-[12px] md:h-9 md:pl-9 md:text-sm"
              />
            </div>
            <SelectControl
              value={ruleCategoryFilter}
              onValueChange={(value) =>
                setRuleCategoryFilter(value as RequirementRuleCategoryFilter)
              }
              className="h-8 w-[78px] shrink-0 rounded-lg bg-background px-2 text-[12px] md:h-9 md:w-36 md:text-sm"
              aria-label={t("requirements.table.categoryFilter")}
              options={[
                { value: ALL_RULE_CATEGORIES, label: t("requirements.table.allCategories") },
                ...RULE_CATEGORY_ORDER.map((category) => ({
                  value: category,
                  label: categoryLabel(category, t),
                })),
              ]}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 rounded-lg bg-background px-2 text-[12px] md:h-9 md:px-4 md:text-sm"
              onClick={onAddRule}
              disabled={generating || !canEditRequirements}
              title={!canEditRequirements ? editBlockedReason : undefined}
            >
              <Plus className="size-3.5" />
              <span className="hidden min-[520px]:inline">{t("requirements.table.add")}</span>
            </Button>
          </div>
        </div>
      </div>
      <div className="w-full min-w-0 max-w-full overflow-hidden">
        <table
          data-testid="requirement-rules-compact-table"
          className="w-full table-fixed border-collapse bg-card text-[12px] md:text-sm"
        >
          <thead className="text-[11px] tracking-normal text-muted-foreground md:text-xs md:tracking-[0.02em]">
            <tr className="border-b border-border">
              <th className="w-[32px] px-1.5 py-2 text-center font-medium md:w-[84px] md:px-6 md:py-4">
                {t("requirements.table.id")}
              </th>
              <th className="w-[112px] px-1.5 py-2 text-center font-medium md:w-48 md:px-4 md:py-4">
                {t("requirements.table.type")}
              </th>
              <th className="w-[84px] px-1.5 py-2 text-left font-medium md:w-52 md:px-4 md:py-4">
                {t("requirements.table.status")}
              </th>
              <th className="px-1.5 py-2 text-left font-medium md:px-6 md:py-4">
                {t("requirements.table.content")}
              </th>
              <th className="w-[28px] px-1 py-2 text-center font-medium md:w-28 md:px-6 md:py-4">
                {t("requirements.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.length === 0 ? (
              <tr
                data-testid="requirement-rule-row-slot"
                className={cn(RULE_ROW_CLASS, "border-b border-border")}
              >
                <td
                  colSpan={5}
                  className="px-3 py-2 text-center align-middle text-[12px] text-muted-foreground md:px-6 md:py-3 md:text-sm"
                >
                  {t("requirements.table.noMatches")}
                </td>
              </tr>
            ) : (
              pagedRules.map((rule) => {
                const requirement = requirementByRuleId.get(rule.id);
                const qualityIssues = requirement
                  ? (qualityIssuesByRequirementId.get(requirement.id) ?? [])
                  : [];
                const rowState = requirement
                  ? requirementRowState(requirement, qualityIssues)
                  : t("requirements.table.edited");
                const candidate = requirementReviewCandidates[rule.id];
                const displayRowState = reviewCandidateStateLabel(
                  candidate,
                  rowState,
                );
                const reviewDecisionLabel =
                  reviewCandidateDecisionLabel(candidate);
                const hintCount =
                  requirementHintCount(requirement) + qualityIssues.length;
                const hasHintDetails = Boolean(
                  requirement && (hintCount > 0 || candidate),
                );
                const statusContent = displayRowState ? (
                  <>
                    <Badge
                      variant="outline"
                      className={cn(
                        "max-w-full rounded-md px-1 py-0.5 text-[10px] md:max-w-[112px] md:px-2 md:py-1 md:text-xs",
                        candidate?.status === "failed"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : requirementStateTone(displayRowState),
                      )}
                    >
                      <span className="truncate">{statusLabel(displayRowState, t)}</span>
                    </Badge>
                    {reviewDecisionLabel && (
                      <Badge
                        variant="success"
                        className="shrink-0 rounded-md px-1 py-0.5 text-[10px] md:px-1.5 md:text-[11px]"
                      >
                        {statusLabel(reviewDecisionLabel, t)}
                      </Badge>
                    )}
                    {hintCount > 0 && (
                      <Badge
                        variant="warning"
                        className="shrink-0 rounded-md px-1 py-0.5 text-[10px] md:px-1.5 md:text-[11px]"
                      >
                        {t("requirements.itemCount", { count: hintCount })}
                      </Badge>
                    )}
                  </>
                ) : null;
                return (
                  <tr
                    key={rule.id}
                    id={`rule-${rule.id}`}
                    data-testid="requirement-rule-row-slot"
                    className={cn(
                      RULE_ROW_CLASS,
                      "border-b border-border transition-colors hover:bg-muted/30",
                    )}
                  >
                    <td className="px-1.5 py-2 text-center align-middle md:px-6 md:py-3">
                      <span className="font-mono text-[11px] uppercase text-muted-foreground md:text-xs">
                        {rule.id}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 text-center align-middle md:px-4 md:py-3">
                      <SelectControl
                        value={rule.category}
                        onValueChange={(value) =>
                          canEditRequirements
                            ? updateRequirementRule(rule.id, {
                                category: value as RequirementRule["category"],
                              })
                            : undefined
                        }
                        className="mx-auto h-7 w-auto min-w-[6.5rem] max-w-full rounded-md bg-background px-2 text-[11px] *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:justify-center md:h-8 md:text-xs"
                        contentClassName="min-w-[8rem]"
                        aria-label={t("requirements.table.categoryAria", { id: rule.id })}
                        disabled={generating || !canEditRequirements}
                        options={RULE_CATEGORY_ORDER.map((category) => ({
                          value: category,
                          label: categoryLabel(category, t),
                        }))}
                      />
                    </td>
                    <td className="px-1.5 py-2 align-middle md:px-4 md:py-3">
                      <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap md:gap-1.5">
                        {hasHintDetails ? (
                          <button
                            type="button"
                            className="inline-flex min-w-0 items-center gap-1 overflow-hidden rounded-md text-left transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40 md:gap-1.5"
                            aria-label={t("requirements.table.hintAria", { id: rule.id })}
                            onClick={() => onOpenHintDetail(rule.id)}
                          >
                            {statusContent}
                          </button>
                        ) : (
                          statusContent
                        )}
                      </div>
                    </td>
                    <td className="min-w-0 px-1.5 py-2 align-middle md:px-6 md:py-3">
                      <input
                        type="text"
                        value={rule.text}
                        onChange={(event) =>
                          canEditRequirements
                            ? updateRequirementRule(rule.id, {
                                text: event.target.value,
                              })
                            : undefined
                        }
                        className="h-7 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-0 text-[12px] text-foreground outline-none transition-colors hover:border-border hover:bg-background focus:border-primary/60 focus:bg-background focus:px-1 focus:ring-2 focus:ring-primary/15 md:h-8 md:text-sm md:focus:px-2"
                        disabled={generating || !canEditRequirements}
                        title={
                          !canEditRequirements ? editBlockedReason : rule.text
                        }
                      />
                    </td>
                    <td className="px-1 py-2 text-center align-middle md:px-6 md:py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mx-auto h-7 px-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive md:h-8 md:px-2"
                        onClick={() => deleteRequirementRule(rule.id)}
                        disabled={generating || !canEditRequirements}
                        title={
                          !canEditRequirements ? editBlockedReason : undefined
                        }
                        aria-label={t("requirements.table.deleteAria", { id: rule.id })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
            {Array.from({
              length:
                filteredRules.length === 0
                  ? Math.max(0, rulePageSize - 1)
                  : emptyRuleSlots,
            }).map((_, index) => (
              <tr
                key={`empty-rule-slot:${safeRulePage}:${index}`}
                data-testid="requirement-rule-row-slot"
                aria-hidden="true"
                className={cn(RULE_ROW_CLASS, "border-b border-border")}
              >
                <td colSpan={5} className="px-3 py-2 md:px-6 md:py-3">
                  &nbsp;
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ScaledToolbar
        data-testid="requirement-rule-pagination"
        minWidth={650}
        className="sticky bottom-0 z-10 border-t border-border bg-muted/95 px-6 py-4 text-xs text-muted-foreground shadow-lg backdrop-blur"
        contentClassName="w-full justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span>
            {firstRuleIndex}-{lastRuleIndex} / {filteredRules.length}
          </span>
          <SelectControl
            value={String(rulePageSize)}
            onValueChange={(value) => {
              setRulePageSize(Number(value));
              setCurrentRulePage(1);
            }}
            className="h-8 w-28 rounded-md bg-background text-xs"
            contentClassName="min-w-[7rem]"
            aria-label={t("requirements.table.pageSizeAria")}
            options={RULE_PAGE_SIZE_OPTIONS.map((pageSize) => ({
              value: String(pageSize),
              label: t("requirements.table.pageSize", { count: pageSize }),
            }))}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label={t("requirements.table.previous")}
            onClick={() => setCurrentRulePage((page) => Math.max(1, page - 1))}
            disabled={currentRulePage === 1 || safeRulePage === 1}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          {Array.from({ length: totalRulePages }, (_, index) => index + 1).map(
            (page) => (
              <button
                type="button"
                key={page}
                onClick={() => setCurrentRulePage(page)}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                  page === safeRulePage
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {page}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label={t("requirements.table.next")}
            onClick={() =>
              setCurrentRulePage((page) => Math.min(totalRulePages, page + 1))
            }
            disabled={safeRulePage === totalRulePages}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </ScaledToolbar>
    </section>
  );
}
