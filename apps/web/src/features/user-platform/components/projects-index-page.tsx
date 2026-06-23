// Owns the authenticated projects index, filters, and create-project dialog composition.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  Clock3,
  FileText,
  Lock,
  Plus,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { SelectControl } from "../../../shared/ui/select";
import { ScaledToolbar } from "../../../shared/ui/scale-to-fit";
import { cn } from "../../../shared/ui/utils";
import {
  PROJECT_SCOPE_OPTIONS,
  projectFromApi,
  type StaticProject,
} from "../lib/project-presentation";
import {
  PlatformApiError,
  platformApi,
} from "../services/platform-api";
import { useAuthenticatedRouteSession } from "./authenticated-route-session";
import { ProjectCreateForm } from "./project-create-form";

type Navigate = (path: string) => void;

const STABLE_PLATFORM_SCROLL_CLASS =
  "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-scroll bg-background [scrollbar-gutter:stable]";

const PROJECT_SCOPE_SHORT_LABELS: Record<(typeof PROJECT_SCOPE_OPTIONS)[number]["value"], string> = {
  all: "全部",
  mine: "我的",
  team: "团队",
  archived: "归档",
};

function ProjectsIndexSectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-border bg-card p-5 ${className}`}>
      {children}
    </section>
  );
}

export function ProjectsIndexPage({ onNavigate }: { onNavigate: Navigate }) {
  const [projects, setProjects] = useState<StaticProject[]>([]);
  const [loading, setLoading] = useState(true);
  const authSession = useAuthenticatedRouteSession();
  const [status, setStatus] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [listError, setListError] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [sort, setSort] = useState("recent");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const createDialogLocationRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAuthRequired(false);
    setForbidden(false);
    setListError(false);
    platformApi
      .listProjects()
      .then((response) => {
        if (!active) return;
        setListError(false);
        setProjects(
          response.projects.map((project) =>
            projectFromApi(project, authSession?.user ?? null),
          ),
        );
        setStatus(
          response.projects.length === 0
            ? "当前账号还没有项目，可以创建第一个实名项目。"
            : "已加载当前账号的项目。",
        );
      })
      .catch((error) => {
        if (!active) return;
        const statusCode = error instanceof PlatformApiError ? error.status : 0;
        setProjects([]);
        setAuthRequired(statusCode === 401);
        setForbidden(statusCode === 403);
        setListError(statusCode !== 401 && statusCode !== 403);
        if (statusCode === 401) {
          setStatus("实名项目列表需要通过登录会话加载。");
        } else if (statusCode === 403) {
          setStatus("当前账号没有项目列表访问权限。");
        } else {
          setStatus(
            error instanceof Error
              ? `项目加载失败：${error.message}`
              : "项目加载失败，请稍后重试。",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authSession?.user]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects
      .filter((project) => {
        if (query && !project.searchableText.includes(query)) return false;
        if (scope === "archived") return project.status === "archived";
        if (scope === "team") return project.visibility === "团队成员可见";
        if (scope === "mine") return project.isOwnedByCurrentUser || project.memberCount <= 1;
        return true;
      })
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name, "zh-CN");
        if (sort === "generated") {
          return (right.lastGeneratedAt || "").localeCompare(left.lastGeneratedAt || "");
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [projects, scope, search, sort]);

  const openCreateProject = () => {
    if (authRequired || listError) {
      onNavigate("/login");
      return;
    }
    setCreateDialogOpen(true);
  };

  useEffect(() => {
    createDialogLocationRef.current = createDialogOpen
      ? `${window.location.pathname}${window.location.search}`
      : null;
  }, [createDialogOpen]);

  useEffect(() => {
    const closeIfLocationChanged = () => {
      const openedAt = createDialogLocationRef.current;
      if (!openedAt) return;
      const currentLocation = `${window.location.pathname}${window.location.search}`;
      if (currentLocation !== openedAt) {
        setCreateDialogOpen(false);
      }
    };
    const closeForRouteChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail.path !== "string") return;
      closeIfLocationChanged();
    };
    window.addEventListener("uml-route-change", closeForRouteChange);
    window.addEventListener("popstate", closeIfLocationChanged);
    return () => {
      window.removeEventListener("uml-route-change", closeForRouteChange);
      window.removeEventListener("popstate", closeIfLocationChanged);
    };
  }, []);

  if (loading) {
    return (
      <main
        data-testid="projects-index-shell"
        className={cn("relative", STABLE_PLATFORM_SCROLL_CLASS)}
        aria-busy="true"
      />
    );
  }

  return (
    <main
      data-testid="projects-index-shell"
      className={cn("relative", STABLE_PLATFORM_SCROLL_CLASS)}
    >
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-10 px-6 py-16 md:px-10 xl:px-12">
        <ScaledToolbar minWidth={720} contentClassName="w-full items-center justify-between gap-8">
          <div className="grid min-w-0 gap-2">
            <h1 className="text-[32px] font-semibold leading-10 tracking-normal text-foreground">
              项目首页
            </h1>
            <p className="text-base leading-6 text-muted-foreground">
              项目会绑定成员权限、运行历史、文档和模型配置。
            </p>
          </div>
          <Button
            type="button"
            className="h-12 shrink-0 rounded-lg px-6 text-base shadow-sm"
            onClick={openCreateProject}
          >
            <Plus className="size-4" />
            {authRequired || listError ? "登录后新建项目" : "新建项目"}
          </Button>
        </ScaledToolbar>

        {(authRequired || forbidden || listError) && (
          <ProjectsIndexSectionCard className="grid gap-4 rounded-xl md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <h2 className="text-base">
                {authRequired ? "请先登录" : forbidden ? "权限不足" : "项目服务不可用"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {authRequired
                  ? "登录后才能进入项目、工作台、运行历史和文档中心。"
                  : forbidden
                    ? "当前账号没有项目列表访问权限。"
                    : status || "当前无法加载实名项目，请确认 API 服务可用后再继续。"}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => onNavigate("/login")}>
              {authRequired ? "去登录" : "前往登录"}
            </Button>
          </ProjectsIndexSectionCard>
        )}

        {!authRequired && !forbidden && !listError && (
          <section
            data-testid="projects-filter-panel"
            className="rounded-xl border border-border/60 bg-card p-3 shadow-sm md:p-[17px]"
          >
            <div className="flex min-w-0 items-center justify-between gap-2 md:gap-8">
              <div
                className="grid shrink-0 grid-cols-4 gap-1.5 md:flex md:gap-2"
                role="group"
                aria-label="项目范围"
              >
                {PROJECT_SCOPE_OPTIONS.map((option) => {
                  const selected = scope === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={option.label}
                      aria-pressed={selected}
                      className={
                        selected
                          ? "h-8 shrink-0 rounded-md bg-accent px-2 text-[12px] font-medium leading-4 text-accent-foreground md:h-auto md:rounded-lg md:px-4 md:py-2 md:text-base md:leading-6"
                          : "h-8 shrink-0 rounded-md px-2 text-[12px] font-medium leading-4 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:h-auto md:rounded-lg md:px-4 md:py-2 md:text-base md:leading-6"
                      }
                      onClick={() => setScope(option.value)}
                    >
                      <span className="md:hidden">{PROJECT_SCOPE_SHORT_LABELS[option.value]}</span>
                      <span className="hidden md:inline">{option.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:shrink-0 md:gap-4">
                <div className="relative min-w-[108px] flex-1 md:w-96 md:flex-none">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground md:left-3 md:size-4" />
                  <Input
                    className="h-8 rounded-lg border-input bg-input-background pl-8 text-[12px] md:h-[38px] md:pl-10 md:text-sm"
                    placeholder="搜索项目、成员..."
                    aria-label="搜索项目"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <SelectControl
                  aria-label="排序方式"
                  value={sort}
                  onValueChange={setSort}
                  className="h-8 w-[82px] shrink-0 rounded-lg border border-input bg-input-background px-2 text-[12px] text-foreground md:h-[38px] md:w-28 md:px-3 md:text-sm"
                  options={[
                    { value: "recent", label: "最近打开" },
                    { value: "generated", label: "最近生成" },
                    { value: "name", label: "项目名称" },
                  ]}
                />
              </div>
            </div>
          </section>
        )}

        {!authRequired && !forbidden && !listError && projects.length > 0 && visibleProjects.length === 0 && (
          <section className="rounded-xl border border-dashed border-border/60 bg-card p-10 text-center">
            <h2 className="text-xl font-semibold">没有匹配的项目</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              当前搜索、筛选或排序条件没有命中真实项目状态数据。
            </p>
          </section>
        )}

        {!authRequired && !forbidden && !listError && projects.length > 0 && visibleProjects.length > 0 && (
          <div
            data-testid="projects-card-grid"
            data-mobile-card-density="two-column"
            className="grid grid-cols-2 gap-3 md:gap-5 xl:grid-cols-3 xl:gap-6"
          >
            {visibleProjects.map((project) => (
              <article
                key={project.id}
                data-background-key={project.background.key}
                className={
                  project.status === "archived"
                    ? "group relative flex min-h-[174px] min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card opacity-75 shadow-sm md:min-h-[271px] md:rounded-xl"
                    : "group relative flex min-h-[182px] min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card shadow-sm md:min-h-[287px] md:rounded-xl"
                }
              >
                <img
                  src={project.background.imageUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/82 to-background/38" />
                <div className="absolute inset-x-0 top-0 z-10 h-1 bg-gradient-to-r from-primary to-info opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative z-10 flex flex-1 flex-col gap-2 border-b border-border/40 px-3 pb-3 pt-3 md:gap-4 md:px-6 md:pb-10 md:pt-6">
                  <div className="flex min-w-0 items-start justify-between gap-2 md:gap-3">
                    <h2 className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-5 text-foreground md:text-xl md:leading-7">
                      {project.name}
                    </h2>
                    <Badge
                      variant={project.status === "archived" ? "outline" : "secondary"}
                      className={
                        project.status === "archived"
                          ? "shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground md:px-2 md:py-1 md:text-xs"
                          : "shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] leading-4 text-accent-foreground md:px-2 md:py-1 md:text-xs"
                      }
                    >
                      {project.statusLabel}
                    </Badge>
                  </div>
                  <p className="line-clamp-1 min-h-5 min-w-0 max-w-full overflow-hidden text-[12px] leading-5 text-muted-foreground md:line-clamp-2 md:min-h-10 md:text-sm md:leading-5">
                    {project.description}
                  </p>
                  <div className="grid gap-1 pt-0.5 text-[12px] leading-4 text-muted-foreground md:gap-2 md:pt-2 md:text-sm md:leading-5">
                    <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                      <UserRound className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">负责人：{project.owner}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                      {project.status === "archived" ? (
                        <Archive className="size-3.5 shrink-0" />
                      ) : project.visibility === "仅成员可见" ? (
                        <Lock className="size-3.5 shrink-0" />
                      ) : (
                        <Users className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">{project.visibility}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                      <Clock3 className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">
                        最近更新：{project.updatedAtDisplay}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="relative z-10 mt-auto flex items-center justify-between gap-2 bg-background/72 px-3 py-2 backdrop-blur-[2px] md:gap-3 md:px-6 md:py-4">
                  <div className="flex items-start">
                    {project.status === "archived" ? (
                      <span className="line-clamp-2 font-mono text-[10px] font-medium leading-4 text-muted-foreground md:text-xs">
                        最后更新: {project.updatedAtDisplay}
                      </span>
                    ) : (
                      <>
                        {project.members.map((member) => (
                          <span
                            key={`${project.id}:${member.id}`}
                            aria-label={`成员头像 ${member.label}`}
                            title={member.label}
                            className="mr-[-8px] inline-flex size-7 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-accent text-[11px] font-semibold text-primary md:size-8 md:text-xs"
                          >
                            {member.avatarUrl ? (
                              <img
                                src={member.avatarUrl}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              member.initial
                            )}
                          </span>
                        ))}
                        {project.memberCount > project.members.length && (
                          <span
                            aria-label={`其余 ${project.memberCount - project.members.length} 名成员`}
                            className="mr-[-8px] inline-flex size-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[11px] font-semibold text-muted-foreground md:size-8 md:text-xs"
                          >
                            +{project.memberCount - project.members.length}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 shrink-0 px-0 text-sm leading-5 text-primary hover:bg-transparent hover:text-primary/80 md:text-base"
                    onClick={() => onNavigate(`/projects/${project.id}`)}
                  >
                    进入项目
                    <span className="sr-only"> {project.name}</span>
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!authRequired && !forbidden && !listError && projects.length === 0 && (
          <section className="mx-auto flex w-full max-w-[672px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card px-8 py-12 text-center md:px-[49px]">
            <div className="mb-6 inline-flex size-16 items-center justify-center rounded-2xl bg-accent text-primary">
              <FileText className="size-6" />
            </div>
            <h2 className="text-xl font-semibold leading-7 text-foreground">
              还没有项目
            </h2>
            <p className="mt-3 max-w-md text-base leading-6 text-muted-foreground">
              创建项目后才能进入实验工作台。您可以新建一个独立项目或加入团队协作。
            </p>
            <Button
              type="button"
              className="mt-8 h-12 rounded-lg px-6 text-base shadow-sm"
              onClick={openCreateProject}
            >
              <Plus className="size-4" />
              创建第一个项目
            </Button>
          </section>
        )}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>创建项目</DialogTitle>
              <DialogDescription>
                项目名称、描述、可见性和课程归属会提交到项目 API。
              </DialogDescription>
            </DialogHeader>
            <ProjectCreateForm onNavigate={onNavigate} />
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
