// Verifies the instruction document library keeps each generated DOCX visible.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentKind, DocumentLibraryItem } from "@uml-platform/contracts";
import { useTheme } from "../../../app/providers/theme-provider";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository";
import { withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { InstructionDocumentsPage } from "./instruction-documents-page";

const { onlyOfficeEditorHostMock } = vi.hoisted(() => ({
  onlyOfficeEditorHostMock: vi.fn(() => <div data-testid="onlyoffice-editor" />),
}));

vi.mock("./only-office-editor-host", () => ({
  OnlyOfficeEditorHost: onlyOfficeEditorHostMock,
}));

const requirementModel = {
  diagramKind: "usecase",
  title: "订单系统用例",
  summary: "核心参与者和用例",
  notes: [],
  actors: [],
  useCases: [],
  systemBoundaries: [],
  relationships: [],
};

const designModel = {
  diagramKind: "sequence",
  title: "订单提交流程",
  summary: "订单提交的设计交互",
  notes: [],
  participants: [],
  messages: [],
  fragments: [],
};

function createDocument(
  id: string,
  documentKind: DocumentKind,
  fileName: string,
  updatedAt: string,
): DocumentLibraryItem {
  return {
    id,
    workspaceId: "workspace-test",
    documentKind,
    title:
      documentKind === "requirementsSpec"
        ? "需求规格说明书"
        : "软件设计说明书",
    fileName,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 128,
    version: 1,
    sourceRunId: `run-${id}`,
    createdAt: updatedAt,
    updatedAt,
  };
}

function ThemeToggleButton() {
  const { toggle } = useTheme();
  return (
    <button type="button" onClick={toggle}>
      切换主题
    </button>
  );
}

describe("InstructionDocumentsPage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    onlyOfficeEditorHostMock.mockClear();
  });

  it("renders and filters every generated document instance", async () => {
    const documents = [
      createDocument(
        "doc-requirements-1",
        "requirementsSpec",
        "需求规格说明书-20260520-160501-001.docx",
        "2026-05-20T08:05:01.001Z",
      ),
      createDocument(
        "doc-requirements-2",
        "requirementsSpec",
        "需求规格说明书-20260520-161012-002.docx",
        "2026-05-20T08:10:12.002Z",
      ),
      createDocument(
        "doc-design-1",
        "softwareDesignSpec",
        "软件设计说明书-20260520-162000-003.docx",
        "2026-05-20T08:20:00.003Z",
      ),
    ];
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => documents);

    render(
      withWorkspaceProviders(<InstructionDocumentsPage />, repository),
    );

    const generatedHeading = await screen.findByRole("heading", {
      name: "已生成说明书",
    });
    const generatedSection = generatedHeading.closest("section") as HTMLElement;

    expect(
      within(generatedSection).getByText("需求规格说明书-20260520-160501-001.docx"),
    ).toBeInTheDocument();
    expect(
      within(generatedSection).getByText("需求规格说明书-20260520-161012-002.docx"),
    ).toBeInTheDocument();
    expect(
      within(generatedSection).getByText("软件设计说明书-20260520-162000-003.docx"),
    ).toBeInTheDocument();
    expect(within(generatedSection).getByText("3 份")).toBeInTheDocument();
    expect(within(generatedSection).getAllByText("DOCX 文件")).toHaveLength(3);
    expect(within(generatedSection).getAllByText("文件大小")).toHaveLength(3);
    expect(within(generatedSection).getAllByText("128 B")).toHaveLength(3);
    expect(within(generatedSection).queryByText("来源运行")).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("说明书类型"),
      "requirementsSpec",
    );

    expect(
      within(generatedSection).getByText("需求规格说明书-20260520-160501-001.docx"),
    ).toBeInTheDocument();
    expect(
      within(generatedSection).getByText("需求规格说明书-20260520-161012-002.docx"),
    ).toBeInTheDocument();
    expect(
      within(generatedSection).queryByText("软件设计说明书-20260520-162000-003.docx"),
    ).not.toBeInTheDocument();
    expect(within(generatedSection).getByText("2 份")).toBeInTheDocument();
  });

  it("renders template controls on the documents page instead of the automatic generate button", async () => {
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => []);

    const { container } = render(
      withWorkspaceProviders(<InstructionDocumentsPage />, repository),
    );

    await screen.findByRole("heading", { name: "已生成说明书" });

    expect(container.querySelector(".max-w-6xl")).not.toBeInTheDocument();
    expect(container.querySelector(".max-w-none")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /自动生成文档/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /说明书样式/i })).toHaveLength(2);
    expect(screen.queryByText("需求规格说明书.docx")).not.toBeInTheDocument();
    expect(screen.queryByText("软件设计说明书.docx")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /同时生成软件设计说明书/i }),
    ).not.toBeInTheDocument();
  });

  it("passes customized document style settings when generating from the documents page", async () => {
    const repository = createMockWorkspaceRepository({
      requirementText: "订单系统需求",
      models: { usecase: requirementModel as never },
    });
    const startDocumentRun = vi.spyOn(repository, "startDocumentRun");
    const user = userEvent.setup();

    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    await screen.findByRole("heading", { name: "已生成说明书" });
    await user.click(screen.getAllByRole("button", { name: /说明书样式/i })[0]);
    const sizeInputs = await screen.findAllByLabelText("字号 pt");
    fireEvent.change(sizeInputs[0], { target: { value: "18" } });
    await user.click(screen.getByRole("button", { name: "完成" }));
    await user.click(screen.getAllByRole("button", { name: /生成并打开/i })[0]);

    await waitFor(() => {
      expect(startDocumentRun).toHaveBeenCalledWith(
        expect.objectContaining({
          documentKind: "requirementsSpec",
          documentStyle: expect.objectContaining({
            heading1: expect.objectContaining({ sizePt: 18 }),
            includeTableOfContents: true,
            autoNumberHeadings: true,
          }),
        }),
      );
    });
  });

  it("generates only the requirements spec from the requirements template action", async () => {
    const repository = createMockWorkspaceRepository({
      requirementText: "订单系统需求",
      models: { usecase: requirementModel as never },
      designModels: { sequence: designModel as never },
    });
    const startDocumentRun = vi.spyOn(repository, "startDocumentRun");
    const user = userEvent.setup();

    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    await screen.findByRole("heading", { name: "已生成说明书" });
    await user.click(screen.getAllByRole("button", { name: /生成并打开/i })[0]);

    await waitFor(() => {
      expect(startDocumentRun).toHaveBeenCalledTimes(1);
    });
    expect(startDocumentRun.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ documentKind: "requirementsSpec" }),
    );
  });

  it("loads OnlyOffice config with the project theme and passes it to the editor", async () => {
    localStorage.setItem("ui-theme", "light");
    const document = createDocument(
      "doc-requirements-1",
      "requirementsSpec",
      "需求规格说明书-20260520-160501-001.docx",
      "2026-05-20T08:05:01.001Z",
    );
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => [document]);
    repository.getOnlyOfficeEditorConfig = vi.fn(async (_documentId, uiTheme) => ({
      document,
      documentServerUrl: "http://127.0.0.1:8080",
      config: {
        documentType: "word",
        document: {
          fileType: "docx",
          key: `${document.id}-v${document.version}`,
          title: document.fileName,
          url: `/api/documents/${document.id}/file`,
        },
        editorConfig: {
          callbackUrl: `/api/documents/${document.id}/onlyoffice/callback`,
          mode: "edit",
          lang: "zh-CN",
          customization: {
            uiTheme,
          },
        },
      },
    }));

    render(
      withWorkspaceProviders(
        <InstructionDocumentsPage activeDocumentId={document.id} />,
        repository,
      ),
    );

    await screen.findByTestId("onlyoffice-editor");

    expect(repository.getOnlyOfficeEditorConfig).toHaveBeenCalledWith(
      document.id,
      "theme-classic-light",
    );
    const editorProps = (
      onlyOfficeEditorHostMock.mock.calls as unknown as Array<[unknown]>
    )[0]?.[0];
    expect(editorProps).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          editorConfig: expect.objectContaining({
            customization: { uiTheme: "theme-classic-light" },
          }),
        }),
      }),
    );
  });

  it("reloads the OnlyOffice config with the next project theme", async () => {
    localStorage.setItem("ui-theme", "light");
    const document = createDocument(
      "doc-requirements-1",
      "requirementsSpec",
      "需求规格说明书-20260520-160501-001.docx",
      "2026-05-20T08:05:01.001Z",
    );
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => [document]);
    repository.getOnlyOfficeEditorConfig = vi.fn(async (_documentId, uiTheme) => ({
      document,
      documentServerUrl: "http://127.0.0.1:8080",
      config: {
        documentType: "word",
        document: {
          fileType: "docx",
          key: `${document.id}-v${document.version}-${uiTheme}`,
          title: document.fileName,
          url: `/api/documents/${document.id}/file`,
        },
        editorConfig: {
          callbackUrl: `/api/documents/${document.id}/onlyoffice/callback`,
          mode: "edit",
          lang: "zh-CN",
          customization: {
            uiTheme,
          },
        },
      },
    }));
    const user = userEvent.setup();

    render(
      withWorkspaceProviders(
        <>
          <ThemeToggleButton />
          <InstructionDocumentsPage activeDocumentId={document.id} />
        </>,
        repository,
      ),
    );

    await screen.findByTestId("onlyoffice-editor");
    await user.click(screen.getByRole("button", { name: "切换主题" }));

    await waitFor(() => {
      expect(repository.getOnlyOfficeEditorConfig).toHaveBeenCalledWith(
        document.id,
        "theme-dark",
      );
    });
    const editorHostCalls =
      onlyOfficeEditorHostMock.mock.calls as unknown as Array<[unknown]>;
    const latestEditorProps = editorHostCalls[editorHostCalls.length - 1]?.[0];
    expect(latestEditorProps).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          editorConfig: expect.objectContaining({
            customization: { uiTheme: "theme-dark" },
          }),
        }),
      }),
    );
  });
});
