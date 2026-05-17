import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type {
  CodeBusinessLogic,
  CodeGenerationSpec,
  CodeRunSnapshot,
  CodeSkillContext,
  CodeSkillResourceDiscoveryPlan,
  CodeSkillResourcePreviewResult,
  CodeSkillResourcePlan,
  CodeVisualDirection,
  CodeUiFidelityReport,
  CodeUiMockup,
  CodeUiReferenceSpec,
  DesignTraceEntry,
  RequirementTraceEntry,
  DocumentKind,
  DocumentRunSnapshot,
  DesignDiagramModelSpec,
  DiagramModelSpec,
  RunEvent,
  RunStage,
} from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "../../entities/diagram/model";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import type {
  RunStatus,
  WorkspaceRecord,
  WorkspaceCodeRunSnapshot,
  WorkspaceDesignRunSnapshot,
  WorkspaceRunSnapshot,
} from "../../entities/workspace/model";
import {
  createStartCodeRunInput,
  createStartDesignRunInput,
  createStartDocumentRunInput,
  createStartRunInput,
  useWorkspaceRepository,
} from "../../services/workspace-repository";
import { downloadBlobFile } from "../../shared/lib/download";
import {
  isCodeRunSnapshot,
  isDesignRunSnapshot,
  isDocumentRunSnapshot,
  type RunHistoryItem,
  type RunHistorySnapshot,
} from "../history";

interface DiagnosticEvent {
  id: string;
  at: string;
  label: string;
  detail: string | null;
}

interface RunDiagnostics {
  runKind: "requirements" | "design" | "code" | "document" | null;
  runId: string | null;
  providerModel: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  activeStage: RunStage | null;
  streamText: string;
  chunkCount: number;
  stageStartedAt: Partial<Record<RunStage, string>>;
  stageMessages: Partial<Record<string, string>>;
  events: DiagnosticEvent[];
  uiMockup: CodeUiMockup | null;
  uiReferenceSpec: CodeUiReferenceSpec | null;
  uiFidelityReport: CodeUiFidelityReport | null;
  visualDirection: CodeVisualDirection | null;
  skillResourceDiscoveryPlan: CodeSkillResourceDiscoveryPlan | null;
  skillResourcePreviews: CodeSkillResourcePreviewResult | null;
  skillResourcePlan: CodeSkillResourcePlan | null;
  codeSkillContext: CodeSkillContext | null;
  requirementTrace: RequirementTraceEntry[];
  designTrace: DesignTraceEntry[];
}

interface WorkspaceSessionState {
  requirementText: string;
  setRequirementText: (value: string) => void;
  rules: RequirementRule[];
  addRequirementRule: () => void;
  createRequirementRule: (input: {
    category: RequirementRule["category"];
    text: string;
    relatedDiagrams: DiagramType[];
  }) => void;
  updateRequirementRule: (
    id: string,
    patch: Partial<RequirementRule>,
  ) => void;
  deleteRequirementRule: (id: string) => void;
  models: WorkspaceRecord["models"];
  selectedDiagrams: DiagramType[];
  setSelectedDiagrams: (value: DiagramType[]) => void;
  plantUml: Partial<Record<DiagramType, string>>;
  svgArtifacts: WorkspaceRecord["svgArtifacts"];
  diagramErrors: WorkspaceRecord["diagramErrors"];
  selectedDesignDiagrams: DesignDiagramType[];
  setSelectedDesignDiagrams: (value: DesignDiagramType[]) => void;
  designModels: WorkspaceRecord["designModels"];
  designPlantUml: WorkspaceRecord["designPlantUml"];
  designSvgArtifacts: WorkspaceRecord["designSvgArtifacts"];
  designDiagramErrors: WorkspaceRecord["designDiagramErrors"];
  codeSpec: CodeGenerationSpec | null;
  codeBusinessLogic: CodeBusinessLogic | null;
  codeFiles: Record<string, string>;
  codeEntryFile: string | null;
  codeDependencies: Record<string, string>;
  codeUiMockup: CodeUiMockup | null;
  codeAgentPlan: string[];
  codeSkills: CodeRunSnapshot["selectedCodeSkills"];
  codeSkillDiagnostics: CodeRunSnapshot["skillDiagnostics"];
  codeSkillResourcePlan: CodeRunSnapshot["skillResourcePlan"];
  codeSkillContext: CodeRunSnapshot["codeSkillContext"];
  codeDiagnostics: CodeRunSnapshot["diagnostics"];
  updateCodeFile: (path: string, value: string) => void;
  generatedDesignDiagrams: DesignDiagramType[];
  generatedDiagrams: DiagramType[];
  generating: boolean;
  runStatus: RunStatus;
  runProgress: number;
  runMessage: string | null;
  errorMessage: string | null;
  generateRules: () => Promise<void>;
  generateDiagrams: (only?: DiagramType[]) => Promise<void>;
  generateDesignDiagrams: (only?: DesignDiagramType[]) => Promise<void>;
  generateCodePrototype: (mode?: "continue" | "regenerate") => Promise<void>;
  generateRequirementsSpec: () => Promise<void>;
  generateSoftwareDesignSpec: () => Promise<void>;
  rulesForDiagram: (diagram: DiagramType) => RequirementRule[];
  textVersion: number;
  rulesVersion: number;
  rulesBasedOnTextVersion: number | null;
  diagramVersions: Partial<Record<DiagramType, number>>;
  isRulesStale: boolean;
  staleDiagrams: DiagramType[];
  historyItems: RunHistoryItem[];
  refreshHistory: () => Promise<void>;
  restoreRunHistory: (id: string) => Promise<void>;
  deleteRunHistory: (id: string) => Promise<void>;
  clearRunHistory: () => Promise<void>;
  renderPlantUml: (diagram: DiagramType, source: string) => Promise<void>;
  currentRunDiagnostics: RunDiagnostics;
}

type RunMode =
  | { kind: "rules-only" }
  | { kind: "full-diagrams" }
  | { kind: "partial-diagrams"; diagrams: DiagramType[] };

const WorkspaceSessionContext = createContext<WorkspaceSessionState | null>(null);
const MAX_DIAGNOSTIC_STREAM_CHARS = 30_000;
const GENERATION_COMPLETED_EVENT = "uml-generation-completed";

function notifyGenerationCompleted(kind: "requirements" | "design") {
  const message = kind === "requirements" ? "需求模型生成完成" : "设计模型生成完成";
  toast.success(message);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(GENERATION_COMPLETED_EVENT, {
        detail: { kind },
      }),
    );
  }
}

function notifyGenerationStarted(
  kind: "requirements" | "design" | "code" | "document",
  documentKind?: DocumentKind,
) {
  const message =
    kind === "requirements"
      ? "需求生成已开始"
      : kind === "design"
        ? "设计生成已开始"
        : kind === "code"
          ? "代码生成已开始"
          : documentKind === "requirementsSpec"
            ? "需求规格说明书生成已开始"
            : "软件设计说明书生成已开始";
  toast.message(message);
}

function notifyGenerationFailed(message: string) {
  toast.error(message);
}

function notifyGenerationResultStale() {
  toast.message("结果基于生成开始时的内容，期间修改不会自动合并到本次结果");
}

function snapshotInputFingerprint(value: unknown) {
  return JSON.stringify(value);
}

function createEmptyRunUiState() {
  return {
    runStatus: "idle" as RunStatus,
    runProgress: 0,
    runMessage: null as string | null,
    errorMessage: null as string | null,
  };
}

function createEmptyDiagnostics(): RunDiagnostics {
  return {
    runKind: null,
    runId: null,
    providerModel: null,
    startedAt: null,
    finishedAt: null,
    activeStage: null,
    streamText: "",
    chunkCount: 0,
    stageStartedAt: {},
    stageMessages: {},
    events: [],
    uiMockup: null,
    uiReferenceSpec: null,
    uiFidelityReport: null,
    visualDirection: null,
    skillResourceDiscoveryPlan: null,
    skillResourcePreviews: null,
    skillResourcePlan: null,
    codeSkillContext: null,
    requirementTrace: [],
    designTrace: [],
  };
}

function formatStageForDiagnostics(stage: RunStage | null) {
  if (!stage) return "等待任务";
  const labels: Record<RunStage, string> = {
    extract_rules: "抽取需求规则",
    generate_models: "生成需求模型",
    generate_design_sequence: "生成设计顺序图",
    generate_design_models: "生成设计模型",
    analyze_code_business_logic: "分析业务逻辑",
    analyze_code_product: "分析业务背景",
    plan_code_ui: "规划界面方案",
    generate_code_ui_mockup: "生成界面设计图",
    analyze_code_ui_mockup: "解析界面设计图",
    generate_code_ui_ir: "生成结构化 UI IR",
    load_web_design_skill: "加载前端设计执行器",
    select_code_skills: "选择前端设计执行器",
    plan_code_files: "规划文件结构",
    generate_code_spec: "生成代码规格",
    generate_code_files: "生成代码文件",
    plan_code: "制定实现步骤",
    write_code_files: "写入原型文件",
    audit_code_quality: "检查原型质量",
    verify_code_ui_fidelity: "检查业务/界面覆盖",
    verify_code_rendered_preview: "验证渲染预览",
    verify_code_preview: "检查预览入口",
    repair_code_files: "修复代码输出",
    generate_document_text: "生成说明书正文",
    render_document_file: "写入说明书文件",
    generate_plantuml: "生成图源码",
    render_svg: "渲染图像",
  };
  return labels[stage];
}

function sanitizeDiagnosticText(text: string) {
  const replacements = [
    ["extract_rules", "抽取需求规则"],
    ["generate_models", "生成需求模型"],
    ["generate_design_sequence", "生成设计顺序图"],
    ["generate_design_models", "生成设计模型"],
    ["analyze_code_business_logic", "分析业务逻辑"],
    ["analyze_code_product", "分析业务背景"],
    ["plan_code_ui", "规划界面方案"],
    ["generate_code_ui_mockup", "生成界面设计图"],
    ["analyze_code_ui_mockup", "解析界面设计图"],
    ["generate_code_ui_ir", "生成结构化 UI IR"],
    ["load_web_design_skill", "加载前端设计执行器"],
    ["select_code_skills", "选择前端设计执行器"],
    ["plan_code_files", "规划文件结构"],
    ["generate_code_spec", "生成代码规格"],
    ["generate_code_files", "生成代码文件"],
    ["plan_code", "制定实现步骤"],
    ["write_code_files", "写入原型文件"],
    ["audit_code_quality", "检查原型质量"],
    ["verify_code_ui_fidelity", "检查设计图还原度"],
    ["verify_code_rendered_preview", "验证渲染预览"],
    ["verify_code_preview", "检查预览入口"],
    ["repair_code_files", "修复代码输出"],
    ["generate_document_text", "生成说明书正文"],
    ["render_document_file", "写入说明书文件"],
    ["generate_plantuml", "生成图源码"],
    ["render_svg", "渲染图像"],
    ["PlantUML", "图源码"],
    ["SVG", "图像"],
    ["codeFiles", "代码文件"],
    ["codeSpec", "代码规格"],
    ["uiMockup", "界面设计图"],
    ["uiReferenceSpec", "界面设计图解析"],
    ["businessLogic", "业务逻辑"],
    ["uiFidelityReport", "业务/界面覆盖检查"],
    ["designTokens", "设计 Token"],
    ["componentRegistry", "组件 Registry"],
    ["uiIr", "结构化 UI IR"],
    ["visualDiffReport", "预览验证报告"],
    ["ui-ux-pro-max", "前端设计执行器"],
  ];
  return replacements.reduce(
    (current, [source, target]) => current.split(source).join(target),
    text,
  );
}

function appendDiagnosticStream(current: string, chunk: string) {
  const next = current + chunk;
  if (next.length <= MAX_DIAGNOSTIC_STREAM_CHARS) {
    return next;
  }
  return next.slice(next.length - MAX_DIAGNOSTIC_STREAM_CHARS);
}

function summarizeEvent(event: RunEvent): DiagnosticEvent {
  const at = new Date().toISOString();
  const suffix = `${at}:${Math.random().toString(36).slice(2, 8)}`;
  switch (event.type) {
    case "queued":
      return { id: `${suffix}:queued`, at, label: "已排队", detail: "任务已进入队列" };
    case "stage_started":
      return {
        id: `${suffix}:stage_started:${event.stage}`,
        at,
        label: "阶段开始",
        detail: `${formatStageForDiagnostics(event.stage)}已开始`,
      };
    case "stage_progress":
      return {
        id: `${suffix}:stage_progress:${event.stage}:${event.progress}`,
        at,
        label: "阶段进度",
        detail: sanitizeDiagnosticText(
          event.message ?? `${formatStageForDiagnostics(event.stage)} ${event.progress}%`,
        ),
      };
    case "artifact_ready":
      return {
        id: `${suffix}:artifact_ready:${event.artifactKind}:${event.diagramKind ?? "all"}`,
        at,
        label: "产物已生成",
        detail:
          event.artifactKind === "document"
            ? "说明书文件已准备好"
            : `${formatStageForDiagnostics(event.stage)}的产物已准备好`,
      };
    case "code_file_changed":
      return {
        id: `${suffix}:code_file_changed:${event.path}`,
        at,
        label: "文件已更新",
        detail: sanitizeDiagnosticText(event.reason),
      };
    case "completed":
      if ("files" in event.snapshot) {
        return {
          id: `${suffix}:completed`,
          at,
          label: "任务完成",
          detail: `完成，代码文件 ${Object.keys(event.snapshot.files).length} 个`,
        };
      }
      if ("documentKind" in event.snapshot) {
        return {
          id: `${suffix}:completed`,
          at,
          label: "任务完成",
          detail: `完成，说明书 ${event.snapshot.fileName ?? ""}`,
        };
      }
      return {
        id: `${suffix}:completed`,
        at,
        label: "任务完成",
        detail:
          "svgArtifacts" in event.snapshot
            ? `完成，图像 ${event.snapshot.svgArtifacts.length} 个`
            : "完成",
      };
    case "failed":
      return {
        id: `${suffix}:failed`,
        at,
        label: "任务失败",
        detail: sanitizeDiagnosticText(event.message),
      };
    case "llm_chunk":
      return {
        id: `${suffix}:llm_chunk:${event.stage}`,
        at,
        label: "收到模型输出",
        detail: `${formatStageForDiagnostics(event.stage)}收到模型输出`,
      };
  }
}

function snapshotToMaps(snapshot: WorkspaceRunSnapshot) {
  return {
    models: Object.fromEntries(
      snapshot.models.map((model) => [model.diagramKind, model]),
    ) as WorkspaceRecord["models"],
    plantUml: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [artifact.diagramKind, artifact.source]),
    ) as WorkspaceRecord["plantUml"],
    svgArtifacts: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [artifact.diagramKind, artifact]),
    ) as WorkspaceRecord["svgArtifacts"],
  };
}

function designSnapshotToMaps(snapshot: WorkspaceDesignRunSnapshot) {
  return {
    models: Object.fromEntries(
      snapshot.models.map((model) => [model.diagramKind, model]),
    ) as WorkspaceRecord["designModels"],
    plantUml: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [artifact.diagramKind, artifact.source]),
    ) as WorkspaceRecord["designPlantUml"],
    svgArtifacts: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [artifact.diagramKind, artifact]),
    ) as WorkspaceRecord["designSvgArtifacts"],
  };
}

function getProgressFromEvent(event: RunEvent) {
  switch (event.type) {
    case "queued":
      return 5;
    case "stage_started":
      switch (event.stage) {
        case "extract_rules":
          return 20;
        case "generate_models":
          return 65;
        case "generate_design_sequence":
          return 45;
        case "generate_design_models":
          return 70;
        case "analyze_code_business_logic":
          return 18;
        case "analyze_code_product":
          return 18;
        case "plan_code_ui":
          return 34;
        case "load_web_design_skill":
          return 48;
        case "generate_code_ui_mockup":
          return 42;
        case "plan_code_files":
          return 50;
        case "generate_code_spec":
          return 45;
        case "generate_code_files":
          return 80;
        case "plan_code":
          return 58;
        case "write_code_files":
          return 74;
        case "audit_code_quality":
          return 88;
        case "verify_code_preview":
          return 92;
        case "repair_code_files":
          return 96;
        case "generate_document_text":
          return 55;
        case "render_document_file":
          return 90;
        case "generate_plantuml":
          return 80;
        case "render_svg":
          return 95;
      }
      return null;
    case "stage_progress":
      return event.progress;
    case "completed":
      return 100;
    case "failed":
      return 100;
    case "llm_chunk":
    case "artifact_ready":
    case "code_file_changed":
      return null;
  }
}

export function WorkspaceSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const repository = useWorkspaceRepository();
  const [requirementText, setRequirementTextRaw] = useState("");
  const [rules, setRules] = useState<RequirementRule[]>([]);
  const [models, setModels] = useState<WorkspaceRecord["models"]>({});
  const [selectedDiagrams, setSelectedDiagrams] = useState<DiagramType[]>([]);
  const [plantUml, setPlantUml] = useState<WorkspaceRecord["plantUml"]>({});
  const [svgArtifacts, setSvgArtifacts] = useState<WorkspaceRecord["svgArtifacts"]>(
    {},
  );
  const [diagramErrors, setDiagramErrors] = useState<WorkspaceRecord["diagramErrors"]>(
    {},
  );
  const [selectedDesignDiagrams, setSelectedDesignDiagrams] = useState<
    DesignDiagramType[]
  >([]);
  const [designModels, setDesignModels] = useState<WorkspaceRecord["designModels"]>(
    {},
  );
  const [designPlantUml, setDesignPlantUml] = useState<
    WorkspaceRecord["designPlantUml"]
  >({});
  const [designSvgArtifacts, setDesignSvgArtifacts] = useState<
    WorkspaceRecord["designSvgArtifacts"]
  >({});
  const [designDiagramErrors, setDesignDiagramErrors] = useState<
    WorkspaceRecord["designDiagramErrors"]
  >({});
  const [codeSpec, setCodeSpec] = useState<CodeGenerationSpec | null>(null);
  const [codeBusinessLogic, setCodeBusinessLogic] =
    useState<CodeBusinessLogic | null>(null);
  const [codeFiles, setCodeFiles] = useState<Record<string, string>>({});
  const [codeEntryFile, setCodeEntryFile] = useState<string | null>(null);
  const [codeDependencies, setCodeDependencies] = useState<Record<string, string>>({});
  const [codeUiMockup, setCodeUiMockup] = useState<CodeUiMockup | null>(null);
  const [codeAgentPlan, setCodeAgentPlan] = useState<string[]>([]);
  const [codeSkills, setCodeSkills] = useState<CodeRunSnapshot["selectedCodeSkills"]>(
    [],
  );
  const [codeSkillDiagnostics, setCodeSkillDiagnostics] = useState<
    CodeRunSnapshot["skillDiagnostics"]
  >([]);
  const [codeSkillResourcePlan, setCodeSkillResourcePlan] = useState<
    CodeRunSnapshot["skillResourcePlan"]
  >(null);
  const [codeSkillContext, setCodeSkillContext] = useState<
    CodeRunSnapshot["codeSkillContext"]
  >(null);
  const [codeDiagnostics, setCodeDiagnostics] = useState<CodeRunSnapshot["diagnostics"]>(
    [],
  );
  const [generatedDiagrams, setGeneratedDiagrams] = useState<DiagramType[]>([]);
  const [generatedDesignDiagrams, setGeneratedDesignDiagrams] = useState<
    DesignDiagramType[]
  >([]);
  const [runUiState, setRunUiState] = useState(createEmptyRunUiState);
  const [textVersion, setTextVersion] = useState(0);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [rulesBasedOnTextVersion, setRulesBasedOnTextVersion] = useState<
    number | null
  >(null);
  const [codeEditVersion, setCodeEditVersion] = useState(0);
  const [diagramVersions, setDiagramVersions] = useState<
    Partial<Record<DiagramType, number>>
  >({});
  const [historyItems, setHistoryItems] = useState<RunHistoryItem[]>([]);
  const [currentRunDiagnostics, setCurrentRunDiagnostics] =
    useState(createEmptyDiagnostics);

  const runRequestIdRef = useRef(0);
  const latestInputRef = useRef({
    requirementText,
    rules,
    models,
    designModels,
    codeFiles,
    codeEditVersion,
  });

  useEffect(() => {
    latestInputRef.current = {
      requirementText,
      rules,
      models,
      designModels,
      codeFiles,
      codeEditVersion,
    };
  }, [codeEditVersion, codeFiles, designModels, models, requirementText, rules]);

  useEffect(() => {
    let active = true;

    void repository.loadWorkspace().then((workspace) => {
      if (!active) return;
      setRequirementTextRaw(workspace.requirementText);
      setRules(workspace.rules);
      setModels(workspace.models);
      setSelectedDiagrams(workspace.selectedDiagramTypes);
      setPlantUml(workspace.plantUml);
      setSvgArtifacts(workspace.svgArtifacts);
      setDiagramErrors(workspace.diagramErrors);
      setSelectedDesignDiagrams(workspace.selectedDesignDiagramTypes);
      setDesignModels(workspace.designModels);
      setDesignPlantUml(workspace.designPlantUml);
      setDesignSvgArtifacts(workspace.designSvgArtifacts);
      setDesignDiagramErrors(workspace.designDiagramErrors);
      setCodeSpec(workspace.codeSpec);
      setCodeBusinessLogic(workspace.codeBusinessLogic);
      setCodeFiles(workspace.codeFiles);
      setCodeEntryFile(workspace.codeEntryFile);
      setCodeDependencies(workspace.codeDependencies);
      setCodeUiMockup(workspace.codeUiMockup);
      setCodeAgentPlan(workspace.codeAgentPlan);
      setCodeSkills(workspace.codeSkills);
      setCodeSkillDiagnostics(workspace.codeSkillDiagnostics);
      setCodeSkillResourcePlan(workspace.codeSkillResourcePlan);
      setCodeSkillContext(workspace.codeSkillContext);
      setCodeDiagnostics(workspace.codeDiagnostics);
      setGeneratedDiagrams(workspace.generatedDiagramTypes);
      setGeneratedDesignDiagrams(workspace.generatedDesignDiagramTypes);
      setRulesVersion(workspace.rulesVersion);
      setRulesBasedOnTextVersion(workspace.rulesBasedOnTextVersion);
      setDiagramVersions(workspace.diagramVersions);
      setRunUiState({
        runStatus: workspace.runStatus,
        runProgress: workspace.runProgress,
        runMessage: workspace.runMessage,
        errorMessage: workspace.errorMessage,
      });
      setTextVersion(0);
      void repository.listRunHistory().then((items) => {
        if (active) {
          setHistoryItems(items);
        }
      });
    });

    return () => {
      active = false;
    };
  }, [repository]);

  const setRequirementText = useCallback(
    (value: string) => {
      setRequirementTextRaw((prev) => {
        if (prev !== value) {
          setTextVersion((current) => current + 1);
        }
        return value;
      });
      void repository.updateRequirementText(value);
    },
    [repository],
  );

  const commitRequirementRules = useCallback(
    (nextRules: RequirementRule[]) => {
      setRules(nextRules);
      setRulesVersion((current) => current + 1);
      setRulesBasedOnTextVersion(textVersion);
      void repository.updateRequirementRules?.(nextRules);
    },
    [repository, textVersion],
  );

  const getNextRequirementRuleId = useCallback(() => {
    const used = new Set(rules.map((rule) => rule.id.toLowerCase()));
    const maxIndex = rules.reduce((max, rule) => {
      const match = /^r(\d+)$/i.exec(rule.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    let nextIndex = maxIndex + 1;
    while (used.has(`r${nextIndex}`)) {
      nextIndex += 1;
    }
    return `r${nextIndex}`;
  }, [rules]);

  const createRequirementRule = useCallback(
    (input: {
      category: RequirementRule["category"];
      text: string;
      relatedDiagrams: DiagramType[];
    }) => {
      const relatedDiagrams = input.relatedDiagrams.length > 0
        ? input.relatedDiagrams
        : (["usecase"] as DiagramType[]);
      commitRequirementRules([
        ...rules,
        {
          id: getNextRequirementRuleId(),
          category: input.category,
          text: input.text.trim() || "待填写需求项",
          relatedDiagrams,
        },
      ]);
    },
    [commitRequirementRules, getNextRequirementRuleId, rules],
  );

  const addRequirementRule = useCallback(() => {
    createRequirementRule({
      category: "功能需求",
      text: "待填写需求项",
      relatedDiagrams: ["usecase", "activity"],
    });
  }, [createRequirementRule]);

  const updateRequirementRule = useCallback(
    (id: string, patch: Partial<RequirementRule>) => {
      commitRequirementRules(
        rules.map((rule) =>
          rule.id === id
            ? {
                ...rule,
                ...patch,
                relatedDiagrams:
                  patch.relatedDiagrams && patch.relatedDiagrams.length > 0
                    ? patch.relatedDiagrams
                    : (patch.relatedDiagrams ?? rule.relatedDiagrams),
              }
            : rule,
        ),
      );
    },
    [commitRequirementRules, rules],
  );

  const deleteRequirementRule = useCallback(
    (id: string) => {
      commitRequirementRules(rules.filter((rule) => rule.id !== id));
    },
    [commitRequirementRules, rules],
  );

  const rulesForDiagram = useCallback(
    (diagram: DiagramType) =>
      rules.filter((rule) => rule.relatedDiagrams.includes(diagram)),
    [rules],
  );

  const applyRunSnapshot = useCallback(
    (
      snapshot: WorkspaceRunSnapshot,
      baseTextVersion: number,
      mode: RunMode,
    ) => {
      const nextRulesVersion = rulesVersion + 1;
      const mapped = snapshotToMaps(snapshot);

      setRules(snapshot.rules);
      setRulesVersion(nextRulesVersion);
      setRulesBasedOnTextVersion(baseTextVersion);
      setDiagramErrors((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of mode.diagrams) {
            delete next[diagram];
          }
          for (const [diagram, error] of Object.entries(snapshot.diagramErrors)) {
            next[diagram as DiagramType] = error;
          }
          return next;
        }
        return snapshot.diagramErrors;
      });

      if (mode.kind === "rules-only") {
        return;
      }

      setModels((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of mode.diagrams) {
            delete next[diagram];
          }
          for (const [diagram, model] of Object.entries(mapped.models)) {
            next[diagram as DiagramType] = model;
          }
          return next;
        }
        return mapped.models;
      });

      setPlantUml((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of mode.diagrams) {
            delete next[diagram];
          }
          for (const [diagram, source] of Object.entries(mapped.plantUml)) {
            next[diagram as DiagramType] = source;
          }
          return next;
        }
        return mapped.plantUml;
      });

      setSvgArtifacts((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of mode.diagrams) {
            delete next[diagram];
          }
          for (const [diagram, artifact] of Object.entries(mapped.svgArtifacts)) {
            next[diagram as DiagramType] = artifact;
          }
          return next;
        }
        return mapped.svgArtifacts;
      });

      const affectedDiagrams =
        mode.kind === "partial-diagrams"
          ? mode.diagrams
          : [...snapshot.selectedDiagrams];

      setGeneratedDiagrams((current) => {
        if (mode.kind === "partial-diagrams") {
          return Array.from(new Set([...current, ...affectedDiagrams]));
        }
        return [...snapshot.selectedDiagrams];
      });

      setDiagramVersions((current) => {
        if (mode.kind === "partial-diagrams") {
          const next = { ...current };
          for (const diagram of affectedDiagrams) {
            next[diagram] = nextRulesVersion;
          }
          return next;
        }
        return Object.fromEntries(
          snapshot.selectedDiagrams.map((diagram) => [diagram, nextRulesVersion]),
        ) as Partial<Record<DiagramType, number>>;
      });
    },
    [rulesVersion],
  );

  const applyDesignRunSnapshot = useCallback(
    (
      snapshot: WorkspaceDesignRunSnapshot,
      requestedDiagrams: DesignDiagramType[],
    ) => {
      const mapped = designSnapshotToMaps(snapshot);
      setSelectedDesignDiagrams([...requestedDiagrams]);
      setDesignModels((current) => ({
        ...current,
        ...mapped.models,
      }));
      setDesignPlantUml((current) => ({
        ...current,
        ...mapped.plantUml,
      }));
      setDesignSvgArtifacts((current) => ({
        ...current,
        ...mapped.svgArtifacts,
      }));
      setDesignDiagramErrors((current) => ({
        ...current,
        ...snapshot.diagramErrors,
      }));
      setGeneratedDesignDiagrams((current) =>
        Array.from(new Set([...current, ...snapshot.selectedDiagrams])),
      );
    },
    [],
  );

  const applyCodeRunSnapshot = useCallback((snapshot: WorkspaceCodeRunSnapshot) => {
    setCodeSpec(snapshot.spec);
    setCodeBusinessLogic(snapshot.businessLogic);
    setCodeFiles({ ...snapshot.files });
    setCodeEntryFile(snapshot.entryFile);
    setCodeDependencies({ ...snapshot.dependencies });
    setCodeUiMockup(snapshot.uiMockup);
    setCodeAgentPlan([...snapshot.agentPlan]);
    setCodeSkills([...snapshot.selectedCodeSkills]);
    setCodeSkillDiagnostics([...snapshot.skillDiagnostics]);
    setCodeSkillResourcePlan(snapshot.skillResourcePlan);
    setCodeSkillContext(snapshot.codeSkillContext);
    setCodeDiagnostics([...snapshot.diagnostics]);
  }, []);

  const updateCodeFile = useCallback((path: string, value: string) => {
    setCodeFiles((current) => ({
      ...current,
      [path]: value,
    }));
    setCodeEditVersion((current) => current + 1);
  }, []);

  const applyRestoredSnapshot = useCallback((snapshot: RunHistorySnapshot) => {
    const restoredRulesVersion = rulesVersion + 1;
    setRequirementTextRaw(snapshot.requirementText);
    void repository.updateRequirementText(snapshot.requirementText);
    setRules("rules" in snapshot ? snapshot.rules : []);
    setRulesVersion(restoredRulesVersion);
    setRulesBasedOnTextVersion(textVersion);

    if (isDocumentRunSnapshot(snapshot)) {
      setRunUiState({
        runStatus: snapshot.status,
        runProgress:
          snapshot.status === "completed" || snapshot.status === "failed" ? 100 : 0,
        runMessage: snapshot.status === "completed" ? "已恢复说明书记录" : null,
        errorMessage: snapshot.errorMessage,
      });
      setCurrentRunDiagnostics({
        ...createEmptyDiagnostics(),
        runKind: "document",
        runId: snapshot.runId,
        activeStage: snapshot.currentStage,
        finishedAt:
          snapshot.status === "completed" || snapshot.status === "failed"
            ? new Date().toISOString()
            : null,
        streamText: snapshot.errorMessage ?? "",
      });
      return;
    }

    if (isCodeRunSnapshot(snapshot)) {
      const restoredDesignModels = Object.fromEntries(
        snapshot.designModels.map((model) => [model.diagramKind, model]),
      ) as WorkspaceRecord["designModels"];
      const restoredDesignDiagrams = snapshot.designModels.map(
        (model) => model.diagramKind,
      );

      setModels({});
      setSelectedDiagrams([]);
      setPlantUml({});
      setSvgArtifacts({});
      setDiagramErrors({});
      setGeneratedDiagrams([]);
      setDiagramVersions({});
      setSelectedDesignDiagrams(restoredDesignDiagrams);
      setDesignModels(restoredDesignModels);
      setDesignPlantUml({});
      setDesignSvgArtifacts({});
      setDesignDiagramErrors({});
      setGeneratedDesignDiagrams(restoredDesignDiagrams);
      applyCodeRunSnapshot(snapshot);
    } else if (isDesignRunSnapshot(snapshot)) {
      const mapped = designSnapshotToMaps(snapshot);
      const restoredRequirementModels = Object.fromEntries(
        snapshot.requirementModels.map((model) => [model.diagramKind, model]),
      ) as WorkspaceRecord["models"];
      const restoredRequirementDiagrams = snapshot.requirementModels.map(
        (model) => model.diagramKind,
      );

      setModels(restoredRequirementModels);
      setSelectedDiagrams(restoredRequirementDiagrams);
      setPlantUml({});
      setSvgArtifacts({});
      setDiagramErrors({});
      setGeneratedDiagrams(restoredRequirementDiagrams);
      setDiagramVersions(
        Object.fromEntries(
          restoredRequirementDiagrams.map((diagram) => [
            diagram,
            restoredRulesVersion,
          ]),
        ),
      );
      setSelectedDesignDiagrams([...snapshot.selectedDiagrams]);
      setDesignModels(mapped.models);
      setDesignPlantUml(mapped.plantUml);
      setDesignSvgArtifacts(mapped.svgArtifacts);
      setDesignDiagramErrors(snapshot.diagramErrors);
      setGeneratedDesignDiagrams([...snapshot.selectedDiagrams]);
      setCodeSpec(null);
      setCodeBusinessLogic(null);
      setCodeFiles({});
      setCodeEntryFile(null);
      setCodeDependencies({});
      setCodeAgentPlan([]);
      setCodeSkills([]);
      setCodeSkillDiagnostics([]);
      setCodeSkillResourcePlan(null);
      setCodeSkillContext(null);
      setCodeDiagnostics([]);
    } else {
      const mapped = snapshotToMaps(snapshot);
      setModels(mapped.models);
      setSelectedDiagrams([...snapshot.selectedDiagrams]);
      setPlantUml(mapped.plantUml);
      setSvgArtifacts(mapped.svgArtifacts);
      setDiagramErrors(snapshot.diagramErrors);
      setGeneratedDiagrams([...snapshot.selectedDiagrams]);
      setDiagramVersions(
        Object.fromEntries(
          snapshot.selectedDiagrams.map((diagram) => [
            diagram,
            restoredRulesVersion,
          ]),
        ),
      );
      setSelectedDesignDiagrams([]);
      setDesignModels({});
      setDesignPlantUml({});
      setDesignSvgArtifacts({});
      setDesignDiagramErrors({});
      setGeneratedDesignDiagrams([]);
      setCodeSpec(null);
      setCodeBusinessLogic(null);
      setCodeFiles({});
      setCodeEntryFile(null);
      setCodeDependencies({});
      setCodeAgentPlan([]);
      setCodeSkills([]);
      setCodeSkillDiagnostics([]);
      setCodeSkillResourcePlan(null);
      setCodeSkillContext(null);
      setCodeDiagnostics([]);
    }

    setRunUiState({
      runStatus: snapshot.status,
      runProgress: snapshot.status === "completed" || snapshot.status === "failed" ? 100 : 0,
      runMessage: snapshot.status === "completed" ? "已恢复历史快照" : null,
      errorMessage: snapshot.errorMessage,
    });
    setCurrentRunDiagnostics({
      ...createEmptyDiagnostics(),
      runKind: isCodeRunSnapshot(snapshot)
        ? "code"
        : isDesignRunSnapshot(snapshot)
          ? "design"
          : "requirements",
      runId: snapshot.runId,
      activeStage: snapshot.currentStage,
      finishedAt:
        snapshot.status === "completed" || snapshot.status === "failed"
          ? new Date().toISOString()
          : null,
      streamText: snapshot.errorMessage ?? "",
      uiMockup: isCodeRunSnapshot(snapshot) ? snapshot.uiMockup : null,
      uiReferenceSpec: isCodeRunSnapshot(snapshot)
        ? snapshot.uiReferenceSpec
        : null,
      uiFidelityReport: isCodeRunSnapshot(snapshot)
        ? snapshot.uiFidelityReport
        : null,
      visualDirection: isCodeRunSnapshot(snapshot)
        ? snapshot.visualDirection
        : null,
      skillResourceDiscoveryPlan: isCodeRunSnapshot(snapshot)
        ? snapshot.skillResourceDiscoveryPlan
        : null,
      skillResourcePreviews: isCodeRunSnapshot(snapshot)
        ? snapshot.skillResourcePreviews
        : null,
      skillResourcePlan: isCodeRunSnapshot(snapshot)
        ? snapshot.skillResourcePlan
        : null,
      codeSkillContext: isCodeRunSnapshot(snapshot)
        ? snapshot.codeSkillContext
        : null,
      requirementTrace:
        !isCodeRunSnapshot(snapshot) && !isDesignRunSnapshot(snapshot)
          ? snapshot.requirementTrace ?? []
          : [],
      designTrace: isDesignRunSnapshot(snapshot)
        ? snapshot.designTrace ?? []
        : [],
    });
  }, [applyCodeRunSnapshot, repository, rulesVersion, textVersion]);

  const refreshHistory = useCallback(async () => {
    setHistoryItems(await repository.listRunHistory());
  }, [repository]);

  const restoreRunHistory = useCallback(
    async (id: string) => {
      const item = await repository.restoreRunHistory(id);
      if (!item) {
        throw new Error("历史快照不存在");
      }
      applyRestoredSnapshot(item.snapshot);
    },
    [applyRestoredSnapshot, repository],
  );

  const deleteRunHistory = useCallback(
    async (id: string) => {
      setHistoryItems(await repository.deleteRunHistory(id));
    },
    [repository],
  );

  const clearRunHistory = useCallback(async () => {
    await repository.clearRunHistory();
    setHistoryItems([]);
  }, [repository]);

  const saveHistorySnapshot = useCallback(
    async (
      snapshot: RunHistorySnapshot,
      meta: { providerModel: string; durationMs?: number },
    ) => {
      await repository.saveRunHistory(snapshot, meta);
      setHistoryItems(await repository.listRunHistory());
    },
    [repository],
  );

  const runGeneration = useCallback(
    async (diagrams: DiagramType[], mode: RunMode) => {
      const runRequestId = ++runRequestIdRef.current;
      const baseTextVersion = textVersion;
      const rulesForRun = mode.kind === "rules-only" ? [] : rules;
      const baseInputFingerprint = snapshotInputFingerprint({
        requirementText,
        rules: rulesForRun,
      });
      let lastCompletedSnapshot: WorkspaceRunSnapshot | null = null;
      let runId: string | null = null;
      const startedAtMs = Date.now();
      let providerModel = "";

      try {
        const startInput = createStartRunInput(
          requirementText,
          diagrams,
          rulesForRun.filter(
            (rule) =>
              rule.id.trim() &&
              rule.text.trim() &&
              rule.relatedDiagrams.length > 0,
          ),
        );
        providerModel = startInput.providerSettings.model;
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("requirements");
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "requirements",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startRun(
          startInput,
        );
        runId = started.runId;
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToRun(runId, (event) => {
          if (runRequestId !== runRequestIdRef.current) {
            return;
          }

          const progress = getProgressFromEvent(event);
          if (event.type === "completed") {
            lastCompletedSnapshot = event.snapshot as WorkspaceRunSnapshot;
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt:
              event.type === "completed" || event.type === "failed"
                ? diagnosticEvent.at
                : current.finishedAt,
            activeStage:
              "stage" in event
                ? event.stage
                : current.activeStage,
            streamText:
              event.type === "llm_chunk"
                ? appendDiagnosticStream(current.streamText, event.chunk)
                : current.streamText,
            chunkCount:
              event.type === "llm_chunk"
                ? current.chunkCount + 1
                : current.chunkCount,
            stageStartedAt:
              event.type === "stage_started"
                ? { ...current.stageStartedAt, [event.stage]: diagnosticEvent.at }
                : current.stageStartedAt,
            stageMessages:
              event.type === "stage_progress" && event.message
                ? { ...current.stageMessages, [event.stage]: event.message }
                : current.stageMessages,
            designTrace:
              event.type === "completed" && "designTrace" in event.snapshot
                ? event.snapshot.designTrace ?? []
                : current.designTrace,
            requirementTrace:
              event.type === "completed" && "requirementTrace" in event.snapshot
                ? event.snapshot.requirementTrace ?? []
                : current.requirementTrace,
            events: [...current.events, diagnosticEvent].slice(-80),
          }));

          setRunUiState((current) => ({
            runStatus:
              event.type === "queued"
                ? "queued"
                : event.type === "failed"
                  ? "failed"
                  : event.type === "completed"
                    ? "completed"
                    : "running",
            runProgress: progress ?? current.runProgress,
            runMessage:
              event.type === "stage_progress"
                ? event.message ?? current.runMessage
                : event.type === "queued"
                  ? "任务已进入队列"
                  : event.type === "completed"
                    ? "生成完成"
                    : event.type === "failed"
                      ? event.message
                      : current.runMessage,
            errorMessage:
              event.type === "failed" ? event.message : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getRunSnapshot(runId)) ?? lastCompletedSnapshot;
        if (!snapshot || runRequestId !== runRequestIdRef.current) {
          return;
        }

        applyRunSnapshot(snapshot, baseTextVersion, mode);
        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "生成完成",
          errorMessage: null,
        });
        notifyGenerationCompleted("requirements");
        if (
          baseInputFingerprint !==
          snapshotInputFingerprint({
            requirementText: latestInputRef.current.requirementText,
            rules: mode.kind === "rules-only" ? [] : latestInputRef.current.rules,
          })
        ) {
          notifyGenerationResultStale();
        }
      } catch (error) {
        if (runRequestId !== runRequestIdRef.current) {
          return;
        }
        if (runId) {
          try {
            const failedSnapshot = await repository.getRunSnapshot(runId);
            setCurrentRunDiagnostics((current) => ({
              ...current,
              requirementTrace: failedSnapshot.requirementTrace ?? current.requirementTrace,
            }));
            await saveHistorySnapshot(failedSnapshot, {
              providerModel,
              durationMs: Date.now() - startedAtMs,
            });
          } catch {
            // The visible error state below is more useful than a secondary history failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: error instanceof Error ? error.message : "生成失败",
        });
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local`,
              at: new Date().toISOString(),
              label: "failed",
              detail: error instanceof Error ? error.message : "生成失败",
            },
          ].slice(-80),
        }));
        notifyGenerationFailed(error instanceof Error ? `生成失败：${error.message}` : "生成失败");
      }
    },
    [applyRunSnapshot, repository, requirementText, rules, saveHistorySnapshot, textVersion],
  );

  const runDesignGeneration = useCallback(
    async (diagrams: DesignDiagramType[]) => {
      const runRequestId = ++runRequestIdRef.current;
      let lastCompletedSnapshot: WorkspaceDesignRunSnapshot | null = null;
      const baseInputFingerprint = snapshotInputFingerprint({
        requirementText,
        rules,
        models,
      });
      let runId: string | null = null;
      const startedAtMs = Date.now();
      let providerModel = "";

      try {
        if (
          !repository.startDesignRun ||
          !repository.subscribeToDesignRun ||
          !repository.getDesignRunSnapshot
        ) {
          throw new Error("当前仓储未实现设计阶段生成能力");
        }
        const startInput = createStartDesignRunInput(
          requirementText,
          rules,
          Object.values(models).filter(
            (model): model is DiagramModelSpec => Boolean(model),
          ),
          diagrams,
        );
        providerModel = startInput.providerSettings.model;
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "设计生成任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("design");
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "design",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startDesignRun(startInput);
        runId = started.runId;
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToDesignRun(runId, (event) => {
          if (runRequestId !== runRequestIdRef.current) {
            return;
          }

          const progress = getProgressFromEvent(event);
          if (event.type === "completed") {
            lastCompletedSnapshot = event.snapshot as WorkspaceDesignRunSnapshot;
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt:
              event.type === "completed" || event.type === "failed"
                ? diagnosticEvent.at
                : current.finishedAt,
            activeStage:
              "stage" in event
                ? event.stage
                : current.activeStage,
            streamText:
              event.type === "llm_chunk"
                ? appendDiagnosticStream(current.streamText, event.chunk)
                : current.streamText,
            chunkCount:
              event.type === "llm_chunk"
                ? current.chunkCount + 1
                : current.chunkCount,
            stageStartedAt:
              event.type === "stage_started"
                ? { ...current.stageStartedAt, [event.stage]: diagnosticEvent.at }
                : current.stageStartedAt,
            stageMessages:
              event.type === "stage_progress" && event.message
                ? { ...current.stageMessages, [event.stage]: event.message }
                : current.stageMessages,
            designTrace:
              event.type === "completed" && "designTrace" in event.snapshot
                ? event.snapshot.designTrace ?? []
                : current.designTrace,
            events: [...current.events, diagnosticEvent].slice(-80),
          }));

          setRunUiState((current) => ({
            runStatus:
              event.type === "queued"
                ? "queued"
                : event.type === "failed"
                  ? "failed"
                  : event.type === "completed"
                    ? "completed"
                    : "running",
            runProgress: progress ?? current.runProgress,
            runMessage:
              event.type === "stage_progress"
                ? event.message ?? current.runMessage
                : event.type === "queued"
                  ? "设计生成任务已进入队列"
                  : event.type === "completed"
                    ? "设计生成完成"
                    : event.type === "failed"
                      ? event.message
                      : current.runMessage,
            errorMessage:
              event.type === "failed" ? event.message : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getDesignRunSnapshot(runId)) ?? lastCompletedSnapshot;
        if (!snapshot || runRequestId !== runRequestIdRef.current) {
          return;
        }

        applyDesignRunSnapshot(snapshot, diagrams);
        setCurrentRunDiagnostics((current) => ({
          ...current,
          designTrace: snapshot.designTrace ?? [],
        }));
        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "设计生成完成",
          errorMessage: null,
        });
        notifyGenerationCompleted("design");
        if (
          baseInputFingerprint !==
          snapshotInputFingerprint({
            requirementText: latestInputRef.current.requirementText,
            rules: latestInputRef.current.rules,
            models: latestInputRef.current.models,
          })
        ) {
          notifyGenerationResultStale();
        }
      } catch (error) {
        if (runRequestId !== runRequestIdRef.current) {
          return;
        }
        if (runId) {
          try {
            const failedSnapshot = await repository.getDesignRunSnapshot(runId);
            applyDesignRunSnapshot(failedSnapshot, diagrams);
            setCurrentRunDiagnostics((current) => ({
              ...current,
              designTrace: failedSnapshot.designTrace ?? [],
            }));
            await saveHistorySnapshot(failedSnapshot, {
              providerModel,
              durationMs: Date.now() - startedAtMs,
            });
          } catch {
            // The visible error state below is more useful than a secondary snapshot failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: error instanceof Error ? error.message : "设计生成失败",
        });
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local`,
              at: new Date().toISOString(),
              label: "failed",
              detail: error instanceof Error ? error.message : "设计生成失败",
            },
          ].slice(-80),
        }));
        notifyGenerationFailed(
          error instanceof Error ? `设计生成失败：${error.message}` : "设计生成失败",
        );
      }
    },
    [
      applyDesignRunSnapshot,
      models,
      repository,
      requirementText,
      rules,
      saveHistorySnapshot,
    ],
  );

  const runCodeGeneration = useCallback(async (
    generationMode: "continue" | "regenerate" = "continue",
  ) => {
    const runRequestId = ++runRequestIdRef.current;
    const baseInputFingerprint = snapshotInputFingerprint({
      requirementText,
      rules,
      designModels,
    });
    const baseCodeEditVersion = codeEditVersion;
    let lastCompletedSnapshot: WorkspaceCodeRunSnapshot | null = null;
    let runId: string | null = null;
    const startedAtMs = Date.now();
    let providerModel = "";

    try {
      if (
        !repository.startCodeRun ||
        !repository.subscribeToCodeRun ||
        !repository.getCodeRunSnapshot
      ) {
        throw new Error("当前仓储未实现代码生成能力");
      }
      const availableDesignModels = Object.values(designModels).filter(
        (model): model is DesignDiagramModelSpec => Boolean(model),
      );
      if (availableDesignModels.length === 0) {
        throw new Error("请先生成设计模型，再生成前端原型代码");
      }
      const availableDesignPlantUml = Object.entries(designPlantUml)
        .filter(([, source]) => source.trim().length > 0)
        .map(([diagramKind, source]) => ({
          diagramKind: diagramKind as DesignDiagramType,
          source,
        }));

      const startInput = createStartCodeRunInput(
        requirementText,
        rules,
        availableDesignModels,
        availableDesignPlantUml,
        codeFiles,
        generationMode,
      );
      providerModel = startInput.providerSettings.model;
      setRunUiState({
        runStatus: "queued",
        runProgress: 5,
        runMessage: "代码生成任务已进入队列",
        errorMessage: null,
      });
      notifyGenerationStarted("code");
      setCurrentRunDiagnostics({
        ...createEmptyDiagnostics(),
        runKind: "code",
        providerModel,
        startedAt: new Date(startedAtMs).toISOString(),
      });

      const started = await repository.startCodeRun(startInput);
      runId = started.runId;
      setCurrentRunDiagnostics((current) => ({
        ...current,
        runId,
        providerModel,
      }));

      await repository.subscribeToCodeRun(runId, (event) => {
        if (runRequestId !== runRequestIdRef.current) {
          return;
        }

        const progress = getProgressFromEvent(event);
        if (event.type === "completed") {
          lastCompletedSnapshot = event.snapshot as WorkspaceCodeRunSnapshot;
        }
        if (event.type === "code_file_changed") {
          setCodeFiles((current) => ({
            ...current,
            [event.path]: event.content,
          }));
          setCodeEntryFile((current) => current ?? event.path);
        }
        if (event.type === "artifact_ready" && event.artifactKind === "uiMockup") {
          setCodeUiMockup(event.uiMockup ?? null);
        }
        if (event.type === "artifact_ready" && event.artifactKind === "codeSkills") {
          setCodeSkills(event.codeSkills ?? []);
          setCodeSkillDiagnostics(event.skillDiagnostics ?? []);
        }
        if (event.type === "artifact_ready" && event.artifactKind === "skillResourcePlan") {
          setCodeSkillResourcePlan(event.skillResourcePlan ?? null);
          setCodeSkillDiagnostics(event.skillDiagnostics ?? []);
        }
        if (event.type === "artifact_ready" && event.artifactKind === "codeSkillContext") {
          setCodeSkillContext(event.codeSkillContext ?? null);
          setCodeSkillDiagnostics(event.skillDiagnostics ?? []);
        }
        const diagnosticEvent = summarizeEvent(event);
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt:
            event.type === "completed" || event.type === "failed"
              ? diagnosticEvent.at
              : current.finishedAt,
          activeStage:
            "stage" in event
              ? event.stage
              : current.activeStage,
          streamText:
            event.type === "llm_chunk"
              ? appendDiagnosticStream(current.streamText, event.chunk)
              : current.streamText,
          chunkCount:
            event.type === "llm_chunk"
              ? current.chunkCount + 1
              : current.chunkCount,
          stageStartedAt:
            event.type === "stage_started"
              ? { ...current.stageStartedAt, [event.stage]: diagnosticEvent.at }
              : current.stageStartedAt,
          stageMessages:
            event.type === "stage_progress" && event.message
              ? { ...current.stageMessages, [event.stage]: event.message }
              : current.stageMessages,
          events: [...current.events, diagnosticEvent].slice(-80),
          uiMockup:
            event.type === "artifact_ready" && event.artifactKind === "uiMockup"
              ? event.uiMockup ?? current.uiMockup
              : current.uiMockup,
          uiReferenceSpec:
            event.type === "artifact_ready" && event.artifactKind === "uiReferenceSpec"
              ? event.uiReferenceSpec ?? current.uiReferenceSpec
              : event.type === "completed" && "uiReferenceSpec" in event.snapshot
                ? event.snapshot.uiReferenceSpec ?? current.uiReferenceSpec
              : current.uiReferenceSpec,
          uiFidelityReport:
            event.type === "artifact_ready" && event.artifactKind === "uiFidelityReport"
              ? event.uiFidelityReport ?? current.uiFidelityReport
              : event.type === "completed" && "uiFidelityReport" in event.snapshot
                ? event.snapshot.uiFidelityReport ?? current.uiFidelityReport
                : current.uiFidelityReport,
          visualDirection:
            event.type === "artifact_ready" && event.artifactKind === "visualDirection"
              ? event.visualDirection ?? current.visualDirection
              : event.type === "completed" && "visualDirection" in event.snapshot
                ? event.snapshot.visualDirection ?? current.visualDirection
                : current.visualDirection,
          skillResourceDiscoveryPlan:
            event.type === "artifact_ready" && event.artifactKind === "skillResourceDiscoveryPlan"
              ? event.skillResourceDiscoveryPlan ?? current.skillResourceDiscoveryPlan
              : event.type === "completed" && "skillResourceDiscoveryPlan" in event.snapshot
                ? event.snapshot.skillResourceDiscoveryPlan ?? current.skillResourceDiscoveryPlan
                : current.skillResourceDiscoveryPlan,
          skillResourcePreviews:
            event.type === "artifact_ready" && event.artifactKind === "skillResourcePreviews"
              ? event.skillResourcePreviews ?? current.skillResourcePreviews
              : event.type === "completed" && "skillResourcePreviews" in event.snapshot
                ? event.snapshot.skillResourcePreviews ?? current.skillResourcePreviews
                : current.skillResourcePreviews,
          skillResourcePlan:
            event.type === "artifact_ready" && event.artifactKind === "skillResourcePlan"
              ? event.skillResourcePlan ?? current.skillResourcePlan
              : event.type === "completed" && "skillResourcePlan" in event.snapshot
                ? event.snapshot.skillResourcePlan ?? current.skillResourcePlan
                : current.skillResourcePlan,
          codeSkillContext:
            event.type === "artifact_ready" && event.artifactKind === "codeSkillContext"
              ? event.codeSkillContext ?? current.codeSkillContext
              : event.type === "completed" && "codeSkillContext" in event.snapshot
                ? event.snapshot.codeSkillContext ?? current.codeSkillContext
                : current.codeSkillContext,
        }));

        setRunUiState((current) => ({
          runStatus:
            event.type === "queued"
              ? "queued"
              : event.type === "failed"
                ? "failed"
                : event.type === "completed"
                  ? "completed"
                  : "running",
          runProgress: progress ?? current.runProgress,
          runMessage:
            event.type === "code_file_changed"
              ? `已写入 ${event.path}`
              : event.type === "stage_progress"
                ? event.message ?? current.runMessage
                : event.type === "queued"
                  ? "代码生成任务已进入队列"
                  : event.type === "completed"
                    ? "files" in event.snapshot &&
                      event.snapshot.generationMode === "continue" &&
                      event.snapshot.changedFileCount === 0
                      ? "本次未产生文件变更"
                      : "代码生成完成"
                    : event.type === "failed"
                      ? event.message
                      : current.runMessage,
          errorMessage:
            event.type === "failed" ? event.message : current.errorMessage,
        }));
      });

      const snapshot =
        (await repository.getCodeRunSnapshot(runId)) ?? lastCompletedSnapshot;
      if (!snapshot || runRequestId !== runRequestIdRef.current) {
        return;
      }

      applyCodeRunSnapshot(snapshot);
      await saveHistorySnapshot(snapshot, {
        providerModel,
        durationMs: Date.now() - startedAtMs,
      });
      setRunUiState({
        runStatus: "completed",
        runProgress: 100,
        runMessage:
          snapshot.generationMode === "continue" && snapshot.changedFileCount === 0
            ? "本次未产生文件变更"
            : "代码生成完成",
        errorMessage: null,
      });
      if (snapshot.generationMode === "continue" && snapshot.changedFileCount === 0) {
        toast.message("本次未产生文件变更");
      } else {
        toast.success(
          snapshot.generationMode === "regenerate" ? "代码重新生成完成" : "代码生成完成",
        );
      }
      if (
        baseInputFingerprint !==
        snapshotInputFingerprint({
          requirementText: latestInputRef.current.requirementText,
          rules: latestInputRef.current.rules,
          designModels: latestInputRef.current.designModels,
        }) ||
          baseCodeEditVersion !== latestInputRef.current.codeEditVersion
      ) {
        notifyGenerationResultStale();
      }
    } catch (error) {
      if (runRequestId !== runRequestIdRef.current) {
        return;
      }
      if (runId && repository.getCodeRunSnapshot) {
        try {
          const failedSnapshot = await repository.getCodeRunSnapshot(runId);
          applyCodeRunSnapshot(failedSnapshot);
          await saveHistorySnapshot(failedSnapshot, {
            providerModel,
            durationMs: Date.now() - startedAtMs,
          });
        } catch {
          // The visible error state below is more useful than a secondary snapshot failure.
        }
      }
      setRunUiState({
        runStatus: "failed",
        runProgress: 100,
        runMessage: null,
        errorMessage: error instanceof Error ? error.message : "代码生成失败",
      });
      setCurrentRunDiagnostics((current) => ({
        ...current,
        finishedAt: new Date().toISOString(),
        events: [
          ...current.events,
          {
            id: `${new Date().toISOString()}:failed-local`,
            at: new Date().toISOString(),
            label: "failed",
            detail: error instanceof Error ? error.message : "代码生成失败",
          },
        ].slice(-80),
      }));
      notifyGenerationFailed(
        error instanceof Error ? `代码生成失败：${error.message}` : "代码生成失败",
      );
    }
  }, [
    applyCodeRunSnapshot,
    codeFiles,
    codeEditVersion,
    designModels,
    repository,
    requirementText,
    rules,
    saveHistorySnapshot,
  ]);

  const runDocumentGeneration = useCallback(
    async (documentKind: DocumentKind) => {
      const runRequestId = ++runRequestIdRef.current;
      const startedAtMs = Date.now();
      let providerModel = "";
      let runId: string | null = null;
      let lastCompletedSnapshot: DocumentRunSnapshot | null = null;

      try {
        if (
          !repository.startDocumentRun ||
          !repository.subscribeToDocumentRun ||
          !repository.getDocumentRunSnapshot ||
          !repository.downloadDocumentRun
        ) {
          throw new Error("当前仓储未实现说明书生成能力");
        }

        const requirementModels = Object.values(models).filter(
          (model): model is DiagramModelSpec => Boolean(model),
        );
        const requirementPlantUml = Object.entries(plantUml)
          .filter((entry): entry is [DiagramType, string] => Boolean(entry[1]))
          .map(([diagramKind, source]) => ({ diagramKind, source }));
        const requirementSvgArtifacts = Object.values(svgArtifacts).filter(
          (artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact),
        );
        const availableDesignModels = Object.values(designModels).filter(
          (model): model is DesignDiagramModelSpec => Boolean(model),
        );
        const designPlantUmlList = Object.entries(designPlantUml)
          .filter((entry): entry is [DesignDiagramType, string] => Boolean(entry[1]))
          .map(([diagramKind, source]) => ({ diagramKind, source }));
        const designSvgArtifactList = Object.values(designSvgArtifacts).filter(
          (artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact),
        );

        if (
          documentKind === "requirementsSpec" &&
          !requirementText.trim() &&
          rules.length === 0 &&
          requirementModels.length === 0
        ) {
          throw new Error("请先输入需求或生成需求模型，再导出需求规格说明书");
        }
        if (documentKind === "softwareDesignSpec" && availableDesignModels.length === 0) {
          throw new Error("请先生成设计模型，再导出软件设计说明书");
        }

        const startInput = createStartDocumentRunInput(
          documentKind,
          requirementText,
          rules,
          requirementModels,
          requirementPlantUml,
          requirementSvgArtifacts,
          availableDesignModels,
          designPlantUmlList,
          designSvgArtifactList,
        );
        providerModel = startInput.providerSettings.model;
        setRunUiState({
          runStatus: "queued",
          runProgress: 5,
          runMessage: "说明书生成任务已进入队列",
          errorMessage: null,
        });
        notifyGenerationStarted("document", documentKind);
        setCurrentRunDiagnostics({
          ...createEmptyDiagnostics(),
          runKind: "document",
          providerModel,
          startedAt: new Date(startedAtMs).toISOString(),
        });

        const started = await repository.startDocumentRun(startInput);
        runId = started.runId;
        setCurrentRunDiagnostics((current) => ({
          ...current,
          runId,
          providerModel,
        }));

        await repository.subscribeToDocumentRun(runId, (event) => {
          if (runRequestId !== runRequestIdRef.current) {
            return;
          }
          const progress = getProgressFromEvent(event);
          if (event.type === "completed" && "documentKind" in event.snapshot) {
            lastCompletedSnapshot = event.snapshot;
          }
          const diagnosticEvent = summarizeEvent(event);
          setCurrentRunDiagnostics((current) => ({
            ...current,
            finishedAt:
              event.type === "completed" || event.type === "failed"
                ? diagnosticEvent.at
                : current.finishedAt,
            activeStage: "stage" in event ? event.stage : current.activeStage,
            streamText:
              event.type === "llm_chunk"
                ? appendDiagnosticStream(current.streamText, event.chunk)
                : current.streamText,
            chunkCount:
              event.type === "llm_chunk"
                ? current.chunkCount + 1
                : current.chunkCount,
            stageStartedAt:
              event.type === "stage_started"
                ? { ...current.stageStartedAt, [event.stage]: diagnosticEvent.at }
                : current.stageStartedAt,
            stageMessages:
              event.type === "stage_progress" && event.message
                ? { ...current.stageMessages, [event.stage]: event.message }
                : current.stageMessages,
            events: [...current.events, diagnosticEvent].slice(-80),
          }));

          setRunUiState((current) => ({
            runStatus:
              event.type === "queued"
                ? "queued"
                : event.type === "failed"
                  ? "failed"
                  : event.type === "completed"
                    ? "completed"
                    : "running",
            runProgress: progress ?? current.runProgress,
            runMessage:
              event.type === "stage_progress"
                ? event.message ?? current.runMessage
                : event.type === "queued"
                  ? "说明书生成任务已进入队列"
                  : event.type === "completed"
                    ? "说明书生成完成"
                    : event.type === "failed"
                      ? event.message
                      : current.runMessage,
            errorMessage:
              event.type === "failed" ? event.message : current.errorMessage,
          }));
        });

        const snapshot =
          (await repository.getDocumentRunSnapshot(runId)) ?? lastCompletedSnapshot;
        if (!snapshot || runRequestId !== runRequestIdRef.current) {
          return;
        }

        await saveHistorySnapshot(snapshot, {
          providerModel,
          durationMs: Date.now() - startedAtMs,
        });
        const downloaded = await repository.downloadDocumentRun(runId);
        downloadBlobFile(downloaded.fileName, downloaded.blob);
        setRunUiState({
          runStatus: "completed",
          runProgress: 100,
          runMessage: "说明书生成完成",
          errorMessage: null,
        });
        toast.success(`${downloaded.fileName} 已生成`);
      } catch (error) {
        if (runRequestId !== runRequestIdRef.current) {
          return;
        }
        if (runId && repository.getDocumentRunSnapshot) {
          try {
            const failedSnapshot = await repository.getDocumentRunSnapshot(runId);
            await saveHistorySnapshot(failedSnapshot, {
              providerModel,
              durationMs: Date.now() - startedAtMs,
            });
          } catch {
            // The visible error state below is more useful than a secondary snapshot failure.
          }
        }
        setRunUiState({
          runStatus: "failed",
          runProgress: 100,
          runMessage: null,
          errorMessage: error instanceof Error ? error.message : "说明书生成失败",
        });
        setCurrentRunDiagnostics((current) => ({
          ...current,
          finishedAt: new Date().toISOString(),
          events: [
            ...current.events,
            {
              id: `${new Date().toISOString()}:failed-local-document`,
              at: new Date().toISOString(),
              label: "任务失败",
              detail: error instanceof Error ? error.message : "说明书生成失败",
            },
          ].slice(-80),
        }));
        notifyGenerationFailed(
          error instanceof Error
            ? `说明书生成失败：${error.message}`
            : "说明书生成失败",
        );
      }
    },
    [
      designModels,
      designPlantUml,
      designSvgArtifacts,
      models,
      plantUml,
      repository,
      requirementText,
      rules,
      saveHistorySnapshot,
      svgArtifacts,
    ],
  );

  const generateRequirementsSpec = useCallback(async () => {
    await runDocumentGeneration("requirementsSpec");
  }, [runDocumentGeneration]);

  const generateSoftwareDesignSpec = useCallback(async () => {
    await runDocumentGeneration("softwareDesignSpec");
  }, [runDocumentGeneration]);

  const renderPlantUml = useCallback(
    async (diagram: DiagramType, source: string) => {
      try {
        const rendered = await repository.renderPlantUml(diagram, source);
        setPlantUml((current) => ({ ...current, [diagram]: source }));
        setSvgArtifacts((current) => ({
          ...current,
          [diagram]: {
            diagramKind: diagram,
            svg: rendered.svg,
            renderMeta: rendered.renderMeta,
          },
        }));
        setDiagramErrors((current) => {
          const next = { ...current };
          delete next[diagram];
          return next;
        });
        setGeneratedDiagrams((current) =>
          current.includes(diagram) ? current : [...current, diagram],
        );
      } catch (error) {
        setDiagramErrors((current) => ({
          ...current,
          [diagram]: {
            stage: "render_svg",
            message: error instanceof Error ? error.message : "图源码渲染失败",
          },
        }));
        throw error;
      }
    },
    [repository],
  );

  const generateRules = useCallback(async () => {
    await runGeneration([], { kind: "rules-only" });
  }, [runGeneration]);

  const generateDiagrams = useCallback(
    async (only?: DiagramType[]) => {
      const diagrams = only ?? selectedDiagrams;
      if (diagrams.length === 0) {
        return;
      }

      await runGeneration(
        diagrams,
        only
          ? { kind: "partial-diagrams", diagrams }
          : { kind: "full-diagrams" },
      );
    },
    [runGeneration, selectedDiagrams],
  );

  const generateDesignDiagrams = useCallback(
    async (only?: DesignDiagramType[]) => {
      const diagrams = only ?? selectedDesignDiagrams;
      if (diagrams.length === 0) {
        return;
      }

      await runDesignGeneration(diagrams);
    },
    [runDesignGeneration, selectedDesignDiagrams],
  );

  const generateCodePrototype = useCallback(async (
    mode: "continue" | "regenerate" = "continue",
  ) => {
    await runCodeGeneration(mode);
  }, [runCodeGeneration]);

  const isRulesStale =
    rules.length > 0 &&
    rulesBasedOnTextVersion !== null &&
    rulesBasedOnTextVersion !== textVersion;

  const staleDiagrams = generatedDiagrams.filter(
    (diagram) => (diagramVersions[diagram] ?? -1) !== rulesVersion,
  );

  const generating =
    runUiState.runStatus === "queued" || runUiState.runStatus === "running";

  const value = useMemo<WorkspaceSessionState>(
    () => ({
      requirementText,
      setRequirementText,
      rules,
      addRequirementRule,
      createRequirementRule,
      updateRequirementRule,
      deleteRequirementRule,
      models,
      selectedDiagrams,
      setSelectedDiagrams,
      plantUml,
      svgArtifacts,
      diagramErrors,
      selectedDesignDiagrams,
      setSelectedDesignDiagrams,
      designModels,
      designPlantUml,
      designSvgArtifacts,
      designDiagramErrors,
      codeSpec,
      codeBusinessLogic,
      codeFiles,
      codeEntryFile,
      codeDependencies,
      codeUiMockup,
      codeAgentPlan,
      codeSkills,
      codeSkillDiagnostics,
      codeSkillResourcePlan,
      codeSkillContext,
      codeDiagnostics,
      updateCodeFile,
      generatedDesignDiagrams,
      generatedDiagrams,
      generating,
      runStatus: runUiState.runStatus,
      runProgress: runUiState.runProgress,
      runMessage: runUiState.runMessage,
      errorMessage: runUiState.errorMessage,
      generateRules,
      generateDiagrams,
      generateDesignDiagrams,
      generateCodePrototype,
      generateRequirementsSpec,
      generateSoftwareDesignSpec,
      rulesForDiagram,
      textVersion,
      rulesVersion,
      rulesBasedOnTextVersion,
      diagramVersions,
      isRulesStale,
      staleDiagrams,
      historyItems,
      refreshHistory,
      restoreRunHistory,
      deleteRunHistory,
      clearRunHistory,
      renderPlantUml,
      currentRunDiagnostics,
    }),
    [
      requirementText,
      setRequirementText,
      rules,
      addRequirementRule,
      createRequirementRule,
      updateRequirementRule,
      deleteRequirementRule,
      models,
      selectedDiagrams,
      plantUml,
      svgArtifacts,
      diagramErrors,
      selectedDesignDiagrams,
      designModels,
      designPlantUml,
      designSvgArtifacts,
      designDiagramErrors,
      codeSpec,
      codeBusinessLogic,
      codeFiles,
      codeEntryFile,
      codeDependencies,
      codeUiMockup,
      codeAgentPlan,
      codeSkills,
      codeSkillDiagnostics,
      codeSkillResourcePlan,
      codeSkillContext,
      codeDiagnostics,
      updateCodeFile,
      generatedDesignDiagrams,
      generatedDiagrams,
      generating,
      runUiState,
      generateRules,
      generateDiagrams,
      generateDesignDiagrams,
      generateCodePrototype,
      generateRequirementsSpec,
      generateSoftwareDesignSpec,
      rulesForDiagram,
      textVersion,
      rulesVersion,
      rulesBasedOnTextVersion,
      diagramVersions,
      isRulesStale,
      staleDiagrams,
      historyItems,
      refreshHistory,
      restoreRunHistory,
      deleteRunHistory,
      clearRunHistory,
      renderPlantUml,
      currentRunDiagnostics,
    ],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession() {
  const value = useContext(WorkspaceSessionContext);
  if (!value) {
    throw new Error(
      "useWorkspaceSession must be used within WorkspaceSessionProvider",
    );
  }
  return value;
}
