# Frontend UI System Goal

本文档记录前端 UI 组件体系的目标、边界和维护约定，供后续实现、重构和 Codex 任务执行时参考。

## Context

当前前端没有引入 Ant Design、MUI、Mantine 这类整包式组件库，但已经形成了 shadcn 风格的内部 UI 层：`apps/web/src/shared/ui` 中封装了 Button、Dialog、Select、Tabs、Switch、Checkbox 等基础组件，并使用 Radix primitives、Tailwind CSS、CVA、`clsx`、`tailwind-merge`、`lucide-react` 和项目主题 token。

这套方式的核心价值是让项目拥有组件源码和视觉决策，同时继续复用 Radix 的键盘交互、ARIA、Portal 和焦点管理能力。后续维护重点不是迁移到更大的外部组件库，而是把现有内部组件层治理成稳定、可复用、可测试的项目 UI 系统。

## Goal

将 `apps/web/src/shared/ui` 明确作为 UML experimental platform 的项目自有基础组件系统。新增或调整前端样式时，优先复用和扩展现有共享组件、主题 token 和工具函数，保持工作台、模型生成、文档、图表、账号平台等页面在交互、可访问性、暗色模式和视觉密度上的一致性。

## Decisions

- 不整体迁移到 MUI、Ant Design 或 Mantine；除非某个后续任务证明现有栈无法合理覆盖具体复杂控件，否则继续沿用 Radix + Tailwind + project-owned wrappers。
- `apps/web/src/shared/ui` 只承载跨业务复用的基础控件、低层组合控件和 UI 工具；带有明确业务语义的页面级组件继续放在 `apps/web/src/features/*/components`。
- 主题颜色、圆角、字体、状态色、暗色模式和 Tailwind token 映射继续集中在 `apps/web/src/app/styles/theme.css`，业务页面不应随意新增平行色板。
- 新共享组件优先使用 Radix primitive 或已有共享组件组合实现；不要自写复杂浮层、菜单、选择器、焦点陷阱和键盘导航逻辑。
- 图标继续优先使用 `lucide-react`，按钮和工具操作保持可访问标签或可读文本。

## Maintenance Rules

新增共享组件时，文件职责不明显的需要在文件顶部写短责任说明；组件 API 保持小而稳定，避免把业务状态、接口调用或页面流程塞进 `shared/ui`。

修改共享组件样式时，应检查至少一个实际调用场景，确认紧凑工作台、弹窗、表单、移动视口和暗色模式不会出现文本溢出、焦点状态丢失或布局跳动。

业务页面如果出现重复的按钮组、筛选器、状态徽标、弹窗表单或工具栏模式，应先判断是否抽成 `features` 内部组合组件；只有跨多个业务域复用时才提升到 `shared/ui`。

## Testing And Verification

共享组件新增或用户可见行为变化必须配套 Vitest / Testing Library 测试，重点覆盖：

- disabled、loading、selected、invalid、open/close 等关键状态；
- 键盘交互、焦点管理和可访问名称；
- 暗色模式或主题 token 依赖的样式回归；
- 业务页面对共享组件的状态更新和 action guard。

优先运行针对性测试，例如 `npm run test --workspace @uml-platform/web -- src/shared/ui/<component>.test.tsx`。涉及多个页面或基础组件时，再运行 `npm run typecheck:web` 和相关 `npm run test:web` 切片。

## Acceptance Criteria

- 后续前端任务能把本文档作为组件库选型和维护边界的依据。
- 新 UI 工作默认复用 `shared/ui` 和 `theme.css`，避免页面内散落重复组件样式。
- 共享组件的行为、可访问性和主题一致性由测试或明确验证步骤守住。
