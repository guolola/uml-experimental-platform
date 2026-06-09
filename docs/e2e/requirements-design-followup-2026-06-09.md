# 需求到设计链路跟进审计

本文档记录 2026-06-09 使用 Chrome DevTools MCP 和真实托管模型，对“需求规则 -> 需求模型 -> 设计模型”主链路进行跟进巡检、问题复现、修复和回归验证的结果。文中的 runId、projectId、命令和证据路径保持原样，方便直接定位。

## 运行元数据

| 字段 | 值 |
| --- | --- |
| 仓库 | `E:\umlExperimentalPlatform` |
| 审计日期 | 2026-06-09 |
| 目标链路 | 需求规则 -> 需求模型 -> 设计模型 |
| 浏览器通道 | Chrome DevTools MCP |
| 数据前缀 | `codex-rd-followup-20260609-*` |
| 生成模式 | 真实托管 Provider Config，多样本 |
| 账号 | `guest@example.edu` |
| Provider | `免费模型` / `deepseek-ai/DeepSeek-V4-Pro` |
| 最终状态 | 完成，但仍有真实模型批量 fan-out 延迟风险。S4/S5/S6b 已完成；S7 在 FU-005 后通过了定向 analysis 补缺；完整 `test:api` 仍未跑完。 |

## 环境检查

| 检查项 | 结果 | 证据 | 说明 |
| --- | --- | --- | --- |
| Web 健康检查 | 通过 | E-FU-ENV-001 | 跟进巡检前，`http://127.0.0.1:5176/` 返回 HTTP 200。 |
| API 健康检查 | 通过 | E-FU-ENV-002 | `http://127.0.0.1:4102/api/health` 返回 `status ok`，并指向 render 服务 4002。 |
| Render 健康检查 | 通过 | E-FU-ENV-003 | `http://127.0.0.1:4002/health` 返回 `status ok`，PlantUML jar 可用。 |
| Chrome 会话 | 通过 | E-FU-ENV-004 | `docs/e2e/evidence-20260609-current-page.snapshot.txt`；Chrome 已连接到本地项目工作区。 |
| Provider 配置 | 通过 | E-FU-S4-001 | S4 项目使用 Provider Config `792dbadc-5d88-4199-b085-837c3d302218`，模型为 `deepseek-ai/DeepSeek-V4-Pro`。 |

## 场景矩阵

| 场景 | 样本 | 覆盖目的 | 状态 | 项目 / Run ID | 说明 |
| --- | --- | --- | --- | --- | --- |
| S4 | 预约审批 | 覆盖提交、审批、拒绝、改期、取消，以及需求 activity/prototype/analysis 和设计依赖链路。 | 通过，修复后仍有部分历史风险记录 | 项目 `bed3375a-eef7-47e9-aa22-52c353eec252`；关键 run 见下方日志 | 发现并修复 FU-001、FU-002。deployment 依赖阻断探针表现正确。 |
| S5 | 校园维修工单 | 覆盖多角色状态流：报修、派单、接单、完成、评价、超时升级。 | 通过，但保留 provider 延迟残余风险 | 项目 `85e7d496-9889-4638-a2ac-e2e9020914a5`；runs `1092bf93-9b87-49c4-af3a-1176201debd9`, `193ebbe9-20b5-41de-9f3a-30155e2833a7`, `ae278270-b90a-4c69-8838-d0197fd137ce`, `09b4fdda-7270-4e6d-be59-38fae5863331` | rules/usecase/class 通过；前两次 activity 超时；后续 activity-only 重跑在较长流式输出窗口后完成。FU-003 通过 compact retry 缓解，仍记录真实模型偏慢风险。 |
| S6 | 社团场地预约 | 覆盖 prototype-heavy 页面、筛选、详情、申请表、管理员排期。 | 通过 | 项目 `55da7b94-9a99-42d1-8936-03340e86a908`；runs `ea3506f5-f678-4eeb-8253-eb041da863b2`, `86a6bd7b-e202-4d05-bc19-402f263c7a2a`, `6534a92c-e0ca-4b0d-a0bd-67ba326c3d29` | rules、usecase/activity/prototype、design sequence 均完成。出现 1 次符合预期的 traceability 自动补齐；无失败子任务。 |
| S7 | 图书借还续借 | 覆盖借阅、续借、归还、逾期罚金、库存状态。 | 定向补缺通过，但保留批量延迟风险 | 项目 `317ea84e-3845-449c-99c9-82a76ebfa4ca`；runs `f6c2b515-b353-4408-ba22-8c69d15dbba0`, `17b92c64-cd5b-4fe1-8ca3-ceb8da9d3cc2`；mini 项目 `22db3b4b-6c7d-4295-850d-48ee3f3b61bd`；定向 run `ac4a9eb9-2bcb-4591-a50e-eb3ab1b55773` | 初始 analysis fan-out 暴露多次空输出超时。加入 FU-005 compact retry 并完成单元测试后，S7d 对缺失用例执行 analysis-only 定向补缺并成功渲染。大批量 fan-out 仍有 provider 延迟风险。 |

## 操作日志

| 时间 | 操作 | 结果 | 证据 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-06-09 | 创建跟进审计文档 | 通过 | 本文档 | 这是本轮跟进的第一项仓库变更。 |
| 2026-06-09 | 检查本地 Web/API/render 服务 | 通过 | E-FU-ENV-001, E-FU-ENV-002, E-FU-ENV-003 | 现有开发栈在 5176/4102/4002 上健康。 |
| 2026-06-09 | 创建 S4 隔离项目 | 通过 | E-FU-S4-001 | 项目 `codex-rd-followup-20260609-appointment-approval-y7eqzals`。 |
| 2026-06-09 | 生成 S4 需求规则 | 通过 | E-FU-S4-002 | 生成 26 条规则，覆盖 usecase、prototype、analysis、activity、class。 |
| 2026-06-09 | 在 FU-001 修复前生成 S4 usecase + class | 通过但有风险 | E-FU-S4-003 | 生成完成，但在空 `requirementModelTraceability` 上反复进入修复尝试。 |
| 2026-06-09 | 在 FU-001 修复前生成 S4 activity | 部分失败 | E-FU-S4-004 | run 总体完成，但 activity artifact 因 `PLATFORM_PROVIDER_TIMEOUT` 被丢弃。 |
| 2026-06-09 | 应用 FU-001：需求 traceability 自动补齐 | 通过 | F-FU-001 | 当模型主体有效但 traceability 为空时，先自动补齐，避免进入 LLM traceability 修复循环。 |
| 2026-06-09 | FU-001 后重跑 S4 activity | 通过 | E-FU-S4-005 | 完成 usecase/class/activity，生成 1 份 PlantUML、1 份 SVG，无 diagramErrors。 |
| 2026-06-09 | FU-001 后运行 S4 prototype | 通过 | E-FU-S4-006 | prototype artifact 生成完成，无 diagramErrors。 |
| 2026-06-09 | FU-001 后运行 S4 定向 analysis | 通过 | E-FU-S4-007 | analysis artifact 完成；SVG 没有 `textLength` 或 `lengthAdjust`。 |
| 2026-06-09 | 接受 S4 evidence review gate，进入设计阶段 | 通过 | E-FU-S4-008 | 通过 review-decision API 处理 27 个待审证据项。 |
| 2026-06-09 | 生成 S4 design sequence | 通过 | E-FU-S4-009 | 14 个独立 sequence 模型，14 份 PlantUML，14 份 SVG，无 SVG 文本尺寸回归。 |
| 2026-06-09 | 生成 S4 design class + activity + table | 通过但暴露 FU-002 | E-FU-S4-010 | class/table 通过；activity 初始被渲染成只有 `start/stop`，暴露 FU-002。 |
| 2026-06-09 | 应用 FU-002：design activity PlantUML fallback | 通过 | F-FU-002 | 将误标为 start/end 的界面节点渲染为可读动作，不再坍缩成空图。 |
| 2026-06-09 | FU-002 后重跑 S4 design activity | 通过 | E-FU-S4-011 | PlantUML 不再只有 `start/stop`；SVG 长度 14166，37 个 text 节点，无文本尺寸属性。 |
| 2026-06-09 | 运行 S4 design deployment 依赖探针 | 通过 | E-FU-S4-012 | 正确失败为 `RUN_DEPENDENCY_MISSING`；已有设计模型被保留。 |
| 2026-06-09 | 创建 S5 隔离维修工单项目 | 通过 | E-FU-S5-001 | 项目 `85e7d496-9889-4638-a2ac-e2e9020914a5`。 |
| 2026-06-09 | 生成 S5 需求规则 | 通过 | E-FU-S5-002 | 生成 9 条规则，覆盖 usecase/class/activity。 |
| 2026-06-09 | 生成 S5 usecase + class + activity | 部分失败 | E-FU-S5-003 | usecase/class 通过并自动补齐 traceability；activity 超时，无有效输出。 |
| 2026-06-09 | 仅补跑 S5 activity | 部分失败 | E-FU-S5-004 | 已完成的 class/usecase 上下文被保留；activity 再次超时。 |
| 2026-06-09 | 加入 activity provider timeout compact retry 并重跑 S5 activity | 通过但有残余风险 | E-FU-S5-005, F-FU-003 | 真实重跑在较长流式输出窗口后完成；compact timeout 路径由定向测试覆盖。 |
| 2026-06-09 | 根据 FU-001/FU-003 行为变化修复 API 验证测试 | 通过 | F-FU-004 | 完整 `parallel-generation.test.ts` 不再挂起，并断言标准化 provider timeout 细节。 |
| 2026-06-09 | 运行 API typecheck 和重点 API 测试套件 | 通过 | 最终验证 | `npx tsc -p apps/api/tsconfig.json --noEmit`、完整 `plantuml.test.ts`、完整 `parallel-generation.test.ts` 均通过。 |
| 2026-06-09 | 运行 S6b rules + usecase/activity/prototype 样本 | 通过 | E-FU-S6-001 | 13 条规则；usecase/activity/prototype 完成，生成 3 份 PlantUML 和 3 份 SVG；出现 1 次预期自动补齐；无失败子任务。 |
| 2026-06-09 | 运行 S6b design sequence 样本 | 通过 | E-FU-S6-002 | 8 个 sequence 模型，8 份 PlantUML，8 份 SVG；无 design failed 或 repairing 子任务。 |
| 2026-06-09 | 捕获 S6b 后 Chrome console | 通过但有低风险问题 | E-FU-S6-003 | console 只有既有表单字段缺少 id/name 的可访问性 issue，无新增运行时错误。 |
| 2026-06-09 | 运行 S7 图书流通 usecase + analysis 样本 | 部分失败并确认问题 | E-FU-S7-001 | rules 完成，生成部分 analysis artifact，但多个 analysis 子任务在空输出上反复超时；active run 已取消。 |
| 2026-06-09 | 应用 FU-005：analysis compact retry，并运行本地验证 | 通过 | F-FU-005 | 增加单用例 analysis 超时后的 compact retry；定向和完整 pipeline 测试通过。 |
| 2026-06-09 | FU-005 后运行 S7c 真实 provider mini 回归 | 未完整完成 | E-FU-S7-002 | rules 完成，部分 usecase/analysis artifact 出现，但真实 run 超出命令窗口；为避免后台继续消耗 provider，已取消。 |
| 2026-06-09 | 检查 S7c 取消后的快照，并运行 S7d 缺失 analysis 定向补缺 | 定向通过 | E-FU-S7-003 | S7c 快照中已有 7/8 个 analysis；S7d 定向补齐 `uc-view-all-records`，生成 1 份 PlantUML 和 1 份 SVG，无 diagramErrors，无 `textLength`/`lengthAdjust`。 |

## 问题台账

| ID | 严重级别 | 模块 | 复现步骤 | 实际结果 | 期望结果 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FU-001 | 高 | `apps/api/src/runs/pipelines/requirements-pipeline.ts` | 在 S4 中使用 DeepSeek-V4-Pro 生成 activity/prototype/analysis，LLM 返回有效模型 JSON 但 `requirementModelTraceability` 为空。 | pipeline 进入昂贵的 traceability 修复循环；修复前 activity run 最终出现 `diagramErrors.activity` `PLATFORM_PROVIDER_TIMEOUT`，没有 activity artifact。 | 如果模型主体可解析，且引用关系可以确定性映射，应立即自动补齐 traceability，并保留生成 artifact。 | E-FU-S4-003, E-FU-S4-004, E-FU-S4-005, E-FU-S4-006, E-FU-S4-007 | 已修复；定向测试和 Chrome 回归均通过。 |
| FU-002 | 中 | `apps/api/src/plantuml.ts` | S4 prototype/sequence 上下文生成 design activity 时，LLM 将界面关系节点误标为结构性 start/end 节点。 | design activity 模型本身有有意义的节点/关系数据，但 PlantUML 可能坍缩为 `@startuml start stop @enduml`；SVG 非空但没有可读意义，text 节点为 0。 | 对有连接关系的误标界面节点使用 fallback action partition 渲染，让预览、新标签页、下载 SVG 都包含可读页面和关系文字。 | E-FU-S4-010, E-FU-S4-011 | 已修复；PlantUML 定向测试和 Chrome 回归均通过。 |
| FU-003 | 高 | 需求 activity 生成 / DeepSeek provider 行为 | 在 S5 中生成 usecase/class/activity，然后只重试 activity。 | 早期尝试以可重试的 `PLATFORM_PROVIDER_TIMEOUT` 结束；activity 很慢，并且在 idle 窗口前可能没有有效输出。 | 子任务级重试应保留已完成的上下文模型，在 provider timeout 后自动尝试更小的 activity prompt，同时不降级为桩数据或假模型。 | E-FU-S5-003, E-FU-S5-004, E-FU-S5-005 | 已缓解；compact retry 路径已加入并有单元测试。真实重跑完成，但 DeepSeek activity 长延迟仍是残余风险。 |
| FU-005 | 高 | 需求 analysis fan-out / DeepSeek provider 行为 | 在 S7 中为图书流通样本生成 usecase + analysis，包含多个用例。 | 多个 per-use-case analysis 子任务反复出现空输出并超时；coverage retry 让 run 在审计窗口外仍保持 active。部分成功的 analysis artifact 已被保留。 | 每个 analysis 子任务应具备和 activity 类似的 task-level retry/compact prompt 缓解，保留已完成 analysis，并避免无限 provider 消耗。 | E-FU-S7-001, E-FU-S7-002, E-FU-S7-003 | 已缓解；compact analysis retry 已加入，API 测试通过，真实 provider 的缺失 analysis 定向补缺也完成。大批量 fan-out 延迟仍是残余风险。 |

## 修复记录

| ID | 文件 | 改动 | 验证 | 状态 |
| --- | --- | --- | --- | --- |
| F-FU-001 | `apps/api/src/runs/pipelines/requirements-pipeline.ts`; `apps/api/src/runs/pipelines/parallel-generation.test.ts` | 对模型有效但 traceability 缺失/为空的需求模型增加早期确定性自动补齐；保留定向 analysis 补缺行为。 | `npx tsx --test --test-name-pattern "auto-fills traceability" apps/api/src/runs/pipelines/parallel-generation.test.ts`；S4 activity/prototype/analysis Chrome 重跑。 | 通过 |
| F-FU-002 | `apps/api/src/plantuml.ts`; `apps/api/src/plantuml.test.ts` | 将有连接关系但误标为 design activity start/end 的节点渲染为可读 fallback action，同时不破坏 timer start-marker 行为。 | `npx tsx --test --test-name-pattern "(connected screen nodes mislabeled as starts\|skips start nodes that have incoming flows)" apps/api/src/plantuml.test.ts`；S4 activity-only Chrome 重跑。 | 通过 |
| F-FU-003 | `apps/api/src/runs/pipelines/requirements-pipeline.ts`; `apps/api/src/runs/pipelines/parallel-generation.test.ts` | activity provider timeout 后，自动用 compact activity-only prompt 重试一次；仍要求真实结构化模型 JSON，并允许系统自动补齐空 traceability。 | `npx tsx --test --test-name-pattern "retries activity with a compact prompt" apps/api/src/runs/pipelines/parallel-generation.test.ts`；S5 activity 重跑完成。 | 通过 |
| F-FU-004 | `apps/api/src/runs/pipelines/parallel-generation.test.ts`; `apps/api/src/plantuml.ts` | 更新标准化 provider timeout 细节、FU-001 自动补齐语义的测试覆盖，并修复 FU-002 fallback 分支中的 TypeScript lane 访问问题。 | 完整 `parallel-generation.test.ts` 通过；完整 `plantuml.test.ts` 通过；API `tsc --noEmit` 通过。 | 通过 |
| F-FU-005 | `apps/api/src/runs/pipelines/requirements-pipeline.ts`; `apps/api/src/runs/pipelines/parallel-generation.test.ts` | per-use-case analysis provider timeout 后，自动使用 compact 单用例 analysis prompt 重试一次；如果 compact retry 仍超时，继续保留原有子任务失败语义。 | `npx tsx --test --test-name-pattern "retries analysis with a compact prompt" apps/api/src/runs/pipelines/parallel-generation.test.ts`；完整 `parallel-generation.test.ts` 通过；API `tsc --noEmit` 通过；S7d 定向真实 provider 补缺通过。 | 通过，但保留批量延迟残余风险 |

## 证据索引

| 证据 | 类型 | 路径 / 命令 | 说明 |
| --- | --- | --- | --- |
| E-FU-ENV-001 | HTTP | `http://127.0.0.1:5176/` | Web 健康检查返回 HTTP 200。 |
| E-FU-ENV-002 | HTTP | `http://127.0.0.1:4102/api/health` | API 健康检查返回 `status ok`。 |
| E-FU-ENV-003 | HTTP | `http://127.0.0.1:4002/health` | Render 健康检查返回 `status ok`，PlantUML jar 可用。 |
| E-FU-ENV-004 | DOM | `docs/e2e/evidence-20260609-current-page.snapshot.txt` | Chrome 页面基线。 |
| E-FU-S4-001 | API JSON | `docs/e2e/evidence-20260609-s4-project-create.json` | S4 隔离项目和 provider config。 |
| E-FU-S4-002 | API JSON | `docs/e2e/evidence-20260609-s4-rules-run-start.json`; `docs/e2e/evidence-20260609-s4-rules-run-poll-45s.json` | 需求规则 run。 |
| E-FU-S4-003 | API JSON | `docs/e2e/evidence-20260609-s4-usecase-class-run-poll-480s.json` | 修复前空 traceability 修复循环证据。 |
| E-FU-S4-004 | API JSON | `docs/e2e/evidence-20260609-s4-activity-run-poll-720s.json` | 修复前 activity timeout/drop 证据。 |
| E-FU-S4-005 | API JSON / SVG 检查 | `docs/e2e/evidence-20260609-s4-activity-after-fix-run-poll-330s.json`; `docs/e2e/evidence-20260609-s4-activity-after-fix-svg-check.json` | FU-001 后的 activity。 |
| E-FU-S4-006 | API JSON | `docs/e2e/evidence-20260609-s4-prototype-after-fix-run-poll-180s.json` | FU-001 后的 prototype。 |
| E-FU-S4-007 | API JSON / SVG 检查 | `docs/e2e/evidence-20260609-s4-analysis-after-fix-run-poll-270s.json`; `docs/e2e/evidence-20260609-s4-analysis-after-fix-svg-check.json` | FU-001 后的 analysis。 |
| E-FU-S4-008 | API JSON | `docs/e2e/evidence-20260609-s4-evidence-review-decisions.json`; `docs/e2e/evidence-20260609-s4-evidence-review-decisions-after-api-restart.json` | evidence review gate 决策记录。 |
| E-FU-S4-009 | API JSON / SVG 检查 | `docs/e2e/evidence-20260609-s4-design-sequence-after-review-run-poll-resume-corrected.json`; `docs/e2e/evidence-20260609-s4-design-sequence-after-review-svg-check.json` | 14 个 sequence 模型/SVG 通过文本检查。 |
| E-FU-S4-010 | API JSON / SVG 检查 | `docs/e2e/evidence-20260609-s4-design-class-activity-table-run-poll-final.json`; `docs/e2e/evidence-20260609-s4-design-class-activity-table-svg-check.json`; `docs/e2e/evidence-20260609-s4-design-activity-model-structure.json` | class/table 通过；暴露 activity 只有 start/stop 的问题。 |
| E-FU-S4-011 | API JSON / SVG 检查 | `docs/e2e/evidence-20260609-s4-design-activity-after-plantuml-fix-run-poll-210s.json` | FU-002 后的 activity。 |
| E-FU-S4-012 | API JSON | `docs/e2e/evidence-20260609-s4-design-deployment-dependency-run-start.json`; `docs/e2e/evidence-20260609-s4-design-deployment-dependency-run-poll-final.json` | deployment 依赖阻断行为。 |
| E-FU-S5-001 | API JSON | `docs/e2e/evidence-20260609-s5-project-create.json` | S5 隔离项目和 provider config。 |
| E-FU-S5-002 | API JSON | `docs/e2e/evidence-20260609-s5-rules-run-start.json`; `docs/e2e/evidence-20260609-s5-rules-run-poll-45s.json` | S5 规则生成。 |
| E-FU-S5-003 | API JSON | `docs/e2e/evidence-20260609-s5-usecase-class-activity-run-start.json`; `docs/e2e/evidence-20260609-s5-usecase-class-activity-run-poll-210s.json` | usecase/class 通过；activity 超时。 |
| E-FU-S5-004 | API JSON | `docs/e2e/evidence-20260609-s5-activity-supplement-run-start.json`; `docs/e2e/evidence-20260609-s5-activity-supplement-run-poll-240s.json` | activity-only 补缺超时，同时保留上下文模型。 |
| E-FU-S5-005 | API JSON / SVG 检查 | `docs/e2e/evidence-20260609-s5-activity-supplement-after-compact-retry-run-start.json`; `docs/e2e/evidence-20260609-s5-activity-supplement-after-compact-retry-run-poll-450s.json`; `docs/e2e/evidence-20260609-s5-activity-supplement-after-compact-retry-svg-check.json` | activity 补缺重跑完成；记录 SVG 文本检查。 |
| E-FU-S6-001 | API summary JSON | `docs/e2e/evidence-20260609-s6b-project-rules-model-summary.json` | S6b 项目、规则和 usecase/activity/prototype 模型 run 摘要。 |
| E-FU-S6-002 | API summary JSON | `docs/e2e/evidence-20260609-s6b-design-sequence-summary.json` | S6b design sequence run 摘要。 |
| E-FU-S6-003 | Chrome console 摘要 | `docs/e2e/evidence-20260609-s6b-chrome-console-summary.json` | S6b 跟进后的 Chrome DevTools MCP console 消息。 |
| E-FU-S7-001 | API summary JSON | `docs/e2e/evidence-20260609-s7-analysis-timeout-summary.json` | S7 analysis fan-out 超时和取消摘要。 |
| E-FU-S7-002 | API summary JSON | `docs/e2e/evidence-20260609-s7c-analysis-mini-after-fu005-summary.json` | FU-005 后 S7c mini 真实 provider 探针。 |
| E-FU-S7-003 | API summary JSON | `docs/e2e/evidence-20260609-s7d-analysis-targeted-after-fu005-summary.json` | FU-005 后，针对 S7c 缺失用例的 S7d analysis-only 定向补缺。 |

## 最终验证

| 命令 / 检查 | 结果 | 说明 |
| --- | --- | --- |
| `npx tsx --test --test-name-pattern "auto-fills traceability" apps/api/src/runs/pipelines/parallel-generation.test.ts` | 通过 | 验证 FU-001 定向行为。 |
| `npx tsx --test --test-name-pattern "(connected screen nodes mislabeled as starts\|skips start nodes that have incoming flows)" apps/api/src/plantuml.test.ts` | 通过 | 验证 FU-002 和既有 timer-start guard。 |
| `npx tsx --test --test-name-pattern "retries activity with a compact prompt" apps/api/src/runs/pipelines/parallel-generation.test.ts` | 通过 | 验证 FU-003 compact retry 行为。 |
| `npx tsx --test --test-name-pattern "retries analysis with a compact prompt" apps/api/src/runs/pipelines/parallel-generation.test.ts` | 通过 | 验证 FU-005 compact retry 行为。 |
| `npx tsc -p apps/api/tsconfig.json --noEmit` | 通过 | 修复 FU-002 fallback lane 类型后，API TypeScript 检查通过。 |
| `npx tsx --test apps/api/src/plantuml.test.ts` | 通过 | 19/19 个 PlantUML 渲染测试通过。 |
| `npx tsx --test apps/api/src/runs/pipelines/parallel-generation.test.ts` | 通过 | 25/25 个需求/设计 pipeline 测试通过，没有残留 timeout/hang。 |
| Chrome MCP S4 需求 activity/prototype/analysis 回归 | 通过 | 真实 DeepSeek-V4-Pro run 完成，生成 SVG artifact，无选中图的 diagramErrors。 |
| Chrome MCP S4 design sequence/class/activity/table/deployment 依赖检查 | 部分通过 | sequence/class/table 通过；deployment 正确阻断；FU-002 已通过 activity-only 重跑修复。 |
| S6b API + Chrome 跟进样本 | 通过 | 真实 DeepSeek-V4-Pro rules 和 usecase/activity/prototype 完成；design sequence 完成；Chrome console 无新增运行时错误。 |
| S7/S7c/S7d 真实 provider analysis 探针 | 定向通过但有残余风险 | S7 暴露 DeepSeek analysis fan-out 多次空输出超时；FU-005 已加入并单元测试通过。S7c 取消后快照已有 7/8 个 analysis；S7d 定向补齐缺失的 `uc-view-all-records` analysis，生成 1 份 PlantUML、1 份 SVG，且无文本尺寸属性。大批量 fan-out 延迟仍是真实 provider 残余风险。 |
| `npm run typecheck:web` | 通过 | Web typecheck 已在本轮早些时候成功完成。 |
| `npm run test:web` | 通过 | 初次只读沙箱运行因 Vite 临时文件 EPERM 失败；升级权限后重跑通过，39 个文件 / 339 个测试。 |
| `npm run test:api` | 未完整完成 | 只读沙箱运行在 document-library 测试处遇到 `%TEMP%` EPERM；升级后 10 分钟命令窗口内未跑完。上方重点 API 套件已通过。 |
