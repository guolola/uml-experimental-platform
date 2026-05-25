import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { DesignDiagramView, DiagramView } from "./diagram-detail-page";

describe("DiagramView", () => {
  function createRepository(
    workspace = createWorkspaceRecord(),
  ): WorkspaceRepository {
    return {
      loadWorkspace: vi.fn(async () => workspace),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      renderStructuredModel: vi.fn(async (model) => ({
        plantUmlSource: `@startuml\n' ${model.title}\n@enduml`,
        svg: `<svg><text>${model.diagramKind}</text></svg>`,
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: model.title.length,
          durationMs: 1,
        },
      })),
      saveRequirementModelEdit: vi.fn(async () => {}),
      saveDesignModelEdit: vi.fn(async () => {}),
      saveManualModelRerender: vi.fn(async () => {}),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
  }

  it("shows a clear error card when a diagram finished without SVG output", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
          generatedDiagramTypes: ["activity"],
          diagramErrors: {
            activity: {
              stage: "render_svg",
              message: "PlantUML repair failed for activity: Syntax Error?",
            },
          },
        }),
    );

    render(withWorkspaceProviders(<DiagramView type="activity" />, repository));

    expect(await screen.findByText("界面关系 生成失败")).toBeInTheDocument();
    expect(
      screen.getByText(/PlantUML repair failed for activity: Syntax Error\?/),
    ).toBeInTheDocument();
  });

  it("does not expose PlantUML source tabs or source export controls", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        rules: [
          createRule({
            id: "r1",
            text: "用户可以查看公开活动。",
            relatedDiagrams: ["usecase"],
          }),
        ],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: "<svg><text>ok</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByText("预览")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /PlantUML/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/@startuml/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PUML/i })).not.toBeInTheDocument();
    expect(screen.queryByText("溯源·需求规则")).not.toBeInTheDocument();
    expect(screen.queryByText("用户可以查看公开活动。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /JSON/i })).toBeInTheDocument();
  });

  it("opens SVG preview through a blob URL and revokes it on unmount", async () => {
    const createObjectURL = vi.fn(() => "blob:diagram-preview");
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: "<svg><text>ok</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    try {
      const { unmount } = render(
        withWorkspaceProviders(<DiagramView type="usecase" />, repository),
      );

      const link = await screen.findByRole("link", { name: /新标签/ });
      expect(link).toHaveAttribute("href", "blob:diagram-preview");
      expect(link.getAttribute("href")).not.toMatch(/^data:/);
      expect(createObjectURL).toHaveBeenCalledTimes(1);

      unmount();

      expect(revokeObjectURL).toHaveBeenCalledWith("blob:diagram-preview");
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  it("supports zooming generated SVG previews", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="200" height="120"><text>ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByText("100%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "放大 SVG" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "缩小 SVG" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("zooms only the SVG canvas on ctrl wheel and prevents page zoom", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="200" height="120"><text>ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    const canvas = await screen.findByTestId("svg-preview-canvas");
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });

    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(screen.getByText("110%")).toBeInTheDocument();
    });
  });

  it("pans the SVG canvas by dragging it", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="2000" height="1200"><text>ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    const canvas = await screen.findByTestId("svg-preview-canvas");
    Object.defineProperty(canvas, "scrollLeft", { configurable: true, value: 100, writable: true });
    Object.defineProperty(canvas, "scrollTop", { configurable: true, value: 80, writable: true });

    fireEvent.mouseDown(canvas, { button: 0, clientX: 120, clientY: 90 });
    fireEvent.mouseMove(canvas, { clientX: 90, clientY: 70 });
    fireEvent.mouseUp(canvas);

    expect(canvas.scrollLeft).toBe(130);
    expect(canvas.scrollTop).toBe(100);
  });

  it("shows large diagrams directly without summary view controls", async () => {
    const actors = Array.from({ length: 33 }, (_, index) => ({
      id: `actor_${index}`,
      name: `Actor ${index}`,
      actorType: "human" as const,
      responsibilities: [],
    }));
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "大型用例图",
            notes: [],
            actors,
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="200" height="120"><text>large diagram</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByText("large diagram")).toBeInTheDocument();
    expect(screen.queryByText("摘要视图")).not.toBeInTheDocument();
    expect(screen.queryByText("完整视图")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "放大 SVG" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("filters elements and shows human-readable relation endpoints", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Event\nclass Reminder\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "公开日历领域对象",
            notes: [],
            classes: [
              {
                id: "cls_event",
                name: "Event",
                description: "公开活动",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
              {
                id: "cls_reminder",
                name: "Reminder",
                description: "提醒记录",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [
              {
                id: "rel_event_reminder",
                type: "association",
                sourceId: "cls_event",
                targetId: "cls_reminder",
                label: null,
                sourceRole: "event",
                targetRole: "reminders",
                sourceMultiplicity: "1",
                targetMultiplicity: "0..*",
                navigability: "bidirectional",
                description: "活动关联多个提醒记录。",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Event</text><text>Reminder</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await userEvent.click(await screen.findByRole("tab", { name: /元素/ }));
    expect(screen.getByRole("button", { name: "网格视图" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "全部类型 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reminder" })).toBeInTheDocument();
    expect(screen.getAllByText(/个字段/).length).toBeGreaterThan(0);

    await userEvent.type(screen.getByPlaceholderText("搜索元素、属性或说明"), "Reminder");
    expect(screen.queryByRole("button", { name: "Event" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reminder" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /关系/ }));
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.getByText(/Event → Reminder/)).toBeInTheDocument();
  });

  it("edits a use case model and rerenders the current diagram", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 教师\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "教师登录系统",
            notes: [],
            actors: [
              {
                id: "actor_teacher",
                name: "教师",
                actorType: "human",
                responsibilities: [],
              },
            ],
            useCases: [
              {
                id: "uc_login",
                name: "登录",
                goal: "进入系统",
                preconditions: [],
                postconditions: [],
                supportingActorIds: [],
              },
            ],
            systemBoundaries: [{ id: "system", name: "实验平台" }],
            relationships: [
              {
                id: "rel_login",
                type: "association",
                sourceId: "actor_teacher",
                targetId: "uc_login",
                label: "发起",
              },
            ],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: "<svg><text>教师</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    const actorNameInput = await screen.findByLabelText("角色 actor_teacher 名称");
    await userEvent.clear(actorNameInput);
    await userEvent.type(actorNameInput, "授课教师");
    const relationLabelInput = screen.getByLabelText("关系 rel_login 名称");
    await userEvent.clear(relationLabelInput);
    await userEvent.type(relationLabelInput, "发起登录");
    expect(screen.queryByRole("button", { name: "保存编辑" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重新生成当前图" }));

    expect(repository.saveRequirementModelEdit).toHaveBeenCalledWith(
      "usecase",
      expect.objectContaining({
        actors: [expect.objectContaining({ name: "授课教师" })],
        relationships: [expect.objectContaining({ label: "发起登录" })],
      }),
      expect.objectContaining({ status: "dirty" }),
    );
    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: [expect.objectContaining({ name: "授课教师" })],
        relationships: [expect.objectContaining({ label: "发起登录" })],
      }),
    );
    expect(
      vi.mocked(repository.saveRequirementModelEdit).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(repository.renderStructuredModel).mock.invocationCallOrder[0],
    );
    await waitFor(() => {
      expect(screen.queryByText(/可能与前置需求映射不一致/)).not.toBeInTheDocument();
    });
  });

  it("edits class members, relation metadata, and shared model fields", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: { class: "@startuml\nclass Order\n@enduml" },
        models: {
          class: {
            diagramKind: "class",
            title: "类图",
            summary: "订单领域",
            notes: ["旧备注"],
            classes: [
              {
                id: "cls_order",
                name: "Order",
                classKind: "entity",
                stereotype: "AggregateRoot",
                description: "订单",
                attributes: [
                  {
                    name: "amount",
                    type: "number",
                    visibility: "private",
                    required: true,
                  },
                ],
                operations: [
                  {
                    name: "submit",
                    returnType: "void",
                    visibility: "public",
                    parameters: [
                      {
                        name: "operatorId",
                        type: "string",
                        required: true,
                      },
                    ],
                  },
                ],
              },
              {
                id: "cls_user",
                name: "User",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [
              {
                id: "if_payable",
                name: "Payable",
                operations: [{ name: "pay", visibility: "public", parameters: [] }],
              },
            ],
            enums: [{ id: "enum_status", name: "OrderStatus", literals: ["CREATED"] }],
            relationships: [
              {
                id: "rel_owner",
                type: "association",
                sourceId: "cls_user",
                targetId: "cls_order",
                sourceMultiplicity: "1",
                targetMultiplicity: "*",
                navigability: "source-to-target",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Order</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await userEvent.clear(await screen.findByLabelText("模型标题"));
    await userEvent.type(screen.getByLabelText("模型标题"), "订单类模型");
    await userEvent.clear(screen.getByLabelText("模型备注"));
    await userEvent.type(screen.getByLabelText("模型备注"), "人工补充备注");
    await userEvent.clear(screen.getByLabelText("类 cls_order 属性 0 名称"));
    await userEvent.type(screen.getByLabelText("类 cls_order 属性 0 名称"), "totalAmount");
    await userEvent.clear(screen.getByLabelText("类 cls_order 方法 0 参数 0 名称"));
    await userEvent.type(screen.getByLabelText("类 cls_order 方法 0 参数 0 名称"), "userId");
    await userEvent.clear(screen.getByLabelText("接口 if_payable 方法 0 名称"));
    await userEvent.type(screen.getByLabelText("接口 if_payable 方法 0 名称"), "capture");
    fireEvent.change(screen.getByLabelText("枚举 enum_status 字面量"), {
      target: { value: "CREATED\nPAID" },
    });
    await userEvent.clear(screen.getByLabelText("关系 rel_owner 目标多重性"));
    await userEvent.type(screen.getByLabelText("关系 rel_owner 目标多重性"), "0..*");

    await userEvent.click(screen.getByRole("button", { name: "重新生成当前图" }));

    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "订单类模型",
        notes: ["人工补充备注"],
        classes: expect.arrayContaining([
          expect.objectContaining({
            id: "cls_order",
            attributes: [expect.objectContaining({ name: "totalAmount" })],
            operations: [
              expect.objectContaining({
                parameters: [expect.objectContaining({ name: "userId" })],
              }),
            ],
          }),
        ]),
        interfaces: [
          expect.objectContaining({
            operations: [expect.objectContaining({ name: "capture" })],
          }),
        ],
        enums: [expect.objectContaining({ literals: ["CREATED", "PAID"] })],
        relationships: [
          expect.objectContaining({
            targetMultiplicity: "0..*",
          }),
        ],
      }),
    );
  });

  it("edits table columns and field-level table relations", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["table"],
        designPlantUml: { table: "@startuml\n@enduml" },
        designModels: {
          table: {
            diagramKind: "table",
            title: "表关系图",
            summary: "订单表",
            notes: [],
            tables: [
              {
                id: "orders",
                name: "orders",
                columns: [
                  {
                    id: "order_id",
                    name: "id",
                    dataType: "uuid",
                    isPrimaryKey: true,
                    isForeignKey: false,
                    nullable: false,
                  },
                  {
                    id: "user_id",
                    name: "user_id",
                    dataType: "uuid",
                    isPrimaryKey: false,
                    isForeignKey: true,
                    nullable: false,
                  },
                ],
              },
              {
                id: "users",
                name: "users",
                columns: [
                  {
                    id: "id",
                    name: "id",
                    dataType: "uuid",
                    isPrimaryKey: true,
                    isForeignKey: false,
                    nullable: false,
                  },
                ],
              },
            ],
            relationships: [
              {
                id: "rel_orders_users",
                type: "one-to-many",
                sourceTableId: "users",
                targetTableId: "orders",
              },
            ],
          },
        },
        designSvgArtifacts: {
          table: {
            diagramKind: "table",
            svg: "<svg><text>orders</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DesignDiagramView type="table" />, repository));

    await userEvent.clear(await screen.findByLabelText("数据表 orders 字段 order_id 名称"));
    await userEvent.type(screen.getByLabelText("数据表 orders 字段 order_id 名称"), "order_id");
    await userEvent.click(screen.getByLabelText("数据表 orders 添加字段"));
    await userEvent.selectOptions(screen.getByLabelText("关系 rel_orders_users 源字段"), "id");
    await userEvent.selectOptions(screen.getByLabelText("关系 rel_orders_users 目标字段"), "user_id");

    await userEvent.click(screen.getByRole("button", { name: "重新生成当前图" }));

    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        tables: expect.arrayContaining([
          expect.objectContaining({
            id: "orders",
            columns: expect.arrayContaining([
              expect.objectContaining({ id: "order_id", name: "order_id" }),
              expect.objectContaining({ name: "new_column" }),
            ]),
          }),
        ]),
        relationships: [
          expect.objectContaining({
            sourceColumnId: "id",
            targetColumnId: "user_id",
          }),
        ],
      }),
    );
  });

  it("edits sequence message details and fragment message membership", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designPlantUml: { "sequence:login": "@startuml\n@enduml" },
        designModels: {
          "sequence:login": {
            diagramKind: "sequence",
            modelId: "sequence:login",
            title: "登录顺序图",
            summary: "登录流程",
            notes: [],
            participants: [
              { id: "teacher", name: "教师", participantType: "actor" },
              { id: "auth", name: "认证服务", participantType: "service" },
            ],
            messages: [
              {
                id: "msg_login",
                type: "sync",
                sourceId: "teacher",
                targetId: "auth",
                name: "登录",
                parameters: ["username"],
              },
              {
                id: "msg_result",
                type: "return",
                sourceId: "auth",
                targetId: "teacher",
                name: "返回结果",
                parameters: [],
              },
            ],
            fragments: [
              {
                id: "frag_auth",
                type: "opt",
                label: "认证成功",
                messageIds: ["msg_login"],
              },
            ],
          },
        },
        designSvgArtifacts: {
          "sequence:login": {
            diagramKind: "sequence",
            modelId: "sequence:login",
            svg: "<svg><text>login</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DesignDiagramView type="sequence" modelId="sequence:login" />,
        repository,
      ),
    );

    await userEvent.selectOptions(await screen.findByLabelText("参与对象 auth 类型"), "control");
    fireEvent.change(screen.getByLabelText("关系 msg_login 参数"), {
      target: { value: "username\npassword" },
    });
    await userEvent.clear(screen.getByLabelText("关系 msg_result 返回值"));
    await userEvent.type(screen.getByLabelText("关系 msg_result 返回值"), "token");
    await userEvent.click(screen.getByLabelText("组合片段 frag_auth 包含消息 msg_result"));

    await userEvent.click(screen.getByRole("button", { name: "重新生成当前图" }));

    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        participants: expect.arrayContaining([
          expect.objectContaining({ id: "auth", participantType: "control" }),
        ]),
        messages: expect.arrayContaining([
          expect.objectContaining({ id: "msg_login", parameters: ["username", "password"] }),
          expect.objectContaining({ id: "msg_result", returnValue: "token" }),
        ]),
        fragments: [expect.objectContaining({ messageIds: ["msg_login", "msg_result"] })],
      }),
    );
  });

  it("edits activity and deployment relation-specific fields without collapsing them into descriptions", async () => {
    const activityRepository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["activity"],
        plantUml: { activity: "@startuml\n@enduml" },
        models: {
          activity: {
            diagramKind: "activity",
            title: "活动图",
            summary: "审批流程",
            notes: [],
            swimlanes: [{ id: "lane_teacher", name: "教师" }],
            nodes: [
              { id: "start", type: "start", name: "开始" },
              { id: "decide", type: "decision", question: "是否通过" },
              { id: "approve", type: "activity", name: "批准", input: [], output: [] },
            ],
            relationships: [
              { id: "flow_yes", type: "control_flow", sourceId: "decide", targetId: "approve", guard: "是" },
            ],
          },
        },
        svgArtifacts: {
          activity: {
            diagramKind: "activity",
            svg: "<svg><text>activity</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    const { unmount } = render(withWorkspaceProviders(<DiagramView type="activity" />, activityRepository));

    await userEvent.clear(await screen.findByLabelText("活动节点 decide 问题"));
    await userEvent.type(screen.getByLabelText("活动节点 decide 问题"), "是否允许提交");
    await userEvent.clear(screen.getByLabelText("关系 flow_yes 守卫"));
    await userEvent.type(screen.getByLabelText("关系 flow_yes 守卫"), "允许");
    await userEvent.click(screen.getByRole("button", { name: "重新生成当前图" }));

    expect(activityRepository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "decide", question: "是否允许提交" }),
        ]),
        relationships: [expect.objectContaining({ guard: "允许" })],
      }),
    );
    expect(
      (
        vi.mocked(activityRepository.renderStructuredModel).mock.calls[0]?.[0] as {
          relationships: Array<Record<string, unknown>>;
        }
      ).relationships[0],
    ).not.toHaveProperty("description");

    unmount();

    const deploymentRepository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["deployment"],
        designPlantUml: { deployment: "@startuml\n@enduml" },
        designModels: {
          deployment: {
            diagramKind: "deployment",
            title: "部署图",
            summary: "部署拓扑",
            notes: [],
            nodes: [{ id: "web", name: "Web", nodeType: "server" }],
            databases: [{ id: "db", name: "DB", engine: "PostgreSQL" }],
            components: [],
            externalSystems: [],
            artifacts: [],
            relationships: [
              {
                id: "dep_db",
                type: "communication",
                sourceId: "web",
                targetId: "db",
                protocol: "TCP",
              },
            ],
          },
        },
        designSvgArtifacts: {
          deployment: {
            diagramKind: "deployment",
            svg: "<svg><text>deploy</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DesignDiagramView type="deployment" />, deploymentRepository));

    await userEvent.clear(await screen.findByLabelText("关系 dep_db 协议"));
    await userEvent.type(screen.getByLabelText("关系 dep_db 协议"), "HTTPS");
    await userEvent.selectOptions(screen.getByLabelText("关系 dep_db 方向"), "two-way");
    await userEvent.click(screen.getByRole("button", { name: "重新生成当前图" }));

    expect(deploymentRepository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        relationships: [expect.objectContaining({ protocol: "HTTPS", direction: "two-way" })],
      }),
    );
    expect(
      (
        vi.mocked(deploymentRepository.renderStructuredModel).mock.calls[0]?.[0] as {
          relationships: Array<Record<string, unknown>>;
        }
      ).relationships[0],
    ).not.toHaveProperty("description");
  });

  it("opens highlighted elements in the element view and filters focus relations", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Event\nclass Reminder\nclass User\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "公开日历领域对象",
            notes: [],
            classes: [
              {
                id: "cls_event",
                name: "Event",
                description: "公开活动",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
              {
                id: "cls_reminder",
                name: "Reminder",
                description: "提醒记录",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
              {
                id: "cls_user",
                name: "User",
                description: "用户",
                classKind: "entity",
                stereotype: null,
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [
              {
                id: "rel_event_reminder",
                type: "association",
                sourceId: "cls_event",
                targetId: "cls_reminder",
                label: null,
                sourceRole: "event",
                targetRole: "reminders",
                sourceMultiplicity: "1",
                targetMultiplicity: "0..*",
                navigability: "bidirectional",
                description: "活动关联多个提醒记录。",
              },
              {
                id: "rel_user_reminder",
                type: "dependency",
                sourceId: "cls_user",
                targetId: "cls_reminder",
                label: "查看提醒",
                description: "用户查看提醒。",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Event</text><text>Reminder</text><text>User</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DiagramView type="class" highlightedElement={{ kind: "class", id: "cls_event" }} />,
        repository,
      ),
    );

    expect(await screen.findByText("预览")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("搜索元素、属性或说明")).not.toBeInTheDocument();
    expect(screen.getByText(/相关关系 1 条/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /关系/ }));
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.getAllByText("用户查看提醒。").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByLabelText("只看焦点相关关系"));
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.getAllByText("用户查看提醒。")).toHaveLength(1);
  });
});
