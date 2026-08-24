// Verifies top-level app routing, provider composition, shell layout behavior, and account/project entry flows.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../services/workspace-repository";
import type { RunHistoryItem } from "../features/history";
import {
  createRunSnapshot,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../test/workspace-test-utils";
import { loadUserSettings, USER_SETTINGS_STORAGE_KEY } from "../shared/lib/user-settings";
import App, { Shell } from "./App";
import { matchAppRoute } from "./app-routes";
import {
  ProjectWorkspaceAccessBoundary,
  ProjectsIndexPage,
} from "../features/user-platform/components/user-platform-pages";
import { formatProjectDateTimeMinute } from "../features/user-platform/lib/project-presentation";
import { i18n, LOCALE_PREFERENCE_STORAGE_KEY } from "../shared/i18n";

let projectApiMode: "unauthenticated" | "authenticated" | "empty" | "forbidden" | "offline";
let caseProjectApiMode: "success" | "failure";
let projectMembershipRole: "owner" | "editor" | "viewer";
let loginApiMode: "failure" | "success" | "mfa-challenge" | "email-unverified";
let authSessionMode: "authenticated" | "unauthenticated" | "offline";
let accountMfaEnabled: boolean;
let providerConfigFixtures: Array<Record<string, unknown>>;
const projectUpdatedAt = "2026-05-22T02:00:00.000Z";
const billingTestSkus = [
  {
    code: "credits_10",
    name: "10 次包",
    kind: "credit_pack",
    description: "买 10 次送 1 次，到账 11 次",
    durationDays: null,
    creditAmount: 11,
    amountCents: 990,
    currency: "CNY",
    active: true,
    sortOrder: 110,
  },
  {
    code: "credits_50",
    name: "50 次包",
    kind: "credit_pack",
    description: "买 50 次送 8 次，到账 58 次",
    durationDays: null,
    creditAmount: 58,
    amountCents: 4900,
    currency: "CNY",
    active: true,
    sortOrder: 120,
  },
  {
    code: "credits_100",
    name: "100 次包",
    kind: "credit_pack",
    description: "买 100 次送 20 次，到账 120 次",
    durationDays: null,
    creditAmount: 120,
    amountCents: 9900,
    currency: "CNY",
    active: true,
    sortOrder: 130,
  },
  {
    code: "credits_500",
    name: "500 次包",
    kind: "credit_pack",
    description: "买 500 次送 120 次，到账 620 次",
    durationDays: null,
    creditAmount: 620,
    amountCents: 39900,
    currency: "CNY",
    active: true,
    sortOrder: 140,
  },
] as const;

const billingPrimarySku = billingTestSkus.find((sku) => sku.code === "credits_100") ?? billingTestSkus[0]!;

const billingTestOrder = {
  orderId: "order-test-1",
  merchantOrderNo: "UML202606050001",
  sku: billingPrimarySku,
  amountCents: billingPrimarySku.amountCents,
  currency: "CNY",
  channel: "alipay",
  status: "pending",
  createdAt: "2026-06-05T04:00:00.000Z",
  expiresAt: "2026-06-05T04:15:00.000Z",
  paidAt: null,
} as const;

function createRepository(): WorkspaceRepository {
  return {
    loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
    updateRequirementText: vi.fn(async () => {}),
    startRun: vi.fn(),
    subscribeToRun: vi.fn(),
    getRunSnapshot: vi.fn(),
    renderPlantUml: vi.fn(),
    testProviderSettings: vi.fn(),
    saveRunHistory: vi.fn(),
    listRunHistory: vi.fn(async () => []),
    restoreRunHistory: vi.fn(async () => null),
    deleteRunHistory: vi.fn(async () => []),
    clearRunHistory: vi.fn(async () => {}),
  };
}

async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  combobox: HTMLElement,
  optionName: string,
) {
  await user.click(combobox);
  const listbox = await waitFor(() => {
    const selectListbox = screen
      .getAllByRole("listbox")
      .find((element) => element.getAttribute("data-slot") === "select-content");
    expect(selectListbox).toBeTruthy();
    return selectListbox as HTMLElement;
  });
  const option = within(listbox).getByRole("option", { name: optionName });
  fireEvent.pointerDown(option, { button: 0, ctrlKey: false });
  fireEvent.pointerUp(option, { button: 0, ctrlKey: false });
  fireEvent.click(option);
  await waitFor(() => {
    expect(combobox).toHaveTextContent(optionName);
  });
}

function getSelectTrigger(name: string) {
  // Radix portals can make jsdom's role-name traversal use a non-Document root in CI.
  const trigger = Array.from(
    document.querySelectorAll<HTMLElement>('button[role="combobox"]'),
  ).find((element) => element.getAttribute("aria-label") === name);
  if (!trigger) {
    throw new Error(`Select trigger not found: ${name}`);
  }
  return trigger;
}

async function findSelectTrigger(name: string) {
  return waitFor(() => {
    const trigger = Array.from(
      document.querySelectorAll<HTMLElement>('button[role="combobox"]'),
    ).find((element) => element.getAttribute("aria-label") === name);
    if (!trigger) {
      throw new Error(`Select trigger not found: ${name}`);
    }
    return trigger;
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createAuthMeResponse() {
  return new Response(
    JSON.stringify({
      user: {
        id: "e91237c8-5ccf-45aa-b0d2-822b96915a24",
        email: "new-student@example.edu",
        displayName: "new-student",
        status: "active",
        emailVerified: true,
        mfaEnabled: accountMfaEnabled,
      },
      mfa: { enabled: accountMfaEnabled, enforcement: "totp" },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function createProjectListResponse() {
  return new Response(
    JSON.stringify({
      projects: [
        {
          id: "library-booking",
          name: "智慧图书馆预约系统",
          description: "真实项目数据",
          visibility: "team",
          status: "active",
          ownerUserId: "e91237c8-5ccf-45aa-b0d2-822b96915a24",
          ownerDisplayName: "New Student",
          ownerAvatarUrl: null,
          createdAt: "2026-05-22T01:00:00.000Z",
          updatedAt: projectUpdatedAt,
          lastGeneratedAt: "2026-05-22T02:05:00.000Z",
          memberCount: 4,
        },
      ],
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function createProjectOverviewResponse() {
  return new Response(
    JSON.stringify({
      project: {
        id: "library-booking",
        name: "智慧图书馆预约系统",
        description: "真实项目数据",
        visibility: "team",
        status: "active",
        ownerUserId: "e91237c8-5ccf-45aa-b0d2-822b96915a24",
        ownerDisplayName: "New Student",
        ownerAvatarUrl: null,
        createdAt: "2026-05-22T01:00:00.000Z",
        updatedAt: projectUpdatedAt,
        lastGeneratedAt: "2026-05-22T02:05:00.000Z",
        memberCount: 4,
      },
      membership: {
        id: "member-owner",
        projectId: "library-booking",
        userId: "e91237c8-5ccf-45aa-b0d2-822b96915a24",
        email: "new-student@example.edu",
        displayName: "New Student",
        role: "owner",
        status: "active",
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function flushResolvedPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function advanceTimersByTime(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await flushResolvedPromises();
  });
}

async function waitForPlatformLoadingToExit() {
  await waitFor(() => {
    const loadingScreen = screen.queryByTestId("platform-loading-screen");
    if (loadingScreen) {
      expect(loadingScreen).toHaveClass("pointer-events-none");
    } else {
      expect(loadingScreen).not.toBeInTheDocument();
    }
  });
}

describe("App shell routes", () => {
  beforeEach(async () => {
    projectApiMode = "unauthenticated";
    caseProjectApiMode = "success";
    projectMembershipRole = "owner";
    loginApiMode = "failure";
    authSessionMode = "authenticated";
    accountMfaEnabled = false;
    providerConfigFixtures = [
      {
        id: "provider-config-1",
        name: "课程 OpenAI 托管配置",
        provider: "openai",
        baseUrl: "https://api.openai.example",
        defaultModel: "gpt-5.5",
        allowedModels: ["gpt-5.5", "gpt-5.4"],
        maskedKey: "••••••••a91f",
        status: "active",
        riskState: "low",
        quota: "unlimited",
        lastUsedAt: null,
        scopeType: "organization",
        scopeId: "course-uml",
        breakerState: "closed",
      },
    ];
    Object.defineProperty(Element.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => false),
    });
    Object.defineProperty(Element.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:app-export"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    HTMLAnchorElement.prototype.click = vi.fn();
    HTMLFormElement.prototype.submit = vi.fn();
    window.history.pushState({}, "", "/");
    localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
    localStorage.removeItem(USER_SETTINGS_STORAGE_KEY);
    localStorage.removeItem("uml-auth-remembered-email");
    localStorage.removeItem("uml-auth-remembered-password");
    await i18n.changeLanguage("zh-CN");
    document.documentElement.lang = "zh-CN";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://127.0.0.1:4001");
        const pathname = url.pathname;
        const method = init?.method ?? "GET";
        if (pathname === "/api/auth/login" && loginApiMode === "mfa-challenge") {
          return new Response(
            JSON.stringify({
              mfaChallenge: {
                challengeId: "challenge-login-1",
                expiresAt: "2026-05-22T02:10:00.000Z",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/auth/login" && loginApiMode === "success") {
          return new Response(
            JSON.stringify({
              user: {
                id: "user-new",
                email: "new-student@example.edu",
                displayName: "new-student",
                status: "active",
                emailVerified: true,
                mfaEnabled: false,
              },
              session: { id: "session-login" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/auth/login" && loginApiMode === "email-unverified") {
          return new Response(
            JSON.stringify({ message: "Email verification is required before login" }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/auth/login") {
          return new Response(JSON.stringify({ message: "Invalid email or password" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/auth/mfa/verify") {
          return new Response(
            JSON.stringify({
              user: {
                id: "user-new",
                email: "new-student@example.edu",
                displayName: "new-student",
                status: "active",
                emailVerified: true,
                mfaEnabled: true,
              },
              session: { id: "session-mfa" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/auth/register") {
          return new Response(
            JSON.stringify({
              user: {
                id: "user-new",
                email: "new-student@example.edu",
                displayName: "new-student",
                status: "active",
                emailVerified: true,
                mfaEnabled: accountMfaEnabled,
              },
              session: { id: "session-new" },
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/auth/verify-email") {
          return new Response(JSON.stringify({ message: "Email verified" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/auth/resend-verification") {
          return new Response(JSON.stringify({ message: "Verification email sent" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/auth/forgot-password") {
          return new Response(JSON.stringify({ message: "Reset email sent" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/auth/reset-password") {
          return new Response(JSON.stringify({ message: "Password reset" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/auth/me") {
          if (authSessionMode === "offline") {
            throw new TypeError("Failed to fetch");
          }
          if (authSessionMode === "unauthenticated") {
            return new Response(JSON.stringify({ message: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({
              user: {
                id: "e91237c8-5ccf-45aa-b0d2-822b96915a24",
                email: "new-student@example.edu",
                displayName: "new-student",
                status: "active",
                emailVerified: true,
                mfaEnabled: accountMfaEnabled,
              },
              mfa: { enabled: accountMfaEnabled, enforcement: "totp" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/auth/logout") {
          authSessionMode = "unauthenticated";
          return new Response(null, { status: 204 });
        }
        if (pathname === "/api/account/profile" && method === "GET") {
          return new Response(
            JSON.stringify({
              user: {
                id: "user-new",
                email: "new-student@example.edu",
                displayName: "new-student",
                avatarUrl: "https://cdn.example.edu/avatar.png",
                status: "active",
                emailVerified: true,
                mfaEnabled: accountMfaEnabled,
              },
              mfa: { enabled: accountMfaEnabled, enforcement: "totp" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/account/profile" && method === "PATCH") {
          return new Response(
            JSON.stringify({
              user: {
                id: "user-new",
                email: "new-student@example.edu",
                displayName: "课程助教",
                avatarUrl: "https://cdn.example.edu/ta.png",
                status: "active",
                emailVerified: true,
                mfaEnabled: accountMfaEnabled,
              },
              mfa: { enabled: accountMfaEnabled, enforcement: "totp" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/account/sessions") {
          return new Response(
            JSON.stringify({
              sessions: [
                {
                  id: "session-current",
                  userId: "user-new",
                  createdAt: "2026-05-22T01:00:00.000Z",
                  expiresAt: "2026-05-29T01:00:00.000Z",
                  lastSeenAt: "2026-05-22T02:00:00.000Z",
                  ipAddress: "127.0.0.1",
                  userAgent: "Chrome on Windows",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/account/login-events") {
          return new Response(
            JSON.stringify({
              events: [
                {
                  id: "login-1",
                  userId: "user-new",
                  email: "new-student@example.edu",
                  outcome: "success",
                  ipAddress: "127.0.0.1",
                  userAgent: "Chrome on Windows",
                  message: "Login succeeded",
                  createdAt: "2026-05-22T02:00:00.000Z",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/account/mfa/setup") {
          return new Response(
            JSON.stringify({
              secret: "JBSWY3DPEHPK3PXP",
              otpauthUri:
                "otpauth://totp/UML:new-student@example.edu?secret=JBSWY3DPEHPK3PXP&issuer=UML",
              expiresAt: "2026-05-22T02:15:00.000Z",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/account/mfa/confirm") {
          accountMfaEnabled = true;
          return new Response(
            JSON.stringify({
              mfa: { enabled: true, enforcement: "totp" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/account/mfa") {
          accountMfaEnabled = false;
          return new Response(
            JSON.stringify({
              mfa: { enabled: false, enforcement: "totp" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/billing/skus") {
          return new Response(JSON.stringify({ skus: billingTestSkus }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/billing/summary") {
          return new Response(
            JSON.stringify({
              creditBalance: 10,
              signupBonus: {
                granted: true,
                creditAmount: 5,
                validUntil: "2026-07-05T04:00:00.000Z",
              },
              recentOrders: [billingTestOrder],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/billing/orders" && method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            skuCode?: string;
            channel?: "alipay";
          };
          const sku = billingTestSkus.find((candidate) => candidate.code === body.skuCode) ?? billingPrimarySku;
          const order = {
            ...billingTestOrder,
            sku,
            amountCents: sku.amountCents,
            channel: body.channel ?? "alipay",
          };
          return new Response(
            JSON.stringify({
              orderId: order.orderId,
              merchantOrderNo: order.merchantOrderNo,
              status: order.status,
              amountCents: order.amountCents,
              currency: order.currency,
              expiresAt: order.expiresAt,
              channel: order.channel,
              paymentFormHtml: "<form action=\"https://zpayz.cn/submit.php\"><button>pay</button></form>",
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname.startsWith("/api/billing/orders/") && method === "GET") {
          return new Response(JSON.stringify(billingTestOrder), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/invitations/course-token-123/accept") {
          return new Response(
            JSON.stringify({ message: "Invitation accepted" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/invitations/invite-token-123" && method === "GET") {
          return new Response(
            JSON.stringify({
              invitation: {
                id: "invitation-123",
                projectId: "library-booking",
                email: "invitee@example.edu",
                role: "editor",
                status: "invited",
                invitedAt: "2026-05-22T02:00:00.000Z",
                expiresAt: "2026-05-29T02:00:00.000Z",
                project: {
                  id: "library-booking",
                  name: "智慧图书馆预约系统",
                  description: "真实项目数据",
                  visibility: "team",
                  status: "active",
                  ownerUserId: "user-owner",
                  createdAt: "2026-05-22T01:00:00.000Z",
                  updatedAt: projectUpdatedAt,
                },
              },
              expiresAt: "2026-05-29T02:00:00.000Z",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/invitations/invite-token-123/accept" && method === "POST") {
          return new Response(
            JSON.stringify({
              message: "Invitation accepted",
              member: {
                id: "member-invitee",
                projectId: "library-booking",
                userId: "user-new",
                email: "invitee@example.edu",
                displayName: "invitee",
                role: "editor",
                status: "active",
                invitedByUserId: "user-owner",
                invitedAt: "2026-05-22T02:00:00.000Z",
                joinedAt: "2026-05-22T02:05:00.000Z",
                createdAt: "2026-05-22T02:00:00.000Z",
                updatedAt: "2026-05-22T02:05:00.000Z",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/account/sessions/revoke-others") {
          return new Response(JSON.stringify({ revokedCount: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname.startsWith("/api/cases/") && pathname.endsWith("/project") && method === "POST") {
          if (caseProjectApiMode === "failure") {
            return new Response(JSON.stringify({ message: "案例项目创建失败" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          const caseId = pathname.split("/")[3] ?? "case";
          const caseTitleById: Record<string, string> = {
            "lab-booking": "实验室预约系统",
            "order-management": "订单管理系统",
            "device-monitoring": "设备监控系统",
            "library-lending": "图书馆借阅系统",
          };
          return new Response(
            JSON.stringify({
              project: {
                id: `case-project-${caseId}`,
                name: `${caseTitleById[caseId] ?? "案例"} 示例项目`,
                description: "案例生成项目",
                visibility: "private",
                status: "active",
                ownerUserId: "user-new",
                createdAt: "2026-06-26T00:00:00.000Z",
                updatedAt: "2026-06-26T00:00:00.000Z",
              },
              membership: {
                id: "member-case-owner",
                projectId: `case-project-${caseId}`,
                userId: "user-new",
                email: "new-student@example.edu",
                displayName: "new-student",
                role: "owner",
                status: "active",
              },
              currentUserRole: "owner",
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (
          pathname.startsWith("/api/projects/case-project-") &&
          pathname.split("/").length === 4 &&
          method === "GET"
        ) {
          const projectId = pathname.split("/")[3] ?? "case-project";
          return new Response(
            JSON.stringify({
              project: {
                id: projectId,
                name: "案例示例项目",
                description: "案例生成项目",
                visibility: "private",
                status: "active",
                ownerUserId: "user-new",
                createdAt: "2026-06-26T00:00:00.000Z",
                updatedAt: "2026-06-26T00:00:00.000Z",
              },
              membership: {
                id: "member-case-owner",
                projectId,
                userId: "user-new",
                email: "new-student@example.edu",
                displayName: "new-student",
                role: projectMembershipRole,
                status: "active",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects" && method === "GET" && projectApiMode === "authenticated") {
          return new Response(
            JSON.stringify({
              projects: [
                {
                  id: "library-booking",
                  name: "智慧图书馆预约系统",
                  description: "真实项目数据",
                  visibility: "team",
                  status: "active",
                  ownerUserId: "e91237c8-5ccf-45aa-b0d2-822b96915a24",
                  ownerDisplayName: "New Student",
                  ownerAvatarUrl: null,
                  createdAt: "2026-05-22T01:00:00.000Z",
                  updatedAt: projectUpdatedAt,
                  lastGeneratedAt: "2026-05-22T02:05:00.000Z",
                  memberCount: 4,
                  memberPreviews: [
                    {
                      id: "member-owner",
                      userId: "e91237c8-5ccf-45aa-b0d2-822b96915a24",
                      displayName: "New Student",
                      avatarUrl: null,
                      role: "owner",
                      status: "active",
                    },
                    {
                      id: "member-editor",
                      userId: "editor-1",
                      displayName: "Editor User",
                      avatarUrl: null,
                      role: "editor",
                      status: "active",
                    },
                    {
                      id: "member-viewer",
                      userId: "viewer-1",
                      displayName: "Viewer User",
                      avatarUrl: null,
                      role: "viewer",
                      status: "active",
                    },
                  ],
                },
                {
                  id: "archived-demo",
                  name: "归档课程演示",
                  description: "已经归档的真实项目",
                  visibility: "private",
                  status: "archived",
                  ownerUserId: "teacher-1",
                  createdAt: "2026-05-21T01:00:00.000Z",
                  updatedAt: "2026-05-21T03:00:00.000Z",
                  lastGeneratedAt: null,
                  memberCount: 1,
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects" && method === "GET" && projectApiMode === "empty") {
          return new Response(JSON.stringify({ projects: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/projects" && method === "GET" && projectApiMode === "offline") {
          throw new TypeError("Failed to fetch");
        }
        if (pathname === "/api/projects" && method === "GET") {
          return new Response(JSON.stringify({ message: "Authentication required" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/projects/library-booking" && projectApiMode === "forbidden") {
          return new Response(JSON.stringify({ message: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/projects/library-booking") {
          return new Response(
            JSON.stringify({
              project: {
                id: "library-booking",
                name: "智慧图书馆预约系统",
                description: "真实项目数据",
                visibility: "team",
                status: "active",
                ownerUserId: "user-new",
                createdAt: "2026-05-22T01:00:00.000Z",
                updatedAt: projectUpdatedAt,
              },
              membership: {
                id: "member-owner",
                projectId: "library-booking",
                userId: "user-new",
                email: "new-student@example.edu",
                displayName: "new-student",
                role: projectMembershipRole,
                status: "active",
                invitedByUserId: null,
                invitedAt: null,
                joinedAt: "2026-05-22T01:00:00.000Z",
                createdAt: "2026-05-22T01:00:00.000Z",
                updatedAt: "2026-05-22T01:00:00.000Z",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/members") {
          return new Response(
            JSON.stringify({
              members: [
                {
                  id: "member-owner",
                  projectId: "library-booking",
                  userId: "user-new",
                  email: "new-student@example.edu",
                  displayName: "new-student",
                  avatarUrl: "https://cdn.example.edu/new-student.png",
                  role: "owner",
                  status: "active",
                  invitedByUserId: null,
                  invitedAt: null,
                  joinedAt: "2026-05-22T01:00:00.000Z",
                  createdAt: "2026-05-22T01:00:00.000Z",
                  updatedAt: "2026-05-22T01:00:00.000Z",
                },
                {
                  id: "member-analyst",
                  projectId: "library-booking",
                  userId: "a3023f76-6da3-4fcd-9a82-8a187c30691d",
                  email: "analyst@example.edu",
                  displayName: "需求分析师",
                  avatarUrl: null,
                  role: "editor",
                  status: "active",
                  invitedByUserId: "user-new",
                  invitedAt: "2026-05-22T01:00:00.000Z",
                  joinedAt: "2026-05-22T01:30:00.000Z",
                  createdAt: "2026-05-22T01:00:00.000Z",
                  updatedAt: "2026-05-22T01:30:00.000Z",
                },
                {
                  id: "member-viewer",
                  projectId: "library-booking",
                  userId: null,
                  email: "viewer@example.edu",
                  displayName: null,
                  role: "viewer",
                  status: "invited",
                  invitedByUserId: "user-new",
                  invitedAt: "2026-05-22T01:00:00.000Z",
                  joinedAt: null,
                  createdAt: "2026-05-22T01:00:00.000Z",
                  updatedAt: "2026-05-22T01:00:00.000Z",
                },
                {
                  id: "member-editor",
                  projectId: "library-booking",
                  userId: "user-editor",
                  email: "editor-active@example.edu",
                  displayName: "editor-active",
                  role: "editor",
                  status: "active",
                  invitedByUserId: "user-new",
                  invitedAt: "2026-05-22T01:00:00.000Z",
                  joinedAt: "2026-05-22T01:30:00.000Z",
                  createdAt: "2026-05-22T01:00:00.000Z",
                  updatedAt: "2026-05-22T01:30:00.000Z",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/invitations" && method === "POST") {
          return new Response(
            JSON.stringify({
              invitation: {
                id: "invitation-editor",
                projectId: "library-booking",
                email: "editor@example.edu",
                role: "editor",
                status: "invited",
                invitedAt: "2026-05-22T02:30:00.000Z",
                expiresAt: "2026-05-29T02:30:00.000Z",
              },
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/invitations/member-viewer/resend") {
          return new Response(
            JSON.stringify({
              invitation: {
                id: "member-viewer",
                projectId: "library-booking",
                email: "viewer@example.edu",
                role: "viewer",
                status: "invited",
                invitedAt: "2026-05-22T02:40:00.000Z",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/invitations/member-viewer/revoke") {
          return new Response(JSON.stringify({ message: "revoked" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (pathname === "/api/projects/library-booking/invitations/member-viewer" && method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        if (pathname === "/api/projects/library-booking/members/member-viewer" && method === "PATCH") {
          return new Response(
            JSON.stringify({
              member: {
                id: "member-viewer",
                projectId: "library-booking",
                userId: null,
                email: "viewer@example.edu",
                displayName: null,
                role: "editor",
                status: "invited",
                invitedAt: "2026-05-22T01:00:00.000Z",
                joinedAt: null,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/members/member-editor" && method === "PATCH") {
          return new Response(
            JSON.stringify({
              member: {
                id: "member-editor",
                projectId: "library-booking",
                userId: "user-editor",
                email: "editor-active@example.edu",
                displayName: "editor-active",
                role: "viewer",
                status: "active",
                invitedAt: "2026-05-22T01:00:00.000Z",
                joinedAt: "2026-05-22T01:30:00.000Z",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/members/member-viewer" && method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        if (pathname === "/api/projects/library-booking/members/member-editor" && method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        if (pathname === "/api/projects/library-booking/runs") {
          return new Response(
            JSON.stringify({
              projectId: "library-booking",
              generatedAt: "2026-05-22T02:00:00.000Z",
              runs: [
                {
                  runId: "run-1",
                  status: "running",
                  stage: "render_svg",
                  runKind: "requirements",
                  model: "gpt-5.5",
                  createdByUserId: "a3023f76-6da3-4fcd-9a82-8a187c30691d",
                  createdAt: "2026-05-22T02:00:00.000Z",
                  updatedAt: "2026-05-22T02:05:00.000Z",
                  errorMessage: null,
                },
                {
                  runId: "run-failed",
                  status: "failed",
                  stage: "render_svg",
                  runKind: "design",
                  model: "gpt-5.5",
                  createdByUserId: "bbbbbbbb-6da3-4fcd-9a82-8a187c30691d",
                  createdAt: "2026-05-22T01:00:00.000Z",
                  updatedAt: "2026-05-22T01:05:00.000Z",
                  errorMessage: "PlantUML render failed",
                },
                {
                  runId: "run-doc",
                  status: "completed",
                  stage: "generate_document_text",
                  runKind: "document",
                  documentKind: "requirementsSpec",
                  model: "gpt-5.5",
                  createdByUserId: "teacher-1",
                  createdAt: "2026-05-22T00:00:00.000Z",
                  updatedAt: "2026-05-22T00:05:00.000Z",
                  errorMessage: null,
                },
                {
                  runId: "run-doc-failed",
                  status: "failed",
                  stage: "render_document_file",
                  runKind: "document",
                  documentKind: "requirementsSpec",
                  model: "gpt-5.5",
                  createdByUserId: "teacher-1",
                  createdAt: "2026-05-21T23:00:00.000Z",
                  updatedAt: "2026-05-21T23:05:00.000Z",
                  errorMessage: "证据包组装失败",
                  documentDownloadAvailable: true,
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/runs/run-1/cancel") {
          return new Response(
            JSON.stringify({
              action: "cancel",
              sourceRunId: "run-1",
              runId: "run-1",
              status: "cancelled",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/runs/run-1/retry") {
          return new Response(
            JSON.stringify({
              action: "retry",
              sourceRunId: "run-1",
              runId: "run-retry-1",
              status: "queued",
            }),
            {
              status: 202,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/runs/run-1/rerun") {
          return new Response(
            JSON.stringify({
              action: "rerun",
              sourceRunId: "run-1",
              runId: "run-rerun-1",
              status: "queued",
            }),
            {
              status: 202,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/runs/run-failed/retry") {
          return new Response(
            JSON.stringify({
              action: "retry",
              sourceRunId: "run-failed",
              runId: "run-retry-failed",
              status: "queued",
            }),
            {
              status: 202,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/runs/run-failed/rerun") {
          return new Response(
            JSON.stringify({
              action: "rerun",
              sourceRunId: "run-failed",
              runId: "run-rerun-failed",
              status: "queued",
            }),
            {
              status: 202,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/runs/run-doc/rerun") {
          return new Response(
            JSON.stringify({
              action: "rerun",
              sourceRunId: "run-doc",
              runId: "run-rerun-doc",
              status: "queued",
            }),
            {
              status: 202,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (
          (pathname === "/api/projects/library-booking/runs/run-failed" ||
            pathname === "/api/projects/library-booking/runs/run-doc") &&
          method === "DELETE"
        ) {
          return new Response(null, { status: 204 });
        }
        if (pathname === "/api/projects/library-booking/documents") {
          return new Response(
            JSON.stringify({
              documents: [
                {
                  id: "doc-1",
                  workspaceId: "workspace-project",
                  projectId: "library-booking",
                  createdByUserId: "user-new",
                  documentKind: "requirementsSpec",
                  title: "需求规格说明书",
                  fileName: "requirements.docx",
                  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  byteLength: 1234,
                  version: 2,
                  status: "active",
                  onlyOffice: {
                    status: "editing",
                    lockedBy: "teacher@example.edu",
                    lockedAt: "2026-05-22T02:01:00.000Z",
                  },
                  editLock: {
                    status: "locked",
                    lockedBy: "teacher@example.edu",
                    lockedAt: "2026-05-22T02:01:00.000Z",
                  },
                  download: { status: "available" },
                  sourceRunId: "run-1",
                  createdAt: "2026-05-22T01:00:00.000Z",
                  updatedAt: "2026-05-22T02:00:00.000Z",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/documents/doc-1/versions") {
          return new Response(
            JSON.stringify({
              versions: [
                {
                  version: 2,
                  fileName: "requirements.docx",
                  byteLength: 1234,
                  createdAt: "2026-05-22T02:00:00.000Z",
                  projectId: "library-booking",
                },
                {
                  version: 1,
                  fileName: "requirements-v1.docx",
                  byteLength: 1000,
                  createdAt: "2026-05-22T01:00:00.000Z",
                  projectId: "library-booking",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/documents/doc-1/download") {
          return new Response(new Blob(["docx"]), {
            status: 200,
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "Content-Disposition": "attachment; filename*=UTF-8''requirements.docx",
            },
          });
        }
        if (pathname === "/api/projects/library-booking/documents/doc-1" && method === "PATCH") {
          return new Response(
            JSON.stringify({
              document: {
                id: "doc-1",
                projectId: "library-booking",
                title: "需求规格说明书-改名",
                fileName: "requirements-renamed.docx",
                version: 3,
                status: "active",
                updatedAt: "2026-05-22T02:30:00.000Z",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects/library-booking/documents/doc-1" && method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        if (pathname === "/api/projects/library-booking/documents/doc-1/restore") {
          return new Response(
            JSON.stringify({
              document: {
                id: "doc-1",
                projectId: "library-booking",
                title: "需求规格说明书-改名",
                fileName: "requirements-renamed.docx",
                version: 3,
                status: "active",
                updatedAt: "2026-05-22T02:35:00.000Z",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/academic-options") {
          return new Response(
            JSON.stringify({
              organizations: [
                { id: "org-software-school", name: "软件学院", code: "SSE", status: "active" },
              ],
              courses: [
                {
                  id: "course-software-2026-spring",
                  organizationId: "org-software-school",
                  name: "软件工程 2026 春",
                  code: "SE2026",
                  term: "2026 春",
                  status: "active",
                },
              ],
              classes: [
                {
                  id: "class-software-2026-spring-1",
                  courseId: "course-software-2026-spring",
                  name: "1 班",
                  code: "01",
                  status: "active",
                },
              ],
              teams: [
                {
                  id: "team-software-2026-a",
                  classId: "class-software-2026-spring-1",
                  name: "Team A",
                  code: "A",
                  status: "active",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/provider-configs") {
          return new Response(
            JSON.stringify({
              generatedAt: "2026-05-22T02:00:00.000Z",
              providerConfigs: providerConfigFixtures,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/provider-configs/provider-config-1/test") {
          return new Response(
            JSON.stringify({ ok: true, message: "Provider config ok" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (pathname === "/api/projects" && method === "POST") {
          return new Response(
            JSON.stringify({
              project: {
                id: "created-project",
                name: "课程 UML 实验项目",
                description: null,
                visibility: "team",
                status: "active",
                ownerUserId: "user-new",
                updatedAt: new Date().toISOString(),
              },
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify({ message: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  });

  it("renders the marketing site on the root route for signed-out visitors", async () => {
    authSessionMode = "unauthenticated";
    const view = render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(
      await screen.findByRole("heading", {
        name: "让需求、UML模型、原型和说明书一站式生成",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("输入需求文本，平台辅助生成需求规则、UML模型、React 原型与实训说明书。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "功能特性" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "使用流程" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "案例展示" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "定价" })).not.toBeInTheDocument();
    expect(screen.getByText("UML 建模")).toBeInTheDocument();
    expect(screen.getByText("设计推导")).toBeInTheDocument();
    expect(screen.getByText("React 原型")).toBeInTheDocument();
    expect(screen.getByText("说明书导出")).toBeInTheDocument();
    expect(screen.getByText("追踪审查")).toBeInTheDocument();
    expect(screen.queryByText("需求建模")).not.toBeInTheDocument();
    expect(screen.getByText("ISO/IEC")).toBeInTheDocument();
    expect(screen.getByText("IEEE")).toBeInTheDocument();
    expect(screen.getByText("INCOSE")).toBeInTheDocument();
    expect(screen.getByText("CMMI")).toBeInTheDocument();
    const mockupTitle = screen.getByText("图书馆借阅系统");
    expect(mockupTitle).toBeInTheDocument();
    expect(mockupTitle).toHaveClass("truncate");
    expect(screen.getByTestId("marketing-mockup-main-card")).toHaveClass("overflow-hidden", "p-5", "md:p-10");
    expect(screen.getByTestId("marketing-mockup-status-dots")).toHaveClass("shrink-0");
    expect(screen.getByText("需求报告")).toBeInTheDocument();
    expect(screen.getByText("UML 预览")).toBeInTheDocument();
    expect(screen.getByText("正在生成 UML...")).toBeInTheDocument();
    expect(screen.queryByText("可信锚点")).not.toBeInTheDocument();
    expect(screen.queryByText("可信生成链路")).not.toBeInTheDocument();
    expect(screen.queryByText("结构化需求基线")).not.toBeInTheDocument();
    expect(screen.getByTestId("marketing-cta-row")).toHaveClass("grid-cols-2");
    expect(screen.getByTestId("marketing-trust-row")).toHaveClass("grid-cols-5");
    expect(screen.getByTestId("marketing-standards-row")).toHaveClass("grid-cols-4");
    expect(screen.getByRole("button", { name: "开始生成" })).toHaveClass(
      "h-12",
      "min-w-0",
      "justify-center",
      "text-[15px]",
    );
    expect(screen.getByRole("button", { name: "查看平台介绍" })).toHaveClass(
      "h-12",
      "min-w-0",
      "justify-center",
      "text-[15px]",
    );
    expect(screen.queryByRole("button", { name: "查看产品宣传" })).not.toBeInTheDocument();
    expect(view.container).not.toHaveTextContent("产品");
    expect(view.container.querySelector('[aria-label*="产品"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看案例项目" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "注册" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
  });

  it("shows the shared language menu on the public marketing header", async () => {
    const user = userEvent.setup();
    authSessionMode = "unauthenticated";
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.click(await screen.findByRole("button", { name: "切换界面语言" }));
    await user.click(screen.getByRole("menuitem", { name: /English/u }));

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en");
    });
    expect(screen.getByRole("button", { name: "Change interface language" })).toBeInTheDocument();
  });

  it("opens the marketing promo video without navigating away from the home page", async () => {
    const user = userEvent.setup();
    authSessionMode = "unauthenticated";
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.click(await screen.findByRole("button", { name: "查看平台介绍" }));

    expect(window.location.pathname).toBe("/");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass(
      "w-[min(1120px,calc(100vw-2rem))]",
      "!max-w-none",
      "border-0",
      "bg-transparent",
      "p-0",
      "shadow-none",
    );
    expect(screen.getByRole("heading", { name: "查看平台介绍" })).toHaveClass("sr-only");
    const promoVideo = screen.getByLabelText("软件工程实践平台介绍视频");
    expect(dialog).toContainElement(screen.getByTestId("video-player"));
    expect(dialog.querySelector('[data-slot="dialog-header"]')).not.toBeInTheDocument();
    expect(
      screen.getByText("通过短片了解软件工程实践平台如何串联需求、模型、原型和说明书证据。"),
    ).toHaveClass("sr-only");
    expect(screen.getByTestId("video-player")).toHaveTextContent("平台介绍视频");
    expect(dialog).not.toHaveTextContent("产品");
    expect(dialog.querySelector('[aria-label*="产品"]')).not.toBeInTheDocument();
    expect(promoVideo.querySelector("source")).toHaveAttribute(
      "src",
      "https://guolola.oss-cn-hangzhou.aliyuncs.com/video/trusted-chain-evidence-film.mp4",
    );
    expect(promoVideo).toHaveAttribute("autoplay");
  });

  it("sends signed-out marketing visitors to login when starting generation", async () => {
    const user = userEvent.setup();
    authSessionMode = "unauthenticated";
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.click(await screen.findByRole("button", { name: "开始生成" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
    });
    expect(await screen.findByRole("heading", { name: "登录" })).toBeInTheDocument();
  });

  it("shows only the account action on the marketing home page for signed-in users", async () => {
    authSessionMode = "authenticated";
    render(withWorkspaceProviders(<Shell />, createRepository()));

    const accountButton = await screen.findByRole("button", { name: "账号" });
    expect(accountButton).toBeInTheDocument();
    expect(accountButton).toHaveClass("inline-flex", "size-10", "md:w-auto");
    expect(accountButton).not.toHaveClass("hidden");
    expect(screen.queryByRole("button", { name: "项目首页" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登录" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "注册" })).not.toBeInTheDocument();
  });

  it("routes signed-in marketing actions to the projects area", async () => {
    const user = userEvent.setup();
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.click(await screen.findByRole("button", { name: "开始生成" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects");
    });
    expect(await screen.findByRole("heading", { name: "项目首页" })).toBeInTheDocument();
  });

  it("renders marketing tabs as independent routes from the Figma frames", async () => {
    const routeCases = [
      {
        path: "/features",
        heading: "阶段化 AI 辅助的软件工程实验室",
        active: "功能特性",
        text: "可信需求基线",
      },
      {
        path: "/workflow",
        heading: "智能研发实验全链路",
        active: "使用流程",
        text: "确认需求基线",
      },
      {
        path: "/cases",
        heading: "探索工程验证案例",
        active: "案例展示",
        text: "实验室预约系统",
      },
    ];

    for (const routeCase of routeCases) {
      window.history.pushState({}, "", routeCase.path);
      const view = render(withWorkspaceProviders(<Shell />, createRepository()));

      expect(
        await screen.findByRole("heading", { name: routeCase.heading }),
      ).toBeInTheDocument();
      expect(screen.getByText(routeCase.text)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: routeCase.active })).toHaveAttribute(
        "aria-current",
        "page",
      );
      if (routeCase.path === "/cases") {
        expect(screen.getAllByText("预置可行性分析")).toHaveLength(4);
        expect(screen.getAllByText("系统上下文图（系统环境图）")).toHaveLength(4);
        expect(screen.getAllByText("两套候选实现方案")).toHaveLength(4);
      }
      expect(screen.queryByText("项目导航")).not.toBeInTheDocument();

      view.unmount();
    }
  });

  it("creates a completed sample project from each marketing case button", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const cases = [
      { id: "lab-booking", title: "实验室预约系统" },
      { id: "order-management", title: "订单管理系统" },
      { id: "device-monitoring", title: "设备监控系统" },
      { id: "library-lending", title: "图书馆借阅系统" },
    ];

    for (const [index, caseItem] of cases.entries()) {
      window.history.pushState({}, "", "/cases");
      const view = render(withWorkspaceProviders(<Shell />, createRepository()));

      expect(await screen.findByRole("heading", { name: "探索工程验证案例" })).toBeInTheDocument();
      const caseButtons = screen.getAllByRole("button", { name: "查看案例" });
      expect(caseButtons).toHaveLength(4);
      expect(screen.getByText(caseItem.title)).toBeInTheDocument();
      await waitFor(() => {
        expect(caseButtons[index]).toBeEnabled();
      });

      await user.click(caseButtons[index]!);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(`/api/cases/${caseItem.id}/project`),
          expect.objectContaining({ method: "POST" }),
        );
        expect(window.location.pathname).toBe(`/projects/case-project-${caseItem.id}`);
      });
      view.unmount();
    }
  });

  it("routes unauthenticated users to login with a case creation redirect", async () => {
    const user = userEvent.setup();
    authSessionMode = "unauthenticated";

    window.history.pushState({}, "", "/cases");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    const button = (await screen.findAllByRole("button", { name: "查看案例" }))[0]!;
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    await user.click(button);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
      expect(new URLSearchParams(window.location.search).get("redirect")).toBe(
        "/cases?createCase=lab-booking",
      );
    });
  });

  it("shows a retryable error when marketing case project creation fails", async () => {
    const user = userEvent.setup();
    caseProjectApiMode = "failure";
    authSessionMode = "authenticated";

    window.history.pushState({}, "", "/cases");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    const button = (await screen.findAllByRole("button", { name: "查看案例" }))[0]!;
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("服务暂时不可用，请稍后重试。");
    expect(screen.getAllByRole("button", { name: "查看案例" })[0]).toBeEnabled();
    expect(window.location.pathname).toBe("/cases");
  });

  it("continues case project creation after login redirect returns to cases", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    loginApiMode = "success";
    projectApiMode = "authenticated";
    authSessionMode = "authenticated";
    window.history.pushState({}, "", "/login?redirect=%2Fcases%3FcreateCase%3Dlab-booking");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.type(await screen.findByLabelText("邮箱或用户名"), "student@example.edu");
    await user.type(screen.getByLabelText("密码"), "StrongPass123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/cases/lab-booking/project"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(window.location.pathname).toBe("/projects/case-project-lab-booking");
    });
  });

  it("does not render the removed feature and workflow eyebrow labels", async () => {
    window.history.pushState({}, "", "/features");
    const featuresView = render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(
      await screen.findByRole("heading", {
        name: "阶段化 AI 辅助的软件工程实验室",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("核心能力引擎 v2.0")).not.toBeInTheDocument();
    featuresView.unmount();

    window.history.pushState({}, "", "/workflow");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(
      await screen.findByRole("heading", { name: "智能研发实验全链路" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("标准化工作流")).not.toBeInTheDocument();
  });

  it("keeps marketing copy aligned with currently implemented capabilities", async () => {
    window.history.pushState({}, "", "/features");
    const featuresView = render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(
      await screen.findByRole("heading", {
        name: "阶段化 AI 辅助的软件工程实验室",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/深度学习/)).not.toBeInTheDocument();
    expect(screen.queryByText(/端到端智能化/)).not.toBeInTheDocument();
    expect(screen.queryByText(/任意需求全自动正确/)).not.toBeInTheDocument();
    expect(screen.queryByText(/高密度、高清晰度/)).not.toBeInTheDocument();
    expect(screen.queryByText(/绝对稳定性/)).not.toBeInTheDocument();
    expect(screen.queryByText(/高保真/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Markdown 与 PDF/)).not.toBeInTheDocument();
    featuresView.unmount();

    window.history.pushState({}, "", "/workflow");
    const workflowView = render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(
      await screen.findByRole("heading", { name: "智能研发实验全链路" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/模型准确率/)).not.toBeInTheDocument();
    expect(screen.queryByText(/性能指标/)).not.toBeInTheDocument();
    workflowView.unmount();

    window.history.pushState({}, "", "/cases");
    const casesView = render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByRole("heading", { name: "探索工程验证案例" })).toBeInTheDocument();
    expect(screen.queryByText(/真实的系统构建流程/)).not.toBeInTheDocument();
    expect(screen.queryByText(/后端微服务架构/)).not.toBeInTheDocument();
    expect(screen.queryByText(/异常检测算法/)).not.toBeInTheDocument();
    casesView.unmount();

    window.history.pushState({}, "", "/pricing");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(window.location.pathname).toBe("/pricing");
    expect(await screen.findByRole("heading", { name: "开通 AI 生成权益" })).toBeInTheDocument();
    expect(screen.getByTestId("pricing-payment-page")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "定价" })).not.toBeInTheDocument();
  });

  it("shows the account billing route and keeps payment return available", async () => {
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";

    window.history.pushState({}, "", "/account/billing");
    const billingView = render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(window.location.pathname).toBe("/account/billing");
    expect(await screen.findByTestId("account-billing-dashboard")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "权益与账单" })).toBeInTheDocument();
    billingView.unmount();

    window.history.pushState({}, "", "/billing/alipay/return?orderId=order-test-1");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByTestId("alipay-processing-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "支付宝支付处理中" })).toBeInTheDocument();
  });

  it("marks marketing pages that should fill a desktop viewport separately from the scrolling workflow page", async () => {
    const fitRoutes = ["/features", "/cases"];

    for (const path of fitRoutes) {
      window.history.pushState({}, "", path);
      const view = render(withWorkspaceProviders(<Shell />, createRepository()));

      expect(await screen.findByTestId("marketing-fit-page")).toHaveAttribute(
        "data-fit-mode",
        "viewport",
      );
      expect(screen.getByTestId("marketing-fit-page")).toHaveAttribute(
        "data-motion",
        "marketing-page",
      );
      expect(screen.getByTestId("marketing-footer")).toBeInTheDocument();
      expect(screen.getByTestId("marketing-footer")).toHaveAttribute(
        "data-motion",
        "marketing-footer",
      );

      view.unmount();
    }

    window.history.pushState({}, "", "/");
    const homeView = render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByTestId("marketing-scroll-page")).toHaveAttribute(
      "data-fit-mode",
      "scroll",
    );
    expect(screen.getByTestId("marketing-scroll-page")).toHaveAttribute(
      "data-motion",
      "marketing-page",
    );
    expect(screen.getByTestId("marketing-home-hero")).toHaveAttribute(
      "data-footer-fit",
      "same-viewport",
    );
    expect(screen.queryByText("可信锚点")).not.toBeInTheDocument();
    expect(screen.getByText("追踪审查")).toBeInTheDocument();
    expect(screen.queryByText("需求建模")).not.toBeInTheDocument();
    expect(screen.getByText("ISO/IEC")).toBeInTheDocument();
    expect(screen.queryByTestId("marketing-fit-page")).not.toBeInTheDocument();
    homeView.unmount();

    window.history.pushState({}, "", "/workflow");
    const workflowView = render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByTestId("marketing-scroll-page")).toHaveAttribute(
      "data-fit-mode",
      "scroll",
    );
    expect(screen.getByTestId("marketing-scroll-page")).toHaveAttribute(
      "data-motion",
      "marketing-page",
    );
    expect(screen.getByTestId("workflow-chain-video-section")).toBeInTheDocument();
    const workflowVideo = screen.getByLabelText("可信链路功能演示视频");
    expect(workflowVideo.querySelector("source")).toHaveAttribute(
      "src",
      "https://guolola.oss-cn-hangzhou.aliyuncs.com/video/trusted-chain-demo.mp4",
    );
    expect(screen.getAllByTestId("workflow-motion-card").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("marketing-fit-page")).not.toBeInTheDocument();

    workflowView.unmount();
  });

  it("shows the personal-site introduction in every public marketing footer", async () => {
    const publicRoutes = ["/", "/features", "/workflow", "/cases"];

    for (const path of publicRoutes) {
      window.history.pushState({}, "", path);
      const view = render(withWorkspaceProviders(<Shell />, createRepository()));

      expect(await screen.findByRole("heading", { name: "网站简介" })).toBeInTheDocument();
      expect(
        screen.getByText(
          "本站为个人技术分享网站，由几位长期从事软件工程学科教学的高校老师共同打造。作为软件工程领域前沿技术的探索空间，本站致力于传播软件工程知识，探索前沿理论与技术，期望以此培养行业技术人才，助力国家软件技术发展。如果您对本站有任何意见或建议，欢迎联系我们。",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("联系人：洪老师")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "672250123@qq.com" })).toHaveAttribute(
        "href",
        "mailto:672250123@qq.com",
      );
      expect(screen.getByRole("link", { name: "技术文档" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "闽ICP备2026024395号" })).toHaveAttribute(
        "href",
        "https://beian.miit.gov.cn/",
      );
      const publicSecurityFilingLink = screen.getByRole("link", {
        name: /闽公网安备35010402351938号/u,
      });
      expect(publicSecurityFilingLink).toHaveAttribute(
        "href",
        "https://beian.mps.gov.cn/#/query/webSearch?code=35010402351938",
      );
      expect(within(publicSecurityFilingLink).getByAltText("公安备案图标")).toHaveAttribute(
        "src",
        "/assets/beian/gongan.png",
      );
      expect(screen.queryByRole("link", { name: "服务条款" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "隐私政策" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "客户支持" })).not.toBeInTheDocument();

      view.unmount();
    }
  });

  it("redirects direct workspace access back to the website home when the session is missing", async () => {
    authSessionMode = "unauthenticated";
    window.history.pushState({}, "", "/workspace");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(window.location.search).toBe("");
    expect(await screen.findByTestId("marketing-scroll-page")).toBeInTheDocument();
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated top-level feature pages back to the website home", async () => {
    for (const path of ["/exam", "/tutorial"] as const) {
      authSessionMode = "unauthenticated";
      window.history.pushState({}, "", path);
      const view = render(withWorkspaceProviders(<Shell />, createRepository()));

      await waitFor(() => {
        expect(window.location.pathname).toBe("/");
      });
      expect(screen.queryByRole("heading", { name: path === "/exam" ? "考试" : "使用文档" })).not.toBeInTheDocument();
      expect(screen.queryByText("项目导航")).not.toBeInTheDocument();

      view.unmount();
    }
  });

  it("navigates top-level feature pages for signed-in users without opening workspace tabs", async () => {
    const user = userEvent.setup();
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/exam");
    render(withWorkspaceProviders(<Shell />, createRepository()));
    const banner = (await screen.findAllByRole("banner"))[0];
    const navButtons = within(within(banner).getByRole("navigation")).getAllByRole("button");

    expect(navButtons.map((button) => button.textContent)).toEqual([
      "项目",
      "考试",
      "使用文档",
      "支付",
    ]);
    expect(within(banner).queryByRole("button", { name: "工作台" })).not.toBeInTheDocument();

    await user.click(within(banner).getByRole("button", { name: "考试" }));

    expect(window.location.pathname).toBe("/exam");
    expect(screen.getByRole("heading", { name: "考试" })).toBeInTheDocument();
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 考试" })).not.toBeInTheDocument();

    expect(within(banner).queryByRole("button", { name: "购买" })).not.toBeInTheDocument();
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();

    await user.click(within(banner).getByRole("button", { name: "支付" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/account/billing");
    });
    expect(await screen.findByRole("heading", { name: "权益与账单" })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "支付" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(within(banner).getByRole("button", { name: "项目" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects");
    });
    expect(await screen.findByRole("heading", { name: "项目首页" })).toBeInTheDocument();
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 工作台" })).not.toBeInTheDocument();
  });

  it("hides workspace tools on signed-in standalone pages", async () => {
    authSessionMode = "authenticated";
    window.history.pushState({}, "", "/exam");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByRole("heading", { name: "考试" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成任务" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "历史" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全局设置" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "账号" })).toBeInTheDocument();
  });

  it("renders the product documentation page for signed-in users", async () => {
    authSessionMode = "authenticated";
    window.history.pushState({}, "", "/tutorial");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(
      await screen.findByRole("heading", {
        name: "软件工程实践平台使用手册",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "普通用户完整操作路径" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "文档目录" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "快速开始" })).toBeInTheDocument();
    expect(screen.getByLabelText("搜索使用文档")).toBeInTheDocument();
    expect(screen.queryByText("完整飞书文档整理中")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "模型配置" })).not.toBeInTheDocument();
    expect(screen.getByAltText("项目内使用文档快速开始截图")).toHaveAttribute(
      "src",
      "/help/images/docs-quick-start.png",
    );
    expect(screen.getAllByRole("button", { name: /项目首页与项目创建/u }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /模型详情页、元素列表与追踪矩阵/u }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /说明书生成、样式、版本与下载/u }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /代码原型生成与预览/u }).length).toBeGreaterThan(0);
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
  });

  it("syncs route state on browser popstate", async () => {
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, createRepository()));
    expect(await screen.findByText("项目导航")).toBeInTheDocument();

    window.history.pushState({}, "", "/tutorial");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "软件工程实践平台使用手册" })).toBeInTheDocument();
    });
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
  });

  it("matches first-round user platform routes", () => {
    expect(matchAppRoute("/")).toMatchObject({ kind: "marketing-home" });
    expect(matchAppRoute("/features")).toMatchObject({ kind: "marketing-home", path: "/features" });
    expect(matchAppRoute("/workflow")).toMatchObject({ kind: "marketing-home", path: "/workflow" });
    expect(matchAppRoute("/cases")).toMatchObject({ kind: "marketing-home", path: "/cases" });
    expect(matchAppRoute("/pricing")).toMatchObject({ kind: "marketing-home", path: "/pricing" });
    expect(matchAppRoute("/workspace")).toMatchObject({ kind: "shell", path: "/workspace" });
    expect(matchAppRoute("/login")).toMatchObject({ kind: "auth", path: "/login" });
    expect(matchAppRoute("/register")).toMatchObject({ kind: "auth", path: "/register" });
    expect(matchAppRoute("/verify-email")).toMatchObject({ kind: "auth", path: "/verify-email" });
    expect(matchAppRoute("/invitations/accept")).toMatchObject({
      kind: "invitation-accept",
      path: "/invitations/accept",
    });
    expect(matchAppRoute("/forgot-password")).toMatchObject({ kind: "auth", path: "/forgot-password" });
    expect(matchAppRoute("/reset-password")).toMatchObject({ kind: "auth", path: "/reset-password" });
    expect(matchAppRoute("/projects")).toMatchObject({ kind: "projects-index" });
    expect(matchAppRoute("/projects/new")).toMatchObject({ kind: "projects-new" });
    expect(matchAppRoute("/projects/course-demo")).toMatchObject({
      kind: "project-workspace",
      projectId: "course-demo",
    });
    expect(matchAppRoute("/projects/course-demo/settings")).toMatchObject({
      kind: "project-workspace",
      projectId: "course-demo",
      drawer: "settings",
    });
    expect(matchAppRoute("/projects/course-demo/members")).toMatchObject({
      kind: "project-workspace",
      projectId: "course-demo",
      drawer: "members",
    });
    expect(matchAppRoute("/projects/course-demo/history")).toMatchObject({
      kind: "project-workspace",
      projectId: "course-demo",
      drawer: "history",
    });
    expect(matchAppRoute("/projects/course-demo/documents")).toMatchObject({
      kind: "project-workspace",
      projectId: "course-demo",
      drawer: "documents",
    });
    expect(matchAppRoute("/account")).toMatchObject({ kind: "legacy-account", path: "/account" });
    expect(matchAppRoute("/account/security")).toMatchObject({
      kind: "legacy-account",
      path: "/account/security",
    });
    expect(matchAppRoute("/settings/models")).toMatchObject({
      kind: "legacy-redirect",
      path: "/settings/models",
      to: "/projects",
    });
    expect(matchAppRoute("/account/billing")).toMatchObject({
      kind: "account-billing",
      path: "/account/billing",
    });
    expect(matchAppRoute("/about")).toMatchObject({
      kind: "not-found",
      path: "/about",
    });
    expect(matchAppRoute("/admin/system-notices")).toMatchObject({
      kind: "not-found",
      path: "/admin/system-notices",
    });
  });

  it("renders static login and registration form states", async () => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(<Shell />, createRepository()));

    window.history.pushState({}, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await user.type(await screen.findByLabelText("邮箱或用户名"), "student@example.edu");
    expect(screen.getByTestId("auth-shell")).toHaveAttribute("data-auth-layout", "design-replica-card");
    expect(screen.getByTestId("auth-shell")).toHaveAttribute("data-motion", "auth-shell");
    expect(screen.getByTestId("auth-form-panel")).toBeInTheDocument();
    expect(screen.getByTestId("auth-form-panel")).toHaveAttribute("data-motion", "auth-form");
    expect(screen.getByTestId("auth-security-panel")).toBeInTheDocument();
    expect(screen.getByTestId("auth-security-panel")).toHaveAttribute("data-motion", "auth-security");
    expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByText("软件工程实践平台")).toBeInTheDocument();
    expect(screen.getByText("项目开发生命周期")).toBeInTheDocument();
    expect(screen.getByText("UML模型预览")).toBeInTheDocument();
    expect(screen.getByText("API 延迟")).toBeInTheDocument();
    expect(screen.getByTestId("auth-lifecycle-card")).toHaveClass(
      "hover:-translate-y-1",
      "hover:shadow-xl",
    );
    expect(screen.getAllByTestId("auth-progress-shimmer").length).toBeGreaterThan(0);
    expect(screen.getByTestId("auth-api-latency-value")).toHaveClass("group-hover:text-primary/80");
    expect(screen.getByRole("button", { name: "登录" })).toHaveClass("bg-primary");
    expect(screen.getByRole("button", { name: "创建账号" })).not.toHaveClass("bg-primary");
    expect(screen.getByRole("button", { name: "忘记密码？" })).not.toHaveClass("bg-primary");
    await user.type(screen.getByLabelText("密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("邮箱或用户名或密码错误。")).toBeInTheDocument();
    expect(screen.getByText("编译成功")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "创建账号" }));
    await user.type(await screen.findByLabelText("邮箱"), "new-student@example.edu");
    await user.type(screen.getByLabelText("密码"), "StrongPass123");
    await user.type(screen.getByLabelText("用户名"), "new_student");
    await user.type(screen.getByLabelText("昵称"), "New Student");
    await user.click(screen.getByLabelText("我已阅读并同意服务条款"));
    await user.click(screen.getByRole("button", { name: "注册并发送验证邮件" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/verify-email");
    });
    expect(window.location.search).toContain("email=new-student%40example.edu");
    expect(await screen.findByText(/验证邮件已发送到/)).toBeInTheDocument();
  });

  it("shows the shared language menu on auth pages before login", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/login");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.click(await screen.findByRole("button", { name: "切换界面语言" }));
    await user.click(screen.getByRole("menuitem", { name: /English/u }));

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en");
    });
    expect(screen.getByRole("button", { name: "Change interface language" })).toBeInTheDocument();
  });

  it("redirects the removed model settings route to projects", async () => {
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/settings/models");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects");
    });
    expect(await screen.findByRole("heading", { name: "项目首页" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "模型设置" })).not.toBeInTheDocument();
  });

  it("remembers login credentials when requested and lets users reveal the password", async () => {
    const user = userEvent.setup();
    loginApiMode = "success";
    render(withWorkspaceProviders(<Shell />, createRepository()));

    window.history.pushState({}, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));

    const passwordInput = await screen.findByLabelText("密码");
    expect(passwordInput).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "显示密码" }));
    expect(passwordInput).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.type(screen.getByLabelText("邮箱或用户名"), "student@example.edu");
    await user.type(passwordInput, "password-123");
    await user.click(screen.getByLabelText("记住我"));
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(localStorage.getItem("uml-auth-remembered-email")).toBe("student@example.edu");
      expect(localStorage.getItem("uml-auth-remembered-password")).toBe("password-123");
    });

    window.history.pushState({}, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByLabelText("邮箱或用户名")).toHaveValue("student@example.edu");
    expect(screen.getByLabelText("密码")).toHaveValue("password-123");
    expect(screen.getByLabelText("记住我")).toBeChecked();
  });

  it("renders every website auth route inside the animated auth shell", async () => {
    const authRoutes = [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
    ];

    for (const path of authRoutes) {
      window.history.pushState({}, "", path);
      const view = render(withWorkspaceProviders(<Shell />, createRepository()));

      expect(await screen.findByTestId("auth-shell")).toHaveAttribute(
        "data-motion",
        "auth-shell",
      );
      expect(screen.getByTestId("auth-form-panel")).toHaveAttribute(
        "data-motion",
        "auth-form",
      );
      expect(screen.getByTestId("auth-security-panel")).toHaveAttribute(
        "data-motion",
        "auth-security",
      );

      view.unmount();
    }
  });

  it("redirects a login redirect to workspace into the signed-in projects area", async () => {
    const user = userEvent.setup();
    loginApiMode = "success";
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/login?redirect=%2Fworkspace");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.type(await screen.findByLabelText("邮箱或用户名"), "student@example.edu");
    await user.type(screen.getByLabelText("密码"), "StrongPass123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects");
    });
    expect(await screen.findByRole("heading", { name: "项目首页" })).toBeInTheDocument();
  });

  it("sends unverified logins to the website email verification page", async () => {
    const user = userEvent.setup();
    loginApiMode = "email-unverified";
    window.history.pushState({}, "", "/login");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.type(await screen.findByLabelText("邮箱或用户名"), "student@example.edu");
    await user.type(screen.getByLabelText("密码"), "StrongPass123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/verify-email");
    });
    expect(window.location.search).toContain("email=student%40example.edu");
    expect(await screen.findByRole("heading", { name: "验证您的邮箱" })).toBeInTheDocument();
  });

  it("verifies an MFA challenge before completing login", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    loginApiMode = "mfa-challenge";
    render(withWorkspaceProviders(<Shell />, createRepository()));

    window.history.pushState({}, "", "/login");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await user.type(await screen.findByLabelText("邮箱或用户名"), "student@example.edu");
    await user.type(screen.getByLabelText("密码"), "StrongPass123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByLabelText("MFA 验证码")).toBeInTheDocument();
    expect(screen.getByText("请输入认证器中的 6 位验证码完成登录。")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");

    await user.type(screen.getByLabelText("MFA 验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "验证 MFA" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/mfa/verify"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          challengeId: "challenge-login-1",
          code: "123456",
        }),
      }),
    );
    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects");
    });
  });

  it("accepts an invitation token after registration", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    window.history.pushState({}, "", "/register?invitationToken=course-token-123");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.type(await screen.findByLabelText("邮箱"), "new-student@example.edu");
    await user.type(screen.getByLabelText("密码"), "StrongPass123");
    await user.type(screen.getByLabelText("用户名"), "new_student");
    await user.type(screen.getByLabelText("昵称"), "New Student");
    expect(screen.getByLabelText("邀请码")).toHaveValue("course-token-123");
    await user.click(screen.getByLabelText("我已阅读并同意服务条款"));
    await user.click(screen.getByRole("button", { name: "注册并发送验证邮件" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/register"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "new-student@example.edu",
          username: "new_student",
          password: "StrongPass123",
          displayName: "New Student",
          invitationToken: "course-token-123",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/invitations/course-token-123/accept"),
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => {
      expect(window.location.pathname).toBe("/verify-email");
    });
    expect(window.location.search).toContain("email=new-student%40example.edu");
  });

  it("opens a project invitation link and accepts it from the browser", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/invitations/accept?token=invite-token-123");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByRole("heading", { name: "接受项目邀请" })).toBeInTheDocument();
    expect(await screen.findByText("智慧图书馆预约系统")).toBeInTheDocument();
    expect(screen.getByText("invitee@example.edu")).toBeInTheDocument();
    expect(screen.getByText("编辑者")).toBeInTheDocument();
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "接受邀请" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/invitations/invite-token-123"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/invitations/invite-token-123/accept"),
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() => {
      expect(window.location.pathname).toBe("/projects");
    });
  });

  it("calls real auth recovery endpoints for verify, forgot, and reset flows", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const verifyView = render(withWorkspaceProviders(<Shell />, createRepository()));
    expect(screen.queryByText("AI 驱动的软件工程实验平台")).not.toBeInTheDocument();

    window.history.pushState({}, "", "/verify-email?token=verification-token-123456");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await user.click(await screen.findByRole("button", { name: "完成邮箱验证" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/verify-email"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "verification-token-123456" }),
      }),
    );
    verifyView.unmount();

    window.history.pushState({}, "", "/verify-email?email=new-student%40example.edu&sent=1");
    const manualVerifyView = render(withWorkspaceProviders(<Shell />, createRepository()));
    await user.type(
      await screen.findByLabelText("邮件验证码 / 短期 token"),
      "manual-token-789",
    );
    await user.click(screen.getByRole("button", { name: "完成邮箱验证" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
    });
    expect(window.location.search).toContain("email=new-student%40example.edu");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/verify-email"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "manual-token-789" }),
      }),
    );
    manualVerifyView.unmount();

    window.history.pushState({}, "", "/forgot-password");
    const forgotView = render(withWorkspaceProviders(<Shell />, createRepository()));
    await user.type(await screen.findByLabelText("邮箱"), "new-student@example.edu");
    await user.click(screen.getByRole("button", { name: "发送重置邮件" }));
    expect(await screen.findByText(/如果邮箱存在，重置邮件会发送到/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/forgot-password"),
      expect.objectContaining({ method: "POST" }),
    );
    forgotView.unmount();

    window.history.pushState({}, "", "/reset-password?token=reset-token-123456");
    render(withWorkspaceProviders(<Shell />, createRepository()));
    await user.type(await screen.findByLabelText("新密码"), "AnotherStrongPass123");
    await user.click(screen.getByRole("button", { name: "重置密码" }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/login");
    });
  });

  it("redirects the projects index back to the website home when the session is missing", async () => {
    authSessionMode = "unauthenticated";
    window.history.pushState({}, "", "/projects");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(window.location.search).toBe("");
    expect(screen.queryByRole("heading", { name: "项目首页" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("搜索项目")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "工作台" })).not.toBeInTheDocument();
  });

  it("redirects protected feature pages home when the auth check cannot reach the API", async () => {
    authSessionMode = "offline";
    window.history.pushState({}, "", "/projects");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(screen.queryByRole("heading", { name: "项目首页" })).not.toBeInTheDocument();
    expect(screen.queryByText("项目服务不可用")).not.toBeInTheDocument();
  });

  it("shows the product loading screen while protected routes verify the session", async () => {
    vi.useFakeTimers();
    const authDeferred = createDeferred<Response>();
    const fetchMock = vi.mocked(fetch);
    const defaultFetch = fetchMock.getMockImplementation();
    let holdInitialAuthCheck = true;
    authSessionMode = "authenticated";
    window.history.pushState({}, "", "/exam");
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/auth/me" && holdInitialAuthCheck) {
        holdInitialAuthCheck = false;
        return authDeferred.promise;
      }
      if (!defaultFetch) throw new Error("Default fetch mock is not installed");
      return defaultFetch(input, init);
    });

    try {
      render(withWorkspaceProviders(<Shell />, createRepository()));

      expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute(
        "data-loading-variant",
        "fullscreen",
      );
      expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute(
        "data-loading-phase",
        "loading",
      );
      expect(screen.getByText("软件工程实践平台")).toBeInTheDocument();
      expect(screen.getByText("项目工作台")).toBeInTheDocument();
      expect(screen.getByText("SYS_CORE")).toBeInTheDocument();
      expect(
        screen.getByRole("progressbar", { name: "正在校验登录状态..." }),
      ).toHaveAttribute("aria-valuenow", "25");

      await act(async () => {
        authDeferred.resolve(createAuthMeResponse());
        await flushResolvedPromises();
      });

      expect(screen.getByRole("heading", { name: "考试" })).toBeInTheDocument();
      expect(screen.getByText("正在校验登录状态...")).toBeInTheDocument();

      await advanceTimersByTime(800);

      expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute(
        "data-loading-phase",
        "completing",
      );
      expect(
        screen.getByRole("progressbar", { name: "正在校验登录状态..." }),
      ).toHaveAttribute("aria-valuenow", "100");

      await advanceTimersByTime(120);

      expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute(
        "data-loading-phase",
        "exiting",
      );

      await advanceTimersByTime(520);

      expect(screen.queryByText("正在校验登录状态...")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the projects index visually empty while the project list loads", async () => {
    const projectsDeferred = createDeferred<Response>();
    const fetchMock = vi.mocked(fetch);
    const defaultFetch = fetchMock.getMockImplementation();
    authSessionMode = "authenticated";
    window.history.pushState({}, "", "/projects");
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/projects" && (init?.method ?? "GET") === "GET") {
        return projectsDeferred.promise;
      }
      if (!defaultFetch) throw new Error("Default fetch mock is not installed");
      return defaultFetch(input, init);
    });

    try {
      render(
        withWorkspaceProviders(
          <ProjectsIndexPage onNavigate={() => {}} />,
          createRepository(),
        ),
      );

      expect(screen.getByTestId("projects-index-shell")).toHaveClass(
        "overflow-y-scroll",
        "overflow-x-hidden",
        "[scrollbar-gutter:stable]",
      );
      expect(screen.queryByTestId("platform-loading-screen")).not.toBeInTheDocument();
      expect(screen.queryByTestId("projects-index-loading-skeleton")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "项目首页" })).not.toBeInTheDocument();
      expect(screen.queryByText("正在加载项目列表...")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("搜索项目")).not.toBeInTheDocument();

      await act(async () => {
        projectsDeferred.resolve(createProjectListResponse());
        await flushResolvedPromises();
      });

      expect(screen.getByRole("heading", { name: "项目首页" })).toBeInTheDocument();
      expect(screen.getByTestId("projects-index-shell")).toHaveClass(
        "overflow-y-scroll",
        "overflow-x-hidden",
        "[scrollbar-gutter:stable]",
      );
      expect(screen.getAllByText("智慧图书馆预约系统").length).toBeGreaterThan(0);
      expect(screen.getByTestId("projects-card-grid")).toHaveAttribute(
        "data-mobile-card-density",
        "two-column",
      );
      expect(screen.getByTestId("projects-card-grid")).toHaveClass("grid-cols-2");
      expect(screen.getByTestId("projects-filter-panel")).toHaveClass("p-3", "md:p-[17px]");
      expect(screen.getByTestId("projects-filter-panel").querySelector("[data-scale-to-fit]")).toBeNull();
      expect(screen.getAllByRole("article")[0]).toHaveClass("min-h-[182px]");
      expect(screen.queryByText("正在加载项目列表...")).not.toBeInTheDocument();
      expect(screen.queryByTestId("platform-loading-screen")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the product loading screen while entering a project workspace", async () => {
    vi.useFakeTimers();
    const projectDeferred = createDeferred<Response>();
    const fetchMock = vi.mocked(fetch);
    const defaultFetch = fetchMock.getMockImplementation();
    let holdProjectOverview = true;
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (
        url.pathname === "/api/projects/library-booking" &&
        (init?.method ?? "GET") === "GET" &&
        holdProjectOverview
      ) {
        holdProjectOverview = false;
        return projectDeferred.promise;
      }
      if (!defaultFetch) throw new Error("Default fetch mock is not installed");
      return defaultFetch(input, init);
    });

    try {
      render(
        withWorkspaceProviders(
          <ProjectWorkspaceAccessBoundary
            projectId="library-booking"
            onNavigate={() => {}}
          >
            <div>项目导航</div>
          </ProjectWorkspaceAccessBoundary>,
          createRepository(),
        ),
      );

      expect(screen.getByText("正在打开项目工作台...")).toBeInTheDocument();
      expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute(
        "data-loading-variant",
        "content",
      );
      expect(screen.queryByText("项目导航")).not.toBeInTheDocument();

      await act(async () => {
        projectDeferred.resolve(createProjectOverviewResponse());
        await flushResolvedPromises();
      });

      expect(screen.getByText("正在打开项目工作台...")).toBeInTheDocument();
      expect(screen.getByText("项目导航")).toBeInTheDocument();

      await advanceTimersByTime(800);

      expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute(
        "data-loading-phase",
        "completing",
      );
      expect(
        screen.getByRole("progressbar", { name: "正在打开项目工作台..." }),
      ).toHaveAttribute("aria-valuenow", "100");

      await advanceTimersByTime(120);

      expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute(
        "data-loading-phase",
        "exiting",
      );

      await advanceTimersByTime(520);

      expect(screen.getByText("项目导航")).toBeInTheDocument();
      expect(screen.queryByText("正在打开项目工作台...")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the projects index visually empty while protected projects load", async () => {
    vi.useFakeTimers();
    const projectsDeferred = createDeferred<Response>();
    const fetchMock = vi.mocked(fetch);
    const defaultFetch = fetchMock.getMockImplementation();
    authSessionMode = "authenticated";
    window.history.pushState({}, "", "/projects");
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (url.pathname === "/api/projects" && (init?.method ?? "GET") === "GET") {
        return projectsDeferred.promise;
      }
      if (!defaultFetch) throw new Error("Default fetch mock is not installed");
      return defaultFetch(input, init);
    });

    try {
      render(withWorkspaceProviders(<Shell />, createRepository()));

      await act(async () => {
        await flushResolvedPromises();
      });

      expect(screen.getByTestId("projects-index-shell")).toHaveClass(
        "overflow-y-scroll",
        "overflow-x-hidden",
        "[scrollbar-gutter:stable]",
      );
      await advanceTimersByTime(1_440);
      expect(screen.queryAllByTestId("platform-loading-screen")).toHaveLength(0);
      expect(screen.queryByTestId("projects-index-loading-skeleton")).not.toBeInTheDocument();
      expect(screen.queryByText("正在加载项目列表...")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "项目首页" })).not.toBeInTheDocument();

      await act(async () => {
        projectsDeferred.resolve(createProjectListResponse());
        await flushResolvedPromises();
      });

      expect(screen.getByRole("heading", { name: "项目首页" })).toBeInTheDocument();
      expect(screen.getByTestId("projects-index-shell")).toHaveClass(
        "overflow-y-scroll",
        "overflow-x-hidden",
        "[scrollbar-gutter:stable]",
      );
      expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
      expect(screen.queryAllByTestId("platform-loading-screen")).toHaveLength(0);
      expect(screen.getByRole("heading", { name: "项目首页" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps one coordinated loading overlay while direct project workspaces load", async () => {
    vi.useFakeTimers();
    const projectDeferred = createDeferred<Response>();
    const fetchMock = vi.mocked(fetch);
    const defaultFetch = fetchMock.getMockImplementation();
    let holdProjectOverview = true;
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      if (
        url.pathname === "/api/projects/library-booking" &&
        (init?.method ?? "GET") === "GET" &&
        holdProjectOverview
      ) {
        holdProjectOverview = false;
        return projectDeferred.promise;
      }
      if (!defaultFetch) throw new Error("Default fetch mock is not installed");
      return defaultFetch(input, init);
    });

    try {
      render(withWorkspaceProviders(<Shell />, createRepository()));

      await act(async () => {
        await flushResolvedPromises();
      });

      expect(screen.queryAllByTestId("platform-loading-screen")).toHaveLength(1);
      expect(screen.getByText("正在打开项目工作台...")).toBeInTheDocument();
      expect(screen.getByTestId("project-workspace-loading-layout")).toBeInTheDocument();
      expect(screen.queryByText("项目导航")).not.toBeInTheDocument();

      await act(async () => {
        projectDeferred.resolve(createProjectOverviewResponse());
        await flushResolvedPromises();
      });

      expect(screen.getByText("项目导航")).toBeInTheDocument();
      expect(screen.queryByText("项目数据加载中...")).not.toBeInTheDocument();
      expect(screen.queryByTestId("project-workspace-loading-layout")).not.toBeInTheDocument();
      expect(screen.queryAllByTestId("platform-loading-screen")).toHaveLength(1);

      await advanceTimersByTime(800);
      expect(screen.queryAllByTestId("platform-loading-screen")).toHaveLength(1);
      expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute(
        "data-loading-phase",
        "completing",
      );

      await advanceTimersByTime(120);
      expect(screen.queryAllByTestId("platform-loading-screen")).toHaveLength(1);
      expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute(
        "data-loading-phase",
        "exiting",
      );

      await advanceTimersByTime(520);
      expect(screen.queryAllByTestId("platform-loading-screen")).toHaveLength(0);
      expect(screen.getByText("项目导航")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps protected route navigation visible while revalidating the session in the background", async () => {
    vi.useFakeTimers();
    const routeAuthDeferred = createDeferred<Response>();
    const projectDetailDeferred = createDeferred<Response>();
    const fetchMock = vi.mocked(fetch);
    const defaultFetch = fetchMock.getMockImplementation();
    let holdNextRouteAuth = false;
    let authMeCalls = 0;
    const projectRequests = {
      detail: 0,
      members: 0,
      runs: 0,
      documents: 0,
    };
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects");
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/auth/me") {
        authMeCalls += 1;
        if (holdNextRouteAuth) {
          holdNextRouteAuth = false;
          return routeAuthDeferred.promise;
        }
        return createAuthMeResponse();
      }
      if (url.pathname === "/api/projects" && method === "GET") {
        return createProjectListResponse();
      }
      if (url.pathname === "/api/projects/library-booking" && method === "GET") {
        projectRequests.detail += 1;
        return projectDetailDeferred.promise;
      }
      if (url.pathname === "/api/projects/library-booking/members" && method === "GET") {
        projectRequests.members += 1;
      }
      if (url.pathname === "/api/projects/library-booking/runs" && method === "GET") {
        projectRequests.runs += 1;
      }
      if (url.pathname === "/api/projects/library-booking/documents" && method === "GET") {
        projectRequests.documents += 1;
      }
      if (!defaultFetch) throw new Error("Default fetch mock is not installed");
      return defaultFetch(input, init);
    });

    try {
      render(withWorkspaceProviders(<Shell />, createRepository()));

      await act(async () => {
        await flushResolvedPromises();
      });
      await act(async () => {
        await flushResolvedPromises();
      });

      expect(screen.getByRole("heading", { name: "项目首页" })).toBeInTheDocument();
      holdNextRouteAuth = true;

      fireEvent.click(
        screen.getByRole("button", { name: "进入项目 智慧图书馆预约系统" }),
      );

      await act(async () => {
        await flushResolvedPromises();
      });

      expect(window.location.pathname).toBe("/projects/library-booking");
      expect(screen.queryByText("正在校验登录状态...")).not.toBeInTheDocument();
      expect(screen.getByTestId("platform-loading-screen")).toBeInTheDocument();
      expect(screen.getByText("正在打开项目工作台...")).toBeInTheDocument();
      expect(screen.getByTestId("project-workspace-loading-layout")).toBeInTheDocument();
      expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
      expect(screen.queryByText("需求分析提取")).not.toBeInTheDocument();
      expect(projectRequests).toEqual({
        detail: 1,
        members: 1,
        runs: 1,
        documents: 1,
      });

      const authCallsAfterRouteCheckStarted = authMeCalls;
      await act(async () => {
        routeAuthDeferred.resolve(createAuthMeResponse());
        await flushResolvedPromises();
      });
      await act(async () => {
        await flushResolvedPromises();
      });

      expect(screen.getByTestId("platform-loading-screen")).toBeInTheDocument();
      expect(screen.getByText("正在打开项目工作台...")).toBeInTheDocument();
      expect(screen.getByTestId("project-workspace-loading-layout")).toBeInTheDocument();
      expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
      expect(projectRequests).toEqual({
        detail: 1,
        members: 1,
        runs: 1,
        documents: 1,
      });

      await act(async () => {
        projectDetailDeferred.resolve(createProjectOverviewResponse());
        await flushResolvedPromises();
      });
      await act(async () => {
        await flushResolvedPromises();
      });

      expect(screen.getByText("项目导航")).toBeInTheDocument();
      expect(projectRequests).toEqual({
        detail: 1,
        members: 1,
        runs: 1,
        documents: 1,
      });
      expect(authMeCalls).toBe(authCallsAfterRouteCheckStarted);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets project workspace tabs before rendering a different project's content", async () => {
    const user = userEvent.setup();
    const requestedPaths: string[] = [];
    authSessionMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1:4101");
      const method = init?.method ?? "GET";
      requestedPaths.push(`${method} ${url.pathname}`);

      if (url.pathname === "/api/auth/me") {
        return createAuthMeResponse();
      }
      const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/u);
      if (projectMatch && method === "GET") {
        const projectId = decodeURIComponent(projectMatch[1]);
        return new Response(
          JSON.stringify({
            project: {
              id: projectId,
              name: projectId === "library-booking" ? "智慧图书馆预约系统" : "新项目",
              description: "真实项目数据",
              visibility: "team",
              status: "active",
              ownerUserId: "user-new",
              createdAt: "2026-05-22T01:00:00.000Z",
              updatedAt: projectUpdatedAt,
            },
            membership: {
              id: `member-${projectId}`,
              projectId,
              userId: "user-new",
              email: "new-student@example.edu",
              displayName: "new-student",
              role: "owner",
              status: "active",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const scopedProjectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/(.+)$/u);
      if (scopedProjectMatch) {
        const [, encodedProjectId, resource] = scopedProjectMatch;
        const projectId = decodeURIComponent(encodedProjectId);
        if (resource === "members") {
          return new Response(JSON.stringify({ members: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (resource === "runs") {
          return new Response(JSON.stringify({ projectId, runs: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (resource === "workspace") {
          return new Response(
            JSON.stringify({
              version: 1,
              state: createWorkspaceRecord({ id: `workspace-${projectId}` }),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (resource === "documents") {
          return new Response(
            JSON.stringify({
              documents:
                projectId === "library-booking"
                  ? [
                      {
                        id: "doc-1",
                        workspaceId: "workspace-library-booking",
                        projectId,
                        createdByUserId: "user-new",
                        documentKind: "requirementsSpec",
                        title: "需求规格说明书",
                        fileName: "requirements.docx",
                        mimeType:
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        byteLength: 1234,
                        version: 1,
                        status: "active",
                        onlyOffice: null,
                        editLock: null,
                        download: { status: "available" },
                        sourceRunId: "run-doc",
                        createdAt: "2026-05-22T01:00:00.000Z",
                        updatedAt: "2026-05-22T02:00:00.000Z",
                      },
                    ]
                  : [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (resource === "documents/doc-1/editor-config") {
          return new Response(
            JSON.stringify({
              document: {
                id: "doc-1",
                projectId,
                documentKind: "requirementsSpec",
                fileName: "requirements.docx",
                version: 1,
                status: "active",
                updatedAt: "2026-05-22T02:00:00.000Z",
              },
              documentServerUrl: "http://127.0.0.1:8080",
              config: {
                documentType: "word",
                document: {
                  fileType: "docx",
                  key: "doc-1-v1",
                  title: "requirements.docx",
                  url: "/api/documents/doc-1/file",
                },
                editorConfig: {
                  callbackUrl: "/api/documents/doc-1/onlyoffice/callback",
                  mode: "edit",
                  lang: "zh-CN",
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      return new Response(JSON.stringify({ message: "Unhandled test request" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(<App />);

    expect(await screen.findByText("项目导航")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "说明书" }));
    await user.click(await screen.findByRole("button", { name: "打开编辑器" }));
    expect(await screen.findByRole("button", { name: "关闭 requirements.docx" })).toBeInTheDocument();

    window.history.pushState({}, "", "/projects/next-project");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "关闭 requirements.docx" })).not.toBeInTheDocument();
    });
    expect(await screen.findByRole("button", { name: "关闭 系统需求" })).toBeInTheDocument();
    expect(
      requestedPaths.some((path) =>
        path.includes("/api/projects/next-project/documents/doc-1/editor-config"),
      ),
    ).toBe(false);
  });

  it("blocks anonymous workspace route access when the session is missing", async () => {
    authSessionMode = "unauthenticated";
    window.history.pushState({}, "", "/projects/anonymous-workspace");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(window.location.search).toBe("");
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 需求" })).not.toBeInTheDocument();
  });

  it("shows a service error without anonymous fallback when the project API is unavailable", async () => {
    projectApiMode = "offline";
    authSessionMode = "authenticated";
    window.history.pushState({}, "", "/projects");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByText("项目加载失败：Failed to fetch")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "项目服务不可用" })).toBeInTheDocument();
    expect(screen.queryByText("匿名工作台")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("搜索项目")).not.toBeInTheDocument();
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated real project routes back to the website home", async () => {
    authSessionMode = "unauthenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(window.location.search).toBe("");
  });

  it("revalidates protected routes when the auth session changes", async () => {
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByText("项目导航")).toBeInTheDocument();

    authSessionMode = "unauthenticated";
    window.dispatchEvent(new Event("uml-auth-session-changed"));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
  });

  it("navigates from a real project card into a project-aware workspace banner", async () => {
    const user = userEvent.setup();
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(
      await screen.findByRole("button", { name: "进入项目 智慧图书馆预约系统" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "项目首页" })).toBeInTheDocument();
    expect(screen.getByText("项目会绑定成员权限、运行历史、文档和模型配置。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建项目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部项目" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "我的项目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "团队项目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "归档项目" })).toBeInTheDocument();
    const searchInput = screen.getByPlaceholderText("搜索项目、成员...");
    expect(searchInput).toBeInTheDocument();
    expect(searchInput.parentElement).toHaveClass("min-w-[108px]", "md:w-96");
    const sortTrigger = getSelectTrigger("排序方式");
    expect(sortTrigger).toHaveTextContent("最近打开");
    expect(sortTrigger).toHaveClass("w-[82px]", "md:w-28");
    expect(screen.queryByRole("navigation", { name: "项目导航" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成任务" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "历史" })).not.toBeInTheDocument();

    expect(screen.getByText("负责人：New Student")).toBeInTheDocument();
    expect(screen.getByText("真实项目数据")).toHaveClass(
      "line-clamp-1",
      "md:line-clamp-2",
      "overflow-hidden",
    );
    expect(screen.queryByText("e91237c8-5ccf-45aa-b0d2-822b96915a24")).not.toBeInTheDocument();
    expect(screen.getByText("团队成员可见")).toBeInTheDocument();
    expect(screen.getByText(`最近更新：${formatProjectDateTimeMinute(projectUpdatedAt)}`)).toBeInTheDocument();
    expect(screen.getByLabelText("成员头像 New Student")).toBeInTheDocument();
    expect(screen.getByLabelText("成员头像 Editor User")).toBeInTheDocument();
    expect(screen.getByLabelText("成员头像 Viewer User")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "进入项目 智慧图书馆预约系统" }));

    expect(window.location.pathname).toBe("/projects/library-booking");
    expect(await screen.findByText("项目导航")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "项目首页" })).not.toBeInTheDocument();
    expect(
      screen.getByTestId("workspace-sidebar-panel").querySelector("aside"),
    ).toHaveClass("w-full");
    expect(screen.getByTestId("workspace-sidebar-panel")).toHaveAttribute("data-default-size", "10");
    expect(screen.getByTestId("workspace-sidebar-panel")).toHaveAttribute("data-min-size", "8");
    expect(screen.getByTestId("workspace-sidebar-panel")).toHaveAttribute("data-max-size", "22");
    expect(screen.getByRole("button", { name: "生成任务" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "历史快照" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行历史" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "项目设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "成员" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文档中心" })).toBeInTheDocument();
    expect(screen.getByText("智慧图书馆预约系统")).toBeInTheDocument();
    expect(await screen.findByText("成员 4")).toBeInTheDocument();
    expect(screen.queryByText("运行中 1")).not.toBeInTheDocument();
    expect(screen.queryByText("文档 1")).not.toBeInTheDocument();
    expect(screen.getByText("权限 owner")).toBeInTheDocument();
  });

  it("filters and sorts projects from real project status data", async () => {
    const user = userEvent.setup();
    projectApiMode = "authenticated";
    render(withWorkspaceProviders(<Shell />, createRepository()));

    window.history.pushState({}, "", "/projects");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByRole("heading", { name: "智慧图书馆预约系统" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "归档课程演示" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "归档项目" }));
    expect(screen.queryByRole("heading", { name: "智慧图书馆预约系统" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "归档课程演示" })).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("搜索项目、成员..."));
    await user.type(screen.getByPlaceholderText("搜索项目、成员..."), "不存在");
    expect(screen.getByText("没有匹配的项目")).toBeInTheDocument();
  });

  it("renders the Figma empty project state for signed-in users without projects", async () => {
    const user = userEvent.setup();
    authSessionMode = "authenticated";
    projectApiMode = "empty";
    window.history.pushState({}, "", "/projects");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByRole("heading", { name: "还没有项目" })).toBeInTheDocument();
    expect(screen.getByText("创建项目后才能进入实验工作台。您可以新建一个独立项目或加入团队协作。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "创建第一个项目" }));

    expect(window.location.pathname).toBe("/projects");
    expect(await screen.findByRole("dialog", { name: "创建项目" })).toBeInTheDocument();
    expect(screen.getByLabelText("项目名称")).toHaveValue("课程 UML 实验项目");
    const descriptionInput = screen.getByLabelText("项目描述");
    expect(descriptionInput.tagName).toBe("TEXTAREA");
    expect(descriptionInput).toHaveAttribute("rows", "4");
    const visibilityGroup = screen.getByRole("group", { name: "可见性" });
    expect(
      within(visibilityGroup).getByRole("button", { name: "团队成员可见" }),
    ).toHaveAttribute("aria-pressed", "true");
    const advancedButton = screen.getByRole("button", { name: "高级设置" });
    expect(advancedButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("课程/班级/team")).not.toBeInTheDocument();
  });

  it("opens the project creation form in a dialog from the projects page", async () => {
    const user = userEvent.setup();
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新建项目" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "新建项目" }));

    expect(window.location.pathname).toBe("/projects");
    expect(await screen.findByRole("dialog", { name: "创建项目" })).toBeInTheDocument();
    const descriptionInput = screen.getByLabelText("项目描述");
    expect(descriptionInput.tagName).toBe("TEXTAREA");
    expect(descriptionInput).toHaveAttribute("rows", "4");
    const visibilityGroup = screen.getByRole("group", { name: "可见性" });
    await user.click(within(visibilityGroup).getByRole("button", { name: "仅我可见" }));
    expect(within(visibilityGroup).getByRole("button", { name: "仅我可见" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const advancedButton = screen.getByRole("button", { name: "高级设置" });
    expect(advancedButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("课程/班级/team")).not.toBeInTheDocument();
    await user.click(advancedButton);
    expect(advancedButton).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => {
      expect(getSelectTrigger("课程/班级/team")).toHaveTextContent(
        "暂不绑定课程团队",
      );
    });
    expect(screen.queryByText("默认模型策略")).not.toBeInTheDocument();
  });

  it("blocks the project workspace body when project access is forbidden", async () => {
    projectApiMode = "forbidden";
    window.history.pushState({}, "", "/projects/library-booking");

    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByRole("heading", { name: "权限不足" })).toBeInTheDocument();
    expect(screen.getByText("当前账号不是该项目成员，无法查看项目详情、运行历史或文档。")).toBeInTheDocument();
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭 需求" })).not.toBeInTheDocument();
  });

  it("keeps requirement controls read-only when the project role lacks edit and run permissions", async () => {
    const user = userEvent.setup();
    projectApiMode = "authenticated";
    authSessionMode = "authenticated";
    const repository: WorkspaceRepository = {
      ...createRepository(),
      getProjectCapabilities: vi.fn(async () => [
        "view_project",
        "view_runs",
        "view_documents",
      ]),
    };
    window.history.pushState({}, "", "/projects/library-booking");

    render(withWorkspaceProviders(<Shell />, repository));

    const requirementText = await screen.findByRole("textbox", {
      name: "项目需求描述",
    });
    await waitFor(() => {
      expect(requirementText).toBeDisabled();
    });
    expect(screen.getByText("当前项目角色仅允许查看，不能编辑内容或启动生成。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始分析提取" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /电商系统/ })).not.toBeInTheDocument();

    await user.type(requirementText, "访客不应写入需求");

    expect(repository.updateRequirementText).not.toHaveBeenCalled();
  });

  it("keeps project settings read-only for viewer members", async () => {
    projectApiMode = "authenticated";
    authSessionMode = "authenticated";
    projectMembershipRole = "viewer";
    window.history.pushState({}, "", "/projects/library-booking/settings");

    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByRole("dialog", { name: "项目设置" })).toBeInTheDocument();
    expect(screen.getByText("当前项目角色不能管理项目设置。")).toBeInTheDocument();
    expect(screen.getByLabelText("项目信息")).toBeDisabled();
    expect(screen.getByLabelText("项目描述")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存项目设置" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "数据导出" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除项目" })).toBeDisabled();
  });

  it("opens project workspace drawers from banner shortcuts without routing", async () => {
    const user = userEvent.setup();
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");

    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByText("智慧图书馆预约系统")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成任务" }));

    expect(window.location.pathname).toBe("/projects/library-booking");
    expect(await screen.findByRole("dialog", { name: "生成任务" })).toBeInTheDocument();
    expect(screen.getByTestId("project-workspace-drawer-layer")).toHaveClass("absolute", "inset-0");
    expect(screen.getByTestId("project-workspace-drawer-layer")).not.toHaveClass("fixed");
    expect(screen.getByTestId("project-workspace-drawer")).toHaveClass(
      "motion-safe:slide-in-from-right-full",
    );

    await user.click(screen.getByRole("button", { name: "关闭生成任务抽屉" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "生成任务" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "成员" }));

    expect(window.location.pathname).toBe("/projects/library-booking");
    expect(await screen.findByRole("dialog", { name: "成员管理" })).toBeInTheDocument();
    expect(screen.getByTestId("project-workspace-drawer-layer")).toHaveClass("absolute", "inset-0");
    expect(screen.getByTestId("project-workspace-drawer-layer")).not.toHaveClass("fixed");
    expect(screen.getByText("项目导航")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭成员管理抽屉" }));
    expect(window.location.pathname).toBe("/projects/library-booking");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "成员管理" })).not.toBeInTheDocument();
    });
  });

  it("switches project workspace drawers from banner shortcuts while a drawer is open", async () => {
    const user = userEvent.setup();
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");

    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByText("智慧图书馆预约系统")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "运行历史" }));

    expect(await screen.findByRole("dialog", { name: "运行历史" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "文档中心" }));

    expect(await screen.findByRole("dialog", { name: "文档中心" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "运行历史" })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/projects/library-booking");
  });

  it("opens project drawers from direct child routes", async () => {
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking/history");

    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(await screen.findByRole("dialog", { name: "运行历史" })).toBeInTheDocument();
    expect(screen.getByText("项目导航")).toBeInTheDocument();
  });

  it("loads project run history from the project API and cancels runs there", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.click(await screen.findByRole("button", { name: "运行历史" }));

    expect(await screen.findByRole("dialog", { name: "运行历史" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/projects/library-booking");
    expect(screen.getByText("项目导航")).toBeInTheDocument();
    expect(await screen.findByText("渲染需求图表")).toBeInTheDocument();
    expect(screen.getByText("渲染设计图表")).toBeInTheDocument();
    expect(screen.getByText("操作者 需求分析师")).toBeInTheDocument();
    expect(screen.getByText("操作者 未知成员 bbbbbbbb")).toBeInTheDocument();
    expect(screen.queryByText("run-1")).not.toBeInTheDocument();
    expect(screen.queryByText("a3023f76-6da3-4fcd-9a82-8a187c30691d")).not.toBeInTheDocument();
    expect(screen.queryByText("未记录阶段")).not.toBeInTheDocument();
    expect(screen.queryByText(/未记录/)).not.toBeInTheDocument();
    expect(screen.queryByText("操作者 系统")).not.toBeInTheDocument();
    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "取消任务" })[0]!);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/runs/run-1/cancel"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText("任务已取消。")).toBeInTheDocument();
  });

  it("manages project members through invitation APIs, role, and revoke actions", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.click(await screen.findByRole("button", { name: "成员" }));

    expect(await screen.findByRole("dialog", { name: "成员管理" })).toBeInTheDocument();
    expect(screen.getByText(/共 3 名成员/u)).toBeInTheDocument();
    expect(screen.getByAltText("new-student 的头像")).toHaveAttribute(
      "src",
      "https://cdn.example.edu/new-student.png",
    );
    expect(screen.queryByRole("option", { name: "owner" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("邀请邮箱"), {
      target: { value: "editor@example.edu" },
    });
    await user.click(screen.getByRole("button", { name: "发送邀请" }));
    await waitFor(() => {
      expect(screen.getAllByText("editor@example.edu").length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/invitations"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getAllByText("邀请中").length).toBeGreaterThan(0);

    await chooseSelectOption(
      user,
      getSelectTrigger("editor-active@example.edu 的角色"),
      "查看者",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/members/member-editor"),
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ role: "viewer" }) }),
    );

    await user.click(screen.getByRole("button", { name: "重发邀请 viewer@example.edu" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/invitations/member-viewer/resend"),
      expect.objectContaining({ method: "POST" }),
    );

    await user.click(screen.getByRole("button", { name: "撤销邀请 viewer@example.edu" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/invitations/member-viewer"),
      expect.objectContaining({ method: "DELETE" }),
    );

    await user.click(screen.getByRole("button", { name: "移除 editor-active@example.edu" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/members/member-editor"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("filters project history, shows errors, and queues retry/rerun actions truthfully", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const repository = createRepository();
    repository.listRunHistory = vi.fn(async (): Promise<RunHistoryItem[]> => [
      {
        id: "run-1",
        createdAt: "2026-05-22T02:05:00.000Z",
        title: "需求生成",
        providerModel: "gpt-5-mini",
        snapshot: createRunSnapshot({
          runId: "run-1",
          requirementText: "生成图书馆预约系统 UML",
        }),
      },
    ]);
    repository.restoreRunHistory = vi.fn(async () => ({
      id: "run-1",
      createdAt: "2026-05-22T02:05:00.000Z",
      title: "需求生成",
      providerModel: "gpt-5-mini",
      snapshot: createRunSnapshot({
        runId: "run-1",
        requirementText: "生成图书馆预约系统 UML",
      }),
    }));
    repository.deleteRunHistory = vi.fn(async () => []);
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, repository));

    await user.click(await screen.findByRole("button", { name: "运行历史" }));

    expect(await screen.findByText("渲染需求图表")).toBeInTheDocument();
    expect(screen.getByText("渲染设计图表")).toBeInTheDocument();
    expect(screen.queryByText("run-1")).not.toBeInTheDocument();
    expect(screen.queryByText("run-failed")).not.toBeInTheDocument();
    await chooseSelectOption(user, getSelectTrigger("筛选状态"), "失败");
    expect(screen.queryByText("渲染需求图表")).not.toBeInTheDocument();
    const failedDesignCard = screen.getByText("渲染设计图表").closest(".grid.gap-3.p-3");
    expect(failedDesignCard).toBeTruthy();
    const failedDesignControls = within(failedDesignCard as HTMLElement);
    await user.click(failedDesignControls.getByRole("button", { name: "查看错误" }));
    expect(screen.getByText("PlantUML render failed")).toBeInTheDocument();
    await user.click(failedDesignControls.getByRole("button", { name: "重试" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/runs/run-failed/retry"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText("已重新排队，稍后启动。")).toBeInTheDocument();
    expect(await screen.findByText("已重试为 run-retry-failed")).toBeInTheDocument();

    await user.click(failedDesignControls.getByRole("button", { name: "重新运行" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/runs/run-failed/rerun"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText("已重新排队，稍后启动。")).toBeInTheDocument();
    expect(await screen.findByText("已重新运行为 run-rerun-failed")).toBeInTheDocument();
  });

  it("shows run history actions only when each run supports them", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const repository = createRepository();
    repository.listRunHistory = vi.fn(async (): Promise<RunHistoryItem[]> => [
      {
        id: "run-1",
        createdAt: "2026-05-22T02:05:00.000Z",
        title: "需求生成",
        providerModel: "gpt-5-mini",
        snapshot: createRunSnapshot({
          runId: "run-1",
          requirementText: "生成图书馆预约系统 UML",
        }),
      },
      {
        id: "run-doc",
        createdAt: "2026-05-22T00:05:00.000Z",
        title: "需求规格说明书",
        providerModel: "gpt-5-mini",
        snapshot: {
          runId: "run-doc",
          documentKind: "requirementsSpec",
          requirementText: "生成图书馆预约系统 UML",
          documentId: "doc-1",
          sections: [],
          fileName: "requirements.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 1234,
          missingArtifacts: [],
          currentStage: "generate_document_text",
          status: "completed",
          error: null,
        },
      },
      {
        id: "run-doc-failed",
        createdAt: "2026-05-21T23:05:00.000Z",
        title: "失败的需求规格说明书",
        providerModel: "gpt-5-mini",
        snapshot: {
          runId: "run-doc-failed",
          documentKind: "requirementsSpec",
          requirementText: "生成图书馆预约系统 UML",
          documentId: "doc-failed",
          sections: [],
          fileName: "failed-requirements.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 1234,
          missingArtifacts: [],
          currentStage: "render_document_file",
          status: "failed",
          error: {
            code: "RUN_INTERNAL_ERROR",
            message: "证据包组装失败",
            category: "internal",
            retryable: true,
          },
        },
      },
    ]);
    repository.downloadDocumentRun = vi.fn(async () => ({
      fileName: "requirements.docx",
      blob: new Blob(["docx"]),
    }));
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, repository));

    await user.click(await screen.findByRole("button", { name: "运行历史" }));

    const runningCard = (await screen.findByText("渲染需求图表")).closest(".grid.gap-3.p-3");
    const failedCard = screen.getByText("渲染设计图表").closest(".grid.gap-3.p-3");
    const documentCard = screen.getByText("生成需求规格说明书").closest(".grid.gap-3.p-3");
    const failedDocumentCard = screen
      .getByText("生成需求规格说明书文件")
      .closest(".grid.gap-3.p-3");
    expect(runningCard).toBeTruthy();
    expect(failedCard).toBeTruthy();
    expect(documentCard).toBeTruthy();
    expect(failedDocumentCard).toBeTruthy();

    const runningControls = within(runningCard as HTMLElement);
    expect(runningControls.getByRole("button", { name: "取消任务" })).toBeInTheDocument();
    expect(runningControls.queryByRole("button", { name: "查看错误" })).not.toBeInTheDocument();
    expect(runningControls.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expect(runningControls.queryByRole("button", { name: "重新运行" })).not.toBeInTheDocument();
    expect(runningControls.queryByRole("button", { name: "恢复快照" })).not.toBeInTheDocument();
    expect(runningControls.queryByRole("button", { name: "导出报告" })).not.toBeInTheDocument();
    expect(runningControls.queryByRole("button", { name: "重新下载" })).not.toBeInTheDocument();
    expect(runningControls.queryByRole("button", { name: "删除记录" })).not.toBeInTheDocument();

    const failedControls = within(failedCard as HTMLElement);
    expect(failedControls.queryByRole("button", { name: "取消任务" })).not.toBeInTheDocument();
    expect(failedControls.getByRole("button", { name: "查看错误" })).toBeInTheDocument();
    expect(failedControls.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(failedControls.getByRole("button", { name: "重新运行" })).toBeInTheDocument();
    expect(failedControls.queryByRole("button", { name: "恢复快照" })).not.toBeInTheDocument();
    expect(failedControls.queryByRole("button", { name: "导出报告" })).not.toBeInTheDocument();
    expect(failedControls.queryByRole("button", { name: "重新下载" })).not.toBeInTheDocument();
    expect(failedControls.getByRole("button", { name: "删除记录" })).toBeInTheDocument();

    const documentControls = within(documentCard as HTMLElement);
    expect(documentControls.queryByRole("button", { name: "取消任务" })).not.toBeInTheDocument();
    expect(documentControls.queryByRole("button", { name: "查看错误" })).not.toBeInTheDocument();
    expect(documentControls.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expect(documentControls.getByRole("button", { name: "重新运行" })).toBeInTheDocument();
    expect(documentControls.queryByRole("button", { name: "恢复快照" })).not.toBeInTheDocument();
    expect(documentControls.queryByRole("button", { name: "导出报告" })).not.toBeInTheDocument();
    expect(documentControls.getByRole("button", { name: "重新下载" })).toBeInTheDocument();
    expect(documentControls.getByRole("button", { name: "删除记录" })).toBeInTheDocument();

    const failedDocumentControls = within(failedDocumentCard as HTMLElement);
    expect(failedDocumentControls.getByRole("button", { name: "查看错误" })).toBeInTheDocument();
    expect(failedDocumentControls.queryByRole("button", { name: "重新下载" })).not.toBeInTheDocument();
    expect(failedDocumentControls.getByRole("button", { name: "删除记录" })).toBeInTheDocument();

    await user.click(documentControls.getByRole("button", { name: "重新下载" }));
    expect(repository.downloadDocumentRun).toHaveBeenCalledWith(
      "run-doc",
      "requirements.docx",
    );

    expect(repository.restoreRunHistory).not.toHaveBeenCalledWith("run-doc");

    await user.click(failedControls.getByRole("button", { name: "删除记录" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/runs/run-failed"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(repository.deleteRunHistory).toHaveBeenCalledWith("run-failed");
  });

  it("manages project documents through versions, rename, delete, restore, and download APIs", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await user.click(await screen.findByRole("button", { name: "文档中心" }));

    expect(await screen.findByRole("dialog", { name: "文档中心" })).toBeInTheDocument();
    expect(await screen.findByText("requirements.docx")).toBeInTheDocument();
    expect(screen.getByText("OnlyOffice：编辑中")).toBeInTheDocument();
    expect(screen.getByText("编辑锁：teacher@example.edu")).toBeInTheDocument();
    expect(screen.getByText("下载：可用")).toBeInTheDocument();

    expect(screen.queryByText(/doc-1/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "版本记录 requirements.docx" }));
    expect(await screen.findByText("v2 requirements.docx")).toBeInTheDocument();
    expect(screen.getByText("v1 requirements-v1.docx")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("文档名称"));
    await user.type(screen.getByLabelText("文档名称"), "requirements-renamed.docx");
    await user.click(screen.getByRole("button", { name: "重命名 requirements.docx" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/documents/doc-1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ fileName: "requirements-renamed.docx" }),
      }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("文档名称")).toHaveValue("requirements-renamed.docx");
    });

    await user.click(screen.getByRole("button", { name: "下载 requirements-renamed.docx" }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/documents/doc-1/download"),
      expect.objectContaining({ credentials: "include" }),
    );

    await user.click(screen.getByRole("button", { name: "删除 requirements-renamed.docx" }));
    expect(await screen.findByText("文档 requirements-renamed.docx 已删除，可在当前页面恢复。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "恢复 requirements-renamed.docx" }));
    expect(await screen.findByText("文档 requirements-renamed.docx 已恢复。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上传新文档" })).not.toBeInTheDocument();
  });

  it("creates projects with explicit binding and visibility", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    window.history.pushState({}, "", "/projects/new");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    expect(screen.queryByLabelText("课程/班级/team")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "高级设置" }));
    await chooseSelectOption(
      user,
      await findSelectTrigger("课程/班级/team"),
      "软件学院 / 软件工程 2026 春 / 1 班 / Team A",
    );
    await user.click(screen.getByRole("button", { name: "课程班级可见" }));
    expect(screen.queryByText("默认模型策略")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "创建并进入项目" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "课程 UML 实验项目",
          description: null,
          visibility: "team",
          organizationId: "org-software-school",
          courseId: "course-software-2026-spring",
          classId: "class-software-2026-spring-1",
          teamId: "team-software-2026-a",
          backgroundKey: null,
        }),
      }),
    );
    expect(
      await screen.findByText("项目已保存课程/班级/team 归属。"),
    ).toBeInTheDocument();
  });

  it("prefers managed provider configs for logged-in model settings", async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects");
    render(withWorkspaceProviders(<Shell />, repository));

    await waitForPlatformLoadingToExit();
    fireEvent.click(await screen.findByRole("button", { name: "账号" }));
    await user.click(await screen.findByRole("tab", { name: "全局设置" }));
    expect(await screen.findByRole("heading", { name: "全局设置" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "模型" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "偏好" })).not.toBeInTheDocument();
    expect(screen.getAllByText("模型托管配置").length).toBeGreaterThan(0);
    expect(screen.getByText("工作台偏好")).toBeInTheDocument();
    expect(screen.getByText("深色主题")).toBeInTheDocument();
    expect(screen.getByText("字号")).toBeInTheDocument();
    expect(screen.getByText("修改后自动重新生成规则")).toBeInTheDocument();
    expect(screen.getByText("显示过期模型横幅")).toBeInTheDocument();
    expect(
      screen.queryByText("模型托管配置和工作台偏好集中在这里；登录态不会把明文密钥作为主路径保存。"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("登录态必须使用服务端托管 Provider；明文 API Key 只允许显式 dev legacy 模式。"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/课程 OpenAI 托管配置/u)).toBeInTheDocument();
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument();
    await chooseSelectOption(
      user,
      await findSelectTrigger("托管 Provider 配置"),
      "课程 OpenAI 托管配置（托管配置）",
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(loadUserSettings()).toMatchObject({
        providerConfigId: "provider-config-1",
        defaultModel: "gpt-5.5",
        providerDefaultModelSeededFor: "provider-config-1",
      });
    });
    expect(loadUserSettings()).not.toHaveProperty("apiKey");
    expect(screen.queryByRole("button", { name: "测试托管配置" })).not.toBeInTheDocument();
    expect(
      await screen.findByRole(
        "button",
        { name: "添加供应商" },
        { timeout: 5_000 },
      ),
    ).toBeEnabled();
  });

  it("auto-selects the first active managed provider on protected routes", async () => {
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitForPlatformLoadingToExit();
    await waitFor(() => {
      expect(loadUserSettings()).toMatchObject({
        providerConfigId: "provider-config-1",
        providerLabel: "OpenAI",
        providerModelOptions: ["gpt-5.5", "gpt-5.4"],
        defaultModel: "gpt-5.5",
      });
    });
  });

  it("replaces a stale local provider with the first active managed provider", async () => {
    projectApiMode = "authenticated";
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        providerConfigId: "provider-stale",
        providerLabel: "旧 Provider",
        providerModelOptions: ["old-model"],
        providerModelCapabilities: {},
        defaultModel: "old-model",
        imageModel: "gpt-image-2",
        fontSize: "md",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );
    window.history.pushState({}, "", "/projects/library-booking");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitForPlatformLoadingToExit();
    await waitFor(() => {
      expect(loadUserSettings()).toMatchObject({
        providerConfigId: "provider-config-1",
        providerModelOptions: ["gpt-5.5", "gpt-5.4"],
        defaultModel: "gpt-5.5",
      });
    });
  });

  it("hydrates saved provider model catalogs when a project workspace is refreshed", async () => {
    projectApiMode = "authenticated";
    providerConfigFixtures = [
      {
        id: "provider-config-1",
        name: "Nonelinear 模型网关",
        provider: "nonelinear",
        baseUrl: "https://api.nonelinear.com",
        defaultModel: "qwen3.7-plus",
        allowedModels: ["qwen3.7-plus", "qwen3.7-max"],
        modelCapabilities: {
          "qwen3.7-plus": {
            id: "qwen3.7-plus",
            supportsJsonSchema: false,
            supportsJsonObject: true,
            structuredOutputMode: "json_object",
            modeLabel: "JSON 模式",
          },
        },
        maskedKey: "sk-...7e6a",
        status: "active",
        riskState: "low",
        quota: "unlimited",
        lastUsedAt: null,
        scopeType: "system",
        scopeId: null,
      },
    ];
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        providerConfigId: "provider-config-1",
        providerLabel: "Nonelinear",
        providerModelOptions: [],
        providerModelCapabilities: {},
        defaultModel: "qwen3.7-plus",
      }),
    );
    window.history.pushState({}, "", "/projects/library-booking");

    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitForPlatformLoadingToExit();
    expect(await screen.findByRole("heading", { name: "系统需求" })).toBeInTheDocument();
    await waitFor(() => {
      expect(loadUserSettings().providerModelOptions).toEqual([
        "qwen3.7-plus",
        "qwen3.7-max",
      ]);
    });
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "qwen3.7-plus" }).length).toBeGreaterThan(0);
    });
  });

  it("keeps model selection empty when no managed providers are available", async () => {
    projectApiMode = "authenticated";
    providerConfigFixtures = [];
    window.history.pushState({}, "", "/projects/library-booking");

    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitForPlatformLoadingToExit();
    expect(await screen.findByRole("heading", { name: "系统需求" })).toBeInTheDocument();
    expect(loadUserSettings().providerConfigId).toBe("");
    expect(screen.getAllByRole("button", { name: "未选择模型" }).length).toBeGreaterThan(0);
  });

  it("clears stale provider settings when no active providers are available", async () => {
    projectApiMode = "authenticated";
    providerConfigFixtures = [];
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        providerConfigId: "deleted-provider",
        providerLabel: "旧 Provider",
        providerModelOptions: ["old-model"],
        providerModelCapabilities: {
          "old-model": { structuredOutputMode: "strict_json" },
        },
        defaultModel: "old-model",
      }),
    );
    window.history.pushState({}, "", "/projects/library-booking");

    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitForPlatformLoadingToExit();
    expect(await screen.findByRole("heading", { name: "系统需求" })).toBeInTheDocument();
    await waitFor(() => {
      expect(loadUserSettings()).toMatchObject({
        providerConfigId: "",
        providerLabel: "",
        providerModelOptions: [],
        providerModelCapabilities: {},
      });
    });
    expect(screen.getAllByRole("button", { name: "未选择模型" }).length).toBeGreaterThan(0);
  });

  it("blocks returning to the previous protected route after the session is cleared", async () => {
    authSessionMode = "authenticated";
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新建项目" })).toBeEnabled();
    });
    await waitForPlatformLoadingToExit();
    authSessionMode = "unauthenticated";
    window.dispatchEvent(new Event("uml-auth-session-changed"));

    window.history.pushState({}, "", "/projects/library-booking");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(screen.queryByText("项目导航")).not.toBeInTheDocument();
  });

  it("loads account profile through the account profile API", async () => {
    projectApiMode = "authenticated";
    window.history.pushState({}, "", "/projects");
    render(withWorkspaceProviders(<Shell />, createRepository()));

    const openProfileDialog = async () => {
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "新建项目" })).toBeEnabled();
      });
      await waitForPlatformLoadingToExit();
      authSessionMode = "authenticated";
      fireEvent.click(await screen.findByRole("button", { name: "账号" }));
      const accountDialog = await screen.findByRole("dialog", { name: "设置" });
      const input = await within(accountDialog).findByLabelText("昵称");
      await waitFor(() => {
        expect(input).toHaveValue("new-student");
      });
      return { accountDialog, displayNameInput: input };
    };

    let { accountDialog } = await openProfileDialog();
    expect(await within(accountDialog).findByAltText("头像图片")).toHaveAttribute("src", "https://cdn.example.edu/avatar.png");
    expect(screen.queryByLabelText("头像 URL")).not.toBeInTheDocument();
    if (!screen.queryByRole("button", { name: "保存资料" })) {
      ({ accountDialog } = await openProfileDialog());
    }
    expect(within(accountDialog).getByRole("button", { name: "保存资料" })).toBeInTheDocument();
  });
});
