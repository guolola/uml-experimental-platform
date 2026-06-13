// Resolves admin academic/project visibility without owning endpoint responses.
import type { AdminCapability } from "@uml-platform/contracts";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AcademicAdminRepository } from "../db/academic-admin-repository.js";
import type { AdminActor } from "../security/admin-guard.js";

export type ScopedAdminActor = AdminActor & {
  capabilities: AdminCapability[];
};

type AcademicScopeActor = Pick<AdminActor, "id" | "dataScopes">;
type AcademicAdminStore = AcademicAdminRepository;
type ProjectRecord = NonNullable<Awaited<ReturnType<AuthStore["getProject"]>>>;

function hasFullAcademicScope(actor: AcademicScopeActor) {
  return actor.dataScopes.some((scope) =>
    ["all_projects", "all_users", "system"].includes(scope),
  );
}

async function scopedCourseIds(
  store: AcademicAdminStore,
  actor: AcademicScopeActor,
) {
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

export async function filterAsync<T>(
  values: T[],
  predicate: (value: T) => Promise<boolean>,
) {
  const decisions = await Promise.all(values.map(predicate));
  return values.filter((_, index) => decisions[index]);
}

export { hasFullAcademicScope };

export function hasAcademicRead(actor: Pick<ScopedAdminActor, "capabilities">) {
  return actor.capabilities.includes("viewProjects");
}

export function hasAcademicWrite(actor: Pick<ScopedAdminActor, "capabilities">) {
  return actor.capabilities.includes("manageProjects");
}

export async function canSeeOrganization(
  store: AcademicAdminStore,
  actor: AcademicScopeActor,
  organizationId: string,
) {
  if (hasFullAcademicScope(actor)) return true;
  const scopedCourses = await scopedCourseIds(store, actor);
  return (await store.listCourses()).some(
    (course) =>
      course.organizationId === organizationId && scopedCourses.has(course.id),
  );
}

export async function canSeeCourse(
  store: AcademicAdminStore,
  actor: AcademicScopeActor,
  courseId: string,
) {
  return hasFullAcademicScope(actor) || (await scopedCourseIds(store, actor)).has(courseId);
}

export async function canSeeClass(
  store: AcademicAdminStore,
  actor: AcademicScopeActor,
  classId: string,
) {
  const classRecord = await store.getClass(classId);
  return Boolean(classRecord && (await canSeeCourse(store, actor, classRecord.courseId)));
}

export async function canSeeTeam(
  store: AcademicAdminStore,
  actor: AcademicScopeActor,
  teamId: string,
) {
  const team = await store.getTeam(teamId);
  return Boolean(team && (await canSeeClass(store, actor, team.classId)));
}

export async function canSeeTarget(
  store: AcademicAdminStore,
  actor: AcademicScopeActor,
  targetType: "organization" | "course" | "class" | "team",
  targetId: string,
) {
  if (targetType === "organization") return canSeeOrganization(store, actor, targetId);
  if (targetType === "course") return canSeeCourse(store, actor, targetId);
  if (targetType === "class") return canSeeClass(store, actor, targetId);
  return canSeeTeam(store, actor, targetId);
}

export function hasFullProjectScope(actor: Pick<AdminActor, "dataScopes">) {
  return actor.dataScopes.some((scope) =>
    ["all_projects", "all_users", "system"].includes(scope),
  );
}

export async function canSeeProjectByScope(
  store: AcademicAdminStore,
  authStore: AuthStore,
  actor: AcademicScopeActor,
  project: ProjectRecord,
) {
  if (hasFullProjectScope(actor)) return true;

  if (actor.dataScopes.includes("assigned_projects")) {
    const member = await authStore.findProjectMember(project.id, actor.id);
    if (member) return true;
  }

  if (actor.dataScopes.includes("assigned_courses")) {
    if (project.teamId && (await canSeeTeam(store, actor, project.teamId))) {
      return true;
    }
    if (project.classId && (await canSeeClass(store, actor, project.classId))) {
      return true;
    }
    if (project.courseId && (await canSeeCourse(store, actor, project.courseId))) {
      return true;
    }
    if (
      project.organizationId &&
      !project.courseId &&
      !project.classId &&
      !project.teamId &&
      (await canSeeOrganization(store, actor, project.organizationId))
    ) {
      return true;
    }
  }

  return false;
}

export async function visibleProjectsForAdmin(
  store: AcademicAdminStore,
  authStore: AuthStore,
  actor: AcademicScopeActor,
) {
  return filterAsync(await authStore.listProjects(), (project) =>
    canSeeProjectByScope(store, authStore, actor, project),
  );
}

export async function visibleUserIdsForAdmin(
  store: AcademicAdminStore,
  authStore: AuthStore,
  actor: AcademicScopeActor,
) {
  if (actor.dataScopes.includes("all_users") || actor.dataScopes.includes("system")) {
    return null;
  }

  const visibleUserIds = new Set<string>([actor.id]);
  for (const membership of await store.listMemberships()) {
    if (
      membership.status === "active" &&
      membership.userId &&
      (await canSeeTarget(
        store,
        actor,
        membership.targetType,
        membership.targetId,
      ))
    ) {
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
