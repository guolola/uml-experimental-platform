// Owns the authenticated projects index, filters, and create-project dialog composition.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
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
import {
  PlatformLoadingScreen,
  useLoadingTransition,
  usePlatformRouteLoading,
} from "./platform-loading-screen";

type Navigate = (path: string) => void;

const STABLE_PLATFORM_SCROLL_CLASS =
  "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-scroll bg-background [scrollbar-gutter:stable]";

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
  const coordinatedLoading = usePlatformRouteLoading(
    "正在同步项目空间状态...",
    loading,
  );
  const loadingTransition = useLoadingTransition(loading);
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
    if (coordinatedLoading) {
      return (
        <main
          data-testid="projects-index-shell"
          className={STABLE_PLATFORM_SCROLL_CLASS}
        />
      );
    }
    return (
      <main
        data-testid="projects-index-shell"
        className={cn(STABLE_PLATFORM_SCROLL_CLASS, "px-6 py-6 md:px-10 xl:px-12")}
      >
        <PlatformLoadingScreen
          message="正在同步项目空间状态..."
          variant="content"
          phase={loadingTransition.phase === "hidden" ? "loading" : loadingTransition.phase}
          progress={loadingTransition.progress}
        />
      </main>
    );
  }

  return (
    <main
      data-testid="projects-index-shell"
      className={cn("relative", STABLE_PLATFORM_SCROLL_CLASS)}
    >
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-10 px-6 py-16 md:px-10 xl:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-2">
            <h1 className="text-[32px] font-semibold leading-10 tracking-normal text-foreground">
              项目首页
            </h1>
            <p className="text-base leading-6 text-muted-foreground">
              项目会绑定成员权限、运行历史、文档和模型配置。
            </p>
          </div>
          <Button
            type="button"
            className="h-12 rounded-lg px-6 text-base shadow-sm"
            onClick={openCreateProject}
          >
            <Plus className="size-4" />
            {authRequired || listError ? "登录后新建项目" : "新建项目"}
          </Button>
        </div>

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
          <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-[17px] shadow-sm md:flex-row md:items-center md:justify-between">
            <div
              className="flex gap-2 overflow-x-auto"
              role="group"
              aria-label="项目范围"
            >
              {PROJECT_SCOPE_OPTIONS.map((option) => {
                const selected = scope === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    className={
                      selected
                        ? "shrink-0 rounded-lg bg-accent px-4 py-2 text-base leading-6 text-accent-foreground"
                        : "shrink-0 rounded-lg px-4 py-2 text-base leading-6 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    }
                    onClick={() => setScope(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative w-full md:w-80 lg:w-96">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-[38px] rounded-lg border-input bg-input-background pl-10 text-sm"
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
                className="h-[38px] w-full rounded-lg border border-input bg-input-background px-3 text-sm text-foreground md:w-28"
                options={[
                  { value: "recent", label: "最近打开" },
                  { value: "generated", label: "最近生成" },
                  { value: "name", label: "项目名称" },
                ]}
              />
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
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visibleProjects.map((project) => (
              <article
                key={project.id}
                className={
                  project.status === "archived"
                    ? "group relative flex min-h-[271px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card opacity-75 shadow-sm"
                    : "group relative flex min-h-[287px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
                }
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-info opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex flex-1 flex-col gap-4 border-b border-border/60 px-6 pb-10 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 truncate text-xl font-semibold leading-7 text-foreground">
                      {project.name}
                    </h2>
                    <Badge
                      variant={project.status === "archived" ? "outline" : "secondary"}
                      className={
                        project.status === "archived"
                          ? "rounded bg-secondary px-2 py-1 text-xs text-muted-foreground"
                          : "rounded bg-accent px-2 py-1 text-xs text-accent-foreground"
                      }
                    >
                      {project.statusLabel}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 min-h-10 min-w-0 max-w-full overflow-hidden text-sm leading-5 text-muted-foreground">
                    {project.description}
                  </p>
                  <div className="grid gap-2 pt-2 text-sm leading-5 text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-2">
                      <UserRound className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">负责人：{project.owner}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      {project.status === "archived" ? (
                        <Archive className="size-3.5 shrink-0" />
                      ) : project.visibility === "仅成员可见" ? (
                        <Lock className="size-3.5 shrink-0" />
                      ) : (
                        <Users className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">{project.visibility}</span>
                    </span>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 bg-muted/50 px-6 py-4 dark:bg-secondary/40">
                  <div className="flex items-start">
                    {project.status === "archived" ? (
                      <span className="font-mono text-xs font-medium leading-4 text-muted-foreground">
                        最后更新: {project.updatedAt}
                      </span>
                    ) : (
                      <>
                        {project.members.map((member) => (
                          <span
                            key={`${project.id}:${member.id}`}
                            aria-label={`成员头像 ${member.label}`}
                            title={member.label}
                            className="mr-[-8px] inline-flex size-8 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-accent text-xs font-semibold text-primary"
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
                            className="mr-[-8px] inline-flex size-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-xs font-semibold text-muted-foreground"
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
                    className="h-6 px-0 text-base text-primary hover:bg-transparent hover:text-primary/80"
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
          <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>创建项目</DialogTitle>
              <DialogDescription>
                项目名称、描述、可见性、课程/班级/team 和默认模型策略会提交到项目 API。
              </DialogDescription>
            </DialogHeader>
            <ProjectCreateForm onNavigate={onNavigate} />
          </DialogContent>
        </Dialog>
      </div>
      {!coordinatedLoading && loadingTransition.visible && loadingTransition.phase !== "hidden" && (
        <PlatformLoadingScreen
          message="正在同步项目空间状态..."
          variant="content"
          phase={loadingTransition.phase}
          progress={loadingTransition.progress}
          className="absolute inset-6 z-20 md:inset-10 xl:inset-12"
        />
      )}
    </main>
  );
}
