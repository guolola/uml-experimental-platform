// Builds deterministic business assertions that tie generated code evidence back to baseline requirements.
import {
  codeBusinessAssertionResultSchema,
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

const GUARD_PATTERN =
  /\bif\s*\(|\?.*:|disabled|aria-disabled|can[A-Z]|is[A-Z]|has[A-Z]|allowed|restricted|permission|auth|role|未登录|请先登录/i;
const STATE_PATTERN =
  /useState|set[A-Z]|status|state|状态|流转|transition|switch\s*\(|\bif\s*\(|\?.*:/i;
const VALIDATION_PATTERN =
  /validate|required|必填|校验|检查|error|错误|提示|请先|invalid|不能|不得|禁止|\bif\s*\(|disabled/i;
const DATA_PATTERN =
  /filter\s*\(|map\s*\(|reduce\s*\(|find\s*\(|some\s*\(|every\s*\(|includes\s*\(|set[A-Z]|update|保存|更新|库存|数量|容量|唯一/i;
const IDEMPOTENCY_PATTERN =
  /disabled|inProgress|loading|already|duplicate|重复|已存在|已处理|幂等|processed|currentStatus|status/i;
const BEHAVIOR_PATTERN =
  /onClick|onSubmit|useState|set[A-Z]|\bif\s*\(|\?.*:|disabled|validate|filter\s*\(|map\s*\(|submit|handle[A-Z]|保存|提交|审批|取消|登录|访问/i;

function acceptedRequirements(baseline: RequirementBaseline) {
  return baseline.requirements.filter((requirement) => requirement.status === "accepted");
}

function requirementText(requirement: AtomicRequirement) {
  return [
    requirement.actor,
    requirement.subject,
    requirement.action,
    requirement.object,
    requirement.condition,
    requirement.outcome,
    requirement.sourceFragment,
    ...requirement.acceptanceCriteria,
  ]
    .filter(Boolean)
    .join(" ");
}

function compactTokens(requirement: AtomicRequirement) {
  return Array.from(
    new Set(
      requirementText(requirement)
        .split(/[^\p{L}\p{N}]+/u)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && !["必须", "需要", "可以", "系统", "验证"].includes(part)),
    ),
  );
}

function sourceFiles(files: CodeRunSnapshot["files"]): FileEvidence[] {
  return Object.entries(files)
    .filter(([path]) => path.startsWith("/src/") && !path.endsWith(".css") && !path.endsWith(".json"))
    .map(([path, content]) => ({ path, content }));
}

function findEvidenceFiles(
  files: FileEvidence[],
  requirement: AtomicRequirement,
  extraPattern: RegExp,
) {
  const tokens = compactTokens(requirement);
  return files
    .filter(({ content }) => {
      const text = content.toLowerCase();
      const tokenMatched =
        tokens.length === 0 ||
        tokens.some((token) => text.includes(token.toLowerCase()));
      return tokenMatched && extraPattern.test(content);
    })
    .map(({ path }) => path);
}

function inferCategories(
  requirement: AtomicRequirement,
  businessLogic: CodeBusinessLogic | null,
): CodeBusinessAssertionCategory[] {
  const baseText = [requirement.type, requirementText(requirement)].join(" ");
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

function patternForCategory(category: CodeBusinessAssertionCategory) {
  if (category === "permission" || category === "role") return GUARD_PATTERN;
  if (category === "state-machine") return STATE_PATTERN;
  if (category === "data-consistency") return DATA_PATTERN;
  if (category === "boundary-condition" || category === "exception-feedback") {
    return VALIDATION_PATTERN;
  }
  if (category === "idempotency") return IDEMPOTENCY_PATTERN;
  return BEHAVIOR_PATTERN;
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
    const categories = inferCategories(requirement, businessLogic);
    for (const category of categories) {
      const evidenceArtifacts = findEvidenceFiles(
        scanFiles,
        requirement,
        patternForCategory(category),
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
