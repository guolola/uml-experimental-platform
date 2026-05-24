# 宝塔 PM2 CI/CD 部署说明

本文档描述如何把 软件工程实验平台部署到配置了宝塔面板的服务器，并通过 GitHub Actions 自动发布。

## 部署架构

- 前端：`apps/web/dist`，由宝塔 Nginx 作为静态站点托管。
- API：`uml-api` PM2 进程，监听 `127.0.0.1:4001`。
- PlantUML 渲染服务：`uml-render-service` PM2 进程，监听 `127.0.0.1:4002`。
- Nginx：公网只暴露站点域名；`/api` 反向代理到 API；render-service 不暴露公网。
- PM2：使用 bash 启动 Node 产物，等价于线上已验证的 `cd current && node ...` 启动方式。
- OnlyOffice：需要独立 Document Server，建议使用单独子域名反向代理，用于在线编辑说明书。

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

## 已有宝塔环境增量核对

如果线上站点、PM2、Nginx 反向代理之前已经配置好，不需要重建服务器或删除现有站点。按下面清单补齐这次新增的生产依赖即可。

1. **保留现有站点和 PM2 进程名**
   - 主站根目录仍指向 `/www/wwwroot/uml-platform/current/apps/web/dist`。
   - API 仍使用 `uml-api`，Render Service 仍使用 `uml-render-service`。
   - 不需要手动改 release 软链接，发布脚本会自动切换。

2. **核对 PostgreSQL 是否已可用**
   ```bash
   psql "$DATABASE_URL" -c "select 1;"
   ```
   如果线上还在用本地文件或临时数据目录，需要在 `/www/wwwroot/uml-platform/shared/production.env` 补上正式 `DATABASE_URL`。API 启动时会自动执行 migrations。

3. **核对 OnlyOffice 是否已可用**
   ```bash
   curl http://127.0.0.1:8080/healthcheck
   curl http://office.example.com/healthcheck
   ```
   如果容器已经存在，只要确认 `JWT_SECRET` 和 `production.env` 里的 `ONLYOFFICE_JWT_SECRET` 一致，不需要重建容器。

4. **只补缺失的生产变量**
   重点检查这些变量是否存在且是生产值：
   - `NODE_ENV=production`
   - `DATABASE_URL`
   - `API_CORS_ORIGINS`
   - `RENDER_SERVICE_CORS_ORIGINS`
   - `PUBLIC_API_BASE_URL`
   - `ONLYOFFICE_DOCUMENT_SERVER_URL`
   - `ONLYOFFICE_JWT_SECRET`
   - `ONLYOFFICE_ACCESS_TOKEN_SECRET`
   - `UML_DOCUMENT_STORAGE_DIR`
   - `UML_PROVIDER_SECRET_KEY`
   - `UML_PROVIDER_BASE_URL_ALLOWLIST`

5. **核对 GitHub Secrets**
   只要 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_PORT`、`DEPLOY_SSH_KEY`、`DEPLOY_PATH` 已经正确，就不需要新增数据库密码到 GitHub Secrets；数据库和 OnlyOffice 生产密钥保留在服务器的 `production.env`。

6. **发布后只做验证**
   ```bash
   pm2 status
   curl http://127.0.0.1:4001/api/health
   curl http://127.0.0.1:4002/health
   curl -s http://platform.example.com/api/version
   ```
   `/api/version` 里应显示生产模式，并且文档编辑器配置为已启用。

## 宝塔上线操作步骤

按下面顺序做，能减少“代码已发布但数据库/文档编辑器没连上”的情况。

1. **准备域名和端口**
   - 主站域名指向宝塔站点，例如 `platform.example.com`。
   - OnlyOffice 建议使用独立子域名，例如 `office.example.com`。
   - 服务器内网端口规划：API `4001`，Render Service `4002`，OnlyOffice 容器 `8080`，PostgreSQL `5432`。

2. **安装 PostgreSQL 并创建库**
   ```bash
   sudo -u postgres psql
   ```
   ```sql
   create user uml_user with encrypted password '<强密码>';
   create database uml_platform owner uml_user;
   grant all privileges on database uml_platform to uml_user;
   \q
   ```
   然后验证：
   ```bash
   psql "postgres://uml_user:<强密码>@127.0.0.1:5432/uml_platform" -c "select 1;"
   ```
   `DATABASE_URL` 必须写入 `/www/wwwroot/uml-platform/shared/production.env`。API 启动时会自动执行内置 migrations。

3. **准备 OnlyOffice Document Server**
   如果用 Docker：
   ```bash
   docker run -d \
     --name onlyoffice-documentserver \
     --restart always \
     -p 8080:80 \
     -e JWT_ENABLED=true \
     -e JWT_SECRET='<与 production.env 一致的强随机密钥>' \
     onlyoffice/documentserver
   ```
   验证：
   ```bash
   curl http://127.0.0.1:8080/healthcheck
   ```
   正常应返回 `true`。

4. **配置宝塔站点和反向代理**
   - 主站根目录：`/www/wwwroot/uml-platform/current/apps/web/dist`
   - 主站 `/api/` 反代到 `http://127.0.0.1:4001`
   - 主站 `/` 使用 `try_files $uri $uri/ /index.html;`
   - OnlyOffice 子域名反代到 `http://127.0.0.1:8080`

5. **写入生产环境变量**
   在 `/www/wwwroot/uml-platform/shared/production.env` 写入 PostgreSQL、SMTP、Provider 加密密钥、CORS、OnlyOffice 和文档存储目录。发布脚本每次启动 PM2 前都会加载这个文件。

6. **配置 GitHub Secrets**
   在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 配置 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_PORT`、`DEPLOY_SSH_KEY`、`DEPLOY_PATH`。

7. **推送 main 触发部署**
   GitHub Actions 会先跑 PostgreSQL + OnlyOffice smoke，再测试、构建、打包并上传到宝塔服务器。CI 通过后再看服务器 PM2 和 `/api/version`。

8. **首次创建后台管理员**
   发布成功后只临时打开 bootstrap 变量，执行一次：
   ```bash
   cd /www/wwwroot/uml-platform/current
   set -a
   . /www/wwwroot/uml-platform/shared/production.env
   set +a
   UML_ENABLE_ADMIN_BOOTSTRAP=true \
   UML_BOOTSTRAP_ADMIN_EMAIL=admin@example.edu \
   UML_BOOTSTRAP_ADMIN_PASSWORD='<一次性强密码>' \
   UML_BOOTSTRAP_ADMIN_DISPLAY_NAME='平台管理员' \
   npm run bootstrap:admin --workspace @uml-platform/api
   ```
   创建完成后不要把 `UML_ENABLE_ADMIN_BOOTSTRAP=true` 长期留在 `production.env`。

9. **部署后验收**
   ```bash
   pm2 status
   curl http://127.0.0.1:4001/api/health
   curl http://127.0.0.1:4002/health
   curl http://office.example.com/healthcheck
   curl -s http://platform.example.com/api/version
   ```
   `/api/version` 中应看到 `nodeEnv` 为 `production`，且 `onlyOfficeDocumentServerConfigured` 为 `true`。

创建部署目录：

```bash
mkdir -p /www/wwwroot/uml-platform/shared
chmod 700 /www/wwwroot/uml-platform/shared
```

生产环境变量放在部署目录外的 shared 文件中，避免每次 release 覆盖，也避免把密钥提交进仓库：

```bash
cat > /www/wwwroot/uml-platform/shared/production.env <<'EOF'
NODE_ENV=production
DATABASE_URL='postgres://uml_user:<password>@127.0.0.1:5432/uml_platform'
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=mailer@example.com
SMTP_PASS='<SMTP 密码或应用专用密钥>'
SMTP_FROM='UML Platform <mailer@example.com>'
SMTP_SECURE=false
UML_PROVIDER_SECRET_KEY='<供应商密钥加密主密钥>'
UML_PROVIDER_CONFIG_SECRET='<与 UML_PROVIDER_SECRET_KEY 相同的兼容值>'
UML_PROVIDER_BASE_URL_ALLOWLIST=https://api.openai.com,https://llm.example.edu
UML_ALLOW_LEGACY_PROVIDER_TEST=false
UML_ALLOW_PROJECT_LEGACY_PROVIDER_SETTINGS=false
API_CORS_ORIGINS=https://platform.example.com,https://admin.example.com
RENDER_SERVICE_CORS_ORIGINS=https://platform.example.com
ONLYOFFICE_DOCUMENT_SERVER_URL=http://office.example.com
PUBLIC_API_BASE_URL=http://platform.example.com
ONLYOFFICE_JWT_SECRET='<与 Document Server 一致的强随机密钥>'
ONLYOFFICE_ACCESS_TOKEN_SECRET='<强随机密钥>'
UML_DOCUMENT_STORAGE_DIR=/www/wwwroot/uml-platform/shared/documents
EOF

chmod 600 /www/wwwroot/uml-platform/shared/production.env
```

完整变量说明见 [production-env.md](./production-env.md)。生产环境必须关闭 mock/legacy fallback；模型供应商费用展示只作为 usage/quota/token 和可选估算，真实账单以外部供应商账单为准。

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
docker run -d --name onlyoffice-documentserver -p 8080:80 -e JWT_ENABLED=true -e JWT_SECRET=... onlyoffice/documentserver
npm run build:contracts
npm run build:prompts
DATABASE_URL=postgres://... NODE_ENV=production npx tsx -e 'createApiServer smoke'
npm run test:contracts
npm run test:api
npm run test:render
npm run test:web
npm run build:api
npm run build:render
VITE_APP_API_BASE_URL="" npm run build:web
```

随后工作流会打包发布产物并上传到服务器，由 `scripts/deploy/baota-pm2-deploy.sh` 完成：

- 在 GitHub Actions 内启动 PostgreSQL service，并用生产模式创建 API server，真实执行 migrations。
- 在 GitHub Actions 内启动 OnlyOffice Document Server 容器，并检查 `/healthcheck`。
- 解压到 `/www/wwwroot/uml-platform/releases/<commit-sha>`
- 使用 `https://registry.npmmirror.com` 安装 API 和 Render Service 生产依赖，可通过 `NPM_REGISTRY` 覆盖；Web 已提前构建为静态文件，不在服务器安装前端依赖
- 检查 Web dist 和 PlantUML jar
- 更新 `/www/wwwroot/uml-platform/current` 软链接
- 自动加载 `/www/wwwroot/uml-platform/shared/production.env` 后再启动 PM2，确保 OnlyOffice 等生产配置在每次发布后仍然存在
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
curl -s http://服务器IP/api/version | grep -o '"onlyOfficeDocumentServerConfigured":[^,}]*'
```

如果启用了 OnlyOffice，最后一条命令应输出 `"onlyOfficeDocumentServerConfigured":true`。

render-service 的 health 返回中应包含：

```json
{
  "status": "ok",
  "jarAvailable": true
}
```

浏览器验证：

- 访问站点首页。
- 未登录访问业务页应回到官网首页；登录后刷新 `/projects`、`/exam`、`/tutorial`、`/about` 不应 404。
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
set -a
. /www/wwwroot/uml-platform/shared/production.env
set +a
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
set -a
. /www/wwwroot/uml-platform/shared/production.env
set +a
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

这些变量必须写入 `/www/wwwroot/uml-platform/shared/production.env`。不要只在 SSH 里临时 `export`，因为发布脚本会删除并重建 PM2 进程，临时环境变量不会自动进入下一次发布。

`PUBLIC_API_BASE_URL` 必须是 OnlyOffice Document Server 能访问的平台地址，因为它需要读取
`/api/documents/:documentId/file` 并回调
`/api/documents/:documentId/onlyoffice/callback` 保存编辑结果。

说明书文件物理上保存在同一个 `UML_DOCUMENT_STORAGE_DIR` 根目录下，但生产功能必须登录后使用，文档元数据、下载、OnlyOffice 编辑和回调都要绑定实名用户、实名项目和项目权限。run、SSE、Provider 托管配置也必须走同一套实名项目权限链路，不能依赖浏览器本地工作区作为安全边界。

```text
/www/wwwroot/uml-platform/shared/documents/<projectId>/<documentId>/
```

legacy document workspace 仅允许 dev/test 或底层兼容场景保留，不是生产产品入口。线上不得把本地工作区密钥、localStorage history 或明文 Provider fallback 当作登录态项目数据路径。

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
curl -s http://platform.example.com/api/version | grep -o '"onlyOfficeDocumentServerConfigured":[^,}]*'
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
