import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHttpWorkspaceRepository,
  createStartRunInput,
} from "./index";
import {
  RUN_HISTORY_LIMIT,
  RUN_HISTORY_STORAGE_KEY,
  buildRunMarkdownReport,
} from "../../features/history";
import { createRunSnapshot } from "../../test/workspace-test-utils";

describe("createStartRunInput", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("rejects empty api key before starting a run", () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        apiBaseUrl: "https://ai.comfly.chat",
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

  it("normalizes comfly base urls to the site root", () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        apiBaseUrl: "https://ai.comfly.chat/v1/chat/completions",
        apiKey: "sk-demo",
        defaultModel: "gpt-5.5",
        fontSize: "md",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );

    expect(createStartRunInput("生成 UML", ["usecase"])).toMatchObject({
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.chat",
        apiKey: "sk-demo",
        model: "gpt-5.5",
      },
    });
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
