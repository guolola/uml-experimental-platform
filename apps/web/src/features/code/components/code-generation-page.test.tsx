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
  default: ({
    beforeMount,
    onChange,
  }: {
    beforeMount?: (monaco: typeof monacoMocks.monaco) => void;
    onChange?: (value: string) => void;
  }) => {
    beforeMount?.(monacoMocks.monaco);
    return (
      <div data-testid="monaco-editor">
        <button
          type="button"
          data-testid="mock-edit-app-file"
          onClick={() =>
            onChange?.("export default function App() { return <main>Edited preview text</main>; }")
          }
        >
          edit app file
        </button>
        <button
          type="button"
          data-testid="mock-break-app-file"
          onClick={() => onChange?.("import './Missing'; export default function App() { return null; }")}
        >
          break app file
        </button>
      </div>
    );
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

function stubCompactViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
}

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
    stubCompactViewport(false);
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
    Object.defineProperty(window, "open", {
      configurable: true,
      value: vi.fn(() => ({})),
    });
  });

  it("lets the Sandpack wrapper fill the code workspace height", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    const page = await screen.findByTestId("code-generation-page");
    expect(page).toHaveClass("p-3");
    expect(page).toHaveClass("lg:p-4");

    const workspaceFrame = screen.getByTestId("code-workspace-frame");
    expect(workspaceFrame).toHaveClass("flex");
    expect(workspaceFrame).toHaveClass("min-h-0");
    expect(workspaceFrame).toHaveClass("flex-1");
    expect(workspaceFrame).toHaveClass("overflow-hidden");
    expect(workspaceFrame).toHaveClass("rounded-lg");
    expect(workspaceFrame).toHaveClass("border");

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

  it("keeps explanatory skill/rule chrome out of the code page", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    await screen.findByTestId("sandpack-provider");

    expect(screen.queryByText("Agent Skills")).not.toBeInTheDocument();
    expect(screen.queryByText("业务规则说明")).not.toBeInTheDocument();
  });

  it("uses mobile panes instead of the desktop split editor on compact viewports", async () => {
    stubCompactViewport(true);

    const { container } = render(
      withWorkspaceProviders(<CodeGenerationPage />, createRepository()),
    );

    await screen.findByTestId("sandpack-provider");

    expect(screen.getByRole("button", { name: "文件" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "编辑" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "预览" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(container.querySelector('[data-workspace-density="status-rail"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-workspace-density="status-pill"]').length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('[data-panel-group-direction="horizontal"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "文件" }));
    expect(screen.getByText("WorkspaceShell.tsx")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "预览" }));
    expect(screen.getByRole("button", { name: "运行预览" })).toBeInTheDocument();
  });

  it("shows a clear preview-ready status once generated files exist", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    await screen.findByTestId("sandpack-provider");

    expect(await screen.findByText("预览已更新")).toBeInTheDocument();
  });

  it("keeps edited code out of the iframe until the user runs the preview", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    let iframe: HTMLIFrameElement | null = null;
    await waitFor(() => {
      iframe = document.querySelector('iframe[title="Prototype Preview"]');
      expect(iframe).toBeInTheDocument();
    });
    monacoMocks.updateFile.mockClear();
    expect(iframe?.getAttribute("srcdoc") ?? "").not.toContain("Edited preview text");

    fireEvent.click(screen.getByTestId("mock-edit-app-file"));

    expect(await screen.findByText("有未运行的修改")).toBeInTheDocument();
    expect(iframe?.getAttribute("srcdoc") ?? "").not.toContain("Edited preview text");
    expect(monacoMocks.updateFile).not.toHaveBeenCalledWith(
      "/src/App.tsx",
      expect.stringContaining("Edited preview text"),
    );

    fireEvent.click(screen.getByRole("button", { name: "运行预览" }));

    await waitFor(() => {
      expect(monacoMocks.updateFile).toHaveBeenCalledWith(
        "/src/App.tsx",
        expect.stringContaining("Edited preview text"),
      );
    });
    expect(screen.getByText("预览已更新")).toBeInTheDocument();
  });

  it("shows build errors from a manually run preview without marking it updated", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    await waitFor(() => {
      expect(
        document.querySelector('iframe[title="Prototype Preview"]'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("mock-break-app-file"));
    fireEvent.click(screen.getByRole("button", { name: "运行预览" }));

    await waitFor(() => {
      expect(screen.getByTestId("local-preview-status")).toHaveTextContent(
        "/src/App.tsx 无法解析导入 ./Missing",
      );
    });
    expect(screen.getByText("预览构建失败")).toBeInTheDocument();
  });

  it("opens the full preview from the preview title", async () => {
    render(withWorkspaceProviders(<CodeGenerationPage />, createRepository()));

    await waitFor(() => {
      expect(
        document.querySelector('iframe[title="Prototype Preview"]'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "新窗口查看预览" }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        "blob:preview",
        "_blank",
        "noopener,noreferrer",
      );
    });
  });

  it("loads Tailwind and shadcn-style runtime dependencies in the local preview", async () => {
    render(
      withWorkspaceProviders(
        <CodeGenerationPage />,
        createRepository({
          "/src/main.tsx": [
            "import React from 'react';",
            "import { createRoot } from 'react-dom/client';",
            "import './styles.css';",
            "import App from './App';",
            "createRoot(document.getElementById('root')!).render(<App />);",
          ].join("\n"),
          "/src/App.tsx": [
            "import { Button } from '@/components/ui/button';",
            "import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';",
            "export default function App() {",
            "  return <main className=\"flex min-h-screen items-center justify-center bg-white p-6\"><Dialog><DialogTrigger asChild><Button>Open</Button></DialogTrigger><DialogContent>Tailwind works</DialogContent></Dialog></main>;",
            "}",
          ].join("\n"),
          "/src/lib/utils.ts": [
            "import { clsx, type ClassValue } from 'clsx';",
            "import { twMerge } from 'tailwind-merge';",
            "export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }",
          ].join("\n"),
          "/src/components/ui/button.tsx": [
            "import * as React from 'react';",
            "import { Slot } from '@radix-ui/react-slot';",
            "import { cva, type VariantProps } from 'class-variance-authority';",
            "import { cn } from '@/lib/utils';",
            "const buttonVariants = cva('inline-flex items-center justify-center rounded-xl px-4 py-2 shadow');",
            "export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }",
            "export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, asChild = false, ...props }, ref) => {",
            "  const Comp = asChild ? Slot : 'button';",
            "  return <Comp ref={ref} className={cn(buttonVariants(), className)} {...props} />;",
            "});",
          ].join("\n"),
          "/src/components/ui/dialog.tsx": [
            "import * as DialogPrimitive from '@radix-ui/react-dialog';",
            "export const Dialog = DialogPrimitive.Root;",
            "export const DialogTrigger = DialogPrimitive.Trigger;",
            "export const DialogContent = DialogPrimitive.Content;",
          ].join("\n"),
          "/src/styles.css": ":root { --bg: #ffffff; }",
        }),
      ),
    );

    let iframe: HTMLIFrameElement | null = null;
    await waitFor(() => {
      iframe = document.querySelector('iframe[title="Prototype Preview"]');
      expect(iframe).toBeInTheDocument();
    });

    const srcDoc = iframe?.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("/vendor/tailwindcss-browser.js");
    expect(srcDoc).toContain("@radix-ui/react-slot");
    expect(srcDoc).toContain("@radix-ui/react-dialog");
    expect(srcDoc).toContain("class-variance-authority");
    expect(srcDoc).toContain("tailwind-merge");
    expect(srcDoc).toContain("text/tailwindcss");
    const status = screen.queryByTestId("local-preview-status");
    if (status) {
      expect(status).not.toHaveTextContent("无法解析导入");
    }
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
    expect(monacoMocks.addExtraLib).toHaveBeenCalledWith(
      expect.stringContaining('declare module "class-variance-authority"'),
      "file:///node_modules/@types/shadcn-preview-runtime/index.d.ts",
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
