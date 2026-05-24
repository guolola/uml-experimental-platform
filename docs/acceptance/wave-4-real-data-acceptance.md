本文档定义 Wave 4 后台真实数据与剩余闭环计划的文档化验收清单。

# Wave 4 真实数据与闭环验收

## 验收前置

- 主 API 以 `NODE_ENV=production` 或等价生产配置启动。
- `DATABASE_URL` 指向生产/预发 PostgreSQL，真实用户、项目、run、文档、审计、provider config 和 usage/quota 数据可持久化。
- `SMTP_*` 已配置，并能发送邀请、验证和重置邮件。
- `UML_PROVIDER_SECRET_KEY` 与当前兼容变量 `UML_PROVIDER_CONFIG_SECRET` 已设置为强随机值。
- `UML_PROVIDER_BASE_URL_ALLOWLIST` 只包含允许的模型供应商源。
- `API_CORS_ORIGINS` 同时包含主 Web 前端和后台前端源；后台构建使用 `VITE_ADMIN_API_BASE_URL` 指向主 API。
- 后台独立域名部署时设置 `UML_SESSION_SAMESITE=None` 和 `UML_SESSION_SECURE=true`；同站反代可使用默认 `Lax`。
- 已通过一次性 bootstrap 创建真实 `super_admin`，且 `UML_ENABLE_ADMIN_BOOTSTRAP` 已关闭。不存在生产固定默认账号密码。
- `VITE_ADMIN_DEV_MOCK_FALLBACK` 未设置或为 `false`；所有 legacy provider fallback 开关未设置或为 `false`。
- OnlyOffice 的 `ONLYOFFICE_DOCUMENT_SERVER_URL`、`PUBLIC_API_BASE_URL`、`ONLYOFFICE_JWT_SECRET`、`ONLYOFFICE_ACCESS_TOKEN_SECRET` 已配置。

## 必测场景

| 场景 | 操作 | 预期 |
| --- | --- | --- |
| 未登录访问项目 | 清空 cookie 后访问项目详情、run snapshot、SSE、文档下载接口。 | 返回 `401`；不返回项目、run、文档或 SSE 事件内容。 |
| 跨项目访问 | 使用 A 用户登录后猜测 B 项目的 `projectId`、`runId`、`documentId`。 | 返回 `403`；审计或风险事件记录越权尝试。 |
| Provider SSRF 防护 | 在后台创建或测试不在 `UML_PROVIDER_BASE_URL_ALLOWLIST` 中的 Base URL，例如内网地址或 metadata 地址。 | 请求被拒绝；不发起外部探测；记录 blocked/failed 审计。 |
| Provider 密钥不回显 | 创建、查看、轮换、吊销供应商 API Key。 | 任何响应和页面只显示 masked key、用途、创建人、最近使用时间、风险状态；旧密钥轮换/吊销后不可用。 |
| Admin RBAC | 用不同后台角色访问 Dashboard、用户、项目、文档、provider、审计和系统页。 | 管理员只能查看/操作角色和数据范围允许的资源；高危动作缺权限返回 `403`。 |
| Admin MFA | 管理员登录触发 MFA challenge 并输入正确/错误验证码。 | 正确验证码后获得真实 HttpOnly cookie session；错误或过期验证码返回失败；不能生成本地 mock session。 |
| 邀请邮件 | 管理员邀请项目成员或后台用户，收件人点击邀请完成注册/加入。 | SMTP 发信成功；邀请 token 有效期、重复使用、过期重发和权限不足状态正确。 |
| 文档下载审计 | 有权限用户下载 DOCX，越权用户尝试下载，管理员查看下载记录。 | 成功下载写入审计；越权下载返回 `401/403` 并记录风险；后台文档页能看到下载/签名 URL/OnlyOffice 会话摘要。 |
| 后台真实登录 | 后台使用真实管理员账号登录，刷新页面后访问 `/api/admin/session`。 | AppShell 显示 `Real API`；session 来自主 API；不依赖 `localStorage` mock session。 |
| 管理员 bootstrap | 未开启开关时运行 bootstrap；开启后使用一次性强密码创建管理员；创建后关闭开关。 | 未开启时拒绝；开启后创建未验证邮箱、未启用 MFA 的 `super_admin` 并发送验证邮件；生产响应/日志不使用固定默认密码。 |
| Course dataScope | 用课程管理员账号访问后台用户、项目、run、文档列表。 | 只看到所属课程/班级/team 关联数据；无关课程项目、成员、run、文档不可见，写操作返回 `403`。 |
| Prompt Runtime 治理 | 在后台对 Prompt/Skill Runtime 执行提交审批、批准、回滚、停用。 | 页面调用真实 `/api/admin/prompt-runtime/*` 接口；状态刷新；每个动作写入审计日志。 |
| Dashboard 真实数据 | 后台 Dashboard 加载指标、服务健康、风险事件。 | 数据来自 `/api/admin/metrics`、`/api/admin/system/health`、`/api/admin/risk-events`；真实 API 失败时不静默显示 mock，除非开发显式启用 fallback 且不是 `401/403`。 |
| 用户管理真实数据 | 后台用户列表、禁用、强制退出、重置 MFA。 | 列表来自 `/api/admin/users`；高危动作写入审计；权限不足时 `403` 且不 fallback。 |
| Provider rotate | 后台创建、测试、轮换、吊销 provider config。 | Base URL 受 allowlist 限制；新密钥不回显；轮换/吊销写入审计；调用统计与 quota 更新。 |

## 数据与账单口径

- 本平台不是模型供应商账单事实源。
- 后台模型供应商页可展示调用次数、usage、quota、输入/输出 token、总 token 和可选估算金额。
- 估算金额只能用于运营提示、限流和趋势观察，不能作为对用户收费、退款或财务结算依据。
- 真实费用、折扣、税费、失败重试计费、赠金和账期以外部模型供应商账单为准。

## 验收记录建议

每次 Wave 4 验收至少记录：

- 验收日期、环境、主 API commit、后台前端 commit。
- 生产/预发 env 核对结果，密钥值只记录“已配置”，不得写明文。
- 每个必测场景的操作者、输入摘要、HTTP 状态、页面结果和审计日志 ID。
- 未通过项的阻塞原因、负责人和复验日期。
