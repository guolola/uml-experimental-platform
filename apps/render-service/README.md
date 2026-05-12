# Render Service

默认监听 `http://127.0.0.1:4002`。

常用命令：

```bash
npm run dev:render
npm run build:render
npm run test:render
```

渲染方式：

- 调用 `plantuml/build/libs/plantuml-1.2026.3beta8.jar`
- 通过 `java -jar ... -tsvg -pipe` 输出 SVG

环境变量：

- `RENDER_SERVICE_HOST`
- `RENDER_SERVICE_PORT`

推荐启动顺序：

1. `npm run dev:render`
2. `npm run dev:api`
3. `npm run dev:web`

如果 API 改成了非默认端口，前端开发时可这样覆盖：

```powershell
$env:VITE_APP_API_BASE_URL='http://127.0.0.1:4101'
npm run dev:web
```
