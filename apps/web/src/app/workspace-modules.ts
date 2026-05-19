// Declares top-level workspace modules, routes, tabs, and artifact ownership.
export type ShellRoutePath = "/" | "/exam" | "/tutorial" | "/about";

export interface WorkspaceModuleDefinition {
  id: string;
  label: string;
  route: ShellRoutePath;
  tabId: string;
  artifactTypes: string[];
  prerequisiteStepIds: string[];
  emptyState: string;
}

export const WORKSPACE_MODULES: WorkspaceModuleDefinition[] = [
  {
    id: "requirements",
    label: "需求",
    route: "/",
    tabId: "requirements",
    artifactTypes: ["requirementText", "requirementRule", "requirementModel"],
    prerequisiteStepIds: [],
    emptyState: "输入需求文本后可生成需求规则和 UML 模型",
  },
  {
    id: "diagrams",
    label: "图",
    route: "/",
    tabId: "diagram",
    artifactTypes: ["plantUml", "svg"],
    prerequisiteStepIds: ["requirements"],
    emptyState: "先生成需求模型后查看 UML 图",
  },
  {
    id: "design",
    label: "设计",
    route: "/",
    tabId: "design",
    artifactTypes: ["designModel", "designPlantUml", "designSvg"],
    prerequisiteStepIds: ["diagrams"],
    emptyState: "先生成需求模型后进入设计阶段",
  },
  {
    id: "code",
    label: "代码",
    route: "/",
    tabId: "workspace:code",
    artifactTypes: ["codeFile", "codeSpec", "uiMockup"],
    prerequisiteStepIds: ["design"],
    emptyState: "先生成设计模型后生成前端原型",
  },
  {
    id: "documents",
    label: "文档",
    route: "/",
    tabId: "documents",
    artifactTypes: ["requirementsSpec", "softwareDesignSpec"],
    prerequisiteStepIds: ["requirements"],
    emptyState: "生成模型后可导出规格说明书",
  },
];

export const SHELL_ROUTE_MODULES = [
  {
    label: "首页",
    route: "/" as const,
    description: "进入 UML 实验平台工作区。",
  },
  {
    label: "考试",
    route: "/exam" as const,
    description: "考试模块正在建设中，后续会承载课程测评、题目生成和评分流程。",
  },
  {
    label: "教程",
    route: "/tutorial" as const,
    description: "教程模块正在建设中，后续会沉淀平台使用指南和 UML 建模方法。",
  },
  {
    label: "关于",
    route: "/about" as const,
    description: "关于页面正在建设中，后续会展示平台定位、版本信息和项目说明。",
  },
];

export function findShellRouteModule(route: ShellRoutePath) {
  return SHELL_ROUTE_MODULES.find((module) => module.route === route) ?? SHELL_ROUTE_MODULES[0];
}

export function assertUniqueWorkspaceModules(modules = WORKSPACE_MODULES) {
  const ids = new Set<string>();
  const routes = new Set<string>();

  for (const module of modules) {
    if (ids.has(module.id)) {
      throw new Error(`Duplicate workspace module id: ${module.id}`);
    }
    ids.add(module.id);

    const routeKey = `${module.route}:${module.tabId}`;
    if (routes.has(routeKey)) {
      throw new Error(`Duplicate workspace module route/tab: ${routeKey}`);
    }
    routes.add(routeKey);
  }
}
