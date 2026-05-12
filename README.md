# UML Experimental Platform

## Development

日常开发首选一键启动：

```powershell
npm run dev
```

这个命令会同时启动：

- `render-service`
- `api`
- `web`

并默认使用本机稳妥端口方案：

- `render-service`: `http://127.0.0.1:4002`
- `api`: `http://127.0.0.1:4101`
- `web`: Vite 输出的本地地址 

如果明确想走标准默认端口， 也可以用：

```powershell
npm run dev:default
```

标准默认端口为：

- `render-service`: `4002`
- `api`: `4001`

## Notes

- 页面里的 `API Base URL / API Key / 默认模型` 仍需在前端设置面板中填写。
- `API Base URL` 只填写站点根地址：`https://ai.comfly.chat`
- 不需要手动填写 `/v1` 或 `/v1/chat/completions`，系统会自动拼接流式接口路径。
- 一键启动只负责把三个本地服务拉起来，不会替你注入模型密钥。
- 如果需要只单独启动某个服务，也可以继续使用：

```powershell
npm run dev:render
npm run dev:api
npm run dev:web
```
