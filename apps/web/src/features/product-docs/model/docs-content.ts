// Defines the product documentation manifest and binds each Markdown file to typed article metadata.
import { TUTORIAL_QUICK_START_VIDEO_URL } from "../../../shared/lib/video-assets";

export type ProductDocCategoryId =
  | "overview"
  | "project"
  | "workspace"
  | "requirements"
  | "models"
  | "design"
  | "delivery"
  | "support";

export type ProductDocCategory = {
  id: ProductDocCategoryId;
  label: string;
  description: string;
};

export type ProductDocArticle = {
  id: string;
  title: string;
  category: ProductDocCategoryId;
  categoryLabel: string;
  summary: string;
  estimatedMinutes: number;
  content: string;
  recommendedPath: boolean;
  tags: readonly string[];
  relatedArtifacts: readonly string[];
  screenshot?: {
    src: string;
    alt: string;
    caption: string;
  };
  video?: {
    src: string;
    title: string;
    description: string;
    caption: string;
  };
};

type ProductDocArticleManifestItem = Omit<
  ProductDocArticle,
  "categoryLabel" | "content"
> & {
  sourcePath: keyof typeof markdownModules;
};

const markdownModules = import.meta.glob<string>("../content/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
});

export const PRODUCT_DOC_CATEGORIES: readonly ProductDocCategory[] = [
  {
    id: "overview",
    label: "总览与映射",
    description: "完整路径、页面入口和全链路产物映射。",
  },
  {
    id: "project",
    label: "项目与账号",
    description: "项目首页、创建项目、成员、设置和账号全局配置。",
  },
  {
    id: "workspace",
    label: "工作台基础",
    description: "顶部栏、侧边栏、标签页、生成任务和运行历史。",
  },
  {
    id: "requirements",
    label: "需求阶段",
    description: "需求输入、规则确认、质量提示、AI 修复和基线。",
  },
  {
    id: "models",
    label: "UML 与模型详情",
    description: "需求模型、图表、元素详情、PlantUML、SVG 和追踪矩阵。",
  },
  {
    id: "design",
    label: "设计与追踪",
    description: "设计模型、用例实现、设计详情和需求到设计映射。",
  },
  {
    id: "delivery",
    label: "交付与复盘",
    description: "测试、说明书、运行历史和证据。",
  },
  {
    id: "support",
    label: "账号与排障",
    description: "模型配置、账号、权限和常见问题。",
  },
];

const ARTICLE_MANIFEST = [
  {
    id: "quick-start",
    title: "快速开始",
    category: "overview",
    summary: "用图书馆预约系统案例走完整流程，从项目入口到说明书证据。",
    estimatedMinutes: 7,
    recommendedPath: true,
    sourcePath: "../content/quick-start.md",
    tags: ["新手", "完整路径", "图书馆预约系统", "入口"],
    relatedArtifacts: ["项目", "需求文本", "需求规则", "UML", "设计模型", "代码原型", "说明书"],
    screenshot: {
      src: "/help/images/docs-quick-start.png",
      alt: "项目内使用文档快速开始截图",
      caption: "快速开始用一个真实项目案例串起全部页面和产物。",
    },
    video: {
      src: TUTORIAL_QUICK_START_VIDEO_URL,
      title: "快速开始项目演示视频",
      description: "带着真实项目操作一遍，从项目入口、需求规则、UML、设计、代码、测试到说明书证据。",
      caption: "项目演示视频",
    },
  },
  {
    id: "feature-map",
    title: "页面入口与全链路映射",
    category: "overview",
    summary: "把顶部导航、项目抽屉、工作台页签和下游产物对应起来。",
    estimatedMinutes: 8,
    recommendedPath: true,
    sourcePath: "../content/feature-map.md",
    tags: ["页面入口", "全链路映射", "产物关系", "导航"],
    relatedArtifacts: ["页面入口", "工作台标签", "产物映射", "运行证据"],
    screenshot: {
      src: "/help/images/docs-feature-map.png",
      alt: "页面入口与全链路映射文档截图",
      caption: "从入口到产物的映射表帮助用户知道每一步在哪里查看。",
    },
  },
  {
    id: "project-basics",
    title: "项目首页与项目创建",
    category: "project",
    summary: "查看项目列表、创建实验项目、进入项目工作台并识别项目状态。",
    estimatedMinutes: 8,
    recommendedPath: true,
    sourcePath: "../content/project-basics.md",
    tags: ["项目首页", "创建项目", "项目卡片", "项目入口"],
    relatedArtifacts: ["项目", "成员权限", "默认模型策略", "运行历史"],
    screenshot: {
      src: "/help/images/docs-project-home.png",
      alt: "项目首页和项目卡片截图",
      caption: "项目首页是进入工作台、创建项目和查看项目状态的入口。",
    },
  },
  {
    id: "account-global-settings",
    title: "账号设置与全局模型配置",
    category: "project",
    summary: "从顶部账号入口进入设置弹窗，管理个人资料、安全和托管 Provider。",
    estimatedMinutes: 7,
    recommendedPath: false,
    sourcePath: "../content/account-global-settings.md",
    tags: ["账号", "全局设置", "模型配置", "托管 Provider", "默认模型"],
    relatedArtifacts: ["账号会话", "MFA", "Provider 配置", "工作台偏好"],
    screenshot: {
      src: "/help/images/docs-account-global-settings.png",
      alt: "账号设置弹窗全局设置截图",
      caption: "模型配置只在账号设置弹窗的全局设置中选择。",
    },
  },
  {
    id: "workspace-shell",
    title: "项目工作台：顶部栏、侧边栏与标签页",
    category: "workspace",
    summary: "理解项目工作台的导航、页签、侧边栏状态和跨阶段入口。",
    estimatedMinutes: 8,
    recommendedPath: true,
    sourcePath: "../content/workspace-shell.md",
    tags: ["工作台", "顶部栏", "侧边栏", "标签页", "链路图"],
    relatedArtifacts: ["工作台页签", "模型树", "生成任务", "链路图"],
    screenshot: {
      src: "/help/images/docs-workspace-shell.png",
      alt: "项目工作台顶部栏侧边栏和标签页截图",
      caption: "工作台通过顶部栏和侧边栏连接需求、图、设计、代码、测试和说明书。",
    },
  },
  {
    id: "project-drawers",
    title: "项目抽屉：设置、成员、任务、历史与文档",
    category: "workspace",
    summary: "使用项目工作台右侧抽屉管理项目资料、成员、生成任务和文档记录。",
    estimatedMinutes: 8,
    recommendedPath: false,
    sourcePath: "../content/project-drawers.md",
    tags: ["项目设置", "成员管理", "生成任务", "运行历史", "文档中心"],
    relatedArtifacts: ["项目设置", "成员", "运行记录", "说明书文件"],
    screenshot: {
      src: "/help/images/docs-project-drawers.png",
      alt: "项目工作台右侧抽屉截图",
      caption: "项目抽屉承载项目设置、成员、生成任务、运行历史和文档中心。",
    },
  },
  {
    id: "generation-tasks-history",
    title: "生成任务、运行历史与证据复盘",
    category: "workspace",
    summary: "查看排队、运行、失败、重试、恢复快照和证据状态。",
    estimatedMinutes: 10,
    recommendedPath: true,
    sourcePath: "../content/generation-tasks-history.md",
    tags: ["生成任务", "运行历史", "重试", "恢复快照", "证据"],
    relatedArtifacts: ["RunSnapshot", "RunEvent", "EvidencePackage"],
    screenshot: {
      src: "/help/images/docs-generation-task.png",
      alt: "生成任务和运行历史抽屉截图",
      caption: "生成任务展示阶段进度，运行历史保留可复盘证据。",
    },
  },
  {
    id: "requirements",
    title: "需求输入、规则确认与 AI 修复",
    category: "requirements",
    summary: "录入需求文本，生成需求规则，处理质量提示并采纳或拒绝 AI 修复。",
    estimatedMinutes: 12,
    recommendedPath: true,
    sourcePath: "../content/requirements.md",
    tags: ["需求输入", "需求规则", "AI 修复", "规则确认", "质量提示"],
    relatedArtifacts: ["需求文本", "需求规则", "质量报告", "修复候选", "需求基线"],
    screenshot: {
      src: "/help/images/docs-requirement-ai-repair.png",
      alt: "需求规则确认和 AI 修复截图",
      caption: "需求规则确认会决定后续 UML、设计、代码和说明书的输入质量。",
    },
  },
  {
    id: "requirement-baseline",
    title: "需求质量、基线与待确认项",
    category: "requirements",
    summary: "理解质量提示、待确认修复、需求基线和下游阻塞原因。",
    estimatedMinutes: 8,
    recommendedPath: false,
    sourcePath: "../content/requirement-baseline.md",
    tags: ["需求质量", "需求基线", "待确认", "阻塞原因", "质量提示"],
    relatedArtifacts: ["RequirementBaseline", "QualityReport", "ReviewCandidate"],
    screenshot: {
      src: "/help/images/docs-requirement-quality-baseline.png",
      alt: "需求质量和基线状态截图",
      caption: "需求基线记录后续阶段使用的是哪一版规则和文本。",
    },
  },
  {
    id: "uml-models",
    title: "需求 UML 模型与图表查看",
    category: "models",
    summary: "认识 7 类需求模型、PlantUML、SVG 图表、模型树和渲染状态。",
    estimatedMinutes: 10,
    recommendedPath: true,
    sourcePath: "../content/uml-models.md",
    tags: ["UML", "PlantUML", "SVG", "功能结构图", "用例模型", "模型树"],
    relatedArtifacts: ["RequirementModel", "PlantUML", "SVG", "diagramErrors"],
    screenshot: {
      src: "/help/images/docs-uml-overview.png",
      alt: "需求 UML 图表查看截图",
      caption: "需求 UML 页面展示结构化模型、图表和渲染状态。",
    },
  },
  {
    id: "uml-model-detail",
    title: "模型详情页、元素列表与追踪矩阵",
    category: "models",
    summary: "进入模型详情页查看元素、关系、图源码、手动重绘和需求追踪矩阵。",
    estimatedMinutes: 10,
    recommendedPath: true,
    sourcePath: "../content/uml-model-detail.md",
    tags: ["模型详情页", "元素列表", "追踪矩阵", "手动重绘", "模型详情"],
    relatedArtifacts: ["模型元素", "关系", "PlantUML 源码", "TraceabilityMatrix"],
    screenshot: {
      src: "/help/images/docs-uml-model-detail.png",
      alt: "模型详情页元素列表和追踪矩阵截图",
      caption: "模型详情页用来定位每个元素来自哪条需求、影响哪些下游产物。",
    },
  },
  {
    id: "design-models",
    title: "设计模型生成与设计详情",
    category: "design",
    summary: "基于需求模型生成 7 类设计模型，查看设计图、元素详情和失败状态。",
    estimatedMinutes: 10,
    recommendedPath: true,
    sourcePath: "../content/design-models.md",
    tags: ["设计模型", "用例实现设计", "设计类图", "界面关系图", "数据库设计"],
    relatedArtifacts: ["DesignModel", "DesignPlantUML", "DesignSVG", "DesignDiagram"],
    screenshot: {
      src: "/help/images/docs-design-overview.png",
      alt: "设计模型首页和设计图截图",
      caption: "设计阶段承接需求模型，输出架构、时序、类图、界面和数据库设计。",
    },
  },
  {
    id: "design-traceability",
    title: "需求到设计的追踪链路",
    category: "design",
    summary: "检查需求元素如何映射到设计模型、设计元素和上游设计引用。",
    estimatedMinutes: 10,
    recommendedPath: true,
    sourcePath: "../content/design-traceability.md",
    tags: ["设计追踪矩阵", "需求到设计映射", "链路图", "低置信关系"],
    relatedArtifacts: ["DesignTraceability", "RequirementTraceability", "LineageGraph"],
    screenshot: {
      src: "/help/images/docs-design-traceability.png",
      alt: "设计追踪矩阵和链路图截图",
      caption: "设计追踪用于证明每条需求是否被设计产物覆盖。",
    },
  },
  {
    id: "code-prototype",
    title: "代码原型生成与预览",
    category: "delivery",
    summary: "根据设计上下文生成 React 原型，查看文件树、预览和质量诊断。",
    estimatedMinutes: 10,
    recommendedPath: true,
    sourcePath: "../content/code-prototype.md",
    tags: ["代码原型", "文件树", "预览", "质量诊断", "业务断言"],
    relatedArtifacts: ["CodeFile", "CodeSpec", "UI Mockup", "Preview", "QualityReport"],
    screenshot: {
      src: "/help/images/docs-code-preview.png",
      alt: "代码文件树和预览截图",
      caption: "代码页展示生成文件、运行预览和质量反馈。",
    },
  },
  {
    id: "testing-coverage",
    title: "测试用例与覆盖关系",
    category: "delivery",
    summary: "从需求和设计生成测试用例，按场景筛选并检查覆盖关系。",
    estimatedMinutes: 8,
    recommendedPath: true,
    sourcePath: "../content/testing-coverage.md",
    tags: ["测试用例", "覆盖关系", "测试场景", "黑盒测试"],
    relatedArtifacts: ["BlackBoxTestCase", "TestCoverageRelation", "RequirementRule"],
    screenshot: {
      src: "/help/images/docs-testing.png",
      alt: "测试用例和覆盖关系截图",
      caption: "测试页把需求、设计和测试场景对应起来。",
    },
  },
  {
    id: "documents-delivery",
    title: "说明书生成、样式、版本与下载",
    category: "delivery",
    summary: "生成需求规格说明书或设计说明书，调整样式，查看版本和下载状态。",
    estimatedMinutes: 9,
    recommendedPath: true,
    sourcePath: "../content/documents-delivery.md",
    tags: ["说明书", "说明书版本", "DOCX", "样式", "版本", "下载", "OnlyOffice"],
    relatedArtifacts: ["RequirementsSpec", "SoftwareDesignSpec", "DocumentVersion"],
    screenshot: {
      src: "/help/images/docs-documents.png",
      alt: "说明书生成和文档版本截图",
      caption: "说明书页负责生成、管理、下载和复用项目文档。",
    },
  },
  {
    id: "account-models-faq",
    title: "账号、模型配置与权限问题",
    category: "support",
    summary: "处理登录、权限、全局模型配置、项目模型策略和生成权益问题。",
    estimatedMinutes: 8,
    recommendedPath: false,
    sourcePath: "../content/account-models-faq.md",
    tags: ["账号", "权限", "模型配置", "全局设置", "MFA"],
    relatedArtifacts: ["UserSession", "ProviderConfig", "ProjectMembership"],
    screenshot: {
      src: "/help/images/docs-account-global-settings.png",
      alt: "账号设置和全局模型配置截图",
      caption: "账号和模型配置问题统一从顶部账号入口排查。",
    },
  },
  {
    id: "troubleshooting",
    title: "生成、渲染与修复排障",
    category: "support",
    summary: "定位生成失败、渲染失败、AI 修复失败、模型不可用和说明书缺图。",
    estimatedMinutes: 10,
    recommendedPath: false,
    sourcePath: "../content/troubleshooting.md",
    tags: ["排障", "生成失败", "渲染失败", "AI 修复失败", "说明书缺图", "模型不可用"],
    relatedArtifacts: ["RunError", "diagramErrors", "RepairRecord", "DocumentMissingArtifact"],
    screenshot: {
      src: "/help/images/docs-troubleshooting.png",
      alt: "生成失败和排障信息截图",
      caption: "排障时先看生成任务，再看运行历史和对应页面的错误提示。",
    },
  },
] satisfies readonly ProductDocArticleManifestItem[];

export const PRODUCT_DOC_ARTICLES: readonly ProductDocArticle[] = ARTICLE_MANIFEST.map(
  (article) => {
    const category = PRODUCT_DOC_CATEGORIES.find((item) => item.id === article.category);
    return {
      ...article,
      categoryLabel: category?.label ?? "使用文档",
      content: markdownModules[article.sourcePath] ?? "",
    };
  },
);
