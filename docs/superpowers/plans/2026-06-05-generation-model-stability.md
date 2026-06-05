# 生成模型链路稳定性修复记录

本文记录需求规则到需求模型、设计模型链路中，LLM 结构化输出不匹配导致生成失败的修复方案与后续 Goal 提示词。

## 背景

当前链路已经具备 structured output、失败重试、model-only salvage、traceability-only repair、coverage check 和 auto-fill。实际失败点不是缺少这些机制，而是容错边界不统一：部分 traceability 输出在进入 normalizer 和 auto-fill 前被严格 schema 拦截，导致本来可恢复的结构偏差扩大成生成失败。

典型日志样本是 `target.modelId Expected string, received null`。这类输出应被视为缺省 `modelId`，再通过 `diagramKind + elementId` 唯一解析，而不是直接失败。

## 已落地修复

- 新增共享 `sanitizeTraceabilityEntries`，在 traceability normalizer 边界统一清理 `null`，并允许单个对象形式的 traceability payload。
- 需求和设计 traceability parse 入口统一使用 sanitize 后的 raw entries，再交给 normalizer 逐条解析。
- 设计 traceability 不再在 normalizer 前执行 `designModelTraceabilityEntrySchema.array().parse(...)`，避免有效 entry 被同数组中的坏 entry 连带失败。
- 引用解析支持常见字段别名：`diagram`、`diagramType`、`modelKind`、`elementID`、`element_id`、`refId`、`sourceId`、`targetId`、`modelID`、`model_id`。
- 设计 class model 的 `classKind` 归一化改为 contract 支持的枚举；`abstract class` 等不支持值会被删除，而不是让模型本体校验失败。
- structured output 失败日志增加 `failureType` 分类：`json_parse`、`model_schema`、`traceability_schema`、`traceability_ref`、`empty_selected_model`、`external_transport`。
- 新增 pipeline 回归测试，覆盖模型本体有效、traceability-only repair 返回 `modelId: null` 时仍应完成生成，且不应退回 auto-fill。
- 新增真实日志 replay fixture：将 `.codex-e2e-logs/full-gpt54-20260604-205234/requirements-run-latest.json` 中出现过的 `modelId: null` 与 `modelId: ""` raw traceability 输出内联到 normalizer 测试，避免测试依赖未入库日志目录。

## 验收标准

- 可恢复的结构化输出不匹配不再导致 `generate_models` 或 `generate_design_models` 失败。
- 有效模型本体不会因为 traceability 结构偏差被丢弃。
- 有效 traceability entry 不会被同数组中的坏 entry 连带失败。
- 缺 `modelId` 但可通过 `diagramKind + elementId` 唯一解析时应成功。
- 选中图完全缺失、引用无法唯一解析、provider/network/timeout/refusal 仍应明确失败。

## 已验证

- `npx tsx --test apps/api/src/normalizers/design/design-model-normalizer.test.ts apps/api/src/normalizers/requirements/requirement-model-normalizer.test.ts apps/api/src/normalizers/traceability/traceability-normalizer.test.ts`
- `npx tsx --test apps/api/src/runs/pipelines/shared/structured-output.test.ts apps/api/src/runs/pipelines/parallel-generation.test.ts apps/api/src/normalizers/design/design-model-normalizer.test.ts apps/api/src/normalizers/requirements/requirement-model-normalizer.test.ts apps/api/src/normalizers/traceability/traceability-normalizer.test.ts`
- `npm run test:api`
- `npm run build:api`

## Goal 模式提示词

```text
目标：继续加固 UML 平台“需求规则 -> 需求模型 -> 设计模型”链路的生成稳定性，确保可恢复的 LLM 结构化输出偏差不会导致用户看到生成模型失败。

请先阅读并遵守 AGENTS.md。不要回滚用户已有改动。只修改相关 API normalizer、pipeline、LLM response format、日志分类和测试文件。

当前状态：
1. traceability 输出已新增 sanitizeTraceabilityEntries，需求侧和设计侧 parser 都应统一使用。
2. 设计 traceability parser 不应在 normalizer 前执行严格 entry schema array parse。
3. modelId: null 应被视为缺省，通过 diagramKind + elementId 唯一解析。
4. 设计 classKind 必须保持与 contracts 中 classKindSchema 兼容。

继续实施方向：
1. 收集新的真实失败日志，把每个可恢复结构错误转成 normalizer 或 pipeline regression test。
2. 给 structured output 失败增加分类：json_parse、model_schema、traceability_schema、traceability_ref、empty_selected_model、external_transport。
3. 检查 model-only salvage 和 traceability-only repair 是否在需求模型、设计模型、sequence-per-use-case 路径上行为一致。
4. 不把 502、fetch failed、timeout、refusal 混入结构化输出修复范围，但要让错误分类清楚。

验收：
- API normalizer 目标测试通过。
- npm run test:api 通过。
- target.modelId null、混合 malformed traceability entry、单对象 traceability payload 均可恢复。
- 选中图缺失或引用无法唯一解析时仍严格失败并给出明确原因。
```
