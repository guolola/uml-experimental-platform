import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunHistoryItem } from "../../../entities/run-history";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { HistoryDrawer } from "./history-drawer";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    message: vi.fn(),
  },
}));

function createHistoryItem(overrides: Partial<RunHistoryItem> = {}): RunHistoryItem {
  return {
    id: "run-history",
    createdAt: "2026-06-20T00:00:00.000Z",
    title: "需求模型生成",
    snapshot: null,
    providerModel: "gpt-test",
    status: "completed",
    stageLabel: "需求模型",
    summary: "快照可恢复",
    snapshotAvailable: true,
    canRestore: true,
    ...overrides,
  };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderHistoryDrawer(repository: WorkspaceRepository) {
  const onClose = vi.fn();
  render(withWorkspaceProviders(<HistoryDrawer open onClose={onClose} />, repository));
  return { onClose };
}

describe("HistoryDrawer", () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it("keeps the history item visible and shows an error when deletion fails", async () => {
    const historyItems = [createHistoryItem({ id: "run-failed-delete" })];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.deleteRunHistory = vi.fn(async () => {
      throw new Error("Active runs cannot be deleted");
    });

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求模型生成")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "删除历史记录：需求模型生成" }),
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "删除历史记录失败：Active runs cannot be deleted",
      );
    });
    expect(toastSuccess).not.toHaveBeenCalledWith("已删除历史记录");
    expect(screen.getByText("需求模型生成")).toBeInTheDocument();
  });

  it("shows non-document history snapshots as read-only without workspace restore", async () => {
    const historyItems = [createHistoryItem({ id: "run-missing-restore" })];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.restoreRunHistory = vi.fn(async () => {
      return null;
    });

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求模型生成")).toBeInTheDocument();
    expect(
      screen.getByText("历史快照暂仅支持查看，不能直接覆盖当前项目工作区"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "恢复历史快照：需求模型生成" }),
    ).not.toBeInTheDocument();
    expect(repository.restoreRunHistory).not.toHaveBeenCalled();
  });

  it("does not call restore for read-only history snapshots", async () => {
    const historyItems = [createHistoryItem({ id: "run-restore-failed" })];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.restoreRunHistory = vi.fn(async () => {
      throw new Error("运行中不可恢复");
    });

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求模型生成")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "恢复历史快照：需求模型生成" }),
    ).not.toBeInTheDocument();
    expect(repository.restoreRunHistory).not.toHaveBeenCalled();
  });

  it("disables restore for active or unavailable history snapshots", async () => {
    const historyItems = [
      createHistoryItem({
        id: "run-active",
        status: "running",
        snapshotAvailable: true,
        canRestore: false,
      }),
      createHistoryItem({
        id: "run-no-snapshot",
        title: "无快照运行",
        snapshotAvailable: false,
        canRestore: null,
        summary: "无快照",
      }),
    ];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.restoreRunHistory = vi.fn(async () => historyItems[0] ?? null);

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求模型生成")).toBeInTheDocument();
    expect(screen.getByText("运行仍在进行，完成后才能恢复")).toBeInTheDocument();
    expect(screen.getByText("没有可恢复快照")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "恢复历史快照：需求模型生成" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "恢复历史快照：无快照运行" }),
    ).not.toBeInTheDocument();
    expect(repository.restoreRunHistory).not.toHaveBeenCalled();
  });

  it("shows cancelled snapshots as read-only cancellations instead of failures", async () => {
    const historyItems = [
      createHistoryItem({
        id: "run-cancelled",
        status: "cancelled",
        summary: "已取消 · 已保留 1 个旧产物入口",
        snapshotAvailable: true,
        canRestore: true,
      }),
    ];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求模型生成")).toBeInTheDocument();
    expect(screen.getByText("已取消")).toBeInTheDocument();
    expect(screen.queryByText("失败")).not.toBeInTheDocument();
    expect(
      screen.getByText("已取消 · 已保留 1 个旧产物入口"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("历史快照暂仅支持查看，不能直接覆盖当前项目工作区"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "恢复历史快照：需求模型生成" }),
    ).not.toBeInTheDocument();
  });

  it("shows project summary errors without requiring a full snapshot", async () => {
    const historyItems = [
      createHistoryItem({
        id: "run-partial-failure",
        errorMessage: "部分图表渲染失败",
        summary:
          "阶段 render_svg · 图级失败 1 张图：总体业务流程（render_svg：PlantUML 修复失败） · 快照可恢复",
      }),
    ];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求模型生成")).toBeInTheDocument();
    expect(screen.getByText("部分图表渲染失败")).toBeInTheDocument();
    expect(
      screen.getByText(
        "阶段 render_svg · 图级失败 1 张图：总体业务流程（render_svg：PlantUML 修复失败） · 快照可恢复",
      ),
    ).toBeInTheDocument();
  });

  it("shows interrupted project runs as retryable service interruptions", async () => {
    const historyItems = [
      createHistoryItem({
        id: "run-interrupted",
        status: "interrupted",
        runKind: "requirements",
        stage: "generate_models",
        summary: "服务中断，可重试 · 阶段 generate_models",
        canRestore: false,
        snapshotAvailable: true,
      }),
    ];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.restoreRunHistory = vi.fn(async () => historyItems[0] ?? null);

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求模型生成")).toBeInTheDocument();
    expect(screen.getByText("服务中断，可重试")).toBeInTheDocument();
    expect(
      screen.getByText("服务中断，可重试 · 阶段 generate_models"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("服务中断的运行不能直接恢复，请从项目历史重试或重新运行"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "恢复历史快照：需求模型生成" }),
    ).not.toBeInTheDocument();
    expect(repository.restoreRunHistory).not.toHaveBeenCalled();
  });

  it("does not offer document download for failed document history snapshots", async () => {
    const historyItems = [
      createHistoryItem({
        id: "run-failed-document",
        title: "失败的需求规格说明书",
        status: "failed",
        documentDownloadAvailable: true,
        snapshot: {
          runId: "run-failed-document",
          documentKind: "requirementsSpec",
          requirementText: "图书馆预约需求",
          documentId: "doc-failed",
          sections: [],
          fileName: "failed-requirements.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 1234,
          missingArtifacts: [],
          currentStage: "render_document_file",
          status: "failed",
          error: {
            code: "RUN_INTERNAL_ERROR",
            message: "证据包组装失败",
            category: "internal",
            retryable: true,
          },
        },
      }),
    ];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.downloadDocumentRun = vi.fn(async () => ({
      fileName: "failed-requirements.docx",
      blob: new Blob(["docx"]),
    }));

    renderHistoryDrawer(repository);

    expect(await screen.findByText("失败的需求规格说明书")).toBeInTheDocument();
    expect(screen.getByText("说明书快照不能恢复为项目工作台")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "恢复历史快照：失败的需求规格说明书" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新下载 DOCX" })).not.toBeInTheDocument();
    expect(repository.downloadDocumentRun).not.toHaveBeenCalled();
  });

  it("shows download but not workspace restore for completed document history snapshots", async () => {
    const historyItems = [
      createHistoryItem({
        id: "run-document",
        title: "需求规格说明书",
        status: "completed",
        documentDownloadAvailable: true,
        documentFileName: "requirements-renamed.docx",
        snapshot: {
          runId: "run-document",
          documentKind: "requirementsSpec",
          requirementText: "图书馆预约需求",
          documentId: "doc-1",
          sections: [],
          fileName: "requirements.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 1234,
          missingArtifacts: ["用例图：缺少可嵌入图片源"],
          currentStage: "render_document_file",
          status: "completed",
          error: null,
        },
      }),
    ];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.restoreRunHistory = vi.fn(async () => historyItems[0] ?? null);
    repository.downloadDocumentRun = vi.fn(async () => ({
      fileName: "requirements.docx",
      blob: new Blob(["docx"]),
    }));

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求规格说明书")).toBeInTheDocument();
    expect(
      screen.getByText(
        "requirements-renamed.docx · 1234 bytes · 缺失图 1 项：用例图：缺少可嵌入图片源",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新下载 DOCX" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "恢复历史快照：需求规格说明书" }),
    ).not.toBeInTheDocument();
    expect(repository.restoreRunHistory).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "重新下载 DOCX" }));
    await waitFor(() => {
      expect(repository.downloadDocumentRun).toHaveBeenCalledWith(
        "run-document",
        "requirements-renamed.docx",
      );
    });
  });

  it("hides document download when the source document was deleted", async () => {
    const historyItems = [
      createHistoryItem({
        id: "run-document-deleted",
        title: "需求规格说明书",
        status: "completed",
        documentKind: "requirementsSpec",
        documentDownloadAvailable: false,
        documentStatus: "deleted",
        documentFileName: "requirements-deleted.docx",
        snapshot: {
          runId: "run-document-deleted",
          documentKind: "requirementsSpec",
          requirementText: "图书馆预约需求",
          documentId: "doc-deleted",
          sections: [],
          fileName: "requirements-original.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 1234,
          missingArtifacts: [],
          currentStage: "render_document_file",
          status: "completed",
          error: null,
        },
      }),
    ];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.downloadDocumentRun = vi.fn(async () => ({
      fileName: "requirements-deleted.docx",
      blob: new Blob(["docx"]),
    }));

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求规格说明书")).toBeInTheDocument();
    expect(
      screen.getByText("说明书已在文档中心删除，恢复后可重新下载。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新下载 DOCX" })).not.toBeInTheDocument();
    expect(repository.downloadDocumentRun).not.toHaveBeenCalled();
  });

  it("shows clear success only after the clear operation resolves", async () => {
    const historyItems = [createHistoryItem({ id: "run-clear" })];
    const clearDeferred = deferred();
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.clearRunHistory = vi.fn(() => clearDeferred.promise);

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求模型生成")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "清空历史" }));

    expect(repository.clearRunHistory).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalledWith("已清空历史");
    expect(screen.getByRole("button", { name: "清空历史" })).toBeDisabled();

    clearDeferred.resolve();

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("已清空历史");
    });
    expect(await screen.findByText("暂无历史快照。完成一次生成后会自动保存。")).toBeInTheDocument();
  });

  it("keeps the history list visible and shows an error when clearing fails", async () => {
    const historyItems = [createHistoryItem({ id: "run-clear-failed" })];
    const repository = createMockWorkspaceRepository();
    repository.listRunHistory = vi.fn(async () => historyItems);
    repository.clearRunHistory = vi.fn(async () => {
      throw new Error("清空项目运行历史失败");
    });

    renderHistoryDrawer(repository);

    expect(await screen.findByText("需求模型生成")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "清空历史" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "清空历史失败：清空项目运行历史失败",
      );
    });
    expect(toastSuccess).not.toHaveBeenCalledWith("已清空历史");
    expect(screen.getByText("需求模型生成")).toBeInTheDocument();
  });
});
