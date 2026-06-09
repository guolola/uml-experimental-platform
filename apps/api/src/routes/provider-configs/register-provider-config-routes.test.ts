// Verifies user/project-visible provider config routes never expose provider secrets.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import { hashPassword } from "../../security/password-hashing.js";
import { registerProviderConfigRoutes } from "./register-provider-config-routes.js";

async function createSessionCookie(authStore: AuthStore, userId: string) {
  const session = await authStore.createSession({
    userId,
    ipAddress: "127.0.0.1",
    userAgent: "provider-config-route-test",
  });
  return `uml_session=${encodeURIComponent(session.id)}`;
}

async function createProviderRouteTestApp() {
  const app = Fastify({ logger: false });
  const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({
    email: "owner@example.com",
    displayName: "Owner User",
    passwordHash: hashPassword("password-123"),
  });
  const outsider = authStore.createUser({
    email: "outsider@example.com",
    displayName: "Outside User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(owner);
  assert.ok(outsider);
  const { project } = authStore.createProject({
    ownerUserId: owner.id,
    name: "Provider Project",
    description: null,
    visibility: "private",
  });
  const providerConfigs = createProviderConfigStore({
    baseUrlAllowlist: ["https://api.openai.com"],
    secret: "route-test-secret",
  });
  const systemProvider = providerConfigs.create({
    name: "System OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-system-secret-a91f",
    defaultModel: "gpt-4.1",
    createdBy: "admin",
    scopeType: "system",
  });
  const userProvider = providerConfigs.create({
    name: "Owner Personal OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-owner-secret-b52c",
    defaultModel: "gpt-4.1-mini",
    createdBy: owner.id,
    scopeType: "user",
    scopeId: owner.id,
  });
  const projectProvider = providerConfigs.create({
    name: "Project OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-project-secret-c83d",
    defaultModel: "gpt-4.1",
    createdBy: owner.id,
    scopeType: "project",
    scopeId: project.id,
  });

  registerProviderConfigRoutes({ app, authStore, providerConfigs });

  return {
    app,
    owner,
    outsider,
    project,
    providerConfigs,
    systemProvider,
    userProvider,
    projectProvider,
    ownerCookie: await createSessionCookie(authStore, owner.id),
    outsiderCookie: await createSessionCookie(authStore, outsider.id),
  };
}

test("regular users can read system and user-scoped provider configs without secrets", async () => {
  const { app, ownerCookie } = await createProviderRouteTestApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/provider-configs",
    headers: { cookie: ownerCookie },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().providerConfigs.map((item: { scopeType: string }) => item.scopeType),
    ["user", "system"],
  );
  assert.doesNotMatch(response.body, /sk-system-secret-a91f/);
  assert.doesNotMatch(response.body, /sk-owner-secret-b52c/);
  assert.doesNotMatch(response.body, /sk-project-secret-c83d/);
  assert.doesNotMatch(response.body, /apiKey|secret/i);

  await app.close();
});

test("project provider config route requires project membership", async () => {
  const { app, outsiderCookie, project } = await createProviderRouteTestApp();

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${project.id}/provider-configs`,
    headers: { cookie: outsiderCookie },
  });

  assert.equal(response.statusCode, 403);

  await app.close();
});

test("project provider config route includes system, user, and project scopes for members", async () => {
  const { app, ownerCookie, project } = await createProviderRouteTestApp();

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${project.id}/provider-configs`,
    headers: { cookie: ownerCookie },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().providerConfigs.map((item: { scopeType: string }) => item.scopeType),
    ["project", "user", "system"],
  );
  assert.doesNotMatch(response.body, /sk-system-secret-a91f|sk-owner-secret-b52c|sk-project-secret-c83d/);

  await app.close();
});

test("provider config test requests reject apiKey and apiBaseUrl overrides", async () => {
  const {
    app,
    ownerCookie,
    owner,
    project,
    systemProvider,
    projectProvider,
  } = await createProviderRouteTestApp();

  const userTest = await app.inject({
    method: "POST",
    url: `/api/provider-configs/${systemProvider.id}/test`,
    headers: { cookie: ownerCookie },
    payload: {
      model: "gpt-4.1",
      apiKey: "sk-frontend-secret",
    },
  });
  const projectTest = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/provider-configs/${projectProvider.id}/test`,
    headers: { cookie: ownerCookie },
    payload: {
      apiBaseUrl: "https://api.openai.com",
    },
  });

  assert.equal(owner.status, "active");
  assert.equal(userTest.statusCode, 400);
  assert.match(userTest.body, /apiKey|unrecognized|request/i);
  assert.equal(projectTest.statusCode, 400);
  assert.match(projectTest.body, /apiBaseUrl|unrecognized|request/i);

  await app.close();
});

test("provider config test includes provider error message without leaking secrets", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 30001,
        message: "Sorry, your account balance is insufficient",
        apiKey: "sk-provider-response-should-not-leak",
      }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      },
    )) as typeof fetch;

  const { app, ownerCookie, systemProvider } = await createProviderRouteTestApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: `/api/provider-configs/${systemProvider.id}/test`,
      headers: { cookie: ownerCookie },
    });

    assert.equal(response.statusCode, 400);
    assert.match(
      response.json().message,
      /Provider test failed with HTTP 403: Sorry, your account balance is insufficient/,
    );
    assert.doesNotMatch(response.body, /sk-provider-response-should-not-leak/);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});
