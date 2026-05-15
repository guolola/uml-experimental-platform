import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { CodeGenerationPage } from "./code-generation-page";

const monacoMocks = vi.hoisted(() => {
  const updateFile = vi.fn();
  const models = new Map<string, {
    value: string;
    getValue: () => string;
    setValue: (next: string) => void;
    dispose: () => void;
  }>();
  const setCompilerOptions = vi.fn();
  const setDiagnosticsOptions = vi.fn();
  const setEagerModelSync = vi.fn();
  const addExtraLib = vi.fn();
  const monaco = {
    languages: {
      typescript: {
        ScriptTarget: { ES2020: 7 },
        ModuleKind: { ESNext: 99 },
        ModuleResolutionKind: { NodeJs: 2 },
        JsxEmit: { ReactJSX: 4 },
        typescriptDefaults: {
          setCompilerOptions,
          setDiagnosticsOptions,
          setEagerModelSync,
          addExtraLib,
        },
        javascriptDefaults: {
          setCompilerOptions,
        },
      },
    },
    Uri: {
      parse: (value: string) => ({
        toString: () => value,
      }),
    },
    editor: {
      getModel: vi.fn((uri: { toString: () => string }) => models.get(uri.toString()) ?? null),
      createModel: vi.fn((value: string, _language: string, uri: { toString: () => string }) => {
        const model = {
          value,
          getValue: () => model.value,
          setValue: vi.fn((next: string) => {
            model.value = next;
          }),
          dispose: vi.fn(),
        };
        models.set(uri.toString(), model);
        return model;
      }),
    },
  };

  return {
    updateFile,
    models,
    setCompilerOptions,
    setDiagnosticsOptions,
    setEagerModelSync,
    addExtraLib,
    monaco,
  };
});

const sandpackMocks = vi.hoisted(() => ({
  providerProps: null as null | {
    template?: string;
    customSetup?: { entry?: string };
    options?: { bundlerURL?: string; activeFile?: string; visibleFiles?: string[] };
  },
  listen: vi.fn(() => vi.fn()),
  sandpackState: {
    status: "done",
    error: null as null | { message: string },
  },
}));

vi.mock("@monaco-editor/react", () => ({
  default: ({ beforeMount }: { beforeMount?: (monaco: typeof monacoMocks.monaco) => void }) => {
    beforeMount?.(monacoMocks.monaco);
    return <div data-testid="monaco-editor" />;
  },
  useMonaco: () => monacoMocks.monaco,
}));

vi.mock("@codesandbox/sandpack-react", () => ({
  SandpackProvider: ({
    children,
    className,
    style,
    template,
    customSetup,
    options,
  }: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    template?: string;
    customSetup?: { entry?: string };
    options?: { bundlerURL?: string; activeFile?: string; visibleFiles?: string[] };
  }) => (
    (() => {
      sandpackMocks.providerProps = { template, customSetup, options };
      return (
        <div data-testid="sandpack-provider" className={className} style={style}>
          {children}
        </div>
      );
    })()
  ),
  SandpackPreview: ({ className }: { className?: string }) => (
    <div data-testid="sandpack-preview" className={className} />
  ),
  useSandpack: () => ({
    sandpack: {
      updateFile: monacoMocks.updateFile,
      status: sandpackMocks.sandpackState.status,
      error: sandpackMocks.sandpackState.error,
    },
    listen: sandpackMocks.listen,
  }),
}));

function createRepository(
  codeFiles: Record<string, string> = {
    "/src/App.tsx": "export default function App() { return <main />; }",
    "/src/components/WorkspaceShell.tsx": "export function WorkspaceShell() { return <main />; }",
    "/src/data/mock-data.ts": "export const data = [];",
    "/src/domain/types.ts": "export interface Item { id: string; }",
    "/src/styles.css": "body { margin: 0; }",
  },
): WorkspaceRepository {
  return {
    loadWorkspace: vi.fn(async () =>
      createWorkspaceRecord({
        requirementText: "生成前端原型",
        codeFiles,
        codeEntryFile: "/src/App.tsx",
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
}

describe("CodeGenerationPage", () => {
  beforeEach(() => {
    sandpackMocks.providerProps = null;
    sandpackMocks.listen.mockClear();
    sandpackMocks.listen.mockReturnValue(vi.fn());
    sandpackMocks.sandpackState.status = "done";
    sandpackMocks.sandpackState.error = null;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("lets the Sandpack wrapper fill the code workspace height", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    const provider = await screen.findByTestId("sandpack-provider");
    expect(provider).toHaveClass("flex");
    expect(provider).toHaveClass("min-h-0");
    expect(provider).toHaveClass("flex-1");
    expect(provider).toHaveClass("flex-col");
    expect(provider).toHaveClass("overflow-hidden");
    expect(provider).toHaveStyle({
      display: "flex",
      flex: "1 1 0%",
      minHeight: "0",
      overflow: "hidden",
    });
  });

  it("renders prototype files as a collapsible tree", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    expect(await screen.findByTestId("file-tree-dir-/src")).toBeInTheDocument();
    expect(screen.getByTestId("file-tree-dir-/src/components")).toBeInTheDocument();
    expect(
      screen.getByTestId("file-tree-file-/src/components/WorkspaceShell.tsx"),
    ).toHaveTextContent("WorkspaceShell.tsx");
    expect(screen.queryByText("/src/components/WorkspaceShell.tsx")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("file-tree-dir-/src/components"));
    expect(
      screen.queryByTestId("file-tree-file-/src/components/WorkspaceShell.tsx"),
    ).not.toBeInTheDocument();
  });

  it("configures Sandpack for the local prototype entry", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    await screen.findByTestId("sandpack-provider");

    expect(sandpackMocks.providerProps?.template).toBe("vite-react-ts");
    expect(sandpackMocks.providerProps?.customSetup?.entry).toBe("/src/main.tsx");
    expect(sandpackMocks.providerProps?.options?.bundlerURL).toContain("/sandpack/");
    expect(sandpackMocks.providerProps?.options?.activeFile).toBe("/src/App.tsx");
    expect(sandpackMocks.providerProps?.options?.visibleFiles).toContain("/src/main.tsx");
    expect(sandpackMocks.providerProps?.options?.visibleFiles).toContain(
      "/public/index.html",
    );
  });

  it("surfaces local preview build errors instead of leaving a blank preview", async () => {
    render(
      withWorkspaceProviders(
        <CodeGenerationPage />,
        createRepository({
          "/src/main.tsx": "import './Missing';",
          "/src/App.tsx": "export default function App() { return <main />; }",
        }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByTestId("local-preview-status")).toHaveTextContent(
        "/src/main.tsx 无法解析导入 ./Missing",
      );
    });
  });

  it("configures Monaco TypeScript for React prototype files", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    await screen.findByTestId("monaco-editor");

    expect(monacoMocks.setCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        jsx: monacoMocks.monaco.languages.typescript.JsxEmit.ReactJSX,
        moduleResolution:
          monacoMocks.monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
      }),
    );
    expect(monacoMocks.addExtraLib).toHaveBeenCalledWith(
      expect.stringContaining('declare module "react"'),
      "file:///node_modules/@types/react-prototype/index.d.ts",
    );
    expect(monacoMocks.addExtraLib).toHaveBeenCalledWith(
      expect.stringContaining('declare module "lucide-react"'),
      "file:///node_modules/@types/lucide-react/index.d.ts",
    );
    expect(monacoMocks.monaco.editor.createModel).toHaveBeenCalledWith(
      expect.stringContaining("function App"),
      "typescript",
      expect.objectContaining({
        toString: expect.any(Function),
      }),
    );
  });
});
