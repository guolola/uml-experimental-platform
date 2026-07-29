// Centralizes the Figma-derived website copy and route metadata for marketing pages.
import {
  Binary,
  Bot,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Database,
  FileText,
  GitBranch,
  KeyRound,
  Layers3,
  LockKeyhole,
  Mail,
  Network,
  PackageCheck,
  Route,
  SearchCheck,
  ShieldCheck,
  UploadCloud,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { AppLocale } from "../../../shared/i18n";
import type { MarketingRoutePath } from "../../../shared/lib/app-route-types";

export type MarketingNavItem = {
  label: string;
  path: MarketingRoutePath;
};

export type MarketingFeature = {
  title: string;
  shortTitle: string;
  description: string;
  icon: LucideIcon;
};

export type ReferenceStandard = {
  name: string;
  shortName: string;
  topic: string;
  description: string;
  href: string;
};

export type TrustedChainHighlight = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export type WorkflowStep = {
  title: string;
  description: string;
  tags?: string[];
  icon: LucideIcon;
};

export type CaseStudy = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  scenario: string;
  actors: string[];
  workflow: string[];
  outputs: string[];
  feasibilitySummary: string;
  sampleRequirement: string;
};

export type PricingPlan = {
  name: string;
  description: string;
  price: string;
  cadence?: string;
  features: string[];
  action: string;
  highlighted?: boolean;
};

type MarketingContent = {
  marketingNavItems: MarketingNavItem[];
  heroTrustPoints: Array<{ label: string; icon: LucideIcon }>;
  productPreviewCards: Array<{ title: string; icon: LucideIcon }>;
  referenceStandards: ReferenceStandard[];
  trustedChainHighlights: TrustedChainHighlight[];
  features: MarketingFeature[];
  workflowSteps: WorkflowStep[];
  caseStudies: CaseStudy[];
  pricingPlans: PricingPlan[];
  authSecurityHighlights: Array<{ title: string; description: string; icon: LucideIcon }>;
  footerLinks: string[];
  securityHighlights: Array<{ title: string; icon: LucideIcon }>;
};

const marketingNavItemsZh: MarketingNavItem[] = [
  { label: "功能特性", path: "/features" },
  { label: "使用流程", path: "/workflow" },
  { label: "案例展示", path: "/cases" },
];

const heroTrustPointsZh = [
  { label: "UML 建模", icon: Network },
  { label: "设计推导", icon: GitBranch },
  { label: "React 原型", icon: Code2 },
  { label: "说明书导出", icon: FileText },
  { label: "追踪审查", icon: Route },
];

const productPreviewCardsZh = [
  { title: "需求报告", icon: FileText },
  { title: "UML 预览", icon: Network },
];

const referenceStandardsZh: ReferenceStandard[] = [
  {
    name: "ISO/IEC/IEEE 29148:2018",
    shortName: "ISO/IEC",
    topic: "29148 Requirements",
    description: "作为需求工程生命周期、需求文档、管理、验证与确认活动的参考锚点。",
    href: "https://www.iso.org/standard/72089.html",
  },
  {
    name: "IEEE 29148 listing",
    shortName: "IEEE",
    topic: "29148 Listing",
    description: "用于确认 29148 标准范围与系统、软件工程需求工程主题的一致性。",
    href: "https://standards.ieee.org/standard/29148-2018.html",
  },
  {
    name: "INCOSE Requirements Working Group",
    shortName: "INCOSE",
    topic: "Systems Engineering",
    description: "参考需求定义、需求管理、验证与确认贯穿生命周期的工程实践。",
    href: "https://www.incose.org/communities/working-groups-initiatives/requirements",
  },
  {
    name: "CMMI/SEI requirements traceability",
    shortName: "CMMI",
    topic: "Traceability Practice",
    description: "参考需求与下游工程成果之间保持双向追踪的过程改进实践。",
    href: "https://resources.sei.cmu.edu/asset_files/TechnicalReport/2011_005_001_15392.pdf",
  },
];

const trustedChainHighlightsZh: TrustedChainHighlight[] = [
  {
    title: "结构化需求基线",
    description:
      "把原始需求拆分为带来源片段、类型、置信度和质量报告的 RequirementBaseline，作为后续生成的共同依据。",
    icon: BookOpenCheck,
  },
  {
    title: "质量门禁与人审节点",
    description:
      "对冲突、低置信、缺少角色或边界的需求保持阻断或待审状态，避免把不确定性包装成已确认结论。",
    icon: ClipboardCheck,
  },
  {
    title: "覆盖与双向追踪",
    description:
      "建设从需求到模型、代码、测试和证据的覆盖矩阵与 TraceabilityMatrix，识别未覆盖需求和孤立产物。",
    icon: Route,
  },
  {
    title: "证据包与验收记录",
    description:
      "把基线、质量报告、追踪矩阵、修复日志、测试结果和浏览器验收记录沉淀为可审查的 EvidencePackage。",
    icon: PackageCheck,
  },
];

const featuresZh: MarketingFeature[] = [
  {
    title: "可信需求基线",
    shortTitle: "可信需求基线",
    description:
      "从需求文本中提取业务实体、状态流转和核心规则，并形成带来源片段、置信度和质量报告的结构化需求基线。",
    icon: BookOpenCheck,
  },
  {
    title: "UML 自动建模",
    shortTitle: "UML",
    description:
      "基于需求规则生成用例模型、领域概念模型、总体业务流程和部署需求模型等 UML模型，并保留模型结构供后续阶段追踪和修复。",
    icon: Binary,
  },
  {
    title: "设计阶段推导",
    shortTitle: "设计阶段推导",
    description:
      "结合需求模型继续生成用例实现设计、设计类图、界面关系图、部署设计和数据库设计，补充从需求到设计的结构化产物。",
    icon: GitBranch,
  },
  {
    title: "PlantUML 渲染与修复",
    shortTitle: "PlantUML",
    description:
      "集成 PlantUML 渲染服务，输出 SVG 预览和 DOCX 可嵌入 PNG。渲染失败时记录错误并触发源码修复重试。",
    icon: Layers3,
  },
  {
    title: "React 原型生成",
    shortTitle: "React",
    description:
      "从设计模型和业务逻辑生成 React + TypeScript 原型文件，并通过预览和质量检查帮助课程实验验证页面流程。",
    icon: Code2,
  },
  {
    title: "说明书导出",
    shortTitle: "说明书导出",
    description:
      "将需求、模型、PlantUML 图和说明书正文组装为需求规格说明书或软件设计说明书 DOCX，缺失图表会留下明确提示。",
    icon: FileText,
  },
  {
    title: "覆盖矩阵与双向追踪",
    shortTitle: "覆盖与追踪",
    description:
      "围绕 RequirementBaseline 建设覆盖状态、模型映射和双向追踪，让需求、模型、代码和测试证据可以相互定位。",
    icon: Route,
  },
  {
    title: "质量门禁与人工复核",
    shortTitle: "质量门禁",
    description:
      "对冲突、低置信、待审假设和关键覆盖缺口保留明确状态，后续生成需要基线门禁通过或人工决策确认。",
    icon: UserCheck,
  },
  {
    title: "证据包与验收记录",
    shortTitle: "证据包",
    description:
      "把基线、质量报告、追踪矩阵、修复记录和浏览器验收结果纳入运行证据，为课程复盘和工程审查提供依据。",
    icon: PackageCheck,
  },
];

const workflowStepsZh: WorkflowStep[] = [
  {
    title: "输入项目需求",
    description:
      "在项目工作台输入自然语言需求，系统解析业务目标、角色、规则和约束，作为后续生成链路的共同上下文。",
    icon: UploadCloud,
  },
  {
    title: "确认需求基线",
    description:
      "系统生成 RequirementBaseline、质量报告和待审提示；冲突、低置信或缺少边界的需求会保留明确原因，先确认再进入下游生成。",
    tags: ["Baseline", "Quality gate"],
    icon: SearchCheck,
  },
  {
    title: "生成需求规则与UML",
    description:
      "AI 引擎基于已确认的需求基线生成需求规则和需求阶段 UML 图，并把 PlantUML 源码、渲染结果和修复记录纳入运行追踪。",
    tags: ["PlantUML", "Trace"],
    icon: Network,
  },
  {
    title: "推导设计模型",
    description:
      "在需求模型基础上继续生成设计阶段模型，覆盖用例实现设计、设计类图、界面关系图、部署设计和数据库设计，并保留设计追踪状态。",
    icon: Bot,
  },
  {
    title: "审查覆盖与追踪",
    description:
      "通过覆盖矩阵和双向追踪检查需求是否被模型、代码、测试或替代证据覆盖，待审映射会作为人工复核项呈现。",
    tags: ["Coverage", "Traceability"],
    icon: Route,
  },
  {
    title: "生成前端原型",
    description:
      "将业务逻辑和设计上下文转化为可预览的 React 原型代码，并围绕权限、状态流转、边界条件等业务断言记录验证线索。",
    icon: Code2,
  },
  {
    title: "导出实验报告与证据",
    description:
      "完成迭代后导出需求规格说明书或软件设计说明书 DOCX，并逐步沉淀基线、追踪、测试、修复和浏览器验收记录。",
    icon: FileText,
  },
];

const caseStudiesZh: CaseStudy[] = [
  {
    id: "lab-booking",
    title: "实验室预约系统",
    description:
      "围绕预约、审批、资源占用和权限角色，展示从可行性分析到 UML、React 原型与说明书的完整链路。",
    tags: ["可行性分析", "需求规则", "UML 图", "React 原型", "说明书"],
    scenario:
      "面向高校实验室开放管理，帮助学生预约可用时段，教师审核申请，管理员维护实验室设备和开放时间。",
    actors: ["学生", "教师", "实验室管理员"],
    workflow: ["查看实验室空闲时段", "提交预约申请", "教师审核预约", "通知申请人审核结果"],
    outputs: ["系统上下文图", "两套候选实现方案", "预约用例与状态模型", "预约审批原型与说明书"],
    feasibilitySummary:
      "验证时段冲突、审批通知和消息服务集成，比较两套方案的周期、成本、收益、风险及五类可行性结论。",
    sampleRequirement:
      "高校实验室预约平台。学生可以查看实验室空闲时段并提交预约申请，教师审核预约，管理员维护实验室设备和开放时间。系统需要避免时段冲突，并在审核通过或驳回时通知申请人。",
  },
  {
    id: "order-management",
    title: "订单管理系统",
    description:
      "围绕订单状态、库存校验、支付节点和异常分支，展示可行性、需求、设计与原型验证链路。",
    tags: ["可行性分析", "需求规则", "UML 图", "React 原型", "说明书"],
    scenario:
      "面向中小商家订单履约，覆盖商品维护、客户下单、库存校验、发货通知和订单状态跟踪。",
    actors: ["商家", "客户", "仓储系统"],
    workflow: ["维护商品与库存", "客户提交订单", "校验库存余量", "通知仓储系统发货"],
    outputs: ["系统上下文图", "两套候选实现方案", "订单状态机与库存规则", "订单原型与设计说明书"],
    feasibilitySummary:
      "验证库存约束和仓储系统集成，比较实施边界、交付周期、成本收益与运营风险。",
    sampleRequirement:
      "面向中小商家的订单管理系统。商家可以维护商品、创建订单、查看库存，客户可以提交订单并查询订单状态。系统需要在下单前校验库存，库存不足时给出明确提示，订单创建后通知仓储系统发货。",
  },
  {
    id: "device-monitoring",
    title: "设备监控系统",
    description:
      "聚焦设备状态、告警流转和监控看板，演示如何先验证方案可行性，再沉淀模型和可预览原型。",
    tags: ["可行性分析", "需求规则", "UML 图", "React 原型", "说明书"],
    scenario:
      "面向工业设备运维，采集边缘网关上报的温度、振动和运行状态，并对严重异常及时告警。",
    actors: ["边缘网关", "运维人员", "短信服务"],
    workflow: ["采集设备运行数据", "识别异常告警", "运维人员确认处理", "严重告警发送短信通知"],
    outputs: ["系统上下文图", "两套候选实现方案", "告警流程与设备状态模型", "监控原型与证据记录"],
    feasibilitySummary:
      "验证数据采集、严重告警和短信服务集成，比较部署方式、持续运维成本与集成风险。",
    sampleRequirement:
      "工业设备监控系统。边缘网关采集设备温度、振动和运行状态，平台实时展示异常告警，运维人员可以确认告警并记录处理结果。系统需要接入第三方短信服务，在严重告警时发送通知。",
  },
  {
    id: "library-lending",
    title: "图书馆借阅系统",
    description:
      "以借阅、归还、逾期和读者管理为主线，展示可行性分析、数据关系、状态流转和交互页面。",
    tags: ["可行性分析", "需求规则", "UML 图", "React 原型", "说明书"],
    scenario:
      "面向校园图书馆日常借阅，管理图书库存、读者借阅、归还登记和逾期提醒。",
    actors: ["读者", "馆员", "系统通知服务"],
    workflow: ["读者检索图书", "提交借阅申请", "馆员登记借出和归还", "系统处理逾期提醒"],
    outputs: ["系统上下文图", "两套候选实现方案", "借阅领域模型与逾期规则", "借还书原型与需求说明书"],
    feasibilitySummary:
      "验证库存一致性、逾期提醒和通知服务集成，比较交付复杂度、成本收益与运营条件。",
    sampleRequirement:
      "校园图书馆借阅系统。读者可以检索图书、提交借阅申请并查看借阅状态，馆员负责登记借出和归还。系统需要维护图书库存，自动识别逾期记录，并向读者发送归还提醒。",
  },
];

const pricingPlansZh: PricingPlan[] = [
  {
    name: "当前开放能力",
    description: "面向学生、教师和项目成员的现阶段可用能力",
    price: "免费试用",
    action: "免费注册",
    highlighted: true,
    features: [
      "邮箱验证与 MFA 二次验证",
      "项目创建、项目列表与项目成员管理",
      "项目成员邀请与运行历史",
      "需求规则、设计模型与 React 原型生成",
      "UML 图生成与渲染",
      "说明书生成与文档中心",
      "模型配置托管与 Cookie 会话",
    ],
  },
  {
    name: "课程/团队开通",
    description: "适合课程小组、实验团队和需要统一项目管理的教学场景",
    price: "申请开通",
    action: "联系开通",
    features: [
      "通过教师或管理员统一邀请成员",
      "按项目组织需求、UML模型、原型和说明书",
      "查看项目成员、运行历史和文档记录",
      "暂未接入在线支付和套餐权限控制",
    ],
  },
  {
    name: "机构部署咨询",
    description: "面向需要接入校内账号、统一模型配置或部署评估的机构",
    price: "联系评估",
    action: "咨询开通",
    features: [
      "评估账号体系、模型配置和项目空间接入",
      "按现有平台能力规划部署范围",
      "上线前明确可用功能与后续建设边界",
      "当前页面仅作开通说明，不承诺未交付能力",
    ],
  },
];

const authSecurityHighlightsZh = [
  {
    title: "HttpOnly Cookie 会话",
    description: "认证令牌通过严格的 HttpOnly Cookie 保存，降低脚本读取和 XSS 窃取风险。",
    icon: LockKeyhole,
  },
  {
    title: "强制 MFA 验证",
    description: "访问敏感实验配置前必须完成二次验证，保护教师、管理员和项目成员操作。",
    icon: ShieldCheck,
  },
  {
    title: "不落地本地令牌",
    description: "平台不在 LocalStorage 或 SessionStorage 中保存活跃会话令牌，减少前端泄露面。",
    icon: KeyRound,
  },
  {
    title: "已验证域名",
    description: "企业与课程空间可限制为已验证组织邮箱域名访问，确保成员身份可信。",
    icon: Mail,
  },
];

const footerLinksZh = ["技术文档"];

const securityHighlightsZh = [
  { title: "HttpOnly Cookie 会话", icon: LockKeyhole },
  { title: "MFA 二次验证", icon: ShieldCheck },
  { title: "邮箱验证保护", icon: CheckCircle2 },
  { title: "模型配置托管", icon: Database },
];

const marketingNavItemsEn: MarketingNavItem[] = [
  { label: "Features", path: "/features" },
  { label: "Workflow", path: "/workflow" },
  { label: "Cases", path: "/cases" },
];

const heroTrustPointsEn = [
  { label: "UML modeling", icon: Network },
  { label: "Design derivation", icon: GitBranch },
  { label: "React prototype", icon: Code2 },
  { label: "Spec export", icon: FileText },
  { label: "Trace review", icon: Route },
];

const productPreviewCardsEn = [
  { title: "Requirements Report", icon: FileText },
  { title: "UML Preview", icon: Network },
];

const referenceStandardsEn: ReferenceStandard[] = [
  {
    name: "ISO/IEC/IEEE 29148:2018",
    shortName: "ISO/IEC",
    topic: "29148 Requirements",
    description: "Anchors requirement engineering lifecycle, documentation, management, verification, and validation activities.",
    href: "https://www.iso.org/standard/72089.html",
  },
  {
    name: "IEEE 29148 listing",
    shortName: "IEEE",
    topic: "29148 Listing",
    description: "Confirms the 29148 standard scope and its alignment with systems and software engineering requirements topics.",
    href: "https://standards.ieee.org/standard/29148-2018.html",
  },
  {
    name: "INCOSE Requirements Working Group",
    shortName: "INCOSE",
    topic: "Systems Engineering",
    description: "References engineering practices that carry requirement definition, management, verification, and validation across the lifecycle.",
    href: "https://www.incose.org/communities/working-groups-initiatives/requirements",
  },
  {
    name: "CMMI/SEI requirements traceability",
    shortName: "CMMI",
    topic: "Traceability Practice",
    description: "References process improvement practices for bidirectional traceability between requirements and downstream engineering artifacts.",
    href: "https://resources.sei.cmu.edu/asset_files/TechnicalReport/2011_005_001_15392.pdf",
  },
];

const trustedChainHighlightsEn: TrustedChainHighlight[] = [
  {
    title: "Structured requirements baseline",
    description:
      "Breaks raw requirements into a RequirementBaseline with source excerpts, type, confidence, and quality reports as the shared basis for later generation.",
    icon: BookOpenCheck,
  },
  {
    title: "Quality gates and human review",
    description:
      "Keeps conflicts, low-confidence requirements, missing actors, or unclear boundaries blocked or pending review instead of packaging uncertainty as confirmed output.",
    icon: ClipboardCheck,
  },
  {
    title: "Coverage and bidirectional traceability",
    description:
      "Builds coverage matrices and a TraceabilityMatrix from requirements to models, code, tests, and evidence to expose uncovered requirements and orphan artifacts.",
    icon: Route,
  },
  {
    title: "Evidence packages and acceptance records",
    description:
      "Preserves baselines, quality reports, trace matrices, repair logs, test results, and browser acceptance records as reviewable EvidencePackages.",
    icon: PackageCheck,
  },
];

const featuresEn: MarketingFeature[] = [
  {
    title: "Trusted requirements baseline",
    shortTitle: "Trusted baseline",
    description:
      "Extracts business entities, state transitions, and core rules from requirement text, then forms a structured baseline with source excerpts, confidence, and quality reports.",
    icon: BookOpenCheck,
  },
  {
    title: "Automatic UML modeling",
    shortTitle: "UML modeling",
    description:
      "Generates use case, domain concept, business process, deployment requirement, and other UML models from requirement rules while preserving model structure for trace and repair.",
    icon: Binary,
  },
  {
    title: "Design-stage derivation",
    shortTitle: "Design derivation",
    description:
      "Continues from requirement models into use case realization, design classes, interface relationships, deployment design, and database design.",
    icon: GitBranch,
  },
  {
    title: "PlantUML rendering and repair",
    shortTitle: "PlantUML",
    description:
      "Integrates PlantUML rendering for SVG previews and DOCX-ready PNG output. Render failures are recorded and can trigger source repair retries.",
    icon: Layers3,
  },
  {
    title: "React prototype generation",
    shortTitle: "React prototype",
    description:
      "Generates React + TypeScript prototype files from design models and business logic, then supports preview and quality checks for course lab validation.",
    icon: Code2,
  },
  {
    title: "Specification export",
    shortTitle: "Spec export",
    description:
      "Assembles requirements, models, PlantUML diagrams, and generated text into SRS or software design DOCX files with clear placeholders for missing charts.",
    icon: FileText,
  },
  {
    title: "Coverage matrix and traceability",
    shortTitle: "Coverage and trace",
    description:
      "Builds coverage status, model mappings, and bidirectional trace around the RequirementBaseline so requirements, models, code, and test evidence can locate one another.",
    icon: Route,
  },
  {
    title: "Quality gates and manual review",
    shortTitle: "Quality gates",
    description:
      "Keeps conflicts, low confidence, pending assumptions, and key coverage gaps visible so downstream generation requires a passed baseline or explicit human decision.",
    icon: UserCheck,
  },
  {
    title: "Evidence packages and acceptance records",
    shortTitle: "Evidence package",
    description:
      "Includes baselines, quality reports, trace matrices, repair records, and browser acceptance results in run evidence for course review and engineering audit.",
    icon: PackageCheck,
  },
];

const workflowStepsEn: WorkflowStep[] = [
  {
    title: "Enter project requirements",
    description:
      "Enter natural-language requirements in the project workspace. The system parses goals, actors, rules, and constraints as shared context for later stages.",
    icon: UploadCloud,
  },
  {
    title: "Confirm the requirements baseline",
    description:
      "The system generates a RequirementBaseline, quality report, and review prompts. Conflicts, low confidence, or missing boundaries keep explicit reasons before downstream generation.",
    tags: ["Baseline", "Quality gate"],
    icon: SearchCheck,
  },
  {
    title: "Generate rules and UML",
    description:
      "The AI engine generates requirement rules and requirement-stage UML diagrams from the confirmed baseline, tracking PlantUML source, renders, and repairs.",
    tags: ["PlantUML", "Trace"],
    icon: Network,
  },
  {
    title: "Derive design models",
    description:
      "Continue from requirement models into design-stage models including use case realization, design class, interface relationship, deployment design, and database design.",
    icon: Bot,
  },
  {
    title: "Review coverage and traceability",
    description:
      "Use coverage matrices and bidirectional traces to check whether requirements are covered by models, code, tests, or alternative evidence.",
    tags: ["Coverage", "Traceability"],
    icon: Route,
  },
  {
    title: "Generate frontend prototype",
    description:
      "Transform business logic and design context into previewable React prototype code, with validation clues for permissions, state transitions, and boundary conditions.",
    icon: Code2,
  },
  {
    title: "Export reports and evidence",
    description:
      "Export SRS or software design DOCX files after iteration, and gradually accumulate baselines, traces, tests, repairs, and browser acceptance records.",
    icon: FileText,
  },
];

const caseStudiesEn: CaseStudy[] = [
  {
    id: "lab-booking",
    title: "Lab Booking System",
    description:
      "Shows the full path from feasibility analysis to UML, React prototypes, and specifications for booking, approval, resource occupancy, and role permissions.",
    tags: ["Feasibility", "Requirement rules", "UML diagrams", "React prototype", "Specification"],
    scenario:
      "For university lab access management, helping students book available time slots, teachers approve requests, and administrators maintain equipment and opening hours.",
    actors: ["Student", "Teacher", "Lab administrator"],
    workflow: ["View available lab slots", "Submit booking request", "Teacher reviews booking", "Notify applicant of review result"],
    outputs: ["System context diagram", "Two candidate implementation plans", "Booking use case and state models", "Approval prototype and specification"],
    feasibilitySummary:
      "Validates slot conflicts, approval notifications, and messaging integration while comparing schedule, cost, benefit, risk, and five feasibility verdicts.",
    sampleRequirement:
      "University lab booking platform. Students can view available lab slots and submit booking requests. Teachers review bookings, and administrators maintain lab equipment and opening hours. The system must prevent time conflicts and notify applicants when requests are approved or rejected.",
  },
  {
    id: "order-management",
    title: "Order Management System",
    description:
      "Shows feasibility, requirements, design, and prototype validation around order states, inventory checks, payment checkpoints, and exception branches.",
    tags: ["Feasibility", "Requirement rules", "UML diagrams", "React prototype", "Specification"],
    scenario:
      "For small and midsize merchant fulfillment, covering product maintenance, customer orders, inventory checks, shipping notifications, and order status tracking.",
    actors: ["Merchant", "Customer", "Warehouse system"],
    workflow: ["Maintain products and inventory", "Customer submits order", "Check stock balance", "Notify warehouse system to ship"],
    outputs: ["System context diagram", "Two candidate implementation plans", "Order state machine and inventory rules", "Order prototype and design specification"],
    feasibilitySummary:
      "Validates inventory constraints and warehouse integration while comparing implementation boundaries, delivery schedule, economics, and operational risks.",
    sampleRequirement:
      "Order management system for small and midsize merchants. Merchants can maintain products, create orders, and view inventory. Customers can submit orders and check order status. The system must validate inventory before checkout, show clear prompts when stock is insufficient, and notify the warehouse system after an order is created.",
  },
  {
    id: "device-monitoring",
    title: "Device Monitoring System",
    description:
      "Uses device states, alarm flow, and dashboards to show how feasibility is validated before business processes become models and previewable prototypes.",
    tags: ["Feasibility", "Requirement rules", "UML diagrams", "React prototype", "Specification"],
    scenario:
      "For industrial equipment operations, collecting temperature, vibration, and operating status from edge gateways while alerting serious anomalies promptly.",
    actors: ["Edge gateway", "Operations staff", "SMS service"],
    workflow: ["Collect device runtime data", "Detect abnormal alarms", "Operations staff confirms handling", "Send SMS for severe alarms"],
    outputs: ["System context diagram", "Two candidate implementation plans", "Alarm flow and device state models", "Monitoring prototype and evidence"],
    feasibilitySummary:
      "Validates data collection, severe alarms, and SMS integration while comparing deployment choices, recurring operations cost, and integration risk.",
    sampleRequirement:
      "Industrial device monitoring system. Edge gateways collect device temperature, vibration, and operating status. The platform displays abnormal alarms in real time, and operations staff can confirm alarms and record handling results. The system must integrate a third-party SMS service to send notifications for severe alarms.",
  },
  {
    id: "library-lending",
    title: "Library Lending System",
    description:
      "Uses borrowing, returns, overdue handling, and reader management to demonstrate feasibility analysis, data relationships, state transitions, and interaction pages.",
    tags: ["Feasibility", "Requirement rules", "UML diagrams", "React prototype", "Specification"],
    scenario:
      "For daily campus library lending, managing book inventory, reader borrowing, return registration, and overdue reminders.",
    actors: ["Reader", "Librarian", "System notification service"],
    workflow: ["Reader searches books", "Submit lending request", "Librarian registers lending and return", "System handles overdue reminders"],
    outputs: ["System context diagram", "Two candidate implementation plans", "Lending domain model and overdue rules", "Borrow/return prototype and specification"],
    feasibilitySummary:
      "Validates inventory consistency, overdue reminders, and notification integration while comparing delivery complexity, economics, and operating conditions.",
    sampleRequirement:
      "Campus library lending system. Readers can search books, submit lending requests, and view lending status. Librarians register lending and returns. The system must maintain book inventory, automatically identify overdue records, and send return reminders to readers.",
  },
];

const pricingPlansEn: PricingPlan[] = [
  {
    name: "Currently available capabilities",
    description: "Current capabilities for students, teachers, and project members",
    price: "Free trial",
    action: "Register free",
    highlighted: true,
    features: [
      "Email verification and MFA",
      "Project creation, project lists, and member management",
      "Project member invitations and run history",
      "Requirement rules, design models, and React prototype generation",
      "UML diagram generation and rendering",
      "Specification generation and document center",
      "Hosted model configuration and cookie sessions",
    ],
  },
  {
    name: "Course/team enablement",
    description: "For course groups, lab teams, and teaching scenarios that need unified project management",
    price: "Apply to enable",
    action: "Contact us",
    features: [
      "Invite members through teachers or administrators",
      "Organize requirements, UML models, prototypes, and specifications by project",
      "View project members, run history, and document records",
      "Online payment and package permissions are not available yet",
    ],
  },
  {
    name: "Institution deployment consulting",
    description: "For institutions evaluating campus accounts, unified model configuration, or deployment options",
    price: "Contact for evaluation",
    action: "Consult",
    features: [
      "Evaluate account systems, model configuration, and project space integration",
      "Plan deployment scope from current platform capabilities",
      "Clarify available features and future boundaries before launch",
      "This page only explains enablement and does not promise undelivered capabilities",
    ],
  },
];

const authSecurityHighlightsEn = [
  {
    title: "HttpOnly Cookie sessions",
    description: "Authentication tokens are stored in strict HttpOnly Cookies to reduce script access and XSS theft risk.",
    icon: LockKeyhole,
  },
  {
    title: "Mandatory MFA verification",
    description: "Sensitive lab configuration requires second-factor verification to protect teachers, administrators, and project members.",
    icon: ShieldCheck,
  },
  {
    title: "No local active tokens",
    description: "The platform does not store active session tokens in LocalStorage or SessionStorage, reducing frontend exposure.",
    icon: KeyRound,
  },
  {
    title: "Verified domains",
    description: "Enterprise and course spaces can be limited to verified organization email domains to keep member identity trustworthy.",
    icon: Mail,
  },
];

const footerLinksEn = ["Technical docs"];

const securityHighlightsEn = [
  { title: "HttpOnly Cookie sessions", icon: LockKeyhole },
  { title: "MFA verification", icon: ShieldCheck },
  { title: "Email verification", icon: CheckCircle2 },
  { title: "Hosted model config", icon: Database },
];

const marketingContentByLocale: Record<AppLocale, MarketingContent> = {
  "zh-CN": {
    marketingNavItems: marketingNavItemsZh,
    heroTrustPoints: heroTrustPointsZh,
    productPreviewCards: productPreviewCardsZh,
    referenceStandards: referenceStandardsZh,
    trustedChainHighlights: trustedChainHighlightsZh,
    features: featuresZh,
    workflowSteps: workflowStepsZh,
    caseStudies: caseStudiesZh,
    pricingPlans: pricingPlansZh,
    authSecurityHighlights: authSecurityHighlightsZh,
    footerLinks: footerLinksZh,
    securityHighlights: securityHighlightsZh,
  },
  en: {
    marketingNavItems: marketingNavItemsEn,
    heroTrustPoints: heroTrustPointsEn,
    productPreviewCards: productPreviewCardsEn,
    referenceStandards: referenceStandardsEn,
    trustedChainHighlights: trustedChainHighlightsEn,
    features: featuresEn,
    workflowSteps: workflowStepsEn,
    caseStudies: caseStudiesEn,
    pricingPlans: pricingPlansEn,
    authSecurityHighlights: authSecurityHighlightsEn,
    footerLinks: footerLinksEn,
    securityHighlights: securityHighlightsEn,
  },
};

export function getMarketingContent(locale: AppLocale) {
  return marketingContentByLocale[locale] ?? marketingContentByLocale["zh-CN"];
}
