// Covers billing page scale-to-fit layout contracts for entitlement cards, orders, and payment dialogs.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountBillingPage } from "./billing-pages";

const billingSkus = [
  {
    code: "time_day",
    name: "日卡",
    kind: "time_pass",
    description: "1 天 AI 生成通行卡",
    durationDays: 1,
    creditAmount: null,
    amountCents: 990,
    currency: "CNY",
    active: true,
    sortOrder: 10,
  },
  {
    code: "credits_100",
    name: "100 次包",
    kind: "credit_pack",
    description: "100 次 AI 生成次数包",
    durationDays: null,
    creditAmount: 100,
    amountCents: 6900,
    currency: "CNY",
    active: true,
    sortOrder: 110,
  },
];

const billingOrder = {
  orderId: "order-test-1",
  merchantOrderNo: "UML202606050001",
  sku: billingSkus[0],
  amountCents: billingSkus[0].amountCents,
  currency: "CNY",
  channel: "wechat_native",
  status: "pending",
  createdAt: "2026-06-05T04:00:00.000Z",
  expiresAt: "2026-06-05T04:15:00.000Z",
  paidAt: null,
};

function stubBillingFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://127.0.0.1:4101");
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/billing/skus") {
      return new Response(JSON.stringify({ skus: billingSkus }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/api/billing/summary") {
      return new Response(
        JSON.stringify({
          creditBalance: 128,
          activePass: {
            name: "周卡",
            validUntil: "2026-06-25T04:00:00.000Z",
          },
          signupBonus: {
            granted: true,
            creditAmount: 5,
            validUntil: "2026-07-05T04:00:00.000Z",
          },
          passDailyUsage: { usedToday: 0, limit: 50 },
          recentOrders: [billingOrder],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === "/api/billing/orders" && method === "POST") {
      return new Response(
        JSON.stringify({
          orderId: billingOrder.orderId,
          merchantOrderNo: billingOrder.merchantOrderNo,
          status: billingOrder.status,
          amountCents: billingOrder.amountCents,
          currency: billingOrder.currency,
          expiresAt: billingOrder.expiresAt,
          channel: "wechat_native",
          codeUrl: "weixin://wxpay/bizpayurl?pr=test-order",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ message: "Unhandled test request" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
}

describe("AccountBillingPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps entitlement cards, order table, and payment choices in scale-to-fit layouts", async () => {
    stubBillingFetch();
    const user = userEvent.setup();
    render(<AccountBillingPage onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "权益与账单" })).toBeInTheDocument();
    const orderTable = await screen.findByTestId("billing-order-table");
    expect(orderTable.closest("[data-scale-to-fit]")).toHaveAttribute(
      "data-scale-to-fit",
      "natural",
    );
    const summaryFrame = screen.getByText("可用次数").closest("[data-scale-to-fit]");
    expect(summaryFrame).toHaveTextContent("当前通行卡");

    await user.click(screen.getByRole("button", { name: "立即开通" }));

    const dialog = await screen.findByTestId("payment-confirm-dialog");
    const paymentFrame = dialog.querySelector("[data-scale-to-fit]");
    expect(paymentFrame).toHaveTextContent("微信支付");
    expect(paymentFrame).toHaveTextContent("支付宝");
  });
});
