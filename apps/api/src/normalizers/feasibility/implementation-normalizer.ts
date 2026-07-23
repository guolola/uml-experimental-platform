// Validates complete candidate plans and every requirement reference before persistence.
import {
  completeFeasibilityImplementationPlanSchema,
  type FeasibilityImplementationPlan,
} from "@uml-platform/contracts";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureCollectionIds(value: unknown, prefix: string) {
  if (!Array.isArray(value)) return value;
  return value.map((item, index) => {
    if (!isRecord(item)) return item;
    const id = typeof item.id === "string" && item.id.trim() ? item.id : `${prefix}-${index + 1}`;
    return { ...item, id };
  });
}

function normalizeStructuralIds(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return value;
  return {
    ...value,
    candidates: value.candidates.map((rawCandidate, candidateIndex) => {
      if (!isRecord(rawCandidate)) return rawCandidate;
      const candidateId = typeof rawCandidate.id === "string" && rawCandidate.id.trim()
        ? rawCandidate.id
        : `candidate-${candidateIndex + 1}`;
      if (!isRecord(rawCandidate.implementation)) return { ...rawCandidate, id: candidateId };
      const implementation = rawCandidate.implementation;
      const architecture = isRecord(implementation.architecture)
        ? {
            ...implementation.architecture,
            modules: ensureCollectionIds(implementation.architecture.modules, `${candidateId}-module`),
          }
        : implementation.architecture;
      return {
        ...rawCandidate,
        id: candidateId,
        implementation: {
          ...implementation,
          architecture,
          integrations: ensureCollectionIds(implementation.integrations, `${candidateId}-integration`),
          milestones: ensureCollectionIds(implementation.milestones, `${candidateId}-milestone`),
          costEstimates: ensureCollectionIds(implementation.costEstimates, `${candidateId}-cost`),
          benefitEstimates: ensureCollectionIds(implementation.benefitEstimates, `${candidateId}-benefit`),
          risks: ensureCollectionIds(implementation.risks, `${candidateId}-risk`),
        },
      };
    }),
  };
}

export function normalizeFeasibilityImplementation(
  value: unknown,
  validRequirementIds: ReadonlySet<string>,
): FeasibilityImplementationPlan {
  // Internal IDs are structural metadata, so safely synthesize them when a provider omits them.
  const plan = completeFeasibilityImplementationPlanSchema.parse(normalizeStructuralIds(value));
  const candidateIds = new Set<string>();
  const validateSources = (ids: string[], assumption: string, label: string, provenance: string) => {
    for (const id of ids) {
      if (!validRequirementIds.has(id)) {
        throw new Error(`${label}引用了不存在的需求规则：${id}`);
      }
    }
    if (ids.length === 0 && !assumption.trim()) {
      throw new Error(`${label}必须引用需求规则或明确记录方案假设`);
    }
    if (provenance !== "ai-estimate") {
      throw new Error(`${label}必须标记为 AI 初始草案`);
    }
  };

  for (const candidate of plan.candidates) {
    if (candidateIds.has(candidate.id)) throw new Error(`候选方案编号重复：${candidate.id}`);
    candidateIds.add(candidate.id);
    if (candidate.provenance !== "ai-estimate" || candidate.implementation?.provenance !== "ai-estimate") {
      throw new Error(`候选方案 ${candidate.id} 必须标记为 AI 初始草案`);
    }
    validateSources(candidate.sourceRequirementIds, candidate.assumption, `候选方案 ${candidate.id}`, candidate.provenance);
    const implementation = candidate.implementation!;
    implementation.architecture.modules.forEach((item) => validateSources(item.sourceRequirementIds, item.assumption, `模块 ${item.id}`, item.provenance));
    validateSources(implementation.dataStrategy.sourceRequirementIds, implementation.dataStrategy.assumption, `候选方案 ${candidate.id} 的数据策略`, implementation.dataStrategy.provenance);
    implementation.integrations.forEach((item) => validateSources(item.sourceRequirementIds, item.assumption, `集成 ${item.id}`, item.provenance));
    validateSources(implementation.deploymentAndOperations.sourceRequirementIds, implementation.deploymentAndOperations.assumption, `候选方案 ${candidate.id} 的部署方案`, implementation.deploymentAndOperations.provenance);
    validateSources(implementation.securityAndCompliance.sourceRequirementIds, implementation.securityAndCompliance.assumption, `候选方案 ${candidate.id} 的安全方案`, implementation.securityAndCompliance.provenance);
    implementation.milestones.forEach((item) => validateSources(item.sourceRequirementIds, item.assumption, `里程碑 ${item.id}`, item.provenance));
    implementation.costEstimates.forEach((item) => validateSources(item.sourceRequirementIds, item.assumption, `成本估算 ${item.id}`, item.provenance));
    implementation.benefitEstimates.forEach((item) => validateSources(item.sourceRequirementIds, item.assumption, `收益估算 ${item.id}`, item.provenance));
    implementation.risks.forEach((item) => validateSources(item.sourceRequirementIds, item.assumption, `风险 ${item.id}`, item.provenance));
    if ([...implementation.costEstimates, ...implementation.benefitEstimates].some((item) => item.provenance !== "ai-estimate")) {
      throw new Error(`候选方案 ${candidate.id} 的初始成本收益必须标记为 AI 估算`);
    }
    if (implementation.analysisPeriodAssumption?.provenance !== "ai-estimate"
      || implementation.absenceDeclarations.some((item) => item.provenance !== "ai-estimate")
      || implementation.verdicts.some((item) => item.provenance !== "ai-estimate")) {
      throw new Error(`候选方案 ${candidate.id} 的初始分析、缺省结论和五类结论必须标记为 AI 估算`);
    }
    const verdictCategories = implementation.verdicts.map((item) => item.category);
    if (new Set(verdictCategories).size !== 5) {
      throw new Error(`候选方案 ${candidate.id} 的五类可行性结论必须各出现一次`);
    }
  }
  return plan;
}
