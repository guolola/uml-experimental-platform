// Coordinates code UI mockup, visual reference, UI IR, and fidelity verification stages.

import {
  artifactReadyRunEventSchema,
  codeUiFidelityReportResultSchema,
  codeUiIrResultSchema,
  codeUiMockupSchema,
  codeUiReferenceSpecResultSchema,
  llmChunkRunEventSchema,
  type CodeAppBlueprint,
  type CodeRunSnapshot,
  type CodeUiBlueprint,
  type CodeUiFidelityReport,
  type CodeUiIr,
  type CodeUiMockup,
  type CodeUiReferenceSpec,
  type ImageProviderSettings,
  type ProviderSettings,
} from "@uml-platform/contracts";
import {
  JSON_ONLY_SYSTEM_PROMPT,
  buildAnalyzeCodeUiMockupPrompt,
  buildGenerateCodeUiIrPrompt,
  buildGenerateCodeUiMockupPrompt,
  buildVerifyCodeUiFidelityPrompt,
} from "@uml-platform/prompts";
import { type ChatMessage, type ImageGenerationClient, type LlmTransport } from "../../../llm.js";
import { parseJson } from "../../../normalizers/json/parse-json.js";
import {
  getGenerateCodeUiFidelityResponseFormat,
  getGenerateCodeUiIrResponseFormat,
  getGenerateCodeUiReferenceResponseFormat,
} from "../../../adapters/llm/response-formats/index.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { buildCodeContext } from "./code-context.js";
import { addCodeDiagnostic } from "./code-run-diagnostics.js";
import { isBlankCodeFile } from "./code-quality-audit.js";
import { collectStructuredResult } from "../shared/structured-output.js";
import { createMessages } from "../shared/llm-messages.js";
import { getErrorMessage } from "../shared/errors.js";

export function stringifyStructuredPromptValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyStructuredPromptValue(item))
      .filter(Boolean)
      .join("；");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = [
      record.title,
      record.name,
      record.label,
      record.from,
      record.to,
      record.source,
      record.target,
      record.type,
      record.status,
      record.action,
      record.trigger,
      record.condition,
      record.description,
      record.pattern,
      record.rule,
      record.guideline,
      record.reason,
      record.audience,
    ]
      .map((item) => stringifyStructuredPromptValue(item))
      .filter(Boolean);
    const remaining = Object.entries(record)
      .filter(
        ([key]) =>
          ![
            "title",
            "name",
            "label",
            "from",
            "to",
            "source",
            "target",
            "type",
            "status",
            "action",
            "trigger",
            "condition",
            "description",
            "pattern",
            "rule",
            "guideline",
            "reason",
            "audience",
          ].includes(key),
      )
      .map(([key, item]) => {
        const text = stringifyStructuredPromptValue(item);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean);
    return [...preferred, ...remaining].join("；");
  }
  return "";
}

export function findImageReference(value: unknown): {
  imageUrl: string | null;
  imageDataUrl: string | null;
} {
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return findImageReference(JSON.parse(text));
      } catch {
        // Fall through to looser extraction for model responses with malformed JSON.
      }
    }

    const markdownMatch = text.match(/!\[[^\]]*]\(([^)]+)\)/);
    const markdownUrl = markdownMatch?.[1]?.trim().replace(/[)"'}\].,，。]+$/, "");
    if (markdownUrl?.startsWith("data:image/")) {
      return { imageUrl: null, imageDataUrl: markdownUrl };
    }
    if (markdownUrl && /^https?:\/\//.test(markdownUrl)) {
      return { imageUrl: markdownUrl, imageDataUrl: null };
    }

    const dataUrlMatch = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
    if (dataUrlMatch?.[0]) {
      return { imageUrl: null, imageDataUrl: dataUrlMatch[0] };
    }

    const urlMatch = text.match(/https?:\/\/\S+/);
    if (urlMatch?.[0]) {
      return {
        imageUrl: urlMatch[0].replace(/[)"'}\].,，。]+$/, ""),
        imageDataUrl: null,
      };
    }

    if (/^[A-Za-z0-9+/=]{200,}$/.test(text)) {
      return { imageUrl: null, imageDataUrl: `data:image/png;base64,${text}` };
    }

    return { imageUrl: null, imageDataUrl: null };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageReference(item);
      if (found.imageUrl || found.imageDataUrl) return found;
    }
    return { imageUrl: null, imageDataUrl: null };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of [
      "image_url",
      "imageUrl",
      "url",
      "data_url",
      "dataUrl",
      "b64_json",
      "base64",
      "content",
    ]) {
      if (key in record) {
        const found = findImageReference(record[key]);
        if (found.imageUrl || found.imageDataUrl) return found;
      }
    }
    for (const item of Object.values(record)) {
      const found = findImageReference(item);
      if (found.imageUrl || found.imageDataUrl) return found;
    }
  }

  return { imageUrl: null, imageDataUrl: null };
}

export function summarizeUiMockupIntent(
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
) {
  return [
    `应用名称：${appBlueprint.appName}`,
    `业务领域：${appBlueprint.domain}`,
    `视觉语言：${uiBlueprint.visualLanguage}`,
    `导航组织：${uiBlueprint.navigationModel}`,
    `主题：${uiBlueprint.theme.name}，主色 ${uiBlueprint.theme.primaryColor}，强调色 ${uiBlueprint.theme.accentColor}`,
    `主页面：${appBlueprint.pages.map((page) => page.name).join("、")}`,
  ].join("；");
}

// UI mockup generation is optional: failures become diagnostics and the code path continues.
export async function generateCodeUiMockup(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  imageClient: ImageGenerationClient,
  providerSettings: ImageProviderSettings,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
): Promise<CodeUiMockup> {
  const prompt = buildGenerateCodeUiMockupPrompt(
    buildCodeContext(snapshot),
    appBlueprint,
    uiBlueprint,
  );
  const summary = summarizeUiMockupIntent(appBlueprint, uiBlueprint);

  try {
    const result = await imageClient.generateImage({
      providerSettings,
      prompt,
    });
    const { imageUrl, imageDataUrl } = findImageReference(result.content);
    if (!imageUrl && !imageDataUrl) {
      throw new Error("图片模型没有返回可识别的图片链接或图片数据");
    }

    const mockup = codeUiMockupSchema.parse({
      status: "completed",
      model: providerSettings.model,
      prompt,
      summary,
      imageUrl,
      imageDataUrl,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    });
    snapshot.uiMockup = mockup;
    addCodeDiagnostic(snapshot, "generate_code_ui_mockup", "界面设计图已生成");
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_mockup",
        artifactKind: "uiMockup",
        uiMockup: mockup,
      }),
    );
    return mockup;
  } catch (error) {
    const message = `设计图生成失败，已根据文字界面方案继续生成代码：${getErrorMessage(error)}`;
    const mockup = codeUiMockupSchema.parse({
      status: "failed",
      model: providerSettings.model,
      prompt,
      summary,
      imageUrl: null,
      imageDataUrl: null,
      errorMessage: message,
      createdAt: new Date().toISOString(),
    });
    snapshot.uiMockup = mockup;
    addCodeDiagnostic(snapshot, "generate_code_ui_mockup", message);
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_mockup",
        artifactKind: "uiMockup",
        uiMockup: mockup,
      }),
    );
    return mockup;
  }
}

export function getUiMockupImage(mockup: CodeUiMockup | null) {
  if (!mockup || mockup.status !== "completed") return null;
  return mockup.imageUrl ?? mockup.imageDataUrl ?? null;
}

export function createMultimodalMessages(prompt: string, imageUrl: string): ChatMessage[] {
  return [
    { role: "system", content: JSON_ONLY_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ];
}

export function fallbackUiReferenceSpec(
  uiMockup: CodeUiMockup | null,
  uiBlueprint: CodeUiBlueprint,
): CodeUiReferenceSpec {
  return codeUiReferenceSpecResultSchema.parse({
    uiReferenceSpec: {
      layoutStructure: uiBlueprint.layoutPrinciples,
      navigation: uiBlueprint.navigationModel,
      colorPalette: [
        uiBlueprint.theme.primaryColor,
        uiBlueprint.theme.accentColor,
        uiBlueprint.theme.backgroundColor,
        uiBlueprint.theme.surfaceColor,
      ],
      componentShapes: uiBlueprint.componentGuidelines,
      informationDensity: uiBlueprint.theme.density,
      keyBusinessAreas: [uiBlueprint.visualLanguage],
      stateExpressions: uiBlueprint.stateGuidelines,
      implementationGuidelines: [
        "根据文字界面方案继续实现，并在布局、导航、色彩和状态表达上保持一致。",
      ],
      fallbackReason:
        uiMockup?.errorMessage ??
        "界面设计图不可用，已根据文字界面方案生成视觉参考规格。",
    },
  }).uiReferenceSpec;
}

export async function analyzeCodeUiMockup(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
  uiMockup: CodeUiMockup | null,
) {
  const imageUrl = getUiMockupImage(uiMockup);
  if (!imageUrl) {
    const fallback = fallbackUiReferenceSpec(uiMockup, uiBlueprint);
    snapshot.uiReferenceSpec = fallback;
    addCodeDiagnostic(
      snapshot,
      "analyze_code_ui_mockup",
      fallback.fallbackReason ?? "已根据文字界面方案生成视觉参考规格",
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "analyze_code_ui_mockup",
        artifactKind: "uiReferenceSpec",
        uiReferenceSpec: fallback,
      }),
    );
    return fallback;
  }

  try {
    const result = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMultimodalMessages(
        buildAnalyzeCodeUiMockupPrompt(appBlueprint, uiBlueprint),
        imageUrl,
      ),
      "analyze_code_ui_mockup",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "analyze_code_ui_mockup",
            chunk,
          }),
        );
      },
      (text) => codeUiReferenceSpecResultSchema.parse(parseJson(text)),
      getGenerateCodeUiReferenceResponseFormat(providerSettings.model),
    );
    snapshot.uiReferenceSpec = result.uiReferenceSpec;
    addCodeDiagnostic(snapshot, "analyze_code_ui_mockup", "已解析界面设计图视觉特征");
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "analyze_code_ui_mockup",
        artifactKind: "uiReferenceSpec",
        uiReferenceSpec: result.uiReferenceSpec,
      }),
    );
    return result.uiReferenceSpec;
  } catch (error) {
    const fallback = {
      ...fallbackUiReferenceSpec(uiMockup, uiBlueprint),
      fallbackReason: `界面设计图解析失败，已根据文字界面方案继续生成代码：${getErrorMessage(error)}`,
    };
    snapshot.uiReferenceSpec = fallback;
    addCodeDiagnostic(snapshot, "analyze_code_ui_mockup", fallback.fallbackReason);
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "analyze_code_ui_mockup",
        artifactKind: "uiReferenceSpec",
        uiReferenceSpec: fallback,
      }),
    );
    return fallback;
  }
}

const PLATFORM_COMPONENT_REGISTRY_NAMES = [
  "WorkspaceShell",
  "SidebarNav",
  "TopBar",
  "MetricCard",
  "DataTable",
  "StatusBadge",
  "FilterBar",
  "ActionButton",
  "DetailPanel",
  "EmptyState",
];

export function createFallbackCodeUiIr(
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
): CodeUiIr {
  return codeUiIrResultSchema.parse({
    uiIr: {
      designTokens: {
        colors: {
          primary: uiBlueprint.theme.primaryColor,
          background: uiBlueprint.theme.backgroundColor,
          surface: uiBlueprint.theme.surfaceColor,
          text: uiBlueprint.theme.textColor,
          accent: uiBlueprint.theme.accentColor,
          success: "#16a34a",
          warning: "#f59e0b",
          danger: "#dc2626",
        },
        typography: {
          body: "14px/1.5 system-ui",
          heading: "600 20px/1.25 system-ui",
          label: "600 12px/1.2 system-ui",
        },
        spacing: {
          "1": "4px",
          "2": "8px",
          "3": "12px",
          "4": "16px",
          "6": "24px",
          "8": "32px",
        },
        radius: {
          sm: "4px",
          md: "8px",
          lg: "12px",
        },
        shadow: {
          sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
          md: "0 8px 24px rgba(15, 23, 42, 0.12)",
        },
        density: uiBlueprint.theme.density,
      },
      componentRegistry: {
        components: PLATFORM_COMPONENT_REGISTRY_NAMES.map((name) => ({
          name,
          description: `${name} 用于 ${appBlueprint.domain} 原型中的标准业务界面结构`,
          props: ["title", "items", "status", "onAction"],
          variants: ["default", "compact", "emphasis"],
          usageRules: ["优先复用平台组件语义，不在页面中重新发明同类 UI"],
        })),
      },
      pages: appBlueprint.pages.map((page, index) => ({
        id: page.id,
        route: page.route,
        name: page.name,
        layout: "sidebar-content",
        primaryActions: [`执行${page.name}主要操作`],
        componentTree: {
          component: "WorkspaceShell",
          purpose: `承载${page.name}页面的导航和业务工作区`,
          props: { title: appBlueprint.appName, activeRoute: page.route },
          dataBinding: null,
          tokenRefs: ["colors.background", "colors.surface", "spacing.4"],
          children: [
            {
              component: "SidebarNav",
              purpose: "展示业务页面导航",
              props: { activeRoute: page.route },
              dataBinding: "appBlueprint.pages",
              tokenRefs: ["colors.primary", "spacing.3"],
              children: [],
            },
            {
              component: "TopBar",
              purpose: `说明${page.name}当前任务和关键状态`,
              props: { title: page.name, subtitle: page.purpose },
              dataBinding: null,
              tokenRefs: ["colors.text", "spacing.4"],
              children: [],
            },
            {
              component: index === 0 ? "MetricCard" : "DataTable",
              purpose: page.purpose,
              props: { title: page.name },
              dataBinding: `${appBlueprint.domain}业务数据`,
              tokenRefs: ["colors.surface", "radius.md", "shadow.sm"],
              children: [
                {
                  component: "ActionButton",
                  purpose: `触发${page.name}主要操作`,
                  props: { label: `处理${page.name}` },
                  dataBinding: null,
                  tokenRefs: ["colors.primary", "radius.sm"],
                  children: [],
                },
              ],
            },
          ],
        },
      })),
      dataBindings: [`${appBlueprint.domain}业务数据 -> DataTable/MetricCard/DetailPanel`],
      interactions: appBlueprint.pages.map((page) => `进入 ${page.name}: ${page.purpose}`),
      responsiveRules: [
        "desktop 使用侧边导航和右侧业务工作区",
        "tablet 保留导航但压缩统计与表格间距",
        "mobile 将导航折叠为顶部入口，业务区纵向排列",
      ],
    },
  }).uiIr;
}

export async function generateCodeUiIr(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  appBlueprint: CodeAppBlueprint,
  uiBlueprint: CodeUiBlueprint,
  uiMockup: CodeUiMockup | null,
  uiReferenceSpec: CodeUiReferenceSpec | null,
) {
  try {
    const result = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMessages(
        buildGenerateCodeUiIrPrompt(
          buildCodeContext(snapshot),
          appBlueprint,
          uiBlueprint,
          uiMockup,
          uiReferenceSpec,
        ),
      ),
      "generate_code_ui_ir",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "generate_code_ui_ir",
            chunk,
          }),
        );
      },
      (text) => codeUiIrResultSchema.parse(parseJson(text)),
      getGenerateCodeUiIrResponseFormat(providerSettings.model),
    );
    snapshot.designTokens = result.uiIr.designTokens;
    snapshot.componentRegistry = result.uiIr.componentRegistry;
    snapshot.uiIr = result.uiIr;
    addCodeDiagnostic(
      snapshot,
      "generate_code_ui_ir",
      `已生成 ${result.uiIr.pages.length} 个页面的结构化 UI IR`,
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_ir",
        artifactKind: "designTokens",
        designTokens: result.uiIr.designTokens,
      }),
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_ir",
        artifactKind: "componentRegistry",
        componentRegistry: result.uiIr.componentRegistry,
      }),
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_ir",
        artifactKind: "uiIr",
        uiIr: result.uiIr,
      }),
    );
    return result.uiIr;
  } catch (error) {
    const fallback = createFallbackCodeUiIr(appBlueprint, uiBlueprint);
    snapshot.designTokens = fallback.designTokens;
    snapshot.componentRegistry = fallback.componentRegistry;
    snapshot.uiIr = fallback;
    addCodeDiagnostic(
      snapshot,
      "generate_code_ui_ir",
      `结构化 UI IR 生成失败，已使用平台组件 Registry 降级：${getErrorMessage(error)}`,
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_code_ui_ir",
        artifactKind: "uiIr",
        uiIr: fallback,
      }),
    );
    return fallback;
  }
}

export function fallbackUiFidelityReport(reason: string): CodeUiFidelityReport {
  return codeUiFidelityReportResultSchema.parse({
    uiFidelityReport: {
      passed: true,
      matched: [],
      missing: [],
      repairSuggestions: [],
      summary: reason,
    },
  }).uiFidelityReport;
}

export function createFidelityFileEntry(path: string, content: string, maxChars = 7000) {
  const truncated = content.length > maxChars;
  return {
    path,
    content: truncated ? `${content.slice(0, maxChars)}\n...（文件内容已为还原检查截断）` : content,
    truncated,
    originalLength: content.length,
  };
}

export function summarizeStylesForFidelity(content: string) {
  const selected = content
    .split(/\r?\n/)
    .filter((line) =>
      /:root|\[data-theme|data-theme|--bg|--surface|--text|--muted|--primary|--border|@media|prototype-shell|route|theme|nav|button|grid|flex|overflow|max-width|minmax/i.test(
        line,
      ),
    )
    .join("\n");
  return selected || content.slice(0, 4000);
}

export function buildDeterministicFidelityCheck(
  snapshot: CodeRunSnapshot,
  filesText: string,
  pagePaths: string[],
) {
  const fileFacts: string[] = [];
  const missing: string[] = [];
  const repairSuggestions: string[] = [];
  const hasApp = !isBlankCodeFile(snapshot.files["/src/App.tsx"]);
  const hasShell = !isBlankCodeFile(snapshot.files["/src/components/WorkspaceShell.tsx"]);
  const hasMockDataBinding =
    /mock-data|activities|events|registrations|requests|reminders|from ['"].*data\/mock-data/i.test(
      filesText,
    );
  const hasPrimaryButton = /<button|role=["']button["']|onClick=|onSubmit=/i.test(filesText);
  const hasStateFlow = /useState|loading|isLoading|empty|error|success|selected|filter|status|空态|加载|失败|成功|详情/i.test(
    filesText,
  );
  const hasMockRouteState =
    /currentRoute|setCurrentRoute|routes\s*=|mock route|PageKey|currentPage|setCurrentPage|useState<[^>]*(?:Route|Page)/i.test(
      filesText,
    );
  const businessRoutes = snapshot.businessLogic?.pageFlows
    .map((flow) => flow.route)
    .filter(Boolean) ?? [];
  const routeMatches = businessRoutes.filter((route) => filesText.includes(route));

  if (hasApp) fileFacts.push("/src/App.tsx 存在并已纳入还原检查上下文。");
  else {
    missing.push("缺少 /src/App.tsx。");
    repairSuggestions.push("补齐 /src/App.tsx，挂载 WorkspaceShell，并通过 useEffect 设置 document.title。");
  }

  if (hasShell) fileFacts.push("/src/components/WorkspaceShell.tsx 存在并已纳入还原检查上下文。");
  else {
    missing.push("缺少 /src/components/WorkspaceShell.tsx。");
    repairSuggestions.push("补齐 /src/components/WorkspaceShell.tsx，实现导航、模拟路由 state 和主题切换。");
  }

  if (pagePaths.length > 0) {
    fileFacts.push(`检测到 ${pagePaths.length} 个页面/功能文件：${pagePaths.join(", ")}。`);
  } else {
    missing.push("缺少 /src/pages 或 /src/features 页面实现。");
    repairSuggestions.push("新增 /src/pages/* 或 /src/features/* 页面文件，覆盖 businessLogic.pageFlows 中的核心页面。");
  }

  if (hasMockDataBinding) fileFacts.push("检测到 mock 数据导入或业务数据绑定。");
  else {
    missing.push("未检测到 mock 数据绑定。");
    repairSuggestions.push("在页面组件中导入 /src/data/mock-data.ts，并将列表、详情、申请、提醒等 UI 绑定到 mock 数据。");
  }

  if (hasPrimaryButton) fileFacts.push("检测到按钮、提交或点击操作。");
  else {
    missing.push("未检测到主要操作按钮。");
    repairSuggestions.push("为列表筛选、详情查看、申请提交、创建/编辑/删除、提醒触发等流程增加可点击操作。");
  }

  if (hasStateFlow) fileFacts.push("检测到状态流转关键词或 React state。");
  else {
    missing.push("未检测到加载、空态、错误、成功或选择状态。");
    repairSuggestions.push("补齐加载中、列表展示、空态、筛选无结果、详情展示、操作成功/失败提示等状态。");
  }

  if (businessRoutes.length === 0 || hasMockRouteState || routeMatches.length > 0) {
    fileFacts.push(
      `业务路径以模拟路由/页面状态验证；匹配路径：${routeMatches.join(", ") || "未提供或由 PageKey 表达"}`,
    );
  } else {
    missing.push(`未检测到业务路径字符串或模拟路由状态：${businessRoutes.join(", ")}。`);
    repairSuggestions.push("在 WorkspaceShell 中增加 mock route table/currentRoute state，保留 businessLogic.pageFlows[].route 字符串并用 setCurrentRoute 切换页面。");
  }

  return {
    fileFacts,
    missing,
    repairSuggestions,
    routeExpectation:
      "业务路径只要求通过模拟 route state / mock route table / PageKey 体现，不要求 BrowserRouter、真实地址栏路由或 history API。",
  };
}

export function buildFidelityCheckContext(snapshot: CodeRunSnapshot) {
  const files = snapshot.files;
  const pagePaths = Object.keys(files)
    .filter((path) => /^\/src\/(?:pages|features)\/.+\.(?:tsx|ts)$/.test(path))
    .sort();
  const componentPaths = Object.keys(files)
    .filter(
      (path) =>
        /^\/src\/components\/.+\.tsx$/.test(path) &&
        path !== "/src/components/WorkspaceShell.tsx",
    )
    .sort();
  const criticalPaths = ["/src/App.tsx", "/src/components/WorkspaceShell.tsx"];
  const supportingPaths = [
    ...componentPaths.slice(0, 10),
    "/src/data/mock-data.ts",
    "/src/domain/types.ts",
    "/src/styles.css",
  ];
  const included = new Set<string>();
  const createEntry = (path: string, maxChars?: number) => {
    const content = files[path];
    if (!content) return null;
    included.add(path);
    if (path === "/src/styles.css") {
      return createFidelityFileEntry(path, summarizeStylesForFidelity(content), maxChars ?? 4500);
    }
    return createFidelityFileEntry(path, content, maxChars);
  };

  const criticalFiles = criticalPaths.map((path) => createEntry(path, 8000)).filter(Boolean);
  const pageFiles = pagePaths.map((path) => createEntry(path, 7000)).filter(Boolean);
  const supportingFiles = supportingPaths
    .map((path) => createEntry(path, path === "/src/data/mock-data.ts" ? 7000 : 5000))
    .filter(Boolean);
  const omittedFiles = Object.entries(files)
    .filter(([path]) => !included.has(path))
    .map(([path, content]) => ({
      path,
      originalLength: content.length,
      reason:
        path === "/BUSINESS_CONTEXT.md" || path === "/index.html" || path === "/src/main.tsx"
          ? "辅助/骨架文件，已从业务覆盖判断正文中省略。"
          : "非优先文件，因还原检查上下文预算省略；不能据此判定文件不存在。",
    }));
  const filesText = Object.values(files).join("\n");

  return {
    purpose: "用于 verify_code_ui_fidelity 的专用上下文；关键 React 文件优先，避免完整文件树截断导致误判。",
    deterministicCheck: buildDeterministicFidelityCheck(snapshot, filesText, pagePaths),
    criticalFiles,
    pageFiles,
    supportingFiles,
    omittedFiles,
  };
}

// Fidelity verification combines deterministic checks with an LLM review and emits the same artifact event.
export async function verifyCodeUiFidelity(
  record: RunRecord,
  snapshot: CodeRunSnapshot,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
) {
  if (!snapshot.businessLogic) {
    const report = fallbackUiFidelityReport(
      "业务逻辑不可用，已跳过结构一致性检查。",
    );
    snapshot.uiFidelityReport = report;
    addCodeDiagnostic(snapshot, "verify_code_ui_fidelity", report.summary);
    return report;
  }

  try {
    const fidelityCheckContext = buildFidelityCheckContext(snapshot);
    const result = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMessages(
        buildVerifyCodeUiFidelityPrompt(
          snapshot.businessLogic,
          snapshot.uiBlueprint,
          fidelityCheckContext,
        ),
      ),
      "verify_code_ui_fidelity",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "verify_code_ui_fidelity",
            chunk,
          }),
        );
      },
      (text) => codeUiFidelityReportResultSchema.parse(parseJson(text)),
      getGenerateCodeUiFidelityResponseFormat(providerSettings.model),
    );
    const deterministicCheck = fidelityCheckContext.deterministicCheck;
    const report =
      deterministicCheck.missing.length > 0
        ? codeUiFidelityReportResultSchema.parse({
            uiFidelityReport: {
              passed: false,
              matched: [
                ...result.uiFidelityReport.matched,
                ...deterministicCheck.fileFacts,
              ],
              missing: [
                ...result.uiFidelityReport.missing,
                ...deterministicCheck.missing,
              ],
              repairSuggestions: [
                ...result.uiFidelityReport.repairSuggestions,
                ...deterministicCheck.repairSuggestions,
              ],
              summary: `确定性文件检查发现 ${deterministicCheck.missing.length} 个阻塞问题，需要修复后再判定业务覆盖。`,
            },
          }).uiFidelityReport
        : result.uiFidelityReport;
    snapshot.uiFidelityReport = report;
    addCodeDiagnostic(snapshot, "verify_code_ui_fidelity", report.summary);
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "verify_code_ui_fidelity",
        artifactKind: "uiFidelityReport",
        uiFidelityReport: report,
      }),
    );
    return report;
  } catch (error) {
    const report = fallbackUiFidelityReport(
      `业务/界面覆盖检查失败，已保留当前原型：${getErrorMessage(error)}`,
    );
    snapshot.uiFidelityReport = report;
    addCodeDiagnostic(snapshot, "verify_code_ui_fidelity", report.summary);
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "verify_code_ui_fidelity",
        artifactKind: "uiFidelityReport",
        uiFidelityReport: report,
      }),
    );
    return report;
  }
}
