// Renders project creation state and maps selected bindings into createProject input.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

type Navigate = (path: string) => void;

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
  const [template, setTemplate] = useState("uml");
  const [visibility, setVisibility] = useState("team");
  const [defaultModelPolicy, setDefaultModelPolicy] = useState("");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    setAcademicLoading(true);
    platformApi
      .listAcademicOptions()
      .then((response) => {
        if (!active) return;
        const options = buildAcademicBindingOptions(response);
        const defaultAcademic =
          options.find((option) => option.value !== UNASSIGNED_ACADEMIC_OPTION.value) ??
          options[0];
        setAcademicOptions(options);
        setCourseTeam(defaultAcademic?.value ?? UNASSIGNED_ACADEMIC_OPTION.value);
        // setAcademicStatus(options.length > 1 ? "" : "暂无可绑定课程/班级/team。");
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
    <form className="grid gap-5 lg:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="project-name">项目名称</Label>
        <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-1.5">
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
        {academicStatus && <span className="text-xs text-muted-foreground">{academicStatus}</span>}
      </div>
      <div className="grid gap-1.5 lg:col-span-2">
        <Label htmlFor="project-description">项目描述</Label>
        <Input
          id="project-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="描述业务背景和实验目标"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="project-template">项目模板</Label>
        <SelectControl
          id="project-template"
          aria-label="项目模板"
          value={template}
          onValueChange={setTemplate}
          className="h-9"
          options={[
            { value: "uml", label: "UML 全流程" },
            { value: "requirements", label: "需求建模" },
            { value: "documents", label: "说明书交付" },
          ]}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="project-visibility">可见性</Label>
        <SelectControl
          id="project-visibility"
          value={visibility}
          onValueChange={setVisibility}
          className="h-9"
          options={[
            { value: "private", label: "仅我可见" },
            { value: "team", label: "团队成员可见" },
            { value: "course", label: "课程班级可见" },
          ]}
        />
      </div>
      <div className="grid gap-1.5 lg:col-span-2">
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
      <div className="lg:col-span-2">
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
