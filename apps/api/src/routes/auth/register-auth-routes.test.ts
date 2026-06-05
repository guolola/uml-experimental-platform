// Verifies auth recovery and verification endpoints before UI pages depend on them.
import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { generateTotpCodeForTesting } from "../../auth/totp.js";
import { createApiServer } from "../../index.js";
import { hashPassword } from "../../security/password-hashing.js";

function getSessionCookie(response: { headers: Record<string, unknown> }) {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : String(raw ?? "");
  assert.match(value, /uml_session=/);
  return value.split(";")[0];
}

function getNamedCookie(response: { headers: Record<string, unknown> }, name: string) {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : String(raw ?? "");
  assert.match(value, new RegExp(`${name}=`));
  return value.split(";")[0];
}

async function createTestApp() {
  return createApiServer({
    llmTransport: {
      streamChatCompletion: async function* () {
        yield "{}";
      },
    },
    renderClient: async () => ({
      svg: "<svg />",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 0,
        durationMs: 1,
      },
    }),
  });
}

test("auth registration issues an email verification token and verify-email marks the user verified", async () => {
  const app = await createTestApp();

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "verify@example.com",
      password: "password-123",
      displayName: "Verify User",
    },
  });
  assert.equal(registered.statusCode, 201);
  const cookie = getSessionCookie(registered);
  assert.equal(registered.json().user.emailVerified, false);
  assert.equal(typeof registered.json().verification.devToken, "string");

  const verified = await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().user.emailVerified, true);

  const summary = await app.inject({
    method: "GET",
    url: "/api/billing/summary",
    headers: { cookie },
  });
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.json().signupBonus.granted, true);
  assert.equal(summary.json().creditBalance, 5);

  const reused = await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });
  assert.equal(reused.statusCode, 400);

  await app.close();
});

test("auth reset password token revokes old sessions and accepts the new password", async () => {
  const app = await createTestApp();

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "reset@example.com",
      password: "password-123",
      displayName: "Reset User",
    },
  });
  const oldCookie = getSessionCookie(registered);
  await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });

  const requested = await app.inject({
    method: "POST",
    url: "/api/auth/forgot-password",
    payload: {
      email: "reset@example.com",
    },
  });
  assert.equal(requested.statusCode, 200);
  assert.equal(typeof requested.json().reset.devToken, "string");

  const reset = await app.inject({
    method: "POST",
    url: "/api/auth/reset-password",
    payload: {
      token: requested.json().reset.devToken,
      newPassword: "password-456",
    },
  });
  assert.equal(reset.statusCode, 200);
  assert.equal(reset.json().revokedSessionCount, 1);

  const oldSession = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: oldCookie },
  });
  assert.equal(oldSession.statusCode, 401);

  const oldLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "reset@example.com",
      password: "password-123",
    },
  });
  assert.equal(oldLogin.statusCode, 401);

  const newLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "reset@example.com",
      password: "password-456",
    },
  });
  assert.equal(newLogin.statusCode, 200);

  await app.close();
});

test("auth login requires email verification", async () => {
  const app = await createTestApp();

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "unverified@example.com",
      password: "password-123",
      displayName: "Unverified User",
    },
  });

  const blocked = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "unverified@example.com",
      password: "password-123",
    },
  });
  assert.equal(blocked.statusCode, 403);
  assert.match(blocked.json().message, /Email verification/);

  const verified = await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });
  assert.equal(verified.statusCode, 200);

  const allowed = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "unverified@example.com",
      password: "password-123",
    },
  });
  assert.equal(allowed.statusCode, 200);

  await app.close();
});

test("account security exposes login events and enforces TOTP MFA challenge", async () => {
  const app = await createTestApp();

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "security@example.com",
      password: "password-123",
      displayName: "Security User",
    },
  });
  const cookie = getSessionCookie(registered);
  await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });

  const loginEvents = await app.inject({
    method: "GET",
    url: "/api/account/login-events",
    headers: { cookie },
  });
  assert.equal(loginEvents.statusCode, 200);
  assert.equal(loginEvents.json().events[0].outcome, "success");

  const setup = await app.inject({
    method: "POST",
    url: "/api/account/mfa/setup",
    headers: { cookie },
  });
  assert.equal(setup.statusCode, 200);
  assert.match(setup.json().otpauthUri, /^otpauth:\/\/totp\//);

  const code = generateTotpCodeForTesting(setup.json().secret);
  const confirm = await app.inject({
    method: "POST",
    url: "/api/account/mfa/confirm",
    headers: { cookie },
    payload: { code },
  });
  assert.equal(confirm.statusCode, 200);
  assert.equal(confirm.json().mfa.enabled, true);
  assert.equal(confirm.json().mfa.enforcement, "totp");

  const challenged = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "security@example.com",
      password: "password-123",
    },
  });
  assert.equal(challenged.statusCode, 202);
  assert.equal(challenged.json().mfa.method, "totp");

  const verified = await app.inject({
    method: "POST",
    url: "/api/auth/mfa/verify",
    payload: {
      challengeId: challenged.json().mfa.challengeId,
      code: generateTotpCodeForTesting(setup.json().secret),
    },
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().user.mfaEnabled, true);

  await app.close();
});

test("admin auth uses a dedicated admin session cookie without replacing frontend login", async () => {
  const authStore = createInMemoryAuthStore();
  const admin = authStore.createUser({
    email: "admin@example.edu",
    displayName: "Admin User",
    passwordHash: hashPassword("password-123"),
    systemRoles: ["super_admin"],
  });
  assert.ok(admin);
  const mfaSecret = "JBSWY3DPEHPK3PXP";
  authStore.updateUser(admin.id, { mfaEnabled: true, mfaSecret });
  const app = await createApiServer({ authStore });

  const frontendChallenge = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "admin@example.edu",
      password: "password-123",
    },
  });
  const frontendVerified = await app.inject({
    method: "POST",
    url: "/api/auth/mfa/verify",
    payload: {
      challengeId: frontendChallenge.json().mfa.challengeId,
      code: generateTotpCodeForTesting(mfaSecret),
    },
  });
  const frontendCookie = getNamedCookie(frontendVerified, "uml_session");
  assert.doesNotMatch(String(frontendVerified.headers["set-cookie"]), /uml_admin_session=/);

  const adminBlockedWithFrontendCookie = await app.inject({
    method: "GET",
    url: "/api/admin/session",
    headers: { cookie: frontendCookie },
  });
  assert.equal(adminBlockedWithFrontendCookie.statusCode, 401);

  const adminChallenge = await app.inject({
    method: "POST",
    url: "/api/admin/auth/login",
    payload: {
      email: "admin@example.edu",
      password: "password-123",
    },
  });
  const adminVerified = await app.inject({
    method: "POST",
    url: "/api/admin/auth/mfa/verify",
    payload: {
      challengeId: adminChallenge.json().mfa.challengeId,
      code: generateTotpCodeForTesting(mfaSecret),
    },
  });
  const adminCookie = getNamedCookie(adminVerified, "uml_admin_session");
  assert.doesNotMatch(String(adminVerified.headers["set-cookie"]), /uml_session=/);

  const adminSession = await app.inject({
    method: "GET",
    url: "/api/admin/session",
    headers: { cookie: adminCookie },
  });
  const frontendMeWithAdminCookie = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: adminCookie },
  });

  assert.equal(adminSession.statusCode, 200);
  assert.equal(adminSession.json().user.email, "admin@example.edu");
  assert.equal(frontendMeWithAdminCookie.statusCode, 401);

  await app.close();
});
