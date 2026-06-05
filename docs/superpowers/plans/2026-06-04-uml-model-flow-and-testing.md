# UML Platform Model Flow And Testing Plan

## Summary

This plan records the agreed improvements for the UML experimental platform before implementation. The platform should present itself as a software engineering training platform, restructure requirement and design model flows, add test case generation, and make traceability matrices local to each model instead of aggregated at the stage root.

## User Goals

- Rename user-facing platform copy from "软件工程实验平台" to "软件工程实训平台".
- On the home page hero, change "UML" to "UML模型".
- Make model detail element cards more compact so users can see more elements per page.
- Normalize class, database table, and field display fields as: 中文名称、英文名称、类型、约束.
- Add a first-level sidebar menu named "测试" below "设计".
- Generate professional test cases from confirmed requirement items.
- Move requirement and design traceability matrices under the corresponding model menu, so each matrix only represents the current model.
- Rename and extend the requirement/design model taxonomy.
- Add event flows to use cases and generate sequence diagrams from those event flows.

## Model Taxonomy

### Requirement Stage

- `usecase`: 用例模型.
  - Add event flows to each use case.
  - Event flows must support main success flow, alternative flow, and exception flow.
  - Each step should capture actor/system action, expected response or result, and source requirement where possible.
- `class`: 领域概念模型.
  - Keep it focused on domain concepts, not technical service/controller/repository classes.
- `activity`: Rename from 界面关系图 to 总体业务流程.
  - It should describe the overall business process, not page navigation.
- `deployment`: Rename from 部署模型 to 部署需求模型.
  - It should describe deployment requirements and constraints at the requirement stage.
- Add 原型界面关系.
  - Use UML package/component-style representation for prototype screens, modules, entry points, navigation links, inclusion, and dependencies.
  - This is the professional choice for expressing relationships between interfaces and for supporting downstream code generation.
- Add 需求分析模型.
  - Generate a real analysis sequence diagram for each use case.
  - Use `modelId` style such as `analysis:<useCaseId>` if multi-instance models are added.

### Design Stage

- `sequence`: Rename from 顺序图 to 用例实现设计.
  - Generate one design sequence diagram per use case.
  - Design sequence diagrams must be based on use case event flows and, where available, requirement analysis sequence diagrams.
- `class`: 设计类图.
  - Continue to derive design classes from requirement concepts plus use case implementation behavior.
- `activity`: Rename from 业务流程图 to 界面关系图.
  - Generate from 原型界面关系 and design sequence diagrams.
  - Use package/component-style interface relationship representation rather than activity flow when the goal is screen relationships.
- `deployment`: Rename from 部署模型 to 部署设计.
  - Generate from design sequence diagrams and deployment requirement model.
- `table`: Rename from 表关系图 to 数据库设计.
  - Generate from design sequence diagrams and entity classes in the design class diagram.

## Test Capability

- Add "测试" as a first-level sidebar menu below "设计".
- First version generates professional black-box functional test cases, not executable automation scripts.
- Test cases should include:
  - source requirement item,
  - source use case,
  - scenario type: normal, alternative, exception, boundary,
  - priority,
  - preconditions,
  - test data,
  - steps,
  - expected results,
  - coverage status.
- The test page should provide:
  - generation action,
  - blocked reason when prerequisites are missing,
  - test case table,
  - scenario filters,
  - coverage summary,
  - detail view for test steps.

## Traceability Matrix Changes

- Remove aggregated "需求跟踪矩阵" from the requirement root.
- Remove aggregated "设计跟踪矩阵" from the design root.
- Add a "跟踪矩阵" child under each generated model node.
- Requirement model matrix pages only show mappings for the selected requirement model.
- Design model matrix pages only show mappings for the selected design model.
- Multi-use-case sequence models should expose per-use-case matrices, not only one aggregated sequence matrix.
- Existing matrix filtering logic can be reused, but route/selection state should carry the selected diagram/model scope.

## Interface And Data Changes

- Extend `packages/contracts` with:
  - use case event flow schemas,
  - prototype interface relationship model,
  - requirement analysis sequence model,
  - test case generation result model,
  - optional `modelId` for requirement-side multi-instance models if needed,
  - optional `chineseName`, `englishName`, and `constraints` fields for class/table/field-like elements.
- Keep backward compatibility:
  - old models without new fields must still open,
  - UI should derive missing display fields from existing `name`, `id`, `type`, `nullable`, `PK`, and `FK` data.
- Extend `packages/prompts`:
  - requirement generation must output use case event flows,
  - analysis sequence prompts must use event flows,
  - design sequence prompts must use event flows and analysis sequence models,
  - test generation prompts must derive test cases from confirmed requirements and use case flows.
- Extend PlantUML generation:
  - render package/component-style interface relationship models,
  - render requirement analysis sequence diagrams,
  - keep existing usecase/class/activity/deployment/table rendering compatible.

## API And Pipeline Notes

- Keep `apps/api/src/index.ts` as entrypoint/server assembly only.
- Put new API routes under the appropriate second-level domain folder, for example `apps/api/src/routes/runs/`.
- Put lifecycle state under `apps/api/src/runs/records/`.
- Put business stage flow under `apps/api/src/runs/pipelines/`.
- Add concise comments around:
  - run lifecycle transitions,
  - SSE terminal event closing,
  - LLM/PlantUML repair loops,
  - route -> pipeline -> record store contracts.
- Add a test generation run pipeline if test cases are generated asynchronously.
- Reuse existing run event, snapshot, history, and provider settings patterns where possible.

## Frontend Notes

- Preserve boundaries between `app`, `features`, `entities`, `services`, and `shared`.
- Keep page components focused on composition.
- Move reusable state, derived rules, and workflow decisions into hooks/helpers when they grow.
- Preserve user-facing constraints in both UI state and action guards.
- Use existing shared UI primitives and accessible labels.
- Show prerequisite reasons inline instead of only disabling controls.
- Element cards should become more compact by reducing padding, icon size, description line count, and grid gap while keeping click targets usable.

## Suggested Implementation Order

1. Create this plan document and confirm the current repo state.
2. Update user-facing copy and basic labels.
3. Implement compact element cards and normalized detail field display.
4. Add scoped traceability matrix selection and move matrix entries under model nodes.
5. Extend contracts for use case event flows and compatible display fields.
6. Update prompts and normalizers for event-flow-driven use cases and sequences.
7. Add prototype interface relationship and requirement analysis models.
8. Rename and adjust design-side model sources and prompts.
9. Add test case contracts, API pipeline, frontend page, and sidebar menu.
10. Update documents/code generation context to use the new model meanings.
11. Add and update targeted tests, then run broader checks.

## Verification Plan

- Run `npm run test:contracts` for schema compatibility.
- Run targeted prompt tests in `packages/prompts`.
- Run targeted API tests for requirement/design/test pipelines and PlantUML rendering.
- Run targeted web tests for:
  - home page copy,
  - sidebar menu labels/order,
  - scoped traceability matrix pages,
  - compact element cards,
  - normalized detail fields,
  - test page behavior.
- Run `npm run test:web`.
- Run `npm run typecheck:web`.
- Run `npm run build` if the change set reaches contracts, prompts, API, and web together.

## Chrome MCP End-To-End Acceptance

- After implementation, start the local API/render/web dev servers and use Chrome MCP to simulate real user behavior instead of only relying on component tests.
- Capture browser console output throughout the run; there must be no uncaught errors, React warnings that indicate broken rendering, failed hydration, invalid DOM nesting, or repeated runtime exceptions.
- Inspect network activity; expected API/SSE/render requests should complete successfully, and there should be no unexpected 4xx/5xx responses, stalled requests, broken SVG loads, or failed document/model fetches.
- Run these user flows in Chrome MCP:
  - open the home page and verify "软件工程实训平台" plus "UML模型" copy;
  - enter a project workspace and verify sidebar labels/order for 需求、设计、测试、代码、说明书;
  - expand requirement models and verify 总体业务流程、部署需求模型、原型界面关系、需求分析模型 labels;
  - open each generated requirement model and its scoped 跟踪矩阵, confirming the matrix only shows that model's elements;
  - open 用例模型 and verify event flows are visible in element details;
  - expand design models and verify 用例实现设计、界面关系图、部署设计、数据库设计 labels;
  - open each generated design model and its scoped 跟踪矩阵, including per-use-case sequence/design matrices;
  - open 测试, generate or load test cases, and verify coverage summary, filters, table rows, and detail steps;
  - open model detail 元素清单 and verify compact cards show more elements without text overlap on desktop and mobile viewport sizes.
- For flows that need generated data, prefer existing mock/dev fixtures when available; otherwise run the local generation flow with a small sample requirement and wait for SSE completion before checking downstream pages.
- Save Chrome MCP screenshots or notes for any visual regressions, console errors, network failures, or blocked prerequisites so the final implementation report can identify what passed and what still needs attention.

## Assumptions

- "原型界面关系" and design-side "界面关系图" should use package/component-style UML because they represent relationships between screens, modules, and navigation paths.
- "测试" first version generates test case specifications and coverage, not executable automation scripts.
- Existing historical models remain readable; new fields are optional with UI fallbacks.
- Internal package names, environment variables, and technical identifiers can remain unchanged unless user-facing copy requires a rename.
