import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AtomicRequirement,
  CodeRunSnapshot,
  RequirementBaseline,
  RepairRequirementRulesRequest,
} from "@uml-platform/contracts";
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
import { snapshotInputFingerprint } from "../../shared/lib/fingerprint";

const managedProviderSettings = {
  providerConfigId: "provider-config-1",
  model: "gpt-5.5",
};

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
      "/src/App.tsx":
        "export default function App() { return <main>ok</main>; }",
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
    error: null,
  };
  return { ...base, ...overrides };
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
): RequirementBaseline {
  return {
    runId: "run-baseline",
    sourceDocumentId: "inline-requirement",
    requirements,
    assumptions: [],
    conflicts: [],
    qualityReport: {
      runId: "run-baseline",
      status: "pending-review",
      summary: "存在待确认字段。",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: requirements.map((item) => item.id),
    },
    createdAt: "2026-05-27T00:00:00.000Z",
  };
}

describe("createStartRunInput", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it("omits plaintext provider settings in production so project defaults can resolve server-side", () => {
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

    expect(createStartRunInput("生成 UML", ["usecase"])).toEqual({
      requirementText: "生成 UML",
      selectedDiagrams: ["usecase"],
      rules: [],
      contextModels: [],
      contextRequirementModelTraceability: [],
      analysisTargetUseCaseIds: [],
      providerSettings: {
        model: "gpt-5.5",
      },
    });
  });

  it("ignores stale plaintext provider settings even when they are still in local storage", () => {
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
        model: "gpt-5.5",
      },
    });
    expect(
      createStartRunInput("生成 UML", ["usecase"]).providerSettings,
    ).not.toHaveProperty("apiKey");
  });

  it("includes only managed provider config references when selected", () => {
    localStorage.setItem(
      "uml-lab-settings",
      JSON.stringify({
        providerConfigId: "provider-config-1",
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-stale",
        defaultModel: "gpt-5.5",
        fontSize: "md",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );

    expect(createStartRunInput("生成 UML", ["usecase"])).toMatchObject({
      providerSettings: {
        providerConfigId: "provider-config-1",
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
      model: "gpt-5.5",
    });
    expect(input.providerSettings).not.toHaveProperty("apiKey");
    expect("imageProviderSettings" in input).toBe(false);
  });
});

describe("createHttpWorkspaceRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("rejects run subscriptions when no project scope is available", async () => {
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

    await expect(repository.subscribeToRun("run-1", () => {})).rejects.toThrow(
      "请先登录并进入项目",
    );
  });

  it("rejects run snapshot fallback when no project scope is available", async () => {
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
      vi.fn(
        async () =>
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
              error: {
                code: "PLATFORM_PROVIDER_AUTH_FAILED",
                message: "LLM request failed with HTTP 401",
                category: "platform_provider",
                retryable: false,
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

    await expect(repository.subscribeToRun("run-2", () => {})).rejects.toThrow(
      "请先登录并进入项目",
    );
  });

  it("rejects code subscriptions when no project scope is available", async () => {
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
                  "/src/App.tsx":
                    "export default function App() { return <main />; }",
                },
                entryFile: "/src/App.tsx",
                dependencies: {},
                agentPlan: ["写入口"],
                diagnostics: [],
                codeContextHash: "hash",
                currentStage: "verify_code_preview",
                status: "completed",
                error: null,
              },
            }),
          } as MessageEvent<string>);
        });
      }
    }

    vi.stubGlobal("EventSource", MockEventSource);
    const repository = createHttpWorkspaceRepository();
    const events: string[] = [];

    await expect(
      repository.subscribeToCodeRun!("code-run-1", (event) => {
        if (event.type === "code_file_changed") {
          events.push(event.path);
        }
      }),
    ).rejects.toThrow("请先登录并进入项目");

    expect(events).toEqual([]);
  });

  it("rejects lost-code polling when no project scope is available", async () => {
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
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message:
                "代码生成任务已丢失，可能是本地 API 服务重启，请重新生成",
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
    ).rejects.toThrow("请先登录并进入项目");
  });

  it("rejects document operations when no project scope is available", async () => {
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
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository();
    await expect(repository.listDocuments!()).rejects.toThrow(
      "请先登录并进入项目",
    );
    await expect(
      repository.getOnlyOfficeEditorConfig!(
        "doc-requirements-1",
        "theme-classic-light",
      ),
    ).rejects.toThrow("请先登录并进入项目");
    await expect(
      repository.startDocumentRun!({
        documentKind: "requirementsSpec",
        requirementText: "生成说明书",
        rules: [],
        requirementModels: [],
        requirementPlantUml: [],
        requirementSvgArtifacts: [],
        designModels: [],
        designPlantUml: [],
        designSvgArtifacts: [],
        providerSettings: managedProviderSettings,
        useAiText: true,
      }),
    ).rejects.toThrow("请先登录并进入项目");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds project headers to project workspace run and document requests", async () => {
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
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      void options;
      if (url.endsWith("/api/runs")) {
        return new Response(JSON.stringify({ runId: "run-project-1" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/runs/run-project-1")) {
        return new Response(
          JSON.stringify({
            runId: "run-project-1",
            requirementText: "生成 UML",
            selectedDiagrams: ["usecase"],
            rules: [],
            models: [],
            requirementModelTraceability: [],
            plantUml: [],
            svgArtifacts: [],
            diagramErrors: {},
            requirementTrace: [],
            currentStage: "render_svg",
            status: "completed",
            error: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.endsWith("/api/document-runs")) {
        return new Response(JSON.stringify({ runId: "document-run-1" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/projects/library-booking/documents")) {
        return new Response(JSON.stringify({ documents: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (
        url.includes(
          "/api/projects/library-booking/documents/doc-1/editor-config",
        )
      ) {
        return new Response(
          JSON.stringify({
            documentServerUrl: "http://127.0.0.1:8080",
            document: { id: "doc-1", fileName: "doc.docx" },
            config: {
              editorConfig: { customization: { uiTheme: "theme-dark" } },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return new Response(new Blob(["docx"]), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });

    await repository.startRun(createStartRunInput("生成 UML", ["usecase"]));
    await repository.subscribeToRun("run-project-1", () => {});
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
      providerSettings: managedProviderSettings,
      useAiText: true,
    });
    await repository.listDocuments!();
    await repository.getOnlyOfficeEditorConfig!("doc-1", "theme-dark");
    await repository.downloadDocument!("doc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/library-booking/documents"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/projects/library-booking/documents/doc-1/editor-config?uiTheme=theme-dark",
      ),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/projects/library-booking/documents/doc-1/download",
      ),
      expect.anything(),
    );
    const projectRunEventsCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/runs/run-project-1/events"),
    );
    expect(projectRunEventsCall?.[1]?.credentials).toBe("include");
    const startRunCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/runs"),
    );
    const startRunBody = JSON.parse(String(startRunCall?.[1]?.body));
    expect(startRunBody.providerSettings).toBeUndefined();

    for (const [, options] of fetchMock.mock.calls) {
      const headers = options?.headers as Record<string, string>;
      expect(headers["X-UML-Project-Id"]).toBe("library-booking");
      expect(headers["X-UML-Workspace-Id"]).toBeUndefined();
      expect(headers["X-UML-Workspace-Secret"]).toBeUndefined();
    }
  });

  it("loads and saves the shared project workspace with an optimistic version", async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 2,
            updatedAt: "2026-05-22T02:00:00.000Z",
            updatedByUserId: "teacher-1",
            state: {
              requirementText: "已保存的项目需求",
              rules: [
                {
                  id: "FR1",
                  text: "日历仅供公众使用。",
                  category: "业务规则",
                  relatedDiagrams: ["usecase"],
                },
              ],
              selectedDiagramTypes: ["usecase"],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 3,
            updatedAt: "2026-05-22T02:05:00.000Z",
            updatedByUserId: "teacher-1",
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    const workspace = await repository.loadWorkspace();
    expect(workspace.requirementText).toBe("已保存的项目需求");
    expect(workspace.rules[0]?.id).toBe("FR1");
    expect(workspace.selectedDiagramTypes).toEqual(["usecase"]);

    await repository.updateRequirementText("团队成员更新的需求");

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    expect(saveCall).toBeTruthy();
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.baseVersion).toBe(2);
    expect(body.state.requirementText).toBe("团队成员更新的需求");
  });

  it("serializes concurrent project workspace saves with the latest base version", async () => {
    const savedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 2,
            updatedAt: "2026-05-22T02:00:00.000Z",
            updatedByUserId: "teacher-1",
            state: {
              requirementText: "已保存的项目需求",
              rules: [],
              selectedDiagramTypes: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedBodies.push(JSON.parse(String(options.body)));
        const nextVersion = 2 + savedBodies.length;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: nextVersion,
            updatedAt: "2026-05-22T02:05:00.000Z",
            updatedByUserId: "teacher-1",
            state: savedBodies.at(-1)?.state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          message: `unexpected request ${String(url)} ${options?.method ?? "GET"}`,
        }),
        { status: 500 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.loadWorkspace();

    await Promise.all([
      repository.updateRequirementText("第一次需求"),
      repository.updateRequirementText("第二次需求"),
    ]);

    expect(savedBodies).toHaveLength(2);
    expect(savedBodies[0]?.baseVersion).toBe(2);
    expect(savedBodies[1]?.baseVersion).toBe(3);
    expect(
      (savedBodies[0]?.state as Record<string, unknown>).requirementText,
    ).toBe("第一次需求");
    expect(
      (savedBodies[1]?.state as Record<string, unknown>).requirementText,
    ).toBe("第二次需求");
  });

  it("retries requirement review state saves after a project workspace conflict", async () => {
    const reviewedRequirement = createAtomicRequirement({
      actor: "用户",
      status: "accepted",
    });
    const reviewedBaseline = createRequirementBaseline([reviewedRequirement]);
    const candidates = {
      r1: {
        ruleId: "r1",
        beforeRequirement: createAtomicRequirement(),
        afterRequirement: reviewedRequirement,
        repairRationale: "补齐参与者。",
        blockingReasons: [],
        status: "accepted" as const,
        errorMessage: null,
        createdAt: "2026-05-27T00:00:00.000Z",
      },
    };
    let workspaceReads = 0;
    let workspaceWrites = 0;
    const savedBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        workspaceReads += 1;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: workspaceReads === 1 ? 1 : 2,
            state: {
              requirementText:
                workspaceReads === 1 ? "原需求" : "其他成员刚更新的需求",
              rules: [
                {
                  id: "r1",
                  category: "功能需求",
                  text: "用户提交订单。",
                  relatedDiagrams: ["usecase"],
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        workspaceWrites += 1;
        savedBodies.push(JSON.parse(String(options.body)));
        if (workspaceWrites === 1) {
          return new Response(
            JSON.stringify({
              message: "项目已由其他成员更新，请刷新最新状态后再保存。",
              currentVersion: 2,
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 3,
            state: savedBodies.at(-1)?.state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.loadWorkspace();
    await repository.updateRequirementReviewState?.(
      reviewedBaseline,
      candidates,
    );

    expect(workspaceReads).toBe(2);
    expect(workspaceWrites).toBe(2);
    expect(savedBodies[1]?.baseVersion).toBe(2);
    expect(
      (savedBodies[1]?.state as Record<string, unknown>).requirementText,
    ).toBe("其他成员刚更新的需求");
    expect(
      (
        (savedBodies[1]?.state as Record<string, unknown>)
          .requirementBaseline as RequirementBaseline
      ).requirements[0]?.actor,
    ).toBe("用户");
    expect(
      (
        (savedBodies[1]?.state as Record<string, unknown>)
          .requirementReviewCandidates as typeof candidates
      ).r1.status,
    ).toBe("accepted");
  });

  it("restores project run snapshots through the server without uploading the workspace", async () => {
    const snapshot = createRunSnapshot({
      runId: "run-restore",
      requirementText: "恢复后的项目需求",
      selectedDiagrams: ["usecase"],
    });
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            updatedAt: "2026-05-22T02:00:00.000Z",
            state: { requirementText: "旧需求" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/projects/library-booking/runs/run-restore")) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            run: {
              runId: "run-restore",
              status: "completed",
              stage: "render_svg",
              snapshotAvailable: true,
              canRestore: true,
            },
            snapshot,
            events: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith(
          "/api/projects/library-booking/runs/run-restore/restore-workspace",
        ) &&
        options?.method === "POST"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 5,
            updatedAt: "2026-05-22T02:05:00.000Z",
            state: { requirementText: "恢复后的项目需求" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/projects/library-booking/runs")) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            runs: [
              {
                runId: "run-restore",
                status: "completed",
                stage: "render_svg",
                createdAt: "2026-05-22T01:00:00.000Z",
                model: "gpt-5.5",
                snapshotAvailable: true,
                canRestore: true,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 5,
            updatedAt: "2026-05-22T02:05:00.000Z",
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    const item = await repository.restoreRunHistory("run-restore");

    expect(item?.snapshot).toBeNull();
    const restoreCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith(
          "/api/projects/library-booking/runs/run-restore/restore-workspace",
        ) && options?.method === "POST",
    );
    expect(restoreCall).toBeTruthy();
    expect(JSON.parse(String(restoreCall?.[1]?.body))).toEqual({
      mode: "restore",
    });
    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    expect(saveCall).toBeFalsy();
    const detailCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/projects/library-booking/runs/run-restore"),
    );
    expect(detailCall).toBeFalsy();
  });

  it("lists project run history from summaries without hydrating run details", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/projects/library-booking/runs")) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            runs: [
              {
                runId: "run-active",
                status: "running",
                stage: "generate_models",
                createdAt: "2026-05-22T01:00:00.000Z",
                snapshotAvailable: true,
                canRestore: false,
              },
              {
                runId: "run-complete",
                status: "completed",
                stage: "render_svg",
                createdAt: "2026-05-22T00:00:00.000Z",
                snapshotAvailable: true,
                canRestore: true,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/projects/library-booking/runs/run-active")) {
        return new Response(
          JSON.stringify({
            run: { runId: "run-active", model: "gpt-5.4" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/projects/library-booking/runs/run-complete")) {
        return new Response(
          JSON.stringify({
            run: {
              runId: "run-complete",
              model: "gpt-5.4",
              startedAt: "2026-05-22T00:00:00.000Z",
            },
            snapshot: createRunSnapshot({
              runId: "run-complete",
              requirementText: "图书馆预约需求",
            }),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    const history = await repository.listRunHistory();

    expect(history).toHaveLength(2);
    expect(history.map((item) => item.id)).toEqual([
      "run-active",
      "run-complete",
    ]);
    expect(history[0]?.snapshot).toBeNull();
    expect(history[1]?.providerModel).toBe("默认模型");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("persists requirement run snapshots incrementally with diagram versions", async () => {
    const existingUseCase = {
      diagramKind: "usecase",
      modelId: "req-usecase",
      actors: [],
      useCases: [],
      relationships: [],
    };
    const generatedClass = {
      diagramKind: "class",
      modelId: "req-class",
      classes: [],
      relationships: [],
    };
    const snapshot = createRunSnapshot({
      runId: "run-class",
      requirementText: "图书馆需求",
      selectedDiagrams: ["class"],
      rules: [
        {
          id: "R1",
          category: "功能需求",
          text: "系统应支持借书。",
          relatedDiagrams: ["class"],
        },
      ],
      models: [generatedClass as never],
      plantUml: [{ diagramKind: "class", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "class",
          svg: "<svg />",
          renderMeta: {
            generatedAt: "2026-05-24T00:00:00.000Z",
          },
        },
      ],
    });
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 7,
            state: {
              requirementText: "图书馆需求",
              rulesVersion: 1,
              rulesBasedOnTextVersion: 0,
              diagramVersions: { usecase: 1 },
              generatedDiagramTypes: ["usecase"],
              models: { usecase: existingUseCase },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 8,
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.state.rulesVersion).toBe(1);
    expect(body.state.diagramVersions).toEqual({ usecase: 1, class: 1 });
    expect(body.state.generatedDiagramTypes).toEqual(["usecase", "class"]);
    expect(body.state.models.usecase).toEqual(existingUseCase);
    expect(body.state.models["req-class"]).toEqual(generatedClass);
  });

  it("does not mark failed requirement diagrams as generated when persisting partial snapshots", async () => {
    const generatedActivity = {
      diagramKind: "activity",
      modelId: "req-activity",
      title: "总体业务流程",
      summary: "报名流程",
      notes: [],
      partitions: [],
      nodes: [],
      edges: [],
    };
    const snapshot = createRunSnapshot({
      runId: "run-partial-failed",
      requirementText: "活动日历需求",
      selectedDiagrams: ["activity", "prototype"],
      rules: [
        {
          id: "R1",
          category: "功能需求",
          text: "用户可以浏览活动页面。",
          relatedDiagrams: ["activity", "prototype"],
        },
      ],
      models: [generatedActivity as never],
      plantUml: [{ diagramKind: "activity", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "activity",
          svg: "<svg />",
          renderMeta: {
            generatedAt: "2026-05-24T00:00:00.000Z",
          },
        },
      ],
      diagramErrors: {
        prototype: {
          stage: "generate_models",
          error: {
            code: "RUN_DEPENDENCY_MISSING",
            message: "原型界面关系生成失败",
            category: "generation",
            retryable: false,
          },
        },
      },
      currentStage: "generate_models",
      status: "failed",
      error: {
        code: "RUN_DEPENDENCY_MISSING",
        message: "原型界面关系生成失败",
        category: "generation",
        retryable: false,
      },
    });
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 3,
            state: {
              requirementText: "活动日历需求",
              rulesVersion: 1,
              generatedDiagramTypes: ["usecase"],
              models: {
                usecase: {
                  diagramKind: "usecase",
                  modelId: "req-usecase",
                  actors: [],
                  useCases: [],
                  relationships: [],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.state.generatedDiagramTypes).toEqual(["usecase", "activity"]);
    expect(body.state.models["req-activity"]).toEqual(generatedActivity);
    expect(body.state.models.prototype).toBeUndefined();
    expect(body.state.diagramErrors.prototype.error.code).toBe(
      "RUN_DEPENDENCY_MISSING",
    );
    expect(body.state.diagramVersions).toEqual({ activity: 1 });
  });

  it("does not clear existing artifacts when a completed snapshot only reports a selected diagram error", async () => {
    const contextUseCase = {
      diagramKind: "usecase",
      title: "用例模型",
      summary: "既有用例。",
      notes: [],
      actors: [],
      useCases: [],
      relationships: [],
    };
    const contextClass = {
      diagramKind: "class",
      title: "领域概念模型",
      summary: "既有领域模型。",
      notes: [],
      classes: [],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const contextDeployment = {
      diagramKind: "deployment",
      title: "部署需求模型",
      summary: "上一子任务成功生成。",
      notes: [],
      nodes: [],
      databases: [],
      components: [],
      externalSystems: [],
      artifacts: [],
      relationships: [],
    };
    const snapshot = createRunSnapshot({
      runId: "run-activity-timeout",
      requirementText: "活动日历需求",
      selectedDiagrams: ["activity"],
      rules: [],
      models: [contextUseCase, contextClass, contextDeployment] as never,
      diagramErrors: {
        activity: {
          stage: "generate_models",
          error: {
            code: "PLATFORM_PROVIDER_TIMEOUT",
            message: "当前模型服务响应超时，请稍后重试。",
            category: "platform_provider",
            retryable: true,
          },
        },
      },
      currentStage: "render_svg",
      status: "completed",
      error: null,
    });
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 18,
            state: {
              requirementText: "活动日历需求",
              rulesVersion: 1,
              generatedDiagramTypes: ["usecase", "class", "deployment"],
              models: {
                usecase: contextUseCase,
                class: contextClass,
                deployment: contextDeployment,
              },
              plantUml: {
                usecase: "@startuml\nusecase Existing\n@enduml",
                class: "@startuml\nclass Existing\n@enduml",
                deployment: "@startuml\nnode Existing\n@enduml",
              },
              svgArtifacts: {
                usecase: { diagramKind: "usecase", svg: "<svg>usecase</svg>" },
                class: { diagramKind: "class", svg: "<svg>class</svg>" },
                deployment: {
                  diagramKind: "deployment",
                  svg: "<svg>deployment</svg>",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 19,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.5",
      durationMs: 100,
    });

    expect(savedState?.generatedDiagramTypes).toEqual([
      "usecase",
      "class",
      "deployment",
    ]);
    expect(
      Object.keys(
        (savedState?.plantUml as Record<string, unknown>) ?? {},
      ).sort(),
    ).toEqual(["class", "deployment", "usecase"]);
    expect(
      Object.keys(
        (savedState?.svgArtifacts as Record<string, unknown>) ?? {},
      ).sort(),
    ).toEqual(["class", "deployment", "usecase"]);
    expect(
      (savedState?.models as Record<string, unknown>).activity,
    ).toBeUndefined();
    expect(
      (
        (savedState?.diagramErrors as Record<
          string,
          { error: { code: string } }
        >) ?? {}
      ).activity.error.code,
    ).toBe("PLATFORM_PROVIDER_TIMEOUT");
  });

  it("preserves existing requirement SVG assets when an analysis-only snapshot carries context models", async () => {
    const existingUseCase = {
      diagramKind: "usecase",
      title: "既有用例模型",
      summary: "既有用例",
      notes: [],
      actors: [],
      useCases: [],
      systemBoundaries: [],
      relationships: [],
    };
    const snapshotContextUseCase = {
      ...existingUseCase,
      title: "上下文用例模型",
    };
    const existingClass = {
      diagramKind: "class",
      title: "领域概念模型",
      summary: "领域概念",
      notes: [],
      classes: [],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const existingDeployment = {
      diagramKind: "deployment",
      title: "部署需求模型",
      summary: "部署需求",
      notes: [],
      nodes: [],
      databases: [],
      components: [],
      externalSystems: [],
      artifacts: [],
      relationships: [],
    };
    const existingPrototype = {
      diagramKind: "prototype",
      modelId: "proto-1",
      title: "原型界面关系",
      summary: "原型关系",
      notes: [],
      pages: [],
      modules: [],
      entryPoints: [],
      relationships: [],
    };
    const analysisModel = {
      diagramKind: "analysis",
      modelId: "analysis:uc_view",
      title: "查看活动需求分析",
      summary: "用例事件流分析",
      notes: [],
      participants: [],
      messages: [],
      fragments: [],
    };
    const snapshot = createRunSnapshot({
      runId: "run-analysis-only",
      requirementText: "日历需求",
      selectedDiagrams: ["analysis"],
      rules: [],
      models: [
        snapshotContextUseCase,
        existingClass,
        existingDeployment,
        existingPrototype,
        analysisModel,
      ] as never,
      plantUml: [
        {
          diagramKind: "analysis",
          modelId: "analysis:uc_view",
          source: "@startuml\n@enduml",
        },
      ],
      svgArtifacts: [
        {
          diagramKind: "analysis",
          modelId: "analysis:uc_view",
          svg: "<svg>analysis</svg>",
          renderMeta: {
            generatedAt: "2026-06-08T00:00:00.000Z",
          },
        },
      ],
    });
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 7,
            state: {
              requirementText: "日历需求",
              rulesVersion: 1,
              rulesBasedOnTextVersion: 0,
              diagramVersions: {
                usecase: 1,
                class: 1,
                deployment: 1,
                prototype: 1,
              },
              generatedDiagramTypes: [
                "usecase",
                "class",
                "deployment",
                "prototype",
              ],
              models: {
                usecase: existingUseCase,
                class: existingClass,
                deployment: existingDeployment,
                "proto-1": existingPrototype,
              },
              plantUml: {
                usecase: "@startuml\nusecase\n@enduml",
                class: "@startuml\nclass\n@enduml",
                deployment: "@startuml\ndeployment\n@enduml",
                "proto-1": "@startuml\nprototype\n@enduml",
              },
              svgArtifacts: {
                usecase: { diagramKind: "usecase", svg: "<svg>usecase</svg>" },
                class: { diagramKind: "class", svg: "<svg>class</svg>" },
                deployment: {
                  diagramKind: "deployment",
                  svg: "<svg>deployment</svg>",
                },
                "proto-1": {
                  diagramKind: "prototype",
                  modelId: "proto-1",
                  svg: "<svg>prototype</svg>",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 8,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    expect(savedState?.models).toMatchObject({
      usecase: existingUseCase,
      class: existingClass,
      deployment: existingDeployment,
      "proto-1": existingPrototype,
      "analysis:uc_view": analysisModel,
    });
    expect(
      (savedState?.models as Record<string, { title: string }>).usecase.title,
    ).toBe("既有用例模型");
    expect(savedState?.plantUml).toMatchObject({
      usecase: "@startuml\nusecase\n@enduml",
      class: "@startuml\nclass\n@enduml",
      deployment: "@startuml\ndeployment\n@enduml",
      "proto-1": "@startuml\nprototype\n@enduml",
      "analysis:uc_view": "@startuml\n@enduml",
    });
    expect(savedState?.svgArtifacts).toMatchObject({
      usecase: { svg: "<svg>usecase</svg>" },
      class: { svg: "<svg>class</svg>" },
      deployment: { svg: "<svg>deployment</svg>" },
      "proto-1": { svg: "<svg>prototype</svg>" },
      "analysis:uc_view": { svg: "<svg>analysis</svg>" },
    });
    expect(savedState?.diagramVersions).toEqual({
      usecase: 1,
      class: 1,
      deployment: 1,
      prototype: 1,
      analysis: 1,
    });
    expect(
      Object.keys(
        savedState?.diagramInputFingerprints as Record<string, string>,
      ),
    ).toEqual(["analysis"]);
  });

  it("merges requirement model snapshots without overwriting reviewed requirements", async () => {
    const rule = {
      id: "r1",
      category: "功能需求" as const,
      text: "用户提交订单。",
      relatedDiagrams: ["usecase" as const],
    };
    const reviewedRequirement = createAtomicRequirement({
      actor: "用户",
      status: "accepted",
    });
    const reviewedBaseline = createRequirementBaseline([reviewedRequirement]);
    const staleSnapshotBaseline = createRequirementBaseline([
      createAtomicRequirement({ actor: null, status: "pending-review" }),
    ]);
    const snapshot = createRunSnapshot({
      runId: "run-usecase",
      requirementText: "订单需求",
      selectedDiagrams: ["usecase"],
      rules: [rule],
      requirementBaseline: staleSnapshotBaseline,
      models: [
        {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "用户提交订单。",
          notes: [],
          actors: [],
          useCases: [],
          systemBoundaries: [],
          relationships: [],
        },
      ],
    });
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            state: {
              requirementText: "订单需求",
              rules: [rule],
              requirementBaseline: reviewedBaseline,
              requirementQualityReport: reviewedBaseline.qualityReport,
              requirementReviewCandidates: {
                r1: {
                  ruleId: "r1",
                  beforeRequirement: createAtomicRequirement(),
                  afterRequirement: reviewedRequirement,
                  repairRationale: "补齐参与者。",
                  blockingReasons: [],
                  status: "accepted",
                  errorMessage: null,
                  createdAt: "2026-05-27T00:00:00.000Z",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 5,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.5",
      durationMs: 100,
    });

    expect(
      (savedState?.requirementBaseline as RequirementBaseline).requirements[0]
        ?.actor,
    ).toBe("用户");
    expect(
      (
        savedState?.requirementReviewCandidates as Record<
          string,
          { status: string }
        >
      ).r1.status,
    ).toBe("accepted");
    expect(savedState?.generatedDiagramTypes).toContain("usecase");
    expect(
      (savedState?.diagramInputFingerprints as Partial<Record<string, string>>)
        .usecase,
    ).toBeTruthy();
  });

  it("uses current reviewed rules and returned models when persisting requirement model snapshots", async () => {
    const currentRule = {
      id: "r1",
      category: "功能需求" as const,
      text: "用户提交当前订单。",
      relatedDiagrams: ["usecase" as const],
    };
    const snapshotRule = {
      ...currentRule,
      text: "用户提交旧订单。",
    };
    const snapshot = createRunSnapshot({
      runId: "run-usecase",
      requirementText: "订单需求",
      selectedDiagrams: [],
      rules: [snapshotRule],
      models: [
        {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "用户提交订单。",
          notes: [],
          actors: [],
          useCases: [],
          systemBoundaries: [],
          relationships: [],
        },
      ],
    });
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            state: {
              requirementText: "订单需求",
              rules: [currentRule],
              generatedDiagramTypes: [],
              selectedDiagramTypes: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 5,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.5",
      durationMs: 100,
    });

    const expectedFingerprint = snapshotInputFingerprint({
      requirementText: "订单需求",
      rules: [currentRule],
    });
    expect(savedState?.generatedDiagramTypes).toContain("usecase");
    expect(savedState?.selectedDiagramTypes).toEqual([]);
    expect(savedState?.requirementInputFingerprint).toBe(expectedFingerprint);
    expect(
      (savedState?.diagramInputFingerprints as Partial<Record<string, string>>)
        .usecase,
    ).toBe(expectedFingerprint);
  });

  it("keeps generated repair candidates when saving the rules-only run snapshot", async () => {
    const requirement = createAtomicRequirement();
    const baseline = createRequirementBaseline([requirement]);
    const snapshot = createRunSnapshot({
      runId: "run-rules",
      requirementText: "订单需求",
      selectedDiagrams: [],
      rules: [
        {
          id: "r1",
          category: "功能需求",
          text: "用户提交订单。",
          relatedDiagrams: ["usecase"],
        },
      ],
      requirementBaseline: baseline,
    });
    let savedState: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 4,
            state: {
              requirementText: "订单需求",
              requirementReviewCandidates: {
                r1: {
                  ruleId: "r1",
                  beforeRequirement: requirement,
                  afterRequirement: createAtomicRequirement({ actor: "用户" }),
                  repairRationale: "补齐参与者。",
                  blockingReasons: [],
                  status: "pending",
                  errorMessage: null,
                  createdAt: "2026-05-27T00:00:00.000Z",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        savedState = JSON.parse(String(options.body)).state;
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 5,
            state: savedState,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot, {
      providerModel: "gpt-5.5",
      durationMs: 100,
    });

    expect(
      (
        savedState?.requirementReviewCandidates as Record<
          string,
          { status: string }
        >
      ).r1.status,
    ).toBe("pending");
  });

  it("persists design run snapshots incrementally without deleting existing diagrams", async () => {
    const existingClass = {
      diagramKind: "class",
      modelId: "class",
      classes: [],
    };
    const generatedTable = {
      diagramKind: "table",
      modelId: "table",
      tables: [],
    };
    const snapshot = {
      runId: "design-table",
      requirementText: "图书馆需求",
      rules: [],
      selectedDiagrams: ["table"],
      requirementModels: [],
      requirementModelTraceability: [],
      models: [generatedTable],
      designModelTraceability: [],
      plantUml: [{ diagramKind: "table", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "table",
          svg: "<svg />",
          generatedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
      diagramErrors: {},
      designTrace: [],
      currentStage: "render_svg",
      status: "completed",
      error: null,
    };
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        !options?.method
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 9,
            state: {
              requirementText: "图书馆需求",
              generatedDesignDiagramTypes: ["class"],
              designModels: { class: existingClass },
              designPlantUml: { class: "@startuml\n@enduml" },
              designSvgArtifacts: {
                class: {
                  diagramKind: "class",
                  svg: "<svg />",
                  generatedAt: "2026-05-24T00:00:00.000Z",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            projectId: "library-booking",
            version: 10,
            state: JSON.parse(String(options.body)).state,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    await repository.saveRunHistory(snapshot as never, {
      providerModel: "gpt-5.4",
      durationMs: 100,
    });

    const saveCall = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url).endsWith("/api/projects/library-booking/workspace") &&
        options?.method === "PUT",
    );
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.state.generatedDesignDiagramTypes).toEqual(["class", "table"]);
    expect(body.state.designModels.class).toEqual(existingClass);
    expect(body.state.designModels.table).toEqual(generatedTable);
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
      providerSettings: managedProviderSettings,
      useAiText: true,
    };

    const first = await repository.startDocumentRun!(input);
    const second = await repository.startDocumentRun!(input);
    const firstSnapshot = await repository.getDocumentRunSnapshot!(first.runId);
    const secondSnapshot = await repository.getDocumentRunSnapshot!(
      second.runId,
    );
    const documents = await repository.listDocuments!();
    const requirementDocuments = documents.filter(
      (document) => document.documentKind === "requirementsSpec",
    );

    expect(requirementDocuments).toHaveLength(2);
    expect(firstSnapshot.documentId).toBeTruthy();
    expect(secondSnapshot.documentId).toBeTruthy();
    expect(firstSnapshot.documentId).not.toBe(secondSnapshot.documentId);
    expect(
      new Set(requirementDocuments.map((document) => document.id)).size,
    ).toBe(2);
    expect(
      requirementDocuments.every((document) => document.version === 1),
    ).toBe(true);
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

  it("stores mock run history in localStorage with the configured limit", async () => {
    const repository = createMockWorkspaceRepository();
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

  it("compacts mock code history debug fields while preserving generated files", async () => {
    const repository = createMockWorkspaceRepository();
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

  it("prunes older mock history items when localStorage quota is exceeded", async () => {
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

    const repository = createMockWorkspaceRepository();
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
      vi.fn(
        async () =>
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

    const repository = createHttpWorkspaceRepository({
      projectId: "render-project",
    });
    const rendered = await repository.renderPlantUml(
      "class",
      "@startuml\nclass User\n@enduml",
    );

    expect(rendered.svg).toContain("<svg>");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:4001/api/render/svg",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-UML-Project-Id": "render-project",
        }),
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

  it("persists requirement review candidates in the mock workspace", async () => {
    const beforeRequirement = createAtomicRequirement();
    const afterRequirement = createAtomicRequirement({
      actor: "用户",
      status: "accepted",
      confidence: 0.82,
    });
    const repository = createMockWorkspaceRepository({
      requirementReviewCandidates: {
        r1: {
          ruleId: "r1",
          beforeRequirement,
          afterRequirement,
          repairRationale: "补齐参与者。",
          blockingReasons: ["缺少参与者"],
          status: "pending",
          errorMessage: null,
          createdAt: "2026-05-27T00:00:00.000Z",
        },
      },
    });

    await expect(repository.loadWorkspace()).resolves.toMatchObject({
      requirementReviewCandidates: {
        r1: expect.objectContaining({ status: "pending" }),
      },
    });

    await repository.updateRequirementReviewCandidates?.({
      r1: {
        ruleId: "r1",
        beforeRequirement,
        afterRequirement,
        repairRationale: "补齐参与者。",
        blockingReasons: ["缺少参与者"],
        status: "accepted",
        errorMessage: null,
        createdAt: "2026-05-27T00:00:00.000Z",
      },
    });

    await expect(repository.loadWorkspace()).resolves.toMatchObject({
      requirementReviewCandidates: {
        r1: expect.objectContaining({ status: "accepted" }),
      },
    });
  });

  it("posts batch requirement rule repairs through the API proxy", async () => {
    const requirement = createAtomicRequirement();
    const baseline = createRequirementBaseline([requirement]);
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/api/runs/requirement-rule-repairs")) {
        const body = JSON.parse(String(options?.body));
        return new Response(
          JSON.stringify({
            candidates: [
              {
                ruleId: "r1",
                requirement: {
                  ...requirement,
                  actor: "用户",
                  status: "accepted",
                  confidence: 0.82,
                },
                qualityReport: baseline.qualityReport,
                repairRationale: "补齐参与者。",
                blockingReasons: [],
              },
            ],
            failures: [],
            receivedTargetRuleIds: body.targetRuleIds,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    const response = await repository.repairRequirementRules?.({
      requirementText: "订单需求",
      rules: [
        {
          id: "r1",
          category: "功能需求",
          text: "用户可以提交订单。",
          relatedDiagrams: ["usecase"],
        },
      ],
      targetRuleIds: ["r1"],
      baseline,
      providerSettings: managedProviderSettings,
    });

    expect(response?.candidates[0]?.ruleId).toBe("r1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4001/api/runs/requirement-rule-repairs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-UML-Project-Id": "library-booking",
        }),
      }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.projectId).toBe("library-booking");
    expect(requestBody.targetRuleIds).toEqual(["r1"]);
  });

  it("omits unmanaged provider settings for requirement rule repairs", async () => {
    const requirement = createAtomicRequirement();
    const baseline = createRequirementBaseline([requirement]);
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/api/runs/requirement-rule-repairs")) {
        const body = JSON.parse(String(options?.body));
        return new Response(
          JSON.stringify({
            candidates: [],
            failures: body.targetRuleIds.map((ruleId: string) => ({
              ruleId,
              errorMessage: "需要人工确认。",
            })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "unexpected request" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = createHttpWorkspaceRepository({
      projectId: "library-booking",
    });
    const unmanagedProviderSettings = {
      model: "qwen3.5-plus",
    } as RepairRequirementRulesRequest["providerSettings"];
    await repository.repairRequirementRules?.({
      requirementText: "订单需求",
      rules: [
        {
          id: "r1",
          category: "功能需求",
          text: "用户可以提交订单。",
          relatedDiagrams: ["usecase"],
        },
      ],
      targetRuleIds: ["r1"],
      baseline,
      providerSettings: unmanagedProviderSettings,
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.projectId).toBe("library-booking");
    expect(requestBody.providerSettings).toBeUndefined();
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
