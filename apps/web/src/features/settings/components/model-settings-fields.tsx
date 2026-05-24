// Shared model provider configuration fields used by the dialog and settings page.
import { Eye, EyeOff } from "lucide-react";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../shared/ui/select";
import { ModelPicker } from "../../../shared/ui/model-picker";
import { getModelCapability } from "../../../shared/lib/model-catalog";
import type { UserSettings } from "../../../shared/lib/user-settings";

type ModelSettingsFieldsProps = {
  settings: UserSettings;
  showKey: boolean;
  onToggleKey: () => void;
  onChange: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
};

export function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) return "未配置本地密钥";
  const suffix = trimmed.slice(-4);
  return `••••••••••••${suffix}`;
}

export function ModelSettingsFields({
  settings,
  showKey,
  onToggleKey,
  onChange,
}: ModelSettingsFieldsProps) {
  const capability = getModelCapability(settings.defaultModel);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="default-model">默认模型</Label>
        <div id="default-model">
          <ModelPicker
            value={settings.defaultModel}
            onValueChange={(value) => onChange("defaultModel", value)}
            fullWidth
          />
        </div>
        <span className="text-[11px] text-muted-foreground">
          左侧厂商，右侧具体模型；保存后页面会同步使用这个默认模型。
        </span>
        <span className="text-[11px] text-muted-foreground">
          结构模式：{capability.modeLabel}
          {capability.warning ? `。${capability.warning}` : ""}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image-model">图片模型</Label>
        <Select
          value={settings.imageModel}
          onValueChange={(value) =>
            onChange("imageModel", value as UserSettings["imageModel"])
          }
        >
          <SelectTrigger id="image-model" className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gpt-image-2">gpt-image-2</SelectItem>
            <SelectItem value="gemini-3.1-flash-image-preview-2k">
              gemini-3.1-flash-image-preview-2k
            </SelectItem>
            <SelectItem value="nano-banana-pro">nano-banana-pro</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground">
          代码生成会先用图片模型生成界面设计图，再按图生成前端原型。
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="api-base">API Base URL</Label>
        <Input
          id="api-base"
          value={settings.apiBaseUrl}
          onChange={(event) => onChange("apiBaseUrl", event.target.value)}
          placeholder="https://ai.comfly.org"
          className="h-9 font-mono text-xs"
        />
        <span className="text-[11px] text-muted-foreground">
          这里只填站点根地址，系统会自动使用 `/v1/chat/completions`。
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="api-key">API Key</Label>
        <div className="relative">
          <Input
            id="api-key"
            type={showKey ? "text" : "password"}
            value={settings.apiKey}
            onChange={(event) => onChange("apiKey", event.target.value)}
            placeholder="sk-..."
            className="h-9 pr-9 font-mono text-xs"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={onToggleKey}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            title={showKey ? "隐藏" : "显示"}
            aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
          >
            {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          当前密钥：{maskApiKey(settings.apiKey)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          首轮仍复用本地配置能力；后续会迁移到服务端密钥托管，并且密钥不再回显明文。
        </span>
      </div>
    </section>
  );
}
