# 用户体系与后台管理系统实施路线图

## Summary

本文档定义用户体系与后台管理系统的实施顺序。主规格以 [user-admin-platform-spec.md](../product/user-admin-platform-spec.md) 为准；本文档只负责执行分期、交付边界和验证重点。

## Phase 1: 保存规格与后台仓库规范

- 在主项目保存完整产品规格。
- 在主项目保存实施路线图。
- 在后台同级仓库目录创建 `AGENTS.md`。
- 在后台同级仓库目录创建后台前端 `docs/product-spec.md`。
- 后续所有子代理任务必须引用主规格文档。

## Phase 2: 主项目前端实名用户侧能力

目标是在 `apps/web` 中落地实名用户入口，接入真实 `auth/project/provider/run/document` API。生产业务功能必须登录后使用，未登录只能访问官网首页和认证页。

页面范围：

- `/login`
- `/register`
- `/verify-email`
- `/forgot-password`
- `/reset-password`
- `/projects`
- `/projects/new`
- `/projects/:projectId`
- `/projects/:projectId/settings`
- `/projects/:projectId/members`
- `/projects/:projectId/history`
- `/projects/:projectId/documents`
- 右上角账号弹窗：资料、安全、会话。
- 右上角设置弹窗：模型、偏好。

实现重点：

- 保持 `app`、`features`、`entities`、`services`、`shared` 边界。
- 登录态工作台必须运行在实名项目上下文。
- 模型设置登录态只使用托管 Provider Config，不使用明文 `apiKey/apiBaseUrl` 作为生成主路径。
- 账号、模型、偏好、安全能力统一通过右上角弹窗进入，不再维护独立账号页、安全页或模型设置页作为当前入口。
- 未登录访问 `/projects`、`/workspace`、`/exam`、`/tutorial`、`/about` 等业务页时回到官网首页或认证流程。

验证重点：

- 路由匹配正确。
- 顶部导航、右上角设置/账号弹窗和项目卡片跳转正确。
- 表单具备可访问 label。
- 页面包含加载、空态、错误态或权限不足态。
- 401/403 不降级到匿名工作台。
- `npm run test:web`
- `npm run typecheck:web`

## Phase 3: 后台管理独立仓库真实 API 优先

目标是在 `E:\umlExperimentalPlatform-admin` 中运行独立管理端前端仓库。后台默认使用主项目真实 `/api/admin/*` API；mock fixture 只保留为显式开发 fallback，必须通过 `VITE_ADMIN_DEV_MOCK_FALLBACK=true` 开启，且 `401/403` 永不 fallback。

推荐技术栈：

- React 18
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Radix UI
- lucide-react
- TanStack Table
- TanStack Query
- Vitest
- Testing Library

页面范围：

- 后台登录。
- Dashboard。
- 用户管理。
- 组织/班级/团队管理。
- 角色与权限。
- 项目/工作区管理。
- 生成任务中心。
- 运行详情。
- 产物与追踪链路。
- 文档管理。
- 模型供应商配置。
- Prompt 与 Skill Runtime。
- 安全与风控。
- 系统配置与运维监控。

实现重点：

- 真实 API client 是默认数据路径。
- Mock fixture 只作为本地开发显式 fallback，不作为产品事实源。
- 页面组件只做组合。
- 操作流放到 `features`。
- 表格、状态 Badge、时间线、指标卡统一抽到 `widgets` 或 `shared`。
- API Key 永不明文显示。

验证重点：

- 菜单可进入所有页面。
- Dashboard 指标来自真实 API 或明确的 empty/error 状态。
- Runs 表格可筛选。
- Run detail 可展示阶段时间线。
- 用户、项目、文档、模型页面具备关键状态。
- 主 API 停止或 CORS 配置错误时，后台显示错误状态，不自动显示 mock 数据。
- `npm run test`
- `npm run build`

## Phase 4: 主 API 用户、项目与权限基础

目标是在主项目 API 中建立“用户 -> 项目 -> run/document”的归属链。

后端能力：

- 用户模型。
- 会话模型。
- 项目模型。
- 项目成员模型。
- 认证 guard。
- 项目权限 guard。
- 管理员 guard。
- 登录、注册、刷新、登出、`/me`。
- 项目 CRUD。
- 项目成员管理。

安全默认：

- 非公开路由默认要求登录。
- refresh token 使用 `HttpOnly + Secure + SameSite` Cookie。
- 密码使用安全哈希。
- 登录失败统一错误文案。
- 项目默认私有。
- 管理接口必须写审计日志。

验证重点：

- 未登录访问项目返回 401。
- 非成员访问项目返回 403。
- 禁用用户不能访问。
- 不能移除最后一个管理员。
- `npm run test:contracts`
- `npm run test:api`

## Phase 5: Run 和 Document 持久化

目标是替换内存 run record 和匿名 document workspace 依赖。生产前台匿名入口已移除；legacy 能力仅允许 dev/test 或底层兼容，不作为产品功能。

后端能力：

- run 持久化。
- run event 持久化。
- run snapshot 绑定 `projectId` 和 `createdByUserId`。
- SSE 鉴权和历史事件补发。
- 文档元数据绑定项目。
- OnlyOffice 文件和 callback 使用短期签名 token。
- 文档下载校验项目权限。

验证重点：

- A 用户不能读 B 用户 run snapshot。
- A 用户不能订阅 B 用户 SSE。
- 非成员不能下载项目文档。
- OnlyOffice token 过期返回 403。
- OnlyOffice token purpose 错误返回 403。

## Phase 6: 模型供应商配置与安全收口

目标是把当前前端传入任意 `apiBaseUrl` / `apiKey` 的模式收口到后端配置中心。

后端能力：

- 模型供应商配置。
- Base URL allowlist。
- API Key 加密保存。
- 密钥轮换和吊销。
- 用户/组织/项目配额。
- 失败熔断。
- 调用审计。

安全默认：

- 不允许用户提交任意模型 Base URL 触发后端请求。
- API Key 只写不读。
- 错误响应脱敏。
- 限流按用户、项目、组织、IP、任务类型、模型供应商多层执行。

## Phase 7: 后台真实 Admin API 运行

目标是让 `E:\umlExperimentalPlatform-admin` 默认使用主项目 admin endpoints；mock fixture 只保留为显式开发 fallback，必须通过 `VITE_ADMIN_DEV_MOCK_FALLBACK=true` 开启，且 401/403 永不 fallback。

接口范围：

- `/api/admin/metrics`
- `/api/admin/users`
- `/api/admin/projects`
- `/api/admin/runs`
- `/api/admin/documents`
- `/api/admin/provider-configs`
- `/api/admin/audit-logs`
- `/api/admin/risk-events`
- `/api/admin/rate-limits`
- `/api/admin/system/health`

验证重点：

- 管理员登录后能访问后台页面。
- 非管理员不能访问 admin endpoints。
- 所有高危操作写入审计日志。
- 主 API 停止或 CORS 配置错误时，后台显示错误状态，不自动显示 Mock 数据。
- 后台页面无法查看 API Key 明文。
- Base URL 不在白名单时无法测试或生成。

## Phase 8: 真实环境验收与文档维护

- 使用真实 PostgreSQL、SMTP/dev token、HttpOnly Cookie、CORS、Provider 托管配置和后台管理员 session 做预发验收。
- 确认主项目前端用户侧页面接真实 auth/project/provider/run/document API。
- 确认后台管理仓库默认接真实 admin API，mock 仅显式开发 fallback。
- 更新主规格文档。
- 更新后台仓库产品文档。
- 更新 README 和部署说明。
- 做端到端验收。

最终验收：

- 未登录用户不能访问任何项目、run snapshot、SSE、文档下载。
- A 用户不能通过猜测 `runId` 或 `documentId` 访问 B 用户项目数据。
- 管理员只能在自己的角色和数据范围内查看/操作。
- API Key 页面无法读回明文，轮换/吊销后旧密钥不可用。
- Provider Base URL 不在白名单时无法测试或生成。
- 所有后台高危操作都能在审计日志中查到操作者、目标、时间、IP、结果。
- 运行历史从本地迁移为服务端后，项目切换、恢复快照、删除历史都有明确确认和权限校验。
