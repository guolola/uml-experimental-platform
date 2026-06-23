// Owns project settings, provider policy, retention, and high-risk project actions.
import { useEffect, useState } from "react";
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import { Archive } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Select, SelectContent, SelectControl, SelectItem, SelectTrigger } from "../../../shared/ui/select";
import {
  ACADEMIC_BINDING_OPTIONS,
  academicBindingFromValue,
} from "../lib/academic-binding";
import {
  platformApi,
  type PlatformProject,
} from "../services/platform-api";
import { ProjectBackgroundPicker } from "./project-background-picker";

export function ProjectSettings({
  project,
  membershipRole,
  layout = "page",
}: {
  project: PlatformProject;
  membershipRole?: string | null;
  layout?: "page" | "drawer";
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [visibility, setVisibility] = useState(project.visibility);
  const [courseTeam, setCourseTeam] = useState<string>(
    ACADEMIC_BINDING_OPTIONS.find(
      (option) =>
        option.courseId === project.courseId &&
        option.classId === project.classId &&
        option.teamId === project.teamId,
    )?.value ?? "unassigned",
  );
  const [backgroundKey, setBackgroundKey] = useState<ProjectBackgroundKey | null>(
    project.backgroundKey ?? null,
  );
  const [retentionPolicy, setRetentionPolicy] = useState(project.retentionPolicy ?? "manual");
  const [newOwnerUserId, setNewOwnerUserId] = useState("");
  const [currentProject, setCurrentProject] = useState(project);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setVisibility(project.visibility);
    setCourseTeam(
      ACADEMIC_BINDING_OPTIONS.find(
        (option) =>
          option.courseId === project.courseId &&
          option.classId === project.classId &&
          option.teamId === project.teamId,
      )?.value ?? "unassigned",
    );
    setBackgroundKey(project.backgroundKey ?? null);
    setRetentionPolicy(project.retentionPolicy ?? "manual");
    setNewOwnerUserId("");
    setCurrentProject(project);
  }, [project]);

  const saveProject = async () => {
    setMessage("");
    setError("");
    try {
      const academicBinding = academicBindingFromValue(courseTeam);
      const response = await platformApi.updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        organizationId: academicBinding.organizationId,
        courseId: academicBinding.courseId,
        classId: academicBinding.classId,
        teamId: academicBinding.teamId,
        backgroundKey,
      });
      const retentionResponse = await platformApi.updateProjectRetentionPolicy(
        project.id,
        retentionPolicy,
      );
      setCurrentProject({ ...response.project, retentionPolicy: retentionResponse.project.retentionPolicy });
      setMessage("项目设置已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "项目设置保存失败。");
    }
  };

  const archiveProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm("确定要归档此项目吗？此操作会写入审计日志。")) return;
    try {
      const response = await platformApi.archiveProject(project.id);
      setCurrentProject(response.project);
      setMessage(response.message ?? "项目已归档。");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "项目归档失败。");
    }
  };

  const restoreProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm("确定要恢复此项目吗？此操作会写入审计日志。")) return;
    try {
      const response = await platformApi.restoreProject(project.id);
      setCurrentProject(response.project);
      setMessage(response.message ?? "项目已恢复。");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "项目恢复失败。");
    }
  };

  const transferOwner = async () => {
    setMessage("");
    setError("");
    const trimmedOwnerId = newOwnerUserId.trim();
    if (!trimmedOwnerId) {
      setError("请输入新所有者用户 ID。");
      return;
    }
    if (!window.confirm("确定要转移项目所有者吗？此操作会写入审计日志。")) return;
    try {
      const response = await platformApi.transferProjectOwner(project.id, trimmedOwnerId);
      setCurrentProject(response.project);
      setNewOwnerUserId("");
      setMessage(response.message ?? "项目所有者已转移。");
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "项目所有者转移失败。");
    }
  };

  const deleteProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm("确定要删除此项目吗？此操作会写入审计日志。")) return;
    try {
      await platformApi.deleteProject(project.id);
      setCurrentProject((current) => ({ ...current, status: "deleted" }));
      setMessage("项目已删除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "项目删除失败。");
    }
  };

  const retentionPolicyLabel =
    retentionPolicy === "semester_180_days"
      ? "保留到学期结束后 180 天"
      : retentionPolicy === "one_year_365_days"
        ? "保留一年"
        : "手动归档";
  const settingGridClass =
    layout === "drawer" ? "grid min-w-0 max-w-full gap-4 overflow-hidden" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]";
  const sectionClass = layout === "drawer" ? "min-w-0 max-w-full overflow-hidden p-4" : "";
  const canManageProjectSettings =
    !membershipRole || membershipRole === "owner";
  const settingsBlockedReason = "当前项目角色不能管理项目设置。";

  return (
    <div className={settingGridClass}>
      <section className={`rounded-md border border-border bg-card p-5 ${sectionClass}`}>
        <div className="grid gap-4">
          {layout === "drawer" && (
            <div>
              <h3 className="text-sm font-semibold">基本信息</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                名称、描述和可见性直接保存到项目 API。
              </p>
            </div>
          )}
          {!canManageProjectSettings && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {settingsBlockedReason}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="settings-project-name">项目信息</Label>
            <Input
              id="settings-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canManageProjectSettings}
              title={!canManageProjectSettings ? settingsBlockedReason : undefined}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-project-description">项目描述</Label>
            <Input
              id="settings-project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="暂无项目描述"
              disabled={!canManageProjectSettings}
              title={!canManageProjectSettings ? settingsBlockedReason : undefined}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>项目背景</Label>
            <ProjectBackgroundPicker
              name={name}
              value={backgroundKey}
              onChange={setBackgroundKey}
              disabled={!canManageProjectSettings}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-project-visibility">项目可见性</Label>
            <SelectControl
              id="settings-project-visibility"
              value={visibility}
              onValueChange={setVisibility}
              className="h-9"
              disabled={!canManageProjectSettings}
              options={[
                { value: "private", label: "private" },
                { value: "team", label: "team" },
                { value: "public", label: "public" },
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-course-team">课程/班级/team</Label>
            <SelectControl
              id="settings-course-team"
              value={courseTeam}
              onValueChange={setCourseTeam}
              className="h-9"
              disabled={!canManageProjectSettings}
              options={ACADEMIC_BINDING_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>数据保留策略</Label>
            <Select
              value={retentionPolicy}
              onValueChange={setRetentionPolicy}
              disabled={!canManageProjectSettings}
            >
              <SelectTrigger className="min-w-0 max-w-full">
                <span
                  data-slot="select-value"
                  className="min-w-0 truncate"
                  title={retentionPolicyLabel}
                >
                  {retentionPolicyLabel}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semester_180_days">保留到学期结束后 180 天</SelectItem>
                <SelectItem value="one_year_365_days">保留一年</SelectItem>
                <SelectItem value="manual">手动归档</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={() => void saveProject()}
            disabled={!canManageProjectSettings}
            title={!canManageProjectSettings ? settingsBlockedReason : undefined}
          >
            保存项目设置
          </Button>
        </div>
      </section>
      <section className={`rounded-md border border-border bg-card p-5 ${sectionClass}`}>
        <h2 className="text-base">高危操作</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          当前项目状态：{currentProject.status}。删除和归档会要求二次确认并记录审计。
        </p>
        <div className="mt-4 grid gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void archiveProject()}
            disabled={!canManageProjectSettings}
            title={!canManageProjectSettings ? settingsBlockedReason : undefined}
          >
            <Archive className="size-4" />
            归档项目
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void restoreProject()}
            disabled={!canManageProjectSettings}
            title={!canManageProjectSettings ? settingsBlockedReason : undefined}
          >
            恢复项目
          </Button>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-transfer-owner">转移所有者</Label>
            <Input
              id="settings-transfer-owner"
              value={newOwnerUserId}
              onChange={(event) => setNewOwnerUserId(event.target.value)}
              placeholder="输入新所有者用户 ID"
              disabled={!canManageProjectSettings}
              title={!canManageProjectSettings ? settingsBlockedReason : undefined}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void transferOwner()}
              disabled={!canManageProjectSettings}
              title={!canManageProjectSettings ? settingsBlockedReason : undefined}
            >
              转移所有者
            </Button>
          </div>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void deleteProject()}
            disabled={!canManageProjectSettings}
            title={!canManageProjectSettings ? settingsBlockedReason : undefined}
          >
            删除项目
          </Button>
        </div>
        {(message || error) && (
          <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
            {message || error}
          </div>
        )}
      </section>
    </div>
  );
}
