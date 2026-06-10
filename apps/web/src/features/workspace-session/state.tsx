import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { billingEntitlementErrorResponseSchema } from "@uml-platform/contracts";
import type {
  BillingEntitlementErrorResponse,
  DocumentKind,
  DocumentStyleSettings,
  DocumentRunSnapshot,
  DesignModelTraceabilityEntry,
  DesignDiagramModelSpec,
  DiagramModelSpec,
  ModelElementRef,
  RequirementModelTraceabilityEntry,
  RequirementBaseline,
  AtomicRequirement,
  AtomicRequirementField,
  RequirementQualityReport,
  RequirementQualityIssue,
  RunEvent,
} from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_ORDER,
  DESIGN_DIAGRAM_META,
  DIAGRAM_ORDER,
  DIAGRAM_META,
  getDesignModelId,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../entities/diagram/model";
import type {
  ManualModelEditStatus,
  WorkspaceRecord,
  WorkspaceCodeRunSnapshot,
  WorkspaceDesignRunSnapshot,
  WorkspaceRunSnapshot,
} from "../../entities/workspace/model";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import {
  createStartCodeRunInput,
  createStartDesignRunInput,
  createStartDocumentRunInput,
  createStartRunInput,
  useWorkspaceRepository,
} from "../../services/workspace-repository";
import {
  isCodeRunSnapshot,
  isDesignRunSnapshot,
  isDocumentRunSnapshot,
  type RunHistoryItem,
  type RunHistorySnapshot,
} from "../history";
import { useRunController } from "./run-controller";
import type {
  GenerationTask,
  GenerationTaskKind,
  RunMode,
  WorkspaceSessionState,
} from "./model/session-state";
import {
  notifyGenerationCompleted,
  notifyGenerationFailed,
  notifyGenerationResultStale,
  notifyGenerationStarted,
} from "./lib/notifications";
import { createEmptyRunUiState } from "./lib/run-ui-state";
import {
  designInputFingerprint,
  normalizeDesignInputFingerprint,
  normalizeSnapshotFingerprint,
  snapshotInputFingerprint,
} from "./lib/fingerprint";
import {
  appendDiagnosticStream,
  createEmptyDiagnostics,
  getProgressFromEvent,
  isMeaningfulLlmChunkEvent,
  shouldDisplayDiagnosticEvent,
  summarizeEvent,
} from "./lib/diagnostics";
import {
  addLocalFailureToDiagnostics,
  assignTaskRunId,
  createClientTaskId,
  createGenerationTask,
  isTaskActive,
  updateTaskFromEvent,
} from "./lib/generation-tasks";
import { designSnapshotToMaps, snapshotToMaps } from "./lib/snapshot-maps";
import { useRequirementsSlice } from "./slices/requirements-slice";
import { useDiagramsSlice } from "./slices/diagrams-slice";
import { useDesignSlice } from "./slices/design-slice";
import { useCodeSlice } from "./slices/code-slice";
import { useRunDiagnosticsSlice } from "./slices/run-diagnostics-slice";
import { Button } from "../../shared/ui/button";
import { cn } from "../../shared/ui/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/dialog";
import { ApiClientError } from "../../services/api-client";

const WorkspaceSessionContext = createContext<WorkspaceSessionState | null>(
  null,
);

type GenerationResultDialogState = {
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

type GenerationConfirmationSummary = {
  title: string;
  description: string;
  ruleDependencyLabels?: string[];
  requirementDependencyLabels?: string[];
  newLabels: string[];
  regeneratedLabels: string[];
  dependencyLabels: string[];
  keptLabels: string[];
};

type GenerationConfirmationDialogState = GenerationConfirmationSummary & {
  resolve: (confirmed: boolean) => void;
};

function orderedRequirementDiagrams(diagrams: DiagramType[]) {
  const set = new Set(diagrams);
  return DIAGRAM_ORDER.filter((diagram) => set.has(diagram));
}

function orderedDesignDiagrams(diagrams: DesignDiagramType[]) {
  const set = new Set(diagrams);
  return DESIGN_DIAGRAM_ORDER.filter((diagram) => set.has(diagram));
}

function requirementLabels(diagrams: DiagramType[]) {
  return orderedRequirementDiagrams(diagrams).map(
    (diagram) => DIAGRAM_META[diagram].label,
  );
}

function diagramLabels(diagrams: DiagramType[]) {
  return requirementLabels(diagrams);
}

function requirementInputFingerprintFor(
  requirementText: string,
  rules: RequirementRule[],
) {
  return snapshotInputFingerprint({ requirementText, rules });
}

function designInputFingerprintFor(
  requirementModels: DiagramModelSpec[],
  requirementModelTraceability: RequirementModelTraceabilityEntry[],
) {
  return designInputFingerprint(
    requirementModels,
    requirementModelTraceability,
  );
}

function fingerprintMatches(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return normalizeSnapshotFingerprint(storedFingerprint) === currentFingerprint;
}

function designFingerprintMatches(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return (
    normalizeDesignInputFingerprint(storedFingerprint) === currentFingerprint
  );
}

function currentDesignClassFingerprint(
  designModels: WorkspaceRecord["designModels"],
  designInputFingerprints: WorkspaceRecord["designInputFingerprints"],
) {
  const classModel = Object.values(designModels).find(
    (model) => model.diagramKind === "class",
  );
  return classModel
    ? (designInputFingerprints[getDesignModelId(classModel)] ??
        designInputFingerprints.class)
    : designInputFingerprints.class;
}

function extractUseCasesFromRequirementModel(model: DiagramModelSpec | undefined) {
  if (!model || model.diagramKind !== "usecase" || !("useCases" in model)) {
    return [];
  }
  return Array.isArray(model.useCases) ? model.useCases : [];
}

function analysisSourceUseCaseId(model: DiagramModelSpec) {
  if (model.diagramKind !== "analysis") return null;
  const explicit =
    "sourceUseCaseId" in model && typeof model.sourceUseCaseId === "string"
      ? model.sourceUseCaseId.trim()
      : "";
  if (explicit) return explicit;
  const modelId =
    "modelId" in model && typeof model.modelId === "string"
      ? model.modelId.trim()
      : "";
  return modelId.startsWith("analysis:")
    ? modelId.slice("analysis:".length)
    : null;
}

function missingAnalysisUseCaseIds(models: WorkspaceRecord["models"]) {
  const useCases = extractUseCasesFromRequirementModel(models.usecase);
  if (useCases.length === 0) return [];
  const covered = new Set(
    Object.values(models)
      .filter((model): model is DiagramModelSpec => Boolean(model))
      .map(analysisSourceUseCaseId)
      .filter((id): id is string => Boolean(id)),
  );
  return useCases
    .filter((useCase) => !covered.has(useCase.id))
    .map((useCase) => useCase.id);
}

function analysisTargetUseCaseIdsForRun(
  diagrams: DiagramType[],
  models: WorkspaceRecord["models"],
) {
  if (!diagrams.includes("analysis") || diagrams.includes("usecase")) {
    return [];
  }
  return missingAnalysisUseCaseIds(models);
}

function sequenceModelsCoverUseCases(
  designModels: WorkspaceRecord["designModels"],
  useCaseModel: DiagramModelSpec | undefined,
) {
  const useCases = extractUseCasesFromRequirementModel(useCaseModel);
  if (useCases.length === 0) return false;
  const covered = new Set(
    Object.values(designModels)
      .filter((model) => model.diagramKind === "sequence")
      .map((model) =>
        "sourceUseCaseId" in model && typeof model.sourceUseCaseId === "string"
          ? model.sourceUseCaseId
          : null,
      )
      .filter((id): id is string => Boolean(id)),
  );
  return useCases.every((useCase) => covered.has(useCase.id));
}

function shouldRefreshRunSnapshotFromEvent(event: RunEvent) {
  if (
    event.type === "artifact_ready" &&
    (event.artifactKind === "model" ||
      event.artifactKind === "plantuml" ||
      event.artifactKind === "svg")
  ) {
    return Boolean(event.diagramKind || event.modelId);
  }
  return (
    event.type === "stage_progress" &&
    event.subtaskStatus === "failed" &&
    Boolean(event.diagramKind || event.modelId)
  );
}

function isTerminalRunEvent(event: RunEvent) {
  return (
    event.type === "completed" ||
    event.type === "failed" ||
    event.type === "cancelled"
  );
}

function statusFromRunEvent(event: RunEvent) {
  if (event.type === "queued") return "queued";
  if (event.type === "failed") return "failed";
  if (event.type === "completed") return "completed";
  if (event.type === "cancelled") return "cancelled";
  return "running";
}

function runErrorMessage(snapshot?: { error?: { message?: string } | null }) {
  return snapshot?.error?.message ?? null;
}

function cancelledRunMessage(snapshot?: {
  error?: { message?: string } | null;
}) {
  return runErrorMessage(snapshot) ?? "任务已取消";
}

function parseBillingEntitlementError(
  error: unknown,
): BillingEntitlementErrorResponse | null {
  if (!(error instanceof ApiClientError)) return null;
  const runError = error.error;
  if (!runError || runError.category !== "user_entitlement") return null;
  const billing = runError.details?.billing;
  if (!billing || typeof billing !== "object") return null;
  const parsed = billingEntitlementErrorResponseSchema.safeParse({
    message: runError.message,
    ...(billing as Record<string, unknown>),
  });
  return parsed.success ? parsed.data : null;
}

function billingEntitlementDialogTitle(block: BillingEntitlementErrorResponse) {
  if (block.reason === "pass_daily_limit") return "通行卡今日次数已用完";
  if (block.reason === "negative_balance") return "权益余额异常";
  return "需要开通生成权益";
}

function billingEntitlementDialogDetails(
  block: BillingEntitlementErrorResponse,
) {
  const details = [`可用次数：${block.billingSummary.creditBalance}`];
  const dailyLimit = block.billingSummary.passDailyUsage.limit;
  const usedToday = block.billingSummary.passDailyUsage.usedToday;
  if (block.billingSummary.activePass) {
    details.push(`通行卡今日使用：${usedToday}/${dailyLimit}`);
  }
  details.push(block.payCta.label);
  return details;
}

function designLabels(diagrams: DesignDiagramType[]) {
  return orderedDesignDiagrams(diagrams).map(
    (diagram) => DESIGN_DIAGRAM_META[diagram].label,
  );
}

const DESIGN_REQUIREMENT_SOURCE_MAP: Record<DesignDiagramType, DiagramType[]> =
  {
    sequence: ["usecase", "analysis"],
    activity: ["prototype"],
    class: ["class"],
    deployment: ["deployment"],
    table: ["class"],
  };

type RequirementAutoUpstreamPlan = {
  needsRulesRun: boolean;
  rulesRunMode: "none" | "replace" | "merge";
  ruleMappingDiagrams: DiagramType[];
  requestedDiagrams: DiagramType[];
  effectiveDiagrams: DiagramType[];
  dependencyDiagrams: DiagramType[];
};

type RunGenerationOptions = {
  suppressSuccessDialog?: boolean;
  skipRuleRepairCandidates?: boolean;
};

type ApplyRunSnapshotOptions = {
  preserveRuleReviewState?: boolean;
};

type DesignRequirementContext = {
  requirementBaseline: RequirementBaseline;
  requirementModels: DiagramModelSpec[];
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  rules: RequirementRule[];
};

function hasRequirementModelKind(
  models: WorkspaceRecord["models"] | DiagramModelSpec[],
  diagram: DiagramType,
) {
  const values = Array.isArray(models) ? models : Object.values(models);
  return values.some((model) => model?.diagramKind === diagram);
}

function planRequirementAutoUpstream(input: {
  requestedDiagrams: DiagramType[];
  existingModels: WorkspaceRecord["models"];
  rules: RequirementRule[];
}) {
  const requestedDiagrams = orderedRequirementDiagrams(input.requestedDiagrams);
  const dependencyDiagrams = new Set<DiagramType>();
  if (
    requestedDiagrams.includes("analysis") &&
    !hasRequirementModelKind(input.existingModels, "usecase") &&
    !requestedDiagrams.includes("usecase")
  ) {
    dependencyDiagrams.add("usecase");
  }
  const effectiveDiagrams = orderedRequirementDiagrams([
    ...requestedDiagrams,
    ...dependencyDiagrams,
  ]);
  const ruleMappingDiagrams = requirementDiagramsMissingRuleMappings(
    effectiveDiagrams,
    input.rules,
  );
  const rulesRunMode =
    input.rules.length === 0
      ? "replace"
      : ruleMappingDiagrams.length > 0
        ? "merge"
        : "none";
  return {
    needsRulesRun: rulesRunMode !== "none",
    rulesRunMode,
    ruleMappingDiagrams,
    requestedDiagrams,
    effectiveDiagrams,
    dependencyDiagrams: orderedRequirementDiagrams([...dependencyDiagrams]),
  } satisfies RequirementAutoUpstreamPlan;
}

function planDesignRequirementAutoUpstream(input: {
  requestedDesignDiagrams: DesignDiagramType[];
  requirementModels: WorkspaceRecord["models"];
  rules: RequirementRule[];
}) {
  const required = new Set<DiagramType>();
  for (const diagram of input.requestedDesignDiagrams) {
    for (const requirementDiagram of DESIGN_REQUIREMENT_SOURCE_MAP[diagram]) {
      if (
        !hasRequirementModelKind(input.requirementModels, requirementDiagram)
      ) {
        required.add(requirementDiagram);
      }
    }
  }
  return planRequirementAutoUpstream({
    requestedDiagrams: [...required],
    existingModels: input.requirementModels,
    rules: input.rules,
  });
}

function requirementDiagramsMissingRuleMappings(
  diagrams: DiagramType[],
  rules: RequirementRule[],
) {
  if (rules.length === 0) return [];
  const mappedDiagrams = new Set(rules.flatMap((rule) => rule.relatedDiagrams));
  return orderedRequirementDiagrams(
    diagrams.filter(
      (diagram) => diagram !== "analysis" && !mappedDiagrams.has(diagram),
    ),
  );
}

function normalizeRuleTextForMerge(text: string) {
  return text.replace(/\s+/gu, "").trim().toLowerCase();
}

function mergeAutoCompletedRuleMappings(
  existingRules: RequirementRule[],
  generatedRules: RequirementRule[],
) {
  const generatedById = new Map(
    generatedRules.map((rule) => [rule.id.trim().toLowerCase(), rule]),
  );
  const generatedByText = new Map(
    generatedRules.map((rule) => [normalizeRuleTextForMerge(rule.text), rule]),
  );
  return existingRules.map((rule) => {
    const generated =
      generatedById.get(rule.id.trim().toLowerCase()) ??
      generatedByText.get(normalizeRuleTextForMerge(rule.text));
    if (!generated) return rule;
    return {
      ...rule,
      relatedDiagrams: orderedRequirementDiagrams([
        ...rule.relatedDiagrams,
        ...generated.relatedDiagrams,
      ]),
    };
  });
}

function ruleLikelySupportsDiagram(
  rule: RequirementRule,
  diagram: DiagramType,
) {
  const category = rule.category.toLowerCase();
  const text = `${rule.category} ${rule.text}`.toLowerCase();
  switch (diagram) {
    case "usecase":
      return (
        category.includes("功能") ||
        /用户|游客|管理员|浏览|报名|取消|查看|创建|编辑|发布|下架|搜索|筛选/u.test(
          text,
        )
      );
    case "class":
      return (
        category.includes("数据") ||
        category.includes("业务") ||
        /实体|字段|容量|状态|标签|记录|人数|截止|不能|唯一/u.test(text)
      );
    case "activity":
      return (
        category.includes("功能") ||
        category.includes("异常") ||
        /流程|分支|报名|取消|提醒|通知|截止|已满|非法|审计|释放/u.test(text)
      );
    case "deployment":
      return (
        category.includes("非功能") ||
        /部署|提醒|通知|定时|审计|日志|安全|性能|外部|集成/u.test(text)
      );
    case "prototype":
      return (
        category.includes("功能") ||
        category.includes("异常") ||
        /界面|页面|表单|查看|浏览|搜索|筛选|创建|编辑|发布|下架/u.test(text)
      );
    case "analysis":
      return false;
  }
}

function ensureAutoCompletedRuleMappings(
  rules: RequirementRule[],
  targetDiagrams: DiagramType[],
) {
  let next = rules.map((rule) => ({
    ...rule,
    relatedDiagrams: [...rule.relatedDiagrams],
  }));
  for (const diagram of targetDiagrams) {
    if (
      diagram === "analysis" ||
      next.some((rule) => rule.relatedDiagrams.includes(diagram))
    ) {
      continue;
    }
    const candidates = next.filter((rule) =>
      ruleLikelySupportsDiagram(rule, diagram),
    );
    const fallbackRules = candidates.length > 0 ? candidates : next.slice(0, 1);
    const fallbackIds = new Set(fallbackRules.map((rule) => rule.id));
    next = next.map((rule) =>
      fallbackIds.has(rule.id)
        ? {
            ...rule,
            relatedDiagrams: orderedRequirementDiagrams([
              ...rule.relatedDiagrams,
              diagram,
            ]),
          }
        : rule,
    );
  }
  return next;
}

function ruleDependencyLabelsForPlan(plan?: RequirementAutoUpstreamPlan) {
  if (!plan?.needsRulesRun) return [];
  if (plan.rulesRunMode === "merge") {
    const suffix = diagramLabels(plan.ruleMappingDiagrams).join("、");
    return [suffix ? `需求规则映射补齐：${suffix}` : "需求规则映射补齐"];
  }
  return ["需求规则抽取/更新"];
}

function autoReviewId(artifactType: string, artifactId: string) {
  return `${artifactType}:${artifactId}`;
}

function createAutoGeneratedUpstreamReview(input: {
  artifactType: WorkspaceRecord["autoGeneratedUpstreamReviews"][string]["artifactType"];
  artifactId: string;
  label: string;
  reason: string;
  sourceRunId: string | null;
}): WorkspaceRecord["autoGeneratedUpstreamReviews"][string] {
  return {
    id: autoReviewId(input.artifactType, input.artifactId),
    artifactType: input.artifactType,
    artifactId: input.artifactId,
    label: input.label,
    reason: input.reason,
    sourceRunId: input.sourceRunId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

type DiagramGenerationStage =
  | "generate_models"
  | "generate_design_sequence"
  | "generate_design_models"
  | "generate_plantuml"
  | "render_svg";

function scopedGenerationSubtask(input: {
  stage: DiagramGenerationStage;
  id: string;
  label: string;
  status?: GenerationTask["subtasks"][number]["status"];
}): GenerationTask["subtasks"][number] {
  return {
    id: `${input.stage}:${input.id}`,
    label: input.label,
    status: input.status ?? "queued",
    message: null,
    errorMessage: null,
  };
}

function stagedDiagramSubtasks(input: {
  modelStage: DiagramGenerationStage;
  id: string;
  label: string;
}): GenerationTask["subtasks"] {
  return [
    scopedGenerationSubtask({
      stage: input.modelStage,
      id: input.id,
      label: input.label,
    }),
    scopedGenerationSubtask({
      stage: "generate_plantuml",
      id: input.id,
      label: input.label,
    }),
    scopedGenerationSubtask({
      stage: "render_svg",
      id: input.id,
      label: input.label,
    }),
  ];
}

function designGenerationSubtasks(
  diagrams: DesignDiagramType[],
  requirementModels: WorkspaceRecord["models"],
): GenerationTask["subtasks"] {
  return diagrams.flatMap((diagram) => {
    if (diagram !== "sequence") {
      return stagedDiagramSubtasks({
        modelStage: "generate_design_models",
        id: diagram,
        label: DESIGN_DIAGRAM_META[diagram].label,
      });
    }
    const useCaseModel = requirementModels.usecase;
    if (!useCaseModel || !("useCases" in useCaseModel)) {
      return stagedDiagramSubtasks({
        modelStage: "generate_design_sequence",
        id: "sequence",
        label: DESIGN_DIAGRAM_META.sequence.label,
      });
    }
    return useCaseModel.useCases.flatMap((useCase) =>
      stagedDiagramSubtasks({
        modelStage: "generate_design_sequence",
        id: `sequence:${useCase.id}`,
        label: `用例实现设计：${useCase.name}`,
      }),
    );
  });
}

function requirementGenerationSubtasks(
  diagrams: DiagramType[],
  requirementModels: WorkspaceRecord["models"],
  analysisTargetUseCaseIds: string[] = [],
): GenerationTask["subtasks"] {
  const analysisTargets = new Set(analysisTargetUseCaseIds);
  return diagrams.flatMap((diagram) => {
    if (diagram !== "analysis") {
      return stagedDiagramSubtasks({
        modelStage: "generate_models",
        id: diagram,
        label: DIAGRAM_META[diagram].label,
      });
    }
    const useCaseModel = requirementModels.usecase;
    if (!useCaseModel || !("useCases" in useCaseModel)) {
      return stagedDiagramSubtasks({
        modelStage: "generate_models",
        id: "analysis",
        label: DIAGRAM_META.analysis.label,
      });
    }
    const useCases =
      analysisTargets.size > 0
        ? useCaseModel.useCases.filter((useCase) =>
            analysisTargets.has(useCase.id),
          )
        : useCaseModel.useCases;
    return useCases.flatMap((useCase) =>
      stagedDiagramSubtasks({
        modelStage: "generate_models",
        id: `analysis:${useCase.id}`,
        label: `需求分析模型：${useCase.name}`,
      }),
    );
  });
}

function analyzeRequirementGeneration(
  requestedDiagrams: DiagramType[],
  existingDiagrams: DiagramType[],
  plan?: RequirementAutoUpstreamPlan,
): GenerationConfirmationSummary {
  const requested = orderedRequirementDiagrams(
    plan?.effectiveDiagrams ?? requestedDiagrams,
  );
  const existing = new Set(existingDiagrams);
  const effective = new Set(requested);
  const newDiagrams = requested.filter((diagram) => !existing.has(diagram));
  const regeneratedDiagrams = requested.filter((diagram) =>
    existing.has(diagram),
  );
  const keptDiagrams = orderedRequirementDiagrams(existingDiagrams).filter(
    (diagram) => !effective.has(diagram),
  );
  return {
    title: "确认生成需求模型",
    description:
      plan?.needsRulesRun || (plan?.dependencyDiagrams.length ?? 0) > 0
        ? "本次会先补齐缺失的上游规则映射或模型，再生成所选需求模型。"
        : "本次会追加或更新所选需求模型，已有模型会保留。",
    ruleDependencyLabels: ruleDependencyLabelsForPlan(plan),
    requirementDependencyLabels: diagramLabels(plan?.dependencyDiagrams ?? []),
    newLabels: requirementLabels(newDiagrams),
    regeneratedLabels: requirementLabels(regeneratedDiagrams),
    dependencyLabels: [],
    keptLabels: requirementLabels(keptDiagrams),
  };
}

function collectExistingRequirementDiagramKinds(
  models: WorkspaceRecord["models"],
): DiagramType[] {
  return orderedRequirementDiagrams(
    Object.values(models)
      .filter(Boolean)
      .map((model) => model.diagramKind),
  );
}

function collectExistingDesignDiagramKinds(
  designModels: WorkspaceRecord["designModels"],
): DesignDiagramType[] {
  return orderedDesignDiagrams(
    Object.values(designModels).map((model) => model.diagramKind),
  );
}

function resolveDesignGenerationDiagrams(
  requestedDiagrams: DesignDiagramType[],
  existingDiagrams: DesignDiagramType[],
) {
  const requested = new Set(requestedDiagrams);
  const existing = new Set(existingDiagrams);
  const dependencies = new Set<DesignDiagramType>();

  const needsSequence = [...requested].some(
    (diagram) => diagram !== "sequence",
  );
  if (
    needsSequence &&
    !existing.has("sequence") &&
    !requested.has("sequence")
  ) {
    dependencies.add("sequence");
  }
  if (
    requested.has("table") &&
    !existing.has("class") &&
    !requested.has("class")
  ) {
    dependencies.add("class");
  }

  const effectiveDiagrams = orderedDesignDiagrams([
    ...requestedDiagrams,
    ...dependencies,
  ]);
  return {
    effectiveDiagrams,
    dependencyDiagrams: orderedDesignDiagrams([...dependencies]),
  };
}

function analyzeDesignGeneration(
  requestedDiagrams: DesignDiagramType[],
  effectiveDiagrams: DesignDiagramType[],
  dependencyDiagrams: DesignDiagramType[],
  existingDiagrams: DesignDiagramType[],
  requirementPlan?: RequirementAutoUpstreamPlan,
): GenerationConfirmationSummary {
  const existing = new Set(existingDiagrams);
  const effective = new Set(effectiveDiagrams);
  const newDiagrams = effectiveDiagrams.filter(
    (diagram) => !existing.has(diagram),
  );
  const regeneratedDiagrams = effectiveDiagrams.filter((diagram) =>
    existing.has(diagram),
  );
  const keptDiagrams = orderedDesignDiagrams(existingDiagrams).filter(
    (diagram) => !effective.has(diagram),
  );
  return {
    title: "确认生成设计模型",
    description:
      requirementPlan?.needsRulesRun ||
      (requirementPlan?.effectiveDiagrams.length ?? 0) > 0 ||
      dependencyDiagrams.length > 0
        ? "本次会先补齐缺失的上游规则映射或模型，再生成所选设计模型。"
        : "本次会追加或更新设计模型；缺失的前置模型会在确认后一并生成。",
    ruleDependencyLabels: ruleDependencyLabelsForPlan(requirementPlan),
    requirementDependencyLabels: diagramLabels(
      requirementPlan?.effectiveDiagrams ?? [],
    ),
    newLabels: designLabels(newDiagrams),
    regeneratedLabels: designLabels(regeneratedDiagrams),
    dependencyLabels: designLabels(dependencyDiagrams),
    keptLabels: designLabels(keptDiagrams),
  };
}

function uniqueIssueMessages(issues: RequirementQualityIssue[]) {
  return Array.from(
    new Set(
      issues
        .map((issue) => issue.message?.trim())
        .filter((message): message is string => Boolean(message)),
    ),
  );
}

function isRequirementBlocking(issue: RequirementQualityIssue) {
  return issue.blocksDownstream || issue.severity === "critical";
}

const REVIEWABLE_REQUIREMENT_FIELDS: AtomicRequirementField[] = [
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
];

function requirementFieldHasReviewedValue(
  requirement: AtomicRequirement,
  field: AtomicRequirementField,
) {
  const provenance = requirement.fieldProvenance[field];
  if (
    provenance?.status === "accepted" &&
    typeof provenance.value === "string" &&
    provenance.value.trim()
  ) {
    return true;
  }
  if (field === "acceptanceCriteria") {
    return requirement.acceptanceCriteria.length > 0;
  }
  return Boolean(requirement[field]?.trim());
}

function requirementConditionIsVerifiable(requirement: AtomicRequirement) {
  const provenance = requirement.fieldProvenance.condition;
  const condition = provenance?.value ?? requirement.condition ?? "";
  return provenance?.status === "accepted" || /\d/.test(condition);
}

function rebuildRequirementReviewQualityReport(
  baseline: RequirementBaseline,
): RequirementQualityReport {
  const issues = baseline.qualityReport.issues.filter((issue) => {
    const requirement = issue.requirementId
      ? baseline.requirements.find((item) => item.id === issue.requirementId)
      : null;
    if (!requirement) return true;
    if (requirement.status === "accepted") return false;
    if (issue.code === "missing-actor") {
      return !requirementFieldHasReviewedValue(requirement, "actor");
    }
    if (issue.code === "missing-object") {
      return !requirementFieldHasReviewedValue(requirement, "object");
    }
    if (issue.code === "missing-boundary") {
      return !requirementConditionIsVerifiable(requirement);
    }
    if (issue.code === "low-confidence") {
      return requirement.confidence < 0.7;
    }
    if (issue.code === "derived-assumption") {
      return Object.values(requirement.fieldProvenance).some(
        (item) => item?.source === "ai-suggested" && item.status !== "accepted",
      );
    }
    return true;
  });
  return rebuildRequirementQualityReport({
    ...baseline,
    qualityReport: {
      ...baseline.qualityReport,
      issues,
    },
  });
}

function requirementHasPendingField(requirement: AtomicRequirement) {
  return Object.values(requirement.fieldProvenance).some(
    (item) => item?.status === "pending-review" || item?.status === "rejected",
  );
}

function requirementNeedsRepairReview(
  requirement: AtomicRequirement,
  issues: RequirementQualityIssue[],
  reviewRequired: boolean,
) {
  const hasBlockingIssue = issues.some((issue) => issue.blocksDownstream);
  return (
    reviewRequired ||
    requirement.status !== "accepted" ||
    requirementHasPendingField(requirement) ||
    hasBlockingIssue
  );
}

function requirementRuleIdsNeedingReview(baseline: RequirementBaseline | null) {
  if (!baseline) return [];
  const issuesByRequirementId = new Map<string, RequirementQualityIssue[]>();
  const reviewRequiredIds = new Set(
    baseline.qualityReport.reviewRequiredRequirementIds,
  );
  for (const issue of baseline.qualityReport.issues) {
    if (!issue.requirementId) continue;
    issuesByRequirementId.set(issue.requirementId, [
      ...(issuesByRequirementId.get(issue.requirementId) ?? []),
      issue,
    ]);
  }
  return Array.from(
    new Set(
      baseline.requirements
        .filter((requirement) =>
          Boolean(
            requirement.sourceRuleId &&
            requirementNeedsRepairReview(
              requirement,
              issuesByRequirementId.get(requirement.id) ?? [],
              reviewRequiredIds.has(requirement.id),
            ),
          ),
        )
        .map((requirement) => requirement.sourceRuleId!),
    ),
  );
}

function requirementRuleIdsBlockingGeneration(
  baseline: RequirementBaseline | null,
  candidates: WorkspaceRecord["requirementReviewCandidates"],
) {
  if (!baseline) return [];
  const issuesByRequirementId = new Map<string, RequirementQualityIssue[]>();
  for (const issue of baseline.qualityReport.issues) {
    if (!issue.requirementId) continue;
    issuesByRequirementId.set(issue.requirementId, [
      ...(issuesByRequirementId.get(issue.requirementId) ?? []),
      issue,
    ]);
  }
  const blockedRuleIds = new Set<string>();
  for (const requirement of baseline.requirements) {
    if (!requirement.sourceRuleId) continue;
    const candidate = candidates[requirement.sourceRuleId];
    const candidatePending =
      candidate?.status === "pending" || candidate?.status === "failed";
    const issues = issuesByRequirementId.get(requirement.id) ?? [];
    if (
      candidatePending ||
      (Boolean(candidate) && requirement.status !== "accepted") ||
      (Boolean(candidate) && requirementHasPendingField(requirement)) ||
      issues.some((issue) => issue.blocksDownstream)
    ) {
      blockedRuleIds.add(requirement.sourceRuleId);
    }
  }
  return Array.from(blockedRuleIds);
}

function markRequirementReviewed(requirement: AtomicRequirement) {
  const next = structuredClone(requirement) as AtomicRequirement;
  next.status = "accepted";
  next.confidence = Math.max(next.confidence, 0.72);
  for (const field of REVIEWABLE_REQUIREMENT_FIELDS) {
    const provenance = next.fieldProvenance[field];
    if (!provenance) continue;
    next.fieldProvenance[field] = {
      ...provenance,
      status: "accepted",
      rationale:
        provenance.status === "accepted"
          ? provenance.rationale
          : "用户已确认本次需求规则修复结果。",
    };
  }
  return next;
}

function mergeReviewedRequirement(
  baseline: RequirementBaseline,
  reviewedRequirement: AtomicRequirement,
) {
  const next = {
    ...baseline,
    requirements: baseline.requirements.map((requirement) =>
      requirement.id === reviewedRequirement.id
        ? reviewedRequirement
        : requirement,
    ),
  };
  return {
    ...next,
    qualityReport: rebuildRequirementReviewQualityReport(next),
  };
}

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

function diagramErrorCount(
  snapshot: Pick<
    WorkspaceRunSnapshot | WorkspaceDesignRunSnapshot,
    "diagramErrors"
  >,
) {
  return Object.keys(snapshot.diagramErrors ?? {}).length;
}

function completedRunResultMessage({
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

function generationResultDialogGroup(result: GenerationResultDialogState) {
  const tone = result.tone === "destructive" ? "failure" : "completion";
  const runKey = result.runId ? `run:${result.runId}` : "";
  const stageKey = sanitizeResultDialogCopy(
    result.stageLabel ?? result.title ?? "生成结果",
  );
  return `${tone}:${runKey || stageKey}`;
}

function GenerationResultDialog({
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

function GenerationConfirmationDialog({
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
          <SummaryGroup
            label="保留不变"
            items={confirmation.keptLabels}
          />
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

function refKey(diagramKind: string, elementId: string, modelId?: string) {
  const scope = compactRefValue(modelId) || diagramKind;
  return `${scope}:${diagramKind}:${elementId}`.toLowerCase();
}

function clearRequirementScopedRecord<T>(
  current: Record<string, T>,
  affectedDiagrams: readonly DiagramType[],
) {
  const affected = new Set(affectedDiagrams);
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => {
      if (affected.has(key as DiagramType)) return false;
      for (const diagram of affected) {
        if (key.startsWith(`${diagram}:`)) return false;
      }
      const diagramKind = (value as { diagramKind?: string } | undefined)
        ?.diagramKind;
      return !diagramKind || !affected.has(diagramKind as DiagramType);
    }),
  ) as Record<string, T>;
}

type RequirementSnapshotScope = {
  broadDiagrams: DiagramType[];
  targetedModelIds: Set<string>;
};

function analysisTargetModelIds(snapshot: WorkspaceRunSnapshot) {
  return (snapshot.analysisTargetUseCaseIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => `analysis:${id}`);
}

function requirementSnapshotScope(
  snapshot: WorkspaceRunSnapshot,
  affectedDiagrams: readonly DiagramType[],
): RequirementSnapshotScope {
  const targetedModelIds = new Set(analysisTargetModelIds(snapshot));
  const hasTargetedAnalysis =
    targetedModelIds.size > 0 && affectedDiagrams.includes("analysis");
  return {
    broadDiagrams: hasTargetedAnalysis
      ? affectedDiagrams.filter((diagram) => diagram !== "analysis")
      : [...affectedDiagrams],
    targetedModelIds: hasTargetedAnalysis
      ? targetedModelIds
      : new Set<string>(),
  };
}

function clearRequirementScopedRecordForScope<T>(
  current: Record<string, T>,
  scope: RequirementSnapshotScope,
) {
  const next = clearRequirementScopedRecord(current, scope.broadDiagrams);
  for (const modelId of scope.targetedModelIds) {
    delete next[modelId];
  }
  return next;
}

function keepRequirementScopedRecord<T>(
  current: Record<string, T>,
  affectedDiagrams: readonly DiagramType[],
) {
  const affected = new Set(affectedDiagrams);
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => {
      if (affected.has(key as DiagramType)) return true;
      for (const diagram of affected) {
        if (key.startsWith(`${diagram}:`)) return true;
      }
      const diagramKind = (value as { diagramKind?: string } | undefined)
        ?.diagramKind;
      return Boolean(diagramKind && affected.has(diagramKind as DiagramType));
    }),
  ) as Record<string, T>;
}

function keepRequirementScopedRecordForScope<T>(
  current: Record<string, T>,
  scope: RequirementSnapshotScope,
) {
  const next = keepRequirementScopedRecord(current, scope.broadDiagrams);
  for (const modelId of scope.targetedModelIds) {
    const value = current[modelId];
    if (value !== undefined) {
      next[modelId] = value;
    }
  }
  return next;
}

function traceabilityEntryMatchesScope(
  entry: RequirementModelTraceabilityEntry,
  scope: RequirementSnapshotScope,
) {
  if (scope.broadDiagrams.includes(entry.target.diagramKind as DiagramType)) {
    return true;
  }
  const modelId =
    "modelId" in entry.target && typeof entry.target.modelId === "string"
      ? entry.target.modelId
      : "";
  return scope.targetedModelIds.has(modelId);
}

function requirementErrorDiagrams(
  diagramErrors: WorkspaceRunSnapshot["diagramErrors"],
) {
  return new Set(
    Object.keys(diagramErrors)
      .map((key) => key.split(":")[0])
      .filter((diagram): diagram is DiagramType =>
        Boolean(
          diagram &&
          [
            "usecase",
            "class",
            "activity",
            "deployment",
            "prototype",
            "analysis",
          ].includes(diagram),
        ),
      ),
  );
}

function successfulRequirementDiagramsFromSnapshot(
  snapshot: WorkspaceRunSnapshot,
) {
  const errored = requirementErrorDiagrams(snapshot.diagramErrors);
  const artifactDiagrams = Array.from(
    new Set([
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ]),
  ).filter((diagram) => !errored.has(diagram));
  const selectedModelDiagrams = Array.from(
    new Set(
      snapshot.models
        .map((model) => model.diagramKind)
        .filter(
          (diagram) =>
            snapshot.selectedDiagrams.includes(diagram) &&
            !errored.has(diagram),
        ),
    ),
  );
  const modelDiagrams = Array.from(
    new Set(snapshot.models.map((model) => model.diagramKind)),
  ).filter((diagram) => !errored.has(diagram));
  return orderedRequirementDiagrams(
    artifactDiagrams.length > 0
      ? artifactDiagrams
      : selectedModelDiagrams.length > 0
        ? selectedModelDiagrams
        : modelDiagrams,
  );
}

function diagramsFromRequirementSnapshot(snapshot: WorkspaceRunSnapshot) {
  return Array.from(
    new Set([
      ...snapshot.selectedDiagrams,
      ...snapshot.models.map((model) => model.diagramKind),
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
      ...Object.keys(snapshot.diagramErrors),
    ]),
  ) as DiagramType[];
}

function compactRefValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function activityNodeTraceabilityKind(nodeType: unknown) {
  switch (nodeType) {
    case "activity":
      return "activity";
    case "decision":
      return "decision";
    case "start":
      return "start-node";
    case "end":
      return "end-node";
    case "merge":
      return "merge-node";
    case "fork":
      return "fork-node";
    case "join":
      return "join-node";
    default:
      return "activity-node";
  }
}

function isBusinessTraceabilityKind(kind: string) {
  return ![
    "system-boundary",
    "swimlane",
    "start-node",
    "end-node",
    "merge-node",
    "fork-node",
    "join-node",
  ].includes(kind);
}

function rebuildRequirementQualityReport(
  baseline: RequirementBaseline,
): RequirementQualityReport {
  const blockingIssueIds = baseline.qualityReport.issues
    .filter((issue) => issue.blocksDownstream)
    .map((issue) => issue.id);
  const reviewRequiredRequirementIds = Array.from(
    new Set(
      baseline.requirements
        .filter((requirement) => requirement.status !== "accepted")
        .map((requirement) => requirement.id),
    ),
  );
  const status =
    blockingIssueIds.length > 0
      ? "blocked"
      : reviewRequiredRequirementIds.length > 0 ||
          baseline.qualityReport.issues.length > 0
        ? "pending-review"
        : "passed";
  return {
    ...baseline.qualityReport,
    status,
    summary:
      status === "passed"
        ? `已建立 ${baseline.requirements.length} 条原子需求基线。`
        : `发现 ${baseline.qualityReport.issues.length} 个需求质量提示，可继续生成并在当前页面查看。`,
    blockingIssueIds,
    reviewRequiredRequirementIds,
  };
}

function collectTraceableRefKeys(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
) {
  const keys = new Set<string>();
  for (const model of models) {
    const diagramKind = model.diagramKind;
    const modelId = compactRefValue(
      (model as unknown as Record<string, unknown>).modelId,
    );
    const record = model as unknown as Record<string, unknown>;
    const listKeys: Array<[string, string]> = [
      ["actors", "actor"],
      ["useCases", "usecase"],
      ["systemBoundaries", "system-boundary"],
      ["classes", "class"],
      ["interfaces", "interface"],
      ["enums", "enum"],
      ["swimlanes", "swimlane"],
      [
        "nodes",
        diagramKind === "deployment" ? "deployment-node" : "activity-node",
      ],
      ["databases", "database"],
      ["components", "component"],
      ["externalSystems", "external-system"],
      ["artifacts", "artifact"],
      ["participants", "participant"],
      ["messages", "message"],
      ["fragments", "fragment"],
      ["tables", "table"],
    ];
    const businessElementIds = new Set<string>();

    for (const [key, defaultKind] of listKeys) {
      const items = Array.isArray(record[key]) ? record[key] : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const itemRecord = item as Record<string, unknown>;
        const id = compactRefValue(itemRecord.id);
        const kind =
          key === "nodes" && diagramKind === "activity"
            ? activityNodeTraceabilityKind(itemRecord.type)
            : defaultKind;
        if (id && isBusinessTraceabilityKind(kind)) {
          keys.add(refKey(diagramKind, id, modelId || undefined));
          businessElementIds.add(id);
        }
        if (key === "tables") {
          const columns = Array.isArray(itemRecord.columns)
            ? itemRecord.columns
            : [];
          for (const column of columns) {
            if (!column || typeof column !== "object") continue;
            const columnId = compactRefValue(
              (column as Record<string, unknown>).id,
            );
            if (id && columnId) {
              keys.add(
                refKey(diagramKind, `${id}.${columnId}`, modelId || undefined),
              );
              businessElementIds.add(`${id}.${columnId}`);
            }
          }
        }
      }
    }

    const relationships = Array.isArray(record.relationships)
      ? record.relationships
      : [];
    for (const relationship of relationships) {
      if (!relationship || typeof relationship !== "object") continue;
      const relationshipRecord = relationship as Record<string, unknown>;
      if (
        diagramKind === "activity" &&
        (!businessElementIds.has(
          compactRefValue(relationshipRecord.sourceId),
        ) ||
          !businessElementIds.has(compactRefValue(relationshipRecord.targetId)))
      ) {
        continue;
      }
      const id = compactRefValue(relationshipRecord.id);
      if (id) keys.add(refKey(diagramKind, id, modelId || undefined));
    }
  }
  return keys;
}

function hasCompleteTraceabilityCoverage(
  modelRefs: Set<string>,
  refs: ModelElementRef[],
) {
  if (modelRefs.size === 0) return false;
  const covered = new Set(
    refs.map((ref) => refKey(ref.diagramKind, ref.elementId, ref.modelId)),
  );
  return Array.from(modelRefs).every((key) => covered.has(key));
}

function isManualModelRerendered(
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"],
  key: string,
) {
  return manualModelEditStatus[key]?.status === "rerendered";
}

function hasCompleteRequirementTraceability(
  models: Array<DiagramModelSpec | undefined>,
  traceability: RequirementModelTraceabilityEntry[],
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"] = {},
) {
  const availableModels = models.filter((model): model is DiagramModelSpec =>
    Boolean(model),
  );
  const modelsRequiringTraceability = availableModels.filter(
    (model) =>
      model.diagramKind !== "analysis" &&
      !isManualModelRerendered(manualModelEditStatus, model.diagramKind),
  );
  if (modelsRequiringTraceability.length === 0) {
    return availableModels.length > 0;
  }
  const modelRefs = collectTraceableRefKeys(modelsRequiringTraceability);
  return hasCompleteTraceabilityCoverage(
    modelRefs,
    traceability.map((entry) => entry.target),
  );
}

function isRequirementDiagramStale(input: {
  diagram: DiagramType;
  activeRequirementFingerprint: string;
  generatedDiagrams: DiagramType[];
  requirementInputFingerprint: string | null;
  diagramInputFingerprints: Partial<Record<DiagramType, string>>;
  diagramVersions: Partial<Record<DiagramType, number>>;
  rulesVersion: number;
  models: Partial<Record<DiagramType, DiagramModelSpec>>;
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"];
}) {
  const {
    diagram,
    activeRequirementFingerprint,
    generatedDiagrams,
    requirementInputFingerprint,
    diagramInputFingerprints,
    diagramVersions,
    rulesVersion,
    models,
    requirementModelTraceability,
    manualModelEditStatus,
  } = input;
  const diagramFingerprint = diagramInputFingerprints[diagram];
  if (diagramFingerprint) {
    return !fingerprintMatches(
      diagramFingerprint,
      activeRequirementFingerprint,
    );
  }
  if (!generatedDiagrams.includes(diagram)) return false;

  const diagramVersion = diagramVersions[diagram];
  if (diagramVersion !== undefined) return diagramVersion !== rulesVersion;

  const model = models[diagram];
  const traceabilityForDiagram = requirementModelTraceability.filter(
    (entry) => entry.target.diagramKind === diagram,
  );
  return !(
    model &&
    requirementInputFingerprint &&
    fingerprintMatches(
      requirementInputFingerprint,
      activeRequirementFingerprint,
    ) &&
    hasCompleteRequirementTraceability(
      [model],
      traceabilityForDiagram,
      manualModelEditStatus,
    )
  );
}

function hasCompleteDesignTraceability(
  models: Array<DesignDiagramModelSpec | undefined>,
  traceability: DesignModelTraceabilityEntry[],
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"] = {},
  requirementModels: Array<DiagramModelSpec | undefined> = [],
) {
  const availableModels = models.filter(
    (model): model is DesignDiagramModelSpec => Boolean(model),
  );
  const modelsRequiringTraceability = availableModels.filter(
    (model) =>
      !isManualModelRerendered(manualModelEditStatus, getDesignModelId(model)),
  );
  if (modelsRequiringTraceability.length === 0) {
    return availableModels.length > 0;
  }
  const modelRefs = collectTraceableRefKeys(modelsRequiringTraceability);
  const sourceCoverageComplete = hasCompleteTraceabilityCoverage(
    modelRefs,
    traceability.map((entry) => entry.source),
  );
  if (!sourceCoverageComplete) return false;
  const requirementRefs = collectTraceableRefKeys(
    requirementModels.filter((model): model is DiagramModelSpec =>
      Boolean(model),
    ),
  );
  if (requirementRefs.size === 0) return true;
  return traceability.every((entry) =>
    entry.targets.every((target) =>
      requirementRefs.has(
        refKey(target.diagramKind, target.elementId, target.modelId),
      ),
    ),
  );
}

export function WorkspaceSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const repository = useWorkspaceRepository();
  const {
    requirementText,
    setRequirementText,
    setRequirementTextRaw,
    rules,
    setRules,
    textVersion,
    setTextVersion,
    rulesVersion,
    setRulesVersion,
    rulesBasedOnTextVersion,
    setRulesBasedOnTextVersion,
    requirementInputFingerprint,
    setRequirementInputFingerprint,
    addRequirementRule,
    createRequirementRule: createRequirementRuleBase,
    updateRequirementRule: updateRequirementRuleBase,
    deleteRequirementRule: deleteRequirementRuleBase,
    clearRequirementRules: clearRequirementRulesBase,
    rulesForDiagram,
  } = useRequirementsSlice(repository);
  const {
    models,
    setModels,
    requirementModelTraceability,
    setRequirementModelTraceability,
    selectedDiagrams,
    setSelectedDiagrams,
    plantUml,
    setPlantUml,
    svgArtifacts,
    setSvgArtifacts,
    diagramErrors,
    setDiagramErrors,
    generatedDiagrams,
    setGeneratedDiagrams,
    diagramVersions,
    setDiagramVersions,
    diagramInputFingerprints,
    setDiagramInputFingerprints,
  } = useDiagramsSlice();
  const {
    selectedDesignDiagrams,
    setSelectedDesignDiagrams,
    designModels,
    designModelTraceability,
    setDesignModelTraceability,
    setDesignModels,
    designPlantUml,
    setDesignPlantUml,
    designSvgArtifacts,
    setDesignSvgArtifacts,
    designDiagramErrors,
    setDesignDiagramErrors,
    generatedDesignDiagrams,
    setGeneratedDesignDiagrams,
    designInputFingerprints,
    setDesignInputFingerprints,
  } = useDesignSlice();
  const [manualModelEditStatus, setManualModelEditStatus] = useState<
    WorkspaceRecord["manualModelEditStatus"]
  >({});
  const {
    codeSpec,
    setCodeSpec,
    codeBusinessLogic,
    setCodeBusinessLogic,
    codeFiles,
    setCodeFiles,
    codeEntryFile,
    setCodeEntryFile,
    codeDependencies,
    setCodeDependencies,
    codeUiMockup,
    setCodeUiMockup,
    codeAgentPlan,
    setCodeAgentPlan,
    codeSkills,
    setCodeSkills,
    codeSkillDiagnostics,
    setCodeSkillDiagnostics,
    codeSkillResourcePlan,
    setCodeSkillResourcePlan,
    codeSkillContext,
    setCodeSkillContext,
    codeDiagnostics,
    setCodeDiagnostics,
    codeEditVersion,
    applyCodeRunSnapshot,
    updateCodeFile,
  } = useCodeSlice();
  const { currentRunDiagnostics, setCurrentRunDiagnostics } =
    useRunDiagnosticsSlice();
  const [runUiState, setRunUiState] = useState(createEmptyRunUiState);
  const [billingGenerationBlock, setBillingGenerationBlock] =
    useState<BillingEntitlementErrorResponse | null>(null);
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  const [selectedGenerationTaskId, setSelectedGenerationTaskId] = useState<
    string | null
  >(null);
  const [historyItems, setHistoryItems] = useState<RunHistoryItem[]>([]);
  const [requirementBaseline, setRequirementBaseline] =
    useState<RequirementBaseline | null>(null);
  const [requirementQualityReport, setRequirementQualityReport] =
    useState<RequirementQualityReport | null>(null);
  const [requirementReviewCandidates, setRequirementReviewCandidates] =
    useState<WorkspaceRecord["requirementReviewCandidates"]>({});
  const [autoGeneratedUpstreamReviews, setAutoGeneratedUpstreamReviews] =
    useState<WorkspaceRecord["autoGeneratedUpstreamReviews"]>({});
  const [workspacePermissions, setWorkspacePermissions] = useState({
    canUpdateWorkspace: true,
    canStartRuns: true,
    reason: null as string | null,
  });
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

  const persistAutoGeneratedUpstreamReviews = useCallback(
    async (reviews: WorkspaceRecord["autoGeneratedUpstreamReviews"]) => {
      setAutoGeneratedUpstreamReviews(reviews);
      await repository.updateAutoGeneratedUpstreamReviews?.(reviews);
    },
    [repository],
  );

  const decideAutoGeneratedUpstreamReview = useCallback(
    async (reviewId: string, decision: "accepted" | "dismissed") => {
      if (!autoGeneratedUpstreamReviews[reviewId]) return;
      const next = {
        ...autoGeneratedUpstreamReviews,
        [reviewId]: {
          ...autoGeneratedUpstreamReviews[reviewId],
          status: decision,
        },
      };
      await persistAutoGeneratedUpstreamReviews(next);
    },
    [autoGeneratedUpstreamReviews, persistAutoGeneratedUpstreamReviews],
  );

  const appendAutoGeneratedUpstreamReviews = useCallback(
    async (
      reviews: Array<WorkspaceRecord["autoGeneratedUpstreamReviews"][string]>,
    ) => {
      if (reviews.length === 0) return;
      const next = {
        ...autoGeneratedUpstreamReviews,
        ...Object.fromEntries(reviews.map((review) => [review.id, review])),
      };
      await persistAutoGeneratedUpstreamReviews(next);
    },
    [autoGeneratedUpstreamReviews, persistAutoGeneratedUpstreamReviews],
  );

  useEffect(() => {
    if (!repository.getProjectCapabilities) {
      setWorkspacePermissions({
        canUpdateWorkspace: true,
        canStartRuns: true,
        reason: null,
      });
      return;
    }
    let active = true;
    repository
      .getProjectCapabilities()
      .then((capabilities) => {
        if (!active) return;
        const canUpdateWorkspace = capabilities.includes("update_project");
        const canStartRuns = capabilities.includes("start_runs");
        setWorkspacePermissions({
          canUpdateWorkspace,
          canStartRuns,
          reason:
            canUpdateWorkspace && canStartRuns
              ? null
              : "当前项目角色仅允许查看，不能编辑内容或启动生成。",
        });
      })
      .catch(() => {
        if (!active) return;
        setWorkspacePermissions({
          canUpdateWorkspace: false,
          canStartRuns: false,
          reason: "无法确认当前项目权限，已临时禁用编辑和生成操作。",
        });
      });
    return () => {
      active = false;
    };
  }, [repository]);

  const persistRequirementBaseline = useCallback(
    async (next: RequirementBaseline) => {
      if (!repository.updateRequirementBaseline) {
        throw new Error("当前环境不支持保存需求复核结果");
      }
      await repository.updateRequirementBaseline(next);
      setRequirementBaseline(next);
      setRequirementQualityReport(next.qualityReport);
    },
    [repository],
  );

  const persistRequirementReviewCandidates = useCallback(
    async (next: WorkspaceRecord["requirementReviewCandidates"]) => {
      setRequirementReviewCandidates(next);
      await repository.updateRequirementReviewCandidates?.(next);
    },
    [repository],
  );

  const persistRequirementReviewState = useCallback(
    async (
      nextBaseline: RequirementBaseline,
      nextCandidates: WorkspaceRecord["requirementReviewCandidates"],
    ) => {
      if (repository.updateRequirementReviewState) {
        await repository.updateRequirementReviewState(
          nextBaseline,
          nextCandidates,
        );
      } else {
        await repository.updateRequirementBaseline?.(nextBaseline);
        await repository.updateRequirementReviewCandidates?.(nextCandidates);
      }
      setRequirementBaseline(nextBaseline);
      setRequirementQualityReport(nextBaseline.qualityReport);
      setRequirementReviewCandidates(nextCandidates);
    },
    [repository],
  );

  const clearRequirementReviewCandidates = useCallback(() => {
    setRequirementReviewCandidates({});
    void repository.updateRequirementReviewCandidates?.({});
  }, [repository]);

  const createRequirementRule = useCallback(
    (input: Parameters<typeof createRequirementRuleBase>[0]) => {
      clearRequirementReviewCandidates();
      createRequirementRuleBase(input);
    },
    [clearRequirementReviewCandidates, createRequirementRuleBase],
  );

  const updateRequirementRule = useCallback(
    (id: string, patch: Partial<RequirementRule>) => {
      clearRequirementReviewCandidates();
      updateRequirementRuleBase(id, patch);
    },
    [clearRequirementReviewCandidates, updateRequirementRuleBase],
  );

  const deleteRequirementRule = useCallback(
    (id: string) => {
      clearRequirementReviewCandidates();
      deleteRequirementRuleBase(id);
    },
    [clearRequirementReviewCandidates, deleteRequirementRuleBase],
  );

  const clearRequirementRules = useCallback(() => {
    clearRequirementReviewCandidates();
    clearRequirementRulesBase();
  }, [clearRequirementReviewCandidates, clearRequirementRulesBase]);

  const showRequirementReviewSaveFailure = useCallback(
    (error: unknown, ruleId: string) => {
      openGenerationResultDialog({
        title: "保存失败",
        tone: "destructive",
        message: "复核结果没有保存，请稍后重试。",
        details: [
          error instanceof Error ? error.message : "项目工作台保存失败。",
        ],
        ruleId,
        stageLabel: "需求规则",
        targetLabel:
          rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则",
      });
    },
    [openGenerationResultDialog, rules],
  );

  const updateRequirementAiSuggestionReview = useCallback(
    async (
      ruleId: string,
      decision: "accept-ai" | "accept-manual" | "reject",
      fieldValues: Partial<Record<AtomicRequirementField, string>> = {},
    ) => {
      if (!requirementBaseline) return;
      const next = structuredClone(requirementBaseline) as RequirementBaseline;
      const requirement = next.requirements.find(
        (item) => item.sourceRuleId === ruleId,
      );
      if (!requirement) return;
      const targetLabel =
        rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则";

      if (decision === "accept-manual") {
        for (const field of REVIEWABLE_REQUIREMENT_FIELDS) {
          const rawValue = fieldValues[field];
          if (rawValue === undefined) continue;
          const value = rawValue.trim();
          if (field === "acceptanceCriteria") {
            requirement.acceptanceCriteria = value
              .split(/[；;\n]/)
              .map((item) => item.trim())
              .filter(Boolean);
          } else {
            requirement[field] = value || null;
          }
          requirement.fieldProvenance[field] = {
            source: "manual",
            status: value ? "accepted" : "pending-review",
            value: value || null,
            originalValue:
              requirement.fieldProvenance[field]?.originalValue ??
              requirement.fieldProvenance[field]?.value ??
              null,
            rationale: "用户编辑后保存，并重新运行需求质量检查。",
          };
        }
      } else {
        for (const [field, provenance] of Object.entries(
          requirement.fieldProvenance,
        )) {
          if (
            provenance?.source !== "ai-suggested" ||
            provenance.status !== "pending-review"
          ) {
            continue;
          }
          requirement.fieldProvenance[
            field as keyof typeof requirement.fieldProvenance
          ] = {
            ...provenance,
            status: decision === "reject" ? "rejected" : "accepted",
            rationale:
              decision === "reject"
                ? "用户已拒绝本次智能修复建议。"
                : "用户已采纳本次智能修复建议。",
          };
        }
      }

      if (decision === "reject") {
        requirement.status = "pending-review";
      } else if (requirement.status !== "conflict") {
        requirement.confidence = Math.max(requirement.confidence, 0.72);
        requirement.status = Object.values(requirement.fieldProvenance).some(
          (item) =>
            item?.status === "pending-review" || item?.status === "rejected",
        )
          ? "pending-review"
          : "accepted";
      }

      next.qualityReport = rebuildRequirementReviewQualityReport(next);
      const relatedIssues = next.qualityReport.issues.filter(
        (issue) => issue.requirementId === requirement.id,
      );
      const stillBlocked = relatedIssues.some(isRequirementBlocking);
      if (stillBlocked && decision === "accept-manual") {
        for (const field of Object.keys(
          fieldValues,
        ) as AtomicRequirementField[]) {
          const provenance = requirement.fieldProvenance[field];
          if (provenance?.source === "manual") {
            requirement.fieldProvenance[field] = {
              ...provenance,
              status: "pending-review",
              rationale: "编辑稿已保存，但质量检查仍未通过。",
            };
          }
        }
        requirement.status = "pending-review";
        next.qualityReport = rebuildRequirementReviewQualityReport(next);
      }

      try {
        await persistRequirementBaseline(next);
      } catch (error) {
        showRequirementReviewSaveFailure(error, ruleId);
        return;
      }

      if (decision === "reject") {
        openGenerationResultDialog({
          title: "字段建议已拒绝",
          tone: "warning",
          message: "智能修复补齐建议已标记为拒绝，需求仍保留待确认提示。",
          details: uniqueIssueMessages(relatedIssues),
          requirementId: requirement.id,
          ruleId,
          stageLabel: "需求规则",
          targetLabel,
        });
      } else if (stillBlocked) {
        openGenerationResultDialog({
          title: "字段仍需确认",
          tone: "warning",
          message: "编辑稿已保存，当前需求仍保留质量提示。",
          details: uniqueIssueMessages(relatedIssues),
          requirementId: requirement.id,
          ruleId,
          stageLabel: "需求规则",
          targetLabel,
        });
      } else {
        openGenerationResultDialog({
          title: "字段已保存",
          tone: "success",
          message:
            decision === "accept-manual"
              ? "手动编辑后的字段已保存。"
              : "智能修复补齐字段已采纳并保存。",
          requirementId: requirement.id,
          ruleId,
          stageLabel: "需求规则",
          targetLabel,
        });
      }
    },
    [
      openGenerationResultDialog,
      persistRequirementBaseline,
      requirementBaseline,
      rules,
      showRequirementReviewSaveFailure,
    ],
  );

  const acceptRequirementAiSuggestions = useCallback(
    async (
      ruleId: string,
      mode: "ai-accepted" | "manual-edited" = "ai-accepted",
      fieldValues?: Partial<Record<AtomicRequirementField, string>>,
    ) => {
      await updateRequirementAiSuggestionReview(
        ruleId,
        mode === "manual-edited" ? "accept-manual" : "accept-ai",
        fieldValues,
      );
    },
    [updateRequirementAiSuggestionReview],
  );

  const rejectRequirementAiSuggestions = useCallback(
    async (ruleId: string) => {
      await updateRequirementAiSuggestionReview(ruleId, "reject");
    },
    [updateRequirementAiSuggestionReview],
  );

  const confirmRequirementQualityHint = useCallback(
    async (ruleId: string) => {
      if (!requirementBaseline) return;
      const requirement = requirementBaseline.requirements.find(
        (item) => item.sourceRuleId === ruleId,
      );
      if (!requirement) return;
      const reviewedRequirement = markRequirementReviewed(requirement);
      const nextBaseline = mergeReviewedRequirement(
        requirementBaseline,
        reviewedRequirement,
      );
      try {
        await persistRequirementBaseline(nextBaseline);
      } catch (error) {
        showRequirementReviewSaveFailure(error, ruleId);
        return;
      }
      openGenerationResultDialog({
        title: "需求提示已确认",
        tone: "success",
        message: "当前需求质量提示已标记为已确认，可继续后续生成。",
        requirementId: reviewedRequirement.id,
        ruleId,
        stageLabel: "需求规则",
        targetLabel:
          rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则",
      });
    },
    [
      openGenerationResultDialog,
      persistRequirementBaseline,
      requirementBaseline,
      rules,
      showRequirementReviewSaveFailure,
    ],
  );

  const repairRequirementRuleCandidate = useCallback(
    async (
      ruleId: string,
      baselineOverride?: RequirementBaseline,
      rulesOverride?: RequirementRule[],
    ): Promise<
      WorkspaceRecord["requirementReviewCandidates"][string] | null
    > => {
      const baseline = baselineOverride ?? requirementBaseline;
      if (!baseline) return null;
      const activeRules = rulesOverride ?? rules;
      const rule = activeRules.find((item) => item.id === ruleId);
      const requirement = baseline.requirements.find(
        (item) => item.sourceRuleId === ruleId,
      );
      if (!rule || !requirement) return null;
      const createdAt = new Date().toISOString();
      if (!repository.repairRequirementRule) {
        return {
          ruleId,
          beforeRequirement: structuredClone(requirement) as AtomicRequirement,
          afterRequirement: null,
          repairRationale: null,
          blockingReasons: [],
          status: "failed",
          errorMessage: "当前环境不支持单项智能修复",
          createdAt,
        };
      }
      try {
        const runInput = createStartRunInput(
          requirementText,
          selectedDiagrams,
          activeRules,
        );
        const repairResult = await repository.repairRequirementRule({
          requirementText,
          rule,
          baseline,
          providerSettings: runInput.providerSettings,
        });
        return {
          ruleId,
          beforeRequirement: structuredClone(requirement) as AtomicRequirement,
          afterRequirement: repairResult.requirement,
          repairRationale: repairResult.repairRationale,
          blockingReasons: repairResult.blockingReasons,
          status: "pending",
          errorMessage: null,
          createdAt,
        };
      } catch (error) {
        return {
          ruleId,
          beforeRequirement: structuredClone(requirement) as AtomicRequirement,
          afterRequirement: null,
          repairRationale: null,
          blockingReasons: [],
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "模型返回内容无法解析。",
          createdAt,
        };
      }
    },
    [repository, requirementBaseline, requirementText, rules, selectedDiagrams],
  );

  const repairRequirementRuleCandidates = useCallback(
    async (
      ruleIds: string[],
      baselineOverride?: RequirementBaseline,
      rulesOverride?: RequirementRule[],
    ): Promise<WorkspaceRecord["requirementReviewCandidates"]> => {
      const baseline = baselineOverride ?? requirementBaseline;
      if (!baseline || ruleIds.length === 0) return {};
      const activeRules = rulesOverride ?? rules;
      const createdAt = new Date().toISOString();
      const requirementByRuleId = new Map(
        baseline.requirements
          .filter((requirement) => requirement.sourceRuleId)
          .map((requirement) => [requirement.sourceRuleId!, requirement]),
      );
      const failedCandidate = (
        ruleId: string,
        errorMessage: string,
      ): WorkspaceRecord["requirementReviewCandidates"][string] | null => {
        const requirement = requirementByRuleId.get(ruleId);
        if (!requirement) return null;
        return {
          ruleId,
          beforeRequirement: structuredClone(requirement) as AtomicRequirement,
          afterRequirement: null,
          repairRationale: null,
          blockingReasons: [],
          status: "failed",
          errorMessage,
          createdAt,
        };
      };
      if (!repository.repairRequirementRules) {
        return Object.fromEntries(
          ruleIds
            .map(
              (ruleId) =>
                [
                  ruleId,
                  failedCandidate(ruleId, "当前环境不支持批量智能修复"),
                ] as const,
            )
            .filter(
              (
                entry,
              ): entry is readonly [
                string,
                WorkspaceRecord["requirementReviewCandidates"][string],
              ] => Boolean(entry[1]),
            ),
        );
      }
      try {
        const runInput = createStartRunInput(
          requirementText,
          selectedDiagrams,
          activeRules,
        );
        const repairResult = await repository.repairRequirementRules({
          requirementText,
          rules: activeRules,
          targetRuleIds: ruleIds,
          baseline,
          providerSettings: runInput.providerSettings,
        });
        const nextCandidates: WorkspaceRecord["requirementReviewCandidates"] =
          {};
        for (const candidate of repairResult.candidates) {
          const requirement = requirementByRuleId.get(candidate.ruleId);
          if (!requirement) continue;
          nextCandidates[candidate.ruleId] = {
            ruleId: candidate.ruleId,
            beforeRequirement: structuredClone(
              requirement,
            ) as AtomicRequirement,
            afterRequirement: candidate.requirement,
            repairRationale: candidate.repairRationale,
            blockingReasons: candidate.blockingReasons,
            status: "pending",
            errorMessage: null,
            createdAt,
          };
        }
        for (const failure of repairResult.failures) {
          const candidate = failedCandidate(
            failure.ruleId,
            failure.errorMessage,
          );
          if (candidate) nextCandidates[failure.ruleId] = candidate;
        }
        for (const ruleId of ruleIds) {
          if (nextCandidates[ruleId]) continue;
          const candidate = failedCandidate(
            ruleId,
            "批量智能修复没有返回当前规则结果",
          );
          if (candidate) nextCandidates[ruleId] = candidate;
        }
        return nextCandidates;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "模型返回内容无法解析。";
        return Object.fromEntries(
          ruleIds
            .map(
              (ruleId) =>
                [ruleId, failedCandidate(ruleId, errorMessage)] as const,
            )
            .filter(
              (
                entry,
              ): entry is readonly [
                string,
                WorkspaceRecord["requirementReviewCandidates"][string],
              ] => Boolean(entry[1]),
            ),
        );
      }
    },
    [repository, requirementBaseline, requirementText, rules, selectedDiagrams],
  );

  const repairRequirementRule = useCallback(
    async (ruleId: string) => {
      const candidate = await repairRequirementRuleCandidate(ruleId);
      if (!candidate) return;
      await persistRequirementReviewCandidates({
        ...requirementReviewCandidates,
        [ruleId]: candidate,
      });
      if (candidate.status === "failed") {
        openGenerationResultDialog({
          title: "智能修复失败",
          tone: "destructive",
          message: candidate.errorMessage ?? "当前规则没有完成智能修复。",
          requirementId: candidate.beforeRequirement.id,
          ruleId,
          stageLabel: "需求规则",
          targetLabel:
            rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则",
        });
      }
    },
    [
      openGenerationResultDialog,
      persistRequirementReviewCandidates,
      repairRequirementRuleCandidate,
      requirementReviewCandidates,
      rules,
    ],
  );

  const decideRequirementReviewCandidate = useCallback(
    async (ruleId: string, decision: "accepted" | "rejected") => {
      if (!requirementBaseline) return;
      const candidate = requirementReviewCandidates[ruleId];
      if (!candidate) return;
      const selectedRequirement =
        decision === "accepted" && candidate.afterRequirement
          ? candidate.afterRequirement
          : candidate.beforeRequirement;
      const reviewedRequirement = markRequirementReviewed(selectedRequirement);
      const nextBaseline = mergeReviewedRequirement(
        requirementBaseline,
        reviewedRequirement,
      );
      const nextCandidates = {
        ...requirementReviewCandidates,
        [ruleId]: {
          ...candidate,
          status: decision,
          errorMessage: null,
        },
      };
      try {
        await persistRequirementReviewState(nextBaseline, nextCandidates);
      } catch (error) {
        showRequirementReviewSaveFailure(error, ruleId);
        return;
      }
      openGenerationResultDialog({
        title: decision === "accepted" ? "修复结果已采纳" : "修复结果已拒绝",
        tone: "success",
        message:
          decision === "accepted"
            ? "已保留修复后的需求规则，并标记为已确认。"
            : "已回到修复前的需求规则，并标记为已确认。",
        requirementId: reviewedRequirement.id,
        ruleId,
        stageLabel: "需求规则",
        targetLabel:
          rules.find((rule) => rule.id === ruleId)?.text ?? "当前需求规则",
      });
    },
    [
      openGenerationResultDialog,
      persistRequirementReviewState,
      requirementBaseline,
      requirementReviewCandidates,
      rules,
      showRequirementReviewSaveFailure,
    ],
  );

  const runController = useRunController();
  const latestInputRef = useRef({
    requirementText,
    rules,
    models,
    requirementModelTraceability,
    designModels,
    designModelTraceability,
    codeFiles,
    codeEditVersion,
  });

  useEffect(() => {
    latestInputRef.current = {
      requirementText,
      rules,
      models,
      requirementModelTraceability,
      designModels,
      designModelTraceability,
      codeFiles,
      codeEditVersion,
    };
  }, [
    codeEditVersion,
    codeFiles,
    designModelTraceability,
    designModels,
    models,
    requirementModelTraceability,
    requirementText,
    rules,
  ]);

  const selectGenerationTask = useCallback((id: string) => {
    setSelectedGenerationTaskId(id);
  }, []);

  const clearCompletedGenerationTasks = useCallback(() => {
    setGenerationTasks((current) => {
      const active = current.filter((task) => isTaskActive(task));
      setSelectedGenerationTaskId((selectedId) =>
        selectedId && active.some((task) => task.clientTaskId === selectedId)
          ? selectedId
          : (active[0]?.clientTaskId ?? null),
      );
      return active;
    });
  }, []);

  const enqueueGenerationTask = useCallback(
    (input: {
      kind: GenerationTaskKind;
      title: string;
      providerModel: string | null;
      documentKind?: DocumentKind;
      message: string;
      startedAtMs: number;
      subtasks?: GenerationTask["subtasks"];
    }) => {
      const clientTaskId = createClientTaskId(input.kind);
      const startedAt = new Date(input.startedAtMs).toISOString();
      const task = createGenerationTask({
        clientTaskId,
        kind: input.kind,
        title: input.title,
        providerModel: input.providerModel,
        documentKind: input.documentKind,
        message: input.message,
        subtasks: input.subtasks,
        startedAt,
      });
      setGenerationTasks((current) => [task, ...current].slice(0, 30));
      setSelectedGenerationTaskId(clientTaskId);
      return clientTaskId;
    },
    [],
  );

  const updateGenerationTask = useCallback(
    (
      clientTaskId: string,
      updater: (task: GenerationTask) => GenerationTask,
    ) => {
      setGenerationTasks((current) =>
        current.map((task) =>
          task.clientTaskId === clientTaskId ? updater(task) : task,
        ),
      );
    },
    [],
  );

  const applyWorkspaceRecord = useCallback((workspace: WorkspaceRecord) => {
    setRequirementTextRaw(workspace.requirementText);
    setRules(workspace.rules);
    setRequirementBaseline(workspace.requirementBaseline ?? null);
    setRequirementQualityReport(workspace.requirementQualityReport ?? null);
    setRequirementReviewCandidates(workspace.requirementReviewCandidates ?? {});
    setAutoGeneratedUpstreamReviews(
      workspace.autoGeneratedUpstreamReviews ?? {},
    );
    setModels(workspace.models);
    setRequirementModelTraceability(
      workspace.requirementModelTraceability ?? [],
    );
    setSelectedDiagrams([]);
    setPlantUml(workspace.plantUml);
    setSvgArtifacts(workspace.svgArtifacts);
    setDiagramErrors(workspace.diagramErrors);
    setSelectedDesignDiagrams([]);
    setDesignModels(workspace.designModels);
    setDesignModelTraceability(workspace.designModelTraceability ?? []);
    setDesignPlantUml(workspace.designPlantUml);
    setDesignSvgArtifacts(workspace.designSvgArtifacts);
    setDesignDiagramErrors(workspace.designDiagramErrors);
    setManualModelEditStatus(workspace.manualModelEditStatus ?? {});
    setCodeSpec(workspace.codeSpec);
    setCodeBusinessLogic(workspace.codeBusinessLogic);
    setCodeFiles(workspace.codeFiles);
    setCodeEntryFile(workspace.codeEntryFile);
    setCodeDependencies(workspace.codeDependencies);
    setCodeUiMockup(workspace.codeUiMockup);
    setCodeAgentPlan(workspace.codeAgentPlan);
    setCodeSkills(workspace.codeSkills);
    setCodeSkillDiagnostics(workspace.codeSkillDiagnostics);
    setCodeSkillResourcePlan(workspace.codeSkillResourcePlan);
    setCodeSkillContext(workspace.codeSkillContext);
    setCodeDiagnostics(workspace.codeDiagnostics);
    setGeneratedDiagrams(workspace.generatedDiagramTypes);
    setGeneratedDesignDiagrams(workspace.generatedDesignDiagramTypes);
    setRulesVersion(workspace.rulesVersion);
    setRulesBasedOnTextVersion(workspace.rulesBasedOnTextVersion);
    setRequirementInputFingerprint(
      workspace.requirementInputFingerprint ?? null,
    );
    setDiagramVersions(workspace.diagramVersions);
    setDiagramInputFingerprints(workspace.diagramInputFingerprints ?? {});
    setDesignInputFingerprints(workspace.designInputFingerprints ?? {});
    setRunUiState({
      runStatus: workspace.runStatus,
      runProgress: workspace.runProgress,
      runMessage: workspace.runMessage,
      errorMessage: workspace.errorMessage,
    });
    setTextVersion(0);
  }, []);

  useEffect(() => {
    let active = true;

    void repository
      .loadWorkspace()
      .then((workspace) => {
        if (!active) return;
        applyWorkspaceRecord(workspace);
        void repository
          .listRunHistory()
          .then((items) => {
            if (active) {
              setHistoryItems(items);
            }
          })
          .catch((error) => {
            if (!active) return;
            setRunUiState((current) => ({
              ...current,
              errorMessage:
                error instanceof Error ? error.message : "读取运行历史失败",
            }));
          });
      })
      .catch((error) => {
        if (!active) return;
        setRunUiState((current) => ({
          ...current,
          errorMessage:
            error instanceof Error ? error.message : "加载工作台失败",
        }));
      });

    return () => {
      active = false;
    };
  }, [applyWorkspaceRecord, repository]);

  const applyRunSnapshot = useCallback(
    (
      snapshot: WorkspaceRunSnapshot,
      baseTextVersion: number,
      mode: RunMode,
      options?: ApplyRunSnapshotOptions,
    ) => {
      const snapshotFingerprint = requirementInputFingerprintFor(
        snapshot.requirementText,
        snapshot.rules,
      );
      const activeRequirementFingerprint =
        mode.kind === "rules-only"
          ? snapshotFingerprint
          : requirementInputFingerprintFor(
              latestInputRef.current.requirementText,
              latestInputRef.current.rules,
            );
      const inputChanged =
        requirementInputFingerprint !== null &&
        !fingerprintMatches(
          requirementInputFingerprint,
          activeRequirementFingerprint,
        );
      const nextRulesVersion = inputChanged
        ? rulesVersion + 1
        : rulesVersion || 1;
      const mapped = snapshotToMaps(snapshot);
      const snapshotDiagrams = diagramsFromRequirementSnapshot(snapshot);
      const successfulSnapshotDiagrams =
        successfulRequirementDiagramsFromSnapshot(snapshot);
      const successfulAffectedDiagrams =
        mode.kind === "partial-diagrams"
          ? orderedRequirementDiagrams(
              successfulSnapshotDiagrams.filter((diagram) =>
                mode.diagrams.includes(diagram),
              ),
            )
          : successfulSnapshotDiagrams;
      const successfulScope = requirementSnapshotScope(
        snapshot,
        successfulAffectedDiagrams,
      );

      if (mode.kind === "rules-only") {
        setRules(snapshot.rules);
        if (!options?.preserveRuleReviewState) {
          setRequirementBaseline(snapshot.requirementBaseline ?? null);
          setRequirementQualityReport(
            snapshot.requirementBaseline?.qualityReport ?? null,
          );
          setRequirementReviewCandidates({});
          void repository.updateRequirementReviewCandidates?.({});
        }
      }
      setRulesVersion(nextRulesVersion);
      setRulesBasedOnTextVersion(baseTextVersion);
      setRequirementInputFingerprint(activeRequirementFingerprint);
      setDiagramErrors((current) => {
        const affected =
          mode.kind === "partial-diagrams" ? mode.diagrams : snapshotDiagrams;
        const next = { ...current };
        for (const diagram of affected) {
          delete next[diagram];
          for (const key of Object.keys(next)) {
            if (key.startsWith(`${diagram}:`)) {
              delete next[key as DiagramType];
            }
          }
        }
        for (const [diagram, error] of Object.entries(snapshot.diagramErrors)) {
          next[diagram as DiagramType] = error;
        }
        return next;
      });

      if (mode.kind === "rules-only") {
        return;
      }

      setModels((current) => {
        const next = clearRequirementScopedRecordForScope(
          current,
          successfulScope,
        );
        const successfulModels = keepRequirementScopedRecordForScope(
          mapped.models,
          successfulScope,
        );
        for (const [modelId, model] of Object.entries(successfulModels)) {
          next[modelId] = model;
        }
        return next;
      });
      setRequirementModelTraceability((current) => {
        const snapshotTraceability =
          snapshot.requirementModelTraceability ?? [];
        return [
          ...current.filter(
            (entry) => !traceabilityEntryMatchesScope(entry, successfulScope),
          ),
          ...snapshotTraceability.filter((entry) =>
            traceabilityEntryMatchesScope(entry, successfulScope),
          ),
        ];
      });

      setPlantUml((current) => {
        const next = clearRequirementScopedRecordForScope(
          current,
          successfulScope,
        );
        const successfulPlantUml = keepRequirementScopedRecordForScope(
          mapped.plantUml,
          successfulScope,
        );
        for (const [modelId, source] of Object.entries(successfulPlantUml)) {
          next[modelId] = source;
        }
        return next;
      });

      setSvgArtifacts((current) => {
        const next = clearRequirementScopedRecordForScope(
          current,
          successfulScope,
        );
        const successfulSvgArtifacts = keepRequirementScopedRecordForScope(
          mapped.svgArtifacts,
          successfulScope,
        );
        for (const [modelId, artifact] of Object.entries(
          successfulSvgArtifacts,
        )) {
          next[modelId] = artifact;
        }
        return next;
      });

      setGeneratedDiagrams((current) => {
        return Array.from(new Set([...current, ...successfulAffectedDiagrams]));
      });
      setSelectedDiagrams([]);

      setDiagramVersions((current) => {
        const next = { ...current };
        for (const diagram of successfulAffectedDiagrams) {
          next[diagram] = nextRulesVersion;
        }
        return next;
      });
      setDiagramInputFingerprints((current) => {
        const next = { ...current };
        for (const diagram of successfulAffectedDiagrams) {
          next[diagram] = activeRequirementFingerprint;
        }
        return next;
      });
    },
    [repository, requirementInputFingerprint, rulesVersion],
  );

  const applyDesignRunSnapshot = useCallback(
    (
      snapshot: WorkspaceDesignRunSnapshot,
      requestedDiagrams: DesignDiagramType[],
      generatedOverride?: DesignDiagramType[],
    ) => {
      const mapped = designSnapshotToMaps(snapshot);
      const currentDesignFingerprint = designInputFingerprintFor(
        snapshot.requirementModels,
        snapshot.requirementModelTraceability,
      );
      setSelectedDesignDiagrams([]);
      setDesignModels((current) => ({
        ...current,
        ...mapped.models,
      }));
      setDesignModelTraceability((current) => {
        const affected = new Set(snapshot.selectedDiagrams);
        const snapshotTraceability = snapshot.designModelTraceability ?? [];
        return [
          ...current.filter(
            (entry) =>
              !affected.has(entry.source.diagramKind as DesignDiagramType),
          ),
          ...snapshotTraceability,
        ];
      });
      setDesignPlantUml((current) => ({
        ...current,
        ...mapped.plantUml,
      }));
      setDesignSvgArtifacts((current) => ({
        ...current,
        ...mapped.svgArtifacts,
      }));
      setDesignDiagramErrors((current) => {
        const next = { ...current };
        for (const diagram of snapshot.selectedDiagrams) {
          delete next[diagram];
          for (const key of Object.keys(next)) {
            if (key.startsWith(`${diagram}:`)) {
              delete next[key];
            }
          }
        }
        return {
          ...next,
          ...snapshot.diagramErrors,
        };
      });
      const generatedDiagramsForSnapshot =
        generatedOverride ?? snapshot.selectedDiagrams;
      setGeneratedDesignDiagrams((current) =>
        Array.from(new Set([...current, ...generatedDiagramsForSnapshot])),
      );
      setDesignInputFingerprints((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.keys(mapped.models).map((modelId) => [
            modelId,
            currentDesignFingerprint,
          ]),
        ),
      }));
    },
    [],
  );

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

  const applyRestoredSnapshot = useCallback(
    (snapshot: RunHistorySnapshot) => {
      const restoredRulesVersion = rulesVersion + 1;
      const restoredRequirementFingerprint = requirementInputFingerprintFor(
        snapshot.requirementText,
        "rules" in snapshot ? snapshot.rules : [],
      );
      setRequirementTextRaw(snapshot.requirementText);
      void repository.updateRequirementText(snapshot.requirementText);
      setRules("rules" in snapshot ? snapshot.rules : []);
      setRulesVersion(restoredRulesVersion);
      setRulesBasedOnTextVersion(textVersion);
      setRequirementInputFingerprint(restoredRequirementFingerprint);
      setRequirementReviewCandidates({});

      if (isDocumentRunSnapshot(snapshot)) {
        setRunUiState({
          runStatus: snapshot.status,
          runProgress:
            snapshot.status === "completed" || snapshot.status === "failed"
              ? 100
              : 0,
          runMessage:
            snapshot.status === "completed" ? "已恢复说明书记录" : null,
          errorMessage: runErrorMessage(snapshot),
        });
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "document",
          runId: snapshot.runId,
          activeStage: snapshot.currentStage,
          finishedAt:
            snapshot.status === "completed" || snapshot.status === "failed"
              ? new Date().toISOString()
              : null,
          streamText: runErrorMessage(snapshot) ?? "",
        });
        return;
      }

      if (isCodeRunSnapshot(snapshot)) {
        const restoredDesignModels = Object.fromEntries(
          snapshot.designModels.map((model) => [
            getDesignModelId(model),
            model,
          ]),
        ) as WorkspaceRecord["designModels"];
        const restoredDesignDiagrams = snapshot.designModels.map(
          (model) => model.diagramKind,
        );

        setModels({});
        setRequirementModelTraceability([]);
        setSelectedDiagrams([]);
        setPlantUml({});
        setSvgArtifacts({});
        setDiagramErrors({});
        setGeneratedDiagrams([]);
        setDiagramVersions({});
        setDiagramInputFingerprints({});
        setSelectedDesignDiagrams([]);
        setDesignModels(restoredDesignModels);
        setDesignModelTraceability([]);
        setDesignPlantUml({});
        setDesignSvgArtifacts({});
        setDesignDiagramErrors({});
        setGeneratedDesignDiagrams(restoredDesignDiagrams);
        setDesignInputFingerprints({});
        applyCodeRunSnapshot(snapshot);
      } else if (isDesignRunSnapshot(snapshot)) {
        const mapped = designSnapshotToMaps(snapshot);
        const restoredRequirementModels = Object.fromEntries(
          snapshot.requirementModels.map((model) => [
            getRequirementModelId(model),
            model,
          ]),
        ) as WorkspaceRecord["models"];
        const restoredRequirementDiagrams = snapshot.requirementModels.map(
          (model) => model.diagramKind,
        );

        setModels(restoredRequirementModels);
        setRequirementModelTraceability(
          snapshot.requirementModelTraceability ?? [],
        );
        setSelectedDiagrams([]);
        setPlantUml({});
        setSvgArtifacts({});
        setDiagramErrors({});
        setGeneratedDiagrams(restoredRequirementDiagrams);
        setDiagramVersions(
          Object.fromEntries(
            restoredRequirementDiagrams.map((diagram) => [
              diagram,
              restoredRulesVersion,
            ]),
          ),
        );
        setDiagramInputFingerprints(
          Object.fromEntries(
            restoredRequirementDiagrams.map((diagram) => [
              diagram,
              restoredRequirementFingerprint,
            ]),
          ),
        );
        setSelectedDesignDiagrams([]);
        setDesignModels(mapped.models);
        setDesignModelTraceability(snapshot.designModelTraceability ?? []);
        setDesignPlantUml(mapped.plantUml);
        setDesignSvgArtifacts(mapped.svgArtifacts);
        setDesignDiagramErrors(snapshot.diagramErrors);
        setGeneratedDesignDiagrams([...snapshot.selectedDiagrams]);
        setDesignInputFingerprints(
          Object.fromEntries(
            Object.keys(mapped.models).map((modelId) => [
              modelId,
              designInputFingerprintFor(
                snapshot.requirementModels,
                snapshot.requirementModelTraceability,
              ),
            ]),
          ),
        );
        setCodeSpec(null);
        setCodeBusinessLogic(null);
        setCodeFiles({});
        setCodeEntryFile(null);
        setCodeDependencies({});
        setCodeAgentPlan([]);
        setCodeSkills([]);
        setCodeSkillDiagnostics([]);
        setCodeSkillResourcePlan(null);
        setCodeSkillContext(null);
        setCodeDiagnostics([]);
      } else {
        const mapped = snapshotToMaps(snapshot);
        setModels(mapped.models);
        setRequirementModelTraceability(
          snapshot.requirementModelTraceability ?? [],
        );
        setSelectedDiagrams([]);
        setPlantUml(mapped.plantUml);
        setSvgArtifacts(mapped.svgArtifacts);
        setDiagramErrors(snapshot.diagramErrors);
        setGeneratedDiagrams([...snapshot.selectedDiagrams]);
        setDiagramVersions(
          Object.fromEntries(
            snapshot.selectedDiagrams.map((diagram) => [
              diagram,
              restoredRulesVersion,
            ]),
          ),
        );
        setDiagramInputFingerprints(
          Object.fromEntries(
            snapshot.selectedDiagrams.map((diagram) => [
              diagram,
              restoredRequirementFingerprint,
            ]),
          ),
        );
        setSelectedDesignDiagrams([]);
        setDesignModels({});
        setDesignModelTraceability([]);
        setDesignPlantUml({});
        setDesignSvgArtifacts({});
        setDesignDiagramErrors({});
        setGeneratedDesignDiagrams([]);
        setDesignInputFingerprints({});
        setCodeSpec(null);
        setCodeBusinessLogic(null);
        setCodeFiles({});
        setCodeEntryFile(null);
        setCodeDependencies({});
        setCodeAgentPlan([]);
        setCodeSkills([]);
        setCodeSkillDiagnostics([]);
        setCodeSkillResourcePlan(null);
        setCodeSkillContext(null);
        setCodeDiagnostics([]);
      }

      setRunUiState({
        runStatus: snapshot.status,
        runProgress:
          snapshot.status === "completed" || snapshot.status === "failed"
            ? 100
            : 0,
        runMessage: snapshot.status === "completed" ? "已恢复历史快照" : null,
        errorMessage: runErrorMessage(snapshot),
      });
      setCurrentRunDiagnostics({
        ...createEmptyDiagnostics(),
        runKind: isCodeRunSnapshot(snapshot)
          ? "code"
          : isDesignRunSnapshot(snapshot)
            ? "design"
            : "requirements",
        runId: snapshot.runId,
        activeStage: snapshot.currentStage,
        finishedAt:
          snapshot.status === "completed" || snapshot.status === "failed"
            ? new Date().toISOString()
            : null,
        streamText: runErrorMessage(snapshot) ?? "",
        uiMockup: isCodeRunSnapshot(snapshot) ? snapshot.uiMockup : null,
        uiReferenceSpec: isCodeRunSnapshot(snapshot)
          ? snapshot.uiReferenceSpec
          : null,
        uiFidelityReport: isCodeRunSnapshot(snapshot)
          ? snapshot.uiFidelityReport
          : null,
        visualDirection: isCodeRunSnapshot(snapshot)
          ? snapshot.visualDirection
          : null,
        skillResourceDiscoveryPlan: isCodeRunSnapshot(snapshot)
          ? snapshot.skillResourceDiscoveryPlan
          : null,
        skillResourcePreviews: isCodeRunSnapshot(snapshot)
          ? snapshot.skillResourcePreviews
          : null,
        skillResourcePlan: isCodeRunSnapshot(snapshot)
          ? snapshot.skillResourcePlan
          : null,
        codeSkillContext: isCodeRunSnapshot(snapshot)
          ? snapshot.codeSkillContext
          : null,
        codeTrace: isCodeRunSnapshot(snapshot)
          ? (snapshot.codeTrace ?? [])
          : [],
        requirementTrace:
          !isCodeRunSnapshot(snapshot) && !isDesignRunSnapshot(snapshot)
            ? (snapshot.requirementTrace ?? [])
            : [],
        designTrace: isDesignRunSnapshot(snapshot)
          ? (snapshot.designTrace ?? [])
          : [],
      });
    },
    [applyCodeRunSnapshot, repository, rulesVersion, textVersion],
  );

  const refreshHistory = useCallback(async () => {
    setHistoryItems(await repository.listRunHistory());
  }, [repository]);

  const restoreRunHistory = useCallback(
    async (id: string) => {
      const item = await repository.restoreRunHistory(id);
      if (!item) {
        throw new Error("历史快照不存在");
      }
      if (!item.snapshot) {
        applyWorkspaceRecord(await repository.loadWorkspace());
        setHistoryItems(await repository.listRunHistory());
        return;
      }
      applyRestoredSnapshot(item.snapshot);
    },
    [applyRestoredSnapshot, applyWorkspaceRecord, repository],
  );

  const deleteRunHistory = useCallback(
    async (id: string) => {
      setHistoryItems(await repository.deleteRunHistory(id));
    },
    [repository],
  );

  const clearRunHistory = useCallback(async () => {
    await repository.clearRunHistory();
    setHistoryItems([]);
  }, [repository]);

  const saveHistorySnapshot = useCallback(
    async (
      snapshot: RunHistorySnapshot,
      meta: { providerModel: string; durationMs?: number },
    ) => {
      try {
        await repository.saveRunHistory(snapshot, meta);
        setHistoryItems(await repository.listRunHistory());
      } catch (error) {
        console.warn("Failed to save run history snapshot", error);
        toast.message("历史快照过大，已跳过保存，不影响当前结果");
        try {
          setHistoryItems(await repository.listRunHistory());
        } catch {
          // The generated result is more important than a secondary history refresh failure.
        }
      }
    },
    [repository],
  );

  const runGeneration = useCallback(
    async (
      diagrams: DiagramType[],
      mode: RunMode,
      inputOverride?: {
        rules?: RequirementRule[];
        contextModels?: DiagramModelSpec[];
        contextRequirementModelTraceability?: RequirementModelTraceabilityEntry[];
        analysisTargetUseCaseIds?: string[];
      },
      options?: RunGenerationOptions,
    ) => {
      const runRequestId = runController.beginRun("requirements");
      const baseTextVersion = textVersion;
      const rulesForRun =
        mode.kind === "rules-only" ? [] : (inputOverride?.rules ?? rules);
      const baseInputFingerprint = snapshotInputFingerprint({
        requirementText,
        rules: rulesForRun,
      });
      let lastCompletedSnapshot: WorkspaceRunSnapshot | null = null;
      let runId: string | null = null;
      const startedAtMs = Date.now();
      let providerModel = "";
      let clientTaskId: string | null = null;

      try {
        const currentPendingRequirementReviews =
          requirementRuleIdsBlockingGeneration(
            requirementBaseline,
            requirementReviewCandidates,
          );
        if (
          mode.kind !== "rules-only" &&
          currentPendingRequirementReviews.length > 0
        ) {
          throw new Error("请先确认需求规则修复结果");
        }
        const startInput = createStartRunInput(
          requirementText,
          diagrams,
          rulesForRun.filter(
            (rule) =>
              rule.id.trim() &&
              rule.text.trim() &&
              rule.relatedDiagrams.length > 0,
          ),
          mode.kind === "rules-only"
            ? []
            : (inputOverride?.contextModels ??
                Object.values(models).filter(
                  (model): model is DiagramModelSpec => Boolean(model),
                )),
          mode.kind === "rules-only"
            ? []
            : (inputOverride?.contextRequirementModelTraceability ??
                requirementModelTraceability),
          mode.kind === "rules-only"
            ? []
            : (inputOverride?.analysisTargetUseCaseIds ?? []),
        );
        providerModel = startInput.providerSettings.model;
        clientTaskId = enqueueGenerationTask({
          kind: "requirements",
          title: mode.kind === "rules-only" ? "需求规则生成" : "需求模型生成",
          providerModel,
          message: "任务已进入队列",
          startedAtMs,
          subtasks:
            mode.kind === "rules-only"
              ? [
                  {
                    id: "extract_rules",
                    label: "抽取需求规则",
                    status: "queued",
                    message: null,
                    errorMessage: null,
                  },
                  {
                    id: "repair_rules",
                    label: "修复需求规则",
                    status: "queued",
                    message: null,
                    errorMessage: null,
                  },
                ]
              : requirementGenerationSubtasks(
                  diagrams,
                  models,
                  inputOverride?.analysisTargetUseCaseIds,
                ),
        });
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("requirements");
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "requirements",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startRun(startInput);
        runId = started.runId;
        updateGenerationTask(clientTaskId, (task) =>
          assignTaskRunId(task, runId!, providerModel),
        );
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToRun(runId, (event) => {
          if (clientTaskId) {
            updateGenerationTask(clientTaskId, (task) =>
              updateTaskFromEvent(task, event, {
                queued: "任务已进入队列",
                completed: "生成完成",
              }),
            );
          }
          if (!runController.isCurrentRun(runRequestId, "requirements")) {
            return;
          }

          const progress = getProgressFromEvent(event);
          if (event.type === "completed") {
            lastCompletedSnapshot = event.snapshot as WorkspaceRunSnapshot;
          }
          if (runId && shouldRefreshRunSnapshotFromEvent(event)) {
            const eventDiagramKind =
              "diagramKind" in event ? event.diagramKind : undefined;
            const refreshMode: RunMode =
              eventDiagramKind &&
              eventDiagramKind !== "sequence" &&
              eventDiagramKind !== "table"
                ? {
                    kind: "partial-diagrams",
                    diagrams: [eventDiagramKind as DiagramType],
                  }
                : mode;
            void repository
              .getRunSnapshot(runId)
              .then((partialSnapshot) => {
                if (
                  partialSnapshot &&
                  runController.isCurrentRun(runRequestId, "requirements")
                ) {
                  applyRunSnapshot(
                    partialSnapshot,
                    baseTextVersion,
                    refreshMode,
                  );
                }
              })
              .catch(() => {
                // Incremental refresh is best-effort; terminal snapshot still reconciles state.
              });
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt: isTerminalRunEvent(event)
              ? diagnosticEvent.at
              : current.finishedAt,
            activeStage: "stage" in event ? event.stage : current.activeStage,
            streamText: isMeaningfulLlmChunkEvent(event)
              ? appendDiagnosticStream(current.streamText, event.chunk)
              : current.streamText,
            chunkCount: isMeaningfulLlmChunkEvent(event)
              ? current.chunkCount + 1
              : current.chunkCount,
            stageStartedAt:
              event.type === "stage_started"
                ? {
                    ...current.stageStartedAt,
                    [event.stage]: diagnosticEvent.at,
                  }
                : current.stageStartedAt,
            stageMessages:
              event.type === "stage_progress" && event.message
                ? { ...current.stageMessages, [event.stage]: event.message }
                : current.stageMessages,
            designTrace:
              event.type === "completed" && "designTrace" in event.snapshot
                ? (event.snapshot.designTrace ?? [])
                : current.designTrace,
            requirementTrace:
              event.type === "completed" && "requirementTrace" in event.snapshot
                ? (event.snapshot.requirementTrace ?? [])
                : current.requirementTrace,
            events: shouldDisplayDiagnosticEvent(event)
              ? [...current.events, diagnosticEvent].slice(-80)
              : current.events,
          }));

          setRunUiState((current) => ({
            runStatus: statusFromRunEvent(event),
            runProgress: progress ?? current.runProgress,
            runMessage:
              event.type === "stage_progress"
                ? (event.message ?? current.runMessage)
                : event.type === "queued"
                  ? "任务已进入队列"
                  : event.type === "completed"
                    ? "生成完成"
                    : event.type === "cancelled"
                      ? event.message
                      : event.type === "failed"
                        ? event.error.message
                        : current.runMessage,
            errorMessage:
              event.type === "failed"
                ? event.error.message
                : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getRunSnapshot(runId)) ?? lastCompletedSnapshot;
        if (
          !snapshot ||
          !runController.isCurrentRun(runRequestId, "requirements")
        ) {
          return null;
        }
        if (snapshot.status === "cancelled") {
          setRunUiState({
            runStatus: "cancelled",
            runProgress: 100,
            runMessage: cancelledRunMessage(snapshot),
            errorMessage: null,
          });
          openGenerationResultDialog({
            title: "任务已取消",
            tone: "warning",
            message: cancelledRunMessage(snapshot),
            runId: snapshot.runId,
            stageLabel: mode.kind === "rules-only" ? "需求规则" : "需求模型",
          });
          return null;
        }

        applyRunSnapshot(snapshot, baseTextVersion, mode, {
          preserveRuleReviewState: Boolean(options?.skipRuleRepairCandidates),
        });
        let repairPendingCount = 0;
        let repairFailedCount = 0;
        // Internal auto-upstream runs should hand their snapshot to the requested model run,
        // while explicit rule generation still owns repair review creation.
        if (
          mode.kind === "rules-only" &&
          snapshot.requirementBaseline &&
          !options?.skipRuleRepairCandidates
        ) {
          const reviewRuleIds = requirementRuleIdsNeedingReview(
            snapshot.requirementBaseline,
          );
          if (clientTaskId) {
            updateGenerationTask(clientTaskId, (task) => ({
              ...task,
              status: "running",
              progress: 85,
              message: "正在修复需求规则",
              phaseSummary:
                reviewRuleIds.length > 0
                  ? `正在修复 ${reviewRuleIds.length} 条待确认需求规则`
                  : "没有需要修复确认的需求规则",
              subtasks: task.subtasks.map((subtask) =>
                subtask.id === "extract_rules"
                  ? {
                      ...subtask,
                      status: "completed",
                      message: "需求规则已抽取",
                    }
                  : subtask.id === "repair_rules"
                    ? {
                        ...subtask,
                        status:
                          reviewRuleIds.length > 0 ? "repairing" : "completed",
                        message:
                          reviewRuleIds.length > 0
                            ? `正在修复 ${reviewRuleIds.length} 条规则`
                            : "无需修复",
                      }
                    : subtask,
              ),
            }));
          }
          setRunUiState({
            runStatus: "running",
            runProgress: 85,
            runMessage:
              reviewRuleIds.length > 0
                ? "正在修复需求规则"
                : "需求规则无需修复",
            errorMessage: null,
          });

          let nextCandidates: WorkspaceRecord["requirementReviewCandidates"] =
            {};
          if (reviewRuleIds.length > 0) {
            if (clientTaskId) {
              updateGenerationTask(clientTaskId, (task) => ({
                ...task,
                phaseSummary: `正在批量修复 ${reviewRuleIds.length} 条需求规则`,
                subtasks: task.subtasks.map((subtask) =>
                  subtask.id === "repair_rules"
                    ? {
                        ...subtask,
                        status: "repairing",
                        message: `正在批量修复 ${reviewRuleIds.length} 条规则`,
                      }
                    : subtask,
                ),
              }));
            }
            nextCandidates = await repairRequirementRuleCandidates(
              reviewRuleIds,
              snapshot.requirementBaseline,
              snapshot.rules,
            );
            await persistRequirementReviewCandidates(nextCandidates);
          } else {
            await persistRequirementReviewCandidates({});
          }
          repairPendingCount = Object.values(nextCandidates).filter(
            (candidate) => candidate.status === "pending",
          ).length;
          repairFailedCount = Object.values(nextCandidates).filter(
            (candidate) => candidate.status === "failed",
          ).length;
          if (clientTaskId) {
            updateGenerationTask(clientTaskId, (task) => ({
              ...task,
              status: "completed",
              progress: 100,
              message:
                repairFailedCount > 0
                  ? "需求规则修复有失败项"
                  : repairPendingCount > 0
                    ? "需求规则修复候选待确认"
                    : "需求规则生成完成",
              phaseSummary:
                repairFailedCount > 0
                  ? `${repairFailedCount} 条规则修复失败，请重试或重新生成。`
                  : repairPendingCount > 0
                    ? `${repairPendingCount} 条规则已生成修复候选，请确认后继续。`
                    : "需求规则生成完成。",
              subtasks: task.subtasks.map((subtask) =>
                subtask.id === "repair_rules"
                  ? {
                      ...subtask,
                      status:
                        repairFailedCount > 0
                          ? "failed"
                          : repairPendingCount > 0
                            ? "pending_review"
                            : "completed",
                      pendingReviewCount: repairPendingCount || undefined,
                      message:
                        repairFailedCount > 0
                          ? `${repairFailedCount} 条修复失败`
                          : repairPendingCount > 0
                            ? `${repairPendingCount} 条待确认`
                            : "修复完成",
                    }
                  : subtask,
              ),
            }));
          }
        }
        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "生成完成",
          errorMessage: null,
        });
        const qualityHintCount =
          snapshot.requirementBaseline?.qualityReport.issues.length ?? 0;
        const diagramFailureCount = diagramErrorCount(snapshot);
        if (!options?.suppressSuccessDialog) {
          openGenerationResultDialog({
            title:
              diagramFailureCount > 0
                ? "需求模型部分生成"
                : mode.kind === "rules-only"
                  ? "需求规则已生成"
                  : "需求模型已生成",
            tone:
              qualityHintCount > 0 ||
              repairPendingCount > 0 ||
              repairFailedCount > 0 ||
              diagramFailureCount > 0
                ? "warning"
                : "success",
            message:
              repairFailedCount > 0
                ? `生成完成，但有 ${repairFailedCount} 条需求规则修复失败，请重试后确认。`
                : repairPendingCount > 0
                  ? `生成完成，已生成 ${repairPendingCount} 条修复候选，请确认后继续生成模型。`
                  : completedRunResultMessage({
                      qualityHintCount,
                      diagramFailureCount,
                    }),
            runId: snapshot.runId,
            stageLabel: mode.kind === "rules-only" ? "需求规则" : "需求模型",
            targetLabel:
              mode.kind === "rules-only" ? "当前需求文本" : "已选需求模型",
          });
        }
        notifyGenerationCompleted("requirements");
        if (
          baseInputFingerprint !==
          snapshotInputFingerprint({
            requirementText: latestInputRef.current.requirementText,
            rules:
              mode.kind === "rules-only" ? [] : latestInputRef.current.rules,
          })
        ) {
          notifyGenerationResultStale();
        }
        return snapshot;
      } catch (error) {
        const billingBlock = parseBillingEntitlementError(error);
        const detail =
          billingBlock?.message ??
          (error instanceof Error ? error.message : "生成失败");
        if (clientTaskId) {
          updateGenerationTask(clientTaskId, (task) => ({
            ...task,
            status: "failed",
            progress: 100,
            message: null,
            errorMessage: detail,
            finishedAt: new Date().toISOString(),
            diagnostics: addLocalFailureToDiagnostics(task.diagnostics, detail),
          }));
        }
        if (!runController.isCurrentRun(runRequestId, "requirements")) {
          return null;
        }
        if (runId) {
          try {
            const failedSnapshot = await repository.getRunSnapshot(runId);
            if (failedSnapshot) {
              setCurrentRunDiagnostics((current) => ({
                ...current,
                requirementTrace:
                  failedSnapshot.requirementTrace ?? current.requirementTrace,
              }));
            }
          } catch {
            // The visible error state below is more useful than a secondary history failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: detail,
        });
        if (billingBlock) {
          openBillingEntitlementDialog(billingBlock, {
            runId,
            stageLabel: mode.kind === "rules-only" ? "需求规则" : "需求模型",
          });
        } else {
          openGenerationResultDialog({
            title: "生成失败",
            tone: "destructive",
            message: detail,
            details: ["请在当前页面查看问题并重新处理。"],
            runId,
            stageLabel: mode.kind === "rules-only" ? "需求规则" : "需求模型",
          });
        }
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local`,
              at: new Date().toISOString(),
              label: "failed",
              detail,
            },
          ].slice(-80),
        }));
        notifyGenerationFailed(`生成失败：${detail}`);
        return null;
      }
    },
    [
      applyRunSnapshot,
      models,
      openBillingEntitlementDialog,
      openGenerationResultDialog,
      persistRequirementReviewCandidates,
      repository,
      repairRequirementRuleCandidates,
      requirementBaseline,
      requirementModelTraceability,
      requirementReviewCandidates,
      requirementText,
      rules,
      runController,
      saveHistorySnapshot,
      textVersion,
    ],
  );

  const runDesignGeneration = useCallback(
    async (
      diagrams: DesignDiagramType[],
      requestedDiagrams: DesignDiagramType[] = diagrams,
      requirementContext?: DesignRequirementContext,
    ) => {
      const runRequestId = runController.beginRun("design");
      let lastCompletedSnapshot: WorkspaceDesignRunSnapshot | null = null;
      const baseInputFingerprint = snapshotInputFingerprint({
        requirementText,
        rules,
        models,
        requirementModelTraceability,
      });
      let runId: string | null = null;
      const startedAtMs = Date.now();
      let providerModel = "";
      let clientTaskId: string | null = null;

      try {
        const activeRequirementBaseline =
          requirementContext?.requirementBaseline ?? requirementBaseline;
        const activeRequirementModels =
          requirementContext?.requirementModels ??
          Object.values(models).filter((model): model is DiagramModelSpec =>
            Boolean(model),
          );
        const activeRequirementModelTraceability =
          requirementContext?.requirementModelTraceability ??
          requirementModelTraceability;
        const activeRequirementModelMap = Object.fromEntries(
          activeRequirementModels.map((model) => [
            getRequirementModelId(model),
            model,
          ]),
        ) as WorkspaceRecord["models"];
        const activeRequirementFingerprint = requirementInputFingerprintFor(
          requirementText,
          requirementContext?.rules ?? rules,
        );
        const currentPendingRequirementReviews =
          requirementRuleIdsBlockingGeneration(
            requirementBaseline,
            requirementReviewCandidates,
          );
        const currentRulesStale =
          rules.length > 0 &&
          (requirementInputFingerprint
            ? !fingerprintMatches(
                requirementInputFingerprint,
                activeRequirementFingerprint,
              )
            : rulesBasedOnTextVersion !== null &&
              rulesBasedOnTextVersion !== textVersion);
        const currentRequirementDiagrams = orderedRequirementDiagrams(
          Array.from(
            new Set([
              ...generatedDiagrams,
              ...(Object.keys(models).filter((diagram) =>
                Boolean(models[diagram as DiagramType]),
              ) as DiagramType[]),
            ]),
          ),
        );
        const currentStaleDiagrams = currentRequirementDiagrams.filter(
          (diagram) =>
            isRequirementDiagramStale({
              diagram,
              activeRequirementFingerprint,
              generatedDiagrams,
              requirementInputFingerprint,
              diagramInputFingerprints,
              diagramVersions,
              rulesVersion,
              models,
              requirementModelTraceability,
              manualModelEditStatus,
            }),
        );
        const requirementTraceabilityComplete =
          hasCompleteRequirementTraceability(
            Object.values(models),
            requirementModelTraceability,
            manualModelEditStatus,
          );
        const requirementTraceabilityMissing =
          requirementModelTraceability.length > 0
            ? !requirementTraceabilityComplete
            : generatedDiagrams.length > 0;
        if (
          !requirementContext &&
          (currentRulesStale || currentStaleDiagrams.length > 0)
        ) {
          throw new Error("需求模型基于旧需求规则，请先重新生成需求模型");
        }
        if (
          !requirementContext &&
          currentPendingRequirementReviews.length > 0
        ) {
          throw new Error("请先确认需求规则修复结果");
        }
        if (
          !requirementContext &&
          currentRequirementDiagrams.length > 0 &&
          requirementTraceabilityMissing
        ) {
          throw new Error("需求模型缺少完整元素级映射，请先重新生成需求模型");
        }
        if (
          !repository.startDesignRun ||
          !repository.subscribeToDesignRun ||
          !repository.getDesignRunSnapshot
        ) {
          throw new Error("当前仓储未实现设计阶段生成能力");
        }
        if (!activeRequirementBaseline) {
          throw new Error(
            "请先生成并确认需求规则，形成需求基线后再生成设计模型",
          );
        }
        const startInput = createStartDesignRunInput(
          activeRequirementBaseline,
          activeRequirementModels,
          activeRequirementModelTraceability,
          diagrams,
          requestedDiagrams,
          Object.values(designModels),
          designModelTraceability,
          Object.entries(designPlantUml).map(([artifactId, source]) => {
            const model = designModels[artifactId];
            return {
              diagramKind:
                model?.diagramKind ?? (artifactId as DesignDiagramType),
              modelId: model?.modelId,
              source,
            };
          }),
          Object.values(designSvgArtifacts),
        );
        providerModel = startInput.providerSettings.model;
        clientTaskId = enqueueGenerationTask({
          kind: "design",
          title: "设计模型生成",
          providerModel,
          message: "设计生成任务已进入队列",
          startedAtMs,
          subtasks: designGenerationSubtasks(
            diagrams,
            activeRequirementModelMap,
          ),
        });
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "设计生成任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("design");
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "design",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startDesignRun(startInput);
        runId = started.runId;
        updateGenerationTask(clientTaskId, (task) =>
          assignTaskRunId(task, runId!, providerModel),
        );
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToDesignRun(runId, (event) => {
          if (clientTaskId) {
            updateGenerationTask(clientTaskId, (task) =>
              updateTaskFromEvent(task, event, {
                queued: "设计生成任务已进入队列",
                completed: "设计生成完成",
              }),
            );
          }
          if (!runController.isCurrentRun(runRequestId, "design")) {
            return;
          }

          const progress = getProgressFromEvent(event);
          if (event.type === "completed") {
            lastCompletedSnapshot =
              event.snapshot as WorkspaceDesignRunSnapshot;
          }
          if (runId && shouldRefreshRunSnapshotFromEvent(event)) {
            void repository
              .getDesignRunSnapshot(runId)
              .then((partialSnapshot) => {
                if (
                  partialSnapshot &&
                  runController.isCurrentRun(runRequestId, "design")
                ) {
                  const generatedKinds = Array.from(
                    new Set(
                      partialSnapshot.svgArtifacts.map(
                        (artifact) => artifact.diagramKind,
                      ),
                    ),
                  );
                  applyDesignRunSnapshot(
                    partialSnapshot,
                    requestedDiagrams,
                    generatedKinds,
                  );
                }
              })
              .catch(() => {
                // Incremental refresh is best-effort; terminal snapshot still reconciles state.
              });
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt: isTerminalRunEvent(event)
              ? diagnosticEvent.at
              : current.finishedAt,
            activeStage: "stage" in event ? event.stage : current.activeStage,
            streamText: isMeaningfulLlmChunkEvent(event)
              ? appendDiagnosticStream(current.streamText, event.chunk)
              : current.streamText,
            chunkCount: isMeaningfulLlmChunkEvent(event)
              ? current.chunkCount + 1
              : current.chunkCount,
            stageStartedAt:
              event.type === "stage_started"
                ? {
                    ...current.stageStartedAt,
                    [event.stage]: diagnosticEvent.at,
                  }
                : current.stageStartedAt,
            stageMessages:
              event.type === "stage_progress" && event.message
                ? { ...current.stageMessages, [event.stage]: event.message }
                : current.stageMessages,
            designTrace:
              event.type === "completed" && "designTrace" in event.snapshot
                ? (event.snapshot.designTrace ?? [])
                : current.designTrace,
            events: shouldDisplayDiagnosticEvent(event)
              ? [...current.events, diagnosticEvent].slice(-80)
              : current.events,
          }));

          setRunUiState((current) => ({
            runStatus: statusFromRunEvent(event),
            runProgress: progress ?? current.runProgress,
            runMessage:
              event.type === "stage_progress"
                ? (event.message ?? current.runMessage)
                : event.type === "queued"
                  ? "设计生成任务已进入队列"
                  : event.type === "completed"
                    ? "设计生成完成"
                    : event.type === "cancelled"
                      ? event.message
                      : event.type === "failed"
                        ? event.error.message
                        : current.runMessage,
            errorMessage:
              event.type === "failed"
                ? event.error.message
                : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getDesignRunSnapshot(runId)) ??
          lastCompletedSnapshot;
        if (!snapshot || !runController.isCurrentRun(runRequestId, "design")) {
          return null;
        }
        if (snapshot.status === "cancelled") {
          setRunUiState({
            runStatus: "cancelled",
            runProgress: 100,
            runMessage: cancelledRunMessage(snapshot),
            errorMessage: null,
          });
          openGenerationResultDialog({
            title: "任务已取消",
            tone: "warning",
            message: cancelledRunMessage(snapshot),
            runId: snapshot.runId,
            stageLabel: "设计模型",
          });
          return null;
        }

        applyDesignRunSnapshot(snapshot, requestedDiagrams);
        setCurrentRunDiagnostics((current) => ({
          ...current,
          designTrace: snapshot.designTrace ?? [],
        }));
        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "设计生成完成",
          errorMessage: null,
        });
        const qualityHintCount =
          snapshot.requirementBaseline?.qualityReport.issues.length ?? 0;
        const diagramFailureCount = diagramErrorCount(snapshot);
        openGenerationResultDialog({
          title:
            diagramFailureCount > 0 ? "设计模型部分生成" : "设计模型已生成",
          tone:
            qualityHintCount > 0 || diagramFailureCount > 0
              ? "warning"
              : "success",
          message: completedRunResultMessage({
            qualityHintCount,
            diagramFailureCount,
          }),
          runId: snapshot.runId,
          stageLabel: "设计模型",
          targetLabel: "已选设计图",
        });
        notifyGenerationCompleted("design");
        if (
          baseInputFingerprint !==
          snapshotInputFingerprint({
            requirementText: latestInputRef.current.requirementText,
            rules: latestInputRef.current.rules,
            models: latestInputRef.current.models,
            requirementModelTraceability:
              latestInputRef.current.requirementModelTraceability,
          })
        ) {
          notifyGenerationResultStale();
        }
        return snapshot;
      } catch (error) {
        const billingBlock = parseBillingEntitlementError(error);
        const detail =
          billingBlock?.message ??
          (error instanceof Error ? error.message : "设计生成失败");
        if (clientTaskId) {
          updateGenerationTask(clientTaskId, (task) => ({
            ...task,
            status: "failed",
            progress: 100,
            message: null,
            errorMessage: detail,
            finishedAt: new Date().toISOString(),
            diagnostics: addLocalFailureToDiagnostics(task.diagnostics, detail),
          }));
        }
        if (!runController.isCurrentRun(runRequestId, "design")) {
          return null;
        }
        if (runId) {
          try {
            const failedSnapshot = await repository.getDesignRunSnapshot(runId);
            applyDesignRunSnapshot(failedSnapshot, requestedDiagrams);
            setCurrentRunDiagnostics((current) => ({
              ...current,
              designTrace: failedSnapshot.designTrace ?? [],
            }));
            await saveHistorySnapshot(failedSnapshot, {
              providerModel,
              durationMs: Date.now() - startedAtMs,
            });
          } catch {
            // The visible error state below is more useful than a secondary snapshot failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: detail,
        });
        if (billingBlock) {
          openBillingEntitlementDialog(billingBlock, {
            runId,
            stageLabel: "设计模型",
          });
        } else {
          openGenerationResultDialog({
            title: "生成失败",
            tone: "destructive",
            message: detail,
            details: ["设计生成未通过，请在设计模型页面查看问题并重新处理。"],
            runId,
            stageLabel: "设计模型",
          });
        }
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local`,
              at: new Date().toISOString(),
              label: "failed",
              detail,
            },
          ].slice(-80),
        }));
        notifyGenerationFailed(`设计生成失败：${detail}`);
        return null;
      }
    },
    [
      applyDesignRunSnapshot,
      designModelTraceability,
      designModels,
      designPlantUml,
      designSvgArtifacts,
      diagramInputFingerprints,
      diagramVersions,
      generatedDiagrams,
      manualModelEditStatus,
      models,
      openBillingEntitlementDialog,
      openGenerationResultDialog,
      repository,
      requirementBaseline,
      requirementInputFingerprint,
      requirementModelTraceability,
      requirementReviewCandidates,
      requirementText,
      runController,
      rules,
      rulesBasedOnTextVersion,
      rulesVersion,
      saveHistorySnapshot,
      textVersion,
    ],
  );

  const runCodeGeneration = useCallback(
    async (generationMode: "continue" | "regenerate" = "continue") => {
      const runRequestId = runController.beginRun("code");
      const baseInputFingerprint = snapshotInputFingerprint({
        requirementText,
        rules,
        designModels,
        designModelTraceability,
      });
      const baseCodeEditVersion = codeEditVersion;
      let lastCompletedSnapshot: WorkspaceCodeRunSnapshot | null = null;
      let runId: string | null = null;
      const startedAtMs = Date.now();
      let providerModel = "";
      let clientTaskId: string | null = null;

      try {
        if (
          !repository.startCodeRun ||
          !repository.subscribeToCodeRun ||
          !repository.getCodeRunSnapshot
        ) {
          throw new Error("当前仓储未实现代码生成能力");
        }
        const availableDesignModels = Object.values(designModels).filter(
          (model): model is DesignDiagramModelSpec => Boolean(model),
        );
        if (availableDesignModels.length === 0) {
          throw new Error("请先生成设计模型，再生成前端原型代码");
        }
        const currentPendingRequirementReviews =
          requirementRuleIdsBlockingGeneration(
            requirementBaseline,
            requirementReviewCandidates,
          );
        if (currentPendingRequirementReviews.length > 0) {
          throw new Error("请先确认需求规则修复结果");
        }
        const activeRequirementFingerprint = requirementInputFingerprintFor(
          requirementText,
          rules,
        );
        const currentRulesStale =
          rules.length > 0 &&
          (requirementInputFingerprint
            ? !fingerprintMatches(
                requirementInputFingerprint,
                activeRequirementFingerprint,
              )
            : rulesBasedOnTextVersion !== null &&
              rulesBasedOnTextVersion !== textVersion);
        const currentRequirementDiagrams = orderedRequirementDiagrams(
          Array.from(
            new Set([
              ...generatedDiagrams,
              ...(Object.keys(models).filter((diagram) =>
                Boolean(models[diagram as DiagramType]),
              ) as DiagramType[]),
            ]),
          ),
        );
        const currentStaleDiagrams = currentRequirementDiagrams.filter(
          (diagram) =>
            isRequirementDiagramStale({
              diagram,
              activeRequirementFingerprint,
              generatedDiagrams,
              requirementInputFingerprint,
              diagramInputFingerprints,
              diagramVersions,
              rulesVersion,
              models,
              requirementModelTraceability,
              manualModelEditStatus,
            }),
        );
        const requirementTraceabilityComplete =
          hasCompleteRequirementTraceability(
            Object.values(models),
            requirementModelTraceability,
            manualModelEditStatus,
          );
        const requirementTraceabilityMissing =
          requirementModelTraceability.length > 0
            ? !requirementTraceabilityComplete
            : generatedDiagrams.length > 0;
        const activeDesignFingerprint = designInputFingerprintFor(
          Object.values(models).filter((model): model is DiagramModelSpec =>
            Boolean(model),
          ),
          requirementModelTraceability,
        );
        const designFreshnessComplete = Object.entries(designModels).every(
          ([modelId]) =>
            designFingerprintMatches(
              designInputFingerprints[modelId],
              activeDesignFingerprint,
            ),
        );
        const designTraceabilityComplete = hasCompleteDesignTraceability(
          Object.values(designModels),
          designModelTraceability,
          manualModelEditStatus,
          Object.values(models),
        );
        if (currentRulesStale || currentStaleDiagrams.length > 0) {
          throw new Error("需求模型基于旧需求规则，请先重新生成需求模型");
        }
        if (
          currentRequirementDiagrams.length > 0 &&
          requirementTraceabilityMissing
        ) {
          throw new Error("需求模型缺少完整元素级映射，请先重新生成需求模型");
        }
        if (
          generatedDesignDiagrams.length > 0 &&
          (!designFreshnessComplete || !designTraceabilityComplete)
        ) {
          throw new Error("设计模型缺少完整元素级映射，请先重新生成设计模型");
        }
        const availableDesignPlantUml = Object.entries(designPlantUml)
          .filter(([, source]) => source.trim().length > 0)
          .map(([artifactId, source]) => {
            const model = designModels[artifactId];
            const svgArtifact = designSvgArtifacts[artifactId];
            return {
              diagramKind:
                model?.diagramKind ??
                svgArtifact?.diagramKind ??
                (artifactId as DesignDiagramType),
              modelId: model?.modelId ?? svgArtifact?.modelId,
              source,
            };
          });

        const startInput = createStartCodeRunInput(
          requirementText,
          rules,
          availableDesignModels,
          availableDesignPlantUml,
          codeFiles,
          generationMode,
        );
        providerModel = startInput.providerSettings.model;
        clientTaskId = enqueueGenerationTask({
          kind: "code",
          title: generationMode === "regenerate" ? "代码重新生成" : "代码生成",
          providerModel,
          message: "代码生成任务已进入队列",
          startedAtMs,
        });
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "代码生成任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("code");
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "code",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startCodeRun(startInput);
        runId = started.runId;
        updateGenerationTask(clientTaskId, (task) =>
          assignTaskRunId(task, runId!, providerModel),
        );
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToCodeRun(runId, (event) => {
          if (clientTaskId) {
            updateGenerationTask(clientTaskId, (task) =>
              updateTaskFromEvent(task, event, {
                queued: "代码生成任务已进入队列",
                completed:
                  event.type === "completed" &&
                  "files" in event.snapshot &&
                  event.snapshot.generationMode === "continue" &&
                  event.snapshot.changedFileCount === 0
                    ? "本次未产生文件变更"
                    : "代码生成完成",
                fileChanged: (path) => `已写入 ${path}`,
              }),
            );
          }
          if (!runController.isCurrentRun(runRequestId, "code")) {
            return;
          }

          const progress = getProgressFromEvent(event);
          if (event.type === "completed") {
            lastCompletedSnapshot = event.snapshot as WorkspaceCodeRunSnapshot;
          }
          if (event.type === "code_file_changed") {
            setCodeFiles((current) => ({
              ...current,
              [event.path]: event.content,
            }));
            setCodeEntryFile((current) => current ?? event.path);
          }
          if (
            event.type === "artifact_ready" &&
            event.artifactKind === "uiMockup"
          ) {
            setCodeUiMockup(event.uiMockup ?? null);
          }
          if (
            event.type === "artifact_ready" &&
            event.artifactKind === "codeSkills"
          ) {
            setCodeSkills(event.codeSkills ?? []);
            setCodeSkillDiagnostics(event.skillDiagnostics ?? []);
          }
          if (
            event.type === "artifact_ready" &&
            event.artifactKind === "skillResourcePlan"
          ) {
            setCodeSkillResourcePlan(event.skillResourcePlan ?? null);
            setCodeSkillDiagnostics(event.skillDiagnostics ?? []);
          }
          if (
            event.type === "artifact_ready" &&
            event.artifactKind === "codeSkillContext"
          ) {
            setCodeSkillContext(event.codeSkillContext ?? null);
            setCodeSkillDiagnostics(event.skillDiagnostics ?? []);
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt: isTerminalRunEvent(event)
              ? diagnosticEvent.at
              : current.finishedAt,
            activeStage: "stage" in event ? event.stage : current.activeStage,
            streamText: isMeaningfulLlmChunkEvent(event)
              ? appendDiagnosticStream(current.streamText, event.chunk)
              : current.streamText,
            chunkCount: isMeaningfulLlmChunkEvent(event)
              ? current.chunkCount + 1
              : current.chunkCount,
            stageStartedAt:
              event.type === "stage_started"
                ? {
                    ...current.stageStartedAt,
                    [event.stage]: diagnosticEvent.at,
                  }
                : current.stageStartedAt,
            stageMessages:
              event.type === "stage_progress" && event.message
                ? { ...current.stageMessages, [event.stage]: event.message }
                : current.stageMessages,
            events: shouldDisplayDiagnosticEvent(event)
              ? [...current.events, diagnosticEvent].slice(-80)
              : current.events,
            uiMockup:
              event.type === "artifact_ready" &&
              event.artifactKind === "uiMockup"
                ? (event.uiMockup ?? current.uiMockup)
                : current.uiMockup,
            uiReferenceSpec:
              event.type === "artifact_ready" &&
              event.artifactKind === "uiReferenceSpec"
                ? (event.uiReferenceSpec ?? current.uiReferenceSpec)
                : event.type === "completed" &&
                    "uiReferenceSpec" in event.snapshot
                  ? (event.snapshot.uiReferenceSpec ?? current.uiReferenceSpec)
                  : current.uiReferenceSpec,
            uiFidelityReport:
              event.type === "artifact_ready" &&
              event.artifactKind === "uiFidelityReport"
                ? (event.uiFidelityReport ?? current.uiFidelityReport)
                : event.type === "completed" &&
                    "uiFidelityReport" in event.snapshot
                  ? (event.snapshot.uiFidelityReport ??
                    current.uiFidelityReport)
                  : current.uiFidelityReport,
            visualDirection:
              event.type === "artifact_ready" &&
              event.artifactKind === "visualDirection"
                ? (event.visualDirection ?? current.visualDirection)
                : event.type === "completed" &&
                    "visualDirection" in event.snapshot
                  ? (event.snapshot.visualDirection ?? current.visualDirection)
                  : current.visualDirection,
            skillResourceDiscoveryPlan:
              event.type === "artifact_ready" &&
              event.artifactKind === "skillResourceDiscoveryPlan"
                ? (event.skillResourceDiscoveryPlan ??
                  current.skillResourceDiscoveryPlan)
                : event.type === "completed" &&
                    "skillResourceDiscoveryPlan" in event.snapshot
                  ? (event.snapshot.skillResourceDiscoveryPlan ??
                    current.skillResourceDiscoveryPlan)
                  : current.skillResourceDiscoveryPlan,
            skillResourcePreviews:
              event.type === "artifact_ready" &&
              event.artifactKind === "skillResourcePreviews"
                ? (event.skillResourcePreviews ?? current.skillResourcePreviews)
                : event.type === "completed" &&
                    "skillResourcePreviews" in event.snapshot
                  ? (event.snapshot.skillResourcePreviews ??
                    current.skillResourcePreviews)
                  : current.skillResourcePreviews,
            skillResourcePlan:
              event.type === "artifact_ready" &&
              event.artifactKind === "skillResourcePlan"
                ? (event.skillResourcePlan ?? current.skillResourcePlan)
                : event.type === "completed" &&
                    "skillResourcePlan" in event.snapshot
                  ? (event.snapshot.skillResourcePlan ??
                    current.skillResourcePlan)
                  : current.skillResourcePlan,
            codeSkillContext:
              event.type === "artifact_ready" &&
              event.artifactKind === "codeSkillContext"
                ? (event.codeSkillContext ?? current.codeSkillContext)
                : event.type === "completed" &&
                    "codeSkillContext" in event.snapshot
                  ? (event.snapshot.codeSkillContext ??
                    current.codeSkillContext)
                  : current.codeSkillContext,
            codeTrace:
              event.type === "completed" && "codeTrace" in event.snapshot
                ? (event.snapshot.codeTrace ?? [])
                : current.codeTrace,
          }));

          setRunUiState((current) => ({
            runStatus: statusFromRunEvent(event),
            runProgress: progress ?? current.runProgress,
            runMessage:
              event.type === "code_file_changed"
                ? `已写入 ${event.path}`
                : event.type === "stage_progress"
                  ? (event.message ?? current.runMessage)
                  : event.type === "queued"
                    ? "代码生成任务已进入队列"
                    : event.type === "completed"
                      ? "files" in event.snapshot &&
                        event.snapshot.generationMode === "continue" &&
                        event.snapshot.changedFileCount === 0
                        ? "本次未产生文件变更"
                        : "代码生成完成"
                      : event.type === "cancelled"
                        ? event.message
                        : event.type === "failed"
                          ? event.error.message
                          : current.runMessage,
            errorMessage:
              event.type === "failed"
                ? event.error.message
                : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getCodeRunSnapshot(runId)) ?? lastCompletedSnapshot;
        if (!snapshot || !runController.isCurrentRun(runRequestId, "code")) {
          return;
        }
        if (snapshot.status === "cancelled") {
          setRunUiState({
            runStatus: "cancelled",
            runProgress: 100,
            runMessage: cancelledRunMessage(snapshot),
            errorMessage: null,
          });
          openGenerationResultDialog({
            title: "任务已取消",
            tone: "warning",
            message: cancelledRunMessage(snapshot),
            runId: snapshot.runId,
            stageLabel: "代码原型",
          });
          return;
        }

        applyCodeRunSnapshot(snapshot);
        setCurrentRunDiagnostics((current) => ({
          ...current,
          codeTrace: snapshot.codeTrace ?? [],
        }));
        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage:
            snapshot.generationMode === "continue" &&
            snapshot.changedFileCount === 0
              ? "本次未产生文件变更"
              : "代码生成完成",
          errorMessage: null,
        });
        openGenerationResultDialog({
          title: "代码原型已生成",
          tone: "success",
          message:
            snapshot.generationMode === "continue" &&
            snapshot.changedFileCount === 0
              ? "本次未产生文件变更。"
              : snapshot.generationMode === "regenerate"
                ? "代码重新生成完成。"
                : "代码生成完成。",
          runId: snapshot.runId,
          stageLabel: "代码原型",
          targetLabel: "当前代码原型",
        });
        if (
          baseInputFingerprint !==
            snapshotInputFingerprint({
              requirementText: latestInputRef.current.requirementText,
              rules: latestInputRef.current.rules,
              designModels: latestInputRef.current.designModels,
              designModelTraceability:
                latestInputRef.current.designModelTraceability,
            }) ||
          baseCodeEditVersion !== latestInputRef.current.codeEditVersion
        ) {
          notifyGenerationResultStale();
        }
      } catch (error) {
        const billingBlock = parseBillingEntitlementError(error);
        const detail =
          billingBlock?.message ??
          (error instanceof Error ? error.message : "代码生成失败");
        if (clientTaskId) {
          updateGenerationTask(clientTaskId, (task) => ({
            ...task,
            status: "failed",
            progress: 100,
            message: null,
            errorMessage: detail,
            finishedAt: new Date().toISOString(),
            diagnostics: addLocalFailureToDiagnostics(task.diagnostics, detail),
          }));
        }
        if (!runController.isCurrentRun(runRequestId, "code")) {
          return;
        }
        if (runId && repository.getCodeRunSnapshot) {
          try {
            const failedSnapshot = await repository.getCodeRunSnapshot(runId);
            applyCodeRunSnapshot(failedSnapshot);
            setCurrentRunDiagnostics((current) => ({
              ...current,
              codeTrace: failedSnapshot.codeTrace ?? current.codeTrace,
            }));
            await saveHistorySnapshot(failedSnapshot, {
              providerModel,
              durationMs: Date.now() - startedAtMs,
            });
          } catch {
            // The visible error state below is more useful than a secondary snapshot failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: detail,
        });
        if (billingBlock) {
          openBillingEntitlementDialog(billingBlock, {
            runId,
            stageLabel: "代码原型",
          });
        } else {
          openGenerationResultDialog({
            title: "生成失败",
            tone: "destructive",
            message: detail,
            details: ["请在代码页面查看问题并重新处理。"],
            runId,
            stageLabel: "代码原型",
          });
        }
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local`,
              at: new Date().toISOString(),
              label: "failed",
              detail,
            },
          ].slice(-80),
        }));
        notifyGenerationFailed(`代码生成失败：${detail}`);
      }
    },
    [
      applyCodeRunSnapshot,
      codeFiles,
      codeEditVersion,
      designInputFingerprints,
      designModelTraceability,
      designModels,
      designPlantUml,
      diagramInputFingerprints,
      diagramVersions,
      generatedDesignDiagrams,
      generatedDiagrams,
      manualModelEditStatus,
      models,
      openBillingEntitlementDialog,
      openGenerationResultDialog,
      repository,
      requirementBaseline,
      requirementInputFingerprint,
      requirementModelTraceability,
      requirementReviewCandidates,
      requirementText,
      runController,
      rules,
      rulesBasedOnTextVersion,
      rulesVersion,
      saveHistorySnapshot,
      textVersion,
    ],
  );

  const runDocumentGeneration = useCallback(
    async (
      documentKind: DocumentKind,
      documentStyle?: DocumentStyleSettings,
    ) => {
      const startedAtMs = Date.now();
      let providerModel = "";
      let runId: string | null = null;
      let lastCompletedSnapshot: DocumentRunSnapshot | null = null;
      let clientTaskId: string | null = null;

      try {
        if (
          !repository.startDocumentRun ||
          !repository.subscribeToDocumentRun ||
          !repository.getDocumentRunSnapshot
        ) {
          throw new Error("当前仓储未实现说明书生成能力");
        }

        const requirementModels = Object.values(models).filter(
          (model): model is DiagramModelSpec => Boolean(model),
        );
        const requirementPlantUml = Object.entries(plantUml)
          .filter((entry): entry is [DiagramType, string] => Boolean(entry[1]))
          .map(([diagramKind, source]) => ({ diagramKind, source }));
        const requirementSvgArtifacts = Object.values(svgArtifacts).filter(
          (artifact): artifact is NonNullable<typeof artifact> =>
            Boolean(artifact),
        );
        const availableDesignModels = Object.values(designModels).filter(
          (model): model is DesignDiagramModelSpec => Boolean(model),
        );
        const designPlantUmlList = Object.entries(designPlantUml)
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
          .map(([artifactId, source]) => {
            const model = designModels[artifactId];
            const svgArtifact = designSvgArtifacts[artifactId];
            return {
              diagramKind:
                model?.diagramKind ??
                svgArtifact?.diagramKind ??
                (artifactId as DesignDiagramType),
              modelId: model?.modelId ?? svgArtifact?.modelId,
              source,
            };
          });
        const designSvgArtifactList = Object.values(designSvgArtifacts).filter(
          (artifact): artifact is NonNullable<typeof artifact> =>
            Boolean(artifact),
        );

        if (
          documentKind === "requirementsSpec" &&
          requirementModels.length === 0
        ) {
          throw new Error("请先在需求页生成需求模型，再导出需求规格说明书");
        }
        if (
          documentKind === "softwareDesignSpec" &&
          availableDesignModels.length === 0
        ) {
          throw new Error("请先在设计页生成设计模型，再导出软件设计说明书");
        }
        const activeRequirementFingerprint = requirementInputFingerprintFor(
          requirementText,
          rules,
        );
        const currentPendingRequirementReviews =
          requirementRuleIdsBlockingGeneration(
            requirementBaseline,
            requirementReviewCandidates,
          );
        if (currentPendingRequirementReviews.length > 0) {
          throw new Error("请先确认需求规则修复结果");
        }
        const currentRulesStale =
          rules.length > 0 &&
          (requirementInputFingerprint
            ? !fingerprintMatches(
                requirementInputFingerprint,
                activeRequirementFingerprint,
              )
            : rulesBasedOnTextVersion !== null &&
              rulesBasedOnTextVersion !== textVersion);
        const currentRequirementDiagrams = orderedRequirementDiagrams(
          Array.from(
            new Set([
              ...generatedDiagrams,
              ...(Object.keys(models).filter((diagram) =>
                Boolean(models[diagram as DiagramType]),
              ) as DiagramType[]),
            ]),
          ),
        );
        const currentStaleDiagrams = currentRequirementDiagrams.filter(
          (diagram) =>
            isRequirementDiagramStale({
              diagram,
              activeRequirementFingerprint,
              generatedDiagrams,
              requirementInputFingerprint,
              diagramInputFingerprints,
              diagramVersions,
              rulesVersion,
              models,
              requirementModelTraceability,
              manualModelEditStatus,
            }),
        );
        const requirementTraceabilityComplete =
          hasCompleteRequirementTraceability(
            Object.values(models),
            requirementModelTraceability,
            manualModelEditStatus,
          );
        const requirementTraceabilityMissing =
          requirementModelTraceability.length > 0
            ? !requirementTraceabilityComplete
            : generatedDiagrams.length > 0;
        const activeDesignFingerprint = designInputFingerprintFor(
          Object.values(models).filter((model): model is DiagramModelSpec =>
            Boolean(model),
          ),
          requirementModelTraceability,
        );
        const designFreshnessComplete = Object.entries(designModels).every(
          ([modelId]) =>
            designFingerprintMatches(
              designInputFingerprints[modelId],
              activeDesignFingerprint,
            ),
        );
        const designTraceabilityComplete = hasCompleteDesignTraceability(
          Object.values(designModels),
          designModelTraceability,
          manualModelEditStatus,
          Object.values(models),
        );
        if (
          documentKind === "requirementsSpec" &&
          (currentRulesStale ||
            currentStaleDiagrams.length > 0 ||
            (currentRequirementDiagrams.length > 0 &&
              requirementTraceabilityMissing))
        ) {
          throw new Error("需求模型或元素级映射已过期，请先重新生成需求模型");
        }
        if (
          documentKind === "softwareDesignSpec" &&
          (currentRulesStale ||
            currentStaleDiagrams.length > 0 ||
            (currentRequirementDiagrams.length > 0 &&
              requirementTraceabilityMissing) ||
            (generatedDesignDiagrams.length > 0 &&
              (!designFreshnessComplete || !designTraceabilityComplete)))
        ) {
          throw new Error(
            "设计链路或元素级映射已过期，请先重新生成需求模型和设计模型",
          );
        }

        const startInput = createStartDocumentRunInput(
          documentKind,
          requirementText,
          rules,
          requirementModels,
          requirementPlantUml,
          requirementSvgArtifacts,
          availableDesignModels,
          designPlantUmlList,
          designSvgArtifactList,
          documentStyle,
        );
        providerModel = startInput.providerSettings.model;
        const documentTitle =
          documentKind === "requirementsSpec"
            ? "需求规格说明书"
            : "软件设计说明书";
        clientTaskId = enqueueGenerationTask({
          kind: "document",
          documentKind,
          title: documentTitle,
          providerModel,
          message: `${documentTitle}生成任务已进入队列`,
          startedAtMs,
        });
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "说明书生成任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("document", documentKind);
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "document",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startDocumentRun(startInput);
        runId = started.runId;
        updateGenerationTask(clientTaskId, (task) =>
          assignTaskRunId(task, runId!, providerModel),
        );
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToDocumentRun(runId, (event) => {
          const progress = getProgressFromEvent(event);
          if (event.type === "completed" && "documentKind" in event.snapshot) {
            lastCompletedSnapshot = event.snapshot;
          }
          if (clientTaskId) {
            updateGenerationTask(clientTaskId, (task) =>
              updateTaskFromEvent(task, event, {
                queued: `${documentTitle}生成任务已进入队列`,
                completed: `${documentTitle}生成完成`,
              }),
            );
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt: isTerminalRunEvent(event)
              ? diagnosticEvent.at
              : current.finishedAt,
            activeStage: "stage" in event ? event.stage : current.activeStage,
            streamText: isMeaningfulLlmChunkEvent(event)
              ? appendDiagnosticStream(current.streamText, event.chunk)
              : current.streamText,
            chunkCount: isMeaningfulLlmChunkEvent(event)
              ? current.chunkCount + 1
              : current.chunkCount,
            stageStartedAt:
              event.type === "stage_started"
                ? {
                    ...current.stageStartedAt,
                    [event.stage]: diagnosticEvent.at,
                  }
                : current.stageStartedAt,
            stageMessages:
              event.type === "stage_progress" && event.message
                ? { ...current.stageMessages, [event.stage]: event.message }
                : current.stageMessages,
            events: shouldDisplayDiagnosticEvent(event)
              ? [...current.events, diagnosticEvent].slice(-80)
              : current.events,
          }));

          setRunUiState((current) => ({
            runStatus: statusFromRunEvent(event),
            runProgress: progress ?? current.runProgress,
            runMessage:
              event.type === "stage_progress"
                ? (event.message ?? current.runMessage)
                : event.type === "queued"
                  ? "说明书生成任务已进入队列"
                  : event.type === "completed"
                    ? "说明书生成完成"
                    : event.type === "cancelled"
                      ? event.message
                      : event.type === "failed"
                        ? event.error.message
                        : current.runMessage,
            errorMessage:
              event.type === "failed"
                ? event.error.message
                : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getDocumentRunSnapshot(runId)) ??
          lastCompletedSnapshot;
        if (!snapshot) {
          return null;
        }
        if (snapshot.status === "cancelled") {
          setRunUiState({
            runStatus: "cancelled",
            runProgress: 100,
            runMessage: cancelledRunMessage(snapshot),
            errorMessage: null,
          });
          openGenerationResultDialog({
            title: "任务已取消",
            tone: "warning",
            message: cancelledRunMessage(snapshot),
            runId: snapshot.runId,
            stageLabel: "说明书",
          });
          return null;
        }

        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "说明书生成完成",
          errorMessage: null,
        });
        openGenerationResultDialog({
          title: "说明书已生成",
          tone: "success",
          message: `${documentTitle}已生成。`,
          runId: snapshot.runId,
          stageLabel: "说明书",
          targetLabel: documentTitle,
        });
        return snapshot;
      } catch (error) {
        const billingBlock = parseBillingEntitlementError(error);
        const detail =
          billingBlock?.message ??
          (error instanceof Error ? error.message : "说明书生成失败");
        if (clientTaskId) {
          updateGenerationTask(clientTaskId, (task) => ({
            ...task,
            status: "failed",
            progress: 100,
            message: null,
            errorMessage: detail,
            finishedAt: new Date().toISOString(),
            diagnostics: addLocalFailureToDiagnostics(task.diagnostics, detail),
          }));
        }
        if (runId && repository.getDocumentRunSnapshot) {
          try {
            const failedSnapshot =
              await repository.getDocumentRunSnapshot(runId);
            await saveHistorySnapshot(failedSnapshot, {
              providerModel,
              durationMs: Date.now() - startedAtMs,
            });
          } catch {
            // The visible error state below is more useful than a secondary snapshot failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: detail,
        });
        if (billingBlock) {
          openBillingEntitlementDialog(billingBlock, {
            runId,
            stageLabel: "说明书",
          });
        } else {
          openGenerationResultDialog({
            title: "生成失败",
            tone: "destructive",
            message: detail,
            details: ["说明书生成未通过，请在说明书页面查看问题并重新处理。"],
            runId,
            stageLabel: "说明书",
          });
        }
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local-document`,
              at: new Date().toISOString(),
              label: "任务失败",
              detail,
            },
          ].slice(-80),
        }));
        notifyGenerationFailed(`说明书生成失败：${detail}`);
        return null;
      }
    },
    [
      designInputFingerprints,
      designModelTraceability,
      designModels,
      designPlantUml,
      designSvgArtifacts,
      diagramInputFingerprints,
      diagramVersions,
      generatedDesignDiagrams,
      generatedDiagrams,
      manualModelEditStatus,
      models,
      openBillingEntitlementDialog,
      openGenerationResultDialog,
      plantUml,
      repository,
      requirementBaseline,
      requirementInputFingerprint,
      requirementModelTraceability,
      requirementReviewCandidates,
      requirementText,
      runController,
      rules,
      rulesBasedOnTextVersion,
      rulesVersion,
      saveHistorySnapshot,
      svgArtifacts,
      textVersion,
    ],
  );

  const generateRequirementsSpec = useCallback(
    async (documentStyle?: DocumentStyleSettings) => {
      return runDocumentGeneration("requirementsSpec", documentStyle);
    },
    [runDocumentGeneration],
  );

  const generateSoftwareDesignSpec = useCallback(
    async (documentStyle?: DocumentStyleSettings) => {
      return runDocumentGeneration("softwareDesignSpec", documentStyle);
    },
    [runDocumentGeneration],
  );

  const renderPlantUml = useCallback(
    async (diagram: DiagramType, source: string) => {
      try {
        const rendered = await repository.renderPlantUml(diagram, source);
        setPlantUml((current) => ({ ...current, [diagram]: source }));
        setSvgArtifacts((current) => ({
          ...current,
          [diagram]: {
            diagramKind: diagram,
            svg: rendered.svg,
            renderMeta: rendered.renderMeta,
          },
        }));
        setDiagramErrors((current) => {
          const next = { ...current };
          delete next[diagram];
          return next;
        });
        setGeneratedDiagrams((current) =>
          current.includes(diagram) ? current : [...current, diagram],
        );
      } catch (error) {
        setDiagramErrors((current) => ({
          ...current,
          [diagram]: {
            stage: "render_svg",
            message: error instanceof Error ? error.message : "图源码渲染失败",
          },
        }));
        throw error;
      }
    },
    [repository],
  );

  const createManualEditStatus = useCallback(
    (status: "dirty" | "rerendered") => {
      const now = new Date().toISOString();
      return {
        status,
        warning:
          status === "dirty"
            ? "模型已手动修改，可能与前置需求映射不一致。保存后会自动更新当前图。"
            : null,
        editedAt: now,
        ...(status === "rerendered" ? { rerenderedAt: now } : {}),
      } satisfies ManualModelEditStatus;
    },
    [],
  );

  const saveRequirementModelEdit = useCallback(
    async (diagramKind: DiagramType, model: DiagramModelSpec) => {
      const status = createManualEditStatus("dirty");
      const modelKey = getRequirementModelId(model);
      setModels((current) => ({ ...current, [modelKey]: model }));
      setManualModelEditStatus((current) => ({
        ...current,
        [modelKey]: status,
      }));
      await repository.saveRequirementModelEdit?.(diagramKind, model, status);
    },
    [createManualEditStatus, repository],
  );

  const saveDesignModelEdit = useCallback(
    async (modelId: string, model: DesignDiagramModelSpec) => {
      const status = createManualEditStatus("dirty");
      setDesignModels((current) => ({ ...current, [modelId]: model }));
      setManualModelEditStatus((current) => ({
        ...current,
        [modelId]: status,
      }));
      await repository.saveDesignModelEdit?.(modelId, model, status);
    },
    [createManualEditStatus, repository],
  );

  const rerenderRequirementModel = useCallback(
    async (
      diagramKind: DiagramType,
      modelOverride?: DiagramModelSpec,
      options?: { toastMessage?: string | null },
    ) => {
      const model = modelOverride ?? models[diagramKind];
      if (!model) {
        throw new Error("当前需求模型不存在，无法重绘");
      }
      const modelKey = getRequirementModelId(model);
      if (!repository.renderStructuredModel) {
        throw new Error("当前环境不支持结构化模型重绘");
      }
      const rendered = await repository.renderStructuredModel(model);
      const status = createManualEditStatus("rerendered");
      const svgArtifact = {
        diagramKind,
        modelId: "modelId" in model ? model.modelId : undefined,
        svg: rendered.svg,
        renderMeta: rendered.renderMeta,
      };
      setPlantUml((current) => ({
        ...current,
        [modelKey]: rendered.plantUmlSource,
      }));
      setSvgArtifacts((current) => ({ ...current, [modelKey]: svgArtifact }));
      setDiagramErrors((current) => {
        const next = { ...current };
        delete next[modelKey];
        delete next[diagramKind];
        return next;
      });
      setGeneratedDiagrams((current) =>
        current.includes(diagramKind) ? current : [...current, diagramKind],
      );
      setManualModelEditStatus((current) => ({
        ...current,
        [modelKey]: status,
      }));
      await repository.saveManualModelRerender?.(modelKey, status, {
        plantUmlSource: rendered.plantUmlSource,
        svgArtifact,
      });
      if (options?.toastMessage !== null) {
        toast.message(options?.toastMessage ?? "当前模型已重绘");
      }
    },
    [createManualEditStatus, models, repository],
  );

  const rerenderDesignModel = useCallback(
    async (
      modelId: string,
      modelOverride?: DesignDiagramModelSpec,
      options?: { toastMessage?: string | null },
    ) => {
      const model = modelOverride ?? designModels[modelId];
      if (!model) {
        throw new Error("当前设计模型不存在，无法重绘");
      }
      if (!repository.renderStructuredModel) {
        throw new Error("当前环境不支持结构化模型重绘");
      }
      const rendered = await repository.renderStructuredModel(model);
      const status = createManualEditStatus("rerendered");
      const svgArtifact = {
        diagramKind: model.diagramKind,
        modelId: "modelId" in model ? model.modelId : undefined,
        svg: rendered.svg,
        renderMeta: rendered.renderMeta,
      };
      setDesignPlantUml((current) => ({
        ...current,
        [modelId]: rendered.plantUmlSource,
      }));
      setDesignSvgArtifacts((current) => ({
        ...current,
        [modelId]: svgArtifact,
      }));
      setDesignDiagramErrors((current) => {
        const next = { ...current };
        delete next[model.diagramKind];
        return next;
      });
      setGeneratedDesignDiagrams((current) =>
        current.includes(model.diagramKind)
          ? current
          : [...current, model.diagramKind],
      );
      setManualModelEditStatus((current) => ({
        ...current,
        [modelId]: status,
      }));
      await repository.saveManualModelRerender?.(modelId, status, {
        plantUmlSource: rendered.plantUmlSource,
        svgArtifact,
      });
      if (options?.toastMessage !== null) {
        toast.message(options?.toastMessage ?? "当前模型已重绘");
      }
    },
    [createManualEditStatus, designModels, repository],
  );

  const generateRules = useCallback(async () => {
    await runGeneration([], { kind: "rules-only" });
  }, [runGeneration]);

  const generateDiagrams = useCallback(
    async (only?: DiagramType[]) => {
      const diagrams = orderedRequirementDiagrams(only ?? selectedDiagrams);
      if (diagrams.length === 0) {
        return;
      }
      const activeRequirementFingerprint = requirementInputFingerprintFor(
        requirementText,
        rules,
      );
      const currentRulesStale =
        rules.length > 0 &&
        (requirementInputFingerprint
          ? !fingerprintMatches(
              requirementInputFingerprint,
              activeRequirementFingerprint,
            )
          : rulesBasedOnTextVersion !== null &&
            rulesBasedOnTextVersion !== textVersion);
      if (currentRulesStale) {
        const message = "需求规则已过期，请先手动更新需求规则";
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "需求规则已过期",
          tone: "warning",
          message,
          stageLabel: "需求规则",
          targetLabel: "已选需求模型",
        });
        return;
      }
      const pendingReviews = requirementRuleIdsBlockingGeneration(
        requirementBaseline,
        requirementReviewCandidates,
      );
      if (pendingReviews.length > 0) {
        const message = "请先确认需求规则修复结果";
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "需求规则待确认",
          tone: "warning",
          message,
          details: pendingReviews,
          stageLabel: "需求规则",
          targetLabel: "已选需求模型",
        });
        return;
      }
      const plan = planRequirementAutoUpstream({
        requestedDiagrams: diagrams,
        existingModels: models,
        rules,
      });
      if (plan.needsRulesRun && rules.length === 0 && !requirementText.trim()) {
        const message = "缺少需求来源，无法自动生成需求规则";
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "缺少需求来源",
          tone: "warning",
          message,
          stageLabel: "需求规则",
          targetLabel: "已选需求模型",
        });
        return;
      }
      if (
        diagrams.includes("analysis") &&
        hasRequirementModelKind(models, "usecase") &&
        isRequirementDiagramStale({
          diagram: "usecase",
          activeRequirementFingerprint,
          generatedDiagrams,
          requirementInputFingerprint,
          diagramInputFingerprints,
          diagramVersions,
          rulesVersion,
          models,
          requirementModelTraceability,
          manualModelEditStatus,
        })
      ) {
        const message = "用例模型已存在但基于旧规则，请先手动更新用例模型";
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "上游模型需更新",
          tone: "warning",
          message,
          stageLabel: "需求模型",
          targetLabel: "已选需求模型",
        });
        return;
      }
      const confirmed = await confirmGeneration(
        analyzeRequirementGeneration(
          diagrams,
          collectExistingRequirementDiagramKinds(models),
          plan,
        ),
      );
      if (!confirmed) return;

      const rulesSnapshot = plan.needsRulesRun
        ? await runGeneration([], { kind: "rules-only" }, undefined, {
            suppressSuccessDialog: true,
            skipRuleRepairCandidates: true,
          })
        : null;
      if (plan.needsRulesRun && !rulesSnapshot) return;
      const rulesForRun =
        rulesSnapshot && plan.rulesRunMode === "merge"
          ? ensureAutoCompletedRuleMappings(
              mergeAutoCompletedRuleMappings(rules, rulesSnapshot.rules),
              plan.ruleMappingDiagrams,
            )
          : (rulesSnapshot?.rules ?? rules);
      if (rulesSnapshot && plan.rulesRunMode === "merge") {
        setRules(rulesForRun);
        setRulesVersion((current) => current + 1);
        setRulesBasedOnTextVersion(textVersion);
        setRequirementInputFingerprint(
          requirementInputFingerprintFor(requirementText, rulesForRun),
        );
        latestInputRef.current = {
          ...latestInputRef.current,
          rules: rulesForRun,
        };
        void repository.updateRequirementRules?.(rulesForRun);
      }
      const reviewedRuleIds =
        plan.rulesRunMode === "replace"
          ? (rulesSnapshot?.rules.map((rule) => rule.id) ?? [])
          : [];
      const analysisTargetUseCaseIds = analysisTargetUseCaseIdsForRun(
        plan.effectiveDiagrams,
        models,
      );
      const modelSnapshot = await runGeneration(
        plan.effectiveDiagrams,
        only
          ? { kind: "partial-diagrams", diagrams: plan.effectiveDiagrams }
          : { kind: "full-diagrams" },
        {
          rules: rulesForRun,
          analysisTargetUseCaseIds,
        },
      );
      const reviews: Array<
        WorkspaceRecord["autoGeneratedUpstreamReviews"][string]
      > = [];
      if (rulesSnapshot && plan.rulesRunMode === "replace") {
        for (const ruleId of reviewedRuleIds) {
          reviews.push(
            createAutoGeneratedUpstreamReview({
              artifactType: "requirement-rule",
              artifactId: ruleId,
              label: `需求规则 ${ruleId}`,
              reason: "生成所选模型时缺少可用需求规则，系统自动抽取/更新。",
              sourceRunId: rulesSnapshot.runId,
            }),
          );
        }
      }
      if (rulesSnapshot && plan.rulesRunMode === "merge") {
        for (const diagram of plan.ruleMappingDiagrams) {
          reviews.push(
            createAutoGeneratedUpstreamReview({
              artifactType: "requirement-rule",
              artifactId: `mapping:${diagram}`,
              label: `${DIAGRAM_META[diagram].label}规则映射`,
              reason: "生成所选模型时缺少上游规则映射，系统自动补齐关联关系。",
              sourceRunId: rulesSnapshot.runId,
            }),
          );
        }
      }
      if (modelSnapshot) {
        for (const diagram of plan.dependencyDiagrams) {
          reviews.push(
            createAutoGeneratedUpstreamReview({
              artifactType: "requirement-model",
              artifactId: diagram,
              label: DIAGRAM_META[diagram].label,
              reason: "生成所选需求模型时缺少前置上游模型，系统自动补齐。",
              sourceRunId: modelSnapshot.runId,
            }),
          );
        }
      }
      await appendAutoGeneratedUpstreamReviews(reviews);
    },
    [
      appendAutoGeneratedUpstreamReviews,
      confirmGeneration,
      models,
      openGenerationResultDialog,
      repository,
      requirementBaseline,
      requirementInputFingerprint,
      requirementReviewCandidates,
      requirementText,
      runGeneration,
      rules,
      rulesBasedOnTextVersion,
      selectedDiagrams,
      textVersion,
    ],
  );

  const generateDesignDiagrams = useCallback(
    async (only?: DesignDiagramType[]) => {
      const requestedDiagrams = orderedDesignDiagrams(
        only ?? selectedDesignDiagrams,
      );
      if (requestedDiagrams.length === 0) {
        return;
      }
      const currentPendingRequirementReviews =
        requirementRuleIdsBlockingGeneration(
          requirementBaseline,
          requirementReviewCandidates,
        );
      if (currentPendingRequirementReviews.length > 0) {
        const message = "请先确认需求规则修复结果";
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "需求规则待确认",
          tone: "warning",
          message,
          details: currentPendingRequirementReviews,
          stageLabel: "需求规则",
          targetLabel: "已选设计模型",
        });
        return;
      }
      const activeRequirementFingerprint = requirementInputFingerprintFor(
        requirementText,
        rules,
      );
      const currentRulesStale =
        rules.length > 0 &&
        (requirementInputFingerprint
          ? !fingerprintMatches(
              requirementInputFingerprint,
              activeRequirementFingerprint,
            )
          : rulesBasedOnTextVersion !== null &&
            rulesBasedOnTextVersion !== textVersion);
      if (currentRulesStale) {
        const message = "需求规则已过期，请先手动更新需求规则";
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "需求规则已过期",
          tone: "warning",
          message,
          stageLabel: "需求规则",
          targetLabel: "已选设计模型",
        });
        return;
      }
      const requirementPlan = planDesignRequirementAutoUpstream({
        requestedDesignDiagrams: requestedDiagrams,
        requirementModels: models,
        rules,
      });
      const requiredExistingRequirementSources = orderedRequirementDiagrams(
        requestedDiagrams.flatMap((diagram) =>
          DESIGN_REQUIREMENT_SOURCE_MAP[diagram].filter((source) =>
            hasRequirementModelKind(models, source),
          ),
        ),
      );
      const staleRequirementSources = requiredExistingRequirementSources.filter(
        (diagram) =>
          isRequirementDiagramStale({
            diagram,
            activeRequirementFingerprint,
            generatedDiagrams,
            requirementInputFingerprint,
            diagramInputFingerprints,
            diagramVersions,
            rulesVersion,
            models,
            requirementModelTraceability,
            manualModelEditStatus,
          }),
      );
      if (staleRequirementSources.length > 0) {
        const message = `已有需求阶段${diagramLabels(staleRequirementSources).join("、")}基于旧规则，请先回到需求页更新`;
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "需求上游需更新",
          tone: "warning",
          message,
          stageLabel: "需求模型",
          targetLabel: "已选设计模型",
        });
        return;
      }
      const existingRequirementTraceabilityComplete =
        hasCompleteRequirementTraceability(
          Object.values(models),
          requirementModelTraceability,
          manualModelEditStatus,
        );
      const existingRequirementTraceabilityMissing =
        requiredExistingRequirementSources.length > 0 &&
        (requirementModelTraceability.length > 0
          ? !existingRequirementTraceabilityComplete
          : Object.values(models).some(Boolean));
      if (existingRequirementTraceabilityMissing) {
        const message = "需求模型追踪关系不完整，请先回到需求页处理";
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "需求追踪需处理",
          tone: "warning",
          message,
          stageLabel: "需求模型",
          targetLabel: "已选设计模型",
        });
        return;
      }
      const activeDesignFingerprint = designInputFingerprintFor(
        Object.values(models).filter((model): model is DiagramModelSpec =>
          Boolean(model),
        ),
        requirementModelTraceability,
      );
      const existingDesignDiagrams =
        collectExistingDesignDiagramKinds(designModels);
      const needsSequenceDependency = requestedDiagrams.some(
        (diagram) => diagram !== "sequence",
      );
      if (
        needsSequenceDependency &&
        existingDesignDiagrams.includes("sequence") &&
        !sequenceModelsCoverUseCases(designModels, models.usecase)
      ) {
        const message = "已有用例实现设计覆盖不足，请先手动更新用例实现设计";
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "设计依赖需更新",
          tone: "warning",
          message,
          stageLabel: "设计模型",
          targetLabel: "已选设计模型",
        });
        return;
      }
      if (
        requestedDiagrams.includes("table") &&
        existingDesignDiagrams.includes("class") &&
        !designFingerprintMatches(
          currentDesignClassFingerprint(designModels, designInputFingerprints),
          activeDesignFingerprint,
        )
      ) {
        const message = "设计类图已存在但基于旧需求，请先手动更新设计类图";
        setRunUiState((current) => ({
          ...current,
          errorMessage: message,
        }));
        openGenerationResultDialog({
          title: "设计依赖需更新",
          tone: "warning",
          message,
          stageLabel: "设计模型",
          targetLabel: "已选设计模型",
        });
        return;
      }
      const { effectiveDiagrams, dependencyDiagrams } =
        resolveDesignGenerationDiagrams(
          requestedDiagrams,
          existingDesignDiagrams,
        );
      const confirmed = await confirmGeneration(
        analyzeDesignGeneration(
          requestedDiagrams,
          effectiveDiagrams,
          dependencyDiagrams,
          existingDesignDiagrams,
          requirementPlan,
        ),
      );
      if (!confirmed) return;

      const rulesSnapshot = requirementPlan.needsRulesRun
        ? await runGeneration([], { kind: "rules-only" }, undefined, {
            suppressSuccessDialog: true,
            skipRuleRepairCandidates: true,
          })
        : null;
      if (requirementPlan.needsRulesRun && !rulesSnapshot) return;
      const rulesForRequirementRun =
        rulesSnapshot && requirementPlan.rulesRunMode === "merge"
          ? ensureAutoCompletedRuleMappings(
              mergeAutoCompletedRuleMappings(rules, rulesSnapshot.rules),
              requirementPlan.ruleMappingDiagrams,
            )
          : (rulesSnapshot?.rules ?? rules);
      if (rulesSnapshot && requirementPlan.rulesRunMode === "merge") {
        setRules(rulesForRequirementRun);
        setRulesVersion((current) => current + 1);
        setRulesBasedOnTextVersion(textVersion);
        setRequirementInputFingerprint(
          requirementInputFingerprintFor(
            requirementText,
            rulesForRequirementRun,
          ),
        );
        latestInputRef.current = {
          ...latestInputRef.current,
          rules: rulesForRequirementRun,
        };
        void repository.updateRequirementRules?.(rulesForRequirementRun);
      }
      const reviewedRuleIds =
        requirementPlan.rulesRunMode === "replace"
          ? (rulesSnapshot?.rules.map((rule) => rule.id) ?? [])
          : [];
      const analysisTargetUseCaseIds = analysisTargetUseCaseIdsForRun(
        requirementPlan.effectiveDiagrams,
        models,
      );

      const requirementModelSnapshot =
        requirementPlan.effectiveDiagrams.length > 0
          ? await runGeneration(
              requirementPlan.effectiveDiagrams,
              {
                kind: "partial-diagrams",
                diagrams: requirementPlan.effectiveDiagrams,
              },
              {
                rules: rulesForRequirementRun,
                contextModels: Object.values(models).filter(
                  (model): model is DiagramModelSpec => Boolean(model),
                ),
                contextRequirementModelTraceability:
                  requirementModelTraceability,
                analysisTargetUseCaseIds,
              },
              { suppressSuccessDialog: true },
            )
          : null;
      if (
        requirementPlan.effectiveDiagrams.length > 0 &&
        !requirementModelSnapshot
      ) {
        return;
      }

      const activeRequirementModels =
        requirementModelSnapshot?.models ??
        Object.values(models).filter((model): model is DiagramModelSpec =>
          Boolean(model),
        );
      const activeRequirementBaseline =
        requirementModelSnapshot?.requirementBaseline ??
        rulesSnapshot?.requirementBaseline ??
        requirementBaseline;
      if (!activeRequirementBaseline) {
        openGenerationResultDialog({
          title: "缺少需求基线",
          tone: "warning",
          message: "请先输入需求文本并生成需求规则。",
          stageLabel: "需求规则",
          targetLabel: "已选设计模型",
        });
        return;
      }
      const designSnapshot = await runDesignGeneration(
        effectiveDiagrams,
        requestedDiagrams,
        {
          requirementBaseline: activeRequirementBaseline,
          requirementModels: activeRequirementModels,
          requirementModelTraceability:
            requirementModelSnapshot?.requirementModelTraceability ??
            requirementModelTraceability,
          rules: rulesForRequirementRun,
        },
      );
      const reviews: Array<
        WorkspaceRecord["autoGeneratedUpstreamReviews"][string]
      > = [];
      if (rulesSnapshot && requirementPlan.rulesRunMode === "replace") {
        for (const ruleId of reviewedRuleIds) {
          reviews.push(
            createAutoGeneratedUpstreamReview({
              artifactType: "requirement-rule",
              artifactId: ruleId,
              label: `需求规则 ${ruleId}`,
              reason: "生成设计模型时缺少可用需求规则，系统自动抽取/更新。",
              sourceRunId: rulesSnapshot.runId,
            }),
          );
        }
      }
      if (rulesSnapshot && requirementPlan.rulesRunMode === "merge") {
        for (const diagram of requirementPlan.ruleMappingDiagrams) {
          reviews.push(
            createAutoGeneratedUpstreamReview({
              artifactType: "requirement-rule",
              artifactId: `mapping:${diagram}`,
              label: `${DIAGRAM_META[diagram].label}规则映射`,
              reason: "生成设计模型时缺少上游规则映射，系统自动补齐关联关系。",
              sourceRunId: rulesSnapshot.runId,
            }),
          );
        }
      }
      if (requirementModelSnapshot) {
        for (const diagram of requirementPlan.effectiveDiagrams) {
          reviews.push(
            createAutoGeneratedUpstreamReview({
              artifactType: "requirement-model",
              artifactId: diagram,
              label: DIAGRAM_META[diagram].label,
              reason: "生成设计模型时缺少需求阶段上游模型，系统自动补齐。",
              sourceRunId: requirementModelSnapshot.runId,
            }),
          );
        }
      }
      if (designSnapshot) {
        for (const diagram of dependencyDiagrams) {
          reviews.push(
            createAutoGeneratedUpstreamReview({
              artifactType: "design-model",
              artifactId: diagram,
              label: DESIGN_DIAGRAM_META[diagram].label,
              reason: "生成所选设计模型时缺少设计阶段上游模型，系统自动补齐。",
              sourceRunId: designSnapshot.runId,
            }),
          );
        }
      }
      await appendAutoGeneratedUpstreamReviews(reviews);
    },
    [
      appendAutoGeneratedUpstreamReviews,
      confirmGeneration,
      designInputFingerprints,
      designModels,
      models,
      openGenerationResultDialog,
      repository,
      requirementBaseline,
      requirementInputFingerprint,
      requirementModelTraceability,
      requirementReviewCandidates,
      requirementText,
      runGeneration,
      runDesignGeneration,
      rules,
      rulesBasedOnTextVersion,
      selectedDesignDiagrams,
      textVersion,
    ],
  );

  const generateCodePrototype = useCallback(
    async (mode: "continue" | "regenerate" = "continue") => {
      await runCodeGeneration(mode);
    },
    [runCodeGeneration],
  );

  const currentRequirementInputFingerprint = requirementInputFingerprintFor(
    requirementText,
    rules,
  );
  const isRulesStale =
    rules.length > 0 &&
    (requirementInputFingerprint
      ? !fingerprintMatches(
          requirementInputFingerprint,
          currentRequirementInputFingerprint,
        )
      : rulesBasedOnTextVersion !== null &&
        rulesBasedOnTextVersion !== textVersion);

  const presentRequirementDiagrams = orderedRequirementDiagrams(
    Object.keys(models).filter((diagram) =>
      Boolean(models[diagram as DiagramType]),
    ) as DiagramType[],
  );
  const generatedRequirementDiagramSet = new Set([
    ...generatedDiagrams,
    ...presentRequirementDiagrams,
  ]);
  const staleDiagrams = orderedRequirementDiagrams(
    [...generatedRequirementDiagramSet].filter((diagram) =>
      isRequirementDiagramStale({
        diagram,
        activeRequirementFingerprint: currentRequirementInputFingerprint,
        generatedDiagrams,
        requirementInputFingerprint,
        diagramInputFingerprints,
        diagramVersions,
        rulesVersion,
        models,
        requirementModelTraceability,
        manualModelEditStatus,
      }),
    ),
  );
  const requirementTraceabilityComplete = hasCompleteRequirementTraceability(
    Object.values(models),
    requirementModelTraceability,
    manualModelEditStatus,
  );
  const requirementTraceabilityMissing =
    requirementModelTraceability.length > 0
      ? !requirementTraceabilityComplete
      : generatedDiagrams.length > 0;
  const currentDesignInputFingerprint = designInputFingerprintFor(
    Object.values(models).filter((model): model is DiagramModelSpec =>
      Boolean(model),
    ),
    requirementModelTraceability,
  );
  const designFreshnessComplete =
    generatedDesignDiagrams.length === 0 ||
    Object.entries(designModels).every(([modelId]) =>
      designFingerprintMatches(
        designInputFingerprints[modelId],
        currentDesignInputFingerprint,
      ),
    );
  const designTraceabilityComplete = hasCompleteDesignTraceability(
    Object.values(designModels),
    designModelTraceability,
    manualModelEditStatus,
    Object.values(models),
  );
  const requirementTraceabilityStale =
    generatedRequirementDiagramSet.size > 0 &&
    (isRulesStale ||
      staleDiagrams.length > 0 ||
      requirementTraceabilityMissing);
  const designTraceabilityStale =
    generatedDesignDiagrams.length > 0 &&
    (requirementTraceabilityStale ||
      !designFreshnessComplete ||
      !designTraceabilityComplete);
  const pendingRequirementReviewRuleIds = requirementRuleIdsBlockingGeneration(
    requirementBaseline,
    requirementReviewCandidates,
  );
  const requirementReviewBlockedReason =
    pendingRequirementReviewRuleIds.length > 0
      ? "请先确认需求规则修复结果"
      : null;
  const designGenerationBlockedReason = !requirementText.trim()
    ? "请先输入需求文本"
    : requirementReviewBlockedReason;

  const visibleGenerationTask = useMemo(() => {
    if (selectedGenerationTaskId) {
      const selected = generationTasks.find(
        (task) => task.clientTaskId === selectedGenerationTaskId,
      );
      if (selected) return selected;
    }
    return generationTasks.find(isTaskActive) ?? generationTasks[0] ?? null;
  }, [generationTasks, selectedGenerationTaskId]);

  const visibleRunStatus =
    visibleGenerationTask?.status ?? runUiState.runStatus;
  const visibleRunProgress =
    visibleGenerationTask?.progress ?? runUiState.runProgress;
  const visibleRunMessage =
    visibleGenerationTask?.message ?? runUiState.runMessage;
  const visibleErrorMessage =
    visibleGenerationTask?.errorMessage ?? runUiState.errorMessage;
  const visibleRunDiagnostics =
    visibleGenerationTask?.diagnostics ?? currentRunDiagnostics;

  const generating = generationTasks.some(
    (task) => task.kind !== "document" && isTaskActive(task),
  );

  const value = useMemo<WorkspaceSessionState>(
    () => ({
      requirementText,
      setRequirementText,
      rules,
      requirementBaseline,
      requirementQualityReport,
      requirementReviewCandidates,
      autoGeneratedUpstreamReviews,
      decideAutoGeneratedUpstreamReview,
      acceptRequirementAiSuggestions,
      rejectRequirementAiSuggestions,
      confirmRequirementQualityHint,
      repairRequirementRule,
      decideRequirementReviewCandidate,
      addRequirementRule,
      createRequirementRule,
      updateRequirementRule,
      deleteRequirementRule,
      clearRequirementRules,
      models,
      requirementModelTraceability,
      manualModelEditStatus,
      selectedDiagrams,
      setSelectedDiagrams,
      plantUml,
      svgArtifacts,
      diagramErrors,
      selectedDesignDiagrams,
      setSelectedDesignDiagrams,
      designModels,
      designModelTraceability,
      designPlantUml,
      designSvgArtifacts,
      designDiagramErrors,
      codeSpec,
      codeBusinessLogic,
      codeFiles,
      codeEntryFile,
      codeDependencies,
      codeUiMockup,
      codeAgentPlan,
      codeSkills,
      codeSkillDiagnostics,
      codeSkillResourcePlan,
      codeSkillContext,
      codeDiagnostics,
      codeEditVersion,
      updateCodeFile,
      canUpdateWorkspace: workspacePermissions.canUpdateWorkspace,
      canStartRuns: workspacePermissions.canStartRuns,
      workspacePermissionReason: workspacePermissions.reason,
      generatedDesignDiagrams,
      generatedDiagrams,
      generating,
      runStatus: visibleRunStatus,
      runProgress: visibleRunProgress,
      runMessage: visibleRunMessage,
      errorMessage: visibleErrorMessage,
      billingGenerationBlock,
      clearBillingGenerationBlock,
      generationTasks,
      visibleGenerationTask,
      selectedGenerationTaskId: visibleGenerationTask?.clientTaskId ?? null,
      selectGenerationTask,
      clearCompletedGenerationTasks,
      generateRules,
      saveRequirementModelEdit,
      saveDesignModelEdit,
      rerenderRequirementModel,
      rerenderDesignModel,
      generateDiagrams,
      generateDesignDiagrams,
      generateCodePrototype,
      generateRequirementsSpec,
      generateSoftwareDesignSpec,
      rulesForDiagram,
      textVersion,
      rulesVersion,
      rulesBasedOnTextVersion,
      requirementInputFingerprint,
      diagramVersions,
      diagramInputFingerprints,
      designInputFingerprints,
      isRulesStale,
      staleDiagrams,
      requirementReviewBlockedReason,
      requirementTraceabilityStale,
      designTraceabilityStale,
      designGenerationBlockedReason,
      historyItems,
      refreshHistory,
      restoreRunHistory,
      deleteRunHistory,
      clearRunHistory,
      renderPlantUml,
      currentRunDiagnostics: visibleRunDiagnostics,
    }),
    [
      requirementText,
      setRequirementText,
      rules,
      requirementBaseline,
      requirementQualityReport,
      requirementReviewCandidates,
      autoGeneratedUpstreamReviews,
      acceptRequirementAiSuggestions,
      confirmRequirementQualityHint,
      decideAutoGeneratedUpstreamReview,
      decideRequirementReviewCandidate,
      rejectRequirementAiSuggestions,
      repairRequirementRule,
      addRequirementRule,
      createRequirementRule,
      updateRequirementRule,
      deleteRequirementRule,
      clearRequirementRules,
      models,
      requirementModelTraceability,
      manualModelEditStatus,
      selectedDiagrams,
      plantUml,
      svgArtifacts,
      diagramErrors,
      selectedDesignDiagrams,
      designModels,
      designModelTraceability,
      designPlantUml,
      designSvgArtifacts,
      designDiagramErrors,
      codeSpec,
      codeBusinessLogic,
      codeFiles,
      codeEntryFile,
      codeDependencies,
      codeUiMockup,
      codeAgentPlan,
      codeSkills,
      codeSkillDiagnostics,
      codeSkillResourcePlan,
      codeSkillContext,
      codeDiagnostics,
      codeEditVersion,
      updateCodeFile,
      workspacePermissions,
      generatedDesignDiagrams,
      generatedDiagrams,
      generating,
      runUiState,
      visibleRunStatus,
      visibleRunProgress,
      visibleRunMessage,
      visibleErrorMessage,
      billingGenerationBlock,
      clearBillingGenerationBlock,
      generationTasks,
      visibleGenerationTask,
      selectGenerationTask,
      clearCompletedGenerationTasks,
      generateRules,
      saveRequirementModelEdit,
      saveDesignModelEdit,
      rerenderRequirementModel,
      rerenderDesignModel,
      generateDiagrams,
      generateDesignDiagrams,
      generateCodePrototype,
      generateRequirementsSpec,
      generateSoftwareDesignSpec,
      rulesForDiagram,
      textVersion,
      rulesVersion,
      rulesBasedOnTextVersion,
      requirementInputFingerprint,
      diagramVersions,
      diagramInputFingerprints,
      designInputFingerprints,
      isRulesStale,
      staleDiagrams,
      requirementReviewBlockedReason,
      requirementTraceabilityStale,
      designTraceabilityStale,
      designGenerationBlockedReason,
      historyItems,
      refreshHistory,
      restoreRunHistory,
      deleteRunHistory,
      clearRunHistory,
      renderPlantUml,
      visibleRunDiagnostics,
    ],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
      <GenerationResultDialog
        result={generationResultDialog}
        onClose={closeGenerationResultDialog}
      />
      <GenerationConfirmationDialog
        confirmation={generationConfirmationDialog}
        onCancel={() => closeGenerationConfirmationDialog(false)}
        onConfirm={() => closeGenerationConfirmationDialog(true)}
      />
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession() {
  const value = useContext(WorkspaceSessionContext);
  if (!value) {
    throw new Error(
      "useWorkspaceSession must be used within WorkspaceSessionProvider",
    );
  }
  return value;
}
