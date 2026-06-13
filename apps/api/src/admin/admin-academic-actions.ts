// Handles admin academic hierarchy visibility and mutations after route-level auth checks.
import type {
  AdminClassCreateRequest,
  AdminCourseCreateRequest,
  AdminOrganizationCreateRequest,
  AdminOrganizationMembershipCreateRequest,
  AdminQuotaCreateRequest,
  AdminTeamCreateRequest,
} from "@uml-platform/contracts";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import {
  canSeeClass,
  canSeeCourse,
  canSeeOrganization,
  canSeeTarget,
  canSeeTeam,
  filterAsync,
  hasFullAcademicScope,
  type ScopedAdminActor,
} from "./academic-scope.js";

type AdminAcademicActionResult = Promise<{ statusCode: number; body: unknown }>;

type AdminAcademicContext = {
  academicStore: AcademicAdminRepository;
  actor: ScopedAdminActor;
};

export function denyScopedAdminOrganizationCreate(actor: ScopedAdminActor) {
  if (hasFullAcademicScope(actor)) return null;
  return {
    statusCode: 403,
    body: { message: "Only full-scope admins can create organizations" },
  } as const;
}

export async function listVisibleAdminOrganizations({
  academicStore,
  actor,
}: AdminAcademicContext) {
  return filterAsync(await academicStore.listOrganizations(), (organization) =>
    canSeeOrganization(academicStore, actor, organization.id),
  );
}

export async function buildAdminOrganizationListView(
  context: AdminAcademicContext,
) {
  return {
    generatedAt: new Date().toISOString(),
    organizations: await listVisibleAdminOrganizations(context),
  };
}

export async function getVisibleAdminOrganization({
  academicStore,
  actor,
  organizationId,
}: AdminAcademicContext & {
  organizationId: string;
}): AdminAcademicActionResult {
  const organization = await academicStore.getOrganization(organizationId);
  if (
    !organization ||
    !(await canSeeOrganization(academicStore, actor, organizationId))
  ) {
    return { statusCode: 404, body: { message: "Organization not found" } };
  }
  return { statusCode: 200, body: { organization } };
}

export async function createAdminOrganization({
  academicStore,
  input,
}: {
  academicStore: AcademicAdminRepository;
  input: AdminOrganizationCreateRequest;
}): AdminAcademicActionResult {
  return {
    statusCode: 201,
    body: { organization: await academicStore.createOrganization(input) },
  };
}

export async function listVisibleAdminCourses({
  academicStore,
  actor,
}: AdminAcademicContext) {
  return filterAsync(await academicStore.listCourses(), (course) =>
    canSeeCourse(academicStore, actor, course.id),
  );
}

export async function buildAdminCourseListView(context: AdminAcademicContext) {
  return {
    generatedAt: new Date().toISOString(),
    courses: await listVisibleAdminCourses(context),
  };
}

export async function getVisibleAdminCourse({
  academicStore,
  actor,
  courseId,
}: AdminAcademicContext & {
  courseId: string;
}): AdminAcademicActionResult {
  const course = await academicStore.getCourse(courseId);
  if (!course || !(await canSeeCourse(academicStore, actor, courseId))) {
    return { statusCode: 404, body: { message: "Course not found" } };
  }
  return { statusCode: 200, body: { course } };
}

export async function createAdminCourse({
  academicStore,
  actor,
  input,
}: AdminAcademicContext & {
  input: AdminCourseCreateRequest;
}): AdminAcademicActionResult {
  if (!(await academicStore.organizationExists(input.organizationId))) {
    return { statusCode: 404, body: { message: "Organization not found" } };
  }
  if (
    !hasFullAcademicScope(actor) &&
    !(await canSeeOrganization(academicStore, actor, input.organizationId))
  ) {
    return {
      statusCode: 403,
      body: { message: "Organization is outside admin scope" },
    };
  }
  return {
    statusCode: 201,
    body: { course: await academicStore.createCourse(input) },
  };
}

export async function listVisibleAdminClasses({
  academicStore,
  actor,
}: AdminAcademicContext) {
  return filterAsync(await academicStore.listClasses(), (classRecord) =>
    canSeeClass(academicStore, actor, classRecord.id),
  );
}

export async function buildAdminClassListView(context: AdminAcademicContext) {
  return {
    generatedAt: new Date().toISOString(),
    classes: await listVisibleAdminClasses(context),
  };
}

export async function getVisibleAdminClass({
  academicStore,
  actor,
  classId,
}: AdminAcademicContext & {
  classId: string;
}): AdminAcademicActionResult {
  const classRecord = await academicStore.getClass(classId);
  if (!classRecord || !(await canSeeClass(academicStore, actor, classId))) {
    return { statusCode: 404, body: { message: "Class not found" } };
  }
  return { statusCode: 200, body: { class: classRecord } };
}

export async function createAdminClass({
  academicStore,
  actor,
  input,
}: AdminAcademicContext & {
  input: AdminClassCreateRequest;
}): AdminAcademicActionResult {
  if (!(await academicStore.courseExists(input.courseId))) {
    return { statusCode: 404, body: { message: "Course not found" } };
  }
  if (!(await canSeeCourse(academicStore, actor, input.courseId))) {
    return {
      statusCode: 403,
      body: { message: "Course is outside admin scope" },
    };
  }
  return {
    statusCode: 201,
    body: { class: await academicStore.createClass(input) },
  };
}

export async function listVisibleAdminTeams({
  academicStore,
  actor,
}: AdminAcademicContext) {
  return filterAsync(await academicStore.listTeams(), (team) =>
    canSeeTeam(academicStore, actor, team.id),
  );
}

export async function buildAdminTeamListView(context: AdminAcademicContext) {
  return {
    generatedAt: new Date().toISOString(),
    teams: await listVisibleAdminTeams(context),
  };
}

export async function getVisibleAdminTeam({
  academicStore,
  actor,
  teamId,
}: AdminAcademicContext & {
  teamId: string;
}): AdminAcademicActionResult {
  const team = await academicStore.getTeam(teamId);
  if (!team || !(await canSeeTeam(academicStore, actor, teamId))) {
    return { statusCode: 404, body: { message: "Team not found" } };
  }
  return { statusCode: 200, body: { team } };
}

export async function createAdminTeam({
  academicStore,
  actor,
  input,
}: AdminAcademicContext & {
  input: AdminTeamCreateRequest;
}): AdminAcademicActionResult {
  if (!(await academicStore.classExists(input.classId))) {
    return { statusCode: 404, body: { message: "Class not found" } };
  }
  if (!(await canSeeClass(academicStore, actor, input.classId))) {
    return {
      statusCode: 403,
      body: { message: "Class is outside admin scope" },
    };
  }
  return {
    statusCode: 201,
    body: { team: await academicStore.createTeam(input) },
  };
}

export async function listVisibleAdminMemberships({
  academicStore,
  actor,
}: AdminAcademicContext) {
  return filterAsync(await academicStore.listMemberships(), (membership) =>
    canSeeTarget(
      academicStore,
      actor,
      membership.targetType,
      membership.targetId,
    ),
  );
}

export async function buildAdminMembershipListView(
  context: AdminAcademicContext,
) {
  return {
    generatedAt: new Date().toISOString(),
    memberships: await listVisibleAdminMemberships(context),
  };
}

export async function getVisibleAdminMembership({
  academicStore,
  actor,
  membershipId,
}: AdminAcademicContext & {
  membershipId: string;
}): AdminAcademicActionResult {
  const membership = (await academicStore.listMemberships()).find(
    (item) => item.id === membershipId,
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
    return {
      statusCode: 404,
      body: { message: "Organization membership not found" },
    };
  }
  return { statusCode: 200, body: { membership } };
}

export async function createAdminMembership({
  academicStore,
  authStore,
  actor,
  input,
}: AdminAcademicContext & {
  authStore: AuthStore;
  input: AdminOrganizationMembershipCreateRequest;
}): AdminAcademicActionResult {
  if (!(await academicStore.targetExists(input.targetType, input.targetId))) {
    return { statusCode: 404, body: { message: "Membership target not found" } };
  }
  if (
    !(await canSeeTarget(academicStore, actor, input.targetType, input.targetId))
  ) {
    return {
      statusCode: 403,
      body: { message: "Membership target is outside admin scope" },
    };
  }
  const user = input.userId ? await authStore.getUser(input.userId) : null;
  return {
    statusCode: 201,
    body: {
      membership: await academicStore.createMembership({
        ...input,
        email: input.email ?? user?.email ?? null,
        displayName: input.displayName ?? user?.displayName ?? null,
      }),
    },
  };
}

export async function listVisibleAdminQuotas({
  academicStore,
  actor,
}: AdminAcademicContext) {
  return filterAsync(await academicStore.listQuotas(), (quota) =>
    canSeeTarget(academicStore, actor, quota.scopeType, quota.scopeId),
  );
}

export async function buildAdminQuotaListView(context: AdminAcademicContext) {
  return {
    generatedAt: new Date().toISOString(),
    quotas: await listVisibleAdminQuotas(context),
  };
}

export async function getVisibleAdminQuota({
  academicStore,
  actor,
  quotaId,
}: AdminAcademicContext & {
  quotaId: string;
}): AdminAcademicActionResult {
  const quota = await academicStore.getQuota(quotaId);
  if (
    !quota ||
    !(await canSeeTarget(academicStore, actor, quota.scopeType, quota.scopeId))
  ) {
    return { statusCode: 404, body: { message: "Quota not found" } };
  }
  return { statusCode: 200, body: { quota } };
}

export async function createAdminQuota({
  academicStore,
  actor,
  input,
}: AdminAcademicContext & {
  input: AdminQuotaCreateRequest;
}): AdminAcademicActionResult {
  if (!(await academicStore.targetExists(input.scopeType, input.scopeId))) {
    return { statusCode: 404, body: { message: "Quota scope not found" } };
  }
  if (!(await canSeeTarget(academicStore, actor, input.scopeType, input.scopeId))) {
    return {
      statusCode: 403,
      body: { message: "Quota scope is outside admin scope" },
    };
  }
  return {
    statusCode: 201,
    body: { quota: await academicStore.createQuota(input) },
  };
}
