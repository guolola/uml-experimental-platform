// Renders the reusable MFA setup step with authenticator QR, shared secret, and code confirmation.
import * as React from "react";
import { Check, Copy, KeyRound, QrCode, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { cn } from "../../../shared/ui/utils";

export interface MfaSetup {
  secret: string;
  otpauthUri: string;
  expiresAt: string;
}

export interface MfaSetupPanelProps {
  setup: MfaSetup;
  code: string;
  onCodeChange: (code: string) => void;
  onConfirm: () => void;
  onCopySecret?: () => void;
  className?: string;
}

function formatZhCnDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function MfaSetupPanel({
  setup,
  code,
  onCodeChange,
  onConfirm,
  onCopySecret,
  className,
}: MfaSetupPanelProps) {
  const id = React.useId();
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "failed">("idle");
  const expiresAtLabel = React.useMemo(() => formatZhCnDateTime(setup.expiresAt), [setup.expiresAt]);
  const canConfirm = code.trim().length > 0;
  const titleId = `${id}-title`;
  const secretId = `${id}-secret`;
  const secretLabelId = `${id}-secret-label`;
  const codeId = `${id}-code`;
  const codeHelpId = `${id}-code-help`;

  const copySecret = React.useCallback(async () => {
    if (onCopySecret) {
      onCopySecret();
      setCopyState("copied");
      return;
    }

    try {
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await clipboard.writeText(setup.secret);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [onCopySecret, setup.secret]);

  React.useEffect(() => {
    if (copyState === "idle") return;

    const timeout = window.setTimeout(() => setCopyState("idle"), 2400);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  return (
    <section
      className={cn("grid gap-4 rounded-md border border-border bg-background p-4 text-sm", className)}
      aria-labelledby={titleId}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md border border-border bg-muted p-2 text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 id={titleId} className="text-sm font-semibold text-foreground">
            添加认证器应用
          </h3>
          <p className="text-xs leading-5 text-muted-foreground">
            扫描二维码或手动输入密钥，然后填写认证器中显示的 6 位验证码。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[176px_1fr] gap-4">
        <div className="grid place-items-center rounded-md border border-border bg-white p-3">
          <QRCodeSVG
            value={setup.otpauthUri}
            size={152}
            level="M"
            marginSize={2}
            title="MFA 二维码"
            role="img"
            aria-label="MFA 二维码"
          />
        </div>

        <div className="grid min-w-0 gap-3">
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <QrCode className="size-4 text-muted-foreground" aria-hidden="true" />
              扫描二维码
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              使用支持 TOTP 的认证器应用扫描此二维码。设置会在 {expiresAtLabel} 过期。
            </p>
          </div>

          <div className="grid gap-2">
            <div id={secretLabelId} className="flex items-center gap-2 text-sm font-medium text-foreground">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
              手动密钥
            </div>
            <div className="flex min-w-0 gap-2">
              <output
                id={secretId}
                aria-labelledby={secretLabelId}
                className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs leading-5 text-foreground break-all"
              >
                {setup.secret}
              </output>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copySecret}
                aria-label="复制 MFA 密钥"
              >
                {copyState === "copied" ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <div className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {copyState === "copied" && "密钥已复制。"}
              {copyState === "failed" && "复制失败，请手动选择密钥。"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={codeId}>MFA 验证码</Label>
        <Input
          id={codeId}
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="输入 6 位验证码"
          aria-describedby={codeHelpId}
        />
        <p id={codeHelpId} className="text-xs leading-5 text-muted-foreground">
          验证码来自刚添加的认证器条目。
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
          确认启用 MFA
        </Button>
      </div>
    </section>
  );
}
