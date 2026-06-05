// Renders billing and payment UI for public pricing and authenticated account pages.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import type {
  BillingOrderStatusDto,
  BillingSkuDto,
  BillingSummary,
  CreatePaymentOrderResponse,
  PaymentChannel,
} from "@uml-platform/contracts";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { cn } from "../../../shared/ui/utils";
import { billingApi } from "../services/billing-api";

type Navigate = (path: string) => void;

function formatCny(amountCents: number) {
  return `¥${(amountCents / 100).toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) return "未生效";
  return new Date(value).toLocaleString("zh-CN");
}

function skuMetric(sku: BillingSkuDto) {
  if (sku.kind === "time_pass") {
    return `${sku.durationDays ?? 0} 天`;
  }
  return `${sku.creditAmount ?? 0} 次`;
}

function skuFeatures(sku: BillingSkuDto) {
  if (sku.kind === "time_pass") {
    return [
      `${skuMetric(sku)}内优先使用通行卡`,
      "高频使用时提示清晰",
      "可叠加次数包继续生成",
    ];
  }
  return [
    `增加 ${skuMetric(sku)}生成次数`,
    "无通行卡时可直接抵扣",
    "默认不过期，适合低频使用",
  ];
}

function isRecommendedSku(sku: BillingSkuDto) {
  return sku.code === "time_month" || /month|月/u.test(sku.name);
}

function channelLabel(channel: PaymentChannel) {
  return channel === "wechat_native" ? "微信支付" : "支付宝";
}

function orderStatusLabel(status: BillingOrderStatusDto["status"]) {
  const labels: Record<BillingOrderStatusDto["status"], string> = {
    pending: "待支付",
    paid: "已支付",
    expired: "已过期",
    closed: "已关闭",
    failed: "支付失败",
    refund_pending: "退款中",
    refunded: "已退款",
  };
  return labels[status];
}

function formatCountdown(expiresAt?: string) {
  if (!expiresAt) return "--:--";
  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function usePaymentCountdown(expiresAt?: string, active = true) {
  const [countdown, setCountdown] = useState(() => formatCountdown(expiresAt));

  useEffect(() => {
    if (!active || !expiresAt) {
      setCountdown(formatCountdown(expiresAt));
      return undefined;
    }
    setCountdown(formatCountdown(expiresAt));
    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(expiresAt));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [active, expiresAt]);

  return countdown;
}

function storageKey(orderId: string) {
  return `uml-alipay-form:${orderId}`;
}

const paymentPrimaryButtonClass =
  "motion-action h-11 rounded-lg border border-[#2b23ad]/10 bg-[#4441c4] px-5 font-display text-[15px] font-semibold leading-6 text-white shadow-sm shadow-[#4441c4]/20 hover:bg-[#3530b6] hover:shadow-md";

const paymentSecondaryButtonClass =
  "motion-action h-11 rounded-lg border border-[#c7c4d6] bg-[#eef3ff] px-5 font-display text-[15px] font-semibold leading-6 text-[#4441c4] hover:bg-white hover:text-[#3530b6]";

function useBillingSkus() {
  const [skus, setSkus] = useState<BillingSkuDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    billingApi
      .listSkus()
      .then((response) => {
        if (!active) return;
        setSkus(response.skus);
        setError("");
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "套餐加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { skus, loading, error };
}

function PaymentMethodCard({
  channel,
  active,
  onSelect,
}: {
  channel: PaymentChannel;
  active: boolean;
  onSelect: (channel: PaymentChannel) => void;
}) {
  const Icon = channel === "wechat_native" ? QrCode : CreditCard;
  return (
    <button
      type="button"
      data-testid="payment-method-card"
      aria-pressed={active}
      onClick={() => onSelect(channel)}
      className={cn(
        "motion-action grid rounded-lg border bg-white p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4441c4]/30",
        active
          ? "border-[#5d5cde] shadow-[0_0_0_3px_rgba(93,92,222,0.12)]"
          : "border-[#c7c4d6] hover:border-[#5d5cde]/70 hover:bg-[#f8f9ff]",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-display text-[15px] font-semibold leading-6 text-[#0b1c30]">
          <span
            className={cn(
              "grid size-8 place-items-center rounded-lg",
              channel === "wechat_native"
                ? "bg-[#e8f8ef] text-[#18b957]"
                : "bg-[#eff4ff] text-[#1677ff]",
            )}
          >
            <Icon className="size-4" />
          </span>
          {channelLabel(channel)}
        </span>
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full border",
            active ? "border-[#5d5cde] bg-[#5d5cde] text-white" : "border-[#c7c4d6] text-transparent",
          )}
        >
          <Check className="size-3" />
        </span>
      </span>
      <span className="mt-3 text-[13px] leading-5 text-[#5b5e69]">
        {channel === "wechat_native" ? "使用微信扫码完成支付" : "跳转支付宝电脑网站支付"}
      </span>
    </button>
  );
}

function PaymentConfirmDialog({
  sku,
  open,
  creating,
  error,
  channel,
  onChannelChange,
  onOpenChange,
  onConfirm,
}: {
  sku: BillingSkuDto | null;
  open: boolean;
  creating: boolean;
  error: string;
  channel: PaymentChannel;
  onChannelChange: (channel: PaymentChannel) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="payment-confirm-dialog"
        overlayClassName="bg-[#6f7c8f]/70 backdrop-blur-[1px]"
        className="overflow-hidden rounded-xl border-[#dfe3f5] bg-white p-0 shadow-[0_24px_80px_rgba(11,28,48,0.18)] sm:max-w-[440px]"
      >
        <DialogHeader className="border-b border-[#e3e7f6] px-6 py-5 pr-12 text-left">
          <DialogTitle className="font-display text-[20px] font-semibold leading-7 text-[#0b1c30]">
            支付确认
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-5 text-[#6b7080]">
            请确认套餐内容与支付方式。
          </DialogDescription>
        </DialogHeader>
        {sku && (
          <div className="grid gap-4 px-6 py-5">
            <section className="rounded-xl border border-[#e3e7f6] bg-[#fbfcff] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[12px] font-medium leading-5 text-[#7a7f90]">购买内容</div>
                  <div className="mt-1 font-display text-[16px] font-semibold leading-6 text-[#0b1c30]">
                    {sku.name}
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-[#6b7080]">{sku.description}</p>
                </div>
                <Badge className="border-[#d8ddfb] bg-[#f0f2ff] text-[#4441c4]" variant="outline">
                  {skuMetric(sku)}
                </Badge>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <span className="text-[12px] leading-5 text-[#7a7f90]">订单金额</span>
                <span className="font-display text-[28px] font-bold leading-9 tracking-normal text-[#4441c4]">
                  {formatCny(sku.amountCents)}
                </span>
              </div>
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <PaymentMethodCard
                channel="wechat_native"
                active={channel === "wechat_native"}
                onSelect={onChannelChange}
              />
              <PaymentMethodCard
                channel="alipay_page"
                active={channel === "alipay_page"}
                onSelect={onChannelChange}
              />
            </div>
            <div className="rounded-lg border border-[#ffe2d6] bg-[#fff1ec] px-3 py-2 text-[12px] leading-5 text-[#b84a1f]">
              支付金额以后端 SKU 为准，请在第三方支付页确认金额一致。
            </div>
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                {error}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-[#e3e7f6] bg-[#f8f9ff] px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            className="motion-action rounded-lg px-0 text-[14px] text-[#6b7080] hover:bg-transparent hover:text-[#0b1c30]"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!sku || creating}
            className={paymentPrimaryButtonClass}
            onClick={onConfirm}
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <WalletCards className="size-4" />}
            {creating ? "正在创建订单" : "立即支付"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WechatQrDialog({
  order,
  open,
  polling,
  onOpenChange,
  onRefresh,
}: {
  order: CreatePaymentOrderResponse | null;
  open: boolean;
  polling: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}) {
  const countdown = usePaymentCountdown(order?.expiresAt, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="wechat-qr-dialog"
        overlayClassName="bg-[#6f7c8f]/75 backdrop-blur-[1px]"
        className="overflow-hidden rounded-xl border-[#dfe3f5] bg-white p-0 shadow-[0_24px_80px_rgba(11,28,48,0.22)] sm:max-w-[430px]"
      >
        <DialogHeader className="border-b border-[#e3e7f6] px-6 py-5 pr-12 text-left">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-[#e8f8ef] text-[#18b957]">
              <QrCode className="size-5" />
            </span>
            <div>
              <DialogTitle className="font-display text-[22px] font-semibold leading-8 text-[#0b1c30]">
                微信支付
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-5 text-[#6b7080]">
                {order ? `订单号 ${order.merchantOrderNo}` : "等待订单"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="grid justify-items-center gap-5 px-6 py-6">
          <div className="text-center">
            <div className="text-[13px] leading-5 text-[#7a7f90]">支付金额</div>
            <div className="mt-1 font-display text-[34px] font-bold leading-10 tracking-normal text-[#4441c4]">
              {order ? formatCny(order.amountCents) : "¥--"}
            </div>
          </div>
          <div className="rounded-xl border border-[#e3e7f6] bg-white p-4 shadow-[0_4px_20px_rgba(11,28,48,0.06)]">
            {order?.codeUrl ? (
              <QRCodeSVG value={order.codeUrl} size={220} />
            ) : (
              <div className="grid size-[220px] place-items-center text-[13px] text-[#7a7f90]">
                二维码生成中
              </div>
            )}
          </div>
          <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#eef3ff] px-4 py-3 text-[14px] leading-6 text-[#464554]">
            <QrCode className="size-4 text-[#4441c4]" />
            请使用微信扫一扫完成支付
          </div>
          <div className="flex items-center gap-2 text-[14px] leading-6 text-[#6b7080]">
            {polling ? <RefreshCw className="size-4 animate-spin text-[#4441c4]" /> : <Clock3 className="size-4" />}
            支付倒计时
            <span className="rounded-md bg-[#f0f2ff] px-2 py-0.5 font-mono font-semibold text-[#4441c4]">
              {countdown}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#e3e7f6] bg-[#f8f9ff] px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            className="motion-action rounded-lg px-0 text-[14px] text-[#6b7080] hover:bg-transparent hover:text-[#0b1c30]"
            onClick={() => onOpenChange(false)}
          >
            取消支付
          </Button>
          <Button type="button" className={paymentPrimaryButtonClass} onClick={onRefresh}>
            <RefreshCw className="size-4" />
            刷新状态
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BillingSkuGrid({
  skus,
  loading,
  error,
  signedIn,
  onNavigate,
  onSelect,
  variant = "pricing",
}: {
  skus: BillingSkuDto[];
  loading: boolean;
  error: string;
  signedIn: boolean;
  onNavigate: Navigate;
  onSelect: (sku: BillingSkuDto) => void;
  variant?: "pricing" | "account";
}) {
  const groups = useMemo(
    () => ({
      time: skus.filter((sku) => sku.kind === "time_pass"),
      credits: skus.filter((sku) => sku.kind === "credit_pack"),
    }),
    [skus],
  );
  if (loading) {
    return (
      <div className="motion-card rounded-xl border border-[#c7c4d6] bg-white p-6 text-[14px] leading-6 text-[#464554] shadow-[0_4px_20px_rgba(11,28,48,0.05)]">
        正在加载套餐...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-[14px] leading-6 text-destructive">
        {error}
      </div>
    );
  }
  const groupDefs = [
    { key: "time", title: "通行卡", subtitle: "时效会员", items: groups.time },
    { key: "credits", title: "次数包", subtitle: "永久次数", items: groups.credits },
  ];
  return (
    <div data-testid="billing-sku-grid" className={cn("grid", variant === "pricing" ? "gap-10" : "gap-6")}>
      {groupDefs.map((group, groupIndex) => (
        <section
          key={group.key}
          data-testid={`billing-sku-group-${group.key}`}
          className={cn("grid", variant === "pricing" ? "gap-5" : "gap-4")}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-6 w-1 rounded-full bg-[#4441c4]" />
              <h2 className="font-display text-[22px] font-semibold leading-8 tracking-normal text-[#0b1c30]">
                {group.title}
              </h2>
              <Badge className="border-[#d8ddfb] bg-[#f0f2ff] text-[#4441c4]" variant="outline">
                {group.subtitle}
              </Badge>
            </div>
          </div>
          <div
            className={cn(
              "grid gap-4",
              variant === "pricing"
                ? "sm:grid-cols-2 xl:grid-cols-4"
                : "sm:grid-cols-2 xl:grid-cols-4",
            )}
          >
            {group.items.map((sku, index) => (
              <BillingSkuCard
                key={sku.code}
                sku={sku}
                signedIn={signedIn}
                variant={variant}
                recommended={isRecommendedSku(sku)}
                motionDelay={`${groupIndex * 120 + index * 80}ms`}
                onNavigate={onNavigate}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function BillingSkuCard({
  sku,
  signedIn,
  variant,
  recommended,
  motionDelay,
  onNavigate,
  onSelect,
}: {
  sku: BillingSkuDto;
  signedIn: boolean;
  variant: "pricing" | "account";
  recommended: boolean;
  motionDelay: string;
  onNavigate: Navigate;
  onSelect: (sku: BillingSkuDto) => void;
}) {
  const actionLabel = signedIn
    ? sku.kind === "time_pass" ? "立即开通" : "立即购买"
    : "登录后购买";
  return (
    <article
      data-testid={recommended ? "billing-recommended-sku" : "billing-sku-card"}
      className={cn(
        "motion-card relative grid overflow-hidden rounded-xl border bg-white text-left shadow-[0_4px_20px_rgba(11,28,48,0.05)] transition-all",
        variant === "pricing" ? "min-h-[255px] gap-4 p-5" : "min-h-[230px] gap-3 p-4",
        recommended
          ? "border-[#5d5cde] shadow-[0_12px_32px_rgba(68,65,196,0.14)] ring-1 ring-[#5d5cde]"
          : "border-[#c7c4d6] hover:border-[#5d5cde]/70",
      )}
      style={{ "--motion-delay": motionDelay } as CSSProperties}
    >
      {recommended && (
        <span className="absolute right-4 top-0 rounded-b-lg bg-[#4441c4] px-3 py-1 text-[11px] font-semibold leading-4 text-white">
          推荐套餐
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[20px] font-semibold leading-7 tracking-normal text-[#0b1c30]">
            {sku.name}
          </h3>
          <p className="mt-2 min-h-10 text-[13px] leading-5 text-[#5b5e69]">{sku.description}</p>
        </div>
        <Badge
          className={cn(
            "border px-2.5 py-1 text-[12px]",
            sku.kind === "time_pass"
              ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
              : "border-[#bbf7d0] bg-[#ecfdf3] text-[#047857]",
          )}
          variant="outline"
        >
          {skuMetric(sku)}
        </Badge>
      </div>
      <ul className="grid gap-1.5 text-[12px] leading-5 text-[#464554]">
        {skuFeatures(sku).map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#22c55e]" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <div className="font-display text-[30px] font-bold leading-9 tracking-normal text-[#0b1c30]">
          {formatCny(sku.amountCents)}
        </div>
      </div>
      <Button
        type="button"
        className={cn(
          "mt-1 w-full",
          recommended ? paymentPrimaryButtonClass : paymentSecondaryButtonClass,
        )}
        onClick={() => {
          if (!signedIn) {
            onNavigate("/login");
            return;
          }
          onSelect(sku);
        }}
      >
        <WalletCards className="size-4" />
        {actionLabel}
      </Button>
    </article>
  );
}

function usePaymentFlow(onNavigate: Navigate, onPaid?: () => void) {
  const [selectedSku, setSelectedSku] = useState<BillingSkuDto | null>(null);
  const [channel, setChannel] = useState<PaymentChannel>("wechat_native");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [wechatOrder, setWechatOrder] = useState<CreatePaymentOrderResponse | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [polling, setPolling] = useState(false);

  const refreshOrder = async (orderId: string) => {
    const order = await billingApi.getOrder(orderId);
    if (order.status === "paid") {
      setQrOpen(false);
      onPaid?.();
    }
    return order;
  };

  useEffect(() => {
    if (!qrOpen || !wechatOrder) return undefined;
    let active = true;
    const timer = window.setInterval(() => {
      setPolling(true);
      refreshOrder(wechatOrder.orderId)
        .catch(() => undefined)
        .finally(() => {
          if (active) setPolling(false);
        });
    }, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [qrOpen, wechatOrder?.orderId]);

  const createOrder = async () => {
    if (!selectedSku) return;
    setCreating(true);
    setError("");
    try {
      const response = await billingApi.createOrder({
        skuCode: selectedSku.code,
        channel,
        returnUrl: `${window.location.origin}/billing/alipay/return`,
      });
      if (response.channel === "wechat_native") {
        setSelectedSku(null);
        setWechatOrder(response);
        setQrOpen(true);
        return;
      }
      if (response.paymentFormHtml) {
        window.sessionStorage.setItem(storageKey(response.orderId), response.paymentFormHtml);
      }
      setSelectedSku(null);
      onNavigate(`/billing/alipay/return?orderId=${encodeURIComponent(response.orderId)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "订单创建失败");
    } finally {
      setCreating(false);
    }
  };

  return {
    selectedSku,
    setSelectedSku,
    channel,
    setChannel,
    creating,
    error,
    createOrder,
    wechatOrder,
    qrOpen,
    setQrOpen,
    polling,
    refreshWechatOrder: () => {
      if (!wechatOrder) return;
      void refreshOrder(wechatOrder.orderId);
    },
  };
}

export function PricingBillingPage({
  signedIn,
  onNavigate,
}: {
  signedIn: boolean;
  onNavigate: Navigate;
}) {
  const { skus, loading, error } = useBillingSkus();
  const payment = usePaymentFlow(onNavigate);
  return (
    <section
      data-testid="pricing-payment-page"
      className="flex flex-1 bg-[#f8f9ff] px-[clamp(1.5rem,4vw,7rem)] py-[clamp(3rem,6vh,5.5rem)]"
    >
      <div className="mx-auto grid w-full max-w-[1400px] content-start gap-10">
        <div className="motion-rise mx-auto grid max-w-4xl gap-3 text-center">
          <div className="mx-auto inline-flex w-fit items-center gap-2 rounded-full border border-[#d8ddfb] bg-white px-3 py-1 text-[12px] font-medium leading-5 text-[#4441c4] shadow-sm">
            <BadgeCheck className="size-3.5" />
            支付权益
          </div>
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-normal text-[#0b1c30] md:text-[44px] md:leading-[52px]">
            开通 AI 生成权益
          </h1>
          <p className="text-[15px] leading-[24px] text-[#464554] md:text-[16px]">
            通行卡优先覆盖生成任务；高频使用受限时可用次数包继续生成。新用户邮箱验证后自动赠送 5 次，有效期 30 天。
          </p>
        </div>
        <BillingSkuGrid
          skus={skus}
          loading={loading}
          error={error}
          signedIn={signedIn}
          onNavigate={onNavigate}
          onSelect={payment.setSelectedSku}
          variant="pricing"
        />
      </div>
      <PaymentConfirmDialog
        sku={payment.selectedSku}
        open={Boolean(payment.selectedSku)}
        creating={payment.creating}
        error={payment.error}
        channel={payment.channel}
        onChannelChange={payment.setChannel}
        onOpenChange={(open) => {
          if (!open) payment.setSelectedSku(null);
        }}
        onConfirm={payment.createOrder}
      />
      <WechatQrDialog
        order={payment.wechatOrder}
        open={payment.qrOpen}
        polling={payment.polling}
        onOpenChange={payment.setQrOpen}
        onRefresh={payment.refreshWechatOrder}
      />
    </section>
  );
}

function SummaryPanel({ summary }: { summary: BillingSummary }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="motion-card rounded-xl border border-[#e3e7f6] bg-white p-5 shadow-[0_4px_20px_rgba(11,28,48,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium leading-5 text-[#6b7080]">可用次数</div>
          <span className="grid size-8 place-items-center rounded-lg bg-[#f0f2ff] text-[#4441c4]">
            <WalletCards className="size-4" />
          </span>
        </div>
        <div className="mt-4 font-display text-[34px] font-bold leading-10 tracking-normal text-[#0b1c30]">
          {summary.creditBalance}
        </div>
        <div className="mt-1 text-[12px] leading-5 text-[#22a06b]">
          邮箱验证赠送会自动计入余额
        </div>
      </section>
      <section className="motion-card rounded-xl border border-[#e3e7f6] bg-white p-5 shadow-[0_4px_20px_rgba(11,28,48,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium leading-5 text-[#6b7080]">当前通行卡</div>
          <span className="grid size-8 place-items-center rounded-lg bg-[#f0f2ff] text-[#4441c4]">
            <Clock3 className="size-4" />
          </span>
        </div>
        <div className="mt-4 font-display text-[22px] font-semibold leading-8 text-[#0b1c30]">
          {summary.activePass ? summary.activePass.name : "未开通"}
        </div>
        <div className="mt-1 text-[13px] leading-5 text-[#5b5e69]">
          {summary.activePass ? `有效至 ${formatDate(summary.activePass.validUntil)}` : "可购买日卡、周卡、月卡或年卡"}
        </div>
      </section>
    </div>
  );
}

export function AccountBillingPage({ onNavigate }: { onNavigate: Navigate }) {
  const { skus, loading, error } = useBillingSkus();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const refreshSummary = () => {
    setSummaryLoading(true);
    billingApi
      .getSummary()
      .then((response) => {
        setSummary(response);
        setSummaryError("");
      })
      .catch((nextError: unknown) => {
        setSummaryError(nextError instanceof Error ? nextError.message : "权益加载失败");
      })
      .finally(() => setSummaryLoading(false));
  };
  const payment = usePaymentFlow(onNavigate, refreshSummary);

  useEffect(() => {
    refreshSummary();
  }, []);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#f8f9ff]">
      <div
        data-testid="account-billing-dashboard"
        className="mx-auto grid w-full max-w-[1440px] gap-6 px-[clamp(1rem,3vw,2rem)] py-6"
      >
        <section className="grid min-w-0 flex-1 content-start gap-6">
          <div className="motion-rise flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-[28px] font-bold leading-9 tracking-normal text-[#0b1c30]">
                权益与账单
              </h1>
              <p className="mt-2 max-w-3xl text-[14px] leading-6 text-[#464554]">
                查看当前通行卡、次数余额、邮箱验证赠送和最近支付订单。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="motion-action rounded-lg border-[#c7c4d6] bg-white text-[#4441c4] hover:bg-[#f0f2ff] hover:text-[#3530b6]"
              onClick={refreshSummary}
            >
              <RefreshCw className="size-4" />
              刷新
            </Button>
          </div>
          {summaryLoading && (
            <div className="motion-card rounded-xl border border-[#c7c4d6] bg-white p-5 text-[14px] leading-6 text-[#464554]">
              正在加载权益...
            </div>
          )}
          {summaryError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-[14px] leading-6 text-destructive">
              {summaryError}
            </div>
          )}
          {summary && <SummaryPanel summary={summary} />}
          {summary?.signupBonus.granted && (
            <div className="motion-rise flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] leading-6 text-emerald-900">
              <CheckCircle2 className="size-4" />
              邮箱验证赠送 {summary.signupBonus.creditAmount} 次，有效至 {formatDate(summary.signupBonus.validUntil)}
            </div>
          )}
          <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-[22px] font-semibold leading-8 text-[#0b1c30]">
                购买权益
              </h2>
              <span className="text-[13px] leading-5 text-[#7a7f90]">
                通行卡优先，次数包兜底
              </span>
            </div>
            <BillingSkuGrid
              skus={skus}
              loading={loading}
              error={error}
              signedIn
              onNavigate={onNavigate}
              onSelect={payment.setSelectedSku}
              variant="account"
            />
          </section>
          <section className="motion-card overflow-hidden rounded-xl border border-[#e3e7f6] bg-white shadow-[0_4px_20px_rgba(11,28,48,0.05)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#e3e7f6] px-5 py-4">
              <h2 className="font-display text-[20px] font-semibold leading-7 text-[#0b1c30]">
                订单历史
              </h2>
              <Badge className="border-transparent bg-[#eef3ff] text-[#4441c4]" variant="secondary">
                {summary?.recentOrders.length ?? 0} 条
              </Badge>
            </div>
            {summary?.recentOrders.length ? (
              <div className="overflow-x-auto">
                <table data-testid="billing-order-table" className="w-full min-w-[640px] text-left text-[13px] leading-5">
                  <thead className="bg-[#f8f9ff] text-[#7a7f90]">
                    <tr>
                      <th className="px-5 py-3 font-medium">订单号</th>
                      <th className="px-5 py-3 font-medium">套餐</th>
                      <th className="px-5 py-3 font-medium">金额</th>
                      <th className="px-5 py-3 font-medium">状态</th>
                      <th className="px-5 py-3 font-medium">创建时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ff] text-[#464554]">
                    {summary.recentOrders.map((order) => (
                      <tr key={order.orderId} className="transition-colors hover:bg-[#fbfcff]">
                        <td className="px-5 py-3 font-mono text-[12px] text-[#5b5e69]">
                          {order.merchantOrderNo}
                        </td>
                        <td className="px-5 py-3 font-medium text-[#0b1c30]">{order.sku.name}</td>
                        <td className="px-5 py-3">{formatCny(order.amountCents)}</td>
                        <td className="px-5 py-3">
                          <Badge
                            className={cn(
                              "border-transparent",
                              order.status === "paid"
                                ? "bg-[#ecfdf3] text-[#047857]"
                                : "bg-[#eef3ff] text-[#4441c4]",
                            )}
                            variant="secondary"
                          >
                            {orderStatusLabel(order.status)}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-[#6b7080]">{formatDate(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-[14px] leading-6 text-[#7a7f90]">
                暂无订单。
              </div>
            )}
          </section>
        </section>
      </div>
      <PaymentConfirmDialog
        sku={payment.selectedSku}
        open={Boolean(payment.selectedSku)}
        creating={payment.creating}
        error={payment.error}
        channel={payment.channel}
        onChannelChange={payment.setChannel}
        onOpenChange={(open) => {
          if (!open) payment.setSelectedSku(null);
        }}
        onConfirm={payment.createOrder}
      />
      <WechatQrDialog
        order={payment.wechatOrder}
        open={payment.qrOpen}
        polling={payment.polling}
        onOpenChange={payment.setQrOpen}
        onRefresh={payment.refreshWechatOrder}
      />
    </main>
  );
}

export function AlipayReturnPage({ onNavigate }: { onNavigate: Navigate }) {
  const [order, setOrder] = useState<BillingOrderStatusDto | null>(null);
  const [error, setError] = useState("");
  const bridgeRef = useRef<HTMLDivElement | null>(null);
  const orderId = typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("orderId") ?? "";

  useEffect(() => {
    if (!orderId) {
      setError("缺少订单号");
      return;
    }
    const formHtml = window.sessionStorage.getItem(storageKey(orderId));
    if (formHtml && bridgeRef.current) {
      bridgeRef.current.innerHTML = formHtml;
      const form = bridgeRef.current.querySelector("form") as HTMLFormElement | null;
      form?.submit();
    }
    let active = true;
    const load = () => {
      billingApi
        .getOrder(orderId)
        .then((response) => {
          if (active) setOrder(response);
        })
        .catch((nextError: unknown) => {
          if (active) setError(nextError instanceof Error ? nextError.message : "订单状态加载失败");
        });
    };
    load();
    const timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [orderId]);

  return (
    <main className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-[#f8f9ff] px-6 py-10">
      <div className="absolute left-6 top-6 flex items-center gap-2 text-[#0b1c30]">
        <span className="grid size-8 place-items-center rounded-lg bg-[#4441c4] text-white">
          <BadgeCheck className="size-4" />
        </span>
        <span className="font-display text-[14px] font-semibold leading-5">UML Lab</span>
      </div>
      <section
        data-testid="alipay-processing-card"
        className="motion-card grid w-full max-w-[420px] gap-5 overflow-hidden rounded-xl border border-[#e3e7f6] bg-white text-center shadow-[0_18px_60px_rgba(68,65,196,0.10)]"
      >
        <div className="h-1.5 bg-[#5d5cde]" />
        <div className="grid gap-5 px-8 pb-8 pt-4">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#f0f2ff] text-[#4441c4]">
            <ExternalLink className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-[22px] font-semibold leading-8 text-[#0b1c30]">
              支付宝支付处理中
            </h1>
            <p className="mt-2 text-[13px] leading-6 text-[#5b5e69]">
              正在确认支付跳转与订单状态，请勿关闭页面。
            </p>
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-full bg-[#f0f2ff] px-4 py-2 text-[13px] leading-5 text-[#4441c4]">
            <Loader2 className="size-4 animate-spin" />
            正在连接支付宝
          </div>
          {order && (
            <div className="rounded-xl border border-[#e3e7f6] bg-[#fbfcff] p-4 text-[13px] leading-5">
              <div className="font-display text-[15px] font-semibold text-[#0b1c30]">{order.sku.name}</div>
              <div className="mt-1 text-[#6b7080]">
                {order.merchantOrderNo} · {formatCny(order.amountCents)}
              </div>
              <Badge
                className={cn(
                  "mt-3 border-transparent",
                  order.status === "paid" ? "bg-[#ecfdf3] text-[#047857]" : "bg-[#eef3ff] text-[#4441c4]",
                )}
                variant="secondary"
              >
                {orderStatusLabel(order.status)}
              </Badge>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive">
              {error}
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="motion-action rounded-lg border-[#c7c4d6] bg-white text-[#4441c4] hover:bg-[#f0f2ff]"
              onClick={() => onNavigate("/account/billing")}
            >
              查看账单
            </Button>
            <Button type="button" className={paymentPrimaryButtonClass} onClick={() => onNavigate("/pricing")}>
              返回定价
            </Button>
          </div>
          <div ref={bridgeRef} className="hidden" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
}
