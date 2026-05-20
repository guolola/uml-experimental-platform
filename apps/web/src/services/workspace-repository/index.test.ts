import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeRunSnapshot } from "@uml-platform/contracts";
import {
  buildApiUrl,
  createHttpWorkspaceRepository,
  createMockWorkspaceRepository,
  type StartDocumentRunInput,
  createStartCodeRunInput,
  createStartRunInput,
} from "./index";
import {
  RUN_HISTORY_LIMIT,
  RUN_HISTORY_STORAGE_KEY,
  buildRunMarkdownReport,
} from "../../features/history";
import { createRunSnapshot } from "../../test/workspace-test-utils";

function createCodeRunSnapshot(
  overrides: Partial<CodeRunSnapshot> = {},
): CodeRunSnapshot {
  const base: CodeRunSnapshot = {
    runId: "code-run-test",
    requirementText: "生成公众活动日历",
    rules: [],
    designModels: [],
    designPlantUml: [],
    spec: null,
    businessLogic: null,
    loadedCodeSkill: null,
    visualDirection: null,
    skillResourceDiscoveryPlan: null,
    skillResourcePreviews: null,
    skillResourcePlan: null,
    codeSkillContext: null,
    appBlueprint: null,
    uiBlueprint: null,
    uiMockup: null,
    uiReferenceSpec: null,
    uiFidelityReport: null,
    designTokens: null,
    componentRegistry: null,
    uiIr: null,
    visualDiffReport: null,
    repairLoopSummary: null,
    selectedCodeSkills: [],
    skillDiagnostics: [],
    filePlan: null,
    codeImplementationBrief: null,
    codeFileOperationManifest: null,
    fileGenerationDiagnostics: [],
    codeTrace: [],
    codeGenerationMode: "json_schema_operations",
    qualityDiagnostics: [],
    files: {
      "/src/App.tsx": "export default function App() { return <main>ok</main>; }",
    },
    entryFile: "/src/App.tsx",
    dependencies: {},
    agentPlan: [],
    generationMode: "regenerate",
    changedFileCount: 1,
    diagnostics: [],
    codeContextHash: null,
    currentStage: "verify_code_preview",
    status: "completed",
    errorMessage: null,
  };
  return { ...base, ...overrides };
}

describe("createStartRunInput", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("rejects empty api key before starting a run", () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "",
        defaultModel: "gpt-5.5",
        fontSize: "md",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );

    expect(() => createStartRunInput("生成 UML", ["usecase"])).toThrow(
      "请先在设置中填写 API Key",
    );
  });

  it("normalizes model provider base urls to the site root", () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        apiBaseUrl: "https://ai.comfly.org/v1/chat/completions",
        apiKey: "sk-demo",
        defaultModel: "gpt-5.5",
        imageModel: "nano-banana-pro",
        fontSize: "md",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );

    expect(createStartRunInput("生成 UML", ["usecase"])).toMatchObject({
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-demo",
        model: "gpt-5.5",
      },
    });
  });

  it("includes existing code files when starting a code agent run", () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-demo",
        defaultModel: "gpt-5.5",
        imageModel: "nano-banana-pro",
        fontSize: "md",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );

    const input = createStartCodeRunInput(
      "生成前端原型",
      [],
      [
        {
          diagramKind: "sequence",
          title: "顺序图",
          summary: "流程",
          notes: [],
          participants: [],
          messages: [],
          fragments: [],
        },
      ],
      [],
      { "/src/App.tsx": "export default function App() { return null; }" },
    );

    expect(input.existingFiles["/src/App.tsx"]).toContain("return null");
    expect(input.providerSettings).toMatchObject({
      apiBaseUrl: "https://ai.comfly.org",
      apiKey: "sk-demo",
    });
    expect("imageProviderSettings" in input).toBe(false);
  });
});

describe("createHttpWorkspaceRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("preserves the server failure message when the stream closes afterwards", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        void url;
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: "failed",
              message: "LLM request failed with HTTP 401",
            }),
          } as MessageEvent<string>);
          this.onerror?.();
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);

    const repository = createHttpWorkspaceRepository();

    await expect(
      repository.subscribeToRun("run-1", () => {}),
    ).rejects.toThrow("LLM request failed with HTTP 401");
  });

  it("falls back to the terminal snapshot when EventSource errors before messages arrive", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        void url;
        queueMicrotask(() => {
          this.onerror?.();
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            runId: "run-2",
            requirementText: "生成 UML",
            selectedDiagrams: ["usecase"],
            rules: [],
            models: [],
            plantUml: [],
            svgArtifacts: [],
            currentStage: "extract_rules",
            status: "failed",
            errorMessage: "LLM request failed with HTTP 401",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    );

    const repository = createHttpWorkspaceRepository();

    await expect(
      repository.subscribeToRun("run-2", () => {}),
    ).rejects.toThrow("LLM request failed with HTTP 401");
  });

  it("streams code file changes from the code agent subscription", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        void url;
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: "code_file_changed",
              path: "/src/App.tsx",
              content: "export default function App() { return <main />; }",
              reason: "写入入口",
            }),
          } as MessageEvent<string>);
          this.onmessage?.({
            data: JSON.stringify({
              type: "completed",
              snapshot: {
                runId: "code-run-1",
                requirementText: "生成代码",
                rules: [],
                designModels: [],
                spec: null,
                files: {
                  "/src/App.tsx": "export default function App() { return <main />; }",
                },
                entryFile: "/src/App.tsx",
                dependencies: {},
                agentPlan: ["写入口"],
                diagnostics: [],
                codeContextHash: "hash",
                currentStage: "verify_code_preview",
                status: "completed",
                errorMessage: null,
              },
            }),
          } as MessageEvent<string>);
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    const repository = createHttpWorkspaceRepository();
    const events: string[] = [];

    await repository.subscribeToCodeRun!("code-run-1", (event) => {
      if (event.type === "code_file_changed") {
        events.push(event.path);
      }
    });

    expect(events).toEqual(["/src/App.tsx"]);
  });

  it("reports lost code runs clearly when the local API restarted", async () => {
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      close() {}

      constructor(url: string) {
        void url;
        queueMicrotask(() => {
          this.onerror?.();
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: "代码生成任务已丢失，可能是本地 API 服务重启，请重新生成",
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    );

    const repository = createHttpWorkspaceRepository();

    await expect(
      repository.subscribeToCodeRun!("missing-code-run", () => {}),
    ).rejects.toThrow("代码生成任务已丢失，可能是本地 API 服务重启，请重新生成");
  });

  it("adds anonymous workspace headers to document library requests", async () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-demo",
        defaultModel: "gpt-5.5",
        imageModel: "nano-banana-pro",
        fontSize: "md",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );
    const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => {
      if (url.endsWith("/api/document-runs")) {
        return new Response(JSON.stringify({ runId: "document-run-1" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ documents: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository();
    await repository.startDocumentRun!({
      documentKind: "requirementsSpec",
      requirementText: "生成说明书",
      rules: [],
      requirementModels: [],
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-demo",
        model: "gpt-5.5",
      },
      useAiText: true,
    });
    await repository.listDocuments!();
    await repository.getOnlyOfficeEditorConfig!(
      "doc-requirements-1",
      "theme-classic-light",
    );

    const firstHeaders = fetchMock.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    const secondHeaders = fetchMock.mock.calls[1]![1]!.headers as Record<
      string,
      string
    >;
    const thirdUrl = fetchMock.mock.calls[2]![0] as string;
    const thirdHeaders = fetchMock.mock.calls[2]![1]!.headers as Record<
      string,
      string
    >;
    expect(firstHeaders["X-UML-Workspace-Id"]).toBeTruthy();
    expect(firstHeaders["X-UML-Workspace-Secret"]).toBeTruthy();
    expect(secondHeaders["X-UML-Workspace-Id"]).toBe(
      firstHeaders["X-UML-Workspace-Id"],
    );
    expect(secondHeaders["X-UML-Workspace-Secret"]).toBe(
      firstHeaders["X-UML-Workspace-Secret"],
    );
    expect(thirdHeaders["X-UML-Workspace-Id"]).toBe(
      firstHeaders["X-UML-Workspace-Id"],
    );
    expect(thirdUrl).toContain(
      "/api/documents/doc-requirements-1/editor-config?uiTheme=theme-classic-light",
    );
  });

  it("keeps every mock document generation as a separate document", async () => {
    const repository = createMockWorkspaceRepository();
    const input: StartDocumentRunInput = {
      documentKind: "requirementsSpec",
      requirementText: "生成需求规格说明书",
      rules: [],
      requirementModels: [],
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-demo",
        model: "gpt-5.5",
      },
      useAiText: true,
    };

    const first = await repository.startDocumentRun!(input);
    const second = await repository.startDocumentRun!(input);
    const firstSnapshot = await repository.getDocumentRunSnapshot!(first.runId);
    const secondSnapshot = await repository.getDocumentRunSnapshot!(second.runId);
    const documents = await repository.listDocuments!();
    const requirementDocuments = documents.filter(
      (document) => document.documentKind === "requirementsSpec",
    );

    expect(requirementDocuments).toHaveLength(2);
    expect(firstSnapshot.documentId).toBeTruthy();
    expect(secondSnapshot.documentId).toBeTruthy();
    expect(firstSnapshot.documentId).not.toBe(secondSnapshot.documentId);
    expect(new Set(requirementDocuments.map((document) => document.id)).size).toBe(
      2,
    );
    expect(requirementDocuments.every((document) => document.version === 1)).toBe(
      true,
    );
    const editorConfig = await repository.getOnlyOfficeEditorConfig!(
      firstSnapshot.documentId!,
      "theme-dark",
    );
    expect(editorConfig.config.editorConfig).toEqual(
      expect.objectContaining({
        customization: { uiTheme: "theme-dark" },
      }),
    );
  });

  it("stores run history in localStorage with the configured limit", async () => {
    const repository = createHttpWorkspaceRepository();
    for (let index = 0; index < RUN_HISTORY_LIMIT + 2; index += 1) {
      await repository.saveRunHistory(
        createRunSnapshot({
          runId: `run-${index}`,
          requirementText: `需求 ${index}`,
        }),
        { providerModel: "gpt-5.5" },
      );
    }

    const history = await repository.listRunHistory();
    expect(history).toHaveLength(RUN_HISTORY_LIMIT);
    expect(history[0].id).toBe(`run-${RUN_HISTORY_LIMIT + 1}`);
    expect(localStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toContain("gpt-5.5");
  });

  it("compacts large code history debug fields while preserving generated files", async () => {
    const repository = createHttpWorkspaceRepository();
    const rawOutput = `RAW_OUTPUT_${"x".repeat(5_000)}`;
    const skillOutput = `SKILL_OUTPUT_${"y".repeat(5_000)}`;

    await repository.saveRunHistory(
      createCodeRunSnapshot({
        runId: "code-large-debug",
        loadedCodeSkill: {
          alias: "@web-design",
          name: "ui-ux-pro-max",
          description: "Large skill",
          aliases: ["@web-design"],
          source: "project",
          location: "apps/api/src/code-skills/ui-ux-pro-max/SKILL.md",
          baseDir: "apps/api/src/code-skills/ui-ux-pro-max",
          fileManifest: [],
          content: `SKILL_MD_${"z".repeat(5_000)}`,
          loadedAt: new Date().toISOString(),
        },
        codeSkillContext: {
          skillName: "ui-ux-pro-max",
          alias: "@web-design",
          query: "public calendar",
          designSystem: skillOutput,
          stackGuidelines: skillOutput,
          domainGuidelines: skillOutput,
          actionResults: [
            {
              name: "react-stack",
              description: "React rules",
              command: "csv",
              args: ["data/stacks/react.csv"],
              outputFormat: "markdown",
              status: "completed",
              stdout: skillOutput,
              stderr: "",
              exitCode: 0,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          ],
          diagnostics: [],
        },
        skillResourcePreviews: {
          skillName: "ui-ux-pro-max",
          alias: "@web-design",
          previews: [
            {
              path: "data/styles.csv",
              rowCount: 100,
              headers: ["No", "Category", "Guideline"],
              sampleRows: [
                {
                  No: "1",
                  Category: "Visual",
                  Guideline: "A".repeat(1_000),
                },
              ],
              matchedHints: [],
              status: "completed",
            },
          ],
          diagnostics: [],
        },
        codeTrace: [
          {
            stage: "generate_file_operations",
            attempt: 1,
            kind: "llm_output",
            rawOutput,
            parsedData: { rawOutput, nested: { skillOutput } },
            createdAt: new Date().toISOString(),
          },
        ],
      }),
      { providerModel: "claude-opus-4-6-thinking" },
    );

    const stored = localStorage.getItem(RUN_HISTORY_STORAGE_KEY) ?? "";
    expect(stored).not.toContain(rawOutput);
    expect(stored).not.toContain(skillOutput);
    expect(stored).not.toContain("SKILL_MD_");

    const history = await repository.listRunHistory();
    const restored = history[0]?.snapshot as CodeRunSnapshot;
    expect(restored.files["/src/App.tsx"]).toContain("export default");
    expect(restored.entryFile).toBe("/src/App.tsx");
    expect(restored.loadedCodeSkill).toBeNull();
    expect(restored.skillResourcePreviews?.previews[0]?.sampleRows).toEqual([]);
  });

  it("prunes older history items when localStorage quota is exceeded", async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function setItemWithTinyQuota(key, value) {
        if (
          key === RUN_HISTORY_STORAGE_KEY &&
          typeof value === "string" &&
          value.length > 8_000
        ) {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      });

    const repository = createHttpWorkspaceRepository();
    for (let index = 0; index < 6; index += 1) {
      await repository.saveRunHistory(
        createCodeRunSnapshot({
          runId: `quota-run-${index}`,
          files: {
            "/src/App.tsx": `export default function App() { return <main>${"x".repeat(3_000)}</main>; }`,
          },
        }),
        { providerModel: "gpt-5.5" },
      );
    }

    const history = await repository.listRunHistory();
    expect(history[0]?.id).toBe("quota-run-5");
    expect(history.length).toBeLessThan(6);
    expect(setItemSpy).toHaveBeenCalled();
  });

  it("renders PlantUML through the API proxy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            svg: "<svg><text>ok</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 26,
              durationMs: 3,
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    );

    const repository = createHttpWorkspaceRepository();
    const rendered = await repository.renderPlantUml(
      "class",
      "@startuml\nclass User\n@enduml",
    );

    expect(rendered.svg).toContain("<svg>");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:4001/api/render/svg",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("omits PlantUML source from markdown reports", () => {
    const report = buildRunMarkdownReport(
      createRunSnapshot({
        runId: "run-report",
        selectedDiagrams: ["usecase"],
        plantUml: [
          {
            diagramKind: "usecase",
            source: "@startuml\nactor 用户\n@enduml",
          },
        ],
      }),
    );

    expect(report).not.toContain("@startuml");
    expect(report).not.toContain("```plantuml");
  });
});

describe("buildApiUrl", () => {
  it("keeps same-origin api paths stable without a configured base", () => {
    expect(buildApiUrl("/api/runs", "")).toBe("/api/runs");
  });

  it("does not duplicate api when the configured base is /api", () => {
    expect(buildApiUrl("/api/runs", "/api")).toBe("/api/runs");
    expect(buildApiUrl("/api/runs", "/api/")).toBe("/api/runs");
  });

  it("appends api paths to origin-only absolute bases", () => {
    expect(buildApiUrl("/api/runs", "https://example.com")).toBe(
      "https://example.com/api/runs",
    );
  });

  it("does not duplicate api for absolute bases ending in /api", () => {
    expect(buildApiUrl("/api/runs", "https://example.com/api/")).toBe(
      "https://example.com/api/runs",
    );
  });
});
