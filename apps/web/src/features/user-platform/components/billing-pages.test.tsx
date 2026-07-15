// Covers billing page scale-to-fit layout contracts for entitlement cards, orders, and payment dialogs.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { AppI18nProvider } from "../../../app/providers/i18n-provider";
import { i18n, LOCALE_PREFERENCE_STORAGE_KEY } from "../../../shared/i18n";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountBillingPage, AlipayReturnPage, PricingBillingPage } from "./billing-pages";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

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

function renderWithI18n(ui: ReactElement) {
  return render(<AppI18nProvider>{ui}</AppI18nProvider>);
}

const billingOrder = {
  orderId: "order-test-1",
  merchantOrderNo: "UML202606050001",
  sku: purchaseSku,
  amountCents: purchaseSku.amountCents,
  currency: "CNY",
  channel: "alipay",
  status: "pending",
  createdAt: "2026-06-05T04:00:00.000Z",
  expiresAt: "2026-08-05T04:15:00.000Z",
  paidAt: null,
};

const paidBillingOrder = {
  ...billingOrder,
  status: "paid",
  paidAt: "2026-06-05T04:02:00.000Z",
};

function stubBillingFetch({
  order = billingOrder,
  onSummary,
}: {
  order?: typeof billingOrder | typeof paidBillingOrder;
  onSummary?: () => void;
} = {}) {
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
      onSummary?.();
      return new Response(
        JSON.stringify({
          creditBalance: 128,
          signupBonus: {
            granted: true,
            creditAmount: 5,
            validUntil: "2026-07-05T04:00:00.000Z",
          },
          recentOrders: [order],
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
          status: order.status,
          amountCents: order.amountCents,
          currency: order.currency,
          expiresAt: order.expiresAt,
          channel: "alipay",
          paymentFormHtml: "<form action=\"https://zpayz.cn/submit.php\"><button>pay</button></form>",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === `/api/billing/orders/${billingOrder.orderId}/resume` && method === "POST") {
      return new Response(
        JSON.stringify({
          orderId: billingOrder.orderId,
          merchantOrderNo: billingOrder.merchantOrderNo,
          status: order.status,
          amountCents: order.amountCents,
          currency: order.currency,
          expiresAt: order.expiresAt,
          channel: "alipay",
          paymentFormHtml: "<form action=\"https://zpayz.cn/submit.php\"><button>pay</button></form>",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.pathname === `/api/billing/orders/${billingOrder.orderId}` && method === "GET") {
      return new Response(JSON.stringify(order), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (
      url.pathname === `/api/billing/orders/by-merchant/${billingOrder.merchantOrderNo}` &&
      method === "GET"
    ) {
      return new Response(JSON.stringify(order), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("keeps entitlement cards, order table, and payment choices in scale-to-fit layouts", async () => {
    stubBillingFetch();
    const user = userEvent.setup();
    const { container } = renderWithI18n(<AccountBillingPage onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "权益与账单" })).toBeInTheDocument();
    expect(
      container.querySelector(".motion-card, .motion-rise, .motion-action"),
    ).toBeNull();
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
    expect(screen.getByRole("button", { name: "继续支付" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "立即购买" }));

    const dialog = await screen.findByTestId("payment-confirm-dialog");
    const paymentFrame = dialog.querySelector("[data-scale-to-fit]");
    expect(paymentFrame).toHaveTextContent("支付宝");
    expect(paymentFrame).not.toHaveTextContent("微信支付");
    expect(paymentFrame).not.toHaveTextContent("支付金额以后端 SKU 为准");
  });

  it("resumes pending orders from the order table", async () => {
    stubBillingFetch();
    const user = userEvent.setup();
    const navigate = vi.fn();
    renderWithI18n(<AccountBillingPage onNavigate={navigate} />);

    await user.click(await screen.findByRole("button", { name: "继续支付" }));

    expect(navigate).toHaveBeenCalledWith(`/billing/alipay/return?orderId=${billingOrder.orderId}`);
    expect(window.sessionStorage.getItem(`uml-alipay-form:${billingOrder.orderId}`)).toContain(
      "zpayz.cn/submit.php",
    );
  });

  it("renders account billing system UI in English while preserving SKU text", async () => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "en");
    stubBillingFetch();
    renderWithI18n(<AccountBillingPage onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "Credits and billing" })).toBeInTheDocument();
    expect(screen.getByText("Order history")).toBeInTheDocument();
    expect(screen.getByText("Order no.")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume payment" })).toBeInTheDocument();
    expect(screen.getAllByText("100 次包").length).toBeGreaterThan(0);
    expect(screen.getByText("买 100 次送 20 次，到账 120 次")).toBeInTheDocument();
  });

  it("shows payment success feedback on account billing and clears the return marker", async () => {
    await i18n.changeLanguage("zh-CN");
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "zh-CN");
    const onSummary = vi.fn();
    stubBillingFetch({ order: paidBillingOrder, onSummary });
    window.history.pushState(
      {},
      "",
      `/account/billing?payment=success&orderId=${billingOrder.orderId}`,
    );

    renderWithI18n(<AccountBillingPage onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "权益与账单" })).toBeInTheDocument();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("支付成功，次数已到账");
    });
    expect(window.location.pathname).toBe("/account/billing");
    expect(window.location.search).toBe("");
    expect(onSummary).toHaveBeenCalled();
  });
});

describe("AlipayReturnPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("can recover the order from the merchant order number returned by ZPAY", async () => {
    stubBillingFetch();
    window.history.pushState(
      {},
      "",
      `/billing/alipay/return?out_trade_no=${billingOrder.merchantOrderNo}`,
    );

    const navigate = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithI18n(<AlipayReturnPage onNavigate={navigate} />);

    expect(
      container.querySelector(".motion-card, .motion-rise, .motion-action"),
    ).toBeNull();

    expect(
      await screen.findAllByText((_, element) =>
        Boolean(element?.textContent?.includes(billingOrder.merchantOrderNo)),
      ),
    ).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "返回支付页面" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回项目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回定价" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回支付页面" }));
    expect(navigate).toHaveBeenCalledWith("/account/billing");
  });

  it("returns to account billing with success marker after the backend confirms payment", async () => {
    stubBillingFetch({ order: paidBillingOrder });
    window.history.pushState(
      {},
      "",
      `/billing/alipay/return?orderId=${billingOrder.orderId}`,
    );
    const navigate = vi.fn();

    renderWithI18n(<AlipayReturnPage onNavigate={navigate} />);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        `/account/billing?payment=success&orderId=${billingOrder.orderId}`,
      );
    });
  });
});

describe("PricingBillingPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("renders only credit packs on the public payment page", async () => {
    stubBillingFetch();
    const { container } = renderWithI18n(<PricingBillingPage signedIn onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "开通 AI 生成权益" })).toBeInTheDocument();
    expect(
      container.querySelector(".motion-card, .motion-rise, .motion-action"),
    ).toBeNull();
    expect(screen.getByText("购买次数包后可用于所有可选模型，每次生成扣 1 次。新用户邮箱验证后自动赠送 30 次，有效期 30 天。")).toBeInTheDocument();
    expect(screen.queryByText("通行卡")).not.toBeInTheDocument();
    expect(screen.queryByText("日卡")).not.toBeInTheDocument();
    expect(screen.queryByText("周卡")).not.toBeInTheDocument();
    expect(screen.queryByText("月卡")).not.toBeInTheDocument();
    expect(screen.queryByText("年卡")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立即开通" })).not.toBeInTheDocument();
    expect(screen.getByText("买 100 次送 20 次，到账 120 次")).toBeInTheDocument();
  });

  it("renders public payment system UI in English while preserving SKU text", async () => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "en");
    stubBillingFetch();
    renderWithI18n(<PricingBillingPage signedIn onNavigate={() => {}} />);

    expect(await screen.findByRole("heading", { name: "Enable AI generation credits" })).toBeInTheDocument();
    expect(screen.getByText("Credit packs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy now" })).toBeInTheDocument();
    expect(screen.getAllByText("100 次包").length).toBeGreaterThan(0);
    expect(screen.getByText("买 100 次送 20 次，到账 120 次")).toBeInTheDocument();
  });
});
