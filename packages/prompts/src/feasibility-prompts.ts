// Builds strict JSON prompts for feasibility context and implementation stages.
import type {
  ContextDiagramSpec,
  FeasibilityInputs,
  RequirementBaseline,
  RequirementRule,
} from "@uml-platform/contracts";

const JSON_ONLY = "只返回一个 JSON 对象，不要 Markdown、代码围栏或解释文字。";

function sourcePayload(
  rules: RequirementRule[],
  requirementBaseline: RequirementBaseline | null,
  inputs: FeasibilityInputs,
) {
  return JSON.stringify({ rules, requirementBaseline, inputs }, null, 2);
}

export function buildGenerateFeasibilityContextPrompt(input: {
  rules: RequirementRule[];
  requirementBaseline: RequirementBaseline | null;
  inputs: FeasibilityInputs;
}) {
  return `${JSON_ONLY}
根据已确认需求生成系统上下文结构。禁止推测未提供的人员、外部系统、协议、数据库或技术栈；不确定信息应省略。
所有 people、externalSystems 和 relationships 必须至少引用一个输入 rules.id；system.sourceRequirementIds 必须为空数组。
元素 id 和关系 id 必须唯一；关系端点只能引用 system、people 或 externalSystems 中存在的 id。
输出结构：
{"diagramKind":"context","modelId":"context","title":"...","summary":"...","notes":[],"system":{"id":"system","name":"...","description":"...","sourceRequirementIds":[]},"people":[{"id":"person-1","name":"...","description":"...","sourceRequirementIds":["R1"]}],"externalSystems":[],"relationships":[{"id":"relationship-1","sourceId":"person-1","targetId":"system","direction":"directed|bidirectional","label":"...","description":"...","sourceRequirementIds":["R1"]}]}
输入：
${sourcePayload(input.rules, input.requirementBaseline, input.inputs)}`;
}

export function buildGenerateFeasibilityImplementationPrompt(input: {
  rules: RequirementRule[];
  requirementBaseline: RequirementBaseline | null;
  inputs: FeasibilityInputs;
  contextModel: ContextDiagramSpec;
}) {
  return `${JSON_ONLY}
根据有效上下文、需求基线和补充资料生成恰好 2 个可执行候选方案，两个候选都必须包含完整 implementation；recommendedCandidateId 必须引用其中一个候选方案。
学校、学院、成员、提出者、真实预算和法律事实只能使用输入资料，禁止编造。实现成本、收益和分析年限允许生成合理估算，但必须标记为 ai-estimate，并写明估算依据、置信度或方案假设，不得冒充用户确认事实。
每个候选必须至少有 1 条优势和 1 条不足。每个 implementation 必须完整包含 architecture、dataStrategy、integrations、integrationRationale、deploymentAndOperations、securityAndCompliance、milestones、analysisPeriodAssumption、costEstimates、benefitEstimates、absenceDeclarations、risks、verdicts、decision 和 preconditions。
costEstimates、benefitEstimates 不得为空；risks 必须为 3 到 5 项；每个里程碑必须有交付物、角色和验收条件。
成本估算使用 CNY 区间，minimum 不得大于 maximum；成本类别只能是 capital、other-one-time、recurring。收益类别只能是 one-time、recurring、intangible；不可计量收益的 range 必须为 null，其余收益必须有金额区间。
如果确实没有外部集成、里程碑依赖或某一成本收益类别，不得虚构条目：在 integrationRationale、dependencyRationale 或 absenceDeclarations 中返回明确原因。
verdicts 必须且只能包含 technical、operational、schedule、economic、legal 五类各一次。所有候选、implementation、模块、数据策略、集成、部署、安全、里程碑、成本、收益、风险、缺省结论和五类结论的 provenance 均使用 ai-estimate。
所有 sourceRequirementIds 只能引用输入 rules.id；没有直接来源时使用空数组，并在 assumption 中明确记录方案假设，禁止虚构编号。
每个 costEstimate 必须包含 id、name、category、frequency、range、note、sourceRequirementIds、assumption、provenance；range 必须包含 minimum、maximum、currency、basis、confidence。
每个 benefitEstimate 必须包含 id、name、category、frequency、range、outcome、sourceRequirementIds、assumption、provenance。
absenceDeclarations 的 scope 只能使用 integrations、dependencies、capital-costs、other-one-time-costs、recurring-costs、one-time-benefits、recurring-benefits、intangible-benefits。
只有对应条目确实不存在时才能输出 absenceDeclaration；已有该类成本或收益条目时，禁止再声明该类不存在，scope 也不得重复。
保留旧兼容字段 oneTimeCosts、recurringCosts、quantitativeBenefits、qualitativeBenefits，并根据结构化估算同步生成非空摘要列表。
输出必须是完整 JSON，第二个候选不得使用省略号、引用第一个候选或省略任何字段。
严格沿用以下对象形状；所有数组中的结构项都必须是对象，禁止把模块、里程碑、风险或结论简写成字符串：
{"overview":"...","candidates":[{"id":"candidate-1","name":"...","summary":"...","advantages":["..."],"disadvantages":["..."],"estimatedCost":"...","estimatedSchedule":"...","sourceRequirementIds":["R1"],"assumption":"...","provenance":"ai-estimate","implementation":{"provenance":"ai-estimate","architecture":{"summary":"...","modules":[{"id":"candidate-1-module-1","name":"...","responsibility":"...","sourceRequirementIds":["R1"],"assumption":"...","provenance":"ai-estimate"}]},"dataStrategy":{"summary":"...","sourceRequirementIds":["R1"],"assumption":"...","provenance":"ai-estimate"},"integrations":[{"id":"candidate-1-integration-1","name":"...","purpose":"...","sourceRequirementIds":["R1"],"assumption":"...","provenance":"ai-estimate"}],"integrationRationale":"...","deploymentAndOperations":{"summary":"...","sourceRequirementIds":[],"assumption":"...","provenance":"ai-estimate"},"securityAndCompliance":{"summary":"...","sourceRequirementIds":["R1"],"assumption":"...","provenance":"ai-estimate"},"milestones":[{"id":"candidate-1-milestone-1","name":"...","timeframe":"...","deliverables":["..."],"roles":["..."],"dependencies":[],"dependencyRationale":"...","acceptanceCriteria":["..."],"sourceRequirementIds":["R1"],"assumption":"...","provenance":"ai-estimate"}],"analysisPeriodAssumption":{"years":3,"basis":"...","provenance":"ai-estimate"},"costEstimates":[{"id":"candidate-1-cost-1","name":"...","category":"capital|other-one-time|recurring","frequency":"one-time|monthly|annual","range":{"minimum":0,"maximum":0,"currency":"CNY","basis":"...","confidence":"low|medium|high"},"note":"...","sourceRequirementIds":[],"assumption":"...","provenance":"ai-estimate"}],"benefitEstimates":[{"id":"candidate-1-benefit-1","name":"...","category":"one-time|recurring|intangible","frequency":"one-time|monthly|annual","range":null,"outcome":"...","sourceRequirementIds":["R1"],"assumption":"...","provenance":"ai-estimate"}],"absenceDeclarations":[],"oneTimeCosts":["..."],"recurringCosts":["..."],"quantitativeBenefits":["..."],"qualitativeBenefits":["..."],"risks":[{"id":"candidate-1-risk-1","risk":"...","probability":"low|medium|high","impact":"low|medium|high","mitigation":"...","owner":"...","sourceRequirementIds":[],"assumption":"...","provenance":"ai-estimate"}],"verdicts":[{"category":"technical","verdict":"feasible|conditional|not-feasible|unknown","rationale":"...","provenance":"ai-estimate"},{"category":"operational","verdict":"conditional","rationale":"...","provenance":"ai-estimate"},{"category":"schedule","verdict":"conditional","rationale":"...","provenance":"ai-estimate"},{"category":"economic","verdict":"conditional","rationale":"...","provenance":"ai-estimate"},{"category":"legal","verdict":"unknown","rationale":"...","provenance":"ai-estimate"}],"decision":"go|conditional-go|no-go","preconditions":["..."]}}],"recommendedCandidateId":"candidate-1","recommendationRationale":"..."}
将 candidates 中同一完整对象形状实际输出两次，并为第二个候选使用独立 id 和独立完整内容。示例中的 R1 仅表示结构，实际只能使用输入中真实存在的规则编号。
输入：
${JSON.stringify(input, null, 2)}`;
}

export function buildRepairFeasibilityJsonPrompt(input: {
  stage: "context" | "implementation";
  previousOutput: string;
  error: string;
  originalPrompt: string;
}) {
  return `${JSON_ONLY}
上一份${input.stage === "context" ? "上下文" : "实现方案"} JSON 不符合契约。修复结构、引用、枚举值和缺失的必填分析；不得增加输入中不存在的用户事实，但必须补齐契约要求的 AI 估算和明确标注的方案假设。完整保留原始任务给出的对象形状，不得把结构对象压缩成字符串，且必须输出 recommendationRationale 与五个带 category 的 verdict 对象。
校验错误：${input.error}
原始任务：${input.originalPrompt}
待修复输出：${input.previousOutput}`;
}
