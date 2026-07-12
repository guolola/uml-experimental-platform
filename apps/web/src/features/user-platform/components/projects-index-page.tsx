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
import { useTranslation } from "react-i18next";
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
import { i18n as appI18n } from "../../../shared/i18n";
import {
  PROJECT_SCOPE_OPTIONS,
  projectFromApi,
  type StaticProject,
} from "../lib/project-presentation";
import {
  PlatformApiError,
  platformApi,
  type PlatformProject,
} from "../services/platform-api";
import { useAuthenticatedRouteSession } from "./authenticated-route-session";
import { ProjectCreateForm } from "./project-create-form";

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
  const { t: translate, i18n: activeI18n } = useTranslation();
  const hasProviderResources =
    typeof activeI18n.exists === "function" && activeI18n.exists("projects.openProject");
  const t = hasProviderResources ? translate : appI18n.t.bind(appI18n);
  const language = hasProviderResources
    ? activeI18n.resolvedLanguage || activeI18n.language
    : appI18n.resolvedLanguage || appI18n.language;
  const locale = language === "en" ? "en" : "zh-CN";
  const [projectRecords, setProjectRecords] = useState<PlatformProject[]>([]);
  const [loading, setLoading] = useState(true);
  const authSession = useAuthenticatedRouteSession();
  const [statusKind, setStatusKind] = useState<"empty" | "loaded" | "authRequired" | "forbidden" | "loadFailed" | null>(null);
  const [statusErrorMessage, setStatusErrorMessage] = useState("");
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
        setProjectRecords(response.projects);
        setStatusKind(response.projects.length === 0 ? "empty" : "loaded");
        setStatusErrorMessage("");
      })
      .catch((error) => {
        if (!active) return;
        const statusCode = error instanceof PlatformApiError ? error.status : 0;
        setProjectRecords([]);
        setAuthRequired(statusCode === 401);
        setForbidden(statusCode === 403);
        setListError(statusCode !== 401 && statusCode !== 403);
        if (statusCode === 401) {
          setStatusKind("authRequired");
          setStatusErrorMessage("");
        } else if (statusCode === 403) {
          setStatusKind("forbidden");
          setStatusErrorMessage("");
        } else {
          setStatusKind("loadFailed");
          setStatusErrorMessage(error instanceof Error ? error.message : "");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authSession?.user]);

  const projects = useMemo(
    () =>
      projectRecords.map((project) =>
        projectFromApi(project, authSession?.user ?? null, locale),
      ),
    [authSession?.user, locale, projectRecords],
  );

  const status = useMemo(() => {
    if (statusKind === "empty") return t("projects.status.empty");
    if (statusKind === "loaded") return t("projects.status.loaded");
    if (statusKind === "authRequired") return t("projects.status.authRequired");
    if (statusKind === "forbidden") return t("projects.status.forbidden");
    if (statusKind === "loadFailed") {
      return statusErrorMessage
        ? t("projects.status.loadFailedWithMessage", { message: statusErrorMessage })
        : t("projects.status.loadFailed");
    }
    return "";
  }, [statusErrorMessage, statusKind, t]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects
      .filter((project) => {
        if (query && !project.searchableText.includes(query)) return false;
        if (scope === "archived") return project.status === "archived";
        if (scope === "team") return project.visibilityKind === "team";
        if (scope === "mine") return project.isOwnedByCurrentUser || project.memberCount <= 1;
        return true;
      })
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name, locale);
        if (sort === "generated") {
          return (right.lastGeneratedAt || "").localeCompare(left.lastGeneratedAt || "");
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [locale, projects, scope, search, sort]);

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
              {t("projects.indexTitle")}
            </h1>
            <p className="text-base leading-6 text-muted-foreground">
              {t("projects.indexDescription")}
            </p>
          </div>
          <Button
            type="button"
            className="h-12 shrink-0 rounded-lg px-6 text-base shadow-sm"
            onClick={openCreateProject}
          >
            <Plus className="size-4" />
            {authRequired || listError ? t("projects.newProjectAfterLogin") : t("projects.newProject")}
          </Button>
        </ScaledToolbar>

        {(authRequired || forbidden || listError) && (
          <ProjectsIndexSectionCard className="grid gap-4 rounded-xl md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <h2 className="text-base">
                {authRequired
                  ? t("projects.access.loginTitle")
                  : forbidden
                    ? t("projects.access.forbiddenTitle")
                    : t("projects.access.unavailableTitle")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {authRequired
                  ? t("projects.access.loginDescription")
                  : forbidden
                    ? t("projects.access.forbiddenDescription")
                    : status || t("projects.access.unavailableDescription")}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => onNavigate("/login")}>
              {authRequired ? t("projects.access.loginAction") : t("projects.access.goLoginAction")}
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
                aria-label={t("projects.scopeAria")}
              >
                {PROJECT_SCOPE_OPTIONS.map((option) => {
                  const selected = scope === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={t(option.labelKey)}
                      aria-pressed={selected}
                      className={
                        selected
                          ? "h-8 shrink-0 rounded-md bg-accent px-2 text-[12px] font-medium leading-4 text-accent-foreground md:h-auto md:rounded-lg md:px-4 md:py-2 md:text-base md:leading-6"
                          : "h-8 shrink-0 rounded-md px-2 text-[12px] font-medium leading-4 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:h-auto md:rounded-lg md:px-4 md:py-2 md:text-base md:leading-6"
                      }
                      onClick={() => setScope(option.value)}
                    >
                      <span className="md:hidden">{t(option.shortLabelKey)}</span>
                      <span className="hidden md:inline">{t(option.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:shrink-0 md:gap-4">
                <div className="relative min-w-[108px] flex-1 md:w-96 md:flex-none">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground md:left-3 md:size-4" />
                  <Input
                    className="h-8 rounded-lg border-input bg-input-background pl-8 text-[12px] md:h-[38px] md:pl-10 md:text-sm"
                    placeholder={t("projects.searchPlaceholder")}
                    aria-label={t("projects.searchAria")}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <SelectControl
                  aria-label={t("projects.sortAria")}
                  value={sort}
                  onValueChange={setSort}
                  className="h-8 w-[82px] shrink-0 rounded-lg border border-input bg-input-background px-2 text-[12px] text-foreground md:h-[38px] md:w-28 md:px-3 md:text-sm"
                  options={[
                    { value: "recent", label: t("projects.sort.recent") },
                    { value: "generated", label: t("projects.sort.generated") },
                    { value: "name", label: t("projects.sort.name") },
                  ]}
                />
              </div>
            </div>
          </section>
        )}

        {!authRequired && !forbidden && !listError && projects.length > 0 && visibleProjects.length === 0 && (
          <section className="rounded-xl border border-dashed border-border/60 bg-card p-10 text-center">
            <h2 className="text-xl font-semibold">{t("projects.noMatchesTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("projects.noMatchesDescription")}
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
                      <span className="min-w-0 truncate">
                        {t("projects.ownerPrefix", { owner: project.owner })}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                      {project.status === "archived" ? (
                        <Archive className="size-3.5 shrink-0" />
                      ) : project.visibilityKind === "private" ? (
                        <Lock className="size-3.5 shrink-0" />
                      ) : (
                        <Users className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">{project.visibility}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                      <Clock3 className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">
                        {t("projects.updatedPrefix", { date: project.updatedAtDisplay })}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="relative z-10 mt-auto flex items-center justify-between gap-2 bg-background/72 px-3 py-2 backdrop-blur-[2px] md:gap-3 md:px-6 md:py-4">
                  <div className="flex items-start">
                    {project.status === "archived" ? (
                      <span className="line-clamp-2 font-mono text-[10px] font-medium leading-4 text-muted-foreground md:text-xs">
                        {t("projects.lastUpdatedPrefix", { date: project.updatedAtDisplay })}
                      </span>
                    ) : (
                      <>
                        {project.members.map((member) => (
                          <span
                            key={`${project.id}:${member.id}`}
                            aria-label={t("projects.memberAvatar", { name: member.label })}
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
                            aria-label={t("projects.otherMembers", {
                              count: project.memberCount - project.members.length,
                            })}
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
                    {t("projects.openProject")}
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
              {t("projects.emptyTitle")}
            </h2>
            <p className="mt-3 max-w-md text-base leading-6 text-muted-foreground">
              {t("projects.emptyDescription")}
            </p>
            <Button
              type="button"
              className="mt-8 h-12 rounded-lg px-6 text-base shadow-sm"
              onClick={openCreateProject}
            >
              <Plus className="size-4" />
              {t("projects.createFirstProject")}
            </Button>
          </section>
        )}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("projects.createProject")}</DialogTitle>
              <DialogDescription>
                {t("projects.createProjectDescription")}
              </DialogDescription>
            </DialogHeader>
            <ProjectCreateForm onNavigate={onNavigate} />
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
