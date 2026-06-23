// Renders global model and workspace preferences in either a dialog or an embedded settings tab.
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Plus, PlugZap, RotateCw } from "lucide-react";
import type { ProviderDiscoveredModel } from "@uml-platform/contracts";
import { toast } from "sonner";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
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
  providerScopeLabel,
  resolveProviderModel,
  sortProviderConfigsByScope,
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

function sortProviderConfigs(configs: PlatformProviderConfig[]) {
  return sortProviderConfigsByScope(configs);
}

type ProviderCreationForm = {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
};

const EMPTY_PROVIDER_CREATION_FORM: ProviderCreationForm = {
  name: "",
  baseUrl: "",
  apiKey: "",
  defaultModel: "",
};

function buildTemporaryProviderSignature(
  form: ProviderCreationForm,
  modelIds: string[],
) {
  return JSON.stringify([
    form.baseUrl.trim(),
    form.apiKey,
    form.defaultModel.trim(),
    modelIds,
  ]);
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
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderCreationForm>({
    ...EMPTY_PROVIDER_CREATION_FORM,
  });
  const [discoveredModels, setDiscoveredModels] = useState<ProviderDiscoveredModel[]>([]);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const [testingTemporaryProvider, setTestingTemporaryProvider] = useState(false);
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [testedProviderSignature, setTestedProviderSignature] = useState("");

  const applyProviderConfigList = useCallback(
    (configs: PlatformProviderConfig[], preferredProviderConfigId?: string) => {
      const activeConfigs = sortProviderConfigs(
        configs.filter((config) => config.status === "active"),
      );
      setProviderConfigs(activeConfigs);
      setProviderStatus(
        activeConfigs.length === 0 ? "暂无可用托管 Provider 配置。" : "",
      );
      setSettings((current) => {
        const selected =
          activeConfigs.find((config) => config.id === preferredProviderConfigId) ??
          activeConfigs.find((config) => config.id === current.providerConfigId) ??
          activeConfigs[0];
        if (!selected) {
          return {
            ...current,
            providerConfigId: "",
            providerModelCapabilities: {},
            providerModelOptions: [],
            providerLabel: "",
            providerDefaultModelSeededFor: "",
          };
        }
        const shouldSeedProviderDefault =
          selected.id !== current.providerConfigId ||
          current.providerDefaultModelSeededFor !== selected.id;
        return {
          ...current,
          providerConfigId: selected.id,
          providerModelCapabilities: getProviderModelCapabilities(selected),
          providerModelOptions: getProviderAllowedModels(selected),
          providerLabel: getProviderLabel(selected),
          providerDefaultModelSeededFor: selected.id,
          defaultModel: shouldSeedProviderDefault
            ? resolveProviderModel(selected, selected.defaultModel ?? "")
            : resolveProviderModel(selected, current.defaultModel),
        };
      });
    },
    [],
  );

  const refreshProviderConfigs = useCallback(
    async (preferredProviderConfigId?: string) => {
      const response = await platformApi.listProviderConfigs();
      applyProviderConfigList(response.providerConfigs, preferredProviderConfigId);
      return response;
    },
    [applyProviderConfigList],
  );

  useEffect(() => {
    if (!active) return;
    setSettings(loadUserSettings());
    setProviderLoading(true);
    setProviderStatus("");
    setAuthRequired(false);
    let mounted = true;
    platformApi
      .me()
      .then(() => refreshProviderConfigs())
      .catch((error) => {
        if (!mounted) return;
        if (error instanceof PlatformApiError && error.status === 403) {
          setProviderStatus("当前账号没有托管 Provider 配置访问权限。");
          return;
        }
        setAuthRequired(
          error instanceof PlatformApiError && error.status === 401,
        );
        setProviderStatus(
          error instanceof PlatformApiError && error.status === 401
            ? "未登录时不能使用模型配置。"
            : error instanceof Error
              ? error.message
              : "无法校验登录状态，请先登录或确认 API 服务可用。",
        );
      })
      .finally(() => {
        if (mounted) setProviderLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [active, refreshProviderConfigs]);

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
  const discoveredModelIds = useMemo(
    () =>
      Array.from(
        new Set(
          discoveredModels
            .map((model) => model.id.trim())
            .filter(Boolean),
        ),
      ),
    [discoveredModels],
  );
  const currentProviderSignature = useMemo(
    () => buildTemporaryProviderSignature(providerForm, discoveredModelIds),
    [discoveredModelIds, providerForm],
  );
  const temporaryProviderTestPassed =
    testedProviderSignature !== "" &&
    testedProviderSignature === currentProviderSignature &&
    discoveredModelIds.length > 0;
  const canDiscoverModels = Boolean(
    providerForm.baseUrl.trim() && providerForm.apiKey.trim(),
  );
  const canTestTemporaryProvider = Boolean(
    canDiscoverModels &&
      providerForm.defaultModel.trim() &&
      discoveredModelIds.length > 0,
  );
  const canCreateProvider = Boolean(
    providerForm.name.trim() &&
      canTestTemporaryProvider &&
      temporaryProviderTestPassed,
  );

  const resetProviderCreationForm = useCallback(() => {
    setProviderForm({ ...EMPTY_PROVIDER_CREATION_FORM });
    setDiscoveredModels([]);
    setTestedProviderSignature("");
  }, []);

  const updateProviderCreationField = <K extends keyof ProviderCreationForm>(
    key: K,
    value: ProviderCreationForm[K],
  ) => {
    setProviderForm((current) => ({ ...current, [key]: value }));
    if (key === "baseUrl" || key === "apiKey") {
      setDiscoveredModels([]);
    }
    if (key !== "name") {
      setTestedProviderSignature("");
    }
  };

  const handleAddProviderOpenChange = (open: boolean) => {
    setAddProviderOpen(open);
    if (!open) {
      resetProviderCreationForm();
    }
  };

  const discoverModels = async () => {
    if (!canDiscoverModels) {
      toast.error("请先填写 Base URL 和 API Key");
      return;
    }
    setDiscoveringModels(true);
    setTestedProviderSignature("");
    try {
      const response = await platformApi.discoverProviderModels({
        baseUrl: providerForm.baseUrl.trim(),
        apiKey: providerForm.apiKey.trim(),
      });
      const models = response.models.filter((model) => model.id.trim());
      setDiscoveredModels(models);
      setProviderForm((current) => {
        const modelIds = models.map((model) => model.id.trim()).filter(Boolean);
        const currentDefault = current.defaultModel.trim();
        return {
          ...current,
          defaultModel: modelIds.includes(currentDefault)
            ? currentDefault
            : modelIds[0] ?? "",
        };
      });
      if (models.length === 0) {
        toast.error("未发现可用模型");
        return;
      }
      toast.success(`已获取 ${models.length} 个模型`);
    } catch (error) {
      setDiscoveredModels([]);
      toast.error(error instanceof Error ? error.message : "获取模型列表失败");
    } finally {
      setDiscoveringModels(false);
    }
  };

  const testTemporaryProvider = async () => {
    if (!canTestTemporaryProvider) {
      toast.error("请先获取模型列表并选择默认模型");
      return;
    }
    setTestingTemporaryProvider(true);
    setTestedProviderSignature("");
    try {
      const result = await platformApi.testTemporaryProviderConfig({
        baseUrl: providerForm.baseUrl.trim(),
        apiKey: providerForm.apiKey.trim(),
        model: providerForm.defaultModel.trim(),
      });
      if (result.ok === false) {
        toast.error(result.message ?? "连接测试失败");
        return;
      }
      setTestedProviderSignature(currentProviderSignature);
      toast.success(result.message ?? "托管配置连接成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "连接测试失败");
    } finally {
      setTestingTemporaryProvider(false);
    }
  };

  const createProvider = async () => {
    if (!canCreateProvider) {
      toast.error("请先获取模型列表并通过托管配置测试");
      return;
    }
    setCreatingProvider(true);
    try {
      const created = await platformApi.createProviderConfig({
        name: providerForm.name.trim(),
        baseUrl: providerForm.baseUrl.trim(),
        apiKey: providerForm.apiKey.trim(),
        defaultModel: providerForm.defaultModel.trim(),
        allowedModels: discoveredModelIds,
      });
      await refreshProviderConfigs(created.id);
      toast.success("供应商已添加并选中，点击保存后作为默认配置");
      setAddProviderOpen(false);
      resetProviderCreationForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加供应商失败");
    } finally {
      setCreatingProvider(false);
    }
  };

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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">模型托管配置</h3>
              <p className="text-xs text-muted-foreground">选择服务端托管 Provider 和默认模型。</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAddProviderOpen(true)}
            >
              <Plus className="size-4" />
              添加供应商
            </Button>
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
                  providerDefaultModelSeededFor: providerConfigId ? providerConfigId : "",
                  defaultModel: providerConfigId
                    ? resolveProviderModel(
                        config,
                        current.providerConfigId === providerConfigId
                          ? current.defaultModel
                          : config?.defaultModel ?? "",
                      )
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

      <ScaledToolbar className="mt-5" contentClassName="justify-end" minWidth={360}>
        <Button variant="ghost" onClick={reset}>
          <RotateCw className="size-4" />
          恢复默认
        </Button>
        <Button onClick={save}>
          <KeyRound className="size-4" />
          保存
        </Button>
      </ScaledToolbar>

      <Dialog open={addProviderOpen} onOpenChange={handleAddProviderOpenChange}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>添加供应商</DialogTitle>
            <DialogDescription>
              创建仅当前账号可用的模型供应商配置，密钥只会提交到后端保存。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-name">名称</Label>
              <Input
                id="provider-create-name"
                value={providerForm.name}
                onChange={(event) =>
                  updateProviderCreationField("name", event.target.value)
                }
                placeholder="例如：我的 SiliconFlow"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-base-url">Base URL</Label>
              <Input
                id="provider-create-base-url"
                value={providerForm.baseUrl}
                onChange={(event) =>
                  updateProviderCreationField("baseUrl", event.target.value)
                }
                placeholder="https://api.example.com"
                spellCheck={false}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-api-key">API Key</Label>
              <Input
                id="provider-create-api-key"
                type="password"
                value={providerForm.apiKey}
                onChange={(event) =>
                  updateProviderCreationField("apiKey", event.target.value)
                }
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-default-model">默认模型</Label>
              <Select
                value={providerForm.defaultModel || "__none__"}
                onValueChange={(value) =>
                  updateProviderCreationField(
                    "defaultModel",
                    value === "__none__" ? "" : value,
                  )
                }
                disabled={discoveredModelIds.length === 0}
              >
                <SelectTrigger
                  id="provider-create-default-model"
                  aria-label="新增供应商默认模型"
                  className="h-9"
                >
                  <SelectValue placeholder="请先获取模型列表" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    请先获取模型列表
                  </SelectItem>
                  {discoveredModelIds.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {discoveredModelIds.length > 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  已获取 {discoveredModelIds.length} 个模型
                  {temporaryProviderTestPassed ? " · 测试已通过" : " · 等待测试"}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  获取模型列表后才能测试和添加供应商。
                </span>
              )}
            </div>
          </div>
          <DialogFooter className="flex-wrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleAddProviderOpenChange(false)}
              disabled={creatingProvider}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={discoverModels}
              disabled={discoveringModels || testingTemporaryProvider || creatingProvider || !canDiscoverModels}
            >
              {discoveringModels ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCw className="size-4" />
              )}
              获取模型列表
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={testTemporaryProvider}
              disabled={discoveringModels || testingTemporaryProvider || creatingProvider || !canTestTemporaryProvider}
            >
              {testingTemporaryProvider ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlugZap className="size-4" />
              )}
              测试托管配置
            </Button>
            <Button
              type="button"
              onClick={createProvider}
              disabled={discoveringModels || testingTemporaryProvider || creatingProvider || !canCreateProvider}
            >
              {creatingProvider ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              添加供应商
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
