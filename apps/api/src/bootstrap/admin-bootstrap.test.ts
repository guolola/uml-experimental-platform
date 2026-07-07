// Guards the one-time admin bootstrap path from becoming a fixed default account.
import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryAuthStore } from "../auth/in-memory-auth-store.js";
import { bootstrapAdminUser } from "./admin-bootstrap.js";

test("admin bootstrap is disabled unless the explicit env switch is enabled", async () => {
  const authStore = createInMemoryAuthStore();
  await assert.rejects(
    () =>
      bootstrapAdminUser({
        authStore,
        env: {
          UML_ENABLE_ADMIN_BOOTSTRAP: "false",
          UML_BOOTSTRAP_ADMIN_EMAIL: "admin@example.edu",
          UML_BOOTSTRAP_ADMIN_PASSWORD: "strong-password-123",
          UML_BOOTSTRAP_ADMIN_DISPLAY_NAME: "Platform Admin",
        },
      }),
    /disabled/i,
  );
  assert.equal((await authStore.listUsers()).length, 0);
});

test("admin bootstrap creates a real super admin without fixed mock passwords", async () => {
  const authStore = createInMemoryAuthStore();
  const result = await bootstrapAdminUser({
    authStore,
    env: {
      UML_ENABLE_ADMIN_BOOTSTRAP: "true",
      UML_BOOTSTRAP_ADMIN_EMAIL: "admin@example.edu",
      UML_BOOTSTRAP_ADMIN_PASSWORD: "strong-password-123",
      UML_BOOTSTRAP_ADMIN_DISPLAY_NAME: "Platform Admin",
    },
  });

  assert.equal(result.user.email, "admin@example.edu");
  assert.deepEqual(result.user.systemRoles, ["super_admin"]);
  assert.equal(result.user.status, "pending_email_verification");
  assert.equal(result.user.emailVerified, false);
  assert.equal(result.user.mfaEnabled, false);
  assert.equal(result.verification.purpose, "verify_email");
  assert.ok(result.verification.token);

  await assert.rejects(
    () =>
      bootstrapAdminUser({
        authStore: createInMemoryAuthStore(),
        env: {
          UML_ENABLE_ADMIN_BOOTSTRAP: "true",
          UML_BOOTSTRAP_ADMIN_EMAIL: "admin@example.edu",
          UML_BOOTSTRAP_ADMIN_PASSWORD: "mock-password",
          UML_BOOTSTRAP_ADMIN_DISPLAY_NAME: "Platform Admin",
          NODE_ENV: "production",
        },
      }),
    /default|weak|mock/i,
  );
});
