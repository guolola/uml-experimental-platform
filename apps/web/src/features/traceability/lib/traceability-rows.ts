// Builds traceability matrix rows from workspace state without rendering UI.
import type {
  DesignDiagramKind,
  DiagramKind,
  ModelElementRef,
  RequirementRule,
} from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  DIAGRAM_ORDER,
  getDesignModelId,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
} from "../../../entities/diagram/lib/model-details";
import type { useWorkspaceSession } from "../../workspace-session/state";

export type RowStatus = "mapped" | "unmapped";
export type MatrixScope = {
  diagramKind: DiagramKind | DesignDiagramKind;
  modelId?: string;
  label?: string;
};

export type ElementRow = {
  id: string;
  label: string;
  subtitle: string;
  typeLabel: string;
  groupKey: string;
  groupLabel: string;
  scopeKey: string;
  status: RowStatus;
  mappingNote: string | null;
  requirementRules: RequirementRule[];
  requirementElements: ModelElementRef[];
  upstreamDesignElements: ModelElementRef[];
  detailLines: string[];
};

export const PAGE_SIZE_OPTIONS = [8, 12, 24] as const;
export const ALL_GROUPS = "__all__";

function refKey(ref: Pick<ModelElementRef, "diagramKind" | "elementId" | "modelId">) {
  const scope = ref.modelId?.trim() || ref.diagramKind;
  return `${scope}:${ref.diagramKind}:${ref.elementId}`.toLowerCase();
}

export function formatRuleId(id: string) {
  const value = id.trim();
  const match = /^r(\d+)$/i.exec(value);
  return match ? `R${match[1]}` : value.toUpperCase();
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function refsForRequirementModels(
  models: ReturnType<typeof useWorkspaceSession>["models"],
  scope?: MatrixScope,
) {
  const scopedModels = uniqueBy(
    Object.values(models)
      .filter((model): model is NonNullable<typeof model> => Boolean(model))
      .filter((model) => {
        if (!scope) return true;
        const modelId = getRequirementModelId(model);
        return scope.modelId
          ? modelId === scope.modelId
          : model.diagramKind === scope.diagramKind;
      }),
    getRequirementModelId,
  ).sort((left, right) => {
    const leftOrder = DIAGRAM_ORDER.indexOf(left.diagramKind as DiagramType);
    const rightOrder = DIAGRAM_ORDER.indexOf(right.diagramKind as DiagramType);
    return leftOrder - rightOrder || getRequirementModelId(left).localeCompare(getRequirementModelId(right));
  });
  return scopedModels.flatMap((model) => {
    const diagram = model.diagramKind as DiagramKind;
    const modelId = getRequirementModelId(model);
    const detail = buildDiagramDetailModel(model);
    const items = detail.items.filter((item) =>
      isBusinessTraceabilityKind(item.kind),
    );
    const businessIds = new Set(items.map((item) => item.id));
    const relationships = detail.relationships.filter(
      (relationship) =>
        diagram !== "activity" ||
        (businessIds.has(relationship.sourceId) &&
          businessIds.has(relationship.targetId)),
    );
    return uniqueBy([
      ...items.map((item) => ({
        ref: {
          diagramKind: diagram as DiagramKind,
          modelId,
          elementId: item.id,
          elementKind: item.kind,
          label: item.label,
        },
        typeLabel: SEMANTIC_KIND_META[item.kind].label,
        description: item.description ?? "",
      })),
      ...relationships.map((relationship) => ({
        ref: {
          diagramKind: diagram as DiagramKind,
          modelId,
          elementId: relationship.id,
          elementKind: "relationship",
          label: relationship.label,
        },
        typeLabel: relationship.typeLabel,
        description: `${relationship.sourceId} -> ${relationship.targetId}`,
      })),
    ], (entry) => refKey(entry.ref));
  });
}

function refsForDesignModels(
  models: ReturnType<typeof useWorkspaceSession>["designModels"],
  scope?: MatrixScope,
) {
  return Object.values(models).filter((model) => {
    if (!scope) return true;
    const modelId = getDesignModelId(model);
    return scope.modelId
      ? modelId === scope.modelId
      : model.diagramKind === scope.diagramKind;
  }).flatMap((model) => {
    const diagram = model.diagramKind;
    const modelId = getDesignModelId(model);
    const detail = buildDiagramDetailModel(model);
    const items = detail.items.filter((item) =>
      isBusinessTraceabilityKind(item.kind),
    );
    const businessIds = new Set(items.map((item) => item.id));
    const relationships = detail.relationships.filter(
      (relationship) =>
        diagram !== "activity" ||
        (businessIds.has(relationship.sourceId) &&
          businessIds.has(relationship.targetId)),
    );
    return [
      ...items.map((item) => ({
        ref: {
          diagramKind: diagram as DesignDiagramKind,
          modelId,
          elementId: item.id,
          elementKind: item.kind,
          label: item.label,
        },
        typeLabel: SEMANTIC_KIND_META[item.kind].label,
        description: item.description ?? "",
      })),
      ...relationships.map((relationship) => ({
        ref: {
          diagramKind: diagram as DesignDiagramKind,
          modelId,
          elementId: relationship.id,
          elementKind: "relationship",
          label: relationship.label,
        },
        typeLabel: relationship.typeLabel,
        description: `${relationship.sourceId} -> ${relationship.targetId}`,
      })),
    ];
  });
}

export function requirementGroupLabel(diagramKind: DiagramKind | DesignDiagramKind) {
  return DIAGRAM_META[diagramKind as DiagramType]?.label ?? String(diagramKind);
}

export function designGroupLabel(diagramKind: DiagramKind | DesignDiagramKind) {
  return DESIGN_DIAGRAM_META[diagramKind as DesignDiagramType]?.label ?? String(diagramKind);
}

function sourceUseCaseIdFromAnalysisModel(model: NonNullable<ReturnType<typeof useWorkspaceSession>["models"][string]>) {
  if (model.diagramKind !== "analysis") return "";
  const explicit = compactString((model as unknown as { sourceUseCaseId?: unknown }).sourceUseCaseId);
  if (explicit) return explicit;
  const modelId = getRequirementModelId(model);
  return modelId.startsWith("analysis:") ? modelId.slice("analysis:".length) : "";
}

function sourceUseCaseForAnalysis(
  models: ReturnType<typeof useWorkspaceSession>["models"],
  analysisModelId: string,
) {
  const analysisModel = Object.values(models)
    .filter((model): model is NonNullable<typeof model> => Boolean(model))
    .find((model) => getRequirementModelId(model) === analysisModelId);
  const sourceUseCaseId = analysisModel ? sourceUseCaseIdFromAnalysisModel(analysisModel) : "";
  if (!sourceUseCaseId) return null;
  const useCaseModel = Object.values(models)
    .filter((model): model is NonNullable<typeof model> => Boolean(model))
    .find((model) => model.diagramKind === "usecase");
  if (!useCaseModel || useCaseModel.diagramKind !== "usecase") return null;
  const useCase = useCaseModel.useCases.find((item) => item.id === sourceUseCaseId);
  return useCase ? { useCaseModel, useCase } : null;
}

function eventFlowLines(useCase: unknown) {
  const flows = ensureArray((useCase as { eventFlows?: unknown }).eventFlows);
  return flows.flatMap((flow) => {
    const record = flow as Record<string, unknown>;
    const flowLabel = compactString(record.name) || compactString(record.id) || "未命名事件流";
    const flowType = compactString(record.flowType) || compactString(record.type);
    const steps = ensureArray(record.steps).slice(0, 4).map((step) => {
      const stepRecord = step as Record<string, unknown>;
      const action =
        compactString(stepRecord.actorAction) ||
        compactString(stepRecord.action) ||
        compactString(stepRecord.description);
      const response =
        compactString(stepRecord.systemResponse) ||
        compactString(stepRecord.systemAction) ||
        compactString(stepRecord.expectedResult);
      const order = compactString(stepRecord.order);
      return [
        order ? `步骤 ${order}` : "步骤",
        action,
        response ? `系统响应：${response}` : "",
      ].filter(Boolean).join("：");
    });
    return [
      `事件流：${flowType ? `${flowType} · ` : ""}${flowLabel}`,
      ...steps,
    ];
  });
}

function buildAnalysisRequirementRows(
  models: ReturnType<typeof useWorkspaceSession>["models"],
  scope: MatrixScope,
): ElementRow[] {
  return refsForRequirementModels(models, scope).map(({ ref, typeLabel, description }) => {
    const source = ref.modelId ? sourceUseCaseForAnalysis(models, ref.modelId) : null;
    const sourceRef: ModelElementRef | null = source
      ? {
          diagramKind: "usecase",
          elementId: source.useCase.id,
          elementKind: "usecase",
          label: source.useCase.name,
        }
      : null;
    const flowLines = source ? eventFlowLines(source.useCase) : [];
    const mapped = Boolean(sourceRef && flowLines.length > 0);
    return {
      id: refKey(ref),
      label: ref.label,
      subtitle: description || `${requirementGroupLabel(ref.diagramKind)} · ${typeLabel}`,
      typeLabel,
      groupKey: ref.modelId ?? ref.diagramKind,
      groupLabel: requirementGroupLabel(ref.diagramKind),
      scopeKey: ref.modelId ?? ref.diagramKind,
      status: mapped ? "mapped" : "unmapped",
      mappingNote: mapped ? "由来源用例事件流派生" : "缺少来源用例或事件流",
      requirementRules: [],
      requirementElements: sourceRef ? [sourceRef] : [],
      upstreamDesignElements: [],
      detailLines: [
        ...(sourceRef ? [`来源用例：${sourceRef.label}`] : ["来源用例：未找到"]),
        ...flowLines,
      ],
    };
  });
}

export function buildRequirementRows(
  rules: RequirementRule[],
  models: ReturnType<typeof useWorkspaceSession>["models"],
  traceability: ReturnType<typeof useWorkspaceSession>["requirementModelTraceability"],
  scope?: MatrixScope,
): ElementRow[] {
  if (scope?.diagramKind === "analysis") {
    return buildAnalysisRequirementRows(models, scope);
  }
  const rulesById = new Map(rules.map((rule) => [rule.id.toLowerCase(), rule]));
  const traceByTarget = new Map<
    string,
    Array<{
      rule: RequirementRule;
      mappingSource?: string;
      reviewStatus?: string;
      confidence?: string;
      rationale?: string;
    }>
  >();
  for (const entry of traceability) {
    const rule = rulesById.get(entry.ruleId.toLowerCase());
    if (!rule) continue;
    const key = refKey(entry.target);
    traceByTarget.set(key, [
      ...(traceByTarget.get(key) ?? []),
      {
        rule,
        mappingSource: entry.mappingSource,
        reviewStatus: entry.reviewStatus,
        confidence: entry.confidence,
        rationale: entry.rationale,
      },
    ]);
  }

  return refsForRequirementModels(models, scope).map(({ ref, typeLabel, description }) => {
    const mappedEntries = uniqueBy(
      traceByTarget.get(refKey(ref)) ?? [],
      (entry) => entry.rule.id,
    );
    const mappedRules = mappedEntries.map((entry) => entry.rule);
    const pendingEntry = mappedEntries.find(
      (entry) =>
        entry.mappingSource === "auto-filled-pending-review" ||
        entry.reviewStatus === "pending",
    );
    return {
      id: refKey(ref),
      label: ref.label,
      subtitle: description || `${requirementGroupLabel(ref.diagramKind)} · ${typeLabel}`,
      typeLabel,
      groupKey: ref.modelId ?? ref.diagramKind,
      groupLabel: requirementGroupLabel(ref.diagramKind),
      scopeKey: ref.modelId ?? ref.diagramKind,
      status: mappedRules.length > 0 ? "mapped" : "unmapped",
      mappingNote: pendingEntry
        ? pendingEntry.rationale ?? "系统自动补齐，需复核确认"
        : null,
      requirementRules: mappedRules,
      requirementElements: [],
      upstreamDesignElements: [],
      detailLines: [
        ...(pendingEntry
          ? [`待确认：${pendingEntry.rationale ?? "系统自动补齐，需复核确认"}`]
          : []),
        ...mappedEntries
          .filter((entry) => entry.confidence)
          .map((entry) => `置信度：${entry.confidence}`),
        ...mappedRules.map(
        (rule) => `${formatRuleId(rule.id)} [${rule.category}] ${rule.text}`,
        ),
      ],
    };
  });
}

function deriveVisibleUpstreamDesignRefs(
  traceability: ReturnType<typeof useWorkspaceSession>["designModelTraceability"],
) {
  const sequenceSourcesByTarget = new Map<string, ModelElementRef[]>();
  for (const entry of traceability) {
    if (entry.source.diagramKind !== "sequence") continue;
    for (const target of entry.targets) {
      const key = refKey(target);
      sequenceSourcesByTarget.set(key, [
        ...(sequenceSourcesByTarget.get(key) ?? []),
        entry.source,
      ]);
    }
  }
  if (sequenceSourcesByTarget.size === 0) return traceability;

  return traceability.map((entry) => {
    if (entry.source.diagramKind === "sequence") return entry;
    const upstreamDesignRefs = new Map<string, ModelElementRef>();
    for (const ref of entry.upstreamDesignRefs ?? []) {
      upstreamDesignRefs.set(refKey(ref), ref);
    }
    for (const target of entry.targets) {
      for (const source of sequenceSourcesByTarget.get(refKey(target)) ?? []) {
        upstreamDesignRefs.set(refKey(source), source);
      }
    }
    return upstreamDesignRefs.size > 0
      ? { ...entry, upstreamDesignRefs: Array.from(upstreamDesignRefs.values()) }
      : entry;
  });
}

export function buildDesignRows(
  rules: RequirementRule[],
  requirementModels: ReturnType<typeof useWorkspaceSession>["models"],
  designModels: ReturnType<typeof useWorkspaceSession>["designModels"],
  requirementTraceability: ReturnType<typeof useWorkspaceSession>["requirementModelTraceability"],
  designTraceability: ReturnType<typeof useWorkspaceSession>["designModelTraceability"],
  scope?: MatrixScope,
): ElementRow[] {
  const requirementRefMap = new Map(
    refsForRequirementModels(requirementModels).map(({ ref }) => [refKey(ref), ref]),
  );
  const rulesById = new Map(rules.map((rule) => [rule.id.toLowerCase(), rule]));
  const rulesByRequirementRef = new Map<string, RequirementRule[]>();
  for (const entry of requirementTraceability) {
    const rule = rulesById.get(entry.ruleId.toLowerCase());
    if (!rule) continue;
    const key = refKey(entry.target);
    rulesByRequirementRef.set(key, [...(rulesByRequirementRef.get(key) ?? []), rule]);
  }
  const traceBySource = new Map<
    string,
    ReturnType<typeof useWorkspaceSession>["designModelTraceability"][number]
  >();
  for (const entry of deriveVisibleUpstreamDesignRefs(designTraceability)) {
    traceBySource.set(entry.source.elementId ? refKey(entry.source) : "", entry);
  }

  return refsForDesignModels(designModels, scope).map(({ ref, typeLabel, description }) => {
    const traceEntry = traceBySource.get(refKey(ref));
    const targets = uniqueBy<ModelElementRef>(
      (traceEntry?.targets ?? [])
        .map((target) => requirementRefMap.get(refKey(target)) ?? target),
      refKey,
    );
    const mappedRules = uniqueBy(
      targets.flatMap((target) => rulesByRequirementRef.get(refKey(target)) ?? []),
      (rule) => rule.id,
    );
    const upstreamDesignElements = uniqueBy<ModelElementRef>(
      traceEntry?.upstreamDesignRefs ?? [],
      refKey,
    );
    return {
      id: refKey(ref),
      label: ref.label,
      subtitle: description || `${designGroupLabel(ref.diagramKind)} · ${typeLabel}`,
      typeLabel,
      groupKey: ref.diagramKind,
      groupLabel: designGroupLabel(ref.diagramKind),
      scopeKey: ref.modelId ?? ref.diagramKind,
      status: targets.length > 0 ? "mapped" : "unmapped",
      mappingNote:
        traceEntry?.mappingSource === "auto-filled-pending-review" ||
        traceEntry?.reviewStatus === "pending"
          ? traceEntry.rationale ?? "系统自动补齐，需复核确认"
          : traceEntry?.mappingSource === "derived-from-endpoints"
            ? traceEntry.rationale ?? "由端点映射推导"
            : null,
      requirementRules: mappedRules,
      requirementElements: targets,
      upstreamDesignElements,
      detailLines: [
        ...(traceEntry?.mappingSource === "auto-filled-pending-review" ||
        traceEntry?.reviewStatus === "pending"
          ? [`待确认：${traceEntry.rationale ?? "系统自动补齐，需复核确认"}`]
          : []),
        ...(traceEntry?.mappingSource === "derived-from-endpoints"
          ? [`映射说明：${traceEntry.rationale ?? "由端点映射推导"}`]
          : []),
        ...upstreamDesignElements.map(
          (target) =>
            `来源用例实现设计：${target.modelId ?? designGroupLabel(target.diagramKind)} / ${target.label}`,
        ),
        ...targets.map(
          (target) =>
            `需求元素：${requirementGroupLabel(target.diagramKind)} / ${target.label}`,
        ),
        ...mappedRules.map(
          (rule) => `${formatRuleId(rule.id)} [${rule.category}] ${rule.text}`,
        ),
      ],
    };
  });
}

export function includesQuery(row: ElementRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    row.label,
    row.subtitle,
    row.typeLabel,
    row.groupLabel,
    row.mappingNote ?? "",
    ...row.detailLines,
    ...row.upstreamDesignElements.map((ref) => ref.label),
    ...row.requirementElements.map((ref) => ref.label),
    ...row.requirementRules.flatMap((rule) => [
      formatRuleId(rule.id),
      rule.category,
      rule.text,
    ]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

export function buildGroupOptions(rows: ElementRow[]) {
  return Array.from(
    new Map(rows.map((row) => [row.groupKey, row.groupLabel])).entries(),
  ).map(([value, label]) => ({ value, label }));
}
