<!-- 记录本次架构审查的证据、结论和后续整改计划。 -->
# 架构审查报告：目录模块化、边界与注释规范

审查日期：2026-06-12

## 审查范围

本次审查覆盖 `apps/*` 与 `packages/*` 下的项目源码、测试和脚本。默认排除 `plantuml/`、`opencode/`、`apps/web/public/vendor/`、`apps/web/public/sandpack/`、`packages/*/dist/`、日志、截图和构建缓存；`apps/api/src/code-skills/ui-ux-pro-max/` 作为复制进来的外部技能资源，只观察依赖边界，不作为整改对象。

根目录 [AGENTS.md](../AGENTS.md) 是当前全局规范来源，已在 2026-05-19 存在。规范要求保持 monorepo 工作区布局、前端 `app / features / entities / services / shared` 边界、API route/pipeline/record/adapter/normalizer/document 分层，并对新文件、核心流程、状态转换和跨模块契约补充简洁说明。

## 结论摘要

- 当前项目总体目录已经按 `apps/` 和 `packages/` 组织，API 的二级域目录和前端 Feature-Sliced 风格雏形存在，基础方向符合规范。
- 第一阶段已实际落地结构和注释整改：前端向上导入已清零，300 行以上复杂文件缺顶部说明已清零，API 入口装配已拆出 `server/` 二级域 helper，并新增可复跑的 `npm run audit:architecture` 与 `npm run audit:architecture:strict`。
- 全局规范并非没有生效；近期改动中已有部分文件补了职责说明和测试，但执行不稳定，复杂历史模块被继续扩展时没有同步拆分或补足顶部责任说明。
- 前端原有跨层反向依赖已通过 shared/entities 下沉清零。`theme-provider`、route type、workspace module contract、artifact provenance、run history data logic 已分别迁入 `shared` 或 `entities`，旧入口保留 re-export 兼容。
- API route 层仍直接依赖大量业务和基础设施模块；`apps/api/src/index.ts` 已先拆出 Fastify 基础装配、环境默认值、persistence factory、external adapter factory、启动种子用户逻辑和 route registration helper，admin route 已先下沉 run snapshot 摘要、admin run read/action helper、生成指标、admin metrics read-model helper、admin console/system 展示模型、admin session/RBAC view helper、admin user/project read-model helper、academic/project scope helper、admin academic action helper、admin governance action helper、admin rate-limit action helper、admin provider telemetry helper、admin audit log read-model helper、admin risk event read-model helper、admin presenter helper、高风险权限/audit helper、rate-limit fallback store、provider config healthcheck helper、provider config action helper、admin user/project action helper 和 admin document action helper，且继续把后台用户/项目、学术层级列表、文档、风险事件、审计日志和 provider telemetry 的 response envelope 下沉到对应 helper；projects route 已先下沉 workspace/project/invitation payload 与 settings access helper，runs route 已先下沉 run history 摘要/过滤、project start command 输入解析、provider gate、billing gate、evidence gate、requirement repair helper、run access/metadata helper、project retry/rerun action helper 和项目文档 workspace id helper，documents route 已先下沉 OnlyOffice request/callback 安全 helper、project access helper、audit/risk event helper 和 callback save helper，共享 prompt 包已继续拆出代码生成 prompt helper，contracts 包已继续拆出需求基线、模型/渲染、证据包、代码生成、项目成员、后台管理、run lifecycle 和 render 契约 helper，admin route 剩余下沉重点转为少量 scope 重复计算、后台台账筛选和 route dependency builder。
- 多个核心文件超过 900 行，最大文件超过 6000 行；高内聚低耦合风险主要来自超大状态容器、超大页面组件、超大公共契约和超大测试。
- 300 行以上复杂文件顶部责任说明已补齐；剩余注释问题主要是小文件覆盖不完全，以及超大模块内部仍需通过拆分降低理解成本。

## 关键发现

### P1：前端边界存在反向依赖（已整改）

证据：

- 整改前：`features -> app` 8 处，`services -> features` 2 处，`entities -> workflows` 1 处。
- 整改后：`npm run audit:architecture:strict` 报告 `Frontend upward import counts: none`。
- 具体下沉：`apps/web/src/shared/ui/theme-provider.tsx`、`apps/web/src/shared/lib/app-route-types.ts`、`apps/web/src/entities/workspace/modules.ts`、`apps/web/src/entities/workspace/provenance.ts`、`apps/web/src/entities/run-history/index.ts`。
- 兼容入口：`apps/web/src/app/providers/theme-provider.tsx`、`apps/web/src/app/workspace-modules.ts`、`apps/web/src/features/history/index.ts`、`apps/web/src/workflows/manifest.ts` 保留 re-export 或 type re-export。

影响：

整改后，底层 `services` 和 `entities` 不再感知上层 `features`、`workflows` 或 `app` 细节；feature 侧依赖 shared/entities 契约。

建议：

- 已完成 theme provider shared 化，feature 侧改用 `shared/ui/theme-provider`。
- 已完成 `features/history` 纯数据/存储/Markdown helper 到 `entities/run-history` 的迁移。
- 已完成 `ArtifactProvenance` 到 `entities/workspace/provenance` 的迁移。

### P1：超大核心模块削弱高内聚

代表性文件：

- `apps/api/src/index.test.ts`：约 6738 行。
- `apps/web/src/features/workspace-session/state.tsx`：约 2909 行；workspace 记录套用到各 session slice 的同步契约已迁入 `apps/web/src/features/workspace-session/lib/workspace-record-application.ts`，约 109 行，手动模型保存、结构化重绘、SVG/PlantUML 状态更新和 manual edit status 写入已迁入 `apps/web/src/features/workspace-session/lib/manual-model-edits.ts`，约 240 行，run history 刷新、恢复、删除、清空和保存动作已迁入 `apps/web/src/features/workspace-session/lib/run-history-actions.ts`，约 84 行，需求规则增删改、复核保存、质量提示确认、单条/批量修复和修复候选决策已迁入 `apps/web/src/features/workspace-session/lib/requirement-review-actions.ts`，约 664 行，生成结果/确认弹窗状态、自动上游 review 持久化、generation task 列表动作、workspace 权限加载、billing entitlement block 状态、初始 workspace/history 加载、latest generation input ref、PlantUML 手动渲染动作、workspace 派生状态、requirement/design generation 预检决策、自动上游 review 记录组装、自动补全规则映射合并持久化、run event -> UI state 派生、代码生成 event -> UI state 派生、完成/取消/失败终态 UI/dialog state、run event -> diagnostics 派生、代码生成 diagnostics artifact 派生和本地失败 diagnostics 追加已分别迁入 `generation-dialog-actions.ts`、`auto-generated-upstream-reviews.ts`、`generation-task-actions.ts`、`workspace-permissions.ts`、`billing-generation-block.ts`、`workspace-initialization.ts`、`latest-generation-input.ts`、`plantuml-render-actions.ts`、`workspace-derived-status.ts`、`generation-preflight.ts`、`generation-upstream-reviews.ts`、`auto-completed-rule-mapping-actions.ts`、`run-ui-state.ts` 和 `diagnostics.ts`。
- `apps/web/src/features/requirements/components/text-requirement-page.tsx`：已降至约 876 行，低于 900 行大文件阈值；需求 review 字段标签、状态/tone、字段值、来源标签、自动 review 过滤和修复文案派生已迁入 `apps/web/src/features/requirements/lib/requirement-review-view-model.ts`，约 133 行，目标模型按钮文案、阻断原因、卡片状态和追踪证明记录已迁入 `apps/web/src/features/requirements/lib/requirement-target-view-model.ts`，约 170 行，需求规则表格、分页、状态 badge 和行内编辑已迁入 `apps/web/src/features/requirements/components/requirement-rules-table.tsx`，约 399 行，质量提示/修复确认 dialog、追踪证明 dialog、新建规则 dialog 和助手模板面板已分别迁入 `requirement-review-dialog.tsx`、`requirement-traceability-dialogs.tsx`、`new-requirement-rule-dialog.tsx` 和 `requirement-assistant-panel.tsx`。
- `apps/web/src/features/user-platform/components/user-platform-pages.tsx`：已降至约 896 行，低于 900 行大文件阈值。
- `apps/web/src/features/diagrams/components/diagram-detail-page.tsx`：已降至约 851 行，低于 900 行大文件阈值；模型编辑器主体已迁入 `apps/web/src/features/diagrams/components/model-edit-panel.tsx`，约 472 行，SVG 预览工具栏/画布/概览抽屉已迁入 `apps/web/src/features/diagrams/components/diagram-preview-panel.tsx`，约 445 行，顶部标题/摘要/统计 header 已迁入 `apps/web/src/features/diagrams/components/diagram-detail-header.tsx`，约 139 行，SVG object URL、缩放和 pointer pan 状态已迁入 `apps/web/src/features/diagrams/hooks/use-svg-pan-zoom.ts`，约 117 行。元素字段、关系字段、操作/参数、列表、弹窗和表单控件均已拆出，相关生产文件均低于 900 行阈值。
- `apps/web/src/features/workspace-shell/components/sidebar-menu.tsx`：已降至约 844 行，低于 900 行大文件阈值；侧边栏图状态、子任务聚合、按用例过滤 analysis/sequence 模型和 pending 节点派生已迁入 `apps/web/src/features/workspace-shell/lib/sidebar-menu-model.ts`，约 414 行。
- `apps/web/src/services/workspace-repository/index.tsx`：已降至约 90 行，仅保留公共门面和 React provider；HTTP 实现、公共契约和 mock 实现已分别迁入 `http-repository.ts`、`types.ts` 和 `mock-repository.ts`，均低于 900 行大文件阈值。
- `apps/api/src/routes/admin/register-admin-routes.ts`：约 1244 行。
- `apps/api/src/routes/runs/register-run-routes.ts`：约 1150 行。
- `apps/api/src/routes/documents/register-document-routes.ts`：约 891 行。
- `packages/prompts/src/index.ts`：已降至约 40 行；需求/设计/追踪 prompt 已迁入 `packages/prompts/src/model-prompts.ts`，该文件约 853 行；代码生成 prompt 已迁入 `packages/prompts/src/code-prompts.ts`，该文件约 855 行。
- `packages/contracts/src/index.ts`：已降至约 30 行，仅保留公共 re-export；run request/snapshot/event 已迁入 `packages/contracts/src/runs.ts`，render request/response 已迁入 `packages/contracts/src/render.ts`。

影响：

这些文件仍同时承担状态管理、派生规则、UI 组合、网络交互、兼容转换或测试场景编排，改动成本高，容易出现局部修复引发远端回归。本轮已先完成职责说明和部分边界下沉，但未把所有超大模块一次性拆完。

建议：

- `workspace-session/state.tsx` 已先拆出生成依赖规划、标签和子任务构建到 `features/workspace-session/lib/generation-planning.ts`，拆出 run event 状态派生到 `features/workspace-session/lib/run-events.ts`，拆出生成结果/确认对话框到 `features/workspace-session/components/generation-dialogs.tsx`，拆出需求 review 质量报告和阻塞判断 helper 到 `features/workspace-session/lib/requirement-review.ts`，拆出 workspace 输入指纹、模型作用域、traceability 新鲜度判断和 billing entitlement 解析到 `features/workspace-session/lib/workspace-context.ts`、`features/workspace-session/lib/billing-entitlement.ts`，拆出历史快照恢复计划到 `features/workspace-session/lib/history-restore.ts`，拆出 workspace record -> session slice 套用契约到 `features/workspace-session/lib/workspace-record-application.ts`，并拆出自动补全规则映射合并和持久化动作到 `features/workspace-session/lib/auto-completed-rule-mapping-actions.ts`；后续继续拆大块运行回调和更细粒度 persistence side effects，保留现有 provider 公共接口。
- `diagram-detail-page.tsx` 已先拆出模型草稿编辑 helper 到 `features/diagrams/lib/model-editing.ts`，拆出模型编辑器组件到 `features/diagrams/components/model-edit-panel.tsx`、元素字段编辑器到 `features/diagrams/components/model-element-editor.tsx`、操作/参数编辑器到 `features/diagrams/components/model-operation-editor.tsx`、表单控件到 `features/diagrams/components/model-edit-fields.tsx`、编辑弹窗壳层到 `features/diagrams/components/model-edit-dialogs.tsx`、元素/关系列表到 `features/diagrams/components/model-edit-lists.tsx`、关系字段编辑器到 `features/diagrams/components/model-relation-editor.tsx`、详情派生 helper 到 `features/diagrams/lib/diagram-detail-view-model.ts`、SVG object URL/缩放/pointer pan hook 到 `features/diagrams/hooks/use-svg-pan-zoom.ts`，并拆出 SVG 预览工具栏/画布/概览抽屉到 `features/diagrams/components/diagram-preview-panel.tsx`、顶部标题/摘要/统计 header 到 `features/diagrams/components/diagram-detail-header.tsx`；后续继续拆页面主体的数据准备 hook、移动端元素/关系清单和 trace highlight 规则。
- `traceability-matrix-page.tsx` 已抽出 traceability row derivation、query filtering、group option 和 pagination constants 到 `features/traceability/lib/traceability-rows.ts`；页面文件降至约 513 行，只保留渲染和交互状态。
- `workspace-repository/index.tsx` 已先移除对 `features/history` 的反向依赖，并将 start input factories、project scope/header helper、project history mapping、run payload helper、run subscription adapter、document/evidence API adapter、workspace state/snapshot 合并 helper、run actions API adapter、mock repository、HTTP repository 和公共 repository contract 拆到 `services/workspace-repository/` 下的独立文件；`index.tsx` 现在只保留公共 re-export 和 React provider。
- `apps/api/src/routes/admin/register-admin-routes.ts` 已先抽出 run snapshot 分类、产物摘要、产物条目和 generation breakdown 计算到 `apps/api/src/runs/records/admin-run-summaries.ts`，抽出 admin run list/detail 可见性过滤、排序、详情 DTO 和诊断摘要到 `apps/api/src/admin/admin-run-read-model.ts`，抽出 admin run cancel/retry/rerun 可写性校验、状态冲突、scheduler/pipeline 调用和审计到 `apps/api/src/admin/admin-run-actions.ts`，抽出 admin metrics 日期窗口、生成汇总、模型用量和文档计数 read model 到 `apps/api/src/admin/admin-metrics-view.ts`，抽出角色权限、prompt runtime 初始状态/列表/版本与 system health/config/log/release 展示模型到 `apps/api/src/routes/admin/admin-console-model.ts`，抽出 academic organization/course/class/team、project 和 visible user scope 判断到 `apps/api/src/admin/academic-scope.ts`，抽出 admin 学术组织/课程/班级/团队/成员/配额动作到 `apps/api/src/admin/admin-academic-actions.ts`，抽出 prompt runtime 状态变更和高危角色权限复核动作到 `apps/api/src/admin/admin-governance-actions.ts`，抽出 rate-limit policy 创建/更新动作到 `apps/api/src/admin/admin-rate-limit-actions.ts`，抽出 provider usage/quota 与 rate-limit list read model/envelope 到 `apps/api/src/admin/admin-provider-telemetry.ts`，抽出 audit log 数据范围过滤、provider audit log DTO 映射和 response envelope 到 `apps/api/src/admin/admin-audit-log-view.ts`，抽出 risk event read model/envelope 到 `apps/api/src/admin/admin-risk-events-view.ts`，抽出 admin console DTO/presenter helper 到 `apps/api/src/admin/admin-route-presenters.ts`，抽出高风险权限/audit helper 到 `apps/api/src/admin/admin-route-security.ts` 与 rate-limit tracker/fallback store 选择到 `apps/api/src/provider-configs/fallback-rate-limit-policy-store.ts`，抽出 provider config healthcheck 到 `apps/api/src/provider-configs/admin-provider-config-test.ts`，抽出 provider config mutation action 到 `apps/api/src/admin/admin-provider-config-actions.ts`，抽出 admin user/project action 到 `apps/api/src/admin/admin-user-project-actions.ts`，并抽出 admin document action helper、document project scope 派生和文档列表 response envelope 到 `apps/api/src/admin/admin-document-actions.ts`。
- `apps/api/src/routes/runs/register-run-routes.ts` 已先抽出 run history 查询值、snapshot model、状态展示、run kind 推断、列表摘要和过滤到 `apps/api/src/runs/records/run-record-summaries.ts`，抽出 project start command 输入解析到 `apps/api/src/routes/runs/run-input-resolution.ts`，抽出 provider config resolution、rate-limit gate 和 usage accounting 到 `apps/api/src/runs/providers/run-provider-gates.ts`，抽出 billing reservation 到 `apps/api/src/runs/billing/run-billing-gates.ts`，抽出 evidence package storage 和 unresolved-review gate 到 `apps/api/src/runs/evidence/run-evidence-gates.ts`，抽出 requirement rule repair prompt/解析/应用到 `apps/api/src/runs/repairs/requirement-rule-repair.ts`，抽出 run access/metadata 边界到 `apps/api/src/routes/runs/run-access.ts`，并抽出 retry/rerun 业务编排到 `apps/api/src/runs/actions/project-run-actions.ts`。
- `apps/api/src/routes/documents/register-document-routes.ts` 已先抽出 OnlyOffice public base URL、callback payload、access token secret、download URL allowlist、callback body size 和 response content-length helper 到 `apps/api/src/documents/onlyoffice/request-security.ts`，抽出项目访问鉴权到 `apps/api/src/routes/documents/document-project-access.ts`，抽出审计/风险事件包装到 `apps/api/src/routes/documents/document-audit-events.ts`，并抽出 OnlyOffice callback 保存下载、大小校验、持久化和审计事件到 `apps/api/src/routes/documents/document-onlyoffice-callback.ts`。
- `apps/api/src/adapters/llm/response-formats/requirements-response-formats.ts` 已抽出大型 diagram model response schema 到 `apps/api/src/adapters/llm/response-formats/requirement-model-response-format.ts`；原文件降至约 98 行，新 schema 文件约 873 行，均低于 900 行阈值，公共 re-export 保持不变。
- `apps/api/src/adapters/llm/response-formats/code-response-formats.ts` 已抽出大型 code generation response schema 到 `apps/api/src/adapters/llm/response-formats/code-response-format-schemas.ts`；原文件降至约 104 行，新 schema 文件约 839 行，公共 re-export 保持不变，并补充 selector/re-export smoke test。
- API route 大文件只保留 schema、权限入口和 endpoint 注册；业务编排放入 service/pipeline，持久化细节通过注入端口进入。
- `contracts` 已先抽出 admin RBAC schema/常量到 `packages/contracts/src/admin-rbac.ts`，抽出 auth/account schema 到 `packages/contracts/src/auth-account.ts`，抽出 billing schema/DTO 到 `packages/contracts/src/billing.ts`，抽出 document library/style/content schema 到 `packages/contracts/src/documents.ts`，抽出 provider config schema/DTO 到 `packages/contracts/src/provider-configs.ts`，抽出 system notice schema/DTO 到 `packages/contracts/src/system-notices.ts`，抽出 workspace fingerprint helper 到 `packages/contracts/src/fingerprints.ts`，并继续抽出需求、覆盖、追踪和图类型契约到 `packages/contracts/src/requirements.ts`、模型/PlantUML/SVG 契约到 `packages/contracts/src/models.ts`、证据包契约到 `packages/contracts/src/evidence.ts`、code generation schema 到 `packages/contracts/src/code-generation.ts`、项目/成员/邀请契约到 `packages/contracts/src/projects.ts`、后台管理平台 DTO 到 `packages/contracts/src/admin-platform.ts`、run lifecycle 契约到 `packages/contracts/src/runs.ts`、render 契约到 `packages/contracts/src/render.ts`；`prompts` 已抽出 document/PlantUML prompt 到 `packages/prompts/src/document-prompts.ts`、代码生成 prompt 到 `packages/prompts/src/code-prompts.ts`，并继续抽出需求/设计/追踪 prompt 到 `packages/prompts/src/model-prompts.ts`，继续由 `src/index.ts` 统一导出，避免破坏公共包接口。

### P1：API route 层职责偏重

证据：

`routes` 直接依赖范围较广：

- `routes -> auth` 20 处。
- `routes -> runs` 16 处。
- `routes -> adapters` 8 处。
- `routes -> provider-configs` 8 处。
- `routes -> security` 6 处。
- `routes -> documents` 8 处。
- `routes -> admin` 17 处。
- `routes -> projects` 2 处。
- `routes -> model-capabilities` 1 处。
- `routes -> db`、`billing`、`generation`、`mail` 等也有直接依赖。

影响：

AGENTS 要求 route 只注册 endpoint、解析 schema、调用 pipeline 或 adapter。当前 route 层承担的依赖过多，容易把权限、仓储、模型能力、响应格式和业务编排混在一起。

建议：

- 为 admin、runs、documents 三类 route 先建立 domain service 或 route dependency builder。
- route 文件保留请求解析、响应映射和调用边界；复杂查询、组合 DTO、权限规则、run lifecycle 决策下沉。
- `apps/api/src/runs/records/admin-run-summaries.ts` 已承接 admin run artifact DTO、生成任务分类、耗时统计和 generation breakdown，保持 HTTP 响应结构不变。
- `apps/api/src/admin/admin-run-read-model.ts` 已承接 admin run list/detail 可见性过滤、排序、详情 DTO 和诊断摘要，route 保留权限入口、路径参数读取和 HTTP status/body 映射。
- `apps/api/src/admin/admin-run-actions.ts` 已承接 admin run cancel/retry/rerun 可写性校验、状态冲突、scheduler/pipeline 调用和审计动作，route 保留写权限入口、路径参数读取和 HTTP status/body 映射。
- `apps/api/src/routes/admin/admin-console-model.ts` 已承接 admin console 角色权限、prompt runtime 初始状态/列表/版本 read model、system health/config/log/release 展示模型，保持现有 admin console HTTP 响应不变。
- `apps/api/src/admin/admin-metrics-view.ts` 已承接 admin metrics 日期窗口校验、生成汇总、模型用量和文档计数 read model，route 保留权限入口、查询参数读取和 HTTP 400 映射。
- `apps/api/src/admin/academic-scope.ts` 已承接 admin 学术组织、课程、班级、团队、项目和可见用户的数据范围判断，保持现有 admin scope 过滤行为不变。
- `apps/api/src/admin/admin-academic-actions.ts` 已承接 admin 学术组织、课程、班级、团队、成员和配额的可见性列表、读取、创建前置校验和创建动作，route 保留权限入口、schema parse、路径参数读取和 HTTP status/body 映射。
- `apps/api/src/admin/admin-governance-actions.ts` 已承接 prompt runtime 状态变更和高危角色权限复核的审计动作，route 保留高风险权限入口、路径参数读取和 HTTP status/body 映射。
- `apps/api/src/admin/admin-rate-limit-actions.ts` 已承接 rate-limit policy 创建、更新、缺失响应和审计动作，route 保留高风险权限入口、schema parse、路径参数读取和 HTTP status/body 映射。
- `apps/api/src/admin/admin-provider-telemetry.ts` 已承接 rate-limit policy list、provider usage 和 provider quota DTO 组装，route 保留权限入口、generatedAt 和 response schema parse。
- `apps/api/src/admin/admin-audit-log-view.ts` 已承接 audit log 数据范围过滤和 provider audit log DTO 映射，route 保留权限入口和 response envelope。
- `apps/api/src/admin/admin-risk-events-view.ts` 已承接 risk event read model、response envelope 和 `AdminRiskEvent` 类型，route 保留权限入口。
- `apps/api/src/admin/admin-session-view.ts` 已承接 admin session/RBAC 响应投影和 scoped admin actor 构造，route 保留 endpoint 注册和 authStore 注入。
- `apps/api/src/admin/admin-user-project-read-model.ts` 已承接 admin 用户列表、用户登录记录和项目列表 read model，route 保留权限入口、路径参数读取和 response envelope。
- `apps/api/src/admin/admin-document-actions.ts` 已承接 admin 文档列表可见性、下载审计、文件缺失处理和恢复审计，route 保留权限入口、路径参数读取和 HTTP 响应映射。
- `apps/api/src/projects/project-route-payloads.ts` 和 `apps/api/src/projects/project-settings-access.ts` 已承接 project route 的 workspace/project/invitation payload 与 settings 权限上下文，`routes/projects/register-project-routes.ts` 降至 900 行阈值以下。
- `apps/api/src/runs/records/run-record-summaries.ts` 已承接 project run history 的摘要和过滤映射，保持 run history、run detail 和 includeEvents 查询行为不变。
- `apps/api/src/documents/onlyoffice/request-security.ts` 已承接 OnlyOffice request/callback 安全判断，保持 editor config、file token、callback download allowlist 和 oversized callback 响应不变。
- `apps/api/src/routes/documents/document-onlyoffice-callback.ts` 已承接 OnlyOffice callback 保存下载、Content-Length 与实际 buffer 大小双重限制、文档 buffer 更新、成功审计和失败风险事件，route 继续只保留 token、文档和项目权限入口。
- `apps/api/src/index.ts` 已先抽出 `server/defaults.ts`、`server/fastify-app.ts`、`server/bootstrap-users.ts`、`server/register-routes.ts`、`server/persistence.ts`、`server/external-adapters.ts`，保持 `createApiServer` 兼容。

### P2：全局规范执行不稳定

证据：

- [AGENTS.md](../AGENTS.md) 在 2026-05-19 已存在。
- 2026-06-11 的提交中，`traceability-normalizer.ts`、`design-pipeline.ts`、E2E spec 等文件有顶部职责说明，说明规范有被执行。
- 整改前同期触达或继续扩展的复杂文件，如 `diagram-detail-page.tsx`、`sidebar-menu.tsx`、`workspace-repository/index.tsx`、`workspace-session/state.tsx`，仍缺少顶部总体说明。

影响：

问题不是“没有全局规范”，而是规范没有机械化门禁，复杂文件在后续迭代中容易延续历史债务。

建议：

- 增加轻量审查脚本或 lint 约束，至少检查复杂源码文件是否有顶部职责说明。
- 对跨层导入增加 allowlist 式扫描，先以 CI warning 或本地脚本形式运行，稳定后再升级为失败门禁。
- PR 模板或提交检查中明确“是否触达超大模块、是否新增跨层依赖、是否补充核心注释”。

### P2：注释覆盖不足，复杂文件缺少入口说明

统计结果（来自 `npm run audit:architecture:strict`）：

- 排除外部/生成路径后共扫描 472 个源码/测试/脚本文件。
- `apps/api`：207 个文件有顶部说明或指令，5 个没有。
- `apps/web`：176 个文件有顶部说明或指令，50 个没有。
- `packages/contracts`、`packages/prompts` 的主入口、新拆内部文件、大型测试入口和 public export 测试入口均已补顶部责任说明；`packages/contracts` 顶部责任说明计数已增至 18，`packages/prompts` 顶部责任说明计数已增至 6。
- 300 行以上且缺少顶部责任说明的复杂文件为 0。

第一阶段已补充顶部责任说明的对象包括：

- `apps/web/src/features/workspace-session/state.tsx`
- `apps/web/src/features/diagrams/components/diagram-detail-page.tsx`
- `apps/web/src/services/workspace-repository/index.tsx`
- `apps/web/src/features/workspace-shell/components/sidebar-menu.tsx`
- `apps/api/src/plantuml.ts`
- `apps/api/src/code-skills.ts`
- `packages/contracts/src/index.ts`
- `packages/prompts/src/index.ts`
- `apps/web/src/features/requirements/components/text-requirement-page.tsx`
- `apps/web/src/features/workspace-shell/components/top-bar.tsx`
- `apps/api/src/index.ts`
- `apps/api/src/llm.ts`
- `apps/render-service/src/index.ts`
- 所有 300 行以上大型测试入口。

建议：

按实用规范补注释，不做机械式逐文件灌注释。优先给复杂文件补 1 到 3 行顶部责任说明，并在 run lifecycle、SSE terminal close、LLM/PlantUML repair loop、DOCX assembly、route -> pipeline -> record store 合同处补边界注释。

### P2：共享包公共入口过度集中

证据：

- `packages/contracts/src/index.ts` 约 30 行，仅作为公共 re-export 入口；`packages/contracts/src/runs.ts` 约 750 行，承接 run request、repair request、snapshot、event 和 action schema；`packages/contracts/src/render.ts` 约 43 行，承接 render request/response schema；`packages/contracts/src/models.ts` 约 848 行，承接 UML model、test generation、PlantUML、SVG 和 design traceability helper；`packages/contracts/src/code-generation.ts` 约 692 行，承接 code generation schema；`packages/contracts/src/admin-platform.ts` 约 497 行，承接 admin user、rate limit、provider usage/quota、organization/class/team/membership/quota 和 audit log DTO；`packages/contracts/src/requirements.ts` 约 326 行，承接 diagram kind、requirement baseline、coverage matrix 和 traceability matrix schema；`packages/contracts/src/projects.ts` 约 267 行，承接 project、member、invitation schema；`packages/contracts/src/auth-account.ts` 约 227 行，承接 user/session/auth/account/MFA/security schema；`packages/contracts/src/fingerprints.ts` 约 141 行，承接 workspace requirement/design input fingerprint helper；`packages/contracts/src/documents.ts` 约 122 行，承接 document library、OnlyOffice config、document style 和 content section schema；`packages/contracts/src/billing.ts` 约 118 行，承接 billing request/response、SKU、订单和 entitlement schema；`packages/contracts/src/evidence.ts` 约 113 行，承接 evidence package、review item、browser evidence 和 repair/failure record schema；`packages/contracts/src/provider-configs.ts` 约 105 行，承接 provider setting、provider config DTO、risk state 和 test response schema；`packages/contracts/src/system-notices.ts` 约 98 行，承接 system notice 内容、列表、创建、更新和已读请求 schema。
- `packages/prompts/src/index.ts` 已降至约 40 行，仅作为公共 re-export 入口；`packages/prompts/src/model-prompts.ts` 约 853 行，承接需求、设计、模型和追踪 prompt builder；`packages/prompts/src/code-prompts.ts` 约 855 行，承接 Sandpack 原型规划、文件操作、修复和 UI fidelity 检查 prompt。

影响：

共享包是全仓耦合中心，过度集中会让 schema 变更影响面不透明，也使 prompt 逻辑难以按需求、设计、代码、文档阶段独立演进。

建议：

- `contracts` 内部按 `requirements`、`design`、`runs`、`documents`、`billing/provider-configs` 拆文件。
- `prompts` 内部按阶段拆 builder，并保留 `src/index.ts` 统一导出。
- 拆分前先加针对 public exports 的 type-level 或 snapshot 测试，避免破坏消费者。
- 已先完成 `contracts/admin-platform.ts`、`contracts/admin-rbac.ts`、`contracts/auth-account.ts`、`contracts/billing.ts`、`contracts/code-generation.ts`、`contracts/documents.ts`、`contracts/evidence.ts`、`contracts/fingerprints.ts`、`contracts/models.ts`、`contracts/projects.ts`、`contracts/provider-configs.ts`、`contracts/render.ts`、`contracts/requirements.ts`、`contracts/runs.ts`、`contracts/system-notices.ts`、`prompts/document-prompts.ts`、`prompts/code-prompts.ts` 与 `prompts/model-prompts.ts` 十八个低风险内部拆分，后续继续拆前端/API 大文件和共享包内部高内聚 helper。

### P3：自动化边界约束缺失

证据：

`apps/web/eslint.config.js` 当前只启用 JS/TS 推荐和 React Hooks 规则，没有 import boundary 规则。第一阶段已新增 `scripts/audit/architecture-boundaries.mjs`、根命令 `npm run audit:architecture` 与 `npm run audit:architecture:strict`。Strict 模式会对前端向上导入和 300 行以上复杂文件缺顶部说明失败退出。

影响：

AGENTS 只能作为协作规范，不能阻止后续提交继续引入跨层依赖、复杂文件缺注释或生成产物误入源码审查。

建议：

- 继续维护 `scripts/audit/architecture-boundaries.mjs` 的排除列表和输出格式，输出前端层级矩阵、API route 依赖矩阵、超大文件和复杂文件头说明缺失。
- `audit:architecture:strict` 已可作为 CI 门禁候选；当前不阻断 API route 既有依赖债务和超大文件，只阻断本轮已清零的两类问题。
- 对外部路径维护统一排除列表，避免误报上游项目和供应商资产。

## 第一阶段整改记录

已完成：

- 消除前端反向依赖：从 `features -> app` 8、`services -> features` 2、`entities -> workflows` 1 降为 0。
- 补充全部 300 行以上复杂文件顶部责任说明，`Complex files missing top notes: 0`。
- 新增 `scripts/audit/architecture-boundaries.mjs`，按统一排除列表扫描项目自有源码，输出顶部说明覆盖、超大文件、前端向上导入和 API route 依赖统计。
- 在根 `package.json` 新增 `audit:architecture` 和 `audit:architecture:strict`。
- 抽出 API server 基础装配：`server/defaults.ts`、`server/fastify-app.ts`、`server/bootstrap-users.ts`、`server/register-routes.ts`、`server/persistence.ts`、`server/external-adapters.ts`；`apps/api/src/index.ts` 保留健康/版本 payload 和启动兼容，约 176 行。
- 抽出 admin run summary helper：`runs/records/admin-run-summaries.ts` 承接 run snapshot 分类、后台产物摘要/条目、上海时区日期窗口、耗时统计和 generation breakdown。
- 抽出 admin console model helper：`routes/admin/admin-console-model.ts` 承接角色权限、prompt runtime 初始状态、system config/log/release 展示模型；`routes/admin/register-admin-routes.ts` 从约 3372 行降到约 2648 行。
- 抽出 admin academic scope helper：`admin/academic-scope.ts` 承接 organization/course/class/team 可见性、项目数据范围和可见用户集合计算；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 2461 行。
- 抽出 admin presenter helper：`admin/admin-route-presenters.ts` 承接 admin 用户 DTO、指标卡片、模型调用量聚合、run DTO、组织单位展示和 provider quota fallback；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 2282 行。
- 抽出 admin security/rate-limit fallback helper：`admin/admin-route-security.ts` 承接高风险 admin 角色校验、审计记录封装和撤销用户活跃会话，`provider-configs/fallback-rate-limit-policy-store.ts` 承接无 tracker persistence 时的内存 rate-limit policy store；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 2182 行。
- 抽出 admin provider config healthcheck helper：`provider-configs/admin-provider-config-test.ts` 承接 provider allowlist/status/breaker/secret/model 校验、provider test rate limit、healthcheck response format、外部 provider fetch、breaker failure 记录和 usage accounting；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 2070 行，并移除 route 对 `adapters/llm/response-formats` 和 `model-capabilities` 的直接依赖。
- 抽出 admin document action helper：`admin/admin-document-actions.ts` 承接 admin 文档列表可见性、下载审计、文件缺失响应和恢复审计；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1995 行，route 保留权限入口和 HTTP 响应映射。
- 抽出 admin provider config action helper：`admin/admin-provider-config-actions.ts` 承接 provider config 创建、更新、密钥轮换、撤销、启用/禁用、breaker 重置、scope 存在性校验和审计记录；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1895 行，route 保留权限入口、schema parse 和 HTTP status/body 映射。
- 抽出 admin user/project action helper：`admin/admin-user-project-actions.ts` 承接禁用用户、强制登出、重置 MFA、冻结项目、scope 可见性校验、会话撤销和审计记录；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1765 行，route 保留高风险权限入口、路径参数读取和 HTTP status/body 映射。
- 抽出 admin academic action helper：`admin/admin-academic-actions.ts` 承接组织、课程、班级、团队、组织成员和配额的 scope 可见性列表、读取、创建前置校验和创建动作；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1704 行，route 保留权限入口、schema parse、路径参数读取和 HTTP status/body 映射。
- 抽出 admin governance action helper：`admin/admin-governance-actions.ts` 承接 prompt runtime submit/approve/rollback/disable 状态变更和高危角色权限复核审计动作；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1683 行，route 保留高风险权限入口、路径参数读取和 HTTP status/body 映射。
- 抽出 admin rate-limit action helper：`admin/admin-rate-limit-actions.ts` 承接 rate-limit policy 创建、更新、缺失响应和审计动作；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1671 行，route 保留高风险权限入口、schema parse、路径参数读取和 HTTP status/body 映射。
- 抽出 admin provider telemetry read-model helper：`admin/admin-provider-telemetry.ts` 承接 rate-limit policy list、provider usage 和 provider quota DTO 组装；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1662 行，route 保留权限入口、generatedAt 和 response schema parse。
- 抽出 admin audit log read-model helper：`admin/admin-audit-log-view.ts` 承接 audit log 数据范围过滤和 provider audit log DTO 映射；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1640 行，route 保留权限入口、generatedAt 和 response envelope。
- 扩展 admin console model helper：`routes/admin/admin-console-model.ts` 承接 system health services 展示模型；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1638 行，route 保留权限入口、generatedAt 和 response envelope。
- 抽出 admin metrics read-model helper：`admin/admin-metrics-view.ts` 承接日期窗口校验、生成记录汇总、模型用量、文档计数和 generation breakdown 组装；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1558 行，route 保留权限入口、查询参数读取和 HTTP 400 映射。
- 抽出 admin run read-model helper：`admin/admin-run-read-model.ts` 承接 run list/detail 可见性过滤、排序、详情 DTO 和诊断摘要；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1486 行，route 保留权限入口、路径参数读取和 HTTP status/body 映射。
- 抽出 admin run action helper：`admin/admin-run-actions.ts` 承接 run cancel/retry/rerun 可写性校验、状态冲突、scheduler/pipeline 调用和审计动作；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1390 行，route 保留写权限入口、路径参数读取和 HTTP status/body 映射。
- 抽出 admin risk event read-model helper：`admin/admin-risk-events-view.ts` 承接 `AdminRiskEvent` 类型和 risk event read model；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1386 行，route 保留权限入口、generatedAt 和 response envelope。
- 抽出 admin session/RBAC view helper：`admin/admin-session-view.ts` 承接 admin session 响应投影和 scoped admin actor 构造；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1322 行，route 保留 endpoint 注册、HTTP reply 传递和 authStore 注入。
- 抽出 admin user/project read-model helper：`admin/admin-user-project-read-model.ts` 承接用户列表、用户登录记录和项目列表可见性过滤及 DTO 映射；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1318 行，route 保留权限入口、路径参数读取、generatedAt 和 HTTP status/body 映射。
- 扩展 admin document action helper：`admin/admin-document-actions.ts` 承接 document project scope 派生，复用文档列表和下载的可见项目集合计算；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1313 行，route 保留权限入口、路径参数读取和 response envelope/header 映射。
- 扩展 rate-limit fallback store helper：`provider-configs/fallback-rate-limit-policy-store.ts` 承接 provider usage tracker 与内存 fallback store 的选择装配；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1303 行，route 保留 provider usage tracker 注入和 rate-limit store 使用边界。
- 扩展 admin console model helper：`routes/admin/admin-console-model.ts` 承接 prompt runtime list/version read model；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1288 行，route 保留权限入口、路径参数读取和 HTTP status/body 映射。
- 扩展 admin console model helper：`routes/admin/admin-console-model.ts` 承接角色权限和 system health/config/log/release response envelope；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1273 行，route 保留权限入口和 endpoint 注册边界。
- 扩展 admin 文档/风险/审计/telemetry read-model helper：`admin/admin-document-actions.ts`、`admin/admin-risk-events-view.ts`、`admin/admin-audit-log-view.ts` 和 `admin/admin-provider-telemetry.ts` 承接对应列表 response envelope；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1261 行，route 保留权限入口、response schema parse 和 endpoint 注册边界。
- 扩展 admin academic 与 user/project read-model helper：`admin/admin-academic-actions.ts` 承接组织、课程、班级、团队、成员和配额列表 response envelope，`admin/admin-user-project-read-model.ts` 承接用户/项目列表 response envelope；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1249 行，route 保留权限入口、response schema parse 和 endpoint 注册边界。
- 扩展 admin run/provider read-model helper：`admin/admin-run-read-model.ts` 承接 run list response envelope，`admin/admin-provider-telemetry.ts` 承接 provider config list response envelope；`routes/admin/register-admin-routes.ts` 降到 strict 扫描中的约 1244 行，route 保留权限入口和 endpoint 注册边界，route 内已无裸 `generatedAt` response envelope 组装。
- 抽出 projects route payload/settings helper：`projects/project-route-payloads.ts` 承接 workspace 默认状态、workspace payload、项目/邀请 DTO 和成员预览映射，`projects/project-settings-access.ts` 承接项目 settings 权限上下文；`routes/projects/register-project-routes.ts` 降到约 876 行。
- 抽出 requirement model response schema helper：`adapters/llm/response-formats/requirement-model-response-format.ts` 承接大型 diagram model JSON schema 和 model element ref schema；`requirements-response-formats.ts` 保留 traceability schema、selector 函数和公共 re-export，降到约 98 行。
- 抽出 code generation response schema helper：`adapters/llm/response-formats/code-response-format-schemas.ts` 承接 code generation spec、file bundle、business logic、skill discovery、UI IR、file plan、agent plan 和 file operations response schema；`code-response-formats.ts` 保留 selector 函数和公共 re-export，降到约 104 行。
- 抽出 run record summary helper：`runs/records/run-record-summaries.ts` 承接 run history 查询、snapshot model、状态展示、run kind、摘要和过滤；`routes/runs/register-run-routes.ts` 降到约 2456 行。
- 抽出 runs route project start command 输入解析 helper：`routes/runs/run-input-resolution.ts` 承接项目 workspace state 到 requirement/design/code/document start request 的补全、兼容 legacy payload 和 design replacing context 过滤；`routes/runs/register-run-routes.ts` 降到约 2132 行。
- 抽出 runs provider gate helper：`runs/providers/run-provider-gates.ts` 承接 managed provider config 解析、project default provider 回退、provider rate limit、guest generation limit、provider/generation usage 记录以及 retry/rerun 的 provider metadata 复用；`routes/runs/register-run-routes.ts` 降到约 1866 行。
- 抽出 runs evidence gate helper：`runs/evidence/run-evidence-gates.ts` 承接 evidence package 存储、review decision 合并和 unresolved-review 下游阻断；`routes/runs/register-run-routes.ts` 降到约 1825 行。
- 抽出 runs billing gate helper：`runs/billing/run-billing-gates.ts` 承接 run usage reservation 前置检查；公共 HTTP 行为和 billing service 调用顺序保持不变。
- 抽出 requirement rule repair helper：`runs/repairs/requirement-rule-repair.ts` 承接单条/批量 requirement repair prompt 构建、模型输出 JSON 解析、字段归一化、baseline quality report 重建和候选/失败结果组装；`routes/runs/register-run-routes.ts` 降到约 1404 行，并移除 route 对 `normalizers/json` 的直接依赖。
- 抽出 runs access helper：`routes/runs/run-access.ts` 承接 run access context、默认 header guard、project permission check、start run metadata assembly 和 record read guard；`register-run-routes.ts` 继续 re-export `RunAccessContext`/`RunAccessGuard` 兼容既有 server assembly 与 route tests，文件降到约 1225 行。
- 抽出 project run action helper：`runs/actions/project-run-actions.ts` 承接已授权后的 retry/rerun source 校验、provider/generation/billing gate、queued copy 创建和 pipeline restart；`register-run-routes.ts` 只保留项目权限入口和 endpoint 注册，文件降到约 1150 行。
- 抽出 project document workspace helper：`documents/library/project-document-workspace.ts` 统一 run route 下载回退和 run record pipeline 的项目文档 workspace id 命名。
- 抽出 OnlyOffice request security helper：`documents/onlyoffice/request-security.ts` 承接 public base URL、callback payload、token secret、download URL allowlist、callback size 和 content-length helper；`routes/documents/register-document-routes.ts` 降到约 1224 行。
- 抽出 documents project access helper：`routes/documents/document-project-access.ts` 承接项目路径凭据、项目成员校验、document/project 所属关系和 OnlyOffice access token 项目上下文校验；`routes/documents/register-document-routes.ts` 降到约 1083 行。
- 抽出 documents audit/risk event helper：`routes/documents/document-audit-events.ts` 承接 document audit/risk recorder payload 包装和 best-effort audit failure logging；`DocumentAuditLogRecorder` 与 `DocumentRiskEventRecorder` 继续由原 route 模块 re-export 兼容。
- 抽出 documents OnlyOffice callback save helper：`routes/documents/document-onlyoffice-callback.ts` 承接 callback payload 解析后的保存下载、URL origin allowlist、Content-Length 与实际 buffer 大小校验、document buffer 更新、成功审计和失败风险事件；`routes/documents/register-document-routes.ts` 降到约 891 行。
- 抽出 prompts document/PlantUML helper：`packages/prompts/src/document-prompts.ts` 承接文档正文生成、文档正文修复和 PlantUML 修复 prompt。
- 抽出 prompts code generation helper：`packages/prompts/src/code-prompts.ts` 承接 Sandpack 原型规划、文件操作、修复、skill 资源规划和 UI fidelity 检查 prompt；`packages/prompts/src/index.ts` 降到约 837 行，公共导出保持兼容。
- 抽出 prompts model helper：`packages/prompts/src/model-prompts.ts` 承接需求抽取、需求模型、需求分析、需求追踪、设计模型和设计追踪 prompt；`packages/prompts/src/index.ts` 降到约 40 行，仅保留公共 re-export，公共导出保持兼容。
- 抽出 contracts admin RBAC helper：`packages/contracts/src/admin-rbac.ts` 承接 admin role、permission、data scope、capability schema 和 role mapping。
- 抽出 contracts auth/account helper：`packages/contracts/src/auth-account.ts` 承接 user/session/auth/account/MFA/security schema，`packages/contracts/src/index.ts` 仅保留 `userDtoSchema` 内部 import 供后续 admin user DTO 组装。
- 抽出 contracts billing helper：`packages/contracts/src/billing.ts` 承接 billing request/response、SKU、订单和 entitlement schema。
- 抽出 contracts document helper：`packages/contracts/src/documents.ts` 承接 document library、OnlyOffice config、document style 和 content section schema。
- 抽出 contracts provider config helper：`packages/contracts/src/provider-configs.ts` 承接 provider setting、provider config DTO、risk state 和 test response schema。
- 抽出 contracts system notice helper：`packages/contracts/src/system-notices.ts` 承接 system notice 内容、列表、创建、更新和已读请求 schema。
- 抽出 contracts fingerprint helper：`packages/contracts/src/fingerprints.ts` 承接 workspace requirement/design input fingerprint helper。
- 抽出 contracts code generation helper：`packages/contracts/src/code-generation.ts` 承接代码生成 spec、UI IR、skill、file operation、质量诊断和业务断言 schema。
- 抽出 contracts projects helper：`packages/contracts/src/projects.ts` 承接 project、member、role permission 和 invitation schema；`packages/contracts/src/index.ts` 降到约 2562 行，公共导出保持兼容。
- 抽出 contracts admin platform helper：`packages/contracts/src/admin-platform.ts` 承接 admin user、rate limit、provider usage/quota、school/course/class/team、membership、quota 和 audit log DTO；该步后 `packages/contracts/src/index.ts` 降到约 2078 行，公共导出保持兼容。
- 抽出 contracts requirements helper：`packages/contracts/src/requirements.ts` 承接 diagram kind、需求规则、需求基线、覆盖矩阵和追踪矩阵 schema；`packages/contracts/src/index.ts` 降到约 1770 行，公共导出保持兼容。
- 抽出 contracts models helper：`packages/contracts/src/models.ts` 承接 UML model、test generation、PlantUML、SVG 和 design traceability helper；`packages/contracts/src/index.ts` 降到约 921 行，公共导出保持兼容。
- 抽出 contracts evidence helper：`packages/contracts/src/evidence.ts` 承接 evidence package、review item、browser evidence、failure 和 repair record schema；`packages/contracts/src/index.ts` 降到约 819 行，低于 900 行大文件阈值，公共导出保持兼容。
- 抽出 contracts run lifecycle helper：`packages/contracts/src/runs.ts` 承接 run request、repair request、snapshot、event 和 action schema；`packages/contracts/src/index.ts` 降到约 30 行，仅保留公共 re-export，公共导出保持兼容。
- 抽出 contracts render helper：`packages/contracts/src/render.ts` 承接 SVG、PNG 和 structured model render request/response schema，公共导出保持兼容。
- 抽出 workspace repository 的 start input factories：`services/workspace-repository/start-inputs.ts`，保留 `services/workspace-repository` 公共 re-export。
- 抽出 workspace repository 的项目作用域与历史映射 helper：`services/workspace-repository/project-scope.ts`、`services/workspace-repository/project-history.ts`。
- 抽出 workspace repository 的 run payload 过滤与 snapshot 错误消息 helper：`services/workspace-repository/run-payload.ts`。
- 抽出 workspace repository 的 run snapshot 读取、SSE 订阅和轮询 fallback helper：`services/workspace-repository/run-subscriptions.ts`。
- 抽出 workspace repository 的 document/evidence API adapter：`services/workspace-repository/document-api.ts` 承接证据包读取、复核决策、文档列表/下载、OnlyOffice 配置和文档文件名；`index.tsx` 降至 strict 扫描中的约 2630 行。
- 抽出 workspace repository 的 workspace state/snapshot 合并 helper：`services/workspace-repository/workspace-state.ts` 承接空工作区构建、usecase scoped 清理、run snapshot 合并、restore snapshot 和 stable state 输出；`index.tsx` 降至 strict 扫描中的约 1756 行，新 helper 约 890 行，低于 900 行大文件阈值。
- 抽出 workspace repository 的 run actions API adapter：`services/workspace-repository/run-actions-api.ts` 承接需求修复、run/design/code/document 启动、PlantUML/structured model render 和 provider test 请求；`index.tsx` 降至 strict 扫描中的约 1657 行。
- 抽出 workspace repository 的 mock repository：`services/workspace-repository/mock-repository.ts` 承接测试和本地流程使用的内存 workspace repository，公共 `createMockWorkspaceRepository` 继续由 `services/workspace-repository/index.tsx` re-export；`index.tsx` 降至约 877 行，新 mock 文件约 805 行，均低于 900 行大文件阈值。
- 抽出 workspace repository 的公共契约和 HTTP repository：`services/workspace-repository/types.ts` 承接 `WorkspaceRepository` contract，`services/workspace-repository/http-repository.ts` 承接浏览器 HTTP/project workspace persistence adapter；`index.tsx` 只保留公共 re-export、默认 HTTP repository 选择和 React context provider，公共导入路径保持兼容。
- 抽出 workspace session 的生成规划 helper：`features/workspace-session/lib/generation-planning.ts`。
- 抽出 workspace session 的 run event 派生 helper：`features/workspace-session/lib/run-events.ts`。
- 抽出 workspace session 的生成结果/确认对话框组件：`features/workspace-session/components/generation-dialogs.tsx`。
- 抽出 workspace session 的需求 review 质量报告、阻塞规则和候选合并 helper：`features/workspace-session/lib/requirement-review.ts`。
- 抽出 workspace session 的输入指纹、模型作用域、traceability 完整性和新鲜度判断 helper：`features/workspace-session/lib/workspace-context.ts`。
- 抽出 workspace session 的 billing entitlement API 错误解析和对话框文案 helper：`features/workspace-session/lib/billing-entitlement.ts`。
- 抽出 workspace session 的历史快照恢复计划 helper：`features/workspace-session/lib/history-restore.ts`。
- 抽出 workspace session 的 workspace record application helper：`features/workspace-session/lib/workspace-record-application.ts` 承接 repository workspace record 到 requirement、diagram、design、code、run UI slice 的字段套用契约；抽出 `features/workspace-session/lib/manual-model-edits.ts` 承接手动模型保存、结构化重绘、SVG/PlantUML 状态更新和 manual edit status 写入；抽出 `features/workspace-session/lib/run-history-actions.ts` 承接历史列表刷新、恢复、删除、清空和保存快照；抽出 `features/workspace-session/lib/requirement-review-actions.ts` 承接需求规则增删改、复核状态保存、质量提示确认、单条/批量修复和修复候选决策；抽出 `features/workspace-session/lib/generation-dialog-actions.ts`、`auto-generated-upstream-reviews.ts`、`generation-task-actions.ts`、`workspace-permissions.ts`、`billing-generation-block.ts`、`workspace-initialization.ts`、`latest-generation-input.ts`、`plantuml-render-actions.ts`、`workspace-derived-status.ts`、`generation-preflight.ts`、`generation-upstream-reviews.ts` 和 `auto-completed-rule-mapping-actions.ts` 承接生成弹窗状态、自动上游 review 持久化、generation task 列表动作、workspace 权限加载、billing entitlement block 状态、初始 workspace/history 加载、异步 run 输入 ref 同步、PlantUML 手动渲染动作、规则/模型/追踪陈旧状态派生、requirement/design generation 预检决策、自动上游 review 记录组装和自动补全规则映射合并持久化；`run-ui-state.ts` 继续承接 run event 到 UI state、代码生成 event 到 UI state 与完成/取消/失败终态 UI state 的纯派生，`generation-dialog-actions.ts` 承接完成/取消/失败终态 dialog state，`diagnostics.ts` 继续承接 run event 到 diagnostics、代码生成 diagnostics artifact 和本地失败 diagnostics 追加的纯派生；`state.tsx` 降至 strict 扫描中的约 2909 行。
- 抽出 text requirement review/target view-model helper 和页面组件：`features/requirements/lib/requirement-review-view-model.ts` 承接需求字段标签、review state/tone、field value、source label、auto review filtering 和 repair copy，`features/requirements/lib/requirement-target-view-model.ts` 承接目标模型按钮文案、阻断原因、卡片状态和追踪证明记录，`features/requirements/components/requirement-rules-table.tsx` 承接需求规则表格、分页、状态 badge 和行内编辑，`features/requirements/components/requirement-review-dialog.tsx`、`requirement-traceability-dialogs.tsx`、`new-requirement-rule-dialog.tsx` 和 `requirement-assistant-panel.tsx` 承接质量提示/修复确认、追踪证明、新建规则和助手模板面板；`text-requirement-page.tsx` 降至约 876 行，低于 900 行大文件阈值。
- 抽出 diagram detail 的模型草稿编辑 helper：`features/diagrams/lib/model-editing.ts`，页面文件从约 3846 行降至 strict 扫描中的约 3377 行。
- 抽出 diagram detail 的模型编辑面板和详情派生 helper：`features/diagrams/components/model-edit-panel.tsx` 承接元素/关系编辑和删除确认 workflow，`features/diagrams/lib/diagram-detail-view-model.ts` 承接搜索匹配、关系展示、模型标题/摘要和关系强调样式派生；`diagram-detail-page.tsx` 降至约 1351 行，继续保留页面组合、SVG 视图、概览面板和导出入口。
- 抽出 model edit panel 的无状态表单控件：`features/diagrams/components/model-edit-fields.tsx` 承接带标签的 input/textarea/select/checkbox 和编辑器标签 helper；`model-edit-panel.tsx` 降至约 1854 行，后续继续拆元素编辑、关系编辑和删除确认 workflow。
- 抽出 model edit panel 的编辑弹窗壳层：`features/diagrams/components/model-edit-dialogs.tsx` 承接元素编辑、关系编辑和删除确认 Dialog 结构、按钮状态和提交/取消协议；`model-edit-panel.tsx` 降至约 1762 行，继续保留编辑状态、字段渲染和草稿变更逻辑。
- 抽出 model edit panel 的元素/关系列表：`features/diagrams/components/model-edit-lists.tsx` 承接元素搜索/类型筛选、元素卡片操作、关系搜索/类型筛选和关系卡片操作；`model-edit-panel.tsx` 降至约 1497 行，继续保留编辑状态、字段渲染和草稿变更逻辑。
- 抽出 model edit panel 的关系字段编辑器：`features/diagrams/components/model-relation-editor.tsx` 承接 usecase/class/activity/deployment/sequence/table 关系字段表单和字段级更新；`model-edit-panel.tsx` 降至约 1194 行，继续保留元素字段编辑、编辑状态和草稿变更逻辑。
- 抽出 model edit panel 的元素字段编辑器和操作/参数编辑器：`features/diagrams/components/model-element-editor.tsx` 承接 usecase/class/activity/deployment/sequence/table 元素字段表单和数据表字段编辑，`features/diagrams/components/model-operation-editor.tsx` 承接 class/interface 方法和参数编辑；`model-edit-panel.tsx` 降至约 472 行，仅保留编辑状态、草稿切换、列表/弹窗协调和提交/删除 workflow。
- 抽出 diagram detail 的 SVG pan/zoom hook：`features/diagrams/hooks/use-svg-pan-zoom.ts` 承接 SVG object URL 生命周期、Ctrl+wheel 缩放、pointer 拖拽平移和 SVG 切换时的 pan reset；`diagram-detail-page.tsx` 降至约 1244 行，继续保留页面组合、工具栏、概览面板和导出入口。
- 抽出 diagram detail 的 SVG preview panel：`features/diagrams/components/diagram-preview-panel.tsx` 承接 SVG/JSON 导出工具栏、SVG canvas/error/empty state、焦点元素详情和模型概览抽屉；`diagram-detail-page.tsx` 降至约 945 行，继续保留页面数据准备、顶部摘要、tabs、元素/关系清单和编辑面板组合。
- 抽出 diagram detail header：`features/diagrams/components/diagram-detail-header.tsx` 承接模型标题/摘要编辑、来源/保存状态展示和移动端/桌面统计；`diagram-detail-page.tsx` 降至约 851 行，低于 900 行大文件阈值。
- 抽出 sidebar menu model helper：`features/workspace-shell/lib/sidebar-menu-model.ts` 承接侧边栏图状态、运行子任务状态聚合、analysis/sequence 用例范围过滤和 pending 节点派生；`features/workspace-shell/components/sidebar-menu.tsx` 降至约 844 行，低于 900 行大文件阈值。
- 抽出 traceability matrix row helper：`features/traceability/lib/traceability-rows.ts` 承接需求/设计矩阵行构建、analysis 来源用例事件流派生、查询过滤和分组选项；页面文件从约 987 行降至约 513 行。
- 抽出 user platform 的课程团队绑定 helper、项目列表展示映射 helper、项目工作区展示格式化 helper、认证 query/message helper、项目创建表单、项目成员组件、项目历史组件、项目文档组件、项目设置组件、认证页、邀请接受页、项目索引页、新建页布局、账号/安全页和模型设置页：`features/user-platform/lib/academic-binding.ts`、`features/user-platform/lib/project-presentation.ts`、`features/user-platform/lib/project-workspace-presentation.ts`、`features/user-platform/lib/auth-page-routing.ts`、`features/user-platform/components/project-create-form.tsx`、`features/user-platform/components/project-members.tsx`、`features/user-platform/components/project-history.tsx`、`features/user-platform/components/project-documents.tsx`、`features/user-platform/components/project-settings.tsx`、`features/user-platform/components/auth-page.tsx`、`features/user-platform/components/invitation-accept-page.tsx`、`features/user-platform/components/projects-index-page.tsx`、`features/user-platform/components/project-new-page.tsx`、`features/user-platform/components/project-page-layout.tsx`、`features/user-platform/components/account-pages.tsx`、`features/user-platform/components/model-settings-page.tsx`，页面文件从约 5136 行降至 strict 扫描中的约 896 行，低于 900 行大文件阈值。
- 抽出 account dialog 的展示格式化和头像预览 helper：`features/user-platform/lib/account-dialog-formatting.ts` 承接账号状态、登录事件、日期、用量和上传限制展示规则，`features/user-platform/components/account-avatar-preview.tsx` 承接头像图像/首字母预览；`account-dialog.tsx` 从约 959 行降至约 896 行。
- 为 `packages/contracts` 与 `packages/prompts` 增加 runtime public export smoke tests：`packages/contracts/src/public-exports.test.ts`、`packages/prompts/src/public-exports.test.ts`，作为后续内部拆分的兼容护栏。
- 保持业务行为、HTTP API、公共导出和数据结构不变；本阶段只做边界下沉、入口兼容 re-export、注释、文档和审查脚本。

仍需拆阶段处理：

- 大型页面、route 和测试文件仍需按风险拆分，不能一次性搬动。
- API route 层依赖矩阵仍偏重，后续应按 admin/projects/documents 三条线继续拆 domain service 或 route dependency builder；admin run summary、admin run read model、admin run action helper、admin metrics read model、admin console model、admin session/RBAC view helper、admin user/project read model、admin academic/project scope、admin academic action、admin governance action、admin rate-limit action、admin provider telemetry read model、admin audit log read model、admin risk event read model、admin presenter helper、admin security helper、rate-limit fallback store、admin provider config healthcheck、admin provider config action、admin user/project action、admin document action、projects payload/settings access、run history summary、runs start command input resolution、runs provider gate、runs billing gate、runs evidence gate、requirement repair helper、run access helper、project run action helper、project document workspace helper、OnlyOffice request security、documents project access、documents audit/risk 和 OnlyOffice callback save 已完成低风险下沉。
- `contracts` 和 `prompts` 公共入口均已低于 900 行大文件阈值；后续重点转为前端/API 大文件，以及 `models.ts`、`code-generation.ts`、`model-prompts.ts`、`code-prompts.ts` 这类内部高内聚 helper 的二阶段拆分。public export 兼容测试已覆盖首轮内部拆分。

## 分阶段整改计划

### 阶段 1：建立可见边界

- 已补充架构边界文档，明确前端允许依赖方向：`app -> features/services/shared`，`features -> entities/services/shared`，`services -> entities/shared`，`entities -> shared`，`shared` 不依赖业务层。
- 已完成前端反向依赖清零。
- 已给全部 300 行以上复杂文件补顶部责任说明。
- 已增加审查脚本和 strict 模式。

验证：

- 已完成：`npm run audit:architecture`
- 已完成：`npm run audit:architecture:strict`
- 已完成：`npm run build --workspace @uml-platform/api`
- 已完成：`npx tsx --test --test-name-pattern "api rejects invalid start requests with 400|api reports empty JSON request bodies as 400 instead of 500|guest access seed creates|guest access seed does not grant|api production startup requires DATABASE_URL|api exposes health|api exposes version details|api applies the configured CORS origin allowlist|api server injects the configured mail adapter into project invitations" apps/api/src/index.test.ts`，9 个子测试通过。
- 已完成：`npx tsx --test apps/api/src/plantuml.test.ts apps/api/src/code-skills.test.ts packages/contracts/src/index.test.ts packages/prompts/src/index.test.ts`，67 个子测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-shell/components/sidebar-menu.test.tsx src/features/diagrams/components/diagram-detail-page.test.tsx src/services/workspace-repository/index.test.ts src/features/workspace-session/state.test.tsx`，4 个测试文件、110 个测试通过。
- 已完成：`npm run typecheck --workspace @uml-platform/web`
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts src/features/workspace-session/state.test.tsx`，2 个测试文件、65 个测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts src/app/App.test.tsx`，2 个测试文件、98 个测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx src/features/workspace-session/lib/generation-tasks.test.ts src/features/workspace-shell/components/sidebar-menu.test.tsx`，3 个测试文件、57 个测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx src/features/workspace-shell/components/sidebar-menu.test.tsx`，2 个测试文件、44 个测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/app/App.test.tsx src/app/providers/theme-provider.test.tsx src/features/documents/components/instruction-documents-page.test.tsx src/features/settings/components/settings-dialog.test.tsx src/features/workspace-shell/components/top-bar.test.tsx src/services/workspace-repository/index.test.ts src/entities/workspace/store.test.ts`，7 个测试文件、130 个测试通过。
- 已完成：`npm run build --workspace @uml-platform/render-service`
- 已完成：`npm run test --workspace @uml-platform/contracts`，31 个子测试通过。
- 已完成：`npm run test --workspace @uml-platform/prompts`，12 个子测试通过。
- 说明：完整 `npx tsx --test apps/api/src/index.test.ts` 运行超过 5 分钟超时，未作为通过证据；已改跑覆盖本次 server assembly 改动的命名子集。

### 阶段 2：拆分前端高风险模块

- 已拆 `workspace-session/state.tsx` 的生成依赖规划、标签和子任务构建到 `lib/generation-planning.ts`，拆出 run event 派生 helper 到 `lib/run-events.ts`，拆出 `GenerationResultDialog`/`GenerationConfirmationDialog` 到 `components/generation-dialogs.tsx`，拆出需求 review 的质量报告、阻塞规则、确认合并和 issue 摘要 helper 到 `lib/requirement-review.ts`，拆出输入指纹、模型作用域、traceability 完整性/新鲜度判断和 billing entitlement 解析到 `lib/workspace-context.ts`、`lib/billing-entitlement.ts`，拆出历史快照恢复计划到 `lib/history-restore.ts`，拆出 workspace record application 到 `lib/workspace-record-application.ts`，拆出 manual model edit actions 到 `lib/manual-model-edits.ts`，拆出 run history actions 到 `lib/run-history-actions.ts`，拆出 requirement review actions 到 `lib/requirement-review-actions.ts`，并拆出 generation dialog、auto upstream review、generation task、workspace permissions、billing generation block、workspace initialization、latest input ref、PlantUML render action、derived status、generation preflight、upstream review building、auto-completed rule mapping actions、run UI state event derivation、code run UI state event derivation、completed/cancelled/failed run terminal state derivation、run diagnostics event derivation、code diagnostics artifact derivation 和 local failure diagnostics derivation 到对应 hook/helper；后续继续拆大块运行回调和更细粒度 persistence side effects。
- 已拆 `text-requirement-page.tsx` 的 requirement review view-model 到 `features/requirements/lib/requirement-review-view-model.ts`，拆出 target view-model 到 `features/requirements/lib/requirement-target-view-model.ts`，并拆出规则表格、质量提示/修复确认 dialog、追踪证明 dialog、新建规则 dialog 和助手模板面板到 `features/requirements/components/requirement-rules-table.tsx`、`requirement-review-dialog.tsx`、`requirement-traceability-dialogs.tsx`、`new-requirement-rule-dialog.tsx`、`requirement-assistant-panel.tsx`；页面文件已低于 900 行阈值，后续转为拆目标模型区和更细粒度数据准备 hook。
- 已拆出 `features/history` 中的 run history data logic 到 `entities/run-history`，消除 `services -> features/history` 依赖；已拆出 start input factories、project scope/header helper、project history mapping、run payload helper、run subscription adapter、document/evidence API adapter、workspace state/snapshot 合并 helper、run actions API adapter、mock repository、HTTP repository 和公共 repository contract；`workspace-repository/index.tsx` 已缩减为公共 re-export 与 React provider。
- 已拆出 `diagram-detail-page.tsx` 的模型草稿编辑 helper 到 `features/diagrams/lib/model-editing.ts`，并拆出 `ModelEditPanel` 到 `features/diagrams/components/model-edit-panel.tsx`、编辑表单控件到 `features/diagrams/components/model-edit-fields.tsx`、编辑弹窗壳层到 `features/diagrams/components/model-edit-dialogs.tsx`、元素/关系列表到 `features/diagrams/components/model-edit-lists.tsx`、关系字段编辑器到 `features/diagrams/components/model-relation-editor.tsx`、元素字段编辑器到 `features/diagrams/components/model-element-editor.tsx`、操作/参数编辑器到 `features/diagrams/components/model-operation-editor.tsx`、详情派生 helper 到 `features/diagrams/lib/diagram-detail-view-model.ts`、SVG pan/zoom hook 到 `features/diagrams/hooks/use-svg-pan-zoom.ts`、SVG preview panel 到 `features/diagrams/components/diagram-preview-panel.tsx`、diagram detail header 到 `features/diagrams/components/diagram-detail-header.tsx`；后续继续拆页面主体的数据准备 hook、移动端元素/关系清单和 trace highlight 规则。
- 已拆出 `traceability-matrix-page.tsx` 的行构建、查询过滤和分组选项 helper 到 `features/traceability/lib/traceability-rows.ts`；后续可继续拆表格渲染和详情抽屉。
- 已拆出 `user-platform-pages.tsx` 的课程团队绑定 helper、项目列表展示映射 helper、成员/运行历史/文档展示格式化 helper、认证 query/message helper，以及 `ProjectCreateForm` 项目创建表单、`ProjectMembers` 项目成员组件、`ProjectHistory` 项目历史组件、`ProjectDocuments` 项目文档组件、`ProjectSettings` 项目设置组件、`AuthPage` 认证页、`InvitationAcceptPage` 邀请接受页、`ProjectsIndexPage` 项目索引页、`ProjectNewPage` 新建页、项目页面布局、`AccountPage`/`AccountSecurityPage` 账号页和 `ModelSettingsPage` 模型设置页到 `features/user-platform/lib/academic-binding.ts`、`features/user-platform/lib/project-presentation.ts`、`features/user-platform/lib/project-workspace-presentation.ts`、`features/user-platform/lib/auth-page-routing.ts`、`features/user-platform/components/project-create-form.tsx`、`features/user-platform/components/project-members.tsx`、`features/user-platform/components/project-history.tsx`、`features/user-platform/components/project-documents.tsx`、`features/user-platform/components/project-settings.tsx`、`features/user-platform/components/auth-page.tsx`、`features/user-platform/components/invitation-accept-page.tsx`、`features/user-platform/components/projects-index-page.tsx`、`features/user-platform/components/project-new-page.tsx`、`features/user-platform/components/project-page-layout.tsx`、`features/user-platform/components/account-pages.tsx`、`features/user-platform/components/model-settings-page.tsx`；`user-platform-pages.tsx` 已低于 900 行阈值，后续可继续按风险拆工作区抽屉/访问边界，但不再是首要大文件阻塞。
- 已拆出 `account-dialog.tsx` 的展示格式化、用量文案、上传限制和头像预览 helper 到 `features/user-platform/lib/account-dialog-formatting.ts`、`features/user-platform/components/account-avatar-preview.tsx`；后续可继续拆资料表单、MFA、安全会话和登录事件面板。
- 已拆 `sidebar-menu.tsx` 的图状态、子任务聚合、scoped use-case 模型过滤和 pending 节点派生到 `features/workspace-shell/lib/sidebar-menu-model.ts`；组件文件只保留图标、节点构造、树渲染和打开 tab 的回调，已低于 900 行大文件阈值。
- 已迁移 `features -> app` 的 theme provider、route type、workspace module 依赖，改为 shared/entities contract。

验证：

- 已完成：`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`，1 个测试文件、26 个测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`，1 个测试文件、7 个测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/app/App.test.tsx`，1 个测试文件、58 个测试通过，覆盖登录、注册、邮箱验证、找回/重置密码、MFA 和邀请注册流程。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/account-dialog.test.tsx`，1 个测试文件、5 个测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/features/traceability/components/traceability-matrix-page.test.tsx`，1 个测试文件、9 个测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts`，1 个测试文件、40 个测试通过。
- 已完成：`npm run test --workspace @uml-platform/web -- --run src/features/requirements/components/text-requirement-page.test.tsx`，1 个测试文件、28 个测试通过。
- 已完成：`npm run typecheck --workspace @uml-platform/web`。
- 已完成：`npm run audit:architecture:strict`，前端向上导入为 0，300 行以上复杂文件缺顶部说明为 0。
- 对 workspace/session、diagram navigation、traceability、history persistence 做回归测试。

### 阶段 3：拆分 API route 与装配

- 已从 `apps/api/src/index.ts` 抽出环境默认值、Fastify 基础装配、persistence factory、external adapter factory、启动种子用户逻辑和 route registration builder；入口装配拆分阶段完成。
- 已从 admin route 下沉 run snapshot 分类、产物摘要/条目和 generation breakdown 到 `runs/records/admin-run-summaries.ts`。
- 已从 admin route 下沉角色权限、prompt runtime 和 system health/config/log/release 展示模型到 `routes/admin/admin-console-model.ts`。
- 已从 admin route 下沉 academic organization/course/class/team、project 和 visible user scope 判断到 `admin/academic-scope.ts`，route 保留权限入口和 endpoint 响应映射。
- 已从 admin route 下沉 admin console DTO/presenter helper 到 `admin/admin-route-presenters.ts`，承接 admin 用户 DTO、指标卡片、模型调用量聚合、run DTO、组织单位展示和 provider quota fallback；route 保留权限、schema 和 HTTP 响应拼装。
- 已从 admin route 下沉高风险权限/audit helper 到 `admin/admin-route-security.ts`，承接 `requireHighRiskAdmin`、`recordAdminAction` 和 `revokeActiveSessionsForUser`；已从 admin route 下沉内存 rate-limit policy fallback store 与 tracker/fallback 选择装配到 `provider-configs/fallback-rate-limit-policy-store.ts`。
- 已从 admin route 下沉 provider config healthcheck 到 `provider-configs/admin-provider-config-test.ts`，承接 provider 状态/模型/密钥校验、provider test rate-limit、healthcheck response format、外部 provider fetch、breaker 失败记录和 usage accounting；route 保留 body 解析和 HTTP status/body 映射。
- 已从 admin route 下沉 provider config actions 到 `admin/admin-provider-config-actions.ts`，承接 create/update/rotate/revoke/enable/disable/reset-breaker、scope id 存在性校验和审计记录；route 保留权限入口、schema parse、路径参数读取和 HTTP status/body 映射，文件降至约 1895 行。
- 已从 admin route 下沉 user/project actions 到 `admin/admin-user-project-actions.ts`，承接禁用用户、强制登出、重置 MFA、冻结项目、数据 scope 可见性校验、会话撤销和审计记录；route 保留高风险权限入口、路径参数读取和 HTTP status/body 映射，文件降至约 1765 行。
- 已从 admin route 下沉 document actions 到 `admin/admin-document-actions.ts`，承接文档列表 scope 过滤、列表 response envelope、下载审计、缺失文件响应和恢复审计；route 保留权限入口、路径参数读取和 HTTP status/body/header 映射。
- 已从 admin route 下沉 academic actions 到 `admin/admin-academic-actions.ts`，承接组织、课程、班级、团队、组织成员和配额的可见性列表、读取、创建前置校验和创建动作；route 保留权限入口、schema parse、路径参数读取和 HTTP status/body 映射，文件降至约 1704 行。
- 已从 admin route 下沉 governance actions 到 `admin/admin-governance-actions.ts`，承接 prompt runtime 状态变更和高危角色权限复核审计动作；route 保留高风险权限入口、路径参数读取和 HTTP status/body 映射，文件降至约 1683 行。
- 已从 admin route 下沉 rate-limit actions 到 `admin/admin-rate-limit-actions.ts`，承接 rate-limit policy 创建、更新、缺失响应和审计动作；route 保留高风险权限入口、schema parse、路径参数读取和 HTTP status/body 映射，文件降至约 1671 行。
- 已从 admin route 下沉 provider telemetry read model 到 `admin/admin-provider-telemetry.ts`，承接 rate-limit policy list、provider usage、provider quota DTO 组装和 response envelope；route 保留权限入口和 response schema parse，文件降至约 1662 行。
- 已从 admin route 下沉 audit log read model 到 `admin/admin-audit-log-view.ts`，承接 audit log 数据范围过滤和 provider audit log DTO 映射；route 保留权限入口、generatedAt 和 response envelope，文件降至约 1640 行。
- 已从 admin route 下沉 system health services 展示模型到 `routes/admin/admin-console-model.ts`；route 保留权限入口、generatedAt 和 response envelope，文件降至约 1638 行。
- 已从 admin route 下沉 metrics read model 到 `admin/admin-metrics-view.ts`，承接日期窗口校验、生成记录汇总、模型用量、文档计数和 generation breakdown 组装；route 保留权限入口、查询参数读取和 HTTP 400 映射，文件降至约 1558 行。
- 已从 admin route 下沉 run read model 到 `admin/admin-run-read-model.ts`，承接 run list/detail 可见性过滤、排序、详情 DTO 和诊断摘要；route 保留权限入口、路径参数读取和 HTTP status/body 映射，文件降至约 1486 行。
- 已从 admin route 下沉 run action helper 到 `admin/admin-run-actions.ts`，承接 run cancel/retry/rerun 可写性校验、状态冲突、scheduler/pipeline 调用和审计动作；route 保留写权限入口、路径参数读取和 HTTP status/body 映射，文件降至约 1390 行。
- 已从 admin route 下沉 risk event read model 到 `admin/admin-risk-events-view.ts`，承接 `AdminRiskEvent` 类型、风险事件列表 read model 和 response envelope；route 保留权限入口，文件降至约 1386 行。
- 已从 admin route 下沉 session/RBAC view 到 `admin/admin-session-view.ts`，承接 `/api/admin/session` 响应 schema parse、管理员角色/MFA 判断和 scoped admin actor 构造；route 保留 endpoint 注册、HTTP reply 传递和 authStore 注入，文件降至约 1322 行。
- 已从 admin route 下沉 user/project read model 到 `admin/admin-user-project-read-model.ts`，承接用户列表、用户登录记录和项目列表的可见性过滤、DTO 映射和 404/403 响应体；route 保留权限入口、路径参数读取、generatedAt 和 HTTP status/body 映射，文件降至约 1318 行。
- 已从 admin route 下沉 document project scope 派生到 `admin/admin-document-actions.ts`，复用文档列表和文档下载的可见项目集合计算；route 保留权限入口、路径参数读取和 response envelope/header 映射，文件降至约 1313 行。
- 已从 admin route 下沉 rate-limit tracker/fallback store 选择装配到 `provider-configs/fallback-rate-limit-policy-store.ts`；route 保留 provider usage tracker 注入和 rate-limit store 使用边界，文件降至约 1303 行。
- 已从 admin route 下沉 prompt runtime list/version read model 到 `routes/admin/admin-console-model.ts`；route 保留权限入口、路径参数读取和 HTTP status/body 映射，文件降至约 1288 行。
- 已从 admin route 下沉角色权限和 system health/config/log/release response envelope 到 `routes/admin/admin-console-model.ts`；route 保留权限入口和 endpoint 注册边界，文件降至约 1273 行。
- 已从 admin route 下沉文档列表、风险事件、审计日志、rate-limit policy/provider usage/provider quota 的 response envelope 到对应 admin helper；route 保留权限入口、response schema parse 和 endpoint 注册边界，文件降至约 1261 行。
- 已从 admin route 下沉组织、课程、班级、团队、成员、配额、用户和项目列表的 response envelope 到对应 admin helper；route 保留权限入口、response schema parse 和 endpoint 注册边界，文件降至约 1249 行。
- 已从 admin route 下沉 run list 和 provider config list 的 response envelope 到对应 admin helper；route 保留权限入口和 endpoint 注册边界，文件降至约 1244 行，route 内已无裸 `generatedAt` response envelope 组装。
- 已从 projects route 下沉 workspace 默认状态、workspace payload、项目/邀请 DTO、成员预览映射到 `projects/project-route-payloads.ts`，并下沉 settings 权限上下文到 `projects/project-settings-access.ts`；route 保留 HTTP path、schema parse、审计和调用边界。
- 已从 runs route 下沉 run history 摘要和过滤展示映射到 `runs/records/run-record-summaries.ts`。
- 已从 runs route 下沉 project start command 输入解析到 `routes/runs/run-input-resolution.ts`，保留 legacy payload 兼容和 workspace command 语义。
- 已从 runs route 下沉 provider config resolution、rate-limit gate 和 usage accounting 到 `runs/providers/run-provider-gates.ts`，保留 managed provider、默认 provider、guest generation limit、retry/rerun provider metadata 语义。
- 已从 runs route 下沉 billing reservation gate 到 `runs/billing/run-billing-gates.ts`。
- 已从 runs route 下沉 evidence package storage、review decision 合并和 unresolved-review 阻断到 `runs/evidence/run-evidence-gates.ts`。
- 已从 runs route 下沉 requirement rule repair prompt、解析、字段归一化、quality report 重建和批量候选组装到 `runs/repairs/requirement-rule-repair.ts`；route 不再直接依赖 `normalizers/json`。
- 已从 runs route 下沉 run access context、默认 header guard、project permission check、start run metadata assembly 和 record read guard 到 `routes/runs/run-access.ts`；`register-run-routes.ts` 继续 re-export `RunAccessContext`/`RunAccessGuard` 兼容既有测试和 server assembly，文件降至约 1225 行。
- 已从 runs route 下沉 retry/rerun 业务编排到 `runs/actions/project-run-actions.ts`；route 保留项目权限入口、路径参数读取和响应调用，helper 承接 source 校验、usage/billing gates、queued copy 创建和 pipeline restart，文件降至约 1150 行。
- 已抽出项目文档 workspace id helper 到 `documents/library/project-document-workspace.ts`，统一 run route 下载回退和 run record pipeline 的项目文档 workspace 命名。
- 已从 documents route 下沉 OnlyOffice request/callback 安全 helper 到 `documents/onlyoffice/request-security.ts`。
- 已从 documents route 下沉 project path、document ownership 和 OnlyOffice token project context 访问校验到 `routes/documents/document-project-access.ts`。
- 已从 documents route 下沉 audit/risk recorder payload 包装和 best-effort audit failure logging 到 `routes/documents/document-audit-events.ts`，并下沉 OnlyOffice callback 保存下载、大小限制、buffer 更新和审计/风险事件到 `routes/documents/document-onlyoffice-callback.ts`。
- 继续将 admin、runs、documents route 中复杂业务逻辑下沉到 domain service 或 pipeline helper。
- route 层保留 schema、权限入口、响应映射和调用边界。
- 保留现有 HTTP path、请求/响应 schema 和测试入口。

验证：

- 已完成：`npm run build --workspace @uml-platform/api`
- 已完成：`npx tsx --test --test-name-pattern "api rejects invalid start requests with 400|api reports empty JSON request bodies as 400 instead of 500|guest access seed creates|guest access seed does not grant|api production startup requires DATABASE_URL|api exposes health|api exposes version details|api applies the configured CORS origin allowlist|api server injects the configured mail adapter into project invitations" apps/api/src/index.test.ts`，9 个子测试通过。
- 已完成：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`，45 个子测试通过。
- 已完成：`npx tsx --test apps/api/src/routes/projects/register-project-routes.test.ts apps/api/src/routes/projects/workspace-snapshot-restore.test.ts`，15 个子测试通过。
- 已完成：`npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`，36 个子测试通过。
- 已完成：`npx tsx --test apps/api/src/routes/documents/register-document-routes.test.ts`，11 个子测试通过。
- 已完成：`npm run build --workspace @uml-platform/api`，覆盖 run access helper、server route wiring 和 project document workspace helper 的类型边界。
- 已完成：`npm run audit:architecture:strict`，`Frontend upward import counts: none`，`Complex files missing top notes: 0`。
- 对 run lifecycle、document routes、admin provider config、billing entitlement 做 targeted tests。

### 阶段 4：拆分共享包并补门禁

- `contracts` 和 `prompts` 做内部文件拆分，保留公共 `index.ts` 导出兼容；已完成 `contracts/admin-platform.ts`、`contracts/admin-rbac.ts`、`contracts/auth-account.ts`、`contracts/billing.ts`、`contracts/code-generation.ts`、`contracts/documents.ts`、`contracts/evidence.ts`、`contracts/fingerprints.ts`、`contracts/models.ts`、`contracts/projects.ts`、`contracts/provider-configs.ts`、`contracts/render.ts`、`contracts/requirements.ts`、`contracts/runs.ts`、`contracts/system-notices.ts`、`prompts/document-prompts.ts`、`prompts/code-prompts.ts` 与 `prompts/model-prompts.ts` 首轮拆分。
- 已新增 runtime public export 兼容测试，后续拆分时继续保留公共 `index.ts` 导出兼容。
- 已将架构审查脚本接入 `package.json`，并增加 strict 模式；后续再考虑 CI 接入和 public export 兼容快照。

验证：

- 已完成：`npm run test --workspace @uml-platform/contracts`，31 个子测试通过。
- 已完成：`npm run test --workspace @uml-platform/prompts`，12 个子测试通过。
- 已完成：`npm run build --workspace @uml-platform/api`。
- 已完成：`npm run typecheck --workspace @uml-platform/web`。
- 已完成：`npm run audit:architecture:strict`，项目源码扫描 472 个，`apps/api` 顶部说明 207，`apps/web` 顶部说明 176，`packages/contracts` 顶部说明 18，`packages/prompts` 顶部说明 6，`packages/contracts/src/index.ts`、`packages/prompts/src/index.ts`、`features/requirements/components/text-requirement-page.tsx`、`features/user-platform/components/user-platform-pages.tsx`、`features/workspace-shell/components/sidebar-menu.tsx`、`services/workspace-repository/index.tsx` 和 diagram detail/model editor 相关生产文件均已低于 900 行大文件阈值。
- 未运行：`npm run test:harness-eval`，本次只移动公共契约内部文件，未触达评测 harness 行为；当前以 contracts/prompts/API/web/architecture 校验覆盖兼容风险。
- 未作为收口证据：完整 `npm run build`；本轮采用 API build、render build、web typecheck、contracts/prompts tests、route targeted tests 和 strict architecture audit 覆盖改动面。

## 第一阶段收口判断

完成度口径：

- 架构规范审查与第一阶段低风险整改：100%。AGENTS.md 要求的目录结构、模块边界、导入方向、注释规范、超大文件问题均已审查并记录；可安全落地的结构下沉、顶部责任说明、审查脚本和 targeted validation 已完成。
- 整体架构债务：约 80%-85%。剩余约 15%-20% 是二阶段高风险拆分，不属于本次“一阶段落地”完成口径，包括继续拆大型测试、`workspace-session/state.tsx` 的剩余运行回调、API route dependency builder/domain service、以及 CI 接入 strict audit。

收口证据：

- 审查范围只覆盖项目自有源码；strict audit 明确排除 `plantuml`、`opencode`、`dist`、`vendor`、`sandpack`、复制的 code-skills、缓存、日志和截图。
- `npm run audit:architecture:strict` 当前通过：前端向上导入为 0，300 行以上复杂文件缺顶部说明为 0。
- 第一阶段新增或扩展的 helper 均保留原 HTTP path、请求/响应 schema、公共 re-export 和数据结构；route 保留 endpoint 注册、schema parse、权限入口和响应映射边界。
- 已完成改动均记录 targeted tests、typecheck、build 或 static audit；未运行项均给出原因。
- 高风险问题没有被伪装成“已全部修完”：剩余大文件、route 依赖矩阵和共享包内部高内聚 helper 已拆到后续阶段。

本阶段不执行项：

- 不继续机械拆所有大测试文件。
- 不修改外部复制资源、vendor runtime、dist 产物、日志或截图。
- 不执行 Run 连续失败专项计划中的 LLM scheduler 补丁、远端 PM2 环境变量调整或旧 Run 重试；该计划已单独登记，等待会话完成确认后再进入代码/远端执行阶段。

## Run 连续失败修复计划（并发改为本地一致）

状态：已登记为专项修复计划；当前架构整改阶段不执行本地 LLM scheduler 代码补丁、不修改远端 PM2/部署环境，也不重试旧失败 Run。

### Summary

目标是修复 LLM 超时级联问题，同时把生产并发从当前 `32/16` 降到本地 `dev:api:safe` 一致的 `10/10/10/10/10`，不采用更保守的 `4/4/2/2/2`。

### Key Changes

- 修复 `createScheduledLlmTransport`：调用真实 LLM transport 时透传 `input.abortSignal`，让超时/取消能真正中止 provider 请求。
- 将生产 LLM 并发配置调整为本地显式 dev 配置：
  - `UML_LLM_GLOBAL_CONCURRENCY=10`
  - `UML_LLM_PROVIDER_CONCURRENCY=10`
  - `UML_LLM_PROJECT_CONCURRENCY=10`
  - `UML_LLM_USER_CONCURRENCY=10`
  - `UML_LLM_RUN_CONCURRENCY=10`
- 重启 `uml-api` 清空进程内调度队列；不改数据库旧 Run 记录。
- 可选补强：让最终失败原因优先保留上游 `PLATFORM_PROVIDER_TIMEOUT`，避免被包装成误导性的 `RUN_DEPENDENCY_MISSING`。

### Execution Steps

1. 等用户确认会话 `019ebac6-680f-7ed2-ad3e-4df0f15c09b5` 已完成。
2. 本地重新检查 `git status --short` 和相关文件最新版，避免覆盖另一个会话的重构。
3. 做最小代码补丁：只修 abort 透传和必要测试；错误归因优化作为同批小改动处理。
4. 跑目标测试：
   - LLM scheduler 测试
   - 若改错误归因，再跑 requirement pipeline 相关超时用例
5. 远端更新 PM2/部署环境中的 LLM 并发变量为全 `10`。
6. 重启 `uml-api`，再只读复查 PM2、最近 Run、`run_events` 队列状态和失败分布。

### Test Plan

- 新增/更新测试：scheduled transport 必须把 `abortSignal` 传给底层 transport。
- 保留队列取消测试：queued task 被取消后不会调用 provider。
- 若改错误归因，补测试验证 provider timeout 后最终 Run error 仍是 `PLATFORM_PROVIDER_TIMEOUT`。
- 远端验证新任务不再出现“前方 18-20 个模型调用，然后 5 分钟超时”的模式。

### Assumptions

- “和本地一致”按 `package.json` 的 `dev:api:safe` 显式配置理解，即五个 LLM 并发值均为 `10`。
- 当前 Plan 阶段不修改本地代码、不改远端配置。
- 不自动重试旧失败 Run，旧记录保留为故障证据。

## 不建议立即做的事

- 不建议一次性移动所有大文件，风险高且会冲突大量测试。
- 不建议机械给所有文件加顶部注释；这会制造噪声，不符合 AGENTS 的实用注释要求。
- 不建议修改或清理 `plantuml/`、`opencode/`、Sandpack worker、vendor runtime、dist 产物。
- 不建议在没有兼容测试前拆 `packages/contracts` 的公开导出。

## 本次审查使用的验证命令

- 读取根规范：`Get-Content AGENTS.md`
- 初始源码计数：`rg --files apps packages src -g "*.ts" -g "*.tsx" -g "*.js" -g "*.mjs" -g "!**/dist/**" -g "!**/node_modules/**" -g "!apps/web/public/vendor/**" -g "!apps/web/public/sandpack/**" -g "!apps/api/src/code-skills/**"`
- 架构审查脚本：`npm run audit:architecture`、`npm run audit:architecture:strict`
- API/共享包 targeted tests：`npx tsx --test apps/api/src/plantuml.test.ts apps/api/src/code-skills.test.ts packages/contracts/src/index.test.ts packages/prompts/src/index.test.ts`
- API server assembly splits：`npm run build --workspace @uml-platform/api`、`npx tsx --test --test-name-pattern "api rejects invalid start requests with 400|api reports empty JSON request bodies as 400 instead of 500|guest access seed creates|guest access seed does not grant|api production startup requires DATABASE_URL|api exposes health|api exposes version details|api applies the configured CORS origin allowlist|api server injects the configured mail adapter into project invitations" apps/api/src/index.test.ts`
- Admin route helper splits：`npm run build --workspace @uml-platform/api`、`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run audit:architecture:strict`
- Admin route academic scope split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin route presenter split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin route security/rate-limit fallback split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin provider config healthcheck split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin provider config action split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin user/project action split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin document action split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin academic action split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin governance action split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin rate-limit action split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin provider telemetry read-model split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin audit log read-model split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin system health display-model split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin metrics read-model split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin run read-model split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin run action split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin risk event read-model split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin session/RBAC view split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin user/project read-model split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin document project scope split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin rate-limit store fallback assembly split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin prompt runtime read-model split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin role/system console envelope split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin read-model envelope split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin academic/user/project list envelope split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Admin run/provider list envelope split：`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Projects route payload/settings split：`npx tsx --test apps/api/src/routes/projects/register-project-routes.test.ts apps/api/src/routes/projects/workspace-snapshot-restore.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Requirement model response format split：`npx tsx --test apps/api/src/adapters/llm/response-formats/requirements-response-formats.test.ts apps/api/src/adapters/llm/response-formats/design-response-formats.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Code response format split：`npx tsx --test apps/api/src/adapters/llm/response-formats/code-response-formats.test.ts apps/api/src/adapters/llm/response-formats/requirements-response-formats.test.ts apps/api/src/adapters/llm/response-formats/design-response-formats.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Traceability matrix row split：`npm run test --workspace @uml-platform/web -- --run src/features/traceability/components/traceability-matrix-page.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Runs route history summary split：`npm run build --workspace @uml-platform/api`、`npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`、`npm run audit:architecture:strict`
- Runs route input resolution split：`npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Runs provider gate split：`npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Runs evidence gate split：`npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Runs billing/repair split：`npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Runs access/project document workspace split：`npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Project run action split：`npx tsx --test apps/api/src/routes/runs/register-run-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Documents route OnlyOffice request security split：`npm run build --workspace @uml-platform/api`、`npx tsx --test apps/api/src/routes/documents/register-document-routes.test.ts`、`npm run audit:architecture:strict`
- Documents route project access split：`npx tsx --test apps/api/src/routes/documents/register-document-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Documents route audit/risk split：`npx tsx --test apps/api/src/routes/documents/register-document-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Documents route OnlyOffice callback save split：`npx tsx --test apps/api/src/routes/documents/register-document-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Public export smoke tests：`npm run test --workspace @uml-platform/contracts`、`npm run test --workspace @uml-platform/prompts`
- Shared package internal splits：`npm run test --workspace @uml-platform/contracts`、`npm run test --workspace @uml-platform/prompts`、`npm run audit:architecture:strict`
- Prompts code generation split：`npm run test --workspace @uml-platform/prompts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`
- Contracts billing split：`npm run test --workspace @uml-platform/contracts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Contracts provider config split：`npm run test --workspace @uml-platform/contracts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Contracts system notice split：`npm run test --workspace @uml-platform/contracts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Contracts auth/account split：`npm run test --workspace @uml-platform/contracts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Contracts fingerprint split：`npm run test --workspace @uml-platform/contracts`、`npm run test --workspace @uml-platform/web -- --run src/shared/lib/fingerprint.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Contracts document split：`npm run test --workspace @uml-platform/contracts`、`npx tsx --test apps/api/src/routes/documents/register-document-routes.test.ts`、`npm run test --workspace @uml-platform/prompts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Contracts code generation split：`npm run test --workspace @uml-platform/contracts`、`npm run test --workspace @uml-platform/prompts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`、`git diff --check`
- Contracts project split：`npm run test --workspace @uml-platform/contracts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Contracts admin platform split：`npm run test --workspace @uml-platform/contracts`、`npx tsx --test apps/api/src/routes/admin/register-admin-routes.test.ts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Contracts requirements split：`npm run test --workspace @uml-platform/contracts`、`npm run test --workspace @uml-platform/prompts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`、`git diff --check`
- Contracts models split：`npm run test --workspace @uml-platform/contracts`、`npm run test --workspace @uml-platform/prompts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`、`git diff --check`
- Contracts evidence split：`npm run test --workspace @uml-platform/contracts`、`npm run test --workspace @uml-platform/prompts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`、`git diff --check`
- Contracts run/render split：`npm run test --workspace @uml-platform/contracts`、`npm run test --workspace @uml-platform/prompts`、`npm run build --workspace @uml-platform/api`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Prompts model split：`npm run test --workspace @uml-platform/prompts`、`npm run build --workspace @uml-platform/api`、`npm run audit:architecture:strict`、`git diff --check`
- 前端 targeted tests：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-shell/components/sidebar-menu.test.tsx src/features/diagrams/components/diagram-detail-page.test.tsx src/services/workspace-repository/index.test.ts src/features/workspace-session/state.test.tsx`
- Workspace session generation dialogs split：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx src/features/workspace-session/lib/generation-tasks.test.ts`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-shell/components/sidebar-menu.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Workspace session requirement review split：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx src/features/workspace-session/lib/generation-tasks.test.ts`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Workspace session context/freshness split：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx src/features/workspace-session/lib/generation-tasks.test.ts`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`、`git diff --check`
- Workspace session history restore split：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx src/features/workspace-session/lib/generation-tasks.test.ts`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`、`git diff --check`
- Workspace session record application split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session manual model edit actions split：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Workspace session run history actions split：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Workspace session requirement review actions split：`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Workspace session UI/action state hooks split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session permission/billing state hooks split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session initialization hook split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session latest input/render action hooks split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session derived status split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session generation preflight split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session upstream review building split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session auto-completed rule mapping actions split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session run UI state event derivation split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session code run UI state event derivation split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session completed run terminal state split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session cancelled run terminal state split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session failed run terminal state split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session run diagnostics event derivation split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session code diagnostics artifact derivation split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Workspace session local failure diagnostics derivation split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-session/state.test.tsx`、`npm run audit:architecture:strict`
- Text requirement review view-model split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/requirements/components/text-requirement-page.test.tsx`、`npm run audit:architecture:strict`
- Text requirement target view-model split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/requirements/components/text-requirement-page.test.tsx`、`npm run audit:architecture:strict`、`git diff --check`
- Text requirement page component splits：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/requirements/components/text-requirement-page.test.tsx`、`npm run audit:architecture:strict`、`git diff --check`
- Diagram detail helper split：`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`
- Diagram detail model edit panel split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`、`npm run audit:architecture:strict`
- Model edit field controls split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`、`npm run audit:architecture:strict`
- Model edit dialogs split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`、`npm run audit:architecture:strict`
- Model edit lists split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`、`npm run audit:architecture:strict`
- Model relation editor split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`、`npm run audit:architecture:strict`
- Model element/operation editor split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`、`npm run audit:architecture:strict`
- Diagram detail SVG pan/zoom hook split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`、`npm run audit:architecture:strict`
- Diagram detail SVG preview panel split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`、`npm run audit:architecture:strict`
- Diagram detail header split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/diagrams/components/diagram-detail-page.test.tsx`、`npm run audit:architecture:strict`
- Sidebar menu model split：`npm run typecheck --workspace @uml-platform/web`、`npm run test --workspace @uml-platform/web -- --run src/features/workspace-shell/components/sidebar-menu.test.tsx`、`npm run audit:architecture:strict`
- User platform helper split：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`
- User platform project workspace presentation split：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- User platform ProjectDocuments split：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- User platform ProjectMembers split：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- User platform ProjectHistory split：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- User platform ProjectSettings split：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- User platform ModelSettingsPage split：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- User platform account pages split：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- User platform AuthPage split：`npm run test --workspace @uml-platform/web -- --run src/app/App.test.tsx`、`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- User platform ProjectCreateForm split：`npm run test --workspace @uml-platform/web -- --run src/app/App.test.tsx`、`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- User platform invitation/projects index/new page split：`npm run test --workspace @uml-platform/web -- --run src/app/App.test.tsx`、`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/user-platform-pages.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Account dialog formatting/avatar split：`npm run test --workspace @uml-platform/web -- --run src/features/user-platform/components/account-dialog.test.tsx`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Workspace repository run payload split：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts`
- Workspace repository run subscription split：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Workspace repository document/evidence API split：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`、`git diff --check`
- Workspace repository state/snapshot split：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`、`git diff --check`
- Workspace repository run actions API split：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`、`git diff --check`
- Workspace repository mock split：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Workspace repository contract/HTTP split：`npm run test --workspace @uml-platform/web -- --run src/services/workspace-repository/index.test.ts`、`npm run typecheck --workspace @uml-platform/web`、`npm run audit:architecture:strict`
- Web typecheck：`npm run typecheck --workspace @uml-platform/web`
- API build：`npm run build --workspace @uml-platform/api`
- Render build：`npm run build --workspace @uml-platform/render-service`
