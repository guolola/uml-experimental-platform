// Renders global model and workspace preferences in either a dialog or an embedded settings tab.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
  compatibleMode: string,
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
            modeLabel: model.modeLabel ?? compatibleMode,
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

function providerDiscoveryProgressText(event: ProviderModelDiscoveryProgressEvent, t: TFunction) {
  if (event.type === "started") return t("providerSettings.connectingCatalog");
  if (event.type === "models_listed") return t("providerSettings.listedModels", { count: event.rawCount });
  if (event.type === "name_filtered") {
    return t("providerSettings.filteredModels", { count: event.candidateCount });
  }
  if (event.type === "probe_started") {
    return t("providerSettings.probingModel", { model: event.modelId, index: event.index, total: event.total });
  }
  if (event.type === "probe_completed") {
    return t("providerSettings.probedModel", { model: event.modelId, index: event.index, total: event.total });
  }
  if (event.type === "completed") {
    return t("providerSettings.discoveredModels", { count: event.result.models.length });
  }
  return t("providerSettings.discoveryFailed");
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
  const { t } = useTranslation();
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
        activeConfigs.length === 0 ? t("providerSettings.noManagedProviders") : "",
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
    [t],
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
          setProviderStatus(t("providerSettings.accessDenied"));
          return;
        }
        setAuthRequired(
          error instanceof PlatformApiError && error.status === 401,
        );
        setProviderStatus(
          error instanceof PlatformApiError && error.status === 401
            ? t("providerSettings.loginRequired")
            : error instanceof Error
              ? error.message
              : t("providerSettings.authCheckFailed"),
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
  }, [active, refreshProviderConfigs, t]);

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
      return t("providerSettings.personalNoCredits");
    }
    if (selectedProvider.scopeType !== "system" && selectedProvider.scopeType !== "project") {
      return "";
    }
    if (billingSummaryUnavailable) return t("providerSettings.creditsUnavailable");
    if (!billingSummary) return "";
    if (billingSummary.creditBalance <= 0) {
      return t("providerSettings.noCredits");
    }
    return t("providerSettings.credits", { count: billingSummary.creditBalance });
  }, [
    billingSummary,
    billingSummaryUnavailable,
    selectedProvider,
    selectedProviderIsOwnedUserConfig,
    t,
  ]);
  const editingProvider = useMemo(
    () => providerConfigs.find((config) => config.id === editingProviderId),
    [editingProviderId, providerConfigs],
  );
  const resolvedDefaultModel = selectedProvider
    ? resolveProviderModel(selectedProvider, settings.defaultModel)
    : "";
  const providerEmptyLabel = providerLoading
    ? t("providerSettings.loadingProvider")
    : providerConfigs.length === 0
      ? t("providerSettings.noProvider")
      : t("providerSettings.selectProvider");
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
      toast.error(t("providerSettings.baseKeyRequired"));
      return;
    }
    setDiscoveringModels(true);
    setTestedProviderSignature("");
    setDiscoveredModels([]);
    setModelCatalogSource("");
    setDiscoveryProgressText(t("providerSettings.connectingCatalog"));
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
          setDiscoveryProgressText(providerDiscoveryProgressText(event, t));
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
        toast.error(t("providerSettings.noModels"));
        return;
      }
      toast.success(t("providerSettings.discoveredModels", { count: models.length }));
    } catch (error) {
      setDiscoveredModels([]);
      setModelCatalogSource("");
      setDiscoveryProgressValue(100);
      setDiscoveryProgressText(error instanceof Error ? error.message : t("providerSettings.discoveryFailed"));
      toast.error(t("providerSettings.discoveryFailed"));
    } finally {
      setDiscoveringModels(false);
    }
  };

  const testTemporaryProvider = async () => {
    if (!canTestTemporaryProvider) {
      toast.error(t("providerSettings.selectDefaultFirst"));
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
        toast.error(t("providerSettings.testFailed"));
        return;
      }
      setTestedProviderSignature(currentProviderSignature);
      toast.success(t("providerSettings.testSuccess"));
    } catch (error) {
      toast.error(t("providerSettings.testFailed"));
    } finally {
      setTestingTemporaryProvider(false);
    }
  };

  const saveProviderConfig = async () => {
    // Keep save actionable so each missing prerequisite can explain the next required step.
    if (!providerForm.name.trim()) {
      toast.error(t("providerSettings.nameRequired"));
      return;
    }
    const baseUrlChanged = Boolean(
      providerDialogMode === "edit" &&
        editingProvider &&
        providerForm.baseUrl.trim() !== editingProvider.baseUrl,
    );
    const apiKeyRequired = providerDialogMode === "create" || baseUrlChanged;
    if (!providerForm.baseUrl.trim() || (apiKeyRequired && !providerForm.apiKey.trim())) {
      toast.error(t("providerSettings.baseKeyRequired"));
      return;
    }
    if (!providerForm.defaultModel.trim() || discoveredModelIds.length === 0) {
      toast.error(t("providerSettings.selectDefaultFirst"));
      return;
    }
    if (providerDialogNeedsPassedTest && !temporaryProviderTestPassed) {
      toast.error(t("providerSettings.testRequired"));
      return;
    }
    setSavingProvider(true);
    try {
      const payload = {
        name: providerForm.name.trim(),
        baseUrl: providerForm.baseUrl.trim(),
        defaultModel: providerForm.defaultModel.trim(),
        allowedModels: discoveredModelIds,
        modelCapabilities: discoveredModelsToCapabilities(
          discoveredModels,
          t("providerSettings.compatibleMode"),
        ),
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
          ? t("providerSettings.providerUpdated")
          : t("providerSettings.providerAdded"),
      );
      setProviderDialogOpen(false);
      resetProviderCreationForm();
    } catch (error) {
      toast.error(t("providerSettings.saveProviderFailed"));
    } finally {
      setSavingProvider(false);
    }
  };

  const deleteSelectedProvider = async () => {
    if (!selectedProvider || !selectedProviderIsOwnedUserConfig || deletingProvider) return;
    if (!window.confirm(t("providerSettings.deleteConfirm", { name: selectedProvider.name }))) return;
    setDeletingProvider(true);
    try {
      await platformApi.revokeProviderConfig(selectedProvider.id);
      await refreshProviderConfigs();
      toast.success(t("providerSettings.providerDeleted"));
    } catch (error) {
      toast.error(t("providerSettings.deleteFailed"));
    } finally {
      setDeletingProvider(false);
    }
  };

  const save = () => {
    try {
      if (!settings.providerConfigId) {
        toast.error(t("providerSettings.managedRequired"));
        return;
      }
      if (!selectedProvider || selectedProviderModels.length === 0) {
        toast.error(t("providerSettings.noModelsForProvider"));
        return;
      }
      if (!selectedProviderModels.includes(resolvedDefaultModel)) {
        toast.error(t("providerSettings.modelMustBelong"));
        return;
      }
      saveUserSettings({
        ...settings,
        providerModelCapabilities: getProviderModelCapabilities(selectedProvider),
        providerModelOptions: getProviderAllowedModels(selectedProvider),
        providerLabel: getProviderLabel(selectedProvider),
        defaultModel: resolvedDefaultModel,
      });
      toast.success(t("providerSettings.saved"));
      onSaved?.();
    } catch {
      toast.error(t("providerSettings.saveFailed"));
    }
  };

  const reset = () => {
    setSettings(DEFAULT_USER_SETTINGS);
    toast.message(t("providerSettings.restored"));
  };

  if (authRequired) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t("providerSettings.loginNotice")}
        </div>
        {onNavigate && (
          <Button
            type="button"
            onClick={() => onNavigate("/login")}
          >
            {t("providerSettings.goLogin")}
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
              <h3 className="text-sm font-semibold">{t("providerSettings.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("providerSettings.description")}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openCreateProviderDialog}
            >
              <Plus className="size-4" />
              {t("providerSettings.addProvider")}
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="managed-provider-config">{t("providerSettings.managedConfig")}</Label>
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
                aria-label={t("providerSettings.managedConfig")}
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
                    {t("providerSettings.configLabel", { name: config.name, scope: providerScopeLabel(config, {
                      user: t("providerSettings.scopes.user"),
                      system: t("providerSettings.scopes.system"),
                      project: t("providerSettings.scopes.project"),
                      managed: t("providerSettings.scopes.managed"),
                    }) })}
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
                  {t("providerSettings.edit")}
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
                  {t("providerSettings.delete")}
                </Button>
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="managed-default-model">{t("providerSettings.defaultModel")}</Label>
            {selectedProvider ? (
              <Select
                value={resolvedDefaultModel}
                onValueChange={(value) => update("defaultModel", value)}
                disabled={selectedProviderModels.length === 0}
              >
                <SelectTrigger
                  id="managed-default-model"
                  aria-label={t("providerSettings.defaultModel")}
                  className="h-9"
                >
                  <SelectValue placeholder={t("providerSettings.selectAllowedModel")} />
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
                  aria-label={t("providerSettings.defaultModel")}
                  className="h-9"
                >
                  <SelectValue placeholder={t("providerSettings.selectProviderFirst")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("providerSettings.selectProviderFirst")}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {selectedProvider && selectedProviderModels.length === 0 && (
              <span className="text-[11px] text-warning">
                {t("providerSettings.providerNoModelsHint")}
              </span>
            )}
            {!selectedProvider && (
              <span className="text-[11px] text-muted-foreground">
                {t("providerSettings.providerFirstHint")}
              </span>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
          <div>
            <h3 className="text-sm font-semibold">{t("providerSettings.preferences")}</h3>
            <p className="text-xs text-muted-foreground">{t("providerSettings.preferencesDescription")}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <Label>{t("providerSettings.darkTheme")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("providerSettings.currentTheme", { theme: theme === "dark" ? t("providerSettings.dark") : t("providerSettings.light") })}
              </span>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggle} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <Label>{t("providerSettings.fontSize")}</Label>
              <span className="text-xs text-muted-foreground">{t("providerSettings.densityHint")}</span>
            </div>
            <Select
              value={settings.fontSize}
              onValueChange={(value: "sm" | "md" | "lg") => update("fontSize", value)}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">{t("providerSettings.compact")}</SelectItem>
                <SelectItem value="md">{t("providerSettings.default")}</SelectItem>
                <SelectItem value="lg">{t("providerSettings.comfortable")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <Label>{t("providerSettings.autoRules")}</Label>
              <span className="text-xs text-muted-foreground">{t("providerSettings.autoRulesHint")}</span>
            </div>
            <Switch checked={settings.autoGenerate} onCheckedChange={(value) => update("autoGenerate", value)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <Label>{t("providerSettings.staleBanner")}</Label>
              <span className="text-xs text-muted-foreground">{t("providerSettings.staleBannerHint")}</span>
            </div>
            <Switch checked={settings.showStaleBanner} onCheckedChange={(value) => update("showStaleBanner", value)} />
          </div>
        </section>
      </div>

      <ScaledToolbar className="mt-5" contentClassName="justify-end" minWidth={360}>
        <Button variant="ghost" onClick={reset}>
          <RotateCw className="size-4" />
          {t("providerSettings.restore")}
        </Button>
        <Button onClick={save}>
          <KeyRound className="size-4" />
          {t("providerSettings.save")}
        </Button>
      </ScaledToolbar>

      <Dialog open={providerDialogOpen} onOpenChange={handleProviderDialogOpenChange}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{providerDialogMode === "edit" ? t("providerSettings.editProvider") : t("providerSettings.createProvider")}</DialogTitle>
            <DialogDescription>
              {providerDialogMode === "edit"
                ? t("providerSettings.editDescription")
                : t("providerSettings.createDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-name">{t("providerSettings.name")}</Label>
              <Input
                id="provider-create-name"
                value={providerForm.name}
                onChange={(event) =>
                  updateProviderCreationField("name", event.target.value)
                }
                placeholder={t("providerSettings.namePlaceholder")}
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
                    ? t("providerSettings.keepSecret")
                    : undefined
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="provider-create-default-model">{t("providerSettings.defaultModel")}</Label>
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
                  aria-label={t("providerSettings.providerDefaultModel")}
                  className="h-9"
                >
                  <SelectValue placeholder={t("providerSettings.fetchModelsFirst")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    {t("providerSettings.fetchModelsFirst")}
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
                    aria-label={t("providerSettings.discoveryProgress")}
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
                  {t("providerSettings.modelCount", { count: discoveredModelIds.length })}
                  {temporaryProviderTestPassed
                    ? ` · ${t("providerSettings.testPassed")}`
                    : providerDialogNeedsPassedTest
                      ? ` · ${t("providerSettings.waitingTest")}`
                      : ` · ${t("providerSettings.readyToSave")}`}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {t("providerSettings.fetchBeforeActions")}
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
              {t("providerSettings.cancel")}
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
              {t("providerSettings.fetchModels")}
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
              {t("providerSettings.testConfig")}
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
              {t("providerSettings.saveProvider")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
