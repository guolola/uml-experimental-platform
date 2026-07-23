// Renders project creation state and maps selected bindings into createProject input.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import { ChevronDown, Loader2, Settings2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { SelectControl } from "../../../shared/ui/select";
import {
  UNASSIGNED_ACADEMIC_OPTION,
  academicBindingFromValue,
  buildAcademicBindingOptions,
  type AcademicBindingOption,
} from "../lib/academic-binding";
import { platformApi } from "../services/platform-api";
import { ProjectBackgroundPicker } from "./project-background-picker";

type Navigate = (path: string) => void;

type SegmentOption = {
  value: string;
  label: string;
};

function SegmentedButtonGroup({
  labelId,
  value,
  options,
  onChange,
}: {
  labelId: string;
  value: string;
  options: SegmentOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={selected ? "secondary" : "outline"}
            aria-pressed={selected}
            className="h-8 rounded-md px-3 text-xs"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export function ProjectCreateForm({ onNavigate }: { onNavigate: Navigate }) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => t("projects.createForm.defaultName"));
  const [description, setDescription] = useState("");
  const [courseTeam, setCourseTeam] = useState(UNASSIGNED_ACADEMIC_OPTION.value);
  const [academicOptions, setAcademicOptions] = useState<AcademicBindingOption[]>([
    UNASSIGNED_ACADEMIC_OPTION,
  ]);
  const [academicLoading, setAcademicLoading] = useState(true);
  const [academicStatus, setAcademicStatus] = useState("");
  const [visibility, setVisibility] = useState("team");
  const [backgroundKey, setBackgroundKey] = useState<ProjectBackgroundKey | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setAcademicLoading(true);
    platformApi
      .listAcademicOptions()
      .then((response) => {
        if (!active) return;
        const options = buildAcademicBindingOptions(response);
        setAcademicOptions(options);
        setCourseTeam(UNASSIGNED_ACADEMIC_OPTION.value);
      })
      .catch(() => {
        if (!active) return;
        setAcademicStatus(t("projects.createForm.academicLoadFailed"));
      })
      .finally(() => {
        if (active) setAcademicLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const createProject = async () => {
    setCreating(true);
    setStatus("");
    try {
      const academicBinding = academicBindingFromValue(courseTeam, academicOptions);
      const response = await platformApi.createProject({
        name,
        description: description.trim() || null,
        visibility: visibility === "course" ? "team" : visibility,
        organizationId: academicBinding.organizationId,
        courseId: academicBinding.courseId,
        classId: academicBinding.classId,
        teamId: academicBinding.teamId,
        backgroundKey,
      });
      setStatus(t("projects.createForm.saved"));
      window.setTimeout(() => onNavigate(`/projects/${response.project.id}`), 900);
    } catch {
      setStatus(t("projects.createForm.failed"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <form className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="project-name">{t("projects.createForm.name")}</Label>
        <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>{t("projects.createForm.background")}</Label>
        <ProjectBackgroundPicker
          name={name}
          value={backgroundKey}
          onChange={setBackgroundKey}
          disabled={creating}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="project-description">{t("projects.createForm.description")}</Label>
        <textarea
          id="project-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("projects.createForm.descriptionPlaceholder")}
          rows={4}
          className="min-h-24 w-full resize-y rounded-md border border-input bg-input-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
      </div>
      <div className="grid gap-1.5">
        <Label id="project-visibility-label">{t("projects.createForm.visibility")}</Label>
        <SegmentedButtonGroup
          labelId="project-visibility-label"
          value={visibility}
          options={[
            { value: "private", label: t("projects.createForm.visibilityOptions.private") },
            { value: "team", label: t("projects.createForm.visibilityOptions.team") },
            { value: "course", label: t("projects.createForm.visibilityOptions.course") },
          ]}
          onChange={setVisibility}
        />
      </div>
      <div className="grid gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={advancedOpen}
          aria-controls="project-create-advanced-settings"
          className="h-8 w-fit px-2 text-xs text-muted-foreground"
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          <Settings2 className="size-3.5" />
          {t("projects.createForm.advanced")}
          <ChevronDown
            className={`size-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
          />
        </Button>
        {advancedOpen && (
          <div
            id="project-create-advanced-settings"
            className="grid gap-1.5 rounded-md border border-border/60 bg-muted/20 p-3"
          >
            <Label htmlFor="course-team">{t("projects.createForm.academicBinding")}</Label>
            <SelectControl
              id="course-team"
              aria-label={t("projects.createForm.academicBinding")}
              value={courseTeam}
              onValueChange={setCourseTeam}
              disabled={academicLoading}
              className="h-9"
              options={academicOptions.map((option) => ({
                value: option.value,
                label: option.value === UNASSIGNED_ACADEMIC_OPTION.value ? t("projects.createForm.unassigned") : option.label,
              }))}
            />
            {academicStatus && (
              <span className="text-xs text-muted-foreground">{academicStatus}</span>
            )}
          </div>
        )}
      </div>
      <div>
        <Button type="button" onClick={createProject} disabled={creating}>
          {creating && <Loader2 className="size-4 animate-spin" />}
          {t("projects.createForm.submit")}
        </Button>
        {status && (
          <div className="mt-3 rounded-md border border-border bg-muted p-3 text-sm">
            {status}
          </div>
        )}
      </div>
    </form>
  );
}
