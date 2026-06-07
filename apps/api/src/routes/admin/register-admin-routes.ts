// Registers admin endpoints and delegates provider key handling to secure storage.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminRoleDataScopes,
  adminRolePermissions,
  adminOrganizationCreateRequestSchema,
  adminOrganizationListResponseSchema,
  adminCourseCreateRequestSchema,
  adminCourseListResponseSchema,
  adminClassCreateRequestSchema,
  adminClassListResponseSchema,
  adminTeamCreateRequestSchema,
  adminTeamListResponseSchema,
  adminOrganizationMembershipCreateRequestSchema,
  adminOrganizationMembershipListResponseSchema,
  adminQuotaCreateRequestSchema,
  adminQuotaListResponseSchema,
  adminProviderQuotaListResponseSchema,
  adminProviderUsageListResponseSchema,
  adminRateLimitPolicyCreateRequestSchema,
  adminRateLimitPolicyListResponseSchema,
  adminRateLimitPolicyUpdateRequestSchema,
  adminSessionResponseSchema,
  type AdminCapability,
  type AdminDataScope,
  type AdminPermission,
  type AdminRole,
} from "@uml-platform/contracts";
import { getModelCapability } from "../../model-capabilities.js";
import { getHealthcheckResponseFormat } from "../../adapters/llm/response-formats/index.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type {
  RunRecord,
  RunRecordMetadata,
  RunRecordStore,
} from "../../runs/records/run-record-store.js";
import {
  cancelRunRecord,
  createQueuedRunFromSource,
  isRetryableRun,
} from "../../runs/records/run-actions.js";
import type { AuthStore, UserRecord } from "../../auth/in-memory-auth-store.js";
import { isAuthError, requireAdminSessionAuth } from "../../auth/guards.js";
import { toLoginEventDto, toProjectDto, toUserDto } from "../../auth/dto.js";
import {
  getAdminHeaderActor,
  type AdminActor,
  requireAdminPermission,
} from "../../security/admin-guard.js";
import {
  ADMIN_ROLES,
  buildAdminRbacContext,
  getAdminCapabilities,
  getAdminDataScopes,
  getAdminPermissions,
  getAdminRoles,
  hasAnyAdminRole,
} from "../../security/admin-rbac.js";
import {
  ProviderConfigPolicyError,
  type ProviderConfigStore,
} from "../../provider-configs/provider-config-store.js";
import {
  createInMemoryAcademicAdminRepository,
  type AcademicAdminRepository,
} from "../../db/academic-admin-repository.js";
import { createPostgresAcademicAdminRepository } from "../../db/postgres-academic-admin-repository.js";
import {
  createPostgresPoolFromEnv,
  getDatabaseUrl,
} from "../../db/postgres.js";
import {
  resolveProviderRateLimitPolicy,
  selectProviderRateLimitPolicy,
  type ProviderRateLimitPolicy,
  type ProviderRateLimitPolicyRecord,
  type ProviderTaskType,
  type ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import type { LlmScheduler } from "../../adapters/llm/llm-scheduler.js";

export type AdminRiskEvent = {
  id: string;
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  actorUserId: string | null;
  projectId: string | null;
  targetType: string;
  targetId: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AdminRunPipelineStarter = (input: {
  record: RunRecord;
  source: RunRecord;
  request: FastifyRequest;
  actorUserId: string;
}) => Promise<void> | void;

type ScopedAdminActor = AdminActor & {
  roles: AdminRole[];
  dataScopes: AdminDataScope[];
  capabilities: AdminCapability[];
};

type AcademicAdminStore = AcademicAdminRepository;

function createAcademicAdminRepository(app: FastifyInstance): AcademicAdminRepository {
  if (!getDatabaseUrl()) {
    return createInMemoryAcademicAdminRepository();
  }

  const pool = createPostgresPoolFromEnv();
  app.addHook("onClose", async () => {
    await pool.end();
  });
  return createPostgresAcademicAdminRepository(pool);
}

async function requireOrganizationAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
): Promise<ScopedAdminActor | { message: string }> {
  const headerActor = getAdminHeaderActor(request);
  if (headerActor) {
    return {
      ...headerActor,
      roles: ["super_admin"],
      permissions: getAdminPermissions(["super_admin"]),
      dataScopes: getAdminDataScopes(["super_admin"]),
      capabilities: getAdminCapabilities(["super_admin"]),
    };
  }

  const auth = await requireAdminSessionAuth(request, reply, authStore);
  if (isAuthError(auth)) return auth;
  if (!hasAnyAdminRole(auth.user.systemRoles)) {
    reply.code(403);
    return { message: "Admin access required" };
  }
  if (!auth.user.mfaEnabled) {
    reply.code(403);
    return { message: "Admin MFA is required before accessing the admin console" };
  }

  const roles = getAdminRoles(auth.user.systemRoles);
  return {
    id: auth.user.id,
    name: auth.user.displayName,
    role: roles[0] ?? "admin",
    roles,
    permissions: getAdminPermissions(roles),
    dataScopes: getAdminDataScopes(roles),
    capabilities: getAdminCapabilities(roles),
  };
}

function hasFullAcademicScope(actor: ScopedAdminActor) {
  return actor.dataScopes.some((scope) =>
    ["all_projects", "all_users", "system"].includes(scope),
  );
}

function hasAcademicRead(actor: ScopedAdminActor) {
  return actor.capabilities.includes("viewProjects");
}

function hasAcademicWrite(actor: ScopedAdminActor) {
  return actor.capabilities.includes("manageProjects");
}

async function scopedCourseIds(store: AcademicAdminStore, actor: ScopedAdminActor) {
  const courses = await store.listCourses();

  if (hasFullAcademicScope(actor)) {
    return new Set(courses.map((course) => course.id));
  }

  const courseIds = new Set<string>();
  for (const membership of await store.listMemberships()) {
    if (membership.status !== "active" || membership.userId !== actor.id) continue;
    if (membership.targetType === "organization") {
      for (const course of courses) {
        if (course.organizationId === membership.targetId) courseIds.add(course.id);
      }
    }
    if (membership.targetType === "course") courseIds.add(membership.targetId);
    if (membership.targetType === "class") {
      const classRecord = await store.getClass(membership.targetId);
      if (classRecord) courseIds.add(classRecord.courseId);
    }
    if (membership.targetType === "team") {
      const team = await store.getTeam(membership.targetId);
      const classRecord = team ? await store.getClass(team.classId) : null;
      if (classRecord) courseIds.add(classRecord.courseId);
    }
  }
  return courseIds;
}

async function canSeeOrganization(
  store: AcademicAdminStore,
  actor: ScopedAdminActor,
  organizationId: string,
) {
  if (hasFullAcademicScope(actor)) return true;
  const scopedCourses = await scopedCourseIds(store, actor);
  return (await store.listCourses()).some(
    (course) =>
      course.organizationId === organizationId && scopedCourses.has(course.id),
  );
}

async function canSeeCourse(
  store: AcademicAdminStore,
  actor: ScopedAdminActor,
  courseId: string,
) {
  return hasFullAcademicScope(actor) || (await scopedCourseIds(store, actor)).has(courseId);
}

async function canSeeClass(
  store: AcademicAdminStore,
  actor: ScopedAdminActor,
  classId: string,
) {
  const classRecord = await store.getClass(classId);
  return Boolean(classRecord && (await canSeeCourse(store, actor, classRecord.courseId)));
}

async function canSeeTeam(
  store: AcademicAdminStore,
  actor: ScopedAdminActor,
  teamId: string,
) {
  const team = await store.getTeam(teamId);
  return Boolean(team && (await canSeeClass(store, actor, team.classId)));
}

async function canSeeTarget(
  store: AcademicAdminStore,
  actor: ScopedAdminActor,
  targetType: "organization" | "course" | "class" | "team",
  targetId: string,
) {
  if (targetType === "organization") return canSeeOrganization(store, actor, targetId);
  if (targetType === "course") return canSeeCourse(store, actor, targetId);
  if (targetType === "class") return canSeeClass(store, actor, targetId);
  return canSeeTeam(store, actor, targetId);
}

function hasFullProjectScope(actor: AdminActor) {
  return actor.dataScopes.some((scope) =>
    ["all_projects", "all_users", "system"].includes(scope),
  );
}

async function canSeeProjectByScope(
  store: AcademicAdminStore,
  authStore: AuthStore,
  actor: AdminActor,
  project: Awaited<ReturnType<AuthStore["getProject"]>> extends infer Project
    ? NonNullable<Project>
    : never,
) {
  if (hasFullProjectScope(actor)) return true;

  if (actor.dataScopes.includes("assigned_projects")) {
    const member = await authStore.findProjectMember(project.id, actor.id);
    if (member) return true;
  }

  if (actor.dataScopes.includes("assigned_courses")) {
    if (project.teamId && (await canSeeTeam(store, actor as ScopedAdminActor, project.teamId))) {
      return true;
    }
    if (project.classId && (await canSeeClass(store, actor as ScopedAdminActor, project.classId))) {
      return true;
    }
    if (project.courseId && (await canSeeCourse(store, actor as ScopedAdminActor, project.courseId))) {
      return true;
    }
    if (
      project.organizationId &&
      !project.courseId &&
      !project.classId &&
      !project.teamId &&
      (await canSeeOrganization(store, actor as ScopedAdminActor, project.organizationId))
    ) {
      return true;
    }
  }

  return false;
}

async function visibleProjectsForAdmin(
  store: AcademicAdminStore,
  authStore: AuthStore,
  actor: AdminActor,
) {
  return filterAsync(await authStore.listProjects(), (project) =>
    canSeeProjectByScope(store, authStore, actor, project),
  );
}

async function visibleUserIdsForAdmin(
  store: AcademicAdminStore,
  authStore: AuthStore,
  actor: AdminActor,
) {
  if (actor.dataScopes.includes("all_users") || actor.dataScopes.includes("system")) {
    return null;
  }

  const visibleUserIds = new Set<string>([actor.id]);
  for (const membership of await store.listMemberships()) {
    if (membership.status === "active" && membership.userId && await canSeeTarget(
      store,
      actor as ScopedAdminActor,
      membership.targetType,
      membership.targetId,
    )) {
      visibleUserIds.add(membership.userId);
    }
  }

  for (const project of await visibleProjectsForAdmin(store, authStore, actor)) {
    visibleUserIds.add(project.ownerUserId);
    for (const member of await authStore.listProjectMembers(project.id)) {
      if (member.status === "active" && member.userId) {
        visibleUserIds.add(member.userId);
      }
    }
  }

  return visibleUserIds;
}

const createProviderConfigRequestSchema = z.object({
  name: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  baseUrl: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  defaultModel: z.string().trim().min(1),
  allowedModels: z.array(z.string().trim().min(1)).optional(),
  keyPurpose: z.string().trim().min(1).optional(),
  quota: z.string().trim().min(1).optional(),
  scopeType: z.enum(["system", "user", "project"]).default("system"),
  scopeId: z.string().trim().min(1).nullable().optional(),
});

const updateProviderConfigRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  defaultModel: z.string().trim().min(1).optional(),
  allowedModels: z.array(z.string().trim().min(1)).optional(),
  keyPurpose: z.string().trim().min(1).optional(),
  quota: z.string().trim().min(1).optional(),
  scopeType: z.enum(["system", "user", "project"]).optional(),
  scopeId: z.string().trim().min(1).nullable().optional(),
}).strict();

const rotateProviderKeyRequestSchema = z.object({
  apiKey: z.string().trim().min(1),
});

const providerTestRequestSchema = z
  .object({
    model: z.string().trim().min(1).optional(),
  })
  .strict()
  .default({});

const HIGH_RISK_ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "super-admin",
  "system_admin",
  "system-admin",
  "system_operator",
  "security_admin",
  "security-admin",
]);

function metric(label: string, value: string, trend = "", tone = "neutral") {
  return { label, value, trend, tone };
}

function sendAdminOnly(
  app: FastifyInstance,
  path: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => unknown,
) {
  app.get(path, handler);
}

async function filterAsync<T>(
  items: T[],
  predicate: (item: T) => Promise<boolean>,
) {
  const visible: T[] = [];
  for (const item of items) {
    if (await predicate(item)) visible.push(item);
  }
  return visible;
}

function toAdminUserDto(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled ?? false,
    systemRoles: user.systemRoles,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function userLabel(user: UserRecord) {
  return `${user.displayName} <${user.email}> (${user.id})`;
}

function actorLabel(actor: AdminActor) {
  return `${actor.name} (${actor.id})`;
}

function providerRateLimitDto(policy: ProviderRateLimitPolicy) {
  return {
    limit: policy.limit,
    windowSeconds: policy.windowSeconds,
    source:
      policy.source === "env"
        ? "environment"
        : policy.source === "stored"
          ? "admin_policy"
      : "default",
  };
}

function disabledProviderCostEstimate() {
  return {
    enabled: false,
    amount: null,
    currency: null,
    externalBillingSource: "external_provider",
    note:
      "Provider usage is operational telemetry only; cost estimates are disabled and account billing stays with the external provider.",
  } as const;
}

type AdminRunTaskType =
  | "requirements_to_uml"
  | "design_modeling"
  | "code_generation"
  | "document_generation"
  | "unknown";

type GenerationTaskType = Exclude<AdminRunTaskType, "unknown">;

type GenerationBreakdownRow = {
  taskType: GenerationTaskType;
  label: string;
  generatedCount: number;
  successRate: string;
  failureRate: string;
  averageDuration: string;
  averageDurationMs: number | null;
  modelCallCount: number;
  artifactSummary: string;
  artifactCounts: Array<{ label: string; value: number }>;
  sampleCount: number;
  successfulCount: number;
  failedCount: number;
  recentRuns: Array<{
    id: string;
    status: RunRecord["snapshot"]["status"];
    createdAt: string | null;
    durationMs: number | null;
    artifactSummary: string;
  }>;
};

const GENERATION_TASKS: Array<{ taskType: GenerationTaskType; label: string }> = [
  { taskType: "requirements_to_uml", label: "需求建模" },
  { taskType: "design_modeling", label: "设计建模" },
  { taskType: "document_generation", label: "说明书生成" },
  { taskType: "code_generation", label: "代码生成" },
];

const GENERATION_TASK_TYPE_SET = new Set<AdminRunTaskType>(
  GENERATION_TASKS.map((item) => item.taskType),
);

type AdminRunArtifactSummary = {
  title: string;
  description: string;
  metrics: Array<{ label: string; value: string | number }>;
  artifacts: Array<{ label: string; count: number; detail?: string }>;
  notes: string[];
};

type AdminRunArtifactItem = {
  id: string;
  type: string;
  title: string;
  diagramKind?: string;
  modelId?: string;
  sourceLength?: number;
  renderMeta?: unknown;
  previewAvailable: boolean;
  preview?: {
    kind: "svg";
    svg: string;
    renderMeta?: unknown;
  };
  meta?: Record<string, string | number | boolean | null>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function objectKeyCount(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

function snapshotErrorMessage(snapshot: RunRecord["snapshot"]) {
  const source = asRecord(snapshot);
  const error = asRecord(source.error);
  return typeof error.message === "string"
    ? error.message
    : typeof source.errorMessage === "string"
      ? source.errorMessage
      : null;
}

function artifactIdPart(value: unknown) {
  return String(value ?? "item")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "item";
}

function diagramKindLabel(kind: unknown) {
  if (kind === "usecase") return "用例模型";
  if (kind === "class") return "领域概念模型";
  if (kind === "activity") return "总体业务流程";
  if (kind === "deployment") return "部署需求模型";
  if (kind === "prototype") return "原型界面关系";
  if (kind === "analysis") return "需求分析模型";
  if (kind === "sequence") return "用例实现设计";
  if (kind === "table") return "数据库设计";
  return typeof kind === "string" && kind.trim() ? kind : "模型图";
}

function stringOrNumber(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function readProviderModel(snapshot: RunRecord["snapshot"]) {
  const settings = asRecord(asRecord(snapshot).providerSettings);
  return typeof settings.model === "string" && settings.model.trim()
    ? settings.model
    : null;
}

function taskTypeForSnapshot(snapshot: RunRecord["snapshot"]): AdminRunTaskType {
  if ("documentKind" in snapshot) return "document_generation";
  if ("files" in snapshot) return "code_generation";
  if ("designModelTraceability" in snapshot) return "design_modeling";
  if ("models" in snapshot || "plantUml" in snapshot || "svgArtifacts" in snapshot) {
    return "requirements_to_uml";
  }
  return "unknown";
}

function documentKindLabel(kind: unknown) {
  if (kind === "requirementsSpec") return "需求规格说明书";
  if (kind === "softwareDesignSpec") return "软件设计说明书";
  return "文档";
}

function formatBytes(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "未记录";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function buildRunArtifactSummary(snapshot: RunRecord["snapshot"]): AdminRunArtifactSummary {
  const source = asRecord(snapshot);
  const taskType = taskTypeForSnapshot(snapshot);
  if (taskType === "document_generation") {
    return {
      title: "文档生成结果",
      description: `${documentKindLabel(source.documentKind)}${typeof source.fileName === "string" ? `：${source.fileName}` : ""}`,
      metrics: [
        { label: "文档类型", value: documentKindLabel(source.documentKind) },
        { label: "文件大小", value: formatBytes(source.byteLength) },
        { label: "章节数", value: arrayLength(source.sections) },
        { label: "缺失产物", value: arrayLength(source.missingArtifacts) },
      ],
      artifacts: [
        { label: "DOCX 文档", count: source.documentId ? 1 : 0, detail: typeof source.fileName === "string" ? source.fileName : undefined },
      ],
      notes: [
        source.documentId ? `文档 ID：${source.documentId}` : "后台未返回文档 ID",
        arrayLength(source.missingArtifacts) > 0
          ? `缺失产物：${(source.missingArtifacts as string[]).join("、")}`
          : "未发现缺失产物",
      ],
    };
  }

  if (taskType === "code_generation") {
    const files = asRecord(source.files);
    const dependencies = asRecord(source.dependencies);
    return {
      title: "代码原型生成结果",
      description: typeof source.entryFile === "string" ? `入口文件：${source.entryFile}` : "后台未返回入口文件",
      metrics: [
        { label: "生成文件", value: Object.keys(files).length },
        { label: "依赖", value: Object.keys(dependencies).length },
        { label: "质量诊断", value: arrayLength(source.qualityDiagnostics) },
        { label: "变更文件", value: typeof source.changedFileCount === "number" ? source.changedFileCount : Object.keys(files).length },
      ],
      artifacts: [
        { label: "代码文件", count: Object.keys(files).length, detail: Object.keys(files).slice(0, 4).join("、") || undefined },
        { label: "业务逻辑", count: source.businessLogic ? 1 : 0 },
        { label: "UI 蓝图", count: source.uiBlueprint || source.uiIr ? 1 : 0 },
      ],
      notes: [
        source.codeGenerationMode ? `生成模式：${source.codeGenerationMode}` : "后台未返回生成模式",
        source.repairLoopSummary ? "包含修复循环摘要" : "未返回修复循环摘要",
      ],
    };
  }

  if (taskType === "design_modeling") {
    return {
      title: "设计建模生成结果",
      description: "从需求模型生成设计模型、设计 PlantUML 和设计 SVG。",
      metrics: [
        { label: "设计模型", value: arrayLength(source.models) },
        { label: "设计 PlantUML", value: arrayLength(source.plantUml) },
        { label: "设计 SVG", value: arrayLength(source.svgArtifacts) },
        { label: "关联需求模型", value: arrayLength(source.requirementModels) },
      ],
      artifacts: [
        { label: "设计模型", count: arrayLength(source.models) },
        { label: "PlantUML", count: arrayLength(source.plantUml) },
        { label: "SVG/PNG", count: arrayLength(source.svgArtifacts) },
      ],
      notes: [
        arrayLength(source.requestedDiagrams) > 0
          ? `请求图类型：${(source.requestedDiagrams as string[]).join("、")}`
          : "后台未返回请求图类型",
        objectKeyCount(source.diagramErrors) > 0 ? "存在图生成错误" : "未发现图生成错误",
      ],
    };
  }

  return {
    title: "需求建模生成结果",
    description: "从需求文本生成 UML 模型、PlantUML 和 SVG/PNG。",
    metrics: [
      { label: "需求长度", value: typeof source.requirementText === "string" ? source.requirementText.length : "未记录" },
      { label: "模型", value: arrayLength(source.models) },
      { label: "PlantUML", value: arrayLength(source.plantUml) },
      { label: "SVG/PNG", value: arrayLength(source.svgArtifacts) },
    ],
    artifacts: [
      { label: "UML 模型", count: arrayLength(source.models) },
      { label: "PlantUML", count: arrayLength(source.plantUml) },
      { label: "SVG/PNG", count: arrayLength(source.svgArtifacts) },
    ],
    notes: [
      source.coverageMatrix ? "已生成覆盖矩阵" : "未返回覆盖矩阵",
      source.traceabilityMatrix ? "已生成追踪矩阵" : "未返回追踪矩阵",
      objectKeyCount(source.diagramErrors) > 0 ? "存在图生成错误" : "未发现图生成错误",
    ],
  };
}

function buildRunArtifactItems(
  snapshot: RunRecord["snapshot"],
  options: { includePreviews?: boolean } = {},
): AdminRunArtifactItem[] {
  const runId = snapshot.runId;
  const source = asRecord(snapshot);
  const taskType = taskTypeForSnapshot(snapshot);
  const items: AdminRunArtifactItem[] = [];
  const add = (item: Omit<AdminRunArtifactItem, "id"> & { key: string | number }) => {
    const { key, ...rest } = item;
    items.push({ id: `${runId}:${artifactIdPart(rest.type)}:${artifactIdPart(key)}`, ...rest });
  };

  for (const [index, rule] of (Array.isArray(source.rules) ? source.rules : []).entries()) {
    const record = asRecord(rule);
    add({
      key: stringOrNumber(record.id) ?? index,
      type: "需求规则",
      title: typeof record.text === "string" ? record.text : `需求规则 ${index + 1}`,
      previewAvailable: false,
    });
  }

  for (const [index, model] of (Array.isArray(source.models) ? source.models : []).entries()) {
    const record = asRecord(model);
    const diagramKind = typeof record.diagramKind === "string" ? record.diagramKind : undefined;
    const type = taskType === "design_modeling" ? "设计模型" : "UML 模型";
    add({
      key: stringOrNumber(record.id) ?? stringOrNumber(record.modelId) ?? diagramKind ?? index,
      type,
      title: typeof record.title === "string" ? record.title : `${diagramKindLabel(diagramKind)}模型`,
      diagramKind,
      modelId: typeof record.modelId === "string" ? record.modelId : typeof record.id === "string" ? record.id : undefined,
      previewAvailable: false,
    });
  }

  for (const [index, artifact] of (Array.isArray(source.plantUml) ? source.plantUml : []).entries()) {
    const record = asRecord(artifact);
    const diagramKind = typeof record.diagramKind === "string" ? record.diagramKind : undefined;
    const modelId = typeof record.modelId === "string" ? record.modelId : undefined;
    const plantUmlSource = typeof record.source === "string" ? record.source : "";
    add({
      key: `${diagramKind ?? index}:${modelId ?? index}`,
      type: "PlantUML",
      title: `${diagramKindLabel(diagramKind)} PlantUML`,
      diagramKind,
      modelId,
      sourceLength: plantUmlSource.length || undefined,
      previewAvailable: false,
    });
  }

  for (const [index, artifact] of (Array.isArray(source.svgArtifacts) ? source.svgArtifacts : []).entries()) {
    const record = asRecord(artifact);
    const diagramKind = typeof record.diagramKind === "string" ? record.diagramKind : undefined;
    const modelId = typeof record.modelId === "string" ? record.modelId : undefined;
    const svg = typeof record.svg === "string" ? record.svg : "";
    const renderMeta = record.renderMeta;
    add({
      key: `${diagramKind ?? index}:${modelId ?? index}`,
      type: "SVG/PNG",
      title: `${diagramKindLabel(diagramKind)}模型图`,
      diagramKind,
      modelId,
      renderMeta,
      previewAvailable: Boolean(svg),
      preview: options.includePreviews && svg
        ? { kind: "svg", svg, renderMeta }
        : undefined,
    });
  }

  if (source.coverageMatrix) {
    add({
      key: "coverage",
      type: "覆盖矩阵",
      title: "覆盖矩阵",
      previewAvailable: false,
    });
  }
  if (source.traceabilityMatrix) {
    const matrix = asRecord(source.traceabilityMatrix);
    add({
      key: "traceability",
      type: "追踪矩阵",
      title: "追踪矩阵",
      previewAvailable: false,
      meta: {
        links: arrayLength(matrix.links),
        diagnostics: arrayLength(matrix.diagnostics),
      },
    });
  }

  const files = asRecord(source.files);
  for (const [path, content] of Object.entries(files)) {
    add({
      key: path,
      type: "代码文件",
      title: path,
      sourceLength: typeof content === "string" ? content.length : undefined,
      previewAvailable: false,
    });
  }
  if (source.businessLogic) {
    add({ key: "business-logic", type: "业务逻辑", title: "业务逻辑摘要", previewAvailable: false });
  }
  for (const [index, diagnostic] of (Array.isArray(source.qualityDiagnostics) ? source.qualityDiagnostics : Array.isArray(source.diagnostics) ? source.diagnostics : []).entries()) {
    const record = asRecord(diagnostic);
    add({
      key: stringOrNumber(record.id) ?? index,
      type: "质量检查",
      title: typeof record.message === "string" ? record.message : `质量检查 ${index + 1}`,
      previewAvailable: false,
    });
  }
  if (source.documentId || source.fileName) {
    add({
      key: stringOrNumber(source.documentId) ?? stringOrNumber(source.fileName) ?? "document",
      type: "DOCX 文档",
      title: typeof source.fileName === "string" ? source.fileName : documentKindLabel(source.documentKind),
      previewAvailable: false,
      meta: {
        documentId: typeof source.documentId === "string" ? source.documentId : null,
        size: typeof source.byteLength === "number" ? source.byteLength : null,
      },
    });
  }

  return items;
}

function calculateDurationMs(createdAt?: string, completedAt?: string) {
  if (!createdAt || !completedAt) return null;
  const start = new Date(createdAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

function timestampMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function shanghaiDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shanghaiDayWindow(dateText: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }
  const startMs = Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
  const today = shanghaiDateString(now);
  if (dateText > today) return null;
  const nextStartMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: dateText === today ? now.toISOString() : new Date(nextStartMs).toISOString(),
  };
}

function isInWindow(value: unknown, window: { startIso: string; endIso: string }) {
  const time = timestampMs(value);
  if (time === null) return false;
  return time >= new Date(window.startIso).getTime() && time < new Date(window.endIso).getTime();
}

function percentage(count: number, total: number) {
  return total > 0 ? `${Math.round((count / total) * 100)}%` : "0%";
}

function formatDuration(valueMs: number | null) {
  if (valueMs === null) return "暂无数据";
  if (valueMs < 1000) return `${valueMs}ms`;
  if (valueMs < 60_000) {
    return `${(valueMs / 1000).toFixed(valueMs < 10_000 ? 1 : 0)}秒`;
  }
  if (valueMs < 60 * 60_000) return `${Math.round(valueMs / 60_000)}分钟`;
  return `${(valueMs / 3_600_000).toFixed(1)}小时`;
}

function averageDuration(records: RunRecord[]) {
  const durations = records
    .map((record) => calculateDurationMs(record.metadata?.createdAt, record.metadata?.completedAt))
    .filter((duration): duration is number => duration !== null);
  if (durations.length === 0) return { label: "暂无数据", valueMs: null };
  const valueMs = Math.round(
    durations.reduce((total, duration) => total + duration, 0) / durations.length,
  );
  return { label: formatDuration(valueMs), valueMs };
}

function isGenerationTaskType(value: AdminRunTaskType): value is GenerationTaskType {
  return GENERATION_TASK_TYPE_SET.has(value);
}

function artifactCountSummary(counts: Array<{ label: string; value: number }>) {
  const visible = counts.filter((item) => item.value > 0);
  if (visible.length === 0) return "暂无所选日期产物";
  return visible.map((item) => `${item.label} ${item.value}`).join(" · ");
}

function readMetricDocumentKind(value: unknown) {
  return value === "requirementsSpec" || value === "softwareDesignSpec"
    ? value
    : null;
}

async function listMetricDocuments(documentLibrary: DocumentLibrary) {
  const listAllDocuments = (documentLibrary as { listAllDocuments?: unknown }).listAllDocuments;
  if (typeof listAllDocuments !== "function") return [];
  const documents = await listAllDocuments.call(documentLibrary);
  return Array.isArray(documents)
    ? documents.filter((document): document is Record<string, unknown> =>
        Boolean(document) && typeof document === "object" && !Array.isArray(document),
      )
    : [];
}

async function modelUsageByTask(
  providerUsageTracker: ProviderUsageTracker | undefined,
  window: { startIso: string; endIso: string },
) {
  const usage = new Map<GenerationTaskType, number>(
    GENERATION_TASKS.map((item) => [item.taskType, 0]),
  );
  const sums = await providerUsageTracker?.sumUsageUnits?.({
    taskTypes: GENERATION_TASKS.map((item) => item.taskType as ProviderTaskType),
    createdAfter: window.startIso,
    createdBefore: window.endIso,
  });
  for (const sum of sums ?? []) {
    const taskType = sum.taskType as AdminRunTaskType;
    if (isGenerationTaskType(taskType)) {
      usage.set(taskType, sum.units);
    }
  }
  return usage;
}

function documentArtifactCounts(
  completedDocumentRuns: RunRecord[],
  todayDocuments: Array<Record<string, unknown>>,
) {
  const counts = {
    requirementsSpec: 0,
    softwareDesignSpec: 0,
  };
  const documentSourceRunIds = new Set<string>();
  for (const document of todayDocuments) {
    const kind = readMetricDocumentKind(document.documentKind);
    if (kind) counts[kind] += 1;
    if (typeof document.sourceRunId === "string") {
      documentSourceRunIds.add(document.sourceRunId);
    }
  }
  for (const record of completedDocumentRuns) {
    const source = asRecord(record.snapshot);
    if (!source.documentId || documentSourceRunIds.has(record.snapshot.runId)) continue;
    const kind = readMetricDocumentKind(source.documentKind);
    if (kind) counts[kind] += 1;
  }
  return [
    { label: "需求规格说明书", value: counts.requirementsSpec },
    { label: "软件设计说明书", value: counts.softwareDesignSpec },
  ];
}

function artifactCountsForTask(
  taskType: GenerationTaskType,
  completedRecords: RunRecord[],
  todayDocuments: Array<Record<string, unknown>>,
) {
  if (taskType === "requirements_to_uml") {
    return [
      { label: "规则", value: completedRecords.reduce((total, record) => total + arrayLength(asRecord(record.snapshot).rules), 0) },
      { label: "需求模型", value: completedRecords.reduce((total, record) => total + arrayLength(asRecord(record.snapshot).models), 0) },
    ];
  }
  if (taskType === "design_modeling") {
    return [
      { label: "设计模型", value: completedRecords.reduce((total, record) => total + arrayLength(asRecord(record.snapshot).models), 0) },
    ];
  }
  if (taskType === "document_generation") {
    return documentArtifactCounts(completedRecords, todayDocuments);
  }
  return [
    {
      label: "代码文件",
      value: completedRecords.reduce(
        (total, record) => total + Object.keys(asRecord(asRecord(record.snapshot).files)).length,
        0,
      ),
    },
  ];
}

function buildGenerationBreakdown(
  todayRecords: RunRecord[],
  modelUsageByTask: Map<GenerationTaskType, number>,
  todayDocuments: Array<Record<string, unknown>>,
): GenerationBreakdownRow[] {
  return GENERATION_TASKS.map(({ taskType, label }) => {
    const records = todayRecords.filter((record) => taskTypeForSnapshot(record.snapshot) === taskType);
    const completedRecords = records.filter((record) => record.snapshot.status === "completed");
    const failedRecords = records.filter((record) => record.snapshot.status === "failed");
    const duration = averageDuration(
      records.filter((record) => record.terminal || record.metadata?.completedAt),
    );
    const artifactCounts = artifactCountsForTask(taskType, completedRecords, todayDocuments);
    return {
      taskType,
      label,
      generatedCount: records.length,
      successRate: percentage(completedRecords.length, records.length),
      failureRate: percentage(failedRecords.length, records.length),
      averageDuration: duration.label,
      averageDurationMs: duration.valueMs,
      modelCallCount: modelUsageByTask.get(taskType) ?? 0,
      artifactSummary: artifactCountSummary(artifactCounts),
      artifactCounts,
      sampleCount: records.length,
      successfulCount: completedRecords.length,
      failedCount: failedRecords.length,
      recentRuns: records
        .slice()
        .sort((left, right) =>
          (right.metadata?.createdAt ?? "").localeCompare(left.metadata?.createdAt ?? ""),
        )
        .slice(0, 5)
        .map((record) => ({
          id: record.snapshot.runId,
          status: record.snapshot.status,
          createdAt: record.metadata?.createdAt ?? null,
          durationMs: calculateDurationMs(record.metadata?.createdAt, record.metadata?.completedAt),
          artifactSummary: buildRunArtifactSummary(record.snapshot).title,
        })),
    };
  });
}

async function buildAdminRunDto(
  record: RunRecord,
  authStore: AuthStore,
  options: { includeArtifactPreviews?: boolean } = {},
) {
  const projectId = typeof record.metadata?.projectId === "string" ? record.metadata.projectId : null;
  const operatorId = typeof record.metadata?.userId === "string" ? record.metadata.userId : null;
  const [project, operator] = await Promise.all([
    projectId ? authStore.getProject(projectId) : Promise.resolve(null),
    operatorId ? authStore.getUser(operatorId) : Promise.resolve(null),
  ]);
  const createdAt = record.metadata?.createdAt ?? null;
  const completedAt = record.metadata?.completedAt ?? null;
  return {
    id: record.snapshot.runId,
    status: record.snapshot.status,
    currentStage: record.snapshot.currentStage,
    errorMessage: snapshotErrorMessage(record.snapshot),
    taskType: taskTypeForSnapshot(record.snapshot),
    model: readProviderModel(record.snapshot) ?? record.metadata?.model ?? null,
    projectId,
    projectName: project?.name ?? null,
    operatorId,
    operatorName: operator?.displayName ?? operator?.email ?? null,
    createdAt,
    completedAt,
    durationMs: calculateDurationMs(createdAt ?? undefined, completedAt ?? undefined),
    artifactSummary: buildRunArtifactSummary(record.snapshot),
    artifactItems: buildRunArtifactItems(record.snapshot, {
      includePreviews: options.includeArtifactPreviews,
    }),
    metadata: record.metadata ?? null,
  };
}

const ADMIN_ROLE_NAMES: Record<AdminRole, string> = {
  super_admin: "超级管理员",
  system_operator: "系统运维",
  course_admin: "教务/课程管理员",
  project_admin: "项目管理员",
  auditor: "审计员",
  security_admin: "安全管理员",
  model_admin: "模型管理员",
  teacher_assistant: "教师/助教",
};

function toOrganizationType(visibility: string) {
  if (visibility === "course") return "course";
  if (visibility === "team") return "team";
  return "team";
}

async function buildOrganizationUnits(authStore: AuthStore, runs: RunRecordStore) {
  const projects = await authStore.listProjects();
  return Promise.all(
    projects.map(async (project) => {
      const owner = await authStore.getUser(project.ownerUserId);
      const members = await authStore.listProjectMembers(project.id);
      const projectRuns = Array.from(runs.values()).filter(
        (record) => record.metadata?.projectId === project.id,
      ).length;

      return {
        id: project.id,
        type: toOrganizationType(project.visibility),
        name: project.name,
        owner: owner?.displayName ?? owner?.email ?? project.ownerUserId,
        members: members.filter((member) => member.status === "active").length,
        projects: 1,
        quotaUsed: `${projectRuns} runs`,
      };
    }),
  );
}

function buildRolePermissions() {
  return ADMIN_ROLES.map((role) => {
    const permissions = Array.from(adminRolePermissions[role]);
    return {
      id: role,
      name: ADMIN_ROLE_NAMES[role],
      scope: Array.from(adminRoleDataScopes[role]).join(", "),
      permissions,
      highRisk: permissions.some((permission) => permission.endsWith(".write")),
    };
  });
}

function findRolePermission(roleId: string) {
  return buildRolePermissions().find((role) => role.id === roleId) ?? null;
}

function buildPromptRuntimeItems(): Array<Omit<PromptRuntimeItem, "updatedAt">> {
  return [
    {
      id: "requirements-modeling-prompt",
      name: "需求建模 Prompt 包",
      kind: "prompt",
      version: "v1",
      status: "stable" as const,
      approver: "system",
    },
    {
      id: "design-modeling-prompt",
      name: "设计建模 Prompt 包",
      kind: "prompt",
      version: "v1",
      status: "stable" as const,
      approver: "system",
    },
    {
      id: "ui-ux-pro-max-skill",
      name: "代码生成 UI/UX Skill",
      kind: "skill",
      version: "v1",
      status: "stable" as const,
      approver: "system",
    },
  ];
}

type PromptRuntimeKind = "prompt" | "skill";
type PromptRuntimeStatus = "stable" | "canary" | "rollback-ready" | "disabled";
type PromptRuntimeItem = {
  id: string;
  name: string;
  kind: PromptRuntimeKind;
  version: string;
  status: PromptRuntimeStatus;
  approver: string;
  updatedAt: string;
};

function createPromptRuntimeItems(): PromptRuntimeItem[] {
  const now = new Date().toISOString();
  return buildPromptRuntimeItems().map((item) => ({ ...item, updatedAt: now }));
}

function safeConfigValue(value: string | undefined, fallback = "not configured") {
  return value?.trim() ? value.trim() : fallback;
}

function buildSystemConfig() {
  return [
    {
      id: "admin-api",
      name: "Admin API",
      value: `port ${safeConfigValue(process.env.API_PORT, "4101")}`,
      status: "healthy",
      auditRequired: false,
    },
    {
      id: "render-service",
      name: "Render Service",
      value: safeConfigValue(process.env.RENDER_SERVICE_URL),
      status: process.env.RENDER_SERVICE_URL ? "healthy" : "degraded",
      auditRequired: false,
    },
    {
      id: "onlyoffice",
      name: "OnlyOffice",
      value: safeConfigValue(process.env.ONLYOFFICE_DOCUMENT_SERVER_URL),
      status: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL ? "healthy" : "degraded",
      auditRequired: true,
    },
    {
      id: "plantuml",
      name: "PlantUML",
      value: safeConfigValue(process.env.PLANTUML_SERVER_URL),
      status: process.env.PLANTUML_SERVER_URL ? "healthy" : "degraded",
      auditRequired: false,
    },
    {
      id: "document-storage",
      name: "Document storage",
      value: safeConfigValue(process.env.UML_DOCUMENT_STORAGE_DIR, ".local-documents"),
      status: "healthy",
      auditRequired: true,
    },
    {
      id: "provider-base-url-allowlist",
      name: "Provider Base URL allowlist",
      value: safeConfigValue(process.env.UML_PROVIDER_BASE_URL_ALLOWLIST),
      status: process.env.UML_PROVIDER_BASE_URL_ALLOWLIST ? "healthy" : "degraded",
      auditRequired: true,
    },
    {
      id: "cors-origins",
      name: "CORS allowlist",
      value: safeConfigValue(process.env.API_CORS_ORIGINS),
      status: process.env.API_CORS_ORIGINS ? "healthy" : "degraded",
      auditRequired: true,
    },
    {
      id: "alerting",
      name: "Alerting",
      value: safeConfigValue(process.env.UML_ALERT_WEBHOOK_URL, "not configured"),
      status: process.env.UML_ALERT_WEBHOOK_URL ? "healthy" : "degraded",
      auditRequired: true,
    },
  ];
}

function buildSystemLogs() {
  return [
    {
      id: "recent-errors",
      level: "info",
      message: "No centralized error log adapter configured",
      source: "api",
      createdAt: new Date().toISOString(),
    },
  ];
}

function buildSystemReleases() {
  return [
    {
      id: "api-release",
      name: "API",
      version: safeConfigValue(process.env.npm_package_version, "0.0.1"),
      sha: safeConfigValue(process.env.GIT_COMMIT_SHA, "not configured"),
      directory: process.cwd(),
      createdAt: new Date().toISOString(),
    },
    {
      id: "admin-web-release",
      name: "Admin Web",
      version: safeConfigValue(process.env.UML_ADMIN_WEB_VERSION, "not configured"),
      sha: safeConfigValue(process.env.UML_ADMIN_WEB_SHA, "not configured"),
      directory: safeConfigValue(process.env.UML_ADMIN_WEB_DIR),
      createdAt: new Date().toISOString(),
    },
  ];
}

function createFallbackRateLimitPolicyStore() {
  const policies: ProviderRateLimitPolicyRecord[] = [];
  return {
    async listRateLimitPolicies() {
      return policies.map((policy) => ({ ...policy }));
    },
    async createRateLimitPolicy(
      input: Omit<ProviderRateLimitPolicyRecord, "id" | "createdAt" | "updatedAt">,
    ) {
      const now = new Date().toISOString();
      const policy: ProviderRateLimitPolicyRecord = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      policies.unshift(policy);
      return { ...policy };
    },
    async updateRateLimitPolicy(
      id: string,
      input: Partial<
        Omit<ProviderRateLimitPolicyRecord, "id" | "createdAt" | "updatedAt">
      >,
    ) {
      const policy = policies.find((item) => item.id === id);
      if (!policy) return null;
      Object.assign(policy, input, { updatedAt: new Date().toISOString() });
      return { ...policy };
    },
  };
}

async function buildProviderQuotaFallback({
  providerConfigs,
  policies,
}: {
  providerConfigs: ProviderConfigStore;
  policies: ProviderRateLimitPolicyRecord[];
}) {
  const configsById = new Map(
    (await providerConfigs.list()).map((config) => [config.id, config]),
  );
  return policies.flatMap((policy) => {
    if (!policy.providerConfigId || !policy.enabled) return [];
    const config = configsById.get(policy.providerConfigId);
    if (!config) return [];
    return [
      {
        providerConfigId: policy.providerConfigId,
        provider: config.provider,
        model: config.defaultModel,
        taskType: policy.taskType,
        scopeType: policy.scopeType,
        scopeId: policy.scopeId,
        limit: policy.limit,
        windowSeconds: policy.windowSeconds,
        usedUnits: 0,
        remainingUnits: policy.limit,
        resetAt: null,
      },
    ];
  });
}

async function revokeActiveSessionsForUser(authStore: AuthStore, userId: string) {
  const sessions = await authStore.listActiveSessionsForUser(userId);
  for (const session of sessions) {
    await authStore.revokeSession(session.id);
  }
  return sessions.length;
}

async function recordAdminAction(
  authStore: AuthStore,
  input: {
    actor: AdminActor;
    action: string;
    targetType: string;
    targetId: string | null;
    outcome: "success" | "failure";
    message: string;
  },
) {
  return authStore.recordAuditLog({
    actorUserId: input.actor.id,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    outcome: input.outcome,
    message: input.message,
  });
}

async function requireHighRiskAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  action: string,
  targetType: string,
  targetId: string | null,
  permission: AdminPermission,
) {
  const actor = await requireAdminPermission(request, reply, authStore, permission);
  if ("message" in actor) return actor;

  const providerConfigOperator =
    permission === "admin.provider_configs.write" && actor.roles.includes("model_admin");
  if (!providerConfigOperator && !HIGH_RISK_ADMIN_ROLES.has(actor.role)) {
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType,
      targetId,
      outcome: "failure",
      message: `Actor ${actorLabel(actor)} is not allowed to perform ${action} on ${targetType}:${targetId ?? "unknown"}`,
    });
    reply.code(403);
    return { message: "High-risk admin permission required" } as const;
  }

  return actor;
}

export function registerAdminRoutes({
  app,
  authStore,
  runs,
  documentLibrary,
  providerConfigs,
  providerUsageTracker,
  llmScheduler,
  startRunPipeline,
  riskEvents = () => [],
  providerRateLimitPolicy = resolveProviderRateLimitPolicy(),
  academicStore: providedAcademicStore,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  runs: RunRecordStore;
  documentLibrary: DocumentLibrary;
  providerConfigs: ProviderConfigStore;
  providerUsageTracker?: ProviderUsageTracker;
  llmScheduler?: LlmScheduler;
  startRunPipeline?: AdminRunPipelineStarter;
  riskEvents?: () => AdminRiskEvent[];
  providerRateLimitPolicy?: ProviderRateLimitPolicy;
  academicStore?: AcademicAdminRepository;
}) {
  const localRateLimitPolicyStore = createFallbackRateLimitPolicyStore();
  const rateLimitPolicyStore = {
    listRateLimitPolicies:
      providerUsageTracker?.listRateLimitPolicies?.bind(providerUsageTracker) ??
      localRateLimitPolicyStore.listRateLimitPolicies,
    createRateLimitPolicy:
      providerUsageTracker?.createRateLimitPolicy?.bind(providerUsageTracker) ??
      localRateLimitPolicyStore.createRateLimitPolicy,
    updateRateLimitPolicy:
      providerUsageTracker?.updateRateLimitPolicy?.bind(providerUsageTracker) ??
      localRateLimitPolicyStore.updateRateLimitPolicy,
  };
  const academicStore = providedAcademicStore ?? createAcademicAdminRepository(app);
  const promptRuntimeItems = createPromptRuntimeItems();

  async function requireAcademicRead(request: FastifyRequest, reply: FastifyReply) {
    const actor = await requireOrganizationAdmin(request, reply, authStore);
    if ("message" in actor) return actor;
    if (!hasAcademicRead(actor)) {
      reply.code(403);
      return { message: "Admin project read capability required" } as const;
    }
    return actor;
  }

  async function requireAcademicWrite(request: FastifyRequest, reply: FastifyReply) {
    const actor = await requireOrganizationAdmin(request, reply, authStore);
    if ("message" in actor) return actor;
    if (!hasAcademicWrite(actor)) {
      reply.code(403);
      return { message: "Admin project write capability required" } as const;
    }
    return actor;
  }

  sendAdminOnly(app, "/api/admin/session", async (request, reply) => {
    const auth = await requireAdminSessionAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    if (!hasAnyAdminRole(auth.user.systemRoles)) {
      reply.code(403);
      return { message: "Admin role required" };
    }
    if (!auth.user.mfaEnabled) {
      reply.code(403);
      return { message: "Admin MFA is required before accessing the admin console" };
    }

    return adminSessionResponseSchema.parse({
      user: toUserDto(auth.user),
      ...buildAdminRbacContext(auth.user.systemRoles),
    });
  });

  sendAdminOnly(app, "/api/admin/metrics", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.metrics.read",
    );
    if ("message" in actor) return actor;

    const query = request.query as { date?: unknown };
    const now = new Date();
    const selectedDate = query.date === undefined ? shanghaiDateString(now) : query.date;
    if (typeof selectedDate !== "string") {
      reply.code(400);
      return { message: "date must use YYYY-MM-DD" };
    }
    const selectedWindow = shanghaiDayWindow(selectedDate, now);
    if (!selectedWindow) {
      reply.code(400);
      return { message: "date must be a valid non-future YYYY-MM-DD" };
    }
    const allTimeWindow = {
      startIso: "1970-01-01T00:00:00.000Z",
      endIso: now.toISOString(),
    };
    const records = Array.from(runs.values());
    const generationRecords = records.filter((record) =>
      isGenerationTaskType(taskTypeForSnapshot(record.snapshot)),
    );
    const selectedRecords = generationRecords.filter((record) =>
      isInWindow(record.metadata?.createdAt, selectedWindow),
    );
    const [users, projects, documents, selectedModelUsageByTask, allModelUsageByTask] = await Promise.all([
      authStore.listUsers(),
      authStore.listProjects(),
      listMetricDocuments(documentLibrary),
      modelUsageByTask(providerUsageTracker, selectedWindow),
      modelUsageByTask(providerUsageTracker, allTimeWindow),
    ]);
    const selectedDocuments = documents.filter((document) =>
      isInWindow(document.createdAt, selectedWindow),
    );
    const generationBreakdown = buildGenerationBreakdown(
      selectedRecords,
      selectedModelUsageByTask,
      selectedDocuments,
    );
    const completed = generationRecords.filter(
      (record) => record.snapshot.status === "completed",
    ).length;
    const failed = generationRecords.filter((record) => record.snapshot.status === "failed").length;
    const duration = averageDuration(
      generationRecords.filter((record) => record.terminal || record.metadata?.completedAt),
    );
    const modelCallCount = Array.from(allModelUsageByTask.values()).reduce(
      (total, value) => total + value,
      0,
    );
    const documentGenerationCount = artifactCountsForTask(
      "document_generation",
      generationRecords.filter((record) =>
        taskTypeForSnapshot(record.snapshot) === "document_generation" &&
        record.snapshot.status === "completed",
      ),
      documents,
    ).reduce((total, item) => total + item.value, 0);
    return {
      generatedAt: now.toISOString(),
      metricWindow: {
        timeZone: "Asia/Shanghai",
        startAt: selectedWindow.startIso,
        endAt: selectedWindow.endIso,
      },
      metrics: [
        metric("用户数", String(users.length)),
        metric("项目数", String(projects.length)),
        metric("生成次数", String(generationRecords.length)),
        metric("成功率", percentage(completed, generationRecords.length)),
        metric("失败率", percentage(failed, generationRecords.length)),
        metric("平均耗时", duration.label),
        metric("模型调用量", String(modelCallCount)),
        metric("文档生成量", String(documentGenerationCount)),
      ],
      generationBreakdown,
    };
  });

  sendAdminOnly(app, "/api/admin/users", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;
    const visibleUserIds = await visibleUserIdsForAdmin(academicStore, authStore, actor);
    return {
      generatedAt: new Date().toISOString(),
      users: (await authStore.listUsers())
        .filter((user) => visibleUserIds === null || visibleUserIds.has(user.id))
        .map(toAdminUserDto),
    };
  });

  sendAdminOnly(app, "/api/admin/users/:id/login-records", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;

    const { id } = request.params as { id: string };
    const user = await authStore.getUser(id);
    if (!user) {
      reply.code(404);
      return { message: "User not found" };
    }

    const visibleUserIds = await visibleUserIdsForAdmin(academicStore, authStore, actor);
    if (visibleUserIds !== null && !visibleUserIds.has(id)) {
      reply.code(403);
      return { message: "User is outside admin data scope" };
    }

    return {
      generatedAt: new Date().toISOString(),
      user: toAdminUserDto(user),
      loginRecords: (await authStore.listLoginEventsForUser(id)).map(toLoginEventDto),
    };
  });

  sendAdminOnly(app, "/api/admin/projects", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.projects.read",
    );
    if ("message" in actor) return actor;
    return {
      generatedAt: new Date().toISOString(),
      projects: (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(
        toProjectDto,
      ),
    };
  });

  sendAdminOnly(app, "/api/admin/organizations", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminOrganizationListResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      organizations: await filterAsync(
        await academicStore.listOrganizations(),
        (organization) =>
          canSeeOrganization(academicStore, actor, organization.id),
      ),
    });
  });

  app.get("/api/admin/organizations/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const organization = await academicStore.getOrganization(id);
    if (!organization || !(await canSeeOrganization(academicStore, actor, id))) {
      reply.code(404);
      return { message: "Organization not found" };
    }
    return { organization };
  });

  app.post("/api/admin/organizations", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    if (!hasFullAcademicScope(actor)) {
      reply.code(403);
      return { message: "Only full-scope admins can create organizations" };
    }
    const input = adminOrganizationCreateRequestSchema.parse(request.body);
    const organization = await academicStore.createOrganization(input);
    reply.code(201);
    return { organization };
  });

  sendAdminOnly(app, "/api/admin/courses", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminCourseListResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      courses: await filterAsync(
        await academicStore.listCourses(),
        (course) => canSeeCourse(academicStore, actor, course.id),
      ),
    });
  });

  app.get("/api/admin/courses/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const course = await academicStore.getCourse(id);
    if (!course || !(await canSeeCourse(academicStore, actor, id))) {
      reply.code(404);
      return { message: "Course not found" };
    }
    return { course };
  });

  app.post("/api/admin/courses", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminCourseCreateRequestSchema.parse(request.body);
    if (!(await academicStore.organizationExists(input.organizationId))) {
      reply.code(404);
      return { message: "Organization not found" };
    }
    if (
      !hasFullAcademicScope(actor) &&
      !(await canSeeOrganization(academicStore, actor, input.organizationId))
    ) {
      reply.code(403);
      return { message: "Organization is outside admin scope" };
    }
    const course = await academicStore.createCourse(input);
    reply.code(201);
    return { course };
  });

  sendAdminOnly(app, "/api/admin/classes", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminClassListResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      classes: await filterAsync(
        await academicStore.listClasses(),
        (classRecord) => canSeeClass(academicStore, actor, classRecord.id),
      ),
    });
  });

  app.get("/api/admin/classes/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const classRecord = await academicStore.getClass(id);
    if (!classRecord || !(await canSeeClass(academicStore, actor, id))) {
      reply.code(404);
      return { message: "Class not found" };
    }
    return { class: classRecord };
  });

  app.post("/api/admin/classes", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminClassCreateRequestSchema.parse(request.body);
    if (!(await academicStore.courseExists(input.courseId))) {
      reply.code(404);
      return { message: "Course not found" };
    }
    if (!(await canSeeCourse(academicStore, actor, input.courseId))) {
      reply.code(403);
      return { message: "Course is outside admin scope" };
    }
    const classRecord = await academicStore.createClass(input);
    reply.code(201);
    return { class: classRecord };
  });

  sendAdminOnly(app, "/api/admin/teams", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminTeamListResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      teams: await filterAsync(
        await academicStore.listTeams(),
        (team) => canSeeTeam(academicStore, actor, team.id),
      ),
    });
  });

  app.get("/api/admin/teams/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const team = await academicStore.getTeam(id);
    if (!team || !(await canSeeTeam(academicStore, actor, id))) {
      reply.code(404);
      return { message: "Team not found" };
    }
    return { team };
  });

  app.post("/api/admin/teams", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminTeamCreateRequestSchema.parse(request.body);
    if (!(await academicStore.classExists(input.classId))) {
      reply.code(404);
      return { message: "Class not found" };
    }
    if (!(await canSeeClass(academicStore, actor, input.classId))) {
      reply.code(403);
      return { message: "Class is outside admin scope" };
    }
    const team = await academicStore.createTeam(input);
    reply.code(201);
    return { team };
  });

  sendAdminOnly(app, "/api/admin/organization-members", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminOrganizationMembershipListResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      memberships: await filterAsync(
        await academicStore.listMemberships(),
        (membership) =>
          canSeeTarget(
            academicStore,
            actor,
            membership.targetType,
            membership.targetId,
          ),
      ),
    });
  });

  app.get("/api/admin/organization-members/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const membership = (await academicStore.listMemberships()).find(
      (item) => item.id === id,
    );
    if (
      !membership ||
      !(await canSeeTarget(
        academicStore,
        actor,
        membership.targetType,
        membership.targetId,
      ))
    ) {
      reply.code(404);
      return { message: "Organization membership not found" };
    }
    return { membership };
  });

  app.post("/api/admin/organization-members", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const parsed = adminOrganizationMembershipCreateRequestSchema.parse(request.body);
    if (!(await academicStore.targetExists(parsed.targetType, parsed.targetId))) {
      reply.code(404);
      return { message: "Membership target not found" };
    }
    if (!(await canSeeTarget(academicStore, actor, parsed.targetType, parsed.targetId))) {
      reply.code(403);
      return { message: "Membership target is outside admin scope" };
    }
    const user = parsed.userId ? await authStore.getUser(parsed.userId) : null;
    const membership = await academicStore.createMembership({
      ...parsed,
      email: parsed.email ?? user?.email ?? null,
      displayName: parsed.displayName ?? user?.displayName ?? null,
    });
    reply.code(201);
    return { membership };
  });

  sendAdminOnly(app, "/api/admin/quotas", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    return adminQuotaListResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      quotas: await filterAsync(
        await academicStore.listQuotas(),
        (quota) =>
          canSeeTarget(academicStore, actor, quota.scopeType, quota.scopeId),
      ),
    });
  });

  app.get("/api/admin/quotas/:id", async (request, reply) => {
    const actor = await requireAcademicRead(request, reply);
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const quota = await academicStore.getQuota(id);
    if (
      !quota ||
      !(await canSeeTarget(academicStore, actor, quota.scopeType, quota.scopeId))
    ) {
      reply.code(404);
      return { message: "Quota not found" };
    }
    return { quota };
  });

  app.post("/api/admin/quotas", async (request, reply) => {
    const actor = await requireAcademicWrite(request, reply);
    if ("message" in actor) return actor;
    const input = adminQuotaCreateRequestSchema.parse(request.body);
    if (!(await academicStore.targetExists(input.scopeType, input.scopeId))) {
      reply.code(404);
      return { message: "Quota scope not found" };
    }
    if (!(await canSeeTarget(academicStore, actor, input.scopeType, input.scopeId))) {
      reply.code(403);
      return { message: "Quota scope is outside admin scope" };
    }
    const quota = await academicStore.createQuota(input);
    reply.code(201);
    return { quota };
  });

  sendAdminOnly(app, "/api/admin/roles", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.users.read",
    );
    if ("message" in actor) return actor;
    return {
      generatedAt: new Date().toISOString(),
      roles: buildRolePermissions(),
    };
  });

  app.post("/api/admin/roles/:id/high-risk-permissions/review", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.role_permissions.review";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "admin_role",
      id,
      "admin.roles.write",
    );
    if ("message" in actor) return actor;

    const role = findRolePermission(id);
    if (!role) {
      reply.code(404);
      return { message: "Admin role not found" };
    }
    if (!role.highRisk) {
      reply.code(400);
      return { message: "Role does not contain high-risk permissions" };
    }

    const auditLog = await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "admin_role",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} reviewed high-risk permissions for role ${id}`,
    });
    return {
      auditLog,
      auditMessage: "审计已记录：高危角色权限已复核",
      role,
    };
  });

  sendAdminOnly(app, "/api/admin/prompt-runtime", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return {
      generatedAt: new Date().toISOString(),
      promptRuntimeItems,
    };
  });

  app.get("/api/admin/prompt-runtime/:id/versions", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const item = promptRuntimeItems.find((entry) => entry.id === id);
    if (!item) {
      reply.code(404);
      return { message: "Prompt runtime item not found" };
    }
    return {
      generatedAt: new Date().toISOString(),
      versions: [
        {
          id: `${item.id}-${item.version}`,
          itemId: item.id,
          version: item.version,
          status: item.status,
          createdAt: item.updatedAt,
        },
      ],
    };
  });

  async function mutatePromptRuntime(
    request: FastifyRequest,
    reply: FastifyReply,
    nextStatus: PromptRuntimeStatus,
    action: "submit" | "approve" | "rollback" | "disable",
  ) {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      `admin.prompt_runtime.${action}`,
      "prompt_runtime",
      id,
      "admin.prompt_runtime.write",
    );
    if ("message" in actor) return actor;
    const item = promptRuntimeItems.find((entry) => entry.id === id);
    if (!item) {
      reply.code(404);
      return { message: "Prompt runtime item not found" };
    }
    item.status = nextStatus;
    item.approver = actor.name;
    item.updatedAt = new Date().toISOString();
    const auditLog = await recordAdminAction(authStore, {
      actor,
      action: `admin.prompt_runtime.${action}`,
      targetType: "prompt_runtime",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} changed prompt runtime ${item.name} (${id}) to ${nextStatus}`,
    });
    return {
      message: `Prompt runtime ${action} completed`,
      promptRuntimeItem: item,
      auditLog,
    };
  }

  app.post("/api/admin/prompt-runtime/:id/submit", (request, reply) =>
    mutatePromptRuntime(request, reply, "canary", "submit"),
  );
  app.post("/api/admin/prompt-runtime/:id/approve", (request, reply) =>
    mutatePromptRuntime(request, reply, "stable", "approve"),
  );
  app.post("/api/admin/prompt-runtime/:id/rollback", (request, reply) =>
    mutatePromptRuntime(request, reply, "rollback-ready", "rollback"),
  );
  app.post("/api/admin/prompt-runtime/:id/disable", (request, reply) =>
    mutatePromptRuntime(request, reply, "disabled", "disable"),
  );

  sendAdminOnly(app, "/api/admin/documents", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.documents.read",
    );
    if ("message" in actor) return actor;
    const visibleProjectIds = hasFullProjectScope(actor)
      ? null
      : new Set(
          (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(
            (project) => project.id,
          ),
        );
    return {
      generatedAt: new Date().toISOString(),
      documents: (await documentLibrary.listAllDocuments()).filter(
        (document) =>
          visibleProjectIds === null ||
          (document.projectId && visibleProjectIds.has(document.projectId)),
      ),
    };
  });

  app.get("/api/admin/documents/:id/download", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.document.download";
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.documents.read",
    );
    if ("message" in actor) return actor;

    const visibleProjectIds = hasFullProjectScope(actor)
      ? null
      : new Set(
          (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(
            (project) => project.id,
          ),
        );
    const document = (await documentLibrary.listAllDocuments()).find(
      (item) => item.id === id,
    );
    if (!document) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "document",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} failed to download missing document (${id})`,
      });
      reply.code(404);
      return { message: "Document not found" };
    }

    if (
      visibleProjectIds !== null &&
      (!document.projectId || !visibleProjectIds.has(document.projectId))
    ) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "document",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} was denied document download ${document.fileName} (${id}) outside their project scope`,
      });
      reply.code(403);
      return { message: "Document is outside admin data scope" };
    }

    const buffer = await documentLibrary.getDocumentBuffer(document.workspaceId, id);
    if (!buffer) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "document",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} failed to download missing document file ${document.fileName} (${id}) from workspace ${document.workspaceId}`,
      });
      reply.code(404);
      return { message: "Document file not found" };
    }

    await recordAdminAction(authStore, {
      actor,
      action,
    targetType: "document",
    targetId: id,
    outcome: "success",
    message: `Actor ${actorLabel(actor)} downloaded document ${document.fileName} (${id}) from workspace ${document.workspaceId}`,
  });

    reply.header("Content-Type", document.mimeType);
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    return buffer;
  });

  sendAdminOnly(app, "/api/admin/risk-events", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.risk_events.read",
    );
    if ("message" in actor) return actor;
    return { generatedAt: new Date().toISOString(), riskEvents: riskEvents() };
  });

  sendAdminOnly(app, "/api/admin/rate-limits", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.rate_limits.read",
    );
    if ("message" in actor) return actor;
    return adminRateLimitPolicyListResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      rateLimits: await rateLimitPolicyStore.listRateLimitPolicies(),
      fallbackPolicy: providerRateLimitDto(providerRateLimitPolicy),
    });
  });

  sendAdminOnly(app, "/api/admin/provider-usage", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.read",
    );
    if ("message" in actor) return actor;
    const events = providerUsageTracker?.listUsageEvents
      ? await providerUsageTracker.listUsageEvents()
      : [];

    return adminProviderUsageListResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      usage: events.map((event) => ({
        ...event,
        costEstimate: disabledProviderCostEstimate(),
      })),
    });
  });

  sendAdminOnly(app, "/api/admin/provider-quotas", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.read",
    );
    if ("message" in actor) return actor;
    const quotas = providerUsageTracker?.listQuotaSnapshots
      ? await providerUsageTracker.listQuotaSnapshots()
      : await buildProviderQuotaFallback({
          providerConfigs,
          policies: await rateLimitPolicyStore.listRateLimitPolicies(),
        });

    return adminProviderQuotaListResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      quotas: quotas.map((quota) => ({
        ...quota,
        costEstimate: disabledProviderCostEstimate(),
      })),
    });
  });

  app.post("/api/admin/rate-limits", async (request, reply) => {
    const action = "admin.rate_limit.create";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "rate_limit_policy",
      null,
      "admin.rate_limits.write",
    );
    if ("message" in actor) return actor;
    const input = adminRateLimitPolicyCreateRequestSchema.parse(request.body);
    const created = await rateLimitPolicyStore.createRateLimitPolicy({
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      providerConfigId: input.providerConfigId ?? null,
      taskType: input.taskType ?? null,
      limit: input.limit,
      windowSeconds: input.windowSeconds,
      enabled: input.enabled,
    });
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "rate_limit_policy",
      targetId: created.id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} created rate limit policy ${created.id}`,
    });
    reply.code(201);
    return { rateLimit: created };
  });

  app.patch("/api/admin/rate-limits/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.rate_limit.update";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "rate_limit_policy",
      id,
      "admin.rate_limits.write",
    );
    if ("message" in actor) return actor;
    const input = adminRateLimitPolicyUpdateRequestSchema.parse(request.body);
    const updated = await rateLimitPolicyStore.updateRateLimitPolicy(id, input);
    if (!updated) {
      reply.code(404);
      return { message: "Rate limit policy not found" };
    }
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "rate_limit_policy",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} updated rate limit policy ${id}`,
    });
    return { rateLimit: updated };
  });

  sendAdminOnly(app, "/api/admin/runs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.read",
    );
    if ("message" in actor) return actor;
    const visibleProjectIds = hasFullProjectScope(actor)
      ? null
      : new Set(
          (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(
            (project) => project.id,
          ),
        );
    const visibleRuns = Array.from(runs.values())
      .filter(
        (record) =>
          visibleProjectIds === null ||
          (record.metadata?.projectId &&
            visibleProjectIds.has(String(record.metadata.projectId))),
      )
      .sort((left, right) => {
        const leftTime = new Date(left.metadata?.createdAt ?? 0).getTime();
        const rightTime = new Date(right.metadata?.createdAt ?? 0).getTime();
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      });

    return {
      generatedAt: new Date().toISOString(),
      runs: await Promise.all(visibleRuns.map((record) => buildAdminRunDto(record, authStore))),
    };
  });

  async function requireReadableRun(
    request: FastifyRequest,
    reply: FastifyReply,
    runId: string,
  ): Promise<{ actor: AdminActor; record: RunRecord } | { message: string }> {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.read",
    );
    if ("message" in actor) return actor;

    const record = runs.get(runId);
    if (!record) {
      reply.code(404);
      return { message: "Run not found" };
    }

    const projectId =
      typeof record.metadata?.projectId === "string" ? record.metadata.projectId : null;
    const project = projectId ? await authStore.getProject(projectId) : null;
    if (
      project &&
      !(await canSeeProjectByScope(academicStore, authStore, actor, project))
    ) {
      reply.code(404);
      return { message: "Run not found" };
    }
    if (!project && !hasFullProjectScope(actor)) {
      reply.code(404);
      return { message: "Run not found" };
    }

    return { actor, record };
  }

  function runDiagnosticSummary(record: RunRecord) {
    const serializedEvents = record.events.map((event) => JSON.stringify(event));
    const repairEventCount = serializedEvents.filter((event) =>
      /repair|修复|plantuml/i.test(event),
    ).length;
    const artifactCount =
      record.events.filter((event) => /artifact|document|code_file/i.test(event.type)).length ||
      Object.entries(record.snapshot).filter(([, value]) => Array.isArray(value)).length;

    return {
      currentStage: record.snapshot.currentStage ?? null,
      terminal: record.terminal,
      eventCount: record.events.length,
      repairEventCount,
      artifactCount,
      errorMessage: snapshotErrorMessage(record.snapshot),
      snapshotKeys: Object.keys(record.snapshot),
    };
  }

  app.get("/api/admin/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = await requireReadableRun(request, reply, id);
    if ("message" in access) return access;

    return {
      generatedAt: new Date().toISOString(),
      run: {
        ...(await buildAdminRunDto(access.record, authStore, { includeArtifactPreviews: true })),
        id: access.record.snapshot.runId,
        status: access.record.snapshot.status,
        currentStage: access.record.snapshot.currentStage,
        errorMessage: snapshotErrorMessage(access.record.snapshot),
        metadata: access.record.metadata ?? null,
        terminal: access.record.terminal,
        diagnostics: runDiagnosticSummary(access.record),
        snapshot: access.record.snapshot,
        events: access.record.events,
      },
    };
  });

  async function requireWritableRun(
    request: FastifyRequest,
    reply: FastifyReply,
    runId: string,
    action: string,
  ): Promise<{ actor: AdminActor; record: RunRecord } | { message: string }> {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.runs.write",
    );
    if ("message" in actor) return actor;

    const record = runs.get(runId);
    if (!record) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "run",
        targetId: runId,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} attempted ${action} for missing run (${runId})`,
      });
      reply.code(404);
      return { message: "Run not found" };
    }

    const projectId =
      typeof record.metadata?.projectId === "string" ? record.metadata.projectId : null;
    const project = projectId ? await authStore.getProject(projectId) : null;
    if (project && !(await canSeeProjectByScope(academicStore, authStore, actor, project))) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "run",
        targetId: runId,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} attempted ${action} for run outside data scope (${runId})`,
      });
      reply.code(403);
      return { message: "Run is outside admin data scope" };
    }

    return { actor, record };
  }

  app.post("/api/admin/runs/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.run.cancel";
    const access = await requireWritableRun(request, reply, id, action);
    if ("message" in access) return access;
    if (access.record.terminal) {
      reply.code(409);
      return { message: "Terminal runs cannot be cancelled again" };
    }

    llmScheduler?.cancelRun(id);
    const result = cancelRunRecord(access.record, id);
    await recordAdminAction(authStore, {
      actor: access.actor,
      action,
      targetType: "run",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(access.actor)} cancelled run ${id}`,
    });
    return result;
  });

  async function createAdminRunAction(
    request: FastifyRequest,
    reply: FastifyReply,
    actionKind: "retry" | "rerun",
  ) {
    const { id } = request.params as { id: string };
    const action = `admin.run.${actionKind}`;
    const access = await requireWritableRun(request, reply, id, action);
    if ("message" in access) return access;
    if (actionKind === "retry" && !isRetryableRun(access.record)) {
      reply.code(409);
      return { message: "Only failed, cancelled, or interrupted runs can be retried" };
    }
    if (
      !access.record.terminal &&
      (access.record.snapshot.status === "queued" ||
        access.record.snapshot.status === "running")
    ) {
      reply.code(409);
      return { message: "Running or queued runs cannot be rerun" };
    }

    const metadata: RunRecordMetadata = {
      userId: access.actor.id,
      createdAt: new Date().toISOString(),
      ...(typeof access.record.metadata?.projectId === "string"
        ? { projectId: access.record.metadata.projectId }
        : {}),
    };
    const result = createQueuedRunFromSource({
      runs,
      source: access.record,
      metadata,
      action: actionKind,
      sourceRunId: id,
      actorUserId: access.actor.id,
    });
    const newRecord = runs.get(result.runId);
    if (newRecord) {
      await startRunPipeline?.({
        record: newRecord,
        source: access.record,
        request,
        actorUserId: access.actor.id,
      });
    }
    await recordAdminAction(authStore, {
      actor: access.actor,
      action,
      targetType: "run",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(access.actor)} ${actionKind}ed run ${id} as ${result.runId}`,
    });
    reply.code(202);
    return result;
  }

  app.post("/api/admin/runs/:id/retry", (request, reply) =>
    createAdminRunAction(request, reply, "retry"),
  );

  app.post("/api/admin/runs/:id/rerun", (request, reply) =>
    createAdminRunAction(request, reply, "rerun"),
  );

  app.post("/api/admin/users/:id/disable", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.user.disable";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "user",
      id,
      "admin.users.write",
    );
    if ("message" in actor) return actor;

    const user = await authStore.getUser(id);
    if (!user) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "user",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} failed to disable missing user (${id})`,
      });
      reply.code(404);
      return { message: "User not found" };
    }
    const visibleUserIds = await visibleUserIdsForAdmin(academicStore, authStore, actor);
    if (visibleUserIds !== null && !visibleUserIds.has(id)) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "user",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} attempted to disable user outside data scope (${id})`,
      });
      reply.code(403);
      return { message: "User is outside admin data scope" };
    }

    const updated = await authStore.updateUser(id, { status: "disabled" });
    const revokedSessions = await revokeActiveSessionsForUser(authStore, id);
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "user",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} disabled user ${userLabel(user)} and revoked ${revokedSessions} active session(s)`,
    });

    return {
      user: toAdminUserDto(updated ?? user),
      revokedSessions,
    };
  });

  app.post("/api/admin/users/:id/force-logout", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.user.force_logout";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "user",
      id,
      "admin.users.write",
    );
    if ("message" in actor) return actor;

    const user = await authStore.getUser(id);
    if (!user) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "user",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} failed to force logout missing user (${id})`,
      });
      reply.code(404);
      return { message: "User not found" };
    }
    const visibleUserIds = await visibleUserIdsForAdmin(academicStore, authStore, actor);
    if (visibleUserIds !== null && !visibleUserIds.has(id)) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "user",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} attempted to force logout user outside data scope (${id})`,
      });
      reply.code(403);
      return { message: "User is outside admin data scope" };
    }

    const revokedSessions = await revokeActiveSessionsForUser(authStore, id);
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "user",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} forced logout for user ${userLabel(user)} and revoked ${revokedSessions} active session(s)`,
    });

    return {
      user: toAdminUserDto(user),
      revokedSessions,
    };
  });

  app.post("/api/admin/users/:id/reset-mfa", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.user.reset_mfa";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "user",
      id,
      "admin.users.write",
    );
    if ("message" in actor) return actor;

    const user = await authStore.getUser(id);
    if (!user) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "user",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} failed to reset MFA for missing user (${id})`,
      });
      reply.code(404);
      return { message: "User not found" };
    }
    const visibleUserIds = await visibleUserIdsForAdmin(academicStore, authStore, actor);
    if (visibleUserIds !== null && !visibleUserIds.has(id)) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "user",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} attempted to reset MFA for user outside data scope (${id})`,
      });
      reply.code(403);
      return { message: "User is outside admin data scope" };
    }

    const updated = await authStore.updateUser(id, { mfaEnabled: false });
    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "user",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} reset MFA state for user ${userLabel(user)}`,
    });

    return {
      user: toAdminUserDto(updated ?? user),
      message: "MFA state reset",
    };
  });

  app.post("/api/admin/projects/:id/freeze", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.project.freeze";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "project",
      id,
      "admin.projects.write",
    );
    if ("message" in actor) return actor;

    const existingProject = await authStore.getProject(id);
    if (
      existingProject &&
      !(await canSeeProjectByScope(academicStore, authStore, actor, existingProject))
    ) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "project",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} attempted to freeze project outside data scope (${id})`,
      });
      reply.code(403);
      return { message: "Project is outside admin data scope" };
    }

    const project = await authStore.updateProject(id, { status: "archived" });
    if (!project) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "project",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} failed to freeze missing project (${id})`,
      });
      reply.code(404);
      return { message: "Project not found" };
    }

    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "project",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} froze project ${project.name} (${project.id}) by setting status to archived`,
    });

    return {
      project: toProjectDto(project),
      message: "Project frozen by setting status to archived",
    };
  });

  app.post("/api/admin/documents/:id/restore", async (request, reply) => {
    const { id } = request.params as { id: string };
    const action = "admin.document.restore";
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      action,
      "document",
      id,
      "admin.documents.write",
    );
    if ("message" in actor) return actor;

    const document = (await documentLibrary.listAllDocuments({ includeDeleted: true })).find(
      (item) => item.id === id,
    );
    if (!document) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "document",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} failed to restore missing document (${id})`,
      });
      reply.code(404);
      return { message: "Document not found" };
    }

    const restored = await documentLibrary.restoreDocument(document.workspaceId, id);
    if (!restored) {
      await recordAdminAction(authStore, {
        actor,
        action,
        targetType: "document",
        targetId: id,
        outcome: "failure",
        message: `Actor ${actorLabel(actor)} failed to restore document (${id}) from workspace ${document.workspaceId}`,
      });
      reply.code(404);
      return { message: "Document not found" };
    }

    await recordAdminAction(authStore, {
      actor,
      action,
      targetType: "document",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} restored document ${restored.fileName} (${id}) from workspace ${restored.workspaceId}`,
    });
    return { document: restored };
  });

  sendAdminOnly(app, "/api/admin/provider-configs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.read",
    );
    if ("message" in actor) return actor;
    return {
      generatedAt: new Date().toISOString(),
      providerConfigs: await providerConfigs.list(),
    };
  });

  app.post("/api/admin/provider-configs", async (request, reply) => {
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.create",
      "provider_config",
      null,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const input = createProviderConfigRequestSchema.parse(request.body);
    const scopeType = input.scopeType;
    const scopeId = scopeType === "system" ? null : input.scopeId ?? null;
    if (scopeType !== "system" && !scopeId) {
      reply.code(400);
      return { message: "Provider config scopeId is required for user or project scope" };
    }
    if (scopeType === "user" && scopeId && !(await authStore.getUser(scopeId))) {
      reply.code(400);
      return { message: "Provider config scope user does not exist" };
    }
    if (scopeType === "project" && scopeId && !(await authStore.getProject(scopeId))) {
      reply.code(400);
      return { message: "Provider config scope project does not exist" };
    }
    try {
      const created = await providerConfigs.create({
        ...input,
        scopeType,
        scopeId,
        createdBy: actor.name,
      });
      await recordAdminAction(authStore, {
        actor,
        action: "admin.provider_config.create",
        targetType: "provider_config",
        targetId: created.id,
        outcome: "success",
        message: `Actor ${actorLabel(actor)} created provider config ${created.name}`,
      });
      reply.code(201);
      return created;
    } catch (error) {
      if (error instanceof ProviderConfigPolicyError) {
        reply.code(400);
        return { message: error.message };
      }
      throw error;
    }
  });

  app.patch("/api/admin/provider-configs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.update",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    if (!providerConfigs.updateMetadata) {
      reply.code(501);
      return { message: "Provider config update is not supported by this store" };
    }
    const input = updateProviderConfigRequestSchema.parse(request.body);
    const current = await providerConfigs.get(id);
    if (!current) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    const scopeType = input.scopeType ?? current.scopeType;
    const scopeId = scopeType === "system" ? null : input.scopeId ?? current.scopeId;
    if (scopeType !== "system" && !scopeId) {
      reply.code(400);
      return { message: "Provider config scopeId is required for user or project scope" };
    }
    if (scopeType === "user" && scopeId && !(await authStore.getUser(scopeId))) {
      reply.code(400);
      return { message: "Provider config scope user does not exist" };
    }
    if (scopeType === "project" && scopeId && !(await authStore.getProject(scopeId))) {
      reply.code(400);
      return { message: "Provider config scope project does not exist" };
    }
    try {
      const updated = await providerConfigs.updateMetadata(
        id,
        { ...input, scopeType, scopeId },
        actor.name,
      );
      if (!updated) {
        reply.code(404);
        return { message: "Provider config not found or revoked" };
      }
      await recordAdminAction(authStore, {
        actor,
        action: "admin.provider_config.update",
        targetType: "provider_config",
        targetId: id,
        outcome: "success",
        message: `Actor ${actorLabel(actor)} updated provider config ${updated.name}`,
      });
      return updated;
    } catch (error) {
      if (error instanceof ProviderConfigPolicyError) {
        reply.code(400);
        return { message: error.message };
      }
      throw error;
    }
  });

  app.post("/api/admin/provider-configs/:id/rotate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.rotate",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const input = rotateProviderKeyRequestSchema.parse(request.body);
    const rotated = await providerConfigs.rotate(id, input.apiKey, actor.name);
    if (!rotated) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    await recordAdminAction(authStore, {
      actor,
      action: "admin.provider_config.rotate",
      targetType: "provider_config",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} rotated provider config ${rotated.name}`,
    });
    return rotated;
  });

  app.post("/api/admin/provider-configs/:id/revoke", async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      "admin.provider_config.revoke",
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const revoked = await providerConfigs.revoke(id, actor.name);
    if (!revoked) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    await recordAdminAction(authStore, {
      actor,
      action: "admin.provider_config.revoke",
      targetType: "provider_config",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} revoked provider config ${revoked.name}`,
    });
    return revoked;
  });

  async function updateProviderConfigStatus(
    request: FastifyRequest,
    reply: FastifyReply,
    nextStatus: "active" | "disabled",
    action: "enable" | "disable",
  ) {
    const { id } = request.params as { id: string };
    const adminAction = `admin.provider_config.${action}`;
    const actor = await requireHighRiskAdmin(
      request,
      reply,
      authStore,
      adminAction,
      "provider_config",
      id,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;

    const updateStatus =
      action === "enable" ? providerConfigs.enable : providerConfigs.disable;
    if (!updateStatus) {
      reply.code(501);
      return { message: "Provider config status update is not supported by this store" };
    }

    const updated = await updateStatus.call(providerConfigs, id, actor.name);
    if (!updated) {
      reply.code(404);
      return { message: "Provider config not found or revoked" };
    }

    await recordAdminAction(authStore, {
      actor,
      action: adminAction,
      targetType: "provider_config",
      targetId: id,
      outcome: "success",
      message: `Actor ${actorLabel(actor)} changed provider config ${updated.name} to ${nextStatus}`,
    });
    return updated;
  }

  app.post("/api/admin/provider-configs/:id/disable", (request, reply) =>
    updateProviderConfigStatus(request, reply, "disabled", "disable"),
  );

  app.post("/api/admin/provider-configs/:id/enable", (request, reply) =>
    updateProviderConfigStatus(request, reply, "active", "enable"),
  );

  app.post("/api/admin/provider-configs/:id/test", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.provider_configs.write",
    );
    if ("message" in actor) return actor;
    const { id } = request.params as { id: string };
    const input = providerTestRequestSchema.parse(request.body ?? {});
    const providerConfig = await providerConfigs.get(id);
    if (!providerConfig) {
      reply.code(404);
      return { message: "Provider config not found" };
    }
    if (!providerConfig.allowlisted) {
      reply.code(400);
      return { ok: false, message: "Provider Base URL is not allowlisted" };
    }
    if (providerConfig.status !== "active") {
      reply.code(400);
      return { ok: false, message: "Provider config is revoked, disabled, or inactive" };
    }
    if (providerConfig.breakerState === "open") {
      reply.code(503);
      return {
        ok: false,
        message: "Provider circuit breaker is open",
        breaker: {
          state: providerConfig.breakerState,
          failureCount: providerConfig.breakerFailureCount,
          openedAt: providerConfig.breakerOpenedAt,
          lastFailureAt: providerConfig.breakerLastFailureAt,
        },
      };
    }
    const testModel = input.model ?? providerConfig.defaultModel;
    if (!providerConfig.allowedModels.includes(testModel)) {
      reply.code(400);
      return { ok: false, message: "Provider model is not allowed by this config" };
    }
    const apiKey = await providerConfigs.getSecret(id);
    if (!apiKey) {
      reply.code(400);
      return { ok: false, message: "Provider config secret is revoked" };
    }
    if (providerUsageTracker) {
      const policy = selectProviderRateLimitPolicy(
        {
          userId: actor.id,
          projectId: null,
          providerConfigId: id,
          taskType: "provider_test",
          ipAddress: request.ip,
        },
        await rateLimitPolicyStore.listRateLimitPolicies(),
        providerRateLimitPolicy,
      );
      const limitDecision = await providerUsageTracker.checkLimit({
        userId: actor.id,
        projectId: null,
        ipAddress: request.ip,
        providerConfigId: id,
        taskType: "provider_test",
        limit: policy.limit,
        windowSeconds: policy.windowSeconds,
      });
      if (!limitDecision.allowed) {
        reply.code(429);
        return {
          ok: false,
          message: "Provider rate limit exceeded",
          rateLimit: limitDecision,
        };
      }
    }

    const capability = getModelCapability(testModel);
    const response = await fetch(
      new URL("/v1/chat/completions", providerConfig.baseUrl).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: "只回复 JSON：{\"ok\":true}" }],
          stream: false,
          temperature: 0,
          response_format: getHealthcheckResponseFormat(testModel),
          tools: [],
          tool_choice: "none",
        }),
      },
    );

    if (!response.ok) {
      const breaker = await providerConfigs.recordFailure?.(id);
      reply.code(response.status >= 400 && response.status < 500 ? 400 : 502);
      return {
        ok: false,
        message: `Provider test failed with HTTP ${response.status}`,
        capability,
        breaker: breaker
          ? {
              state: breaker.breakerState,
              failureCount: breaker.breakerFailureCount,
              openedAt: breaker.breakerOpenedAt,
              lastFailureAt: breaker.breakerLastFailureAt,
            }
          : undefined,
      };
    }
    await providerConfigs.markUsed(id);
    await providerConfigs.resetBreaker?.(id);
    await providerUsageTracker?.recordUsage({
      userId: actor.id,
      projectId: null,
      ipAddress: request.ip,
      providerConfigId: id,
      provider: providerConfig.provider,
      model: testModel,
      taskType: "provider_test",
      outcome: "success",
    });
    return {
      ok: true,
      message: "Provider connection ok",
      capability,
    };
  });

  sendAdminOnly(app, "/api/admin/audit-logs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.audit_logs.read",
    );
    if ("message" in actor) return actor;
    const visibleProjectIds = hasFullProjectScope(actor)
      ? null
      : new Set(
          (await visibleProjectsForAdmin(academicStore, authStore, actor)).map(
            (project) => project.id,
          ),
        );
    const platformAuditLogs = (await authStore.listAuditLogs()).filter((log) => {
      if (visibleProjectIds === null || actor.dataScopes.includes("audit_logs")) {
        return true;
      }
      if (log.targetType === "project") {
        return log.targetId !== null && visibleProjectIds.has(log.targetId);
      }
      return true;
    });
    return {
      generatedAt: new Date().toISOString(),
      auditLogs: [
        ...platformAuditLogs,
        ...(await providerConfigs.listAuditLogs()).map((log) => ({
          id: log.id,
          actorUserId: null,
          action: log.action,
          targetType: "provider_config",
          targetId: log.target,
          outcome: log.result === "success" ? "success" : "failure",
          message: `Provider action by ${log.actor} from ${log.ip}`,
          createdAt: log.createdAt,
        })),
      ],
    };
  });

  sendAdminOnly(app, "/api/admin/system/health", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return {
      generatedAt: new Date().toISOString(),
      services: [
        { name: "API", status: "healthy", note: "admin endpoints registered" },
        { name: "Provider config store", status: "healthy", note: "managed provider API active" },
      ],
    };
  });

  sendAdminOnly(app, "/api/admin/system/config", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return {
      generatedAt: new Date().toISOString(),
      systemConfig: buildSystemConfig(),
    };
  });

  sendAdminOnly(app, "/api/admin/system/logs", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return {
      generatedAt: new Date().toISOString(),
      logs: buildSystemLogs(),
    };
  });

  sendAdminOnly(app, "/api/admin/system/releases", async (request, reply) => {
    const actor = await requireAdminPermission(
      request,
      reply,
      authStore,
      "admin.system_health.read",
    );
    if ("message" in actor) return actor;
    return {
      generatedAt: new Date().toISOString(),
      releases: buildSystemReleases(),
    };
  });
}
