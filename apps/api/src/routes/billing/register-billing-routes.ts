// Registers billing endpoints while delegating payment and entitlement work to BillingService.
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createPaymentOrderRequestSchema,
} from "@uml-platform/contracts";
import { isAuthError, requireAdminRole, requireAuth } from "../../auth/guards.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { BillingService } from "../../billing/billing-service.js";

const CALLBACK_PATH_PREFIX = "/api/billing/callbacks/";

type RawBodyRequest = FastifyRequest & { rawBody?: string };

function rawBodyFromRequest(request: FastifyRequest) {
  const rawBody = (request as RawBodyRequest).rawBody;
  if (typeof rawBody === "string") return rawBody;
  return typeof request.body === "string"
    ? request.body
    : JSON.stringify(request.body ?? {});
}

function queryLimit(query: unknown, fallback = 100) {
  if (!query || typeof query !== "object") return fallback;
  const value = (query as { limit?: unknown }).limit;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : fallback;
}

function parseCreditAdjustment(body: unknown) {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    creditAmount: Number(value.creditAmount),
    reason: typeof value.reason === "string" && value.reason.trim()
      ? value.reason.trim()
      : "Admin adjustment",
  };
}

function sendCallbackError(reply: FastifyReply, error: unknown) {
  const statusCode =
    typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 400;
  reply.code(statusCode);
  return {
    ok: false,
    message: error instanceof Error ? error.message : "Payment callback rejected",
  };
}

async function handleEpayCallback(
  billingService: BillingService,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await billingService.processPaymentCallback({
      channel: "alipay",
      headers: request.headers,
      body: request.method === "GET" ? request.query : request.body,
      rawBody: rawBodyFromRequest(request),
    });
    return reply.type("text/plain").send("success");
  } catch (error) {
    return sendCallbackError(reply, error);
  }
}

export function registerBillingRoutes({
  app,
  authStore,
  billingService,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  billingService: BillingService;
}) {
  app.addHook("preParsing", (request, _reply, payload, done) => {
    if (!request.url.startsWith(CALLBACK_PATH_PREFIX)) {
      done(null, payload);
      return;
    }
    const chunks: Buffer[] = [];
    payload.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    payload.on("error", (error) => {
      done(error);
    });
    payload.on("end", () => {
      const rawBody = Buffer.concat(chunks);
      (request as RawBodyRequest).rawBody = rawBody.toString("utf8");
      const replay = Readable.from(rawBody);
      (replay as Readable & { receivedEncodedLength?: number }).receivedEncodedLength =
        rawBody.length;
      done(null, replay);
    });
  });

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );

  app.get("/api/billing/skus", async () => billingService.listSkus());

  app.get("/api/billing/summary", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    return billingService.getSummary(auth.user.id, {
      grantSignupBonus: auth.user.emailVerified,
    });
  });

  app.post("/api/billing/orders", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const input = createPaymentOrderRequestSchema.parse(request.body);
    const response = await billingService.createOrder(
      { id: auth.user.id, emailVerified: auth.user.emailVerified },
      input,
    );
    reply.code(201);
    return response;
  });

  app.get("/api/billing/orders/by-merchant/:merchantOrderNo", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const { merchantOrderNo } = request.params as { merchantOrderNo: string };
    return billingService.getOrderForUserByMerchantOrderNo(auth.user.id, merchantOrderNo);
  });

  app.post("/api/billing/orders/:orderId/resume", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const { orderId } = request.params as { orderId: string };
    return billingService.resumeOrderForUser(auth.user.id, orderId);
  });

  app.get("/api/billing/orders/:orderId", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const { orderId } = request.params as { orderId: string };
    return billingService.getOrderForUser(auth.user.id, orderId);
  });

  app.get("/api/billing/callbacks/epay", async (request, reply) =>
    handleEpayCallback(billingService, request, reply),
  );

  app.post("/api/billing/callbacks/epay", async (request, reply) =>
    handleEpayCallback(billingService, request, reply),
  );

  app.get("/api/admin/billing/orders", async (request, reply) => {
    const admin = await requireAdminRole(request, reply, authStore, ["super_admin"]);
    if (isAuthError(admin)) return admin;
    return {
      orders: (await billingService.listAdminOrders(queryLimit(request.query))).map((order) => ({
        id: order.id,
        merchantOrderNo: order.merchantOrderNo,
        userId: order.userId,
        sku: order.sku,
        channel: order.provider,
        amountCents: order.amountCents,
        currency: order.currency,
        status: order.status,
        providerTransactionId: order.providerTransactionId,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
      })),
    };
  });

  app.get("/api/admin/billing/users/:userId/ledger", async (request, reply) => {
    const admin = await requireAdminRole(request, reply, authStore, ["super_admin"]);
    if (isAuthError(admin)) return admin;
    const { userId } = request.params as { userId: string };
    return {
      userId,
      ledger: await billingService.listLedgerEntriesForUser(userId),
      summary: await billingService.getSummary(userId),
    };
  });

  app.post("/api/admin/billing/users/:userId/adjustments", async (request, reply) => {
    const admin = await requireAdminRole(request, reply, authStore, ["super_admin"]);
    if (isAuthError(admin)) return admin;
    const { userId } = request.params as { userId: string };
    const input = parseCreditAdjustment(request.body);
    const entry = await billingService.compensateCredits({
      userId,
      creditAmount: input.creditAmount,
      reason: input.reason,
      actorUserId: admin.user.id,
    });
    reply.code(201);
    return { entry };
  });

  app.post("/api/admin/billing/orders/:orderId/refunds", async (request, reply) => {
    const admin = await requireAdminRole(request, reply, authStore, ["super_admin"]);
    if (isAuthError(admin)) return admin;
    const { orderId } = request.params as { orderId: string };
    return {
      order: await billingService.markRefundPending(orderId),
    };
  });

  app.get("/api/admin/billing/notifications", async (request, reply) => {
    const admin = await requireAdminRole(request, reply, authStore, ["super_admin"]);
    if (isAuthError(admin)) return admin;
    return {
      notifications: await billingService.listPaymentNotifications(queryLimit(request.query)),
    };
  });
}
