// Creates a one-time real administrator when explicitly enabled by deployment env.
import type { AdminRole, AuditLogDto } from "@uml-platform/contracts";
import type { UserRecord } from "../auth/in-memory-auth-store.js";
import { hashPassword } from "../security/password-hashing.js";

type BootstrapEnv = Record<string, string | undefined>;
type MaybePromise<T> = T | Promise<T>;
type BootstrapAuthStore = {
  createUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    systemRoles?: AdminRole[];
    emailVerified?: boolean;
  }): MaybePromise<UserRecord | null>;
  createEmailVerificationToken(userId: string): MaybePromise<{
    token: string;
    expiresAt: string;
  }>;
  recordAuditLog(input: {
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    outcome: "success" | "failure";
    message?: string | null;
  }): MaybePromise<AuditLogDto>;
};

export type AdminBootstrapResult = {
  user: UserRecord;
  verification: {
    purpose: "verify_email";
    token: string;
    expiresAt: string;
  };
};

const DISALLOWED_PASSWORDS = new Set([
  "admin",
  "admin123",
  "password",
  "password-123",
  "mock-password",
  "changeme",
]);

export async function bootstrapAdminUser({
  authStore,
  env = process.env,
}: {
  authStore: BootstrapAuthStore;
  env?: BootstrapEnv;
}): Promise<AdminBootstrapResult> {
  if (env.UML_ENABLE_ADMIN_BOOTSTRAP !== "true") {
    throw new Error("Admin bootstrap is disabled; set UML_ENABLE_ADMIN_BOOTSTRAP=true for the one-time setup");
  }

  const email = readRequired(env, "UML_BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const password = readRequired(env, "UML_BOOTSTRAP_ADMIN_PASSWORD");
  const displayName = readRequired(env, "UML_BOOTSTRAP_ADMIN_DISPLAY_NAME");
  assertAcceptableBootstrapPassword(password, env.NODE_ENV);

  const roles = parseRoles(env.UML_BOOTSTRAP_ADMIN_ROLES);
  const user = await authStore.createUser({
    email,
    displayName,
    passwordHash: hashPassword(password),
    systemRoles: roles,
    emailVerified: false,
  });
  if (!user) {
    throw new Error(`Admin bootstrap user already exists: ${email}`);
  }

  const verification = await authStore.createEmailVerificationToken(user.id);
  await authStore.recordAuditLog({
    actorUserId: user.id,
    action: "admin.bootstrap.create",
    targetType: "user",
    targetId: user.id,
    outcome: "success",
    message: "One-time admin bootstrap user created; disable UML_ENABLE_ADMIN_BOOTSTRAP after setup",
  });

  return {
    user,
    verification: {
      purpose: "verify_email",
      token: verification.token,
      expiresAt: verification.expiresAt,
    },
  };
}

function readRequired(env: BootstrapEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for admin bootstrap`);
  return value;
}

function parseRoles(raw: string | undefined): AdminRole[] {
  if (!raw?.trim()) return ["super_admin"];
  const roles = raw.split(",").map((role) => role.trim()).filter(Boolean);
  if (!roles.includes("super_admin")) {
    throw new Error("Admin bootstrap roles must include super_admin");
  }
  return roles as AdminRole[];
}

function assertAcceptableBootstrapPassword(password: string, nodeEnv: string | undefined) {
  const normalized = password.trim().toLowerCase();
  if (password.length < 12 || DISALLOWED_PASSWORDS.has(normalized)) {
    throw new Error("Admin bootstrap password is a default, mock, or weak password");
  }
  if (nodeEnv === "production" && /^(admin|password|mock|test)/i.test(password)) {
    throw new Error("Production admin bootstrap password cannot be a default, weak, or mock password");
  }
}
