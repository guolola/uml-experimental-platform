# API Service

默认监听 `http://127.0.0.1:4001`。

常用命令：

```bash
npm run dev:api
npm run build:api
npm run test:api
```

根目录的 `npm run dev` 会为本地 API 自动注入说明书编辑器所需变量，并检查/启动
`onlyoffice-documentserver` Docker 容器。直接单独运行 `npm run dev:api` 时不会自动
注入这些变量；如果需要单独调 API 并打开 OnlyOffice，请从根目录运行：

```powershell
npm run dev:office
npm run dev:api:safe
```

依赖：

- Model Provider 流式聊天接口 `POST /v1/chat/completions`
- 渲染服务默认地址 `http://127.0.0.1:4002`

Provider 配置约定：

- 前端设置中的 `Base URL` 只填写 `https://<your_api_provider>`
- API 服务会固定拼接 `/v1/chat/completions`
- `API Key` 以 `Authorization: Bearer <key>` 方式透传给模型服务

环境变量：

- `API_HOST`
- `API_PORT`
- `RENDER_SERVICE_BASE_URL`
- `ONLYOFFICE_DOCUMENT_SERVER_URL`：OnlyOffice Document Server 地址，可为 HTTP 或 HTTPS。
- `PUBLIC_API_BASE_URL`：OnlyOffice 容器可访问的平台 API 公网地址。
- `ONLYOFFICE_JWT_SECRET`：OnlyOffice Docs JWT 密钥，需与 Document Server 配置一致。
- `ONLYOFFICE_ACCESS_TOKEN_SECRET`：说明书 file/callback 短期访问 token 密钥，未配置时回退到 `ONLYOFFICE_JWT_SECRET`。
- `UML_DOCUMENT_STORAGE_DIR`：说明书持久化目录，生产环境建议放到 release 目录之外。

说明书编辑器使用匿名工作区隔离：前端会为每个浏览器生成 `X-UML-Workspace-Id`
和 `X-UML-Workspace-Secret`，API 只返回当前工作区下的说明书。OnlyOffice
访问 DOCX 文件和保存回调时使用短期签名 URL，不依赖浏览器 header。

如果 `4001` 端口被本机其他程序占用，可临时改端口启动：

```powershell
$env:API_PORT=4101
npm run dev:api
```

本地 OnlyOffice 排查：

```powershell
docker version
where.exe docker
curl http://127.0.0.1:8080/healthcheck
curl http://127.0.0.1:4101/api/version
```

如果 `where.exe docker` 找不到 Docker CLI，请安装 Docker Desktop，或把
`C:\Program Files\Docker\Docker\resources\bin` 加入 PATH 后重新打开 PowerShell。
如果 Docker 命令存在但 daemon 不可用，请启动 Docker Desktop 并等待它就绪。
`/api/version` 中 `features.onlyOfficeDocumentServerConfigured` 为 `false` 时，说明 API
进程没有拿到 `ONLYOFFICE_DOCUMENT_SERVER_URL`；使用根目录 `npm run dev` 或
`npm run dev:api:safe` 启动即可。
