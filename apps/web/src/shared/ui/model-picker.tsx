import { useEffect, useMemo, useState } from "react";
import { Check, Cpu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "./utils";
import {
  MODEL_VENDORS,
  getModelCapability,
  getModelDisplayName,
  getModelOption,
  getModelVendor,
} from "../lib/model-catalog";
import {
  USER_SETTINGS_CHANGED_EVENT,
  loadUserSettings,
} from "../lib/user-settings";

function getProviderModelLabel(modelId: string) {
  const trimmed = modelId.trim();
  if (!trimmed) return "未设置";
  const parts = trimmed.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

function normalizeGroupId(label: string) {
  return label.toLowerCase().replace(/\s+/gu, "-");
}

function inferProviderModelGroup(modelId: string, fallbackLabel: string) {
  const catalogModel = getModelOption(modelId);
  if (catalogModel) {
    const vendor = getModelVendor(catalogModel.id);
    return { id: vendor.id, label: vendor.label };
  }

  const normalized = modelId.toLowerCase();
  if (/(^|[/_.-])(deepseek|deepseek-ai)([/_.-]|$)/u.test(normalized)) {
    return { id: "deepseek", label: "DeepSeek" };
  }
  if (/(^|[/_.-])(kimi|moonshot|moonshotai)([/_.-]|$)/u.test(normalized)) {
    return { id: "kimi", label: "Kimi" };
  }
  if (/(^|[/_.-])(qwen|qwen\d|aliyun|dashscope)([/_.-]|$)/u.test(normalized)) {
    return { id: "qwen", label: "Qwen" };
  }
  if (/(^|[/_.-])(glm|zai-org|zhipu|thudm)([/_.-]|$)/u.test(normalized)) {
    return { id: "zhipu", label: "智谱" };
  }
  if (/(^|[/_.-])(minimax|minimaxai)([/_.-]|$)/u.test(normalized)) {
    return { id: "minimax", label: "Minimax" };
  }
  if (/(^|[/_.-])(claude|anthropic)([/_.-]|$)/u.test(normalized)) {
    return { id: "claude", label: "Claude" };
  }
  if (/(^|[/_.-])(gemini|google)([/_.-]|$)/u.test(normalized)) {
    return { id: "google", label: "Google" };
  }
  if (/(^|[/_.-])(gpt|openai)([/_.-]|$)/u.test(normalized)) {
    return { id: "openai", label: "OpenAI" };
  }

  const label = fallbackLabel.trim() || "托管 Provider";
  return { id: `provider-${normalizeGroupId(label)}`, label };
}

function getProviderModelGroups(modelIds: string[], fallbackLabel: string) {
  const groups = new Map<
    string,
    {
      id: string;
      label: string;
      models: Array<{ id: string; shortLabel: string; fullLabel: string }>;
    }
  >();

  modelIds.forEach((modelId) => {
    const trimmed = modelId.trim();
    if (!trimmed) return;
    const group = inferProviderModelGroup(trimmed, fallbackLabel);
    const catalogModel = getModelOption(trimmed);
    if (!groups.has(group.id)) {
      groups.set(group.id, { ...group, models: [] });
    }
    groups.get(group.id)?.models.push({
      id: trimmed,
      shortLabel: catalogModel?.shortLabel ?? getProviderModelLabel(trimmed),
      fullLabel: catalogModel?.fullLabel ?? trimmed,
    });
  });

  return Array.from(groups.values());
}

export function ModelPicker({
  value,
  onValueChange,
  align = "start",
  triggerClassName,
  fullWidth = false,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  align?: "start" | "center" | "end";
  triggerClassName?: string;
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  const [providerSettings, setProviderSettings] = useState(() => {
    const settings = loadUserSettings();
    return {
      providerLabel: settings.providerLabel,
      providerModelOptions: settings.providerModelOptions,
    };
  });
  useEffect(() => {
    const syncSettings = () => {
      const settings = loadUserSettings();
      setProviderSettings({
        providerLabel: settings.providerLabel,
        providerModelOptions: settings.providerModelOptions,
      });
    };
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
    return () => window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, syncSettings);
  }, []);

  const providerModels = useMemo(
    () => providerSettings.providerModelOptions.filter((model) => model.trim().length > 0),
    [providerSettings.providerModelOptions],
  );
  const providerModelGroups = useMemo(
    () => getProviderModelGroups(providerModels, providerSettings.providerLabel),
    [providerModels, providerSettings.providerLabel],
  );
  const display = providerModels.length > 0
    ? {
        triggerLabel: getProviderModelLabel(value),
      }
    : getModelDisplayName(value);
  const selectedVendor = getModelVendor(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent",
            fullWidth && "w-full justify-between rounded-md text-left",
            disabled && "cursor-not-allowed opacity-50 hover:bg-background",
            triggerClassName,
          )}
          title="切换模型"
          disabled={disabled}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{display.triggerLabel}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-56">
        {providerModelGroups.length > 0 ? (
          providerModelGroups.map((vendor) => (
            <DropdownMenuSub key={vendor.id}>
              <DropdownMenuSubTrigger className="gap-2 text-xs">
                <span className="font-medium">{vendor.label}</span>
                {vendor.models.some((model) => model.id === value) && (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {vendor.models.find((model) => model.id === value)?.shortLabel}
                  </span>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-52">
                {vendor.models.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onSelect={() => onValueChange(model.id)}
                    className="flex items-center justify-between gap-3 text-xs"
                    title={model.fullLabel}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{model.shortLabel}</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {model.fullLabel}
                      </span>
                    </span>
                    {model.id === value && (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        ) : MODEL_VENDORS.map((vendor) => (
          <DropdownMenuSub key={vendor.id}>
            <DropdownMenuSubTrigger className="gap-2 text-xs">
              <span className="font-medium">{vendor.label}</span>
              {selectedVendor.id === vendor.id && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {getModelOption(value)?.shortLabel}
                </span>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52">
              {vendor.models.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onSelect={() => onValueChange(model.id)}
                  className="flex items-center justify-between gap-3 text-xs"
                  title={model.fullLabel}
                >
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2">
                      <span>{model.shortLabel}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {getModelCapability(model.id).modeLabel}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {model.fullLabel}
                    </span>
                  </span>
                  {model.id === value && (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
