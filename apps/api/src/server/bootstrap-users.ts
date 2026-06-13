// Seeds optional local development users without leaking that startup behavior into route registration.
import { hashPassword } from "../security/password-hashing.js";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AdminRole } from "@uml-platform/contracts";

const DEFAULT_DEV_ADMIN_MFA_SECRET = "JBSWY3DPEHPK3PXP";

export async function seedDevelopmentAdmin(authStore: AuthStore) {
  const email = process.env.UML_DEV_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.UML_DEV_ADMIN_PASSWORD?.trim();
  if (!email || !password) return;

  const displayName = process.env.UML_DEV_ADMIN_DISPLAY_NAME?.trim() || "本地管理员";
  const mfaSecret = process.env.UML_DEV_ADMIN_MFA_SECRET?.trim() || DEFAULT_DEV_ADMIN_MFA_SECRET;
  const systemRoles: AdminRole[] = ["super_admin"];
  const existing = await authStore.findUserByEmail(email);
  const patch = {
    displayName,
    passwordHash: hashPassword(password),
    emailVerified: true,
    systemRoles,
    mfaEnabled: true,
    mfaSecret,
    mfaPendingSecret: null,
    mfaPendingExpiresAt: null,
  };

  if (existing) {
    await authStore.updateUser(existing.id, patch);
    return;
  }

  const created = await authStore.createUser({
    email,
    displayName,
    passwordHash: patch.passwordHash,
    systemRoles,
    emailVerified: true,
  });
  if (created) {
    await authStore.updateUser(created.id, {
      mfaEnabled: true,
      mfaSecret,
      mfaPendingSecret: null,
      mfaPendingExpiresAt: null,
    });
  }
}

export async function seedGuestUser(authStore: AuthStore) {
  if (process.env.UML_ENABLE_GUEST_ACCESS !== "true") return null;
  const email = (process.env.UML_GUEST_EMAIL?.trim() || "guest@example.edu").toLowerCase();
  const password = process.env.UML_GUEST_PASSWORD?.trim() || "guest";
  const displayName = process.env.UML_GUEST_DISPLAY_NAME?.trim() || "Guest";
  const patch = {
    displayName,
    passwordHash: hashPassword(password),
    emailVerified: true,
    systemRoles: [] as AdminRole[],
    mfaEnabled: false,
    mfaSecret: null,
    mfaPendingSecret: null,
    mfaPendingExpiresAt: null,
  };

  const existing = await authStore.findUserByEmail(email);
  if (existing) {
    await authStore.updateUser(existing.id, patch);
    return existing.id;
  }

  const created = await authStore.createUser({
    email,
    displayName,
    passwordHash: patch.passwordHash,
    systemRoles: [],
    emailVerified: true,
  });
  if (created) {
    await authStore.updateUser(created.id, {
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      mfaPendingExpiresAt: null,
    });
  }
  return created?.id ?? null;
}
