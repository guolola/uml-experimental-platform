// Renders global model and workspace preferences in either a dialog or an embedded settings tab.
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, PlugZap, RotateCw, Save, Trash2 } from "lucide-react";
import type {
  BillingSummary,
  ProviderDiscoveredModel,
  ProviderModelCapabilityMap,
  ProviderModelDiscoveryProgressEvent,
} from "@uml-platform/contracts";
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
import { billingApi } from "../../user-platform/services/billing-api";

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

function discoveredModelsToCapabilities(
  models: ProviderDiscoveredModel[],
): ProviderModelCapabilityMap {
  return Object.fromEntries(
    models.flatMap((model) => {
      const id = model.id.trim();
      if (!id) return [];
      return [
        [
          id,
          {
            id,
            category: model.category ?? "text_chat",
            structuredOutputMode: model.structuredOutputMode ?? "compatible",
            supportsJsonSchema: model.supportsJsonSchema ?? false,
            supportsJsonObject: model.supportsJsonObject ?? false,
            strictJson: model.strictJson ?? "unknown",
            modeLabel: model.modeLabel ?? "兼容模式",
            warning: model.warning,
            probeStatus: model.probeStatus ?? "unknown",
            probeReason: model.probeReason,
            probedAt: model.probedAt ?? new Date().toISOString(),
          },
        ],
      ];
    }),
  );
}

function providerConfigToDiscoveredModels(
  config: PlatformProviderConfig,
): ProviderDiscoveredModel[] {
  return getProviderAllowedModels(config).map((model) => ({
    id: model,
    ...(config.modelCapabilities?.[model] ?? {}),
  }));
}

function providerDiscoveryProgressText(event: ProviderModelDiscoveryProgressEvent) {
  if (event.type === "started") return "正在连接供应商模型目录";
  if (event.type === "models_listed") return `已列出 ${event.rawCount} 个原始模型`;
  if (event.type === "name_filtered") {
    return `筛选出 ${event.candidateCount} 个聊天模型候选`;
  }
  if (event.type === "probe_started") {
    return `正在探测 ${event.modelId}（${event.index}/${event.total}）`;
  }
  if (event.type === "probe_completed") {
    return `已完成 ${event.modelId}（${event.index}/${event.total}）`;
  }
  if (event.type === "completed") {
    return `已获取 ${event.result.models.length} 个可用模型`;
  }
  return event.message;
}

function providerDiscoveryProgressValue(
  event: ProviderModelDiscoveryProgressEvent,
) {
  if (event.type === "started") return 8;
  if (event.type === "models_listed") return 16;
  if (event.type === "name_filtered") return event.candidateCount === 0 ? 80 : 24;
  if (event.type === "probe_started" || event.type === "probe_completed") {
    if (event.total <= 0) return 80;
    return Math.min(96, 24 + Math.round((event.index / event.total) * 70));
  }
  if (event.type === "completed") return 100;
  return 100;
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
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [billingSummaryUnavailable, setBillingSummaryUnavailable] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerDialogMode, setProviderDialogMode] = useState<"create" | "edit">("create");
  const [editingProviderId, setEditingProviderId] = useState("");
  const [providerForm, setProviderForm] = useState<ProviderCreationForm>({
    ...EMPTY_PROVIDER_CREATION_FORM,
  });
  const [discoveredModels, setDiscoveredModels] = useState<ProviderDiscoveredModel[]>([]);
  const [modelCatalogSource, setModelCatalogSource] = useState<"existing" | "discovered" | "">("");
  const [discoveryProgressText, setDiscoveryProgressText] = useState("");
  const [discoveryProgressValue, setDiscoveryProgressValue] = useState(0);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const [testingTemporaryProvider, setTestingTemporaryProvider] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [deletingProvider, setDeletingProvider] = useState(false);
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
            defaultModel: "",
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
    setBillingSummaryUnavailable(false);
    setAuthRequired(false);
    let mounted = true;
    platformApi
      .me()
      .then((profile) => {
        if (mounted) setCurrentUserId(profile.user?.id ?? "");
        return refreshProviderConfigs();
      })
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
    billingApi
      .getSummary()
      .then((summary) => {
        if (!mounted) return;
        setBillingSummary(summary);
        setBillingSummaryUnavailable(false);
      })
      .catch(() => {
        if (!mounted) return;
        setBillingSummary(null);
        setBillingSummaryUnavailable(true);
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
  const selectedProviderIsOwnedUserConfig = Boolean(
    selectedProvider &&
      selectedProvider.scopeType === "user" &&
      selectedProvider.scopeId === currentUserId,
  );
  const selectedProviderBillingHint = useMemo(() => {
    if (!selectedProvider) return "";
    if (selectedProviderIsOwnedUserConfig) {
      return "个人供应商不消耗平台权益次数";
    }
    if (selectedProvider.scopeType !== "system" && selectedProvider.scopeType !== "project") {
      return "";
    }
    if (billingSummaryUnavailable) return "剩余次数暂不可用";
    if (!billingSummary) return "";
    if (billingSummary.creditBalance <= 0) {
      return "剩余：0 次，可前往权益与账单购买";
    }
    return `剩余：${billingSummary.creditBalance} 次`;
  }, [
    billingSummary,
    billingSummaryUnavailable,
    selectedProvider,
    selectedProviderIsOwnedUserConfig,
  ]);
  const editingProvider = useMemo(
    () => providerConfigs.find((config) => config.id === editingProviderId),
    [editingProviderId, providerConfigs],
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
    providerForm.baseUrl.trim() &&
      providerForm.apiKey.trim() &&
      providerForm.defaultModel.trim() &&
      discoveredModelIds.length > 0,
  );
  const providerDialogNeedsPassedTest = Boolean(
    providerDialogMode === "create" ||
      providerForm.apiKey.trim() ||
      modelCatalogSource === "discovered" ||
      (providerDialogMode === "edit" &&
        editingProvider &&
        providerForm.baseUrl.trim() !== editingProvider.baseUrl),
  );
  const resetProviderCreationForm = useCallback(() => {
    setProviderForm({ ...EMPTY_PROVIDER_CREATION_FORM });
    setDiscoveredModels([]);
    setModelCatalogSource("");
    setDiscoveryProgressText("");
    setDiscoveryProgressValue(0);
    setTestedProviderSignature("");
    setEditingProviderId("");
  }, []);

  const updateProviderCreationField = <K extends keyof ProviderCreationForm>(
    key: K,
    value: ProviderCreationForm[K],
  ) => {
    setProviderForm((current) => ({ ...current, [key]: value }));
    if (key === "baseUrl") {
      setDiscoveredModels([]);
      setModelCatalogSource("");
      setDiscoveryProgressText("");
      setDiscoveryProgressValue(0);
    }
    if (key !== "name") {
      setTestedProviderSignature("");
    }
  };

  const openCreateProviderDialog = () => {
    resetProviderCreationForm();
    setProviderDialogMode("create");
    setProviderDialogOpen(true);
  };

  const openEditProviderDialog = () => {
    if (!selectedProvider || !selectedProviderIsOwnedUserConfig) return;
    setProviderDialogMode("edit");
    setEditingProviderId(selectedProvider.id);
    setProviderForm({
      name: selectedProvider.name,
      baseUrl: selectedProvider.baseUrl,
      apiKey: "",
      defaultModel: selectedProvider.defaultModel ?? selectedProviderModels[0] ?? "",
    });
    setDiscoveredModels(providerConfigToDiscoveredModels(selectedProvider));
    setModelCatalogSource("existing");
    setDiscoveryProgressText("");
    setDiscoveryProgressValue(0);
    setTestedProviderSignature("");
    setProviderDialogOpen(true);
  };

  const handleProviderDialogOpenChange = (open: boolean) => {
    setProviderDialogOpen(open);
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
    setDiscoveredModels([]);
    setModelCatalogSource("");
    setDiscoveryProgressText("正在连接供应商模型目录");
    setDiscoveryProgressValue(4);
    try {
      let models: ProviderDiscoveredModel[] = [];
      let streamError = "";
      await platformApi.discoverProviderModelsStream(
        {
          baseUrl: providerForm.baseUrl.trim(),
          apiKey: providerForm.apiKey.trim(),
        },
        (event) => {
          setDiscoveryProgressText(providerDiscoveryProgressText(event));
          setDiscoveryProgressValue(providerDiscoveryProgressValue(event));
          if (event.type === "completed") {
            models = event.result.models.filter((model) => model.id.trim());
          }
          if (event.type === "error") {
            streamError = event.message;
          }
        },
      );
      if (streamError) {
        throw new Error(streamError);
      }
      setDiscoveredModels(models);
      setModelCatalogSource("discovered");
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
      setModelCatalogSource("");
      setDiscoveryProgressValue(100);
      setDiscoveryProgressText(error instanceof Error ? error.message : "获取模型列表失败");
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

  const saveProviderConfig = async () => {
    // Keep save actionable so each missing prerequisite can explain the next required step.
    if (!providerForm.name.trim()) {
      toast.error("请填写供应商名称");
      return;
    }
    const baseUrlChanged = Boolean(
      providerDialogMode === "edit" &&
        editingProvider &&
        providerForm.baseUrl.trim() !== editingProvider.baseUrl,
    );
    const apiKeyRequired = providerDialogMode === "create" || baseUrlChanged;
    if (!providerForm.baseUrl.trim() || (apiKeyRequired && !providerForm.apiKey.trim())) {
      toast.error("请先填写 Base URL 和 API Key");
      return;
    }
    if (!providerForm.defaultModel.trim() || discoveredModelIds.length === 0) {
      toast.error("请先获取模型列表并选择默认模型");
      return;
    }
    if (providerDialogNeedsPassedTest && !temporaryProviderTestPassed) {
      toast.error("请先测试托管配置并确保测试通过");
      return;
    }
    setSavingProvider(true);
    try {
      const payload = {
        name: providerForm.name.trim(),
        baseUrl: providerForm.baseUrl.trim(),
        defaultModel: providerForm.defaultModel.trim(),
        allowedModels: discoveredModelIds,
        modelCapabilities: discoveredModelsToCapabilities(discoveredModels),
      };
      const saved =
        providerDialogMode === "edit" && editingProvider
          ? await platformApi.updateProviderConfig(editingProvider.id, {
              ...payload,
              apiKey: providerForm.apiKey.trim() || undefined,
            })
          : await platformApi.createProviderConfig({
              ...payload,
              apiKey: providerForm.apiKey.trim(),
            });
      await refreshProviderConfigs(saved.id);
      toast.success(
        providerDialogMode === "edit"
          ? "供应商已更新"
          : "供应商已添加并选中，点击保存后作为默认配置",
      );
      setProviderDialogOpen(false);
      resetProviderCreationForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存供应商失败");
    } finally {
      setSavingProvider(false);
    }
  };

  const deleteSelectedProvider = async () => {
    if (!selectedProvider || !selectedProviderIsOwnedUserConfig || deletingProvider) return;
    if (!window.confirm(`确定要删除供应商“${selectedProvider.name}”吗？`)) return;
    setDeletingProvider(true);
    try {
      await platformApi.revokeProviderConfig(selectedProvider.id);
      await refreshProviderConfigs();
      toast.success("供应商已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除供应商失败");
    } finally {
      setDeletingProvider(false);
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
              onClick={openCreateProviderDialog}
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
                    : "",
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
            {selectedProviderBillingHint ? (
              <span className="text-[11px] text-muted-foreground">
                {selectedProviderBillingHint}
              </span>
            ) : null}
            {providerStatus && !selectedProvider ? (
              <span className="text-[11px] text-muted-foreground">{providerStatus}</span>
            ) : null}
            {selectedProviderIsOwnedUserConfig && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={openEditProviderDialog}
                  disabled={deletingProvider}
                >
                  <Pencil className="size-4" />
                  编辑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={deleteSelectedProvider}
                  disabled={deletingProvider}
                >
                  {deletingProvider ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  删除
                </Button>
              </div>
            )}
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

      <Dialog open={providerDialogOpen} onOpenChange={handleProviderDialogOpenChange}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{providerDialogMode === "edit" ? "编辑供应商" : "添加供应商"}</DialogTitle>
            <DialogDescription>
              {providerDialogMode === "edit"
                ? "更新当前账号添加的模型供应商配置，密钥不会回显。"
                : "创建仅当前账号可用的模型供应商配置，密钥只会提交到后端保存。"}
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
                placeholder={
                  providerDialogMode === "edit"
                    ? "留空表示不更换密钥"
                    : undefined
                }
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
                  aria-label="供应商默认模型"
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
              {(discoveringModels || discoveryProgressText) && (
                <div className="grid gap-1">
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="获取模型列表进度"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={discoveryProgressValue}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${discoveryProgressValue}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {discoveryProgressText}
                  </span>
                </div>
              )}
              {discoveredModelIds.length > 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  已获取 {discoveredModelIds.length} 个模型
                  {temporaryProviderTestPassed
                    ? " · 测试已通过"
                    : providerDialogNeedsPassedTest
                      ? " · 等待测试"
                      : " · 可保存"}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  获取模型列表后才能测试和保存供应商。
                </span>
              )}
            </div>
          </div>
          <DialogFooter className="flex-wrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleProviderDialogOpenChange(false)}
              disabled={savingProvider}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={discoverModels}
              disabled={discoveringModels || testingTemporaryProvider || savingProvider || !canDiscoverModels}
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
              disabled={discoveringModels || testingTemporaryProvider || savingProvider || !canTestTemporaryProvider}
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
              onClick={saveProviderConfig}
              disabled={discoveringModels || testingTemporaryProvider || savingProvider}
            >
              {savingProvider ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              保存供应商
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
