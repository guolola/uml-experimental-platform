// Verifies requirement authoring, rule editing, quality checks, and generation action guards.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AtomicRequirement, RequirementBaseline } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createRunSnapshot,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { TextRequirementView } from "./text-requirement-page";

describe("TextRequirementView", () => {
  async function chooseSelectOption(
    user: ReturnType<typeof userEvent.setup>,
    combobox: HTMLElement,
    optionName: string,
  ) {
    await user.click(combobox);
    await user.click(await screen.findByRole("option", { name: optionName }));
  }

  function createBaseRepository(
    overrides: Partial<WorkspaceRepository> = {},
  ): WorkspaceRepository {
    return {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(async () => ({ runId: "run-test" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
      ...overrides,
    };
  }

  function createAtomicRequirement(
    overrides: Partial<AtomicRequirement> = {},
  ): AtomicRequirement {
    return {
      id: "REQ-001",
      sourceRuleId: "r1",
      sourceFragment: "系统应允许用户提交订单。",
      sourceLocation: { section: "input", startOffset: 0, endOffset: 12 },
      type: "functional",
      actor: null,
      subject: "系统",
      action: "允许提交",
      object: "订单",
      condition: null,
      outcome: "系统创建订单",
      confidence: 0.56,
      status: "pending-review",
      criticality: "high",
      acceptanceCriteria: ["用户提交订单后系统创建订单。"],
      priority: "must",
      fieldProvenance: {},
      ...overrides,
    };
  }

  function createRequirementBaseline(
    requirements: AtomicRequirement[],
    overrides: Partial<RequirementBaseline> = {},
  ): RequirementBaseline {
    return {
      runId: "run-baseline",
      sourceDocumentId: "inline-requirement",
      createdAt: "2026-05-27T00:00:00.000Z",
      requirements,
      assumptions: [],
      conflicts: [],
      qualityReport: {
        runId: "run-baseline",
        status: "pending-review",
        summary: "存在待确认字段。",
        issues: requirements[0]
          ? [
              {
                id: "issue-actor",
                requirementId: requirements[0].id,
                severity: "warning",
                code: "missing-actor",
                message: "缺少参与者。",
                blocksDownstream: true,
              },
            ]
          : [],
        blockingIssueIds: ["issue-actor"],
        reviewRequiredRequirementIds: requirements[0] ? [requirements[0].id] : [],
      },
      ...overrides,
    };
  }

  it("renders the empty state with input guidance and clears requirement text", async () => {
    const updateRequirementText = vi.fn(async () => {});
    const repository = createBaseRepository({ updateRequirementText });

    const user = userEvent.setup();
    const { container } = render(
      withWorkspaceProviders(<TextRequirementView />, repository),
    );

    const requirementInput = await screen.findByPlaceholderText(
      "用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则",
    );
    expect(screen.getByText("需求分析提取")).toBeInTheDocument();
    expect(screen.getByText("AI 需求助手")).toBeInTheDocument();
    expect(screen.queryByText("AI 智能辅助")).not.toBeInTheDocument();
    expect(screen.queryByText("探索与灵感")).not.toBeInTheDocument();
    expect(screen.queryByText("帮我细化功能")).not.toBeInTheDocument();
    expect(screen.queryByText("检查逻辑冲突")).not.toBeInTheDocument();
    expect(screen.queryByText("生成业务规则")).not.toBeInTheDocument();
    expect(screen.getByText("电商系统")).toBeInTheDocument();
    expect(screen.getByText("社交应用")).toBeInTheDocument();
    expect(screen.getByText("健身追踪")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("目标模型")).toBeInTheDocument();
    expect(screen.queryByText(/将自动补齐：需求规则/)).not.toBeInTheDocument();
    expect(screen.getAllByText("请先输入需求描述或添加需求规则").length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-workspace-density="rail"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-workspace-density="rail-card"]')).toHaveLength(3);
    expect(container.querySelector('[data-workspace-density="compact-grid"]')).toBeInTheDocument();

    await user.type(requirementInput, "创建一个订单系统");
    expect(requirementInput).toHaveValue("创建一个订单系统");
    await user.click(screen.getByRole("button", { name: "清空" }));

    expect(requirementInput).toHaveValue("");
    await waitFor(() => {
      expect(updateRequirementText).toHaveBeenLastCalledWith("");
    });

    await user.click(screen.getAllByRole("button", { name: /应用模板/ })[0]);
    expect((requirementInput as HTMLTextAreaElement).value).toContain("电商系统");
    await waitFor(() => {
      expect(updateRequirementText).toHaveBeenLastCalledWith(
        expect.stringContaining("电商系统"),
      );
    });
  });

  it("shows rule autofill only when source requirement text exists", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [],
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await screen.findByText("目标模型");
    expect(screen.getAllByText(/将自动补齐：需求规则/).length).toBeGreaterThan(0);
    expect(screen.queryByText("请先输入需求描述或添加需求规则")).not.toBeInTheDocument();
  });

  it("starts a rules-only run through session actions", async () => {
    const startRun = vi.fn(async () => ({ runId: "run-rules" }));
    const subscribeToRun = vi.fn(
      async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
        onEvent({ type: "queued" });
        onEvent({
          type: "completed",
          snapshot: createRunSnapshot({
            runId: "run-rules",
            requirementText: "创建一个订单系统",
            rules: [createRule()],
          }),
        });
      },
    );
    const getRunSnapshot = vi.fn(async () =>
      createRunSnapshot({
        runId: "run-rules",
        requirementText: "创建一个订单系统",
        rules: [createRule()],
      }),
    );

    const repository = createBaseRepository({
      startRun,
      subscribeToRun,
      getRunSnapshot,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.type(
      await screen.findByPlaceholderText(
        "用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则",
      ),
      "创建一个订单系统",
    );
    await user.click(screen.getByTitle("生成需求规则"));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          requirementText: "创建一个订单系统",
          selectedDiagrams: [],
        }),
      );
    });
    expect(
      await screen.findByRole("dialog", { name: "需求规则已生成" }),
    ).toBeInTheDocument();
    expect(screen.getByText("生成完成。")).toBeInTheDocument();
  });

  it("starts a diagram run through session actions", async () => {
    const startRun = vi.fn(async () => ({ runId: "run-diagrams" }));
    const snapshot = createRunSnapshot({
      runId: "run-diagrams",
      requirementText: "创建一个订单系统",
      selectedDiagrams: ["usecase"],
      rules: [createRule()],
      models: [
        {
          diagramKind: "usecase",
          title: "订单系统用例",
          summary: "主要角色与用例",
          notes: [],
          actors: [
            {
              id: "actor_user",
              name: "用户",
              actorType: "human",
              responsibilities: ["提交订单"],
            },
          ],
          useCases: [
            {
              id: "usecase_submit_order",
              name: "提交订单",
              goal: "完成订单创建",
              preconditions: ["已登录"],
              postconditions: ["订单已生成"],
              primaryActorId: "actor_user",
              supportingActorIds: [],
            },
          ],
          systemBoundaries: [{ id: "boundary_order", name: "订单系统" }],
          relationships: [
            {
              id: "rel_order_1",
              type: "association",
              sourceId: "actor_user",
              targetId: "usecase_submit_order",
            },
          ],
        },
      ],
      plantUml: [{ diagramKind: "usecase", source: "@startuml\nactor 用户\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "usecase",
          svg: "<svg><text>usecase</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: 10,
            durationMs: 5,
          },
        },
      ],
    });

    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [createRule()],
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
      startRun,
      subscribeToRun: vi.fn(
        async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
          onEvent({ type: "queued" });
          onEvent({ type: "completed", snapshot });
        },
      ),
      getRunSnapshot: vi.fn(async () => snapshot),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.click(await screen.findByRole("checkbox", { name: /用例模型/ }));
    const generateButton = await screen.findByRole("button", { name: /生成模型/i });

    await waitFor(() => {
      expect(generateButton).toBeEnabled();
    });

    await user.click(generateButton);
    await user.click(await screen.findByRole("button", { name: "确认生成" }));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["usecase"],
          rules: [createRule()],
        }),
      );
    });

    expect(screen.queryByText("SRS 摘要")).not.toBeInTheDocument();
    expect(screen.queryByText("模型结果")).not.toBeInTheDocument();
  });

  it("shows requirement-model AI repair records on the model stage", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r1",
              text: "普通读者可以查询自己借出的书目。",
              relatedDiagrams: ["usecase"],
            }),
          ],
          selectedDiagramTypes: ["usecase"],
          generatedDiagramTypes: ["usecase"],
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "图书馆用例模型",
              summary: "读者自助查询",
              notes: [],
              actors: [
                {
                  id: "actor_reader",
                  name: "普通读者",
                  actorType: "human",
                  responsibilities: ["查询自己借出的书目"],
                },
              ],
              useCases: [
                {
                  id: "uc_find_own_loans",
                  name: "查询自己借出的书目",
                  goal: "返回当前读者借阅清单",
                  preconditions: ["普通读者已登录"],
                  postconditions: ["系统展示该读者当前借阅清单"],
                  primaryActorId: "actor_reader",
                  supportingActorIds: [],
                },
              ],
              systemBoundaries: [{ id: "boundary_library", name: "图书馆系统" }],
              relationships: [],
            },
          },
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc_find_own_loans",
                elementKind: "usecase",
                label: "查询自己借出的书目",
              },
            },
          ],
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await screen.findByText("目标模型");
    expect(screen.queryByText("需求模型 AI 修复记录")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/需求规则 r1 需要解释其在用例模型中的覆盖关系/u),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /查看需求模型追踪证明/u }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "需求模型追踪证明",
    });
    expect(
      within(dialog).getByText(/需求规则 r1 需要解释其在用例模型中的覆盖关系/u),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/补齐 r1 -> 查询自己借出的书目 的追踪关系和覆盖说明/u),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("证明已补齐").length).toBeGreaterThan(0);
  });

  it("keeps target diagrams selectable when existing rules need AI mapping completion", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r1",
              relatedDiagrams: ["usecase"],
            }),
          ],
          rulesVersion: 1,
          selectedDiagramTypes: ["class"],
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    expect(await screen.findByRole("checkbox", { name: /用例模型/ })).toBeEnabled();
    const classDiagramCheckbox = screen.getByRole("checkbox", {
      name: /领域概念模型/,
    });
    expect(classDiagramCheckbox).toBeEnabled();
    expect(classDiagramCheckbox).not.toBeChecked();
    await userEvent.click(classDiagramCheckbox);
    expect(classDiagramCheckbox).toBeChecked();
    expect(
      screen.getAllByText(/将自动补齐：规则映射/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("1/6")).toBeInTheDocument();
  });

  it("allows analysis model selection from generated use case event flows without requirement rules", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [],
          rulesVersion: 0,
          selectedDiagramTypes: [],
          generatedDiagramTypes: ["usecase"],
          diagramVersions: { usecase: 0 },
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例模型",
              summary: "用户提交订单。",
              notes: [],
              actors: [],
              useCases: [],
              systemBoundaries: [],
              relationships: [],
            },
          },
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const analysisCheckbox = await screen.findByRole("checkbox", {
      name: /需求分析模型/,
    });
    expect(analysisCheckbox).toBeEnabled();
    expect(
      screen.getByText("基于用例模型事件流生成，不要求需求规则直接映射。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("需先选择或生成用例模型")).not.toBeInTheDocument();

    await user.click(analysisCheckbox);

    await waitFor(() => {
      expect(analysisCheckbox).toBeChecked();
    });
    expect(screen.getByText("1/6")).toBeInTheDocument();
  });

  it("labels generated but unselected requirement models as kept", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({ id: "r1", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r2", relatedDiagrams: ["class"] }),
            createRule({ id: "r3", relatedDiagrams: ["activity"] }),
          ],
          selectedDiagramTypes: ["activity"],
          generatedDiagramTypes: ["usecase", "class"],
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.click(await screen.findByRole("checkbox", { name: /总体业务流程/ }));

    expect(
      await screen.findByRole("button", {
        name: /应用变更（新增1·保留2）/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /移除/ }),
    ).not.toBeInTheDocument();
  });

  it("surfaces pending auto rule-mapping reviews on requirement model cards", async () => {
    const updateAutoGeneratedUpstreamReviews = vi.fn(async () => {});
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "校园失物招领需求",
          rules: [
            createRule({
              id: "r1",
              text: "管理员可以处理争议和查看审计日志。",
              relatedDiagrams: ["deployment"],
            }),
          ],
          autoGeneratedUpstreamReviews: {
            "requirement-rule:mapping:deployment": {
              id: "requirement-rule:mapping:deployment",
              artifactType: "requirement-rule",
              artifactId: "mapping:deployment",
              label: "部署需求模型规则映射",
              reason: "生成所选模型时缺少上游规则映射，系统自动补齐关联关系。",
              sourceRunId: "run-rules",
              status: "pending",
              createdAt: "2026-06-08T15:14:14.176Z",
            },
          },
        }),
      ),
      updateAutoGeneratedUpstreamReviews,
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const deploymentCard = await screen.findByRole("button", {
      name: "选择部署需求模型",
    });
    expect(within(deploymentCard).getByText("待审")).toBeInTheDocument();
    expect(
      within(deploymentCard).getByText(/部署需求模型规则映射/),
    ).toBeInTheDocument();

    await user.click(
      within(deploymentCard).getByRole("button", {
        name: "采纳部署需求模型自动补齐",
      }),
    );

    await waitFor(() => {
      expect(updateAutoGeneratedUpstreamReviews).toHaveBeenCalledWith({
        "requirement-rule:mapping:deployment": expect.objectContaining({
          status: "accepted",
        }),
      });
    });
  });

  it("keeps AI repair details out of the table row and shows lightweight hints", async () => {
    const user = userEvent.setup();
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r10",
              text: "功能(4)可供普通读者查找他们自己借出的书目。",
            }),
          ],
          requirementBaseline: {
            runId: "run-ai-field-repair",
            sourceDocumentId: "inline-requirement",
            createdAt: "2026-05-24T00:00:00.000Z",
            assumptions: [],
            conflicts: [],
            qualityReport: {
              runId: "run-ai-field-repair",
              status: "passed",
              summary: "AI 已修复可从原文推出的字段。",
              issues: [],
              blockingIssueIds: [],
              reviewRequiredRequirementIds: [],
            },
            requirements: [
              {
                id: "REQ-010",
                sourceRuleId: "r10",
                sourceFragment: "功能(4)可供普通读者查找他们自己借出的书目。",
                sourceLocation: { section: "input", startOffset: 0, endOffset: 24 },
                type: "business-rule",
                actor: "普通读者",
                subject: "普通读者",
                action: "查找他们自己借出的书目",
                object: "自己借出的书目",
                condition: "登录身份为普通读者",
                outcome: "系统返回该读者自己的借出书目",
                confidence: 0.74,
                status: "accepted",
                criticality: "critical",
                acceptanceCriteria: ["普通读者只能查看自己当前借出的书目。"],
                priority: "must",
                fieldProvenance: {
                  actor: {
                    source: "ai-suggested",
                    status: "accepted",
                    value: "普通读者",
                    originalValue: null,
                    rationale: "原文明确出现普通读者，AI 自动补齐角色/执行者字段。",
                  },
                  object: {
                    source: "ai-suggested",
                    status: "accepted",
                    value: "自己借出的书目",
                    originalValue: null,
                    rationale: "原文描述普通读者查询自己借出的书目，AI 自动补齐对象字段。",
                  },
                  condition: {
                    source: "ai-suggested",
                    status: "accepted",
                    value: "登录身份为普通读者",
                    originalValue: null,
                    rationale: "该规则涉及普通读者权限边界，AI 自动补齐身份条件。",
                  },
                },
              },
            ],
          },
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const row = await screen.findByRole("row", {
      name: /r10.*功能\(4\)可供普通读者查找他们自己借出的书目/u,
    });
    expect(within(row).getByText("已确认")).toBeInTheDocument();
    expect(within(row).getByText("3项")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /复核详情/u })).not.toBeInTheDocument();
    expect(within(row).queryByText(/角色\/执行者：普通读者/u)).not.toBeInTheDocument();
    expect(within(row).queryByText(/修复原因：原文明确出现普通读者/u)).not.toBeInTheDocument();
    expect(within(row).queryByText(/actor|object|condition/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "需求规则修复确认" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "需求质量提示" })).not.toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: /需求提示详情 r10/u }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "需求质量提示" })).toBeInTheDocument();
    expect(screen.getByText("角色/执行者")).toBeInTheDocument();
    expect(screen.getByText("原文明确出现普通读者，AI 自动补齐角色/执行者字段。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "采纳" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();
  });

  it("shows quality issues as lightweight hints instead of review actions", async () => {
    const user = userEvent.setup();
    const updateRequirementBaseline = vi.fn(async () => {});
    const repository = createBaseRepository({
      updateRequirementBaseline,
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r10",
              text: "功能(4)可供普通读者查找他们自己借出的书目。",
            }),
          ],
          requirementBaseline: {
            runId: "run-ai-field-repair",
            sourceDocumentId: "inline-requirement",
            createdAt: "2026-05-24T00:00:00.000Z",
            assumptions: [],
            conflicts: [],
            qualityReport: {
              runId: "run-ai-field-repair",
              status: "blocked",
              summary: "AI 补齐字段待人工确认。",
              issues: [
                {
                  id: "ISS-001",
                  requirementId: "REQ-010",
                  severity: "critical",
                  code: "derived-assumption",
                  message: "REQ-010 包含 AI 补齐待确认字段。",
                  blocksDownstream: true,
                },
                {
                  id: "ISS-002",
                  requirementId: "REQ-010",
                  severity: "critical",
                  code: "missing-boundary",
                  message: "REQ-010 缺少可验证边界。",
                  blocksDownstream: true,
                },
              ],
              blockingIssueIds: ["ISS-001", "ISS-002"],
              reviewRequiredRequirementIds: ["REQ-010"],
            },
            requirements: [
              {
                id: "REQ-010",
                sourceRuleId: "r10",
                sourceFragment: "功能(4)可供普通读者查找他们自己借出的书目。",
                sourceLocation: { section: "input", startOffset: 0, endOffset: 24 },
                type: "business-rule",
                actor: "普通读者",
                subject: "普通读者",
                action: "查找他们自己借出的书目",
                object: "自己借出的书目",
                condition: "登录身份为普通读者",
                outcome: "系统返回该读者自己的借出书目",
                confidence: 0.66,
                status: "pending-review",
                criticality: "critical",
                acceptanceCriteria: ["普通读者只能查看自己当前借出的书目。"],
                priority: "must",
                fieldProvenance: {
                  actor: {
                    source: "ai-suggested",
                    status: "pending-review",
                    value: "普通读者",
                  },
                  object: {
                    source: "ai-suggested",
                    status: "pending-review",
                    value: "自己借出的书目",
                  },
                },
              },
            ],
          },
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const row = await screen.findByRole("row", {
      name: /r10.*功能\(4\)可供普通读者查找他们自己借出的书目/u,
    });
    expect(updateRequirementBaseline).not.toHaveBeenCalled();
    expect(within(row).getByText("有待确认提示")).toBeInTheDocument();
    expect(within(row).getByText("4项")).toBeInTheDocument();
    const detailsButton = within(row).getByRole("button", {
      name: /需求提示详情 r10/u,
    });
    expect(detailsButton).not.toHaveAttribute("title");
    expect(screen.queryByRole("dialog", { name: "需求规则修复确认" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "需求质量提示" })).not.toBeInTheDocument();
    expect(screen.queryByText("REQ-010 包含 AI 补齐待确认字段。")).not.toBeInTheDocument();
    expect(screen.queryByText("REQ-010 缺少可验证边界。")).not.toBeInTheDocument();

    await user.click(detailsButton);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const dialog = screen.getByRole("dialog", { name: "需求质量提示" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("REQ-010 包含 AI 补齐待确认字段。")).toBeInTheDocument();
    expect(screen.getByText("REQ-010 缺少可验证边界。")).toBeInTheDocument();
    expect(screen.getByText("角色/执行者")).toBeInTheDocument();
    expect(screen.getByText("对象")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /复核详情/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑后采纳" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "采纳 AI 补齐" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "拒绝建议" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "采纳" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "智能修复" })).toBeInTheDocument();
    expect(screen.queryByText(/阻断可信完成/u)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "需求质量提示" }),
      ).not.toBeInTheDocument();
    });
    expect(updateRequirementBaseline).not.toHaveBeenCalled();
  });

  it("keeps generated rules without hint details as read-only status text", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r1",
              text: "系统应提供订单提交能力。",
            }),
          ],
          requirementBaseline: {
            runId: "run-clean-rule",
            sourceDocumentId: "inline-requirement",
            createdAt: "2026-05-24T00:00:00.000Z",
            assumptions: [],
            conflicts: [],
            qualityReport: {
              runId: "run-clean-rule",
              status: "passed",
              summary: "需求质量检查通过。",
              issues: [],
              blockingIssueIds: [],
              reviewRequiredRequirementIds: [],
            },
            requirements: [
              {
                id: "REQ-001",
                sourceRuleId: "r1",
                sourceFragment: "系统应提供订单提交能力。",
                sourceLocation: { section: "input", startOffset: 0, endOffset: 12 },
                type: "functional",
                actor: "用户",
                subject: "用户",
                action: "提交订单",
                object: "订单",
                condition: null,
                outcome: "系统保存订单",
                confidence: 0.9,
                status: "accepted",
                criticality: "medium",
                acceptanceCriteria: ["用户可以提交订单。"],
                priority: "should",
                fieldProvenance: {},
              },
            ],
          },
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const row = await screen.findByRole("row", {
      name: /r1.*系统应提供订单提交能力/u,
    });
    expect(within(row).getByText("已生成")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /查看需求提示详情/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "需求规则修复确认" })).not.toBeInTheDocument();
  });

  it("does not expose single-rule repair actions from the requirement table", async () => {
    const startRun = vi.fn();
    const updateRequirementBaseline = vi.fn(async () => {});
    const repairRequirementRule = vi.fn(async (input) => {
      const requirement = {
        ...input.baseline.requirements[0],
        actor: "系统",
        subject: "系统",
        confidence: 0.82,
        status: "accepted" as const,
        fieldProvenance: {
          actor: {
            source: "ai-suggested" as const,
            status: "accepted" as const,
            value: "系统",
            rationale: "原文描述的是系统状态一致性约束。",
          },
          subject: {
            source: "ai-suggested" as const,
            status: "accepted" as const,
            value: "系统",
            rationale: "由约束语义推出主体。",
          },
        },
      };
      return {
        requirement,
        qualityReport: {
          ...input.baseline.qualityReport,
          status: "blocked" as const,
          issues: input.baseline.qualityReport.issues.filter(
            (issue) => issue.requirementId !== "REQ-013",
          ),
          blockingIssueIds: ["ISS-014"],
          reviewRequiredRequirementIds: ["REQ-014"],
        },
        repairRationale: "只修复当前规则。",
        blockingReasons: [],
      };
    });
    const repository = createBaseRepository({
      startRun,
      updateRequirementBaseline,
      repairRequirementRule,
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r13",
              text: "同一时刻，一本书不能既处于已借出状态，又处于可借阅状态。",
            }),
            createRule({
              id: "r14",
              text: "一个读者一次借出的书籍数目不能超过预定值。",
            }),
          ],
          requirementBaseline: {
            runId: "run-ai-field-repair",
            sourceDocumentId: "inline-requirement",
            createdAt: "2026-05-24T00:00:00.000Z",
            assumptions: [],
            conflicts: [],
            qualityReport: {
              runId: "run-ai-field-repair",
              status: "blocked",
              summary: "存在阻断项。",
              issues: [
                {
                  id: "ISS-013",
                  requirementId: "REQ-013",
                  severity: "critical",
                  code: "missing-actor",
                  message: "REQ-013 缺少明确角色/执行者。",
                  blocksDownstream: true,
                },
                {
                  id: "ISS-014",
                  requirementId: "REQ-014",
                  severity: "critical",
                  code: "missing-boundary",
                  message: "REQ-014 提到边界但缺少可验证数值。",
                  blocksDownstream: true,
                },
              ],
              blockingIssueIds: ["ISS-013", "ISS-014"],
              reviewRequiredRequirementIds: ["REQ-013", "REQ-014"],
            },
            requirements: [
              {
                id: "REQ-013",
                sourceRuleId: "r13",
                sourceFragment: "同一时刻，一本书不能既处于已借出状态，又处于可借阅状态。",
                sourceLocation: { section: "input", startOffset: 0, endOffset: 28 },
                type: "business-rule",
                actor: null,
                subject: null,
                action: "一本书不能同时处于两个状态",
                object: "图书借阅状态",
                condition: null,
                outcome: "系统阻止该行为",
                confidence: 0.62,
                status: "pending-review",
                criticality: "critical",
                acceptanceCriteria: ["同一图书不能同时标记为已借出和可借阅。"],
                priority: "must",
                fieldProvenance: {},
              },
              {
                id: "REQ-014",
                sourceRuleId: "r14",
                sourceFragment: "一个读者一次借出的书籍数目不能超过预定值。",
                sourceLocation: { section: "input", startOffset: 0, endOffset: 20 },
                type: "business-rule",
                actor: "读者",
                subject: "读者",
                action: "借出书籍数目不能超过",
                object: "借出的书籍",
                condition: "借书数量上限为预定值，需人工确认具体数值",
                outcome: "超过上限时系统阻断借书",
                confidence: 0.64,
                status: "pending-review",
                criticality: "critical",
                acceptanceCriteria: ["读者借书数量超过上限时系统必须拒绝。"],
                priority: "must",
                fieldProvenance: {
                  condition: {
                    source: "ai-suggested",
                    status: "pending-review",
                    value: "借书数量上限为预定值，需人工确认具体数值",
                    rationale: "原文没有给出具体数值。",
                  },
                },
              },
            ],
          },
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const r13Row = await screen.findByRole("row", {
      name: /r13.*同一时刻/u,
    });
    const r14Row = await screen.findByRole("row", {
      name: /r14.*预定值/u,
    });
    expect(within(r14Row).getByText("有待确认提示")).toBeInTheDocument();

    expect(within(r13Row).queryByRole("button", { name: /复核详情/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新智能修复" })).not.toBeInTheDocument();
    expect(startRun).not.toHaveBeenCalled();
    expect(repairRequirementRule).not.toHaveBeenCalled();
    expect(updateRequirementBaseline).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "单项智能修复完成" })).not.toBeInTheDocument();
    expect(screen.queryByText(/REQ-013|runId|requirementId|EvidencePackage/u)).not.toBeInTheDocument();
    expect(within(r14Row).getByText("有待确认提示")).toBeInTheDocument();
    expect(within(r14Row).getByDisplayValue("一个读者一次借出的书籍数目不能超过预定值。")).toBeInTheDocument();
  });

  it("shows missing business facts as AI suggestions that still require confirmation", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r14",
              text: "一个读者一次借出的书籍数目不能超过预定值。",
            }),
          ],
          requirementBaseline: {
            runId: "run-ai-field-repair",
            sourceDocumentId: "inline-requirement",
            createdAt: "2026-05-24T00:00:00.000Z",
            assumptions: [],
            conflicts: [],
            qualityReport: {
              runId: "run-ai-field-repair",
              status: "blocked",
              summary: "存在待确认边界条件。",
              issues: [
                {
                  id: "ISS-014",
                  requirementId: "REQ-014",
                  severity: "critical",
                  code: "missing-boundary",
                  message: "REQ-014 提到边界但缺少可验证数值。",
                  blocksDownstream: true,
                },
              ],
              blockingIssueIds: ["ISS-014"],
              reviewRequiredRequirementIds: ["REQ-014"],
            },
            requirements: [
              {
                id: "REQ-014",
                sourceRuleId: "r14",
                sourceFragment: "一个读者一次借出的书籍数目不能超过预定值。",
                sourceLocation: { section: "input", startOffset: 0, endOffset: 20 },
                type: "business-rule",
                actor: "读者",
                subject: "读者",
                action: "借出书籍数目不能超过",
                object: "借出的书籍",
                condition: "借书数量上限为预定值，需人工确认具体数值",
                outcome: "超过上限时系统阻断借书",
                confidence: 0.64,
                status: "pending-review",
                criticality: "critical",
                acceptanceCriteria: ["读者借书数量超过上限时系统必须拒绝。"],
                priority: "must",
                fieldProvenance: {
                  condition: {
                    source: "ai-suggested",
                    status: "pending-review",
                    value: "借书数量上限为预定值，需人工确认具体数值",
                    originalValue: null,
                    rationale:
                      "原文含边界限制但没有给出具体数值，AI 只能补齐待确认的边界条件。",
                  },
                },
              },
            ],
          },
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const row = await screen.findByRole("row", {
      name: /r14.*一个读者一次借出的书籍数目不能超过预定值/u,
    });
    expect(within(row).getByText("有待确认提示")).toBeInTheDocument();
    expect(within(row).getByText("2项")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /复核详情/u })).not.toBeInTheDocument();
    expect(within(row).queryByText(/预定值缺少具体数值/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "需求规则修复确认" })).not.toBeInTheDocument();
  });

  it("toggles selectable target diagrams from the whole model card", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r1",
              relatedDiagrams: ["usecase"],
            }),
          ],
          rulesVersion: 1,
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const useCaseCheckbox = await screen.findByRole("checkbox", {
      name: /用例模型/,
    });
    const useCaseCard = screen.getByRole("button", { name: "选择用例模型" });
    expect(useCaseCard).toHaveClass("min-h-[236px]");
    expect(useCaseCard).toHaveClass("bg-gradient-to-br");
    expect(useCaseCheckbox).not.toBeChecked();

    await user.click(useCaseCard);

    expect(useCaseCheckbox).toBeChecked();

    await user.keyboard("{Enter}");

    expect(useCaseCheckbox).not.toBeChecked();
  });

  it("toggles target diagram cards that will auto-fill when no rules exist", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [],
          rulesVersion: 0,
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const classDiagramCheckbox = await screen.findByRole("checkbox", {
      name: /领域概念模型/,
    });
    expect(classDiagramCheckbox).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "选择领域概念模型" }));

    expect(classDiagramCheckbox).toBeChecked();
  });

  it("keeps rule id jumps from toggling target diagram selection", async () => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r1",
              relatedDiagrams: ["usecase"],
            }),
          ],
          rulesVersion: 1,
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const useCaseCheckbox = await screen.findByRole("checkbox", {
      name: /用例模型/,
    });
    expect(useCaseCheckbox).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "r1" }));

    expect(useCaseCheckbox).not.toBeChecked();
  });

  it("allows correcting the type of an existing requirement rule", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r1",
              category: "非功能需求",
              text: "用户可以提交订单。",
              relatedDiagrams: ["usecase"],
            }),
          ],
          rulesVersion: 1,
        }),
      ),
      updateRequirementRules,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await chooseSelectOption(
      user,
      await screen.findByRole("combobox", { name: "需求类型 r1" }),
      "功能需求",
    );

    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith([
        expect.objectContaining({
          id: "r1",
          category: "功能需求",
        }),
      ]);
    });
  });

  it("keeps a selected target diagram when its last linked rule is deleted", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const usecaseRule = createRule({
      id: "r1",
      text: "用户可以提交订单。",
      relatedDiagrams: ["usecase"],
    });
    const classRule = createRule({
      id: "r2",
      text: "系统必须保存订单实体。",
      relatedDiagrams: ["class"],
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [usecaseRule, classRule],
          rulesVersion: 1,
          selectedDiagramTypes: ["class"],
        }),
      ),
      updateRequirementRules,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const classDiagramCheckbox = await screen.findByRole("checkbox", {
      name: /领域概念模型/,
    });
    await user.click(classDiagramCheckbox);
    expect(classDiagramCheckbox).toBeChecked();

    await user.click(screen.getByRole("button", { name: "删除需求项 r2" }));

    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith([usecaseRule]);
      expect(classDiagramCheckbox).toBeChecked();
      expect(classDiagramCheckbox).toBeEnabled();
    });
    expect(
      screen.getAllByText(/将自动补齐：规则映射/).length,
    ).toBeGreaterThan(0);
  });

  it("keeps generation in the background without opening diagnostics overlay", async () => {
    let completeRun!: () => void;
    const snapshot = createRunSnapshot({
      runId: "run-stream",
      requirementText: "创建一个订单系统",
      rules: [createRule()],
    });
    const repository = createBaseRepository({
      startRun: vi.fn(async () => ({ runId: "run-stream" })),
      subscribeToRun: vi.fn(
        async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
          onEvent({ type: "queued" });
          onEvent({ type: "stage_started", stage: "extract_rules" });
          onEvent({ type: "llm_chunk", stage: "extract_rules", chunk: "{\"rules\":" });
          onEvent({ type: "llm_chunk", stage: "extract_rules", chunk: "[{\"id\":\"r1\"}]" });
          await new Promise<void>((resolve) => {
            completeRun = () => {
              onEvent({ type: "completed", snapshot });
              resolve();
            };
          });
        },
      ),
      getRunSnapshot: vi.fn(async () => snapshot),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.type(
      await screen.findByPlaceholderText(
        "用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则",
      ),
      "创建一个订单系统",
    );
    await user.click(screen.getByTitle("生成需求规则"));

    expect(screen.getByTitle("生成需求规则")).toBeDisabled();
    expect(screen.queryByText("查看详情")).not.toBeInTheDocument();
    expect(screen.queryByText(/Run ID：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\{"rules":\[\{"id":"r1"\}\]/)).not.toBeInTheDocument();
    expect(screen.queryByText("extract_rules 收到模型输出")).not.toBeInTheDocument();

    completeRun();
  });

  it("renders requirement rules as an editable-text table", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const originalRule = createRule({
      id: "r1",
      category: "业务规则",
      text: "用户必须登录后才能访问主要功能。",
      relatedDiagrams: ["usecase", "activity"],
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [originalRule],
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
      updateRequirementRules,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    expect(screen.getByText("AI 需求助手")).toBeInTheDocument();
    expect(screen.queryByText("探索与灵感")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则",
      ),
    ).toHaveClass("h-[240px]");
    expect(within(table).getByRole("columnheader", { name: "编号" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "类型" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "需求文本内容" })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "相关图" })).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    expect(within(table).getByText("r1")).toBeInTheDocument();
    expect(within(table).getByText("业务规则")).toBeInTheDocument();
    expect(within(table).getByRole("combobox", { name: "需求类型 r1" })).toBeInTheDocument();
    expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();

    const textEditor = within(table).getByDisplayValue(
      "用户必须登录后才能访问主要功能。",
    ) as HTMLInputElement;
    expect(textEditor.tagName).toBe("INPUT");
    expect(textEditor.type).toBe("text");
    await user.clear(textEditor);
    await user.type(textEditor, "游客可以查看公开活动列表。");

    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith([
        {
          ...originalRule,
          text: "游客可以查看公开活动列表。",
        },
      ]);
    });
  });

  it("shows repair candidates as before-after confirmation and accepts the repaired rule", async () => {
    const updateRequirementBaseline = vi.fn(async () => {});
    const updateRequirementReviewCandidates = vi.fn(async () => {});
    const rule = createRule({
      id: "r1",
      category: "功能需求",
      text: "系统应允许用户提交订单。",
    });
    const beforeRequirement = createAtomicRequirement({
      fieldProvenance: {
        actor: {
          source: "ai-suggested",
          status: "pending-review",
          value: null,
          rationale: "原文缺少明确参与者。",
        },
      },
    });
    const afterRequirement = createAtomicRequirement({
      actor: "用户",
      confidence: 0.84,
      fieldProvenance: {
        actor: {
          source: "ai-suggested",
          status: "accepted",
          value: "用户",
          rationale: "从需求文本补齐参与者。",
        },
      },
    });
    const baseline = createRequirementBaseline([beforeRequirement]);
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单需求",
          rules: [rule],
          rulesVersion: 1,
          requirementBaseline: baseline,
          requirementQualityReport: baseline.qualityReport,
          requirementReviewCandidates: {
            r1: {
              ruleId: "r1",
              beforeRequirement,
              afterRequirement,
              repairRationale: "补齐参与者字段。",
              blockingReasons: ["缺少参与者"],
              status: "pending",
              errorMessage: null,
              createdAt: "2026-05-27T00:00:00.000Z",
            },
          },
        }),
      ),
      updateRequirementBaseline,
      updateRequirementReviewCandidates,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    expect(within(table).getByText("修复结果待确认")).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "需求提示详情 r1" }));

    const dialog = await screen.findByRole("dialog", { name: "需求规则修复确认" });
    expect(within(dialog).getByText("修复前后对比")).toBeInTheDocument();
    expect(within(dialog).getByText("补齐参与者字段。")).toBeInTheDocument();
    expect(within(dialog).getByText("缺少参与者")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "拒绝" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "采纳" }));

    await waitFor(() => {
      expect(updateRequirementBaseline).toHaveBeenCalledWith(
        expect.objectContaining({
          requirements: [
            expect.objectContaining({
              actor: "用户",
              status: "accepted",
            }),
          ],
          qualityReport: expect.objectContaining({
            issues: [],
            reviewRequiredRequirementIds: [],
          }),
        }),
      );
    });
    expect(updateRequirementReviewCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        r1: expect.objectContaining({ status: "accepted" }),
      }),
    );
  });

  it("closes failed repair candidate dialogs without keeping stale details", async () => {
    const rule = createRule({
      id: "r11",
      category: "功能需求",
      text: "系统自动化稿件评审和发布流程",
    });
    const requirement = createAtomicRequirement({
      id: "REQ-011",
      sourceRuleId: "r11",
      sourceFragment: "系统自动化稿件评审和发布流程",
      actor: null,
      object: null,
      status: "pending-review",
    });
    const baseline = createRequirementBaseline([requirement]);
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "出版系统需求",
          rules: [rule],
          rulesVersion: 1,
          requirementBaseline: baseline,
          requirementQualityReport: baseline.qualityReport,
          requirementReviewCandidates: {
            r11: {
              ruleId: "r11",
              beforeRequirement: requirement,
              afterRequirement: null,
              repairRationale: null,
              blockingReasons: [],
              status: "failed",
              errorMessage: "Expected array, received null",
              createdAt: "2026-06-15T00:00:00.000Z",
            },
          },
        }),
      ),
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    expect(within(table).getByText("修复失败待重试")).toBeInTheDocument();
    await user.click(
      within(table).getByRole("button", { name: "需求提示详情 r11" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "需求质量提示",
    });
    expect(
      within(dialog).getByText("Expected array, received null"),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "需求质量提示" }),
      ).not.toBeInTheDocument();
    });
  });

  it("allows confirming quality hints when no repair candidate is available", async () => {
    const updateRequirementBaseline = vi.fn(async () => {});
    const rule = createRule({
      id: "r6",
      category: "业务规则",
      text: "联系方式在认领通过前隐藏",
    });
    const requirement = createAtomicRequirement({
      id: "REQ-006",
      sourceRuleId: "r6",
      sourceFragment: "联系方式在认领通过前隐藏",
      actor: null,
      subject: null,
      object: null,
      confidence: 0.56,
      status: "pending-review",
      fieldProvenance: {},
    });
    const baseline = createRequirementBaseline([requirement], {
      qualityReport: {
        runId: "run-baseline",
        status: "pending-review",
        summary: "发现 1 个需求质量提示。",
        issues: [
          {
            id: "ISS-003",
            code: "missing-actor",
            message: "REQ-006 缺少明确角色/执行者。",
            severity: "critical",
            requirementId: "REQ-006",
            blocksDownstream: false,
          },
        ],
        blockingIssueIds: [],
        reviewRequiredRequirementIds: ["REQ-006"],
      },
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "校园失物招领需求",
          rules: [rule],
          rulesVersion: 1,
          requirementBaseline: baseline,
          requirementQualityReport: baseline.qualityReport,
          requirementReviewCandidates: {},
        }),
      ),
      updateRequirementBaseline,
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    expect(within(table).getByText("有待确认提示")).toBeInTheDocument();
    await user.click(
      within(table).getByRole("button", { name: "需求提示详情 r6" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "需求质量提示",
    });
    expect(
      within(dialog).getByText("REQ-006 缺少明确角色/执行者。"),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "确认提示" }));

    await waitFor(() => {
      expect(updateRequirementBaseline).toHaveBeenCalledWith(
        expect.objectContaining({
          requirements: [
            expect.objectContaining({
              id: "REQ-006",
              status: "accepted",
            }),
          ],
          qualityReport: expect.objectContaining({
            issues: [],
            reviewRequiredRequirementIds: [],
          }),
        }),
      );
    });
  });

  it("allows confirming quality hints when an old candidate was already accepted", async () => {
    const updateRequirementBaseline = vi.fn(async () => {});
    const rule = createRule({
      id: "r8",
      category: "业务规则",
      text: "超过 30 天未处理的信息自动提醒发布人，超过 90 天可归档",
    });
    const requirement = createAtomicRequirement({
      id: "REQ-008",
      sourceRuleId: "r8",
      sourceFragment:
        "超过 30 天未处理的信息自动提醒发布人，超过 90 天可归档",
      actor: null,
      subject: null,
      confidence: 0.56,
      status: "pending-review",
      fieldProvenance: {},
    });
    const baseline = createRequirementBaseline([requirement], {
      qualityReport: {
        runId: "run-baseline",
        status: "pending-review",
        summary: "发现 1 个需求质量提示。",
        issues: [
          {
            id: "ISS-006",
            code: "missing-actor",
            message: "REQ-008 缺少明确角色/执行者。",
            severity: "critical",
            requirementId: "REQ-008",
            blocksDownstream: false,
          },
        ],
        blockingIssueIds: [],
        reviewRequiredRequirementIds: ["REQ-008"],
      },
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "校园失物招领需求",
          rules: [rule],
          rulesVersion: 1,
          requirementBaseline: baseline,
          requirementQualityReport: baseline.qualityReport,
          requirementReviewCandidates: {
            r8: {
              ruleId: "r8",
              beforeRequirement: requirement,
              afterRequirement: {
                ...requirement,
                actor: "发布人",
                status: "accepted",
                confidence: 0.82,
              },
              repairRationale: "历史修复结果已采纳。",
              blockingReasons: [],
              status: "accepted",
              errorMessage: null,
              createdAt: "2026-06-08T15:00:00.000Z",
            },
          },
        }),
      ),
      updateRequirementBaseline,
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    await user.click(
      within(table).getByRole("button", { name: "需求提示详情 r8" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "需求质量提示",
    });
    expect(
      within(dialog).queryByRole("button", { name: "采纳" }),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "确认提示" }));

    await waitFor(() => {
      expect(updateRequirementBaseline).toHaveBeenCalledWith(
        expect.objectContaining({
          requirements: [
            expect.objectContaining({
              id: "REQ-008",
              status: "accepted",
            }),
          ],
          qualityReport: expect.objectContaining({
            issues: [],
            reviewRequiredRequirementIds: [],
          }),
        }),
      );
    });
  });

  it("keeps requirement text editable on the same page as generated rules", async () => {
    const updateRequirementText = vi.fn(async () => {});
    const originalRule = createRule({
      id: "r1",
      text: "系统应提供订单提交能力。",
      relatedDiagrams: ["usecase"],
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [originalRule],
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
      updateRequirementText,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    const sourceText = screen.getByPlaceholderText(
      "用一段话描述你的系统：做什么、给谁用、有哪些角色和关键流程，越具体越能抽出准确的需求规则",
    );
    expect(sourceText).toHaveValue("创建一个订单系统");
    expect(screen.queryByRole("button", { name: "返回修改描述" })).not.toBeInTheDocument();

    await user.type(sourceText, "，并支持退款");

    await waitFor(() => {
      expect(updateRequirementText).toHaveBeenLastCalledWith("创建一个订单系统，并支持退款");
    });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByText("需求文本已修改，下方规则基于旧文本，可能已过时。"),
    ).toBeInTheDocument();
  });

  it("uses selectable page sizes and filters requirement rules by text and type", async () => {
    const rules = Array.from({ length: 10 }, (_, index) =>
      createRule({
        id: `r${index + 1}`,
        text: `规则 ${index + 1}`,
        category: index % 2 === 0 ? "业务规则" : "数据需求",
        relatedDiagrams: ["usecase"],
      }),
    );
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules,
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    expect(within(table).getByDisplayValue("规则 1")).toBeInTheDocument();
    expect(within(table).getByDisplayValue("规则 8")).toBeInTheDocument();
    expect(within(table).queryByDisplayValue("规则 9")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("requirement-rule-row-slot")).toHaveLength(8);
    expect(screen.getByText("1-8 / 10")).toBeInTheDocument();
    expect(screen.getByTestId("requirement-rule-pagination")).toHaveClass("sticky", "bottom-0");
    await chooseSelectOption(
      user,
      screen.getByRole("combobox", { name: "每页需求规则数量" }),
      "每页 12 条",
    );
    expect(within(table).getByDisplayValue("规则 9")).toBeInTheDocument();
    expect(within(table).getByDisplayValue("规则 10")).toBeInTheDocument();
    expect(screen.getAllByTestId("requirement-rule-row-slot")).toHaveLength(12);
    expect(screen.getByText("1-10 / 10")).toBeInTheDocument();

    await chooseSelectOption(
      user,
      screen.getByRole("combobox", { name: "每页需求规则数量" }),
      "每页 8 条",
    );

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(within(table).queryByDisplayValue("规则 1")).not.toBeInTheDocument();
    expect(within(table).getByDisplayValue("规则 9")).toBeInTheDocument();
    expect(within(table).getByDisplayValue("规则 10")).toBeInTheDocument();
    expect(screen.getByText("9-10 / 10")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("搜索规则..."), "10");
    expect(within(table).getByDisplayValue("规则 10")).toBeInTheDocument();
    expect(within(table).queryByDisplayValue("规则 9")).not.toBeInTheDocument();
    expect(screen.getByText("1-1 / 1")).toBeInTheDocument();
    expect(screen.getAllByTestId("requirement-rule-row-slot")).toHaveLength(8);

    await user.clear(screen.getByPlaceholderText("搜索规则..."));
    await chooseSelectOption(
      user,
      screen.getByRole("combobox", { name: "需求类型筛选" }),
      "数据需求",
    );
    expect(within(table).getByDisplayValue("规则 2")).toBeInTheDocument();
    expect(within(table).getByDisplayValue("规则 10")).toBeInTheDocument();
    expect(within(table).queryByDisplayValue("规则 1")).not.toBeInTheDocument();
    expect(screen.getByText("1-5 / 5")).toBeInTheDocument();
  });

  it("keeps status and related diagram cells compact in fixed-width rows", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [
            createRule({
              id: "r10",
              text: "普通读者只能使用查找自己已借出书目的功能。",
              relatedDiagrams: ["usecase", "class", "activity"],
            }),
          ],
          requirementBaseline: {
            runId: "run-compact-rule-row",
            sourceDocumentId: "inline-requirement",
            createdAt: "2026-05-24T00:00:00.000Z",
            assumptions: [],
            conflicts: [],
            qualityReport: {
              runId: "run-compact-rule-row",
              status: "passed",
              summary: "系统已补齐结构化字段。",
              issues: [],
              blockingIssueIds: [],
              reviewRequiredRequirementIds: [],
            },
            requirements: [
              {
                id: "REQ-010",
                sourceRuleId: "r10",
                sourceFragment: "普通读者只能使用查找自己已借出书目的功能。",
                sourceLocation: { section: "input", startOffset: 0, endOffset: 21 },
                type: "business-rule",
                actor: "普通读者",
                subject: "普通读者",
                action: "查找",
                object: "自己已借出的书目",
                condition: "登录身份为普通读者",
                outcome: "系统返回自己的借出书目",
                confidence: 0.74,
                status: "accepted",
                criticality: "critical",
                acceptanceCriteria: ["普通读者只能查看自己已借出的书目。"],
                priority: "must",
                fieldProvenance: {
                  actor: {
                    source: "ai-suggested",
                    status: "accepted",
                    value: "普通读者",
                  },
                  object: {
                    source: "ai-suggested",
                    status: "accepted",
                    value: "自己已借出的书目",
                  },
                  condition: {
                    source: "ai-suggested",
                    status: "accepted",
                    value: "登录身份为普通读者",
                  },
                },
              },
            ],
          },
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const row = await screen.findByRole("row", {
      name: /r10.*普通读者只能使用查找自己已借出书目的功能/u,
    });
    const cells = within(row).getAllByRole("cell");
    expect(cells[2]).toHaveClass("px-4");
    expect(within(cells[2]).getByText("已确认")).toBeInTheDocument();
    expect(within(cells[2]).getByText("3项")).toBeInTheDocument();
    expect(within(cells[2]).queryByText("3项提示")).not.toBeInTheDocument();

    expect(cells).toHaveLength(5);
    expect(within(row).queryByText("用例模型")).not.toBeInTheDocument();
    expect(within(row).queryByText("领域概念模型")).not.toBeInTheDocument();
    expect(within(row).queryByText("界面关系")).not.toBeInTheDocument();
  });

  it("creates a requirement rule from the add-rule dialog", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const existingRule = createRule({
      id: "r1",
      category: "业务规则",
      text: "游客可以查看公开活动。",
      relatedDiagrams: ["usecase"],
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          rules: [existingRule],
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
      updateRequirementRules,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.click(await screen.findByRole("button", { name: /新增需求项/ }));
    const dialog = await screen.findByRole("dialog", { name: "新增需求项" });
    const submitButton = within(dialog).getByRole("button", { name: "创建需求项" });
    expect(submitButton).toBeDisabled();

    await chooseSelectOption(user, within(dialog).getByRole("combobox"), "数据需求");
    await user.click(within(dialog).getByRole("checkbox", { name: "领域概念模型" }));
    await user.type(
      within(dialog).getByPlaceholderText("填写这条需求项的具体内容"),
      "系统必须保存活动报名记录。",
    );
    await user.click(submitButton);

    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith([
        existingRule,
        {
          id: "r2",
          category: "数据需求",
          text: "系统必须保存活动报名记录。",
          relatedDiagrams: ["usecase", "activity", "class"],
        },
      ]);
    });
    expect(screen.queryByRole("dialog", { name: "新增需求项" })).not.toBeInTheDocument();
    await waitFor(() => {
      const table = screen.getByRole("table");
      expect(within(table).getByText("r2")).toBeInTheDocument();
      expect(within(table).getByText("数据需求")).toBeInTheDocument();
      expect(within(table).getByDisplayValue("系统必须保存活动报名记录。")).toBeInTheDocument();
    });
  });
});
