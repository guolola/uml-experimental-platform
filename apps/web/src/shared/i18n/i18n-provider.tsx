// Bridges persisted language preference, browser locale detection, and document language metadata.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "./i18n";
import {
  LOCALE_HTML_LANG,
  type AppLocale,
  type LocalePreference,
} from "./types";
import {
  loadLocalePreference,
  resolveLocalePreference,
  saveLocalePreference,
} from "./locale";

type I18nContextValue = {
  locale: AppLocale;
  preference: LocalePreference;
  setPreference: (preference: LocalePreference) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const originalTextNodes = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

const STATIC_UI_EN_TEXT: Record<string, string> = {
  设置: "Settings",
  全局设置: "Global settings",
  用户偏好设置: "User preferences",
  安全设置: "Security settings",
  模型托管配置: "Hosted model configuration",
  默认模型: "Default model",
  工作台偏好: "Workspace preferences",
  深色主题: "Dark theme",
  字号: "Font size",
  添加供应商: "Add provider",
  编辑: "Edit",
  删除: "Delete",
  保存: "Save",
  取消: "Cancel",
  确认: "Confirm",
  关闭: "Close",
  复制: "Copy",
  下载: "Download",
  重试: "Retry",
  恢复: "Restore",
  运行历史: "Run history",
  历史快照: "History snapshots",
  "暂无历史快照。完成一次生成后会自动保存。":
    "No history snapshots yet. A snapshot is saved automatically after a generation completes.",
  关闭历史抽屉遮罩: "Close history drawer overlay",
  "重新下载 DOCX": "Download DOCX again",
  暂无任务: "No tasks",
  链路阶段: "Pipeline stages",
  执行详情: "Execution details",
  生成完成: "Generation completed",
  排队中: "Queued",
  运行中: "Running",
  已完成: "Completed",
  已取消: "Cancelled",
  失败: "Failed",
  "服务中断，可重试": "Service interrupted. Retry available",
  项目设置: "Project settings",
  项目成员与权限: "Project members and access",
  成员管理: "Member management",
  文档中心: "Document center",
  项目数据加载中: "Loading project data",
  "项目数据加载中...": "Loading project data...",
  "正在加载项目数据...": "Loading project data...",
  "正在加载账号信息...": "Loading account information...",
  "正在加载账号资料...": "Loading account profile...",
  "正在加载会话...": "Loading sessions...",
  "正在加载登录记录...": "Loading sign-in records...",
  "正在加载套餐...": "Loading plans...",
  "正在加载权益...": "Loading credits...",
  "正在加载系统通知...": "Loading system notices...",
  项目数据加载失败: "Project data failed to load",
  请先登录: "Please log in",
  权限不足: "Access denied",
  前往登录: "Go to login",
  去登录: "Log in",
  模型详情页: "Model detail page",
  元素列表: "Element list",
  追踪矩阵: "Traceability matrix",
  模型概览: "Model overview",
  焦点元素: "Focused element",
  关系: "Relationships",
  元素: "Elements",
  分组: "Groups",
  来源: "Source",
  角色: "Actor",
  系统边界: "System boundary",
  功能: "Function",
  类: "Class",
  接口: "Interface",
  枚举: "Enum",
  活动: "Activity",
  判断: "Decision",
  开始节点: "Start node",
  结束节点: "End node",
  合并节点: "Merge node",
  并发分叉: "Fork node",
  并发汇合: "Join node",
  泳道: "Swimlane",
  部署节点: "Deployment node",
  数据库: "Database",
  组件: "Component",
  外部系统: "External system",
  制品: "Artifact",
  参与对象: "Participant",
  调用消息: "Call message",
  组合片段: "Combined fragment",
  包: "Package",
  表: "Table",
  字段: "Field",
  页面: "Page",
  模块: "Module",
  入口点: "Entry point",
  中文名称: "Chinese name",
  英文名称: "English name",
  约束: "Constraints",
  无: "None",
  未标明: "Unspecified",
  身份: "Identity",
  职责: "Responsibilities",
  目标: "Goal",
  前置条件: "Preconditions",
  后置条件: "Postconditions",
  主参与者: "Primary actor",
  协作参与者: "Supporting actors",
  主事件流: "Main flow",
  备选事件流: "Alternative flow",
  异常事件流: "Exception flow",
  触发: "Trigger",
  条件: "Condition",
  说明: "Description",
  执行方: "Executor",
  参与者动作: "Actor action",
  系统动作: "System action",
  预期结果: "Expected result",
  来源需求: "Source requirement",
  未列步骤: "No steps listed",
  标签: "Label",
  父功能: "Parent function",
  关联需求: "Related requirements",
  属性明细: "Attribute details",
  名称: "Name",
  字面量: "Literals",
  源角色: "Source role",
  目标角色: "Target role",
  源多重性: "Source multiplicity",
  目标多重性: "Target multiplicity",
  可导航性: "Navigability",
  所属泳道: "Swimlane",
  输入: "Input",
  输出: "Output",
  判断条件: "Decision condition",
  守卫: "Guard",
  节点类型: "Node type",
  环境: "Environment",
  引擎: "Engine",
  组件类型: "Component type",
  路径: "Path",
  关联用例: "Related use cases",
  调用类型: "Call type",
  参数: "Parameters",
  返回: "Return",
  消息: "Messages",
  数据表: "Data table",
  主键: "Primary key",
  外键: "Foreign key",
  源字段: "Source field",
  目标字段: "Target field",
  构造型: "Stereotype",
  包含组件: "Contained components",
  所属包: "Package",
  来源设计类: "Source design classes",
  操作: "Operations",
  关联: "Association",
  包含: "Include",
  扩展: "Extend",
  泛化: "Generalization",
  聚合: "Aggregation",
  组合: "Composition",
  继承: "Inheritance",
  实现: "Implementation",
  依赖: "Dependency",
  部署: "Deployment",
  通信: "Communication",
  承载: "Hosting",
  一对一: "One-to-one",
  一对多: "One-to-many",
  多对多: "Many-to-many",
  功能分解: "Functional decomposition",
  提供接口: "Provided interface",
  依赖接口: "Required interface",
  导航: "Navigation",
  打开: "Open",
  提交: "Submit",
  同步调用: "Synchronous call",
  异步调用: "Asynchronous call",
  创建: "Create",
  销毁: "Destroy",
  控制流: "Control flow",
  对象流: "Object flow",
  需求: "Requirements",
  设计: "Design",
  代码: "Code",
  测试: "Tests",
  说明书: "Specification",
  课程设计模板: "Course design template",
  生成模板: "Generation template",
  说明书样式: "Specification style",
  "DOCX 文件": "DOCX file",
  文件大小: "File size",
  最近更新: "Last updated",
  "生成后可进入 Word 编辑器。": "After generation, you can open the Word editor.",
  生成并打开: "Generate and open",
  打开编辑器: "Open editor",
  刷新: "Refresh",
  刷新列表: "Refresh list",
  "下载当前 DOCX": "Download current DOCX",
  "正在加载 OnlyOffice 编辑器...": "Loading OnlyOffice editor...",
  "OnlyOffice 编辑器尚未就绪": "OnlyOffice editor is not ready",
  "查看、生成并编辑需求规格说明书和软件设计说明书。":
    "View, generate, and edit software requirements and design specifications.",
  所有类型: "All types",
  已生成说明书: "Generated specifications",
  暂无匹配的说明书: "No matching specifications",
  "正在读取说明书...": "Reading specifications...",
  需求规格说明书: "Software Requirements Specification",
  软件设计说明书: "Software Design Specification",
  设计模型: "Design models",
  "基于需求自动生成或手动构建系统架构模型":
    "Automatically generate or manually build system architecture models from requirements",
  生成设计模型: "Generate design models",
  查看用例实现设计: "View use case realization design",
  回到需求页更新: "Back to requirements to update",
  已生成设计模型: "Design model generated",
  查看: "View",
  等待生成设计模型: "Waiting for design model generation",
  需求阶段来源: "Requirement-stage sources",
  追踪证明: "Trace proof",
  需更新: "Needs update",
  可用: "Available",
  未生成: "Not generated",
  "设计生成会使用需求基线、上方需求阶段模型和已生成的上游设计模型。":
    "Design generation uses the requirement baseline, requirement-stage models above, and generated upstream design models.",
  设计模型指南: "Design model guide",
  "1. 明确业务边界": "1. Clarify business boundaries",
  "在生成模型前，请确保领域概念模型已清晰定义实体关系与聚合根，避免模块间过度耦合。":
    "Before generating models, ensure the domain concept model clearly defines entity relationships and aggregate roots to avoid excessive coupling.",
  "2. 补全前置依赖": "2. Complete prerequisites",
  "3. 选择合适的架构风格": "3. Choose a suitable architecture style",
  "根据业务复杂度选择单体、微服务或事件驱动架构，这将直接影响部署设计与类图的生成策略。":
    "Choose monolith, microservices, or event-driven architecture based on business complexity; this directly affects deployment design and class diagram strategy.",
  参考设计模式: "Reference design patterns",
  "分层架构 (N-Tier)": "N-Tier architecture",
  "微服务架构 (Microservices)": "Microservices architecture",
  "事件驱动架构 (EDA)": "Event-driven architecture (EDA)",
  设计模型追踪证明: "Design model trace proof",
  "查看设计元素到上游需求模型的来源证明；这些内容用于审计和排查，不会改动需求规则或设计模型。":
    "Review proof from design elements to upstream requirement models. This is for audit and troubleshooting and will not change requirement rules or design models.",
  来源追踪: "Source trace",
  追踪已补齐: "Trace completed",
  重新补齐证明: "Refill proof",
  单项证明补齐完成: "Single proof refill completed",
  "已只重新检查当前设计模型追踪证明，没有重新生成全部设计模型。":
    "Only the current design model trace proof was rechecked; all design models were not regenerated.",
  阶段: "Stage",
  对象: "Object",
  我知道了: "Got it",
  黑盒测试用例: "Black-box test cases",
  生成测试用例: "Generate test cases",
  测试用例: "Test cases",
  覆盖需求: "Covered requirements",
  覆盖用例: "Covered use cases",
  覆盖关系: "Coverage relations",
  全部场景: "All scenarios",
  正常流程: "Normal flow",
  备选流程: "Alternative flow",
  异常流程: "Exception flow",
  边界值: "Boundary values",
  判定表: "Decision table",
  用例: "Case",
  场景: "Scenario",
  步骤与期望: "Steps and expectations",
  覆盖: "Coverage",
  优先级: "Priority",
  暂无测试用例: "No test cases yet",
  已映射: "Mapped",
  未映射: "Unmapped",
  设计跟踪矩阵: "Design traceability matrix",
  需求跟踪矩阵: "Requirement traceability matrix",
  按设计模型类型筛选: "Filter by design model type",
  按需求模型类型筛选: "Filter by requirement model type",
  来源用例: "Source use case",
  事件流: "event flow",
  来源需求规则: "Source requirement rule",
  跟踪矩阵基于旧上游生成: "Traceability matrix was generated from stale upstream data",
  跟踪矩阵覆盖不完整: "Traceability matrix coverage is incomplete",
  设计元素映射: "Design element mappings",
  需求元素映射: "Requirement element mappings",
  分类: "Category",
  全部模型: "All models",
  暂无矩阵数据: "No matrix data",
  设计模型元素: "Design model element",
  需求模型元素: "Requirement model element",
  类型: "Type",
  来源设计图元素: "Source design diagram element",
  来源需求图: "Source requirement diagram",
  映射状态: "Mapping status",
  "没有匹配的矩阵项。": "No matching matrix items.",
  未记录来源设计图元素: "No source design diagram element recorded",
  未关联需求图元素: "No requirement diagram element linked",
  未找到来源用例: "Source use case not found",
  未关联需求规则: "No requirement rule linked",
  每页: "Per page",
  条: "items",
  元素映射率: "Element mapping rate",
  覆盖完整性: "Coverage integrity",
  "100% 覆盖": "100% coverage",
  需要重新生成: "Regeneration needed",
  映射详情: "Mapping details",
  "选择一行查看完整映射链路。": "Select a row to view the full mapping chain.",
  高级设置: "Advanced settings",
  可见性: "Visibility",
  项目可见性: "Project visibility",
  保存项目设置: "Save project settings",
  请输入项目名称: "Enter a project name",
  项目导航: "Project navigation",
  需求分析提取: "Requirement analysis extraction",
  "输入您的项目需求描述，系统将帮助您提取关键用例、参与者并生成初始的系统模型。":
    "Enter your project requirements. The system helps extract key use cases, actors, and initial system models.",
  项目需求描述: "Project requirement description",
  需求描述: "Requirement description",
  未选择模型: "No model selected",
  清空: "Clear",
  开始分析提取: "Start analysis extraction",
  更新需求规则: "Update requirement rules",
  生成需求规则: "Generate requirement rules",
  需求已修改: "Requirements changed",
  重新生成规则: "Regenerate rules",
  仅更新过时模型: "Update stale models only",
  目标模型: "Target models",
  生成模型: "Generate models",
  勾选不会立即生效: "Selections do not take effect immediately",
  "勾选不会立即生效；点击「生成模型」后左侧菜单才会更新。之后生成需求模型、设计模型、代码原型和说明书时，都会优先使用这里选择的需求项。":
    "Selections do not take effect immediately. After you click Generate models, the left menu updates. Later requirement model, design model, code prototype, and specification generation will prioritize the selected requirement items.",
  "功能结构图": "Work Breakdown Structure",
  "功能分解、子功能与依赖关系": "Functional decomposition, subfunctions, and dependencies",
  "用例模型": "Use Case Diagram",
  "系统边界、角色与用例关系": "System boundary, actors, and use case relationships",
  "领域概念模型": "Domain Concept Model",
  "领域实体、属性与关联": "Domain entities, attributes, and associations",
  "总体业务流程": "Business Process",
  "跨角色业务活动、分支与流转": "Cross-role activities, branches, and flows",
  "部署需求模型": "Deployment Requirements",
  "部署约束、节点与网络拓扑": "Deployment constraints, nodes, and network topology",
  "原型界面关系": "Prototype Interface Relationships",
  "页面、模块、入口点与跳转关系": "Pages, modules, entry points, and navigation",
  "需求分析模型": "Requirement Analysis Model",
  "基于用例事件流的需求交互分析": "Requirement interaction analysis based on use case event flows",
  "请先输入需求描述或添加需求规则": "Enter a requirement description or add requirement rules first",
  "需先选择或生成用例模型": "Select or generate the use case model first",
  缺少对应需求规则: "Missing matching requirement rules",
  "基于用例模型事件流生成，不要求需求规则直接映射。":
    "Generated from use case event flows; direct requirement-rule mapping is not required.",
  "缺少明确上游映射，系统仅临时补齐；可采纳、忽略或稍后处理。":
    "Missing explicit upstream mapping; the system only filled it temporarily. Accept, ignore, or handle later.",
  采纳补齐: "Accept fill",
  忽略提示: "Ignore prompt",
  "确认替换需求规则": "Confirm requirement rule replacement",
  确认替换: "Confirm replacement",
  兼容模式: "Compatibility mode",
  "请先输入需求文本": "Enter requirement text first",
  总体架构图: "Architecture Diagram",
  "包、子系统、核心组件与依赖": "Packages, subsystems, core components, and dependencies",
  用例实现设计: "Use Case Realization Design",
  "基于事件流的对象调用时序与动态行为": "Object call sequence and dynamic behavior based on event flows",
  设计类图: "Design Class Diagram",
  "实体、接口、聚合根及静态关联": "Entities, interfaces, aggregate roots, and static associations",
  界面关系图: "Interface Relationship Diagram",
  "界面节点、状态与跳转关系": "Interface nodes, states, and transitions",
  数据库设计: "Database Design",
  "数据库表、主键、外键与表间关联": "Database tables, primary keys, foreign keys, and table relationships",
  "组件（构件）关系": "Component Relationships",
  "组件、接口与构件依赖关系": "Components, interfaces, and component dependencies",
  部署设计: "Deployment Design",
  "组件在 Pod、服务器、数据库上的分布": "Component distribution across pods, servers, and databases",
  "将自动补齐：Work Breakdown Structure": "Will auto-fill: Work Breakdown Structure",
  "将自动补齐：": "Will auto-fill: ",
  "来源：": "Source: ",
  "当前模型：": "Current model: ",
  "需求阶段功能结构图 + 需求规则": "requirement-stage WBS + requirement rules",
  "需求阶段用例模型事件流 + 需求分析模型": "requirement-stage use case event flows + requirement analysis model",
  "需求分析模型、用例模型": "Requirement Analysis Model, Use Case Diagram",
  "需求阶段领域概念模型 + 设计阶段用例实现设计":
    "requirement-stage domain concept model + design-stage use case realization",
  "需求阶段原型界面关系 + 设计阶段用例实现设计":
    "requirement-stage prototype interface relationships + design-stage use case realization",
  "设计阶段设计类图": "design-stage design class diagram",
  "需求阶段部署需求模型 + 设计阶段组件（构件）关系":
    "requirement-stage deployment requirements + design-stage component relationships",
  "将自动补齐：需求分析模型、用例模型": "Will auto-fill: Requirement Analysis Model, Use Case Diagram",
  "将自动补齐：Domain Concept Model": "Will auto-fill: Domain Concept Model",
  "将自动补齐：Prototype Interface Relationships": "Will auto-fill: Prototype Interface Relationships",
  "将自动补齐：Deployment Requirements": "Will auto-fill: Deployment Requirements",
  "来源：需求阶段功能结构图 + 需求规则": "Source: requirement-stage WBS + requirement rules",
  "来源：需求阶段用例模型事件流 + 需求分析模型": "Source: requirement-stage use case event flows + requirement analysis model",
  "来源：需求阶段领域概念模型 + 设计阶段用例实现设计":
    "Source: requirement-stage domain concept model + design-stage use case realization",
  "来源：需求阶段原型界面关系 + 设计阶段用例实现设计":
    "Source: requirement-stage prototype interface relationships + design-stage use case realization",
  "来源：设计阶段设计类图": "Source: design-stage design class diagram",
  "来源：需求阶段部署需求模型 + 设计阶段组件（构件）关系":
    "Source: requirement-stage deployment requirements + design-stage component relationships",
  "设计生成依赖完整的需求模型。请先前往「需求阶段」完成功能结构图、用例模型、领域概念模型、总体业务流程、原型界面关系、部署需求模型、需求分析模型。":
    "Design generation depends on complete requirement models. Go to Requirements first and complete the WBS, use case, domain concept, business process, prototype interface, deployment requirement, and requirement analysis models.",
  "需求阶段用例模型缺失，无法生成测试用例": "The requirement-stage use case model is missing, so test cases cannot be generated",
  "确认需求项缺失，无法建立测试覆盖关系": "Confirmed requirements are missing, so test coverage relationships cannot be built",
  "暂无测试用例。": "No test cases yet.",
  自动目录: "Automatic table of contents",
  无目录: "No table of contents",
  标题编号: "Heading numbering",
  手动标题: "Manual headings",
  "请先在需求页生成需求模型": "Generate requirement models on the Requirements page first",
  "请先在设计页生成设计模型": "Generate design models on the Design page first",
  份: "documents",
  "0 份": "0 documents",
  预览正在编译: "Preview is compiling",
  项目开发生命周期: "Project development lifecycle",
  "v2.4.1 迭代中": "v2.4.1 in iteration",
  "流程跟踪 (Process)": "Process tracking",
  UML模型预览: "UML model preview",
  编译成功: "Build succeeded",
  "API 延迟": "API latency",
  "MFA 验证通过，正在进入项目首页。": "MFA verified. Opening the projects page.",
  "请输入认证器中的 6 位验证码完成登录。": "Enter the 6-digit code from your authenticator to complete sign-in.",
  "登录成功，正在进入项目首页。": "Signed in. Opening the projects page.",
  "请先阅读并同意服务条款。": "Read and accept the terms of service first.",
  你的邮箱: "your email",
  "重置链接缺少 token，请重新申请。": "The reset link is missing a token. Request a new one.",
  "密码已重置，请重新登录。": "Password reset. Please sign in again.",
  "邮箱验证已完成，正在前往登录。": "Email verified. Going to sign-in.",
  "验证邮件已重新发送，请复制邮件中的短期 token 到本页完成验证。":
    "Verification email resent. Copy the short-lived token from the email into this page to finish verification.",
  "邮箱验证已完成。": "Email verified.",
  "验证邮件已重新发送。": "Verification email resent.",
  "认证请求失败。": "Authentication request failed.",
  登录: "Log in",
  创建账号: "Create account",
  验证邮箱: "Verify email",
  找回密码: "Recover password",
  重置密码: "Reset password",
  "输入账号信息，进入软件工程实践平台。": "Enter your account information to access the platform.",
  "创建账号后，请先完成邮箱验证再进入项目空间。":
    "After creating an account, verify your email before entering project spaces.",
  "请确认您的电子邮箱以继续使用软件工程实践平台。":
    "Confirm your email address to continue using the platform.",
  "请输入您注册时使用的电子邮箱地址，我们将向您发送一封包含密码重置链接的邮件。":
    "Enter the email address you registered with. We will send a password reset link.",
  "请输入您的新密码。为保证安全，建议使用包含字母、数字和符号的强密码。":
    "Enter your new password. For safety, use a strong password with letters, numbers, and symbols.",
  强: "Strong",
  中: "Medium",
  弱: "Weak",
  "验证 MFA": "Verify MFA",
  "注册并发送验证邮件": "Register and send verification email",
  完成邮箱验证: "Complete email verification",
  重新发送验证邮件: "Resend verification email",
  发送重置邮件: "Send reset email",
  "返回官网": "Back to home",
  软件工程实践平台: "Software Engineering Practice Platform",
  "欢迎回来，请登录以继续。": "Welcome back. Sign in to continue.",
  面向课程实验与项目协作的智能研发空间: "An intelligent engineering space for course labs and project collaboration",
  验证您的邮箱: "Verify your email",
  邮箱或用户名: "Email or username",
  电子邮箱: "Email",
  邮箱地址: "Email address",
  邮箱: "Email",
  新密码: "New password",
  密码: "Password",
  "忘记密码？": "Forgot password?",
  "至少 8 个字符": "At least 8 characters",
  隐藏密码: "Hide password",
  显示密码: "Show password",
  密码强度: "Password strength",
  "密码强度：": "Password strength: ",
  记住我: "Remember me",
  "MFA 验证码": "MFA code",
  "6 位验证码": "6-digit code",
  "本次挑战过期时间：": "This challenge expires at: ",
  用户名: "Username",
  "用户名需为 3-32 位小写字母、数字或下划线":
    "Username must be 3-32 lowercase letters, numbers, or underscores",
  "3-32 位小写字母、数字或下划线，可用于登录。":
    "3-32 lowercase letters, numbers, or underscores. You can use it to sign in.",
  昵称: "Display name",
  邀请码: "Invitation code",
  "（选填）": "(optional)",
  "如有邀请码，请在此输入": "Enter an invitation code if you have one",
  我已阅读并同意服务条款: "I have read and agree to the terms of service",
  "请点击邮件中的验证链接，或复制短期 token 到下方完成验证。":
    "Click the verification link in the email, or copy the short-lived token below to finish verification.",
  "邮件验证码 / 短期 token": "Email code / short-lived token",
  "粘贴邮件中的短期 token": "Paste the short-lived token from the email",
  "没有收到邮件时，可保持此处为空并点击重新发送验证邮件。":
    "If you did not receive the email, leave this empty and click Resend verification email.",
  "还没有账号？": "No account yet?",
  "已有账号？": "Already have an account?",
  返回登录: "Back to sign-in",
};

const STATIC_UI_EN_ATTRS: Record<string, string> = {
  全局设置: "Global settings",
  标签页操作: "Tab actions",
  搜索项目: "Search projects",
  "搜索项目、成员...": "Search projects or members...",
  "用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则":
    "Describe your system in one paragraph: what it does, who uses it, roles, and key flows. More detail produces more accurate requirement rules.",
  更新需求规则: "Update requirement rules",
  生成需求规则: "Generate requirement rules",
  关闭权益提示: "Close credit notice",
  说明书: "Specification",
  选择功能结构图: "Select Work Breakdown Structure",
  取消选择功能结构图: "Deselect Work Breakdown Structure",
  选择用例模型: "Select Use Case Diagram",
  取消选择用例模型: "Deselect Use Case Diagram",
  选择领域概念模型: "Select Domain Concept Model",
  取消选择领域概念模型: "Deselect Domain Concept Model",
  选择总体业务流程: "Select Business Process",
  取消选择总体业务流程: "Deselect Business Process",
  选择部署需求模型: "Select Deployment Requirements",
  取消选择部署需求模型: "Deselect Deployment Requirements",
  选择原型界面关系: "Select Prototype Interface Relationships",
  取消选择原型界面关系: "Deselect Prototype Interface Relationships",
  选择需求分析模型: "Select Requirement Analysis Model",
  取消选择需求分析模型: "Deselect Requirement Analysis Model",
  排序方式: "Sort order",
  项目范围: "Project scope",
  模型标题: "Model title",
  模型摘要: "Model summary",
  "搜索元素、属性或说明": "Search elements, attributes, or notes",
  打开项目导航: "Open project navigation",
  工作台阶段: "Workspace stages",
  说明书样式: "Specification style",
  返回说明书列表: "Back to specification list",
  "搜索已生成的文档...": "Search generated documents...",
  说明书类型: "Specification type",
  按测试场景筛选: "Filter by test scenario",
  "搜索矩阵…": "Search matrix...",
  每页矩阵项数量: "Matrix items per page",
  上一页: "Previous page",
  下一页: "Next page",
  返回官网: "Back to home",
  邮箱或用户名: "Email or username",
  邮箱: "Email",
  新密码: "New password",
  密码: "Password",
  "至少 8 个字符": "At least 8 characters",
  隐藏密码: "Hide password",
  显示密码: "Show password",
  "6 位验证码": "6-digit code",
  用户名: "Username",
  "用户名需为 3-32 位小写字母、数字或下划线":
    "Username must be 3-32 lowercase letters, numbers, or underscores",
  昵称: "Display name",
  邀请码: "Invitation code",
  "如有邀请码，请在此输入": "Enter an invitation code if you have one",
  "邮件验证码 / 短期 token": "Email code / short-lived token",
  "粘贴邮件中的短期 token": "Paste the short-lived token from the email",
  按元素类型筛选: "Filter by element type",
  搜索使用文档: "Search docs",
  使用文档目录: "Documentation directory",
  本页大纲: "Page outline",
  本页内容: "On this page",
};

function originalElementAttributes(element: Element) {
  let attributes = originalAttributes.get(element);
  if (!attributes) {
    attributes = new Map();
    originalAttributes.set(element, attributes);
  }
  return attributes;
}

function shouldSkipTextNode(textNode: Text) {
  const parent = textNode.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest("script,style,code,pre,textarea,svg,[contenteditable='true']"));
}

function localizeTextNode(textNode: Text, locale: AppLocale) {
  if (shouldSkipTextNode(textNode)) return;
  const original = originalTextNodes.get(textNode) ?? textNode.nodeValue ?? "";
  if (!originalTextNodes.has(textNode)) {
    originalTextNodes.set(textNode, original);
  }
  const trimmed = original.trim();
  if (!trimmed) return;
  const translated = locale === "en" ? STATIC_UI_EN_TEXT[trimmed] : original;
  if (!translated) return;
  const leading = original.match(/^\s*/u)?.[0] ?? "";
  const trailing = original.match(/\s*$/u)?.[0] ?? "";
  textNode.nodeValue = locale === "en" ? `${leading}${translated}${trailing}` : original;
}

function localizeElementAttributes(element: Element, locale: AppLocale) {
  if (element.closest("script,style,code,pre,svg,[contenteditable='true']")) return;
  for (const attr of ["aria-label", "title", "placeholder"]) {
    const current = element.getAttribute(attr);
    if (!current) continue;
    const originals = originalElementAttributes(element);
    if (!originals.has(attr)) originals.set(attr, current);
    const original = originals.get(attr) ?? current;
    const next = locale === "en" ? STATIC_UI_EN_ATTRS[original] ?? original : original;
    if (current !== next) {
      element.setAttribute(attr, next);
    }
  }
}

function localizeNodeTree(root: ParentNode, locale: AppLocale) {
  if (typeof document === "undefined") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    localizeTextNode(node as Text, locale);
    node = walker.nextNode();
  }
  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"));
  elements.forEach((element) => localizeElementAttributes(element, locale));
}

function RuntimeUiLocalizer({ locale }: { locale: AppLocale }) {
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    if (typeof document === "undefined") return;
    const apply = () => localizeNodeTree(document.body, locale);
    apply();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            localizeTextNode(node as Text, locale);
          } else if (node instanceof Element) {
            localizeNodeTree(node, locale);
          }
        });
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          localizeElementAttributes(mutation.target, locale);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "title", "placeholder"],
    });
    return () => observer.disconnect();
  }, [locale]);
  return null;
}

function shouldUsePrerenderSafeLocale() {
  if (typeof document === "undefined") return true;
  return document.getElementById("root")?.dataset.prerendered === "true";
}

function initialLocaleState() {
  if (typeof window === "undefined" || shouldUsePrerenderSafeLocale()) {
    return {
      preference: "system" as LocalePreference,
      locale: "zh-CN" as AppLocale,
    };
  }
  const preference = loadLocalePreference();
  return {
    preference,
    locale: resolveLocalePreference(preference),
  };
}

export function AppI18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LocalePreference>(
    () => initialLocaleState().preference,
  );
  const [locale, setLocale] = useState<AppLocale>(() => initialLocaleState().locale);

  useEffect(() => {
    const savedPreference = loadLocalePreference();
    setPreferenceState(savedPreference);
    setLocale(resolveLocalePreference(savedPreference));
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(locale);
    document.documentElement.lang = LOCALE_HTML_LANG[locale];
  }, [locale]);

  useEffect(() => {
    if (preference !== "system") return;
    const refresh = () => setLocale(resolveLocalePreference("system"));
    window.addEventListener("languagechange", refresh);
    return () => {
      window.removeEventListener("languagechange", refresh);
    };
  }, [preference]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      preference,
      setPreference: (nextPreference) => {
        saveLocalePreference(nextPreference);
        setPreferenceState(nextPreference);
        setLocale(resolveLocalePreference(nextPreference));
      },
    }),
    [locale, preference],
  );

  return (
    <I18nContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>
        <RuntimeUiLocalizer locale={locale} />
        {children}
      </I18nextProvider>
    </I18nContext.Provider>
  );
}

export function useAppI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useAppI18n must be used inside AppI18nProvider");
  return value;
}
