// Renders global model and workspace preferences in either a dialog or an embedded settings tab.
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, PlugZap, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../shared/ui/button";
import { Label } from "../../../shared/ui/label";
import { Switch } from "../../../shared/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../shared/ui/select";
import { ScaledToolbar } from "../../../shared/ui/scale-to-fit";
import { useTheme } from "../../../shared/ui/theme-provider";
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from "../../../shared/lib/user-settings";
import {
  getProviderLabel,
  getProviderAllowedModels,
  getProviderModelCapabilities,
  resolveProviderModel,
} from "../../../shared/lib/provider-config-models";
import {
  platformApi,
  PlatformApiError,
  type PlatformProviderConfig,
} from "../../user-platform/services/platform-api";

type GlobalSettingsPanelProps = {
  active: boolean;
  onNavigate?: (route: string) => void;
  onSaved?: () => void;
};

function providerScopeLabel(config: PlatformProviderConfig) {
  if (config.scopeType === "user") return "个人配置";
  if (config.scopeType === "system") return "系统配置";
  if (config.scopeType === "project") return "项目配置";
  return "托管配置";
}

function providerScopePriority(config: PlatformProviderConfig) {
  if (config.scopeType === "user") return 0;
  if (config.scopeType === "system") return 1;
  if (config.scopeType === "project") return 2;
  return 3;
}

function sortProviderConfigs(configs: PlatformProviderConfig[]) {
  return [...configs].sort((left, right) => {
    const priority = providerScopePriority(left) - providerScopePriority(right);
    if (priority !== 0) return priority;
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });
}

export function GlobalSettingsPanel({
  active,
  onNavigate,
  onSaved,
}: GlobalSettingsPanelProps) {
  const { theme, toggle } = useTheme();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [providerConfigs, setProviderConfigs] = useState<PlatformProviderConfig[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerStatus, setProviderStatus] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!active) return;
    setSettings(loadUserSettings());
    setProviderLoading(true);
    setProviderStatus("");
    setAuthRequired(false);
    let mounted = true;
    platformApi
      .me()
      .then(() =>
        platformApi
          .listProviderConfigs()
          .then((response) => {
            if (!mounted) return;
            const activeConfigs = sortProviderConfigs(
              response.providerConfigs.filter((config) => config.status === "active"),
            );
            if (activeConfigs.length === 0) {
              setProviderStatus("暂无可用托管 Provider 配置。");
            }
            setProviderConfigs(activeConfigs);
            if (activeConfigs[0]) {
              setSettings((current) => {
                const selected =
                  activeConfigs.find((config) => config.id === current.providerConfigId) ??
                  activeConfigs[0];
                return {
                  ...current,
                  providerConfigId: selected.id,
                  providerModelCapabilities: getProviderModelCapabilities(selected),
                  providerModelOptions: getProviderAllowedModels(selected),
                  providerLabel: getProviderLabel(selected),
                  defaultModel: resolveProviderModel(selected, current.defaultModel),
                };
              });
            }
          })
          .catch((error) => {
            if (!mounted) return;
            if (error instanceof PlatformApiError && error.status === 403) {
              setProviderStatus("当前账号没有托管 Provider 配置访问权限。");
              return;
            }
            setProviderStatus(error instanceof Error ? error.message : "托管 Provider 加载失败。");
          }),
      )
      .catch((error) => {
        if (!mounted) return;
        setAuthRequired(true);
        setProviderStatus(
          error instanceof PlatformApiError && error.status === 401
            ? "未登录时不能使用模型配置。"
            : "无法校验登录状态，请先登录或确认 API 服务可用。",
        );
      })
      .finally(() => {
        if (mounted) setProviderLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [active]);

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const selectedProvider = useMemo(
    () => providerConfigs.find((config) => config.id === settings.providerConfigId),
    [providerConfigs, settings.providerConfigId],
  );
  const selectedProviderModels = useMemo(
    () => getProviderAllowedModels(selectedProvider),
    [selectedProvider],
  );
  const resolvedDefaultModel = selectedProvider
    ? resolveProviderModel(selectedProvider, settings.defaultModel)
    : "";
  const providerEmptyLabel = providerLoading
    ? "正在加载托管 Provider"
    : providerConfigs.length === 0
      ? "暂无可用托管 Provider 配置"
      : "请选择托管 Provider 配置";

  const save = () => {
    try {
      if (!settings.providerConfigId) {
        toast.error("登录态必须选择托管 Provider 配置");
        return;
      }
      if (!selectedProvider || selectedProviderModels.length === 0) {
        toast.error("当前托管 Provider 没有可用模型");
        return;
      }
      if (!selectedProviderModels.includes(resolvedDefaultModel)) {
        toast.error("默认模型必须来自当前托管 Provider 的模型目录");
        return;
      }
      saveUserSettings({
        ...settings,
        providerModelCapabilities: getProviderModelCapabilities(selectedProvider),
        providerModelOptions: getProviderAllowedModels(selectedProvider),
        providerLabel: getProviderLabel(selectedProvider),
        defaultModel: resolvedDefaultModel,
      });
      toast.success("设置已保存");
      onSaved?.();
    } catch {
      toast.error("设置保存失败");
    }
  };

  const reset = () => {
    setSettings(DEFAULT_USER_SETTINGS);
    toast.message("已恢复默认值，记得点击保存");
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      if (!settings.providerConfigId) {
        toast.error("登录态必须测试托管 Provider 配置");
        return;
      }
      if (!selectedProvider || selectedProviderModels.length === 0) {
        toast.error("当前托管 Provider 没有可用模型");
        return;
      }
      if (!selectedProviderModels.includes(resolvedDefaultModel)) {
        toast.error("默认模型必须来自当前托管 Provider 的模型目录");
        return;
      }
      const result = await platformApi.testProviderConfig(
        settings.providerConfigId,
        resolvedDefaultModel,
      );
      toast.success(result.message ?? "托管配置连接成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "连接测试失败");
    } finally {
      setTesting(false);
    }
  };

  const canTest = Boolean(
    settings.providerConfigId &&
      selectedProvider &&
      selectedProviderModels.length > 0 &&
      selectedProviderModels.includes(resolvedDefaultModel),
  );

  if (authRequired) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          请先登录。未登录时不能使用模型配置、工作台偏好或其他平台功能。
        </div>
        {onNavigate && (
          <Button
            type="button"
            onClick={() => onNavigate("/login")}
          >
            前往登录
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <section className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
          <div>
            <h3 className="text-sm font-semibold">模型托管配置</h3>
            <p className="text-xs text-muted-foreground">选择服务端托管 Provider 和默认模型。</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="managed-provider-config">托管 Provider 配置</Label>
            <Select
              value={settings.providerConfigId || "__none__"}
              onValueChange={(value) => {
                const providerConfigId = value === "__none__" ? "" : value;
                const config = providerConfigs.find((item) => item.id === providerConfigId);
                setSettings((current) => ({
                  ...current,
                  providerConfigId,
                  providerModelCapabilities: providerConfigId
                    ? getProviderModelCapabilities(config)
                    : {},
                  providerModelOptions: providerConfigId ? getProviderAllowedModels(config) : [],
                  providerLabel: providerConfigId ? getProviderLabel(config) : "",
                  defaultModel: providerConfigId
                    ? resolveProviderModel(config, current.defaultModel)
                    : current.defaultModel,
                }));
              }}
              disabled={providerLoading || providerConfigs.length === 0}
            >
              <SelectTrigger
                id="managed-provider-config"
                aria-label="托管 Provider 配置"
                className="h-9"
              >
                <SelectValue placeholder={providerEmptyLabel} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>
                  {providerEmptyLabel}
                </SelectItem>
                {providerConfigs.map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {config.name}（{providerScopeLabel(config)}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProvider ? (
              <span className="text-[11px] text-muted-foreground">
                {providerScopeLabel(selectedProvider)} · {selectedProvider.provider} · {selectedProvider.baseUrl} · {selectedProvider.maskedKey}
              </span>
            ) : providerStatus ? (
              <span className="text-[11px] text-muted-foreground">{providerStatus}</span>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="managed-default-model">默认模型</Label>
            {selectedProvider ? (
              <Select
                value={resolvedDefaultModel}
                onValueChange={(value) => update("defaultModel", value)}
                disabled={selectedProviderModels.length === 0}
              >
                <SelectTrigger
                  id="managed-default-model"
                  aria-label="默认模型"
                  className="h-9"
                >
                  <SelectValue placeholder="选择允许的模型" />
                </SelectTrigger>
                <SelectContent>
                  {selectedProviderModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value="__none__" disabled>
                <SelectTrigger
                  id="managed-default-model"
                  aria-label="默认模型"
                  className="h-9"
                >
                  <SelectValue placeholder="请先选择托管 Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">请先选择托管 Provider</SelectItem>
                </SelectContent>
              </Select>
            )}
            {selectedProvider && selectedProviderModels.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                这里只能选择管理员在该托管配置中允许的模型。
              </span>
            )}
            {selectedProvider && selectedProviderModels.length === 0 && (
              <span className="text-[11px] text-warning">
                当前托管 Provider 没有可用模型，请联系管理员刷新模型目录。
              </span>
            )}
            {!selectedProvider && (
              <span className="text-[11px] text-muted-foreground">
                选择托管 Provider 后才能选择默认模型。
              </span>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
          <div>
            <h3 className="text-sm font-semibold">工作台偏好</h3>
            <p className="text-xs text-muted-foreground">调整主题、字号和自动生成行为。</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <Label>深色主题</Label>
              <span className="text-xs text-muted-foreground">
                当前：{theme === "dark" ? "深色" : "浅色"}
              </span>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggle} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <Label>字号</Label>
              <span className="text-xs text-muted-foreground">影响整体阅读密度</span>
            </div>
            <Select
              value={settings.fontSize}
              onValueChange={(value: "sm" | "md" | "lg") => update("fontSize", value)}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">紧凑</SelectItem>
                <SelectItem value="md">默认</SelectItem>
                <SelectItem value="lg">舒适</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <Label>修改后自动重新生成规则</Label>
              <span className="text-xs text-muted-foreground">关闭后仅显示「需求已修改」提示</span>
            </div>
            <Switch checked={settings.autoGenerate} onCheckedChange={(value) => update("autoGenerate", value)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <Label>显示过期模型横幅</Label>
              <span className="text-xs text-muted-foreground">顶部黄色提示条</span>
            </div>
            <Switch checked={settings.showStaleBanner} onCheckedChange={(value) => update("showStaleBanner", value)} />
          </div>
        </section>
      </div>

      <ScaledToolbar className="mt-5" contentClassName="justify-end" minWidth={520}>
        <Button variant="ghost" onClick={reset}>
          <RotateCw className="size-4" />
          恢复默认
        </Button>
        <Button variant="outline" onClick={testConnection} disabled={testing || !canTest}>
          {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
          测试托管配置
        </Button>
        <Button onClick={save}>
          <KeyRound className="size-4" />
          保存
        </Button>
      </ScaledToolbar>
    </>
  );
}
