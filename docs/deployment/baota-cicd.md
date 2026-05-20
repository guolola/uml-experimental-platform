# 宝塔 PM2 CI/CD 部署说明

本文档描述如何把 软件工程实验平台部署到配置了宝塔面板的服务器，并通过 GitHub Actions 自动发布。

## 部署架构

- 前端：`apps/web/dist`，由宝塔 Nginx 作为静态站点托管。
- API：`uml-api` PM2 进程，监听 `127.0.0.1:4001`。
- PlantUML 渲染服务：`uml-render-service` PM2 进程，监听 `127.0.0.1:4002`。
- Nginx：公网只暴露站点域名；`/api` 反向代理到 API；render-service 不暴露公网。
- PM2：使用 bash 启动 Node 产物，等价于线上已验证的 `cd current && node ...` 启动方式。
- OnlyOffice：可选独立 HTTP 子域名，反向代理到 Document Server，用于在线编辑说明书。

## 服务器准备

在宝塔面板或 SSH 中安装：

```bash
node -v
npm -v
java -version
npm i -g pm2
pm2 -v
```

建议版本：

- Node.js 22.x
- Java 17+ 或 21
- PM2 最新稳定版
- 宝塔 Nginx

创建部署目录：

```bash
mkdir -p /www/wwwroot/uml-platform
```

## GitHub Secrets

在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中配置：

| Secret | 示例 | 说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | `1.2.3.4` | 服务器 IP 或域名 |
| `DEPLOY_USER` | `deploy` | SSH 用户 |
| `DEPLOY_PORT` | `22` | SSH 端口，可不填 |
| `DEPLOY_SSH_KEY` | 私钥内容 | 用于登录服务器的 SSH private key |
| `DEPLOY_PATH` | `/www/wwwroot/uml-platform` | 部署目录，可不填 |

不要把服务器 IP、密码或私钥写入仓库。

## 宝塔站点配置

在宝塔中新增站点，域名按你的实际域名填写。

站点根目录设置为：

```text
/www/wwwroot/uml-platform/current/apps/web/dist
```

首次部署前 `current` 目录可能不存在，可以先创建站点，等 GitHub Actions 首次部署完成后再检查目录。

## Nginx 配置

在宝塔站点的 Nginx 配置中加入或调整以下规则：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

`proxy_buffering off` 用于保证 SSE 生成进度可以实时返回。

注意：`proxy_pass` 后面不要追加 `/api/` 或尾部 `/`。前端会请求 `/api/...`，后端路由也以 `/api/...` 开头，Nginx 需要原样转发 URI，否则会出现 `/api/api/runs` 或 `/api//runs`。

## 发布流程

推送到 `main` 分支后，GitHub Actions 会自动执行：

```bash
npm ci
npm run build:contracts
npm run build:prompts
npm run test:contracts
npm run test:api
npm run test:render
npm run test:web
npm run build:api
npm run build:render
VITE_APP_API_BASE_URL="" npm run build:web
```

随后工作流会打包发布产物并上传到服务器，由 `scripts/deploy/baota-pm2-deploy.sh` 完成：

- 解压到 `/www/wwwroot/uml-platform/releases/<commit-sha>`
- 安装生产依赖
- 检查 Web dist 和 PlantUML jar
- 更新 `/www/wwwroot/uml-platform/current` 软链接
- 使用 PM2 重启 `uml-api` 和 `uml-render-service`
- 自动检查 `http://127.0.0.1:4001/api/health` 和 `http://127.0.0.1:4002/health`，失败时直接让 GitHub Actions 失败并输出 PM2 日志
- 清理旧版本，只保留最近 5 个 release

## 验证

服务器上执行：

```bash
pm2 status
ss -lntp | grep -E '4001|4002'
curl http://127.0.0.1:4001/api/health
curl http://127.0.0.1:4002/health
curl http://服务器IP/api/health
```

render-service 的 health 返回中应包含：

```json
{
  "status": "ok",
  "jarAvailable": true
}
```

浏览器验证：

- 访问站点首页。
- 刷新 `/exam`、`/tutorial`、`/about` 不应 404。
- 发起一次需求生成，SSE 进度应正常滚动。
- SVG 预览应能正常渲染。

## 常用运维命令

```bash
cd /www/wwwroot/uml-platform/current
pm2 status
ss -lntp | grep -E '4001|4002'
pm2 logs uml-api
pm2 logs uml-render-service
pm2 restart uml-api
pm2 restart uml-render-service
```

## 回滚

查看已有 release：

```bash
ls -1 /www/wwwroot/uml-platform/releases
```

切换 `current` 到某个旧版本：

```bash
ln -sfnT /www/wwwroot/uml-platform/releases/<release-sha> /www/wwwroot/uml-platform/current
cd /www/wwwroot/uml-platform/current
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
```

如果宝塔报错 `current/apps/web/dist` 或 `current/apps` 不存在，通常是 `current` 软链接指向的 release 已被清理。先检查：

```bash
readlink -f /www/wwwroot/uml-platform/current
ls -l /www/wwwroot/uml-platform/releases
```

然后选择一个仍包含前端产物的 release 恢复：

```bash
for d in /www/wwwroot/uml-platform/releases/*; do
  [ -f "$d/apps/web/dist/index.html" ] && echo "$d"
done

ln -sfnT /www/wwwroot/uml-platform/releases/<release-sha> /www/wwwroot/uml-platform/current
cd /www/wwwroot/uml-platform/current
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save
```

发布脚本会按目录更新时间清理旧 release，并保护 `current` 当前指向的版本，避免再次误删正在使用的 release。

宝塔可能会在站点目录写入 `.user.ini`。如果旧 release 清理时提示 `.user.ini` 无法删除，发布脚本会保留该旧 release 并继续完成部署；这不影响当前版本运行。需要彻底清理时，可在服务器上检查文件属性和归属后手动处理。

## 常见问题

### `/api` 没有响应

检查：

```bash
pm2 logs uml-api
curl http://127.0.0.1:4001/api/health
```

如果本机 curl 正常，重点检查宝塔 Nginx 反向代理配置。

如果 `pm2 status` 显示 online 但端口没有监听，说明 PM2 没有真正跑起 Node 服务。当前生产配置应使用 `ecosystem.config.cjs` 中的 bash 启动方式，等价于：

```bash
pm2 start bash --name uml-render-service -- -lc 'cd /www/wwwroot/uml-platform/current && RENDER_SERVICE_HOST=127.0.0.1 RENDER_SERVICE_PORT=4002 node apps/render-service/dist/index.js'
pm2 start bash --name uml-api -- -lc 'cd /www/wwwroot/uml-platform/current && API_HOST=127.0.0.1 API_PORT=4001 RENDER_SERVICE_BASE_URL=http://127.0.0.1:4002 node apps/api/dist/index.js'
```

如果日志出现 `Route POST:/api/api/runs not found` 或 `Route POST:/api//runs not found`，说明 Nginx 或前端构建变量重复拼接了 `/api`。确认线上 Nginx 使用：

```nginx
proxy_pass http://127.0.0.1:4001;
```

同时确认 GitHub Actions 使用：

```bash
VITE_APP_API_BASE_URL="" npm run build:web
```

### OnlyOffice 说明书编辑器

如果线上平台仍使用 HTTP，OnlyOffice 也应使用浏览器可访问的 HTTP 地址，例如：

```env
ONLYOFFICE_DOCUMENT_SERVER_URL=http://office.example.com
PUBLIC_API_BASE_URL=http://platform.example.com
ONLYOFFICE_JWT_SECRET=<与 Document Server 一致的强随机密钥>
ONLYOFFICE_ACCESS_TOKEN_SECRET=<强随机密钥>
UML_DOCUMENT_STORAGE_DIR=/www/wwwroot/uml-platform/shared/documents
```

`PUBLIC_API_BASE_URL` 必须是 OnlyOffice Document Server 能访问的平台地址，因为它需要读取
`/api/documents/:documentId/file` 并回调
`/api/documents/:documentId/onlyoffice/callback` 保存编辑结果。

说明书文件物理上保存在同一个 `UML_DOCUMENT_STORAGE_DIR` 根目录下，但会按浏览器匿名工作区分目录：

```text
/www/wwwroot/uml-platform/shared/documents/<workspaceId>/<documentId>/
```

因此多个用户同时访问网站时，默认只会看到自己浏览器工作区生成的说明书，不会共享同一份文档列表。该匿名隔离不是正式登录系统；如果后续接入账号体系，可以把 `workspaceId` 绑定到真实用户或项目。

HTTP 可以工作，但公网传输不加密，说明书内容和短期访问 token 仍可能被网络中间人看到。涉及真实隐私数据时，建议后续将平台域名和 OnlyOffice 域名一起升级到 HTTPS。

OnlyOffice 子域名可在宝塔 Nginx 中反代到容器端口，例如：

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

部署后检查：

```bash
curl http://office.example.com/healthcheck
curl http://platform.example.com/api/health
```

### SVG 渲染失败

检查：

```bash
java -version
curl http://127.0.0.1:4002/health
```

如果 `jarAvailable` 是 `false`，说明发布包中没有包含：

```text
plantuml/build/libs/plantuml-1.2026.3beta8.jar
```

### 前端刷新 `/exam` 404

检查 Nginx 是否有：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```
