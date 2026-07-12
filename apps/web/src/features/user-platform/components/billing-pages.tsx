// Renders billing and payment UI for public pricing and authenticated account pages.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import type {
  BillingOrderStatusDto,
  BillingSkuDto,
  BillingSummary,
  PaymentChannel,
} from "@uml-platform/contracts";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { ScaleToFitFrame, ScaledTable } from "../../../shared/ui/scale-to-fit";
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
  return `${sku.creditAmount ?? 0} 次`;
}

function skuFeatures(sku: BillingSkuDto) {
  return [
    `到账 ${skuMetric(sku)}，所有可选模型统一扣 1 次`,
    "默认不过期，适合持续生成",
    "赠送次数已包含在到账次数内",
  ];
}

function isRecommendedSku(sku: BillingSkuDto) {
  return sku.code === "credits_100";
}

function channelLabel(channel: PaymentChannel) {
  return channel === "alipay" ? "支付宝" : channel;
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

function orderStatusBadgeVariant(status: BillingOrderStatusDto["status"]) {
  if (status === "paid") return "success";
  if (status === "pending") return "info";
  if (status === "refund_pending") return "warning";
  if (status === "refunded") return "secondary";
  return "destructive";
}

function storageKey(orderId: string) {
  return `uml-alipay-form:${orderId}`;
}

const paymentPrimaryButtonClass =
  "motion-action h-11 rounded-lg px-5 font-display text-[15px] font-semibold leading-6 shadow-sm hover:shadow-md";

const paymentSecondaryButtonClass =
  "motion-action h-11 rounded-lg px-5 font-display text-[15px] font-semibold leading-6";

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
  return (
    <button
      type="button"
      data-testid="payment-method-card"
      aria-pressed={active}
      onClick={() => onSelect(channel)}
      className={cn(
        "motion-action grid rounded-lg border bg-card p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        active
          ? "border-primary ring-2 ring-primary/15"
          : "border-border hover:border-primary/60 hover:bg-accent/40",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-display text-[15px] font-semibold leading-6 text-foreground">
          <span
            className={cn(
              "grid size-8 place-items-center rounded-lg",
              "bg-info/10 text-info",
            )}
          >
            <CreditCard className="size-4" />
          </span>
          {channelLabel(channel)}
        </span>
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full border",
            active ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
          )}
        >
          <Check className="size-3" />
        </span>
      </span>
      <span className="mt-3 text-[13px] leading-5 text-muted-foreground">
        跳转支付宝电脑网站支付
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
        overlayClassName="bg-foreground/40 backdrop-blur-[1px]"
        className="overflow-hidden rounded-xl border-border bg-card p-0 shadow-xl sm:max-w-[440px]"
      >
        <ScaleToFitFrame minWidth={440} contentClassName="w-[440px]">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
            <DialogTitle className="font-display text-[20px] font-semibold leading-7 text-foreground">
              支付确认
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-muted-foreground">
              请确认套餐内容与支付方式。
            </DialogDescription>
          </DialogHeader>
          {sku && (
            <div className="grid gap-4 px-6 py-5">
              <section className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[12px] font-medium leading-5 text-muted-foreground">购买内容</div>
                    <div className="mt-1 font-display text-[16px] font-semibold leading-6 text-foreground">
                      {sku.name}
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{sku.description}</p>
                  </div>
                  <Badge variant="success">
                    {skuMetric(sku)}
                  </Badge>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <span className="text-[12px] leading-5 text-muted-foreground">订单金额</span>
                  <span className="font-display text-[28px] font-bold leading-9 tracking-normal text-primary">
                    {formatCny(sku.amountCents)}
                  </span>
                </div>
              </section>
              <div className="grid gap-3">
                <PaymentMethodCard
                  channel="alipay"
                  active={channel === "alipay"}
                  onSelect={onChannelChange}
                />
              </div>
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] leading-5 text-warning">
                支付金额以后端 SKU 为准，请在支付宝页面确认金额一致。
              </div>
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  {error}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              className="motion-action rounded-lg px-0 text-[14px] text-muted-foreground hover:bg-transparent hover:text-foreground"
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
        </ScaleToFitFrame>
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
  const creditSkus = useMemo(() => skus, [skus]);
  if (loading) {
    return (
      <div className="motion-card rounded-xl border border-border bg-card p-6 text-[14px] leading-6 text-muted-foreground shadow-sm">
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
    { key: "credits", title: "次数包", subtitle: "永久次数", items: creditSkus },
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
              <span className="h-6 w-1 rounded-full bg-primary" />
              <h2 className="font-display text-[22px] font-semibold leading-8 tracking-normal text-foreground">
                {group.title}
              </h2>
              <Badge variant="info">
                {group.subtitle}
              </Badge>
            </div>
          </div>
          <ScaleToFitFrame
            minWidth={1040}
            contentClassName="grid w-full grid-cols-4 gap-4"
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
          </ScaleToFitFrame>
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
  const actionLabel = signedIn ? "立即购买" : "登录后购买";
  return (
    <article
      data-testid={recommended ? "billing-recommended-sku" : "billing-sku-card"}
      className={cn(
        "motion-card relative grid overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all",
        variant === "pricing" ? "min-h-[255px] gap-4 p-5" : "min-h-[230px] gap-3 p-4",
        recommended
          ? "border-primary shadow-md ring-1 ring-primary"
          : "border-border hover:border-primary/60",
      )}
      style={{ "--motion-delay": motionDelay } as CSSProperties}
    >
      {recommended && (
        <span className="absolute right-4 top-0 rounded-b-lg bg-primary px-3 py-1 text-[11px] font-semibold leading-4 text-primary-foreground">
          推荐套餐
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[20px] font-semibold leading-7 tracking-normal text-foreground">
            {sku.name}
          </h3>
          <p className="mt-2 min-h-10 text-[13px] leading-5 text-muted-foreground">{sku.description}</p>
        </div>
        <Badge
          className="px-2.5 py-1 text-[12px]"
          variant="success"
        >
          {skuMetric(sku)}
        </Badge>
      </div>
      <ul className="grid gap-1.5 text-[12px] leading-5 text-muted-foreground">
        {skuFeatures(sku).map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <div className="font-display text-[30px] font-bold leading-9 tracking-normal text-foreground">
          {formatCny(sku.amountCents)}
        </div>
      </div>
      <Button
        type="button"
        variant={recommended ? "default" : "secondary"}
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
  const [channel, setChannel] = useState<PaymentChannel>("alipay");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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
      if (response.paymentFormHtml) {
        window.sessionStorage.setItem(storageKey(response.orderId), response.paymentFormHtml);
      }
      setSelectedSku(null);
      if (response.redirectUrl && !response.paymentFormHtml) {
        window.location.assign(response.redirectUrl);
        onPaid?.();
        return;
      }
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
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => setClientReady(true), []);
  return (
    <section
      data-testid="pricing-payment-page"
      className="flex flex-1 bg-background px-[clamp(1.5rem,4vw,7rem)] py-[clamp(3rem,6vh,5.5rem)]"
    >
      <div className="mx-auto grid w-full max-w-[1400px] content-start gap-10">
        <div className="motion-rise mx-auto grid max-w-4xl gap-3 text-center">
          <Badge variant="info" className="mx-auto w-fit rounded-full px-3 py-1 text-[12px]">
            <BadgeCheck className="size-3.5" />
            支付权益
          </Badge>
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-normal text-foreground md:text-[44px] md:leading-[52px]">
            开通 AI 生成权益
          </h1>
          <p className="text-[15px] leading-[24px] text-muted-foreground md:text-[16px]">
            购买次数包后可用于所有可选模型，每次生成扣 1 次。新用户邮箱验证后自动赠送 5 次，有效期 30 天。
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
      {clientReady && (
        <>
          {/* Payment portals mount after hydration so the crawlable pricing shell stays deterministic. */}
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
        </>
      )}
    </section>
  );
}

function SummaryPanel({ summary }: { summary: BillingSummary }) {
  return (
    <ScaleToFitFrame minWidth={760} contentClassName="grid w-[760px] grid-cols-2 gap-4">
      <section className="motion-card rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium leading-5 text-muted-foreground">可用次数</div>
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <WalletCards className="size-4" />
          </span>
        </div>
        <div className="mt-4 font-display text-[34px] font-bold leading-10 tracking-normal text-foreground">
          {summary.creditBalance}
        </div>
        <div className="mt-1 text-[12px] leading-5 text-success">
          邮箱验证赠送会自动计入余额
        </div>
      </section>
      <section className="motion-card rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium leading-5 text-muted-foreground">邮箱验证赠送</div>
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <BadgeCheck className="size-4" />
          </span>
        </div>
        <div className="mt-4 font-display text-[22px] font-semibold leading-8 text-foreground">
          {summary.signupBonus.granted ? `${summary.signupBonus.creditAmount} 次` : "未领取"}
        </div>
        <div className="mt-1 text-[13px] leading-5 text-muted-foreground">
          {summary.signupBonus.granted
            ? `有效至 ${formatDate(summary.signupBonus.validUntil)}`
            : "邮箱验证后自动发放"}
        </div>
      </section>
    </ScaleToFitFrame>
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
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div
        data-testid="account-billing-dashboard"
        className="mx-auto grid w-full max-w-[1440px] gap-6 px-[clamp(1rem,3vw,2rem)] py-6"
      >
        <section className="grid min-w-0 flex-1 content-start gap-6">
          <div className="motion-rise flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-[28px] font-bold leading-9 tracking-normal text-foreground">
                权益与账单
              </h1>
              <p className="mt-2 max-w-3xl text-[14px] leading-6 text-muted-foreground">
                查看次数余额、邮箱验证赠送和最近支付订单。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="motion-action rounded-lg bg-card"
              onClick={refreshSummary}
            >
              <RefreshCw className="size-4" />
              刷新
            </Button>
          </div>
          {summaryLoading && (
            <div className="motion-card rounded-xl border border-border bg-card p-5 text-[14px] leading-6 text-muted-foreground">
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
            <div className="motion-rise flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-[14px] leading-6 text-success">
              <CheckCircle2 className="size-4" />
              邮箱验证赠送 {summary.signupBonus.creditAmount} 次，有效至 {formatDate(summary.signupBonus.validUntil)}
            </div>
          )}
          <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-[22px] font-semibold leading-8 text-foreground">
                购买权益
              </h2>
              <span className="text-[13px] leading-5 text-muted-foreground">
                次数余额按次抵扣
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
          <section className="motion-card overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 className="font-display text-[20px] font-semibold leading-7 text-foreground">
                订单历史
              </h2>
              <Badge variant="secondary">
                {summary?.recentOrders.length ?? 0} 条
              </Badge>
            </div>
            {summary?.recentOrders.length ? (
              <div className="max-w-full overflow-hidden">
                <ScaledTable minWidth={640} data-testid="billing-order-table" className="text-left text-[13px] leading-5">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 font-medium">订单号</th>
                      <th className="px-5 py-3 font-medium">套餐</th>
                      <th className="px-5 py-3 font-medium">金额</th>
                      <th className="px-5 py-3 font-medium">状态</th>
                      <th className="px-5 py-3 font-medium">创建时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-muted-foreground">
                    {summary.recentOrders.map((order) => (
                      <tr key={order.orderId} className="transition-colors hover:bg-muted/30">
                        <td className="px-5 py-3 font-mono text-[12px] text-muted-foreground">
                          {order.merchantOrderNo}
                        </td>
                        <td className="px-5 py-3 font-medium text-foreground">{order.sku.name}</td>
                        <td className="px-5 py-3">{formatCny(order.amountCents)}</td>
                        <td className="px-5 py-3">
                          <Badge variant={orderStatusBadgeVariant(order.status)}>
                            {orderStatusLabel(order.status)}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{formatDate(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </ScaledTable>
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-[14px] leading-6 text-muted-foreground">
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
      window.sessionStorage.removeItem(storageKey(orderId));
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
    <main className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-background px-6 py-10">
      <div className="absolute left-6 top-6 flex items-center gap-2 text-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <BadgeCheck className="size-4" />
        </span>
        <span className="font-display text-[14px] font-semibold leading-5">UML Lab</span>
      </div>
      <section
        data-testid="alipay-processing-card"
        className="motion-card grid w-full max-w-[420px] gap-5 overflow-hidden rounded-xl border border-border bg-card text-center shadow-xl"
      >
        <div className="h-1.5 bg-primary" />
        <div className="grid gap-5 px-8 pb-8 pt-4">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <ExternalLink className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-[22px] font-semibold leading-8 text-foreground">
              支付宝支付处理中
            </h1>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              正在确认支付跳转与订单状态，请勿关闭页面。
            </p>
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-[13px] leading-5 text-primary">
            <Loader2 className="size-4 animate-spin" />
            正在连接支付宝
          </div>
          {order && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-[13px] leading-5">
              <div className="font-display text-[15px] font-semibold text-foreground">{order.sku.name}</div>
              <div className="mt-1 text-muted-foreground">
                {order.merchantOrderNo} · {formatCny(order.amountCents)}
              </div>
              <Badge
                className="mt-3"
                variant={orderStatusBadgeVariant(order.status)}
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
              className="motion-action rounded-lg bg-card"
              onClick={() => onNavigate("/projects")}
            >
              返回项目
            </Button>
            <Button
              type="button"
              className={paymentPrimaryButtonClass}
              onClick={() => onNavigate("/pricing")}
            >
              返回定价
            </Button>
          </div>
          <div ref={bridgeRef} className="hidden" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
}
