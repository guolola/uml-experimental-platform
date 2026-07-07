<!-- Documents production SEO build, verification, submission, and search-console ownership steps. -->
# SEO 发布与搜索引擎接入

主站唯一公开 origin 为 `https://jianglisoftware.com`。公开收录范围仅包括 `/`、`/features`、`/workflow`、`/cases`、`/pricing`；登录、邀请、项目和工作台页面必须保持 `noindex`。

## 生产配置

在 `/www/wwwroot/uml-platform/shared/production.env` 配置：

```dotenv
PUBLIC_WEB_BASE_URL=https://jianglisoftware.com
INDEXNOW_KEY=<由站点所有者生成>
BAIDU_PUSH_TOKEN=<百度搜索资源平台普通收录 token>
```

不要把 token、SSH 私钥或生产环境文件提交到 Git。发布脚本会把 IndexNow key 写到 `/www/wwwroot/uml-platform/shared/seo/indexnow-key.txt`，Nginx 只读提供 `/indexnow-key.txt`。

## 发布检查

`npm run build:web:production` 会生成五个预渲染页面、私有 `app.html`、`robots.txt`、`sitemap.xml`、`404.html` 和 `seo-manifest.json`。上线后运行：

```bash
PUBLIC_WEB_BASE_URL=https://jianglisoftware.com npm run seo:verify --workspace @uml-platform/web
```

检查失败必须切回上一 release。主动提交以本次和上一 release 的 manifest 为准；没有内容变化时不会推送。IndexNow 或百度通知失败只告警，不影响已通过 HTTP 健康检查的网站。

## 站长平台

站点所有者使用 DNS TXT 完成 Google Search Console、Bing Webmaster Tools 和百度搜索资源平台验证，然后提交 `https://jianglisoftware.com/sitemap.xml`。结构化数据、抓取状态和索引错误应在发布后的四周内持续检查；不要为不同爬虫返回不同正文。
