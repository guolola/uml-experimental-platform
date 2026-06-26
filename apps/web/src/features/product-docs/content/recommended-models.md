<!-- Documents evidence-based model recommendations for each generation stage. -->
# 推荐模型

## 适用场景

你准备为项目选择生成模型，并且只关心效果，不把价格、速率、上下文长度或采购稳定性纳入排序。

## 结论先看

- 系统内置和平台可选模型只提供国产模型。
- 国外模型只作为效果参考；如果要使用国外模型，需要在全局设置中自己添加 Provider 和 API Key。
- 国产或国外标签只说明来源，不代表当前账号一定已经有权限；最终以“获取模型列表”返回的模型为准。
- 本页推荐基于 `jeinlee1991/chinese-llm-benchmark` 最新榜单复核，已解析276 个榜单文件、25531 行模型结果、243 个唯一模型。

## 数据来源

| 来源 | 用途 |
| --- | --- |
| [chinese-llm-benchmark README](https://github.com/jeinlee1991/chinese-llm-benchmark) | 确认 ReLE 榜单范围、领域定义和更新记录 |
| [总分](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/%E6%80%BB%E5%88%86.md) | 总榜 Top10 |
| [语言与指令遵从](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/%E8%AF%AD%E8%A8%80%E4%B8%8E%E6%8C%87%E4%BB%A4%E9%81%B5%E4%BB%8E.md)、[中文指令遵从](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/%E4%B8%AD%E6%96%87%E6%8C%87%E4%BB%A4%E9%81%B5%E4%BB%8E.md)、[信息抽取](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/%E4%BF%A1%E6%81%AF%E6%8A%BD%E5%8F%96.md)、[阅读理解](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/%E9%98%85%E8%AF%BB%E7%90%86%E8%A7%A3.md) | 需求解析、文档生成 |
| [推理与数学计算](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/%E6%8E%A8%E7%90%86%E4%B8%8E%E6%95%B0%E5%AD%A6%E8%AE%A1%E7%AE%97.md)、[agent与工具调用](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/agent%E4%B8%8E%E5%B7%A5%E5%85%B7%E8%B0%83%E7%94%A8.md) | UML、设计模型和跨阶段推理 |
| [coding](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/coding.md)、[livecodebench](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/livecodebench.md)、[Terminal-Bench-2.0](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/Terminal-Bench-2.0.md) | 代码原型生成 |
| [表格总结](https://github.com/jeinlee1991/chinese-llm-benchmark/blob/main/leaderboard/%E8%A1%A8%E6%A0%BC%E6%80%BB%E7%BB%93.md)、专业能力、通用能力 | 说明书和综合质量校验 |

## 总榜 Top10

总榜直接使用官方 `总分` 排名，不做二次加权。

| 排名 | 模型 | 来源 | 使用方式 |
| --- | --- | --- | --- |
| 1 | qwen3.7-max | 国产 | 系统或自配 Provider，以模型列表为准 |
| 2 | qwen3.6-max-preview | 国产 | 系统或自配 Provider，以模型列表为准 |
| 3 | gpt-5.5 | 国外 | 需要自配 Provider |
| 4 | gemini-3.1-pro-preview | 国外 | 需要自配 Provider |
| 5 | claude-opus-4.8-thinking | 国外 | 需要自配 Provider |
| 6 | gemini-3.5-flash | 国外 | 需要自配 Provider |
| 7 | qwen3.7-plus | 国产 | 系统或自配 Provider，以模型列表为准 |
| 8 | qwen3.5-plus | 国产 | 系统或自配 Provider，以模型列表为准 |
| 9 | glm-5.2 | 国产 | 系统或自配 Provider，以模型列表为准 |
| 10 | kimi-k2.6 | 国产 | 系统或自配 Provider，以模型列表为准 |

## 各生成链路 Top10

项目链路没有一个完全同名的公开榜单，所以这里用公开榜单字段组合计算，并把权重写明。排序只代表效果优先，不代表性价比。

### 需求解析 / UML 初稿

权重：`语言与指令遵从 22% + 中文指令遵从 18% + 信息抽取 18% + 阅读理解 12% + 推理与数学计算 12% + agent与工具调用 8% + 总分 10%`。

| 排名 | 模型 | 来源 | 使用方式 |
| --- | --- | --- | --- |
| 1 | o4-mini | 国外 | 需要自配 Provider |
| 2 | qwen3.7-max | 国产 | 系统或自配 Provider，以模型列表为准 |
| 3 | gpt-5.4-high | 国外 | 需要自配 Provider |
| 4 | GLM-5-Turbo | 国产 | 系统或自配 Provider，以模型列表为准 |
| 5 | gemini-3.5-flash | 国外 | 需要自配 Provider |
| 6 | Doubao-Seed-2.0-pro | 国产 | 系统或自配 Provider，以模型列表为准 |
| 7 | kimi-k2.6 | 国产 | 系统或自配 Provider，以模型列表为准 |
| 8 | qwen3.7-plus | 国产 | 系统或自配 Provider，以模型列表为准 |
| 9 | qwen3.5-plus | 国产 | 系统或自配 Provider，以模型列表为准 |
| 10 | claude-opus-4.8-thinking | 国外 | 需要自配 Provider |

### 设计模型生成

权重：`总分 22% + 推理与数学计算 22% + agent与工具调用 18% + 语言与指令遵从 12% + coding 12% + 专业能力 8% + 通用能力 6%`。

| 排名 | 模型 | 来源 | 使用方式 |
| --- | --- | --- | --- |
| 1 | qwen3.7-max | 国产 | 系统或自配 Provider，以模型列表为准 |
| 2 | claude-opus-4.8-thinking | 国外 | 需要自配 Provider |
| 3 | qwen3.6-max-preview | 国产 | 系统或自配 Provider，以模型列表为准 |
| 4 | gpt-5.5 | 国外 | 需要自配 Provider |
| 5 | gemini-3.1-pro-preview | 国外 | 需要自配 Provider |
| 6 | qwen3.5-plus | 国产 | 系统或自配 Provider，以模型列表为准 |
| 7 | gemini-3.5-flash | 国外 | 需要自配 Provider |
| 8 | qwen3.7-plus | 国产 | 系统或自配 Provider，以模型列表为准 |
| 9 | glm-5.2 | 国产 | 系统或自配 Provider，以模型列表为准 |
| 10 | kimi-k2.6 | 国产 | 系统或自配 Provider，以模型列表为准 |

### 代码原型生成

权重：`coding 55% + livecodebench 15% + Terminal-Bench-2.0 12% + agent与工具调用 8% + 总分 5% + 语言与指令遵从 5%`。

| 排名 | 模型 | 来源 | 使用方式 |
| --- | --- | --- | --- |
| 1 | qwen3.6-max-preview | 国产 | 系统或自配 Provider，以模型列表为准 |
| 2 | qwen3.7-max | 国产 | 系统或自配 Provider，以模型列表为准 |
| 3 | gemini-3.1-pro-preview | 国外 | 需要自配 Provider |
| 4 | gemini-3.5-flash | 国外 | 需要自配 Provider |
| 5 | deepseek-v4-pro | 国产 | 系统或自配 Provider，以模型列表为准 |
| 6 | claude-opus-4.8-thinking | 国外 | 需要自配 Provider |
| 7 | gpt-5.5 | 国外 | 需要自配 Provider |
| 8 | gpt-5.4-high | 国外 | 需要自配 Provider |
| 9 | claude-opus-4.8 | 国外 | 需要自配 Provider |
| 10 | glm-5.2 | 国产 | 系统或自配 Provider，以模型列表为准 |

### 文档生成 / DOCX 内容

权重：`语言与指令遵从 22% + 中文指令遵从 16% + 表格总结 16% + 阅读理解 14% + 信息抽取 12% + 专业能力 10% + 总分 10%`。

| 排名 | 模型 | 来源 | 使用方式 |
| --- | --- | --- | --- |
| 1 | qwen3.7-max | 国产 | 系统或自配 Provider，以模型列表为准 |
| 2 | gpt-5.4-high | 国外 | 需要自配 Provider |
| 3 | GLM-5-Turbo | 国产 | 系统或自配 Provider，以模型列表为准 |
| 4 | gemini-3.5-flash | 国外 | 需要自配 Provider |
| 5 | kimi-k2.6 | 国产 | 系统或自配 Provider，以模型列表为准 |
| 6 | Doubao-Seed-2.0-pro | 国产 | 系统或自配 Provider，以模型列表为准 |
| 7 | qwen3.5-plus | 国产 | 系统或自配 Provider，以模型列表为准 |
| 8 | qwen3.7-plus | 国产 | 系统或自配 Provider，以模型列表为准 |
| 9 | o4-mini | 国外 | 需要自配 Provider |
| 10 | qwen3.6-max-preview | 国产 | 系统或自配 Provider，以模型列表为准 |

## 怎么选择

| 目标 | 优先看 |
| --- | --- |
| 只想要一个默认模型 | 先看总榜 Top10，再确认模型列表里是否存在 |
| 需求文本质量不稳定 | 需求解析 / UML 初稿榜 |
| 设计模型关系复杂 | 设计模型生成榜 |
| 重点生成前端原型 | 代码原型生成榜 |
| 重点生成说明书 | 文档生成 / DOCX 内容榜 |

## 常见问题与处理

- 为什么国外模型出现在榜单里：本页是效果榜，不是系统内置清单。国外模型必须自己添加 Provider。
- 为什么国产模型也写“以模型列表为准”：不同账号、课程或项目的 Provider 可用模型不同，最终以当前 Provider 返回的模型列表为准。
- 为什么没有单独列测试页面生成：当前测试页面主要基于需求和设计模型结构生成，不是独立 LLM 管线。
- 为什么不按价格排序：本页只服务“效果最好”的选择场景，性价比需要另行评估。
