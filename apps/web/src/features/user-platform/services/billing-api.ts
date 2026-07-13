// Wraps billing HTTP endpoints for pricing, account billing, and payment flows.
import type {
  BillingOrderStatusDto,
  BillingSkuListResponse,
  BillingSummary,
  CreatePaymentOrderRequest,
  CreatePaymentOrderResponse,
  ResumePaymentOrderResponse,
} from "@uml-platform/contracts";
import { postJson, requestJson } from "../../../services/api-client";

export const billingApi = {
  listSkus() {
    return requestJson<BillingSkuListResponse>("/api/billing/skus", {
      errorMessage: "权益套餐加载失败",
    });
  },
  getSummary() {
    return requestJson<BillingSummary>("/api/billing/summary", {
      errorMessage: "账户权益加载失败",
    });
  },
  createOrder(input: CreatePaymentOrderRequest) {
    return postJson<CreatePaymentOrderResponse>("/api/billing/orders", input, {
      errorMessage: "支付订单创建失败",
    });
  },
  getOrder(orderId: string) {
    return requestJson<BillingOrderStatusDto>(
      `/api/billing/orders/${encodeURIComponent(orderId)}`,
      {
        errorMessage: "支付订单状态加载失败",
      },
    );
  },
  getOrderByMerchantOrderNo(merchantOrderNo: string) {
    return requestJson<BillingOrderStatusDto>(
      `/api/billing/orders/by-merchant/${encodeURIComponent(merchantOrderNo)}`,
      {
        errorMessage: "支付订单状态加载失败",
      },
    );
  },
  resumeOrder(orderId: string) {
    return requestJson<ResumePaymentOrderResponse>(
      `/api/billing/orders/${encodeURIComponent(orderId)}/resume`,
      {
        method: "POST",
        errorMessage: "继续支付失败",
      },
    );
  },
};
