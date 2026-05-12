# API Service

默认监听 `http://127.0.0.1:4001`。

常用命令：

```bash
npm run dev:api
npm run build:api
npm run test:api
```

依赖：

- Comfly 流式聊天接口 `POST /v1/chat/completions`
- 渲染服务默认地址 `http://127.0.0.1:4002`

Provider 配置约定：

- 前端设置中的 `Base URL` 只填写 `https://ai.comfly.chat`
- API 服务会固定拼接 `/v1/chat/completions`
- `API Key` 以 `Authorization: Bearer <key>` 方式透传给模型服务

环境变量：

- `API_HOST`
- `API_PORT`
- `RENDER_SERVICE_BASE_URL`

如果 `4001` 端口被本机其他程序占用，可临时改端口启动：

```powershell
$env:API_PORT=4101
npm run dev:api
```
