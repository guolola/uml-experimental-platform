// Converts private auth store records into public contract DTOs.
import {
  projectDtoSchema,
  projectMemberDtoSchema,
  sessionDtoSchema,
  userDtoSchema,
} from "@uml-platform/contracts";
import type {
  ProjectMemberRecord,
  ProjectRecord,
  SessionRecord,
  UserRecord,
} from "./in-memory-auth-store.js";

export function toUserDto(user: UserRecord) {
  return userDtoSchema.parse({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    systemRoles: user.systemRoles,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
  });
}

export function toSessionDto(session: SessionRecord) {
  return sessionDtoSchema.parse({
    id: session.id,
    userId: session.userId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    lastSeenAt: session.lastSeenAt,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  });
}

export function toProjectDto(project: ProjectRecord) {
  return projectDtoSchema.parse(project);
}

export function toProjectMemberDto(member: ProjectMemberRecord) {
  return projectMemberDtoSchema.parse(member);
}
