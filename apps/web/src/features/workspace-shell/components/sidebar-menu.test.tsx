import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { SidebarMenu } from "./sidebar-menu";
import { WorkspaceTabsBar } from "./workspace-tabs-bar";

describe("SidebarMenu", () => {
  it("marks failed diagrams in the navigation tree", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDiagramTypes: ["activity"],
          models: {
            activity: {
              diagramKind: "activity",
              title: "活动流程",
              summary: "失败图",
              notes: [],
              swimlanes: [],
              nodes: [],
              relationships: [],
            },
          },
          diagramErrors: {
            activity: {
              stage: "render_svg",
              message: "PlantUML repair failed for activity: Syntax Error?",
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 需求" }));
    expect(await screen.findByText("界面关系")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.queryByText("历史快照")).not.toBeInTheDocument();
  });

  it("shows primary workspace entries without default secondary pages", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: [
            "class",
            "deployment",
            "activity",
            "sequence",
            "table",
          ],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: [],
              participants: [
                { id: "actor", name: "用户", participantType: "actor" },
              ],
              messages: [],
              fragments: [],
            },
            activity: {
              diagramKind: "activity",
              title: "界面关系",
              summary: "业务逻辑流转",
              notes: [],
              swimlanes: [],
              nodes: [],
              relationships: [],
            },
            deployment: {
              diagramKind: "deployment",
              title: "部署模型",
              summary: "物理部署",
              notes: [],
              nodes: [],
              databases: [],
              components: [],
              externalSystems: [],
              artifacts: [],
              relationships: [],
            },
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
            table: {
              diagramKind: "table",
              title: "表关系图",
              summary: "主外键关系",
              notes: [],
              tables: [
                {
                  id: "user",
                  name: "user",
                  columns: [
                    {
                      id: "id",
                      name: "id",
                      dataType: "INT",
                      isPrimaryKey: true,
                      isForeignKey: false,
                      nullable: false,
                    },
                  ],
                },
              ],
              relationships: [],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    expect(await screen.findByText("设计")).toBeInTheDocument();
    expect(screen.getByText("代码")).toBeInTheDocument();
    expect(screen.queryByText("收起侧边栏")).not.toBeInTheDocument();
    expect(screen.queryByText("文本需求")).not.toBeInTheDocument();
    expect(screen.queryByText("生成设计模型")).not.toBeInTheDocument();
    expect(screen.queryByText("顺序图")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 设计" }));

    expect(screen.getByText("顺序图")).toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();
    expect(screen.queryByText("业务逻辑模型")).not.toBeInTheDocument();
    expect(screen.queryByText("静态结构模型")).not.toBeInTheDocument();
    expect(screen.queryByText("物理部署模型")).not.toBeInTheDocument();
    expect(screen.queryByText("领域概念模型")).not.toBeInTheDocument();

    const navText = screen.getByRole("navigation").textContent ?? "";
    expect(navText.indexOf("顺序图")).toBeLessThan(navText.indexOf("界面关系"));
    expect(navText.indexOf("顺序图")).toBeLessThan(navText.indexOf("设计类图"));
    expect(navText.indexOf("设计类图")).toBeLessThan(navText.indexOf("界面关系"));
    expect(navText.indexOf("界面关系")).toBeLessThan(navText.indexOf("部署模型"));
    expect(navText.indexOf("部署模型")).toBeLessThan(navText.indexOf("表关系图"));
  });

  it("expands design tree one level at a time", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: [],
              participants: [
                { id: "actor", name: "用户", participantType: "actor" },
              ],
              messages: [],
              fragments: [],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    expect(await screen.findByText("设计")).toBeInTheDocument();
    expect(screen.queryByText("顺序图")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 设计" }));

    expect(screen.getByText("顺序图")).toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 顺序图" }));

    expect(screen.getByText("参与对象")).toBeInTheDocument();
    expect(screen.queryByText("用户")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 参与对象" }));

    expect(screen.getByText("用户")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "折叠 设计" }));

    expect(screen.queryByText("顺序图")).not.toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();
    expect(screen.queryByText("用户")).not.toBeInTheDocument();
  });

  it("opens and closes workspace tabs from sidebar selections", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "顺序图",
              summary: "动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(
      withWorkspaceProviders(
        <div>
          <SidebarMenu />
          <WorkspaceTabsBar />
        </div>,
        repository,
      ),
    );

    expect((await screen.findAllByRole("button", { name: "需求" })).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "设计" }));
    await userEvent.click(screen.getByRole("button", { name: "展开 设计" }));
    await userEvent.click(screen.getByRole("button", { name: "顺序图" }));

    expect(screen.getAllByText("需求").length).toBeGreaterThan(0);
    expect(screen.getAllByText("设计").length).toBeGreaterThan(0);
    expect(screen.getAllByText("顺序图").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "关闭 顺序图" }));
    expect(screen.queryByRole("button", { name: "关闭 顺序图" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "关闭 设计" }));
    await userEvent.click(screen.getByRole("button", { name: "关闭 需求" }));
    expect(screen.getByRole("button", { name: "关闭 需求" })).toBeInTheDocument();
  });
});
