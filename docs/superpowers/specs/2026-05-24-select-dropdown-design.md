# Select Dropdown Design

本文档记录前端下拉框视觉统一改造的设计约定，供实现和后续维护参考。

## Context

前端已经有基于 Radix Select 的公共组件 `apps/web/src/shared/ui/select.tsx`，但 `apps/web/src` 中仍有多处原生 `<select>`，主要集中在用户平台页面，需求、文档、追踪矩阵页面也有少量残留。原生控件在不同浏览器和系统下样式不一致，和当前蓝白/暗色管理台主题不协调。

## Decision

采用“克制管理台风格”作为公共 Select 的视觉方向。组件继续使用 Radix Select，保留它的键盘导航、ARIA、Portal、滚动按钮和焦点管理，只调整样式与业务页面接入方式。

本次范围覆盖 `apps/web/src` 里现存的原生 `<select>`，统一替换为 `shared/ui/select`。不引入新的下拉框库，不自写列表交互，不改变业务状态模型。

## Component Design

`SelectTrigger` 使用 8px 半径、细边框、轻背景、清晰 hover 和 focus-visible 状态。默认高度保持 36px，小尺寸保持 32px，以适配表单、筛选器、分页尺寸选择器等场景。长文本在触发器内截断，不撑开布局。

`SelectContent` 使用 popover 主题色、细边框、轻阴影、最大高度滚动，并在 popper 模式下让菜单最小宽度跟随触发器，避免选项菜单比触发器窄。暗色模式沿用现有 token，不新增独立色板。

`SelectItem` 明确区分 hover、keyboard focus、selected、disabled 状态。选中项保留右侧 check 图标，hover/focus 使用浅 accent 背景，disabled 降低透明度且不可交互。

## Replacement Rules

原生 `<select>` 替换时保持现有 label、aria-label、disabled、value 和 onChange 语义。静态选项转换为 `SelectItem`；动态数组选项保留原来的 key/value/label 规则；空选项用明确 sentinel value 处理，避免 Radix Select 使用空字符串 item value 产生运行时问题。

筛选类下拉框保持紧凑宽度；表单类下拉框保持 full-width；分页“每页 N 条”这类内联控件使用小尺寸并保留周围文本布局。

## Testing

对用户可见行为变化添加或更新测试，重点覆盖选择排序、分页尺寸、筛选条件、配置选择等状态更新。实现后运行相关前端测试；如果时间和环境允许，再运行 `npm run typecheck` 或前端 workspace 的等价命令。
