import { useEffect, useState } from "react";
import { Settings, Eye, EyeOff, PlugZap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Switch } from "../../../shared/ui/switch";
import { Separator } from "../../../shared/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../shared/ui/select";
import { ModelPicker } from "../../../shared/ui/model-picker";
import { useTheme } from "../../../app/providers/theme-provider";
import { getModelCapability } from "../../../shared/lib/model-catalog";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  normalizeApiBaseUrl,
  saveUserSettings,
  type UserSettings,
} from "../../../shared/lib/user-settings";

export function SettingsDialog() {
  const { theme, toggle } = useTheme();
  const repository = useWorkspaceRepository();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const capability = getModelCapability(settings.defaultModel);

  useEffect(() => {
    if (open) setSettings(loadUserSettings());
  }, [open]);

  const update = <K extends keyof UserSettings>(k: K, v: UserSettings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  const save = () => {
    try {
      saveUserSettings({
        ...settings,
        apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl),
      });
      toast.success("设置已保存");
      setOpen(false);
    } catch {
      toast.error("API Base URL 不是合法地址");
    }
  };

  const reset = () => {
    setSettings(DEFAULT_USER_SETTINGS);
    toast.message("已恢复默认值，记得点击保存");
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await repository.testProviderSettings({
        apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl),
        apiKey: settings.apiKey,
        model: settings.defaultModel,
      });
      toast.success(`连接成功：${result.capability.modeLabel}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "连接测试失败");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-12 rounded-full bg-secondary text-secondary-foreground shadow-none hover:bg-muted"
          title="设置"
        >
          <Settings className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>通用偏好与模型 API 配置（保存于本地）。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <section className="flex flex-col gap-3">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground">
              通用
            </h4>
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
                onValueChange={(v: "sm" | "md" | "lg") => update("fontSize", v)}
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
                <span className="text-xs text-muted-foreground">
                  关闭后仅显示「需求已修改」提示
                </span>
              </div>
              <Switch
                checked={settings.autoGenerate}
                onCheckedChange={(v) => update("autoGenerate", v)}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <Label>显示过期模型横幅</Label>
                <span className="text-xs text-muted-foreground">
                  顶部黄色提示条
                </span>
              </div>
              <Switch
                checked={settings.showStaleBanner}
                onCheckedChange={(v) => update("showStaleBanner", v)}
              />
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground">
              模型 API
            </h4>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="default-model">默认模型</Label>
              <div id="default-model">
                <ModelPicker
                  value={settings.defaultModel}
                  onValueChange={(value) => update("defaultModel", value)}
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
                  update("imageModel", value as UserSettings["imageModel"])
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
                onChange={(e) => update("apiBaseUrl", e.target.value)}
                placeholder="https://your-model-provider.example.com"
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
                  onChange={(e) => update("apiKey", e.target.value)}
                  placeholder="sk-..."
                  className="h-9 pr-9 font-mono text-xs"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={showKey ? "隐藏" : "显示"}
                >
                  {showKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <span className="text-[11px] text-muted-foreground">
                密钥仅保存在浏览器本地，不会上传到服务器。
              </span>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={reset}>
            恢复默认
          </Button>
          <Button
            variant="outline"
            onClick={testConnection}
            disabled={testing || !settings.apiBaseUrl.trim() || !settings.apiKey.trim()}
          >
            {testing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlugZap className="size-4" />
            )}
            测试连接
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={save}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
