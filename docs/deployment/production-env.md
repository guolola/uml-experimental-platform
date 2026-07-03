本文档列出生产环境接入真实用户、项目、后台管理和模型供应商配置时必须确认的环境变量。

# 生产环境变量清单

## API 与持久化

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NODE_ENV=production` | 是 | 生产模式。关闭仅供本地开发使用的宽松默认值。 |
| `API_HOST` | 是 | API 监听地址。宝塔/PM2 部署建议为 `127.0.0.1`，由 Nginx 反代。 |
| `API_PORT` | 是 | API 监听端口，例如 `4001`。 |
| `DATABASE_URL` | 是 | PostgreSQL 连接串。真实用户、项目、run、文档元数据、审计、供应商配置和 usage/quota 都应落库；未配置时只能视为本地/临时模式。 |
| `RENDER_SERVICE_BASE_URL` | 是 | API 调用 PlantUML render-service 的内网地址，例如 `http://127.0.0.1:4002`。 |
| `UML_DOCUMENT_STORAGE_DIR` | 是 | DOCX 和文档二进制存储目录。生产环境必须放在 release 目录外，例如 `/www/wwwroot/uml-platform/shared/documents`。 |
| `UML_PROJECT_WORKSPACE_BODY_LIMIT_BYTES` | 建议 | 项目工作台保存请求体上限，默认 `52428800`（50MB）。Nginx 的 `client_max_body_size` 也应同步设置为 `50m`，避免恢复旧大快照时在反代层被 413 拦截。 |
| `UML_TRACE_RAW_OUTPUT_MAX_CHARS` | 否 | run trace 中 LLM 原始输出的单条保存上限，默认 `8000`。超长内容会保留头尾摘要并记录原始长度，避免 PostgreSQL snapshot 和日志膨胀。 |
| `UML_PERSIST_PROGRESS_SNAPSHOT` | 否 | 是否为 `llm_chunk`/`stage_progress` 类进度事件整包保存 snapshot。生产默认不要设置或设为 `false`，仅排查恢复问题时临时设为 `true`。 |

## 后台管理员 Bootstrap

生产环境不提供固定默认管理员账号密码。`admin@example.edu / mock-password` 只允许作为后台前端开发页的占位输入，不是真实主 API 账号。

首次初始化管理员时，临时设置以下变量并运行主 API 工作区脚本：

```bash
UML_ENABLE_ADMIN_BOOTSTRAP=true \
UML_BOOTSTRAP_ADMIN_EMAIL=admin@example.edu \
UML_BOOTSTRAP_ADMIN_PASSWORD='<一次性强密码>' \
UML_BOOTSTRAP_ADMIN_DISPLAY_NAME='平台管理员' \
npm run bootstrap:admin --workspace @uml-platform/api
```

Bootstrap 会创建 `super_admin` 用户、生成邮箱验证 token，并通过 SMTP 发送验证邮件。生产环境必须由运维提供一次性强密码，禁止使用空密码、`mock-password`、`password-123` 等开发默认值。创建成功后应立即关闭 `UML_ENABLE_ADMIN_BOOTSTRAP`，首次进入后台前需要完成邮箱验证和 TOTP MFA 设置。

## 邮件与邀请

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `SMTP_HOST` | 是 | 邮件服务器地址。邀请注册、邮箱验证、重置密码依赖它。 |
| `SMTP_PORT` | 是 | 邮件服务器端口，通常为 `587` 或 `465`。 |
| `SMTP_USER` | 是 | SMTP 账号。 |
| `SMTP_PASS` | 是 | SMTP 密码或应用专用密钥。 |
| `SMTP_FROM` | 是 | 平台发信人地址。 |
| `SMTP_SECURE` | 建议 | `true` 时使用 TLS；端口 `465` 会按安全连接处理。 |

## 模型供应商安全

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `UML_PROVIDER_SECRET_KEY` | 是 | 生产供应商 API Key 加密主密钥。必须是强随机值，并按密钥管理流程保管。若当前代码版本仍读取 `UML_PROVIDER_CONFIG_SECRET`，生产部署需同时设置两者为同一个强随机值，直到完成变量名统一。 |
| `UML_PROVIDER_CONFIG_SECRET` | 兼容 | 当前 provider config 存储实现读取的加密密钥名。不要使用本地开发默认值。 |
| `UML_ALLOW_LEGACY_PROVIDER_TEST` | 否 | 仅本地/测试可显式设为 `true`，允许旧的明文 provider test 入口。生产必须为空或 `false`。 |
| `UML_ALLOW_PROJECT_LEGACY_PROVIDER_SETTINGS` | 否 | 仅本地/测试可显式设为 `true`，允许项目 run 使用前端传入的明文 provider settings。生产必须为空或 `false`，项目 run 应使用后端托管的 `providerConfigId`。 |

模型供应商配置只保存密钥密文、hash、掩码尾号、用途、创建人、最近使用时间和风险状态；任何管理端或用户端接口都不能回显 API Key 明文。Provider Base URL 不使用静态域名白名单，而是在每次外部请求前强制校验 HTTPS、默认端口和全部 DNS 解析结果均为公网地址，并拒绝重定向。

模型费用不是本平台账单事实源。本平台只能记录调用次数、usage、quota、token 数量和可选估算金额，用于运营观察与限流；真实费用、退款、折扣和税费以外部模型供应商账单为准。

## CORS 与前端地址

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `API_CORS_ORIGINS` | 是 | 允许访问主 API 的 Web/Admin 前端源，逗号分隔，例如 `https://uml.example.edu,https://admin.uml.example.edu`。SSE 也必须使用同一 allowlist。 |
| `UML_SESSION_SAMESITE` | 建议 | Session Cookie 的 SameSite，可为 `Lax`、`Strict` 或 `None`。同站部署推荐 `Lax`；后台独立域名需要 `None`。 |
| `UML_SESSION_SECURE` | 建议 | `true/false`。生产默认 `true`；当 `UML_SESSION_SAMESITE=None` 时必须为 `true`，否则 API 会拒绝设置 session cookie。 |
| `RENDER_SERVICE_CORS_ORIGINS` | 是 | 允许访问 render-service 的源。生产通常只允许主站域名；render-service 不建议公网直暴露。 |
| `VITE_APP_API_BASE_URL` | 前端构建 | 主 Web 前端访问 API 的 base。与 Nginx 同域反代时可为空字符串；跨域部署时填主 API 公网 base，例如 `https://uml.example.edu`。 |
| `VITE_ADMIN_API_BASE_URL` | 后台构建 | 后台管理前端访问主 API 的 base，例如 `https://uml.example.edu`。后台也可兼容 `VITE_APP_API_BASE_URL`，但生产推荐使用后台专用变量。 |
| `PUBLIC_WEB_BASE_URL` | 建议 | 前台公网 base，例如 `https://platform.example.com`，用于注册验证邮件、找回密码邮件等浏览器链接。未配置时会回退使用 `PUBLIC_API_BASE_URL`。 |
| `ADMIN_WEB_BASE_URL` | 建议 | 后台前端公网 base，例如 `https://admin.uml.example.edu`，用于运维记录、邮件或回调白名单口径。若当前代码未读取该变量，也应在部署文档和反代配置中保留。 |

跨域使用 HttpOnly cookie session 时，API 必须允许 credentials，前端请求必须带 `credentials: "include"`，Cookie 应配置 `HttpOnly + Secure + SameSite`，生产 HTTPS 下建议使用 `SameSite=None; Secure` 支持独立后台域名。

## OnlyOffice

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ONLYOFFICE_DOCUMENT_SERVER_URL` | 是 | 浏览器可访问的 OnlyOffice Document Server 地址。公网真实数据建议 HTTPS。 |
| `PUBLIC_API_BASE_URL` | 是 | OnlyOffice 容器/服务可访问的平台 API 公网地址，用于读取文档文件和保存 callback。 |
| `ONLYOFFICE_JWT_SECRET` | 是 | 与 OnlyOffice Document Server 一致的 JWT 密钥。 |
| `ONLYOFFICE_ACCESS_TOKEN_SECRET` | 是 | 文档 file/callback 短期访问 token 密钥。未设置时部分代码会回退到 `ONLYOFFICE_JWT_SECRET`，生产应单独设置。 |
| `ONLYOFFICE_CALLBACK_MAX_BYTES` | 建议 | 限制 callback 请求体大小，防止异常大文件回调。 |

OnlyOffice 文件 URL、callback URL 和签名 token 必须限制来源、用途、过期时间、文件大小和项目权限。文档下载、OnlyOffice 打开和 callback 保存都应写入审计或风险事件。

## 后台真实 API 与 legacy fallback

后台管理仓库 `E:\umlExperimentalPlatform-admin` 是独立前端，生产只连接主项目 API 的 `/api/admin/*`、`/api/auth/login`、`/api/auth/mfa/verify` 和 `/api/admin/session`。

生产后台构建建议：

```bash
VITE_ADMIN_API_BASE_URL=https://uml.example.edu VITE_ADMIN_DEV_MOCK_FALLBACK=false npm run build
```

`VITE_ADMIN_DEV_MOCK_FALLBACK=true` 只能用于开发联调。当真实 API 返回 `401` 或 `403` 时，后台必须显示未登录或权限不足，不能降级到 mock。生产环境不应启用任何 legacy/mock fallback 开关。
