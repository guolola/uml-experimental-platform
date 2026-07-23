// Owns project settings, provider policy, retention, and high-risk project actions.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import { Archive, Loader2 } from "lucide-react";
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
  onProjectDeleted,
}: {
  project: PlatformProject;
  membershipRole?: string | null;
  layout?: "page" | "drawer";
  onProjectDeleted?: (projectId: string) => void;
}) {
  const { t } = useTranslation();
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

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
    setDeleteDialogOpen(false);
    setDeletingProject(false);
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
      setMessage(t("projectSettings.messages.saved"));
    } catch (saveError) {
      setError(t("projectSettings.errors.save"));
    }
  };

  const archiveProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm(t("projectSettings.confirm.archive"))) return;
    try {
      const response = await platformApi.archiveProject(project.id);
      setCurrentProject(response.project);
      setMessage(t("projectSettings.messages.archived"));
    } catch (archiveError) {
      setError(t("projectSettings.errors.archive"));
    }
  };

  const restoreProject = async () => {
    setMessage("");
    setError("");
    if (!window.confirm(t("projectSettings.confirm.restore"))) return;
    try {
      const response = await platformApi.restoreProject(project.id);
      setCurrentProject(response.project);
      setMessage(t("projectSettings.messages.restored"));
    } catch (restoreError) {
      setError(t("projectSettings.errors.restore"));
    }
  };

  const transferOwner = async () => {
    setMessage("");
    setError("");
    const trimmedOwnerId = newOwnerUserId.trim();
    if (!trimmedOwnerId) {
      setError(t("projectSettings.errors.ownerRequired"));
      return;
    }
    if (!window.confirm(t("projectSettings.confirm.transfer"))) return;
    try {
      const response = await platformApi.transferProjectOwner(project.id, trimmedOwnerId);
      setCurrentProject(response.project);
      setNewOwnerUserId("");
      setMessage(t("projectSettings.messages.transferred"));
    } catch (transferError) {
      setError(t("projectSettings.errors.transfer"));
    }
  };

  const confirmDeleteProject = async () => {
    if (deletingProject) return;
    setMessage("");
    setError("");
    setDeletingProject(true);
    try {
      await platformApi.deleteProject(project.id);
      setCurrentProject((current) => ({ ...current, status: "deleted" }));
      setMessage(t("projectSettings.messages.deleted"));
      setDeleteDialogOpen(false);
      onProjectDeleted?.(project.id);
    } catch (deleteError) {
      setError(t("projectSettings.errors.delete"));
    } finally {
      setDeletingProject(false);
    }
  };

  const retentionPolicyLabel =
    retentionPolicy === "semester_180_days"
      ? t("projectSettings.retention.semester")
      : retentionPolicy === "one_year_365_days"
        ? t("projectSettings.retention.year")
        : t("projectSettings.retention.manual");
  const settingGridClass =
    layout === "drawer" ? "grid min-w-0 max-w-full gap-4 overflow-hidden" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]";
  const sectionClass = layout === "drawer" ? "min-w-0 max-w-full overflow-hidden p-4" : "";
  const canManageProjectSettings =
    !membershipRole || membershipRole === "owner";
  const settingsBlockedReason = t("projectSettings.permissionDenied");

  return (
    <>
    <div className={settingGridClass}>
      <section className={`rounded-md border border-border bg-card p-5 ${sectionClass}`}>
        <div className="grid gap-4">
          {layout === "drawer" && (
            <div>
              <h3 className="text-sm font-semibold">{t("projectSettings.basic")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("projectSettings.basicDescription")}
              </p>
            </div>
          )}
          {!canManageProjectSettings && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {settingsBlockedReason}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="settings-project-name">{t("projectSettings.name")}</Label>
            <Input
              id="settings-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canManageProjectSettings}
              title={!canManageProjectSettings ? settingsBlockedReason : undefined}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-project-description">{t("projectSettings.description")}</Label>
            <Input
              id="settings-project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("projectSettings.noDescription")}
              disabled={!canManageProjectSettings}
              title={!canManageProjectSettings ? settingsBlockedReason : undefined}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("projectSettings.background")}</Label>
            <ProjectBackgroundPicker
              name={name}
              value={backgroundKey}
              onChange={setBackgroundKey}
              disabled={!canManageProjectSettings}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-project-visibility">{t("projectSettings.visibility")}</Label>
            <SelectControl
              id="settings-project-visibility"
              value={visibility}
              onValueChange={setVisibility}
              className="h-9"
              disabled={!canManageProjectSettings}
              options={[
                { value: "private", label: t("projectSettings.visibilityValues.private") },
                { value: "team", label: t("projectSettings.visibilityValues.team") },
                { value: "public", label: t("projectSettings.visibilityValues.public") },
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-course-team">{t("projectSettings.academicBinding")}</Label>
            <SelectControl
              id="settings-course-team"
              value={courseTeam}
              onValueChange={setCourseTeam}
              className="h-9"
              disabled={!canManageProjectSettings}
              options={ACADEMIC_BINDING_OPTIONS.map((option) => ({
                value: option.value,
                label: option.value === "unassigned" ? t("projectSettings.unassigned") : option.label,
              }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("projectSettings.retention.title")}</Label>
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
                <SelectItem value="semester_180_days">{t("projectSettings.retention.semester")}</SelectItem>
                <SelectItem value="one_year_365_days">{t("projectSettings.retention.year")}</SelectItem>
                <SelectItem value="manual">{t("projectSettings.retention.manual")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={() => void saveProject()}
            disabled={!canManageProjectSettings}
            title={!canManageProjectSettings ? settingsBlockedReason : undefined}
          >
            {t("projectSettings.save")}
          </Button>
        </div>
      </section>
      <section className={`rounded-md border border-border bg-card p-5 ${sectionClass}`}>
        <h2 className="text-base">{t("projectSettings.danger.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("projectSettings.danger.description", { status: t(`projectSettings.status.${currentProject.status}`, { defaultValue: currentProject.status }) })}
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
            {t("projectSettings.actions.archive")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void restoreProject()}
            disabled={!canManageProjectSettings}
            title={!canManageProjectSettings ? settingsBlockedReason : undefined}
          >
            {t("projectSettings.actions.restore")}
          </Button>
          <div className="grid gap-1.5">
            <Label htmlFor="settings-transfer-owner">{t("projectSettings.actions.transfer")}</Label>
            <Input
              id="settings-transfer-owner"
              value={newOwnerUserId}
              onChange={(event) => setNewOwnerUserId(event.target.value)}
              placeholder={t("projectSettings.ownerPlaceholder")}
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
              {t("projectSettings.actions.transfer")}
            </Button>
          </div>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!canManageProjectSettings || deletingProject}
            title={!canManageProjectSettings ? settingsBlockedReason : undefined}
          >
            {deletingProject ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("projectSettings.actions.delete")}
          </Button>
        </div>
        {(message || error) && (
          <div className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">
            {message || error}
          </div>
        )}
      </section>
    </div>
    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projectSettings.deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("projectSettings.deleteDialog.description", { name: currentProject.name })}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deletingProject}
          >
            {t("projectSettings.deleteDialog.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirmDeleteProject()}
            disabled={deletingProject}
          >
            {deletingProject ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("projectSettings.deleteDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
