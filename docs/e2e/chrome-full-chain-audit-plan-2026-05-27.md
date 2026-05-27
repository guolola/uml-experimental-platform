# Chrome MCP Full-Chain Audit Plan

This document preserves the Chrome MCP full-chain inspection plan so future runs can resume without rediscovering scope.
```

## Summary

在 `E:\umlExperimentalPlatform` 本地开发环境执行隔离项目全量检查，使用 Chrome MCP 作为主操作通道，覆盖同一团队项目内多用户协作的「需求 -> 设计 -> 代码 -> 说明书」链路，以及运行历史、模型详情页、项目成员、项目设置、文档中心和模型配置。

默认目标：

- 环境：本地开发环境，优先 `npm run dev:postgres`
- 生成：真实托管模型 / Provider Config
- 数据：新建隔离项目，不改现有真实项目
- 浏览器：Chrome MCP
- 证据：关键截图、当前 URL、关键 DOM 文本、失败网络请求、console error/warn 摘要

## Existing Entrypoints

- 前端路由：`/login`、`/register`、`/projects`、`/projects/new`、`/projects/:projectId`、`/projects/:projectId/settings`、`/projects/:projectId/members`、`/projects/:projectId/history`、`/projects/:projectId/documents`
- 工作台模块：需求、图、设计、代码、说明书、运行任务抽屉、模型详情页、追踪证明/追踪矩阵
- API 交叉核验：`/api/auth/*`、`/api/projects/:projectId/*`、`/api/projects/:projectId/runs/*`、`/api/projects/:projectId/documents/*`、`/api/provider-configs`

## Execution Plan

### 1. Environment And Chrome MCP Setup

- 确认本地服务可访问：Web、API、render-service、OnlyOffice 依赖状态。
- 若服务未启动，按 `npm run dev:postgres` 启动。
- 用 Chrome MCP 初始化浏览器会话，命名为 `UML 全链路检查`，打开本地 Web 地址。
- 检查 `/api/health`、`/api/auth/me`、`/api/provider-configs`。
- 若没有 active 托管 Provider Config，记录为环境阻塞项，因为本轮选择真实模型。
- 只清理本轮隔离数据，统一使用 `codex-e2e-YYYYMMDD-HHMM` 前缀。

### 2. Users, Project, And Team Collaboration

- 未登录访问 `/projects`、`/workspace`、`/exam`、`/tutorial`、`/about`，确认认证保护或导向登录/官网流程。
- 创建或登录三个隔离用户：Owner、Editor、Viewer。
- 本地非生产注册返回 `devToken` 时，用它完成邮箱验证。
- Owner 新建团队项目，填写名称、描述、课程/班级/team 绑定、可见性、默认模型策略。
- 在成员抽屉邀请 Editor 和 Viewer，分别设置编辑者、查看者角色。
- 验证成员列表、头像/邮箱、角色下拉、重发邀请、撤销邀请、移除成员入口。
- 分别以 Owner、Editor、Viewer 登录同一项目，确认项目列表、项目成员、权限标签、项目工作台数据一致。
- Viewer 只能查看，不能执行生成、成员管理、文档管理等受限动作。

### 3. Requirements To Design To Code To Documents

- 需求阶段：输入完整业务需求，生成需求规则和需求 UML 模型。
- 检查生成中状态、SSE/任务抽屉、错误提示、规则列表、PlantUML/SVG 产物。
- 模型详情页：逐个打开用例图、活动图、类图、部署图详情。
- 检查缩放、搜索、列表/网格切换、元素详情、关系详情、下载 PlantUML、打开大图、可编辑集合的新增/编辑/删除入口。
- 设计阶段：检查前置依赖提示，选择顺序图、活动图、类图、部署图、表结构图，生成设计模型。
- 检查追踪证明弹窗、设计图详情页、设计模型与需求模型来源关系。
- 代码阶段：生成前端原型/代码。
- 检查代码文件列表、入口文件、依赖、业务逻辑说明、质量诊断、预览区域、UI mockup、失败/重试状态。
- 说明书阶段：分别生成需求规格说明书和软件设计说明书。
- 检查样式设置、生成按钮前置条件、生成进度、DOCX 下载、文档中心记录、OnlyOffice 编辑配置入口。
- 运行任务抽屉：生成过程中检查 queued/running/completed/failed 状态、模型、阶段、耗时、错误卡片、重试此模型、复制追踪内容等操作。

### 4. History, Documents, And Project Management

- 项目运行历史：按阶段、状态、模型、操作者、时间筛选。
- 打开单条运行详情，检查快照、错误、恢复快照、导出报告、取消运行、重试、重新运行、删除历史。
- 本地历史抽屉：检查历史快照数量、恢复、导出 Markdown、重新下载 DOCX、删除单条、清空历史。
- 文档中心：检查说明书列表、类型筛选、搜索、下载、重命名、版本记录、删除、恢复。
- 项目设置：修改项目描述、可见性、默认 Provider、数据保留策略。
- 执行导出、归档、恢复。
- 删除项目只在隔离项目最后执行，并确认项目列表不再展示。
- 账号与模型设置：检查账号资料、活跃会话、最近登录记录、MFA 状态入口。
- 检查模型设置页只显示托管配置、密钥掩码、默认模型列表、连接测试结果。

### 5. Multi-User Isolation And Permission Checks

- Editor 在同一项目中恢复 Owner 生成的快照，并重新运行其中一个阶段。
- Owner 刷新后能看到新的运行历史和操作者信息。
- Viewer 尝试进入成员、设置、历史删除、文档删除、生成按钮等受限操作。
- 期望 UI 禁用或 API 返回 403，并显示清晰原因。
- 使用另一个非成员用户访问项目 URL、runId、documentId 下载地址。
- 期望 401/403/404，不能通过猜 ID 访问项目数据。
- 交叉检查 API 返回的 `projectId`、`createdByUserId`、`runKind`、`status`、`model`、`documentKind` 与页面展示一致。

## Acceptance Criteria

- 未登录用户不能访问业务页。
- 已登录用户刷新任意项目路由不 404、不丢状态。
- Owner、Editor、Viewer 在同一项目内看到符合角色权限的数据和操作入口。
- 需求、设计、代码、说明书至少各完成一次真实模型生成，并在运行历史中留下可识别记录。
- 需求模型和设计模型详情页均可打开，元素、关系、搜索、缩放、下载和编辑入口无明显 UI/控制台错误。
- 运行历史筛选、详情、恢复、导出、取消、重试、重跑、删除在隔离数据中可操作，页面状态与 API 状态一致。
- DOCX 可下载，重命名、版本、删除、恢复可用。
- 无权限用户不能下载或管理文档。
- 项目设置保存、导出、归档、恢复、删除只影响隔离项目。
- 全程无未处理 console error；失败网络请求均有明确业务原因。
- 截图中无主要文本重叠、空白页或明显布局破裂。

## Assumptions

- 本地开发环境可连接 PostgreSQL，并且 `npm run dev:postgres` 能启动 Web/API/render 所需服务。
- 本地已有可用的 active 托管 Provider Config。
- 若没有真实模型配置或密钥不可用，本轮检查记录为环境阻塞，不降级为桩模式。
- OnlyOffice 若本地不可用，只将编辑器入口标记为依赖阻塞；DOCX 生成和下载仍需验证。
- 所有破坏性动作只作用于 `codex-e2e-*` 隔离账号、项目、运行和文档。
