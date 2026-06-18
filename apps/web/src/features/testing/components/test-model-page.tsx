// Builds black-box test cases and coverage links from requirement and design models.
import { useMemo, useState } from "react";
import { ClipboardCheck, Filter, Play, ShieldCheck } from "lucide-react";
import type {
  BlackBoxTestCase,
  DesignDiagramModelSpec,
  ModelElementRef,
  RequirementRule,
  TestCoverageRelation,
  TestGenerationResult,
  TestScenarioType,
  UseCaseDiagramSpec,
  UseCaseEventFlow,
} from "@uml-platform/contracts";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ScaledTable, ScaledToolbar } from "../../../shared/ui/scale-to-fit";
import { SelectControl } from "../../../shared/ui/select";
import { cn } from "../../../shared/ui/utils";
import { useWorkspaceSession } from "../../workspace-session/state";

const SCENARIO_OPTIONS: Array<{ value: TestScenarioType | "all"; label: string }> = [
  { value: "all", label: "全部场景" },
  { value: "normal", label: "正常流程" },
  { value: "alternative", label: "备选流程" },
  { value: "exception", label: "异常流程" },
  { value: "boundary", label: "边界值" },
  { value: "decision-table", label: "判定表" },
];

const scenarioLabel: Record<TestScenarioType, string> = {
  normal: "正常流程",
  alternative: "备选流程",
  exception: "异常流程",
  boundary: "边界值",
  "decision-table": "判定表",
};

type SequenceDesignModel = DesignDiagramModelSpec & {
  diagramKind: "sequence";
  modelId?: string;
  sourceUseCaseId?: string;
  participants: Array<{ id: string; name: string }>;
  messages: Array<{ id: string; name: string }>;
};

function isSequenceDesignModel(
  model: DesignDiagramModelSpec,
): model is SequenceDesignModel {
  return model.diagramKind === "sequence";
}

function formatRuleId(id: string) {
  const match = /^r(\d+)$/i.exec(id.trim());
  return match ? `R${match[1]}` : id.toUpperCase();
}

function priorityForRule(rule?: RequirementRule) {
  if (!rule) return "P2" as const;
  if (rule.category === "异常处理" || rule.category === "业务规则") return "P1" as const;
  if (rule.category === "功能需求" || rule.category === "数据需求") return "P2" as const;
  return "P3" as const;
}

function scenarioFromFlow(flow: UseCaseEventFlow): TestScenarioType {
  if (flow.flowType === "main") return "normal";
  if (flow.flowType === "alternative") return "alternative";
  return "exception";
}

function rulesForUseCase(rules: RequirementRule[], useCase: UseCaseDiagramSpec["useCases"][number]) {
  const haystack = `${useCase.name} ${useCase.goal} ${useCase.description ?? ""}`;
  return rules.filter((rule) => {
    if (rule.relatedDiagrams.includes("usecase")) return true;
    return haystack.includes(rule.text.slice(0, 8));
  });
}

function refsForUseCaseDesign(
  designModels: DesignDiagramModelSpec[],
  useCaseId: string,
): ModelElementRef[] {
  return designModels
    .filter(
      (model): model is SequenceDesignModel =>
        isSequenceDesignModel(model) && model.sourceUseCaseId === useCaseId,
    )
    .flatMap((model) => {
      const modelId = model.modelId ?? `sequence:${useCaseId}`;
      return [
        ...model.participants.map((participant) => ({
          modelId,
          diagramKind: model.diagramKind,
          elementId: participant.id,
          elementKind: "participant",
          label: participant.name,
        })),
        ...model.messages.map((message) => ({
          modelId,
          diagramKind: model.diagramKind,
          elementId: message.id,
          elementKind: "message",
          label: message.name,
        })),
      ] satisfies ModelElementRef[];
    });
}

function fallbackFlow(useCase: UseCaseDiagramSpec["useCases"][number]): UseCaseEventFlow {
  return {
    id: `${useCase.id}:main`,
    name: "主事件流",
    flowType: "main",
    steps: [
      {
        order: 1,
        actor: "actor",
        actorAction: useCase.goal,
        systemAction: useCase.postconditions[0] ?? "系统完成用例目标",
        expectedResult: useCase.postconditions[0] ?? useCase.goal,
      },
    ],
  };
}

function buildTestSteps(flow: UseCaseEventFlow, useCase: UseCaseDiagramSpec["useCases"][number]) {
  const steps = flow.steps.length > 0 ? flow.steps : fallbackFlow(useCase).steps;
  return steps.map((step, index) => ({
    order: index + 1,
    action: step.actorAction ?? step.systemAction ?? `${useCase.name} 第 ${index + 1} 步`,
    expectedResult:
      step.expectedResult ??
      step.systemAction ??
      useCase.postconditions[index] ??
      "系统状态和反馈符合预期",
  }));
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function generateBlackBoxTests(
  rules: RequirementRule[],
  useCaseModel: UseCaseDiagramSpec,
  designModels: DesignDiagramModelSpec[],
): TestGenerationResult {
  const testCases: BlackBoxTestCase[] = [];
  const coverageRelations: TestCoverageRelation[] = [];

  for (const useCase of useCaseModel.useCases) {
    const matchedRules = rulesForUseCase(rules, useCase);
    const flows =
      (useCase.eventFlows?.length ?? 0) > 0 ? useCase.eventFlows : [fallbackFlow(useCase)];
    const designRefs = refsForUseCaseDesign(designModels, useCase.id);

    flows.forEach((flow, flowIndex) => {
      const sourceRule =
        matchedRules.find((rule) =>
          flow.steps.some((step) => step.sourceRequirementId === rule.id),
        ) ?? matchedRules[flowIndex % Math.max(1, matchedRules.length)];
      const testCase: BlackBoxTestCase = {
        id: `tc-${useCase.id}-${flow.id}`.replace(/[^A-Za-z0-9_-]/g, "-"),
        title: `${useCase.name} - ${scenarioLabel[scenarioFromFlow(flow)]} - ${flow.name}`,
        sourceRequirementId: sourceRule?.id,
        sourceRequirementText: sourceRule?.text,
        sourceUseCaseId: useCase.id,
        sourceUseCaseName: useCase.name,
        scenarioType: scenarioFromFlow(flow),
        priority: priorityForRule(sourceRule),
        preconditions: useCase.preconditions,
        testData: uniqueStrings([
          flow.condition,
          flow.trigger,
          sourceRule?.category === "数据需求" ? sourceRule.text : undefined,
        ]),
        steps: buildTestSteps(flow, useCase),
        expectedResults: uniqueStrings([
          ...flow.steps.map((step) => step.expectedResult),
          ...useCase.postconditions,
        ]),
      };
      testCases.push(testCase);
      coverageRelations.push({
        testCaseId: testCase.id,
        requirementIds: uniqueStrings([
          sourceRule?.id,
          ...flow.steps.map((step) => step.sourceRequirementId),
        ]),
        useCaseIds: [useCase.id],
        designModelRefs: designRefs,
        coverageStatus: sourceRule || designRefs.length > 0 ? "covered" : "partially-covered",
        rationale: "由用例事件流、确认需求和用例实现设计自动生成覆盖关系",
      });
    });

    const boundaryRule = matchedRules.find((rule) =>
      ["数据需求", "业务规则", "异常处理"].includes(rule.category),
    );
    if (boundaryRule) {
      const testCase: BlackBoxTestCase = {
        id: `tc-${useCase.id}-boundary`,
        title: `${useCase.name} - 边界值 - ${formatRuleId(boundaryRule.id)}`,
        sourceRequirementId: boundaryRule.id,
        sourceRequirementText: boundaryRule.text,
        sourceUseCaseId: useCase.id,
        sourceUseCaseName: useCase.name,
        scenarioType: "boundary",
        priority: priorityForRule(boundaryRule),
        preconditions: useCase.preconditions,
        testData: [`最小值/最大值/空值/重复值覆盖：${boundaryRule.text}`],
        steps: [
          {
            order: 1,
            action: `按边界条件执行：${useCase.name}`,
            expectedResult: "系统接受合法边界并拒绝非法边界，提示语准确",
          },
        ],
        expectedResults: ["业务规则、数据约束和异常反馈均符合需求"],
      };
      testCases.push(testCase);
      coverageRelations.push({
        testCaseId: testCase.id,
        requirementIds: [boundaryRule.id],
        useCaseIds: [useCase.id],
        designModelRefs: refsForUseCaseDesign(designModels, useCase.id),
        coverageStatus: "covered",
        rationale: "由规则类别和用例前后置条件生成边界值覆盖",
      });
    }
  }

  return { testCases, coverageRelations };
}

export function TestModelPage() {
  const { rules, models, designModels } = useWorkspaceSession();
  const [result, setResult] = useState<TestGenerationResult | null>(null);
  const [scenarioFilter, setScenarioFilter] = useState<TestScenarioType | "all">("all");
  const useCaseModel = models.usecase;
  const blockedReason =
    !useCaseModel || !("useCases" in useCaseModel) || useCaseModel.useCases.length === 0
      ? "需求阶段用例模型缺失，无法生成测试用例"
      : rules.length === 0
        ? "确认需求项缺失，无法建立测试覆盖关系"
        : null;

  const filteredCases = useMemo(() => {
    const cases = result?.testCases ?? [];
    return scenarioFilter === "all"
      ? cases
      : cases.filter((testCase) => testCase.scenarioType === scenarioFilter);
  }, [result, scenarioFilter]);

  const coverageByCase = useMemo(() => {
    return new Map((result?.coverageRelations ?? []).map((item) => [item.testCaseId, item]));
  }, [result]);

  const coveredRequirements = new Set(
    (result?.coverageRelations ?? []).flatMap((item) => item.requirementIds),
  );
  const coveredUseCases = new Set(
    (result?.coverageRelations ?? []).flatMap((item) => item.useCaseIds),
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background">
      <div className="w-full p-4 lg:p-5">
        <div className="mx-auto flex w-full max-w-none flex-col gap-5">
          <header>
            <ScaledToolbar minWidth={520} contentClassName="w-full items-end justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="size-6 text-primary" />
                  <h2 className="text-2xl font-semibold tracking-normal text-foreground lg:text-3xl">
                    测试
                  </h2>
                </div>
                {blockedReason && (
                  <p className="mt-2 text-sm text-destructive">{blockedReason}</p>
                )}
              </div>
              <Button
                type="button"
                className="shrink-0 gap-2"
                disabled={Boolean(blockedReason)}
                onClick={() => {
                  if (!useCaseModel || !("useCases" in useCaseModel)) return;
                  setResult(
                    generateBlackBoxTests(rules, useCaseModel, Object.values(designModels)),
                  );
                }}
              >
                <Play className="size-4" />
                生成测试用例
              </Button>
            </ScaledToolbar>
          </header>

          <div
            data-testid="test-summary-grid"
            className="grid w-full grid-cols-4 gap-2 md:gap-3"
          >
            {[
              ["测试用例", result?.testCases.length ?? 0],
              ["覆盖需求", coveredRequirements.size],
              ["覆盖用例", coveredUseCases.size],
              ["覆盖关系", result?.coverageRelations.length ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-lg border border-border bg-card p-2.5 md:p-4">
                <div className="truncate text-[12px] leading-4 text-muted-foreground md:text-xs">
                  {label}
                </div>
                <div className="mt-1 text-xl font-semibold leading-6 text-foreground md:mt-2 md:text-2xl md:leading-8">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <ScaledToolbar minWidth={540} contentClassName="w-full justify-between gap-4">
                <div className="flex shrink-0 items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">黑盒测试用例</h3>
                  <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
                    {filteredCases.length}
                  </Badge>
                </div>
                <label className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Filter className="size-3.5" />
                  <SelectControl
                    aria-label="按测试场景筛选"
                    value={scenarioFilter}
                    onValueChange={(value) => setScenarioFilter(value as TestScenarioType | "all")}
                    className="h-8 min-w-32 text-sm"
                    size="sm"
                    options={SCENARIO_OPTIONS}
                  />
                </label>
              </ScaledToolbar>
            </div>

            {result ? (
              <div className="max-w-full overflow-hidden">
                <ScaledTable minWidth={920} className="border-collapse text-sm">
                  <thead className="bg-muted/20 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-[28%] border-b border-r border-border px-4 py-4 text-left font-medium">
                        用例
                      </th>
                      <th className="w-[14%] border-b border-r border-border px-4 py-4 text-left font-medium">
                        场景
                      </th>
                      <th className="w-[30%] border-b border-r border-border px-4 py-4 text-left font-medium">
                        步骤与期望
                      </th>
                      <th className="w-[18%] border-b border-r border-border px-4 py-4 text-left font-medium">
                        覆盖
                      </th>
                      <th className="w-[10%] border-b border-border px-4 py-4 text-left font-medium">
                        优先级
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((testCase) => {
                      const coverage = coverageByCase.get(testCase.id);
                      return (
                        <tr key={testCase.id} className="border-b border-border last:border-b-0">
                          <td className="border-r border-border px-4 py-3 align-top">
                            <div className="font-semibold text-foreground">{testCase.title}</div>
                            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                              {testCase.id}
                            </div>
                          </td>
                          <td className="border-r border-border px-4 py-3 align-top">
                            <Badge variant="secondary">{scenarioLabel[testCase.scenarioType]}</Badge>
                          </td>
                          <td className="border-r border-border px-4 py-3 align-top">
                            <div className="space-y-2">
                              {testCase.steps.slice(0, 3).map((step) => (
                                <div key={step.order} className="rounded-md bg-muted/40 px-3 py-2">
                                  <div className="text-xs font-medium text-foreground">
                                    {step.order}. {step.action}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {step.expectedResult}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="border-r border-border px-4 py-3 align-top">
                            <div className="flex flex-wrap gap-1">
                              {(coverage?.requirementIds ?? []).map((id) => (
                                <Badge key={id} variant="outline" className="text-[10px]">
                                  {formatRuleId(id)}
                                </Badge>
                              ))}
                              {(coverage?.useCaseIds ?? []).map((id) => (
                                <Badge key={id} variant="secondary" className="text-[10px]">
                                  {id}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                                testCase.priority === "P1" || testCase.priority === "P0"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {testCase.priority}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ScaledTable>
              </div>
            ) : (
              <div className="flex min-h-72 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                暂无测试用例。
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
