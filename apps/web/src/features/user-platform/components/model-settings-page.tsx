// Owns the user-facing model provider settings page backed by managed provider configs.
import { useEffect, useState, type ReactNode } from "react";
import { KeyRound, Loader2, PlugZap, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Separator } from "../../../shared/ui/separator";
import { SelectControl } from "../../../shared/ui/select";
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from "../../../shared/lib/user-settings";
import {
  getProviderAllowedModels,
  getProviderLabel,
  resolveProviderModel,
} from "../../../shared/lib/provider-config-models";
import {
  PlatformApiError,
  platformApi,
  type PlatformProviderConfig,
} from "../services/platform-api";

type Navigate = (path: string) => void;

const MODEL_SETTINGS_SCROLL_CLASS =
  "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-scroll bg-background [scrollbar-gutter:stable]";

function ModelSettingsFrame({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate?: Navigate;
}) {
  void onNavigate;
  return (
    <main className={MODEL_SETTINGS_SCROLL_CLASS}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        {children}
      </div>
    </main>
  );
}

function SettingsSection({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-border bg-card p-5 ${className}`}>
      {children}
    </section>
  );
}

export function ModelSettingsPage({ onNavigate }: { onNavigate: Navigate }) {
  const [settings, setSettings] = useState<UserSettings>(() => loadUserSettings());
  const [providerConfigs, setProviderConfigs] = useState<PlatformProviderConfig[]>([]);
  const [providerLoading, setProviderLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    setProviderLoading(true);
    platformApi
      .listProviderConfigs()
      .then((response) => {
        if (!active) return;
        const activeConfigs = response.providerConfigs.filter(
          (config) => config.status === "active",
        );
        setProviderConfigs(activeConfigs);
        if (activeConfigs[0]) {
          setSettings((current) => {
            const selected =
              activeConfigs.find((config) => config.id === current.providerConfigId) ??
              activeConfigs[0];
            return {
              ...current,
              providerConfigId: selected.id,
              providerModelOptions: getProviderAllowedModels(selected),
              providerLabel: getProviderLabel(selected),
              defaultModel: resolveProviderModel(selected, current.defaultModel),
            };
          });
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof PlatformApiError && error.status === 401) {
          setStatus("需要登录后加载托管 Provider 配置。");
          return;
        }
        if (error instanceof PlatformApiError && error.status === 403) {
          setStatus("当前账号没有托管 Provider 配置访问权限，请联系管理员检查项目或组织权限。");
          return;
        }
        setStatus(error instanceof Error ? error.message : "托管供应商配置加载失败。");
      })
      .finally(() => {
        if (active) setProviderLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setStatus("");
  };

  const selectedProviderConfig = providerConfigs.find(
    (config) => config.id === settings.providerConfigId,
  );

  const save = () => {
    try {
      if (!settings.providerConfigId) {
        setStatus("请先选择托管供应商配置。");
        toast.error("请先选择托管供应商配置");
        return;
      }
      saveUserSettings({
        ...settings,
        providerModelOptions: getProviderAllowedModels(selectedProviderConfig),
        providerLabel: getProviderLabel(selectedProviderConfig),
        defaultModel: resolveProviderModel(selectedProviderConfig, settings.defaultModel),
      });
      setSettings(loadUserSettings());
      setStatus("模型配置已保存。");
      toast.success("模型配置已保存");
    } catch {
      setStatus("模型配置保存失败。");
      toast.error("模型配置保存失败");
    }
  };

  const reset = () => {
    setSettings(DEFAULT_USER_SETTINGS);
    setStatus("已恢复默认值，点击保存后生效。");
  };

  const testConnection = async () => {
    setTesting(true);
    setStatus("");
    try {
      if (!settings.providerConfigId) {
        throw new Error("请先选择托管供应商配置。");
      }
      const result = await platformApi.testProviderConfig(
        settings.providerConfigId,
        resolveProviderModel(selectedProviderConfig, settings.defaultModel),
      );
      if (result.ok === false) {
        throw new Error(result.message ?? "托管配置连接测试失败。");
      }
      setStatus(`连接成功：${result.message ?? "托管配置可用"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "连接测试失败。");
    } finally {
      setTesting(false);
    }
  };

  const selectedProviderModels = getProviderAllowedModels(selectedProviderConfig);

  return (
    <ModelSettingsFrame onNavigate={onNavigate}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>模型设置</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            登录态优先使用服务端托管 Provider Config。API Key 不作为主要路径写入本地；
            普通登录态不会保存或回显明文 API Key。
          </p>
        </div>
        <Badge variant="secondary">
          <KeyRound className="mr-1 size-3.5" />
          {selectedProviderConfig?.maskedKey ?? "未选择托管配置"}
        </Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SettingsSection>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="managed-provider-config">托管供应商配置</Label>
              <SelectControl
                id="managed-provider-config"
                aria-label="托管供应商配置"
                value={settings.providerConfigId}
                onValueChange={(value) =>
                  setSettings((current) => {
                    const selected = providerConfigs.find((config) => config.id === value);
                    return {
                      ...current,
                      providerConfigId: value,
                      providerModelOptions: value ? getProviderAllowedModels(selected) : [],
                      providerLabel: value ? getProviderLabel(selected) : "",
                      defaultModel: value
                        ? resolveProviderModel(selected, current.defaultModel)
                        : current.defaultModel,
                    };
                  })
                }
                className="h-9"
                disabled={providerLoading || providerConfigs.length === 0}
                options={[
                  {
                    value: "",
                    label: providerLoading ? "正在加载托管配置" : "请选择托管配置",
                  },
                  ...providerConfigs.map((config) => ({
                    value: config.id,
                    label: config.name,
                  })),
                ]}
              />
              {selectedProviderConfig && (
                <span className="text-[11px] text-muted-foreground">
                  {selectedProviderConfig.provider} · {selectedProviderConfig.baseUrl} ·{" "}
                  {selectedProviderConfig.maskedKey} · {selectedProviderConfig.riskState}
                </span>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="managed-default-model">默认模型</Label>
              {selectedProviderConfig ? (
                <SelectControl
                  id="managed-default-model"
                  aria-label="默认模型"
                  value={resolveProviderModel(selectedProviderConfig, settings.defaultModel)}
                  onValueChange={(value) => update("defaultModel", value)}
                  className="h-9"
                  options={selectedProviderModels.map((model) => ({
                    value: model,
                    label: model,
                  }))}
                />
              ) : (
                <Input
                  id="managed-default-model"
                  value={settings.defaultModel}
                  onChange={(event) => update("defaultModel", event.target.value)}
                  className="h-9 font-mono text-xs"
                />
              )}
              {selectedProviderConfig && (
                <span className="text-[11px] text-muted-foreground">
                  这里只能选择管理员在该托管配置中允许的模型。
                </span>
              )}
            </div>
          </div>
          <Separator className="my-5" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save}>保存模型设置</Button>
            <Button
              type="button"
              variant="outline"
              onClick={testConnection}
              disabled={testing || !settings.providerConfigId}
            >
              {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
              测试托管配置
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              <RotateCw className="size-4" />
              恢复默认
            </Button>
          </div>
          {status && (
            <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
              {status}
            </div>
          )}
        </SettingsSection>
        <SettingsSection className="h-fit">
          <h2 className="text-base">后续服务端托管</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>密钥新增后只显示尾号、用途、创建人和最近使用时间。</li>
            <li>支持测试连接、撤销、轮换和风险状态展示。</li>
            <li>后端会限制供应商 Base URL 白名单，避免任意地址请求。</li>
            <li>高危操作会进入审计日志。</li>
          </ul>
        </SettingsSection>
      </div>
    </ModelSettingsFrame>
  );
}
