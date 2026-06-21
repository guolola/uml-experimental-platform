// Renders project creation state and maps selected bindings into createProject input.
import { useEffect, useState } from "react";
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
import {
  platformApi,
  type PlatformProviderConfig,
} from "../services/platform-api";
import { ProjectBackgroundPicker } from "./project-background-picker";

type Navigate = (path: string) => void;

type SegmentOption = {
  value: string;
  label: string;
};

const VISIBILITY_OPTIONS: SegmentOption[] = [
  { value: "private", label: "仅我可见" },
  { value: "team", label: "团队成员可见" },
  { value: "course", label: "课程班级可见" },
];

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
  const [name, setName] = useState("课程 UML 实验项目");
  const [description, setDescription] = useState("");
  const [courseTeam, setCourseTeam] = useState(UNASSIGNED_ACADEMIC_OPTION.value);
  const [academicOptions, setAcademicOptions] = useState<AcademicBindingOption[]>([
    UNASSIGNED_ACADEMIC_OPTION,
  ]);
  const [academicLoading, setAcademicLoading] = useState(true);
  const [academicStatus, setAcademicStatus] = useState("");
  const [providerConfigs, setProviderConfigs] = useState<PlatformProviderConfig[]>([]);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerStatus, setProviderStatus] = useState("");
  const [visibility, setVisibility] = useState("team");
  const [defaultModelPolicy, setDefaultModelPolicy] = useState("");
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
      .catch((error) => {
        if (!active) return;
        setAcademicStatus(error instanceof Error ? error.message : "课程/班级/team 加载失败。");
      })
      .finally(() => {
        if (active) setAcademicLoading(false);
      });
    setProviderLoading(true);
    platformApi
      .listProviderConfigs()
      .then((response) => {
        if (!active) return;
        const activeConfigs = response.providerConfigs.filter(
          (config) => config.status === "active",
        );
        setProviderConfigs(activeConfigs);
        setDefaultModelPolicy(activeConfigs[0]?.id ?? "");
        setProviderStatus(activeConfigs.length > 0 ? "" : "暂无可用托管 Provider。");
      })
      .catch((error) => {
        if (!active) return;
        setProviderStatus(error instanceof Error ? error.message : "托管 Provider 加载失败。");
      })
      .finally(() => {
        if (active) setProviderLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
        defaultProviderConfigId: defaultModelPolicy || null,
        backgroundKey,
      });
      setStatus("项目已保存课程/班级/team 归属和默认模型策略。");
      window.setTimeout(() => onNavigate(`/projects/${response.project.id}`), 900);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `创建失败：${error.message}`
          : "创建失败，请稍后重试。",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <form className="grid gap-5">
      <div className="grid gap-1.5">
        <Label htmlFor="project-name">项目名称</Label>
        <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label>项目背景</Label>
        <ProjectBackgroundPicker
          name={name}
          value={backgroundKey}
          onChange={setBackgroundKey}
          disabled={creating}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="project-description">项目描述</Label>
        <textarea
          id="project-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="描述业务背景和实验目标"
          rows={4}
          className="min-h-24 w-full resize-y rounded-md border border-input bg-input-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
      </div>
      <div className="grid gap-1.5">
        <Label id="project-visibility-label">可见性</Label>
        <SegmentedButtonGroup
          labelId="project-visibility-label"
          value={visibility}
          options={VISIBILITY_OPTIONS}
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
          高级设置
          <ChevronDown
            className={`size-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
          />
        </Button>
        {advancedOpen && (
          <div
            id="project-create-advanced-settings"
            className="grid gap-1.5 rounded-md border border-border/60 bg-muted/20 p-3"
          >
            <Label htmlFor="course-team">课程/班级/team</Label>
            <SelectControl
              id="course-team"
              aria-label="课程/班级/team"
              value={courseTeam}
              onValueChange={setCourseTeam}
              disabled={academicLoading}
              className="h-9"
              options={academicOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            {academicStatus && (
              <span className="text-xs text-muted-foreground">{academicStatus}</span>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="default-model-policy">默认模型策略</Label>
        <SelectControl
          id="default-model-policy"
          aria-label="默认模型策略"
          value={defaultModelPolicy}
          onValueChange={setDefaultModelPolicy}
          disabled={providerLoading || providerConfigs.length === 0}
          className="h-9"
          options={[
            {
              value: "",
              label: providerLoading ? "正在加载托管 Provider" : "暂不设置默认 Provider",
            },
            ...providerConfigs.map((config) => ({
              value: config.id,
              label: config.name,
            })),
          ]}
        />
        {providerStatus && <span className="text-xs text-muted-foreground">{providerStatus}</span>}
      </div>
      <div>
        <Button type="button" onClick={createProject} disabled={creating}>
          {creating && <Loader2 className="size-4 animate-spin" />}
          创建并进入项目
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
