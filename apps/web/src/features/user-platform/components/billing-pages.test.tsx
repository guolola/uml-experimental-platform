// Covers billing page scale-to-fit layout contracts for entitlement cards, orders, and payment dialogs.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountBillingPage, PricingBillingPage } from "./billing-pages";

const billingSkus = [
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
    sortOrder: 110,
  },
];

const purchaseSku = billingSkus[0]!;

const billingOrder = {
  orderId: "order-test-1",
  merchantOrderNo: "UML202606050001",
  sku: purchaseSku,
  amountCents: purchaseSku.amountCents,
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
          signupBonus: {
            granted: true,
            creditAmount: 10,
            validUntil: "2026-07-05T04:00:00.000Z",
          },
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
    expect(summaryFrame).toHaveTextContent("邮箱验证赠送");

    expect(screen.queryByTestId("billing-sku-group-time")).not.toBeInTheDocument();
    expect(screen.queryByText("日卡")).not.toBeInTheDocument();
    expect(screen.queryByText("月卡")).not.toBeInTheDocument();
    expect(screen.queryByText("年卡")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立即开通" })).not.toBeInTheDocument();
    expect(screen.getByText("买 100 次送 20 次，到账 120 次")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "立即购买" }));

    const dialog = await screen.findByTestId("payment-confirm-dialog");
    const paymentFrame = dialog.querySelector("[data-scale-to-fit]");
    expect(paymentFrame).toHaveTextContent("微信支付");
    expect(paymentFrame).toHaveTextContent("支付宝");
  });
});

describe("PricingBillingPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders only credit packs on the public payment page", async () => {
    stubBillingFetch();
    render(<PricingBillingPage signedIn onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "开通 AI 生成权益" })).toBeInTheDocument();
    expect(screen.getByText("购买次数包后可用于所有可选模型，每次生成扣 1 次。新用户邮箱验证后自动赠送 10 次，有效期 30 天。")).toBeInTheDocument();
    expect(screen.queryByText("通行卡")).not.toBeInTheDocument();
    expect(screen.queryByText("日卡")).not.toBeInTheDocument();
    expect(screen.queryByText("周卡")).not.toBeInTheDocument();
    expect(screen.queryByText("月卡")).not.toBeInTheDocument();
    expect(screen.queryByText("年卡")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立即开通" })).not.toBeInTheDocument();
    expect(screen.getByText("买 100 次送 20 次，到账 120 次")).toBeInTheDocument();
  });
});
