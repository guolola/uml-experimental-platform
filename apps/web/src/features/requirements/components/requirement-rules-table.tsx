// Renders the requirement rule table, pagination, and inline review-status controls.
import type { Dispatch, SetStateAction } from "react";
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
import { RULE_CATEGORY_ORDER, type RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { ScaledTable, ScaledToolbar } from "../../../shared/ui/scale-to-fit";
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
const RULE_ROW_CLASS = "h-[60px]";

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
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/40 px-6 py-6">
        <ScaledToolbar minWidth={790} contentClassName="w-full justify-between gap-8">
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <ListChecks className="size-5 text-primary" />
              <h2 className="text-xl font-semibold tracking-normal text-foreground">
                需求规则
              </h2>
            </div>
            <Badge
              variant="secondary"
              className="rounded-full border-0 px-2.5 py-0.5 font-mono text-xs font-bold"
            >
              {rulesCount}
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索规则..."
                className="h-9 rounded-lg bg-background pl-9 text-sm"
              />
            </div>
            <SelectControl
              value={ruleCategoryFilter}
              onValueChange={(value) =>
                setRuleCategoryFilter(value as RequirementRuleCategoryFilter)
              }
              className="h-9 w-36 rounded-lg bg-background text-sm"
              aria-label="需求类型筛选"
              options={[
                { value: ALL_RULE_CATEGORIES, label: "全部类型" },
                ...RULE_CATEGORY_ORDER.map((category) => ({
                  value: category,
                  label: category,
                })),
              ]}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 rounded-lg bg-background px-4"
              onClick={onAddRule}
              disabled={generating || !canEditRequirements}
              title={!canEditRequirements ? editBlockedReason : undefined}
            >
              <Plus className="size-3.5" /> 新增需求项
            </Button>
          </div>
        </ScaledToolbar>
      </div>
      <div className="max-w-full overflow-hidden">
        <ScaledTable minWidth={960} className="table-fixed border-collapse bg-card text-sm">
          <thead className="text-xs tracking-[0.02em] text-muted-foreground">
            <tr className="border-b border-border">
              <th className="w-[84px] px-6 py-4 text-left font-medium">编号</th>
              <th className="w-48 px-4 py-4 text-left font-medium">类型</th>
              <th className="w-52 px-4 py-4 text-left font-medium">状态</th>
              <th className="px-6 py-4 text-left font-medium">
                需求文本内容（可编辑）
              </th>
              <th className="w-28 px-6 py-4 text-right font-medium">操作</th>
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
                  className="px-6 py-3 text-center align-middle text-sm text-muted-foreground"
                >
                  没有匹配的规则。
                </td>
              </tr>
            ) : (
              pagedRules.map((rule) => {
                const requirement = requirementByRuleId.get(rule.id);
                const qualityIssues = requirement
                  ? qualityIssuesByRequirementId.get(requirement.id) ?? []
                  : [];
                const rowState = requirementRowState(requirement, qualityIssues);
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
                        "max-w-[112px] rounded-md px-2 py-1 text-xs",
                        candidate?.status === "failed"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : requirementStateTone(displayRowState),
                      )}
                    >
                      <span className="truncate">{displayRowState}</span>
                    </Badge>
                    {reviewDecisionLabel && (
                      <Badge
                        variant="success"
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px]"
                      >
                        {reviewDecisionLabel}
                      </Badge>
                    )}
                    {hintCount > 0 && (
                      <Badge
                        variant="warning"
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px]"
                      >
                        {hintCount}项
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
                    <td className="px-6 py-3 align-middle">
                      <span className="font-mono text-xs uppercase text-muted-foreground">
                        {rule.id}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <SelectControl
                        value={rule.category}
                        onValueChange={(value) =>
                          canEditRequirements
                            ? updateRequirementRule(rule.id, {
                                category: value as RequirementRule["category"],
                              })
                            : undefined
                        }
                        className="h-8 w-full rounded-md bg-background text-xs"
                        contentClassName="min-w-[8rem]"
                        aria-label={`需求类型 ${rule.id}`}
                        disabled={generating || !canEditRequirements}
                        options={RULE_CATEGORY_ORDER.map((category) => ({
                          value: category,
                          label: category,
                        }))}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {displayRowState && (
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                          {hasHintDetails ? (
                            <button
                              type="button"
                              className="inline-flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md text-left transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
                              aria-label={`需求提示详情 ${rule.id}`}
                              onClick={() => onOpenHintDetail(rule.id)}
                            >
                              {statusContent}
                            </button>
                          ) : (
                            statusContent
                          )}
                        </div>
                      )}
                    </td>
                    <td className="min-w-0 px-6 py-3 align-middle">
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
                        className="h-8 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-0 text-sm text-foreground outline-none transition-colors hover:border-border hover:bg-background focus:border-primary/60 focus:bg-background focus:px-2 focus:ring-2 focus:ring-primary/15"
                        disabled={generating || !canEditRequirements}
                        title={!canEditRequirements ? editBlockedReason : rule.text}
                      />
                    </td>
                    <td className="px-6 py-3 text-right align-middle">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => deleteRequirementRule(rule.id)}
                        disabled={generating || !canEditRequirements}
                        title={!canEditRequirements ? editBlockedReason : undefined}
                        aria-label={`删除需求项 ${rule.id}`}
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
                <td colSpan={5} className="px-6 py-3">
                  &nbsp;
                </td>
              </tr>
            ))}
          </tbody>
        </ScaledTable>
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
            aria-label="每页需求规则数量"
            options={RULE_PAGE_SIZE_OPTIONS.map((pageSize) => ({
              value: String(pageSize),
              label: `每页 ${pageSize} 条`,
            }))}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="上一页"
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
            aria-label="下一页"
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
