# Production Full-Chain Load And E2E Audit Plan

本文件用于线上服务器性能检测与 Chrome MCP 多用户全链路验收，覆盖需求规则、需求模型、设计模型、说明书、运行历史、生成任务和权限隔离。

## Goal

在生产地址 `http://134.175.78.226/` 上，用真实浏览器、真实账号、真实模型，模拟多个用户从项目创建/协作到完整生成链路的操作，并同步采集服务器资源、数据库事件、PM2、Nginx、Docker/OnlyOffice 与前端网络/控制台证据。

本轮目标不是“证明能跑”，而是找出真实卡顿、失败、权限错漏、历史记录缺失、生成任务展示不完整、资源峰值异常，并给出可复现证据和最小修复建议。

## Scope

- 目标环境：线上生产 `http://134.175.78.226/`
- 浏览器：Chrome MCP，使用隔离 context 模拟多用户
- 服务器：SSH `ubuntu` 用户，默认端口，使用已配置密钥认证方式
- 模型：`OpenAI · GPT 5.4`
- 并发视角：
  - Owner 与 Editor 同时进行生成/查看/历史操作
  - Viewer 进行只读和越权尝试
  - Outsider 进行非成员访问隔离检查
- 全链路范围：
  - 登录、项目列表、项目详情、成员、设置
  - 需求文本 -> 需求规则
  - 需求规则 -> 需求模型
  - 需求模型 -> 设计模型
  - 需求/设计上下文 -> 说明书
  - 生成任务抽屉、运行历史、历史快照、文档中心
  - 权限边界、导出/下载/恢复/删除/重试/取消/筛选

## Safety Rules

- 不在最终报告、日志文件、命令输出中写入账号密码、API Key、Provider Secret 或 Cookie。
- 所有破坏性操作只作用于本轮新建隔离项目，统一使用 `prod-e2e-YYYYMMDD-HHMM` 前缀。
- 不删除、不归档、不覆盖用户已有真实项目。
- 数据库 maintenance 脚本只做 dry-run/说明，除非用户明确确认执行。
- 如果出现以下情况，立即停止压测并记录：
  - CPU 持续高于 95% 超过 60 秒
  - 可用内存低于 150MiB
  - swap 快速增长
  - PM2 restart 增加
  - Nginx/API 出现连续 5xx
  - 生成任务进入不可恢复失败或无法取消

## Preflight

### Access Handoff

SSH 连接方式：

```powershell
# 如果本机已有部署密钥，优先使用密钥登录
ssh -i "<path-to-SEPKey.pem>" -o StrictHostKeyChecking=no ubuntu@134.175.78.226

# 如果后续更换部署密钥，仍优先使用密钥登录 ubuntu 用户
ssh -i "<deploy-key-path>" ubuntu@134.175.78.226
```

凭据处理规则：

- 新会话开始后，先确认 SSH 是否能通过已配置密钥登录。
- 如果需要 root 密码，让用户在会话里临时提供；不要把密码写入本 Markdown、shell 脚本、日志文件或最终报告。
- 测试账号密码同理：由用户在新会话临时提供，或由执行者创建新的 `prod-e2e-*` 隔离账号。
- 文档、证据表和最终报告只记录测试账号邮箱/角色，不记录密码、Cookie、sessionId、API Key、Provider Secret。
- 如果必须把账号清单写入报告，只使用如下格式：

| Role | Email | Password Recorded |
| --- | --- | --- |
| Owner | `prod-e2e-...-owner@example.edu` | No |
| Editor | `prod-e2e-...-editor@example.edu` | No |
| Viewer | `prod-e2e-...-viewer@example.edu` | No |
| Outsider | `prod-e2e-...-outsider@example.edu` | No |

### Repository And Release

- 确认本地仓库当前提交、远端 main 最新提交。
- 确认线上 `/api/version` 的 `releaseSha` 是否包含本轮优化提交。
- 如果线上未部署最新提交，本轮先标记为 `PRE_DEPLOY_BASELINE`，不要把旧代码结果误判成新代码效果。

需要记录：

| Field | Value |
| --- | --- |
| Local commit | |
| Remote main commit | |
| Production releaseSha | |
| Test prefix | |
| Started at | |
| Operator | Codex |

### Server Baseline

压测前采集：

- `uptime`
- `free -m`
- `df -h`
- `pm2 jlist`
- API/render PID CPU/RSS
- `docker stats --no-stream`
- PostgreSQL `pg_stat_activity`
- `run_records` / `run_events` / `llm_chunk` 计数
- Nginx 近 5 分钟 5xx
- PM2 error/out 日志 tail
- `/api/health` 与 `/api/version` 延迟
- render-service `/health`

建议记录表：

| Metric | Baseline | Peak | End | Notes |
| --- | ---: | ---: | ---: | --- |
| Load avg 1m | | | | |
| API CPU % | | | | |
| API RSS MiB | | | | |
| Render CPU % | | | | |
| Render RSS MiB | | | | |
| Postgres CPU % | | | | |
| OnlyOffice RSS MiB | | | | |
| Mem available MiB | | | | |
| Swap used MiB | | | | |
| Nginx 5xx | | | | |
| PM2 restarts | | | | |
| run_events total | | | | |
| llm_chunk total | | | | |

### Browser Baseline

- Chrome MCP 打开首页并记录：
  - LCP/首屏 trace
  - console error/warn
  - network failed requests
- 打开 `/projects`、登录页、项目列表，确认登录态是否干净。

## Test Users

准备 4 个隔离账号：

| Role | Purpose | Expected Capability |
| --- | --- | --- |
| Owner | 项目创建、成员管理、设置、全链路生成 | 全权限 |
| Editor | 并发协作、生成、恢复快照 | 可编辑和生成，不可高危管理 |
| Viewer | 只读验收、越权尝试 | 不可编辑、不可生成、不可删除 |
| Outsider | 非成员隔离 | 不能访问项目、run、document |

记录账号邮箱即可，不记录密码。

## Workload Data

使用一份中等长度、业务规则明确、能自然覆盖多图和说明书的需求文本。建议：

```text
校园公共活动管理系统：
1. 学生可以浏览公开活动日历，按活动类型、时间、地点筛选活动。
2. 学生可以报名活动、取消报名，并查看自己的报名记录。
3. 活动管理员可以创建活动，设置容量、报名开始/截止时间、签到方式和活动状态。
4. 当活动容量已满或超过截止时间时，系统不允许继续报名。
5. 活动开始前 24 小时，系统向已报名学生发送提醒。
6. 管理员可以查看活动报名名单、签到情况和导出统计报表。
7. 普通学生不能编辑活动信息，也不能查看其他学生的联系方式。
8. 系统需要保留报名、取消、签到和导出操作的审计记录。
```

目标模型：

- 需求模型：用例模型、领域概念模型、界面关系图、部署模型
- 设计模型：顺序图、设计类图、业务活动图、部署图、表关系图
- 说明书：需求规格说明书、软件设计说明书

## Execution Plan

### 1. Auth, Project, And Members

- Owner 登录，创建隔离项目。
- 设置项目名称、描述、默认 Provider/模型为当前生产可用模型。
- 邀请/添加 Editor、Viewer。
- 分别用三个 Chrome isolated context 登录 Owner、Editor、Viewer。
- 验证项目列表、项目成员、权限标签、导航项一致。
- Viewer 尝试编辑需求、成员、设置、文档和历史删除，期望禁用或 403 且有明确提示。
- Outsider 直接访问项目 URL，期望无权限页面或 403/404。

证据：

- 项目 ID
- 成员列表截图/DOM 文本
- Viewer 受限操作截图/网络请求
- Outsider 访问结果

### 2. Requirement Rules

- Owner 输入需求文本，选择 `OpenAI · GPT 5.4`。
- 点击生成需求规则。
- 生成过程中打开“生成任务”抽屉，观察：
  - queued/running/completed 状态
  - 阶段名、进度、模型名、耗时
  - 是否显示当前 run
  - 刷新页面后是否仍能显示服务器 active run
- 同时 Editor 打开同一项目，观察实时同步和只读/编辑冲突表现。
- 完成后检查：
  - 规则数量、编号、类型、状态、分页、搜索、筛选
  - 非阻断质量提示是否不阻断下游
  - 规则编辑/删除/新增权限

性能记录：

- run id
- start/end time
- 新增 run_events 数
- 新增 llm_chunk 数
- API CPU/RSS 峰值
- Postgres CPU/RSS 峰值
- Nginx 5xx

### 3. Requirement Models

- 勾选 4/4 需求模型。
- Owner 与 Editor 进行并发视角：
  - Owner 发起生成
  - Editor 同时打开生成任务、运行历史、项目工作台
  - 如允许，Editor 尝试重复生成，观察队列、禁用或冲突提示
- 生成过程中检查任务抽屉：
  - 模型调用排队状态
  - 子任务状态
  - 阶段进度
  - 错误/取消入口
- 完成后逐个打开模型详情：
  - 用例模型
  - 领域概念模型
  - 界面关系图/活动图
  - 部署模型
- 每个详情页检查：
  - SVG 是否渲染
  - PlantUML/JSON/SVG 导出
  - 元素列表、关系列表、来源需求
  - 搜索、缩放、打开大图
  - 文本是否重叠，移动端/窄屏是否可用

### 4. Design Models

- 打开设计页，确认前置依赖提示正确。
- 勾选 5/5 设计模型。
- 使用当前生产可用模型生成设计模型。
- 生成过程中同步监控服务器，重点关注：
  - LLM 队列是否实际生效
  - sequence 子任务是否串行/并发符合配置
  - render-service 是否排队
  - Java/PlantUML 内存峰值
- 完成后检查：
  - 追踪证明/追踪矩阵
  - 顺序图列表及每个用例顺序图
  - 设计类图
  - 业务活动图
  - 部署图
  - 表关系图
  - PlantUML、SVG、元素、关系、来源映射

### 5. Documents

- 打开说明书页。
- 生成需求规格说明书：
  - 检查样式设置、前置依赖、生成任务展示
  - 完成后下载 DOCX，验证文件可下载、大小非 0、MIME/ZIP magic 正常
  - 文档中心显示记录
- 生成软件设计说明书：
  - 同样检查任务展示、下载、文档中心记录
- 如果 OnlyOffice 可用：
  - 打开在线编辑入口
  - 检查加载状态、权限、保存/关闭入口
- 如果 OnlyOffice 不可用：
  - 标记为依赖阻塞，不把 DOCX 生成判为失败

### 6. Generation Task Drawer

对每个阶段都检查“生成任务”：

- 空状态
- active run
- queued run
- running run
- completed run
- failed run，如果自然出现
- cancel run，如果有可取消窗口
- retry/rerun 操作
- 打开详情/复制错误/复制追踪内容
- 页面刷新后恢复 active server run
- 多用户同时打开时显示一致
- 任务模型名、阶段名、进度、子任务、耗时、错误是否完整

验收条件：

- 不出现“项目状态显示运行中，但任务抽屉为空”
- 不出现 run 已完成但任务卡仍停留 running
- 不出现终态缺失、耗时缺失、模型名缺失

### 7. Run History

运行历史必须覆盖：

- 打开/关闭历史抽屉或页面
- 按状态筛选：queued/running/completed/failed/cancelled
- 按阶段筛选
- 按模型筛选
- 按操作者筛选
- 按时间排序/分页
- 打开单条运行详情
- 查看快照摘要、错误、阶段事件、产物
- 恢复快照
- 重新运行
- 重试失败阶段，如果存在
- 取消 running run，如果有安全窗口
- 删除隔离 run 历史
- 导出历史/报告，如果入口存在
- 从历史恢复后继续下游生成

交叉核验：

- UI 列表数量与 `/api/projects/:projectId/runs` 一致
- 单条详情与 `/api/projects/:projectId/runs/:runId` 一致
- 恢复后的工作台状态与 run snapshot 一致
- terminal run 不应出现 `status=running` 且 `completed_at` 非空

### 8. Local History And Snapshots

- 打开历史快照入口。
- 检查快照数量、来源 run、时间、阶段。
- 恢复需求规则快照。
- 恢复需求模型快照。
- 恢复设计模型快照。
- 从快照导出 Markdown。
- 从快照重新下载 DOCX，如果入口存在。
- 删除单条隔离快照。
- 清空隔离快照，如果入口存在且安全。

### 9. Document Center

- 打开项目文档中心。
- 检查需求说明书和设计说明书记录。
- 搜索、类型筛选、状态筛选。
- 下载 DOCX。
- 重命名文档。
- 查看版本记录。
- 删除隔离文档。
- 恢复删除文档，如果入口存在。
- Viewer 尝试下载/删除/重命名，期望符合权限。
- Outsider 猜 documentId 下载，期望 401/403/404。

### 10. Project Settings And Export

只对隔离项目执行：

- 修改项目描述并保存。
- 修改默认 Provider/模型策略。
- 检查数据保留策略。
- 导出项目数据。
- 归档项目。
- 恢复项目。
- 最后才删除隔离项目；如果还需要保留证据，则不要删除。

### 11. Permission And Isolation Matrix

| Operation | Owner | Editor | Viewer | Outsider |
| --- | --- | --- | --- | --- |
| View project | PASS | PASS | PASS | DENY |
| Edit requirements | PASS | PASS | DENY | DENY |
| Generate runs | PASS | PASS | DENY | DENY |
| View run history | PASS | PASS | PASS | DENY |
| Restore snapshot | PASS | PASS | DENY or PASS per product rule | DENY |
| Delete run/document | PASS | DENY or PASS per product rule | DENY | DENY |
| Manage members | PASS | DENY | DENY | DENY |
| Project settings write | PASS | DENY | DENY | DENY |
| Download DOCX | PASS | PASS | PASS or DENY per product rule | DENY |

实际结果需要逐项记录，如果产品规则不明确，标为 `OPEN_QUESTION`。

## Performance Acceptance Criteria

当前 8 核/15GiB 机器建议标准：

- 双用户全链路无 PM2 restart。
- Nginx/API 5xx 为 0，或所有 5xx 有明确外部依赖解释。
- CPU 不持续高于 95% 超过 60 秒。
- 可用内存不低于 150MiB。
- swap 不快速增长。
- API RSS 不随 run 数持续线性膨胀。
- render-service/Java 不同时拉起多个高内存 PlantUML 进程。
- 新 run 默认不再产生几千条持久化 `llm_chunk`。
- 运行历史终态与 DB 一致。
- 任务抽屉能展示 active server run。

## Evidence Requirements

每个问题必须包含：

- 角色
- URL
- 操作步骤
- 期望结果
- 实际结果
- 截图或 DOM snapshot
- network request 及状态码
- console error/warn
- run id / document id / project id
- 服务器指标窗口
- 是否可复现
- 严重级别

## Issue Ledger Template

| ID | Severity | Area | Role | Steps | Actual | Expected | Evidence | Status | Fix Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PROD-E2E-001 | | | | | | | | OPEN | |

Severity:

- `BLOCKER`: 全链路无法继续、数据泄漏、服务崩溃
- `HIGH`: 核心功能失败、权限错误、生成/历史状态错误
- `MEDIUM`: 操作可绕过但体验或证据缺失
- `LOW`: 文案、布局、非核心问题

## Final Report Template

最终输出必须包含：

- 测试窗口和线上 releaseSha
- 测试账号角色，不含密码
- 项目 ID、关键 run ID、关键 document ID
- 服务器资源峰值表
- 每个链路阶段耗时和事件增长
- 发现问题列表，按严重级别排序
- 已确认无问题的范围
- 需要修复的最小改动建议
- 是否建议调整线上 LLM 并发配置
- 如果不建议，给出具体瓶颈证据
- 如果建议，给出建议配置和回滚条件

## New Goal-Mode Prompt

将下面整段复制到新会话，并开启 Goal 模式：

```text
目标：请按 `docs/e2e/production-full-chain-load-test-plan-2026-05-28.md` 对线上 `http://134.175.78.226/` 执行服务器性能检测与 Chrome MCP 多用户端到端全链路验收，并输出证据充分的最终报告。

背景：
- 仓库路径：E:\umlExperimentalPlatform
- 当前生产服务器规格为 8 核/15GiB，主平台与后台已经迁移到 `134.175.78.226`
- 线上推荐 LLM 并发配置为 `4 / 4 / 2 / 2 / 1`：global/provider/project/user/run
- 已发现历史瓶颈：run_events 中 llm_chunk 数量极大；优化目标是验证新代码部署后，新 run 是否不再持久化大量 llm_chunk，并验证 LLM stream 背压、render-service 队列和终态持久化是否有效
- 线上地址：http://134.175.78.226/
- 使用模型：当前生产可用模型
- 可以使用 Chrome MCP 做多用户真实浏览器操作
- 可以 SSH 到服务器采集性能指标；不要在日志或最终报告中暴露密码、Cookie、API Key、Provider Secret

必须覆盖：
1. 先确认线上 `/api/version` releaseSha 是否为当前待验收部署；如果不是，标记为旧版本 baseline，不要误判新优化效果。
2. 采集服务器 baseline：CPU/load、内存/swap、PM2、API/render PID、Postgres、Docker/OnlyOffice、Nginx 5xx、run_events/llm_chunk 计数、健康检查延迟。
3. 用 Chrome MCP 创建 Owner、Editor、Viewer、Outsider 多个隔离浏览器 context。只记录账号邮箱，不记录密码。
4. 用 `prod-e2e-YYYYMMDD-HHMM` 前缀创建隔离项目和测试数据，不破坏已有真实项目。
5. 完整模拟：登录 -> 项目 -> 成员 -> 需求文本 -> 需求规则 -> 需求模型 -> 设计模型 -> 说明书 -> 文档中心。
6. 全程检查“生成任务”抽屉：空态、queued/running/completed/failed/cancel/rerun/retry、刷新后 active server run 是否仍显示、模型名/阶段/进度/子任务/耗时/错误是否完整。
7. 全面检查运行历史：筛选、排序、分页、详情、恢复快照、重新运行、取消、删除、导出/报告、从历史恢复后继续下游生成；UI 与 API/DB 状态交叉核验。
8. 检查历史快照、文档中心、DOCX 下载、重命名、版本、删除/恢复、权限边界。
9. 多用户权限矩阵：Owner、Editor、Viewer、Outsider 分别尝试编辑、生成、查看、下载、删除、管理成员、项目设置、访问 runId/documentId。
10. 同步记录服务器性能峰值与每个阶段 run_events/llm_chunk 增量；若 CPU >95% 超过 60 秒、可用内存 <150MiB、swap 快速增长、PM2 restart 或连续 5xx，立即停止并记录。

输出要求：
- 先给执行计划和实时状态，不要只给建议。
- 每发现一个问题，给出角色、URL、步骤、期望、实际、证据、严重级别、可能修复方向。
- 最终报告必须包含：测试窗口、releaseSha、项目 ID、关键 run/document ID、服务器资源峰值、每阶段耗时与事件增长、问题清单、通过项、并发配置建议和回滚条件。
- 不要猜测瓶颈；所有优化建议必须绑定本轮线上证据。
- 如果需要改代码，先说明证据和最小修复面，再实施、测试、提交。
```
