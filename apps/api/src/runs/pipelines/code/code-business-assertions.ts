// Builds deterministic business assertions that tie generated code evidence back to baseline requirements.
import {
  codeBusinessAssertionResultSchema,
  extractProtectedRequirementFacts,
  type AtomicRequirement,
  type CodeBusinessAssertion,
  type CodeBusinessAssertionCategory,
  type CodeBusinessAssertionResult,
  type CodeBusinessLogic,
  type CodeRunSnapshot,
  type RequirementBaseline,
} from "@uml-platform/contracts";

type BuildCodeBusinessAssertionInput = {
  runId: string;
  baseline: RequirementBaseline;
  businessLogic: CodeBusinessLogic | null;
  files: CodeRunSnapshot["files"];
  generatedAt?: string;
};

type FileEvidence = {
  path: string;
  content: string;
};

const CATEGORY_PATTERNS: Array<{
  category: CodeBusinessAssertionCategory;
  pattern: RegExp;
}> = [
  { category: "permission", pattern: /登录|权限|访问|审批|授权|认证|未登录|不可执行|allowed|restricted|permission|auth|role/i },
  { category: "role", pattern: /角色|管理员|用户|借阅者|会员|学生|教师|医生|患者|主管|审批人|actor|role/i },
  { category: "state-machine", pattern: /状态|流转|提交|审批|取消|完成|关闭|退回|transition|status|state/i },
  { category: "data-consistency", pattern: /库存|余额|数量|容量|唯一|重复|一致|关联|必填|字段|数据|保存|更新/i },
  { category: "boundary-condition", pattern: /不超过|至少|最多|最少|大于|小于|边界|上限|下限|\d+\s*(?:秒|天|个|次|%|元)?|>=|<=|max|min/i },
  { category: "exception-feedback", pattern: /异常|失败|错误|不能|不得|禁止|提示|反馈|拒绝|无效|error|invalid|reject|fail/i },
  { category: "idempotency", pattern: /重复|再次|幂等|已存在|重复提交|duplicate|idempotent|already/i },
];

const ACCESS_POLICY_PATTERN =
  /currentUser|userId|ownerId|createdBy|assignedTo|isLoggedIn|isAuthenticated|can[A-Z]|hasPermission|permission|auth|role|未登录|请先登录|权限|角色|本人|自己的|他人|指导教师|安全员|审计员/i;
const GUARD_PATTERN =
  /\bif\s*\(|\?.*:|disabled|aria-disabled|filter\s*\(|some\s*\(|every\s*\(|includes\s*\(|switch\s*\(/i;
const STATE_PATTERN =
  /useState|set[A-Z]|status|state|状态|流转|transition|switch\s*\(/i;
const STATE_CHANGE_PATTERN =
  /set[A-Z]\w*\s*\(|dispatch\s*\(|transition\s*\(|update|保存|提交|取消|批准|拒绝|完成/i;
const VALIDATION_PATTERN =
  /validate|required|必填|校验|检查|invalid|[<>]=?|===|!==|overlap|冲突|重复|\bif\s*\(|\?.*:|disabled/i;
const FEEDBACK_PATTERN =
  /set(?:Error|Message|Feedback|Notice|Status)\w*\s*\(|toast\s*\(|alert\s*\(|role=["']alert["']|aria-live|error|错误|失败|提示|请先|拒绝|不能|不得|禁止/i;
const DATA_PATTERN =
  /filter\s*\(|map\s*\(|reduce\s*\(|find\s*\(|some\s*\(|every\s*\(|includes\s*\(|set[A-Z]|update|保存|更新|库存|数量|容量|唯一/i;
const IDEMPOTENCY_PATTERN =
  /disabled|inProgress|loading|already|duplicate|重复|已存在|已处理|幂等|processed|currentStatus|status/i;
const BEHAVIOR_PATTERN =
  /onClick|onSubmit|useState|set[A-Z]|\bif\s*\(|\?.*:|disabled|validate|filter\s*\(|map\s*\(|submit|handle[A-Z]/i;
const OBSERVABLE_EFFECT_PATTERN =
  /set[A-Z]\w*\s*\(|dispatch\s*\(|navigate\s*\(|filter\s*\(|map\s*\(|reduce\s*\(|\.push\s*\(|\.splice\s*\(|window\.location|toast\s*\(|alert\s*\(/i;
const ALTERNATIVE_EVIDENCE_PATTERN =
  /并发|响应时间|吞吐|可用性|审计日志.*保留|保留\s*\d+\s*年|加密|备份|灾备/i;
const STOP_TOKENS = new Set([
  "必须",
  "需要",
  "可以",
  "系统",
  "验证",
  "提供",
  "功能",
  "用户",
  "公众",
  "面向",
]);

const ROLE_ALIASES: Array<[RegExp, RegExp]> = [
  [/直属经理|经理/u, /直属经理|经理|directManager|lineManager|manager/i],
  [/财务专员/u, /财务专员|financeSpecialist|financeOfficer|finance/i],
  [/财务总监|总监/u, /财务总监|总监|financeDirector|director/i],
  [/部门审批员|审批员|审批人/u, /部门审批员|审批员|审批人|approver|approval/i],
  [/会议室管理员/u, /会议室管理员|roomAdmin|roomManager/i],
  [/实验室管理员/u, /实验室管理员|labAdmin|laboratoryAdmin/i],
  [/指导教师/u, /指导教师|advisor|supervisor|instructor/i],
  [/教师/u, /教师|teacher|instructor/i],
  [/安全员/u, /安全员|safetyOfficer|safety/i],
  [/审计员/u, /审计员|auditor|audit/i],
  [/管理员/u, /管理员|admin|manager/i],
  [/员工/u, /员工|employee/i],
  [/学生/u, /学生|student/i],
  [/普通用户|用户/u, /普通用户|用户|currentUser|user/i],
];

const DOMAIN_TERM_ALIASES: Array<[RegExp, RegExp]> = [
  [/统一身份认证|登录|认证/u, /统一身份认证|登录|login|auth|identity/i],
  [/报销|费用/u, /报销|费用|expense|reimbursement/i],
  [/发票/u, /发票|invoice|receipt/i],
  [/审批|批准|驳回/u, /审批|批准|驳回|approve|approval|reject|review/i],
  [/通知/u, /通知|notification|notice|message/i],
  [/审计|日志/u, /审计|日志|audit|log/i],
  [/预约/u, /预约|reservation|booking/i],
  [/会议室/u, /会议室|meetingRoom|room/i],
  [/设备/u, /设备|equipment|device/i],
  [/培训/u, /培训|training/i],
  [/维护/u, /维护|maintenance/i],
  [/签到|扫码/u, /签到|扫码|checkIn|scan|qr/i],
  [/状态|流转/u, /状态|流转|status|state|transition/i],
  [/金额|总额/u, /金额|总额|amount|total/i],
  [/重复|并发|重叠|唯一/u, /重复|并发|重叠|唯一|duplicate|concurrent|overlap|unique/i],
];

function acceptedRequirements(baseline: RequirementBaseline) {
  return baseline.requirements.filter((requirement) => requirement.status === "accepted");
}

function requirementText(requirement: AtomicRequirement) {
  const sourceFragment = requirement.sourceFragment.replace(
    /^\s*\[[^\]]+\]\s*/u,
    "",
  );
  return [
    requirement.actor,
    requirement.subject,
    requirement.action,
    requirement.object,
    requirement.condition,
    requirement.outcome,
    sourceFragment,
    ...requirement.acceptanceCriteria,
  ]
    .filter(Boolean)
    .join(" ");
}

function compactTokens(requirement: AtomicRequirement) {
  const tokens = new Set<string>();
  for (const part of requirementText(requirement).split(/[^\p{L}\p{N}]+/u)) {
    const token = part.trim();
    if (token.length < 2 || STOP_TOKENS.has(token)) continue;
    tokens.add(token);
    if (!/\p{Script=Han}/u.test(token)) continue;
    for (const match of token.matchAll(/\p{Script=Han}{2,}/gu)) {
      const phrase = match[0];
      for (let size = 2; size <= 4; size += 1) {
        if (phrase.length < size) continue;
        for (let index = 0; index <= phrase.length - size; index += 1) {
          const gram = phrase.slice(index, index + size);
          if (!STOP_TOKENS.has(gram)) tokens.add(gram);
        }
      }
    }
  }
  return Array.from(tokens);
}

function requirementSemanticText(requirement: AtomicRequirement) {
  return [
    requirement.actor,
    requirement.subject,
    requirement.action,
    requirement.object,
    requirement.condition,
    requirement.outcome,
    ...requirement.acceptanceCriteria,
  ]
    .filter(Boolean)
    .join(" ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function boundaryFactImplemented(content: string, factKey: string) {
  const parsed = factKey.match(/^([^:]*):(.+):([^:]*)$/u);
  const comparator = parsed?.[1] ?? "";
  const value = parsed?.[2] ?? "";
  if (!value) return true;
  const number = escapeRegExp(value);
  const compact = content.normalize("NFKC").replace(/\s+/gu, "");
  if (!comparator) return new RegExp(`(?<![\\d.])${number}(?![\\d.])`, "u").test(compact);
  const forwardOperator =
    comparator === "=" ? "={1,3}" : escapeRegExp(comparator);
  const reverseOperatorPattern =
    comparator === ">="
      ? "<="
      : comparator === "<="
        ? ">="
        : comparator === ">"
          ? "<"
          : comparator === "<"
            ? ">"
            : "={1,3}";
  return (
    new RegExp(`${forwardOperator}[\"']?${number}(?![\\d.])`, "u").test(compact) ||
    new RegExp(`(?<![\\d.])${number}[\"']?${reverseOperatorPattern}`, "u").test(
      compact,
    )
  );
}

function hasProtectedCodeSemantics(
  content: string,
  requirement: AtomicRequirement,
  category: CodeBusinessAssertionCategory,
) {
  const semanticText = requirementSemanticText(requirement);
  const facts = extractProtectedRequirementFacts({
    actor: null,
    subject: null,
    action: semanticText,
    object: null,
    condition: null,
    outcome: null,
  });
  const boundaryFacts = facts.filter((fact) => fact.kind === "boundary");
  if (
    boundaryFacts.some(
      (fact) => !boundaryFactImplemented(content, fact.key.replace(/^boundary:/u, "")),
    )
  ) {
    return false;
  }
  if (facts.some((fact) => fact.key === "logic:or") && !/\|\||\bor\b|或者|任一|或/u.test(content)) {
    return false;
  }
  if (facts.some((fact) => fact.key === "logic:and") && !/&&|\band\b|并且|同时|且/u.test(content)) {
    return false;
  }
  if (category === "permission" || category === "role") {
    const relevantRoles = ROLE_ALIASES.filter(([sourcePattern]) =>
      sourcePattern.test(semanticText),
    );
    if (relevantRoles.some(([, codePattern]) => !codePattern.test(content))) {
      return false;
    }
  }
  return true;
}

function sourceFiles(files: CodeRunSnapshot["files"]): FileEvidence[] {
  return Object.entries(files)
    .filter(([path]) => path.startsWith("/src/") && !path.endsWith(".css") && !path.endsWith(".json"))
    .map(([path, content]) => ({ path, content }));
}

function findEvidenceFiles(
  files: FileEvidence[],
  requirement: AtomicRequirement,
  category: CodeBusinessAssertionCategory,
  extraPatterns: RegExp[],
) {
  const tokens = compactTokens(requirement);
  const minimumMatches = tokens.length >= 3 ? 2 : 1;
  const semanticAliases = DOMAIN_TERM_ALIASES.filter(([sourcePattern]) =>
    sourcePattern.test(requirementText(requirement)),
  );
  return files
    .filter(({ content }) => {
      const text = content.toLowerCase();
      const matchedTokenCount = tokens.filter((token) => text.includes(token.toLowerCase())).length;
      const tokenMatched =
        semanticAliases.length > 0
          ? semanticAliases.some(([, codePattern]) => codePattern.test(content))
          : tokens.length === 0 || matchedTokenCount >= minimumMatches;
      return (
        tokenMatched &&
        extraPatterns.every((pattern) => pattern.test(content)) &&
        hasProtectedCodeSemantics(content, requirement, category)
      );
    })
    .map(({ path }) => path);
}

function inferCategories(
  requirement: AtomicRequirement,
  businessLogic: CodeBusinessLogic | null,
): CodeBusinessAssertionCategory[] {
  // Source labels such as CONFIRMED-B04 are provenance, not numeric business
  // boundaries. Category inference only consumes structured semantic fields.
  const baseText = [requirement.type, requirementSemanticText(requirement)].join(" ");
  const categories = new Set<CodeBusinessAssertionCategory>();
  for (const candidate of CATEGORY_PATTERNS) {
    if (candidate.pattern.test(baseText)) categories.add(candidate.category);
  }
  const tokens = compactTokens(requirement);
  const overlapsRequirement = (value: string) =>
    tokens.some((token) => value.toLowerCase().includes(token.toLowerCase()));
  if (/登录|权限|角色|访问|审批|授权|认证|不得|不能|禁止/i.test(baseText)) {
    for (const permission of businessLogic?.permissions ?? []) {
      const permissionText = `${permission.actor} ${permission.allowedActions.join(" ")} ${permission.restrictedActions.join(" ")}`;
      if (overlapsRequirement(permissionText)) categories.add("permission");
    }
  }
  for (const machine of businessLogic?.stateMachines ?? []) {
    const machineText = `${machine.entity} ${machine.states.join(" ")} ${machine.transitions.join(" ")}`;
    if (overlapsRequirement(machineText)) categories.add("state-machine");
  }
  for (const edgeCase of businessLogic?.edgeCases ?? []) {
    if (!overlapsRequirement(edgeCase)) continue;
    if (/重复|再次|幂等|已存在|重复提交|duplicate|idempotent|already/i.test(edgeCase)) {
      categories.add("idempotency");
    } else {
      categories.add("exception-feedback");
    }
  }
  if (requirement.type === "data" || requirement.type === "constraint") {
    categories.add("data-consistency");
  }
  if (requirement.type === "exception") categories.add("exception-feedback");
  if (categories.size === 0) categories.add("business-behavior");
  return Array.from(categories);
}

function patternsForCategory(category: CodeBusinessAssertionCategory) {
  if (category === "permission" || category === "role") {
    return [ACCESS_POLICY_PATTERN, GUARD_PATTERN];
  }
  if (category === "state-machine") return [STATE_PATTERN, STATE_CHANGE_PATTERN];
  if (category === "data-consistency") return [DATA_PATTERN, GUARD_PATTERN];
  if (category === "boundary-condition") {
    return [VALIDATION_PATTERN, FEEDBACK_PATTERN];
  }
  if (category === "exception-feedback") {
    return [VALIDATION_PATTERN, FEEDBACK_PATTERN];
  }
  if (category === "idempotency") {
    return [IDEMPOTENCY_PATTERN, GUARD_PATTERN, FEEDBACK_PATTERN];
  }
  return [BEHAVIOR_PATTERN, OBSERVABLE_EFFECT_PATTERN];
}

function expectedBehavior(category: CodeBusinessAssertionCategory, requirement: AtomicRequirement) {
  const target = requirement.sourceFragment;
  if (category === "permission") return `Code must enforce permission or authentication behavior for: ${target}`;
  if (category === "role") return `Code must distinguish the responsible role or actor for: ${target}`;
  if (category === "state-machine") return `Code must represent state transitions and invalid states for: ${target}`;
  if (category === "data-consistency") return `Code must preserve data consistency rules for: ${target}`;
  if (category === "boundary-condition") return `Code must validate boundary values for: ${target}`;
  if (category === "exception-feedback") return `Code must show exception or invalid-operation feedback for: ${target}`;
  if (category === "idempotency") return `Code must prevent duplicate or non-idempotent operations for: ${target}`;
  return `Code must implement observable business behavior for: ${target}`;
}

function assertionMessage(
  category: CodeBusinessAssertionCategory,
  evidenceArtifacts: string[],
) {
  if (evidenceArtifacts.length > 0) {
    return `Found ${category} evidence in ${evidenceArtifacts.join(", ")}.`;
  }
  return `No generated source file contained enough ${category} behavior evidence; UI text or BUSINESS_CONTEXT.md alone is not sufficient.`;
}

export function buildCodeBusinessAssertionResults({
  runId,
  baseline,
  businessLogic,
  files,
  generatedAt = new Date().toISOString(),
}: BuildCodeBusinessAssertionInput): CodeBusinessAssertionResult {
  const scanFiles = sourceFiles(files);
  const assertions: CodeBusinessAssertion[] = [];
  for (const requirement of acceptedRequirements(baseline)) {
    if (ALTERNATIVE_EVIDENCE_PATTERN.test(requirementText(requirement))) {
      assertions.push({
        id: `CBA-${String(assertions.length + 1).padStart(3, "0")}`,
        requirementId: requirement.id,
        category: "business-behavior",
        description: requirement.sourceFragment,
        expectedBehavior: `Use performance, security, persistence, or operational evidence instead of claiming UI prototype coverage for: ${requirement.sourceFragment}`,
        verificationMethod: "manual-review",
        evidenceArtifacts: [],
        status: "pending-review",
        severity: "warning",
        message:
          "This requirement cannot be proven by static prototype code and must follow an alternative evidence path.",
      });
      continue;
    }
    const categories = inferCategories(requirement, businessLogic);
    for (const category of categories) {
      const evidenceArtifacts = findEvidenceFiles(
        scanFiles,
        requirement,
        category,
        patternsForCategory(category),
      );
      const status = evidenceArtifacts.length > 0 ? "passed" : "failed";
      assertions.push({
        id: `CBA-${String(assertions.length + 1).padStart(3, "0")}`,
        requirementId: requirement.id,
        category,
        description: requirement.sourceFragment,
        expectedBehavior: expectedBehavior(category, requirement),
        verificationMethod: "static-code-scan",
        evidenceArtifacts,
        status,
        severity:
          status === "failed" && requirement.criticality === "critical"
            ? "critical"
            : status === "failed"
              ? "error"
              : "info",
        message: assertionMessage(category, evidenceArtifacts),
      });
    }
  }

  const blockingFailureIds = assertions
    .filter((assertion) => assertion.status !== "passed" && ["critical", "error"].includes(assertion.severity))
    .map((assertion) => assertion.id);
  return codeBusinessAssertionResultSchema.parse({
    runId,
    generatedAt,
    assertions,
    passed: blockingFailureIds.length === 0,
    blockingFailureIds,
  });
}
