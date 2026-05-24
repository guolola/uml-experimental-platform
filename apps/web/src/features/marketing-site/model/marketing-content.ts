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
import type { MarketingRoutePath } from "../../../app/app-routes";

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
  title: string;
  description: string;
  tags: string[];
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

export const marketingNavItems: MarketingNavItem[] = [
  { label: "功能特性", path: "/features" },
  { label: "使用流程", path: "/workflow" },
  { label: "案例展示", path: "/cases" },
  { label: "定价", path: "/pricing" },
];

export const heroTrustPoints = [
  { label: "UML 建模", icon: Network },
  { label: "设计推导", icon: GitBranch },
  { label: "React 原型", icon: Code2 },
  { label: "说明书导出", icon: FileText },
  { label: "追踪审查", icon: Route },
];

export const productPreviewCards = [
  { title: "需求报告", icon: FileText },
  { title: "UML 预览", icon: Network },
];

export const referenceStandards: ReferenceStandard[] = [
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
    description: "参考需求与下游工作产品之间保持双向追踪的过程改进实践。",
    href: "https://resources.sei.cmu.edu/asset_files/TechnicalReport/2011_005_001_15392.pdf",
  },
];

export const trustedChainHighlights: TrustedChainHighlight[] = [
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

export const features: MarketingFeature[] = [
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
      "基于需求规则生成用例图、类图、活动图和部署图等 UML 模型，并保留模型结构供后续阶段追踪和修复。",
    icon: Binary,
  },
  {
    title: "设计阶段推导",
    shortTitle: "设计阶段推导",
    description:
      "结合需求模型继续生成顺序图、设计类图、设计活动图、部署图和表关系图，补充从需求到设计的结构化产物。",
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

export const workflowSteps: WorkflowStep[] = [
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
      "在需求模型基础上继续生成设计阶段模型，覆盖顺序图、设计类图、设计活动图、部署图和数据表关系，并保留设计追踪状态。",
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

export const caseStudies: CaseStudy[] = [
  {
    title: "实验室预约系统",
    description:
      "围绕预约、审批、资源占用和权限角色设计需求规则、UML 图、React 原型与说明书产物。",
    tags: ["需求规则", "UML 图", "React 原型", "说明书"],
  },
  {
    title: "订单管理系统",
    description:
      "围绕订单状态、库存校验、支付节点和异常分支，展示需求建模、设计建模与原型验证链路。",
    tags: ["需求规则", "UML 图", "React 原型", "说明书"],
  },
  {
    title: "设备监控系统",
    description:
      "聚焦设备状态、告警流转和监控看板页面，演示如何把业务流程沉淀为模型和可预览原型。",
    tags: ["需求规则", "UML 图", "React 原型", "说明书"],
  },
  {
    title: "图书馆借阅系统",
    description:
      "以借阅、归还、逾期和读者管理为主线，展示数据关系、状态流转和用户交互页面的实验产物。",
    tags: ["需求规则", "UML 图", "React 原型", "说明书"],
  },
];

export const pricingPlans: PricingPlan[] = [
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
      "按项目组织需求、UML、原型和说明书",
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

export const authSecurityHighlights = [
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

export const footerLinks = ["服务条款", "隐私政策", "客户支持", "技术文档"];

export const securityHighlights = [
  { title: "HttpOnly Cookie 会话", icon: LockKeyhole },
  { title: "MFA 二次验证", icon: ShieldCheck },
  { title: "邮箱验证保护", icon: CheckCircle2 },
  { title: "模型配置托管", icon: Database },
];
