// Orchestrates the code generation run from business analysis through prototype repair.

import {
  artifactReadyRunEventSchema,
  codeAgentPlanResultSchema,
  codeAppBlueprintResultSchema,
  codeBusinessLogicResultSchema,
  codeFilePlanResultSchema,
  codeSkillDiagnosticsSchema,
  codeSkillContextSchema,
  codeSkillResourceDiscoveryPlanSchema,
  codeSkillResourcePlanSchema,
  codeSkillResourcePreviewResultSchema,
  codeVisualDirectionResultSchema,
  completedRunEventSchema,
  loadedCodeSkillSchema,
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type CodeSkillResourceDiscoveryPlan,
  type CodeSkillResourcePlan,
  type CodeRunSnapshot,
  type CodeVisualDirection,
  type ImageProviderSettings,
  type ProviderSettings,
  type StartCodeRunRequest,
  type RunStage,
} from "@uml-platform/contracts";
import {
  buildAnalyzeCodeBusinessLogicPrompt,
  buildGenerateCodeAgentPlanPrompt,
  buildGenerateCodeAppBlueprintPrompt,
  buildGenerateCodeFilePlanPrompt,
  buildGenerateCodeSkillResourceDiscoveryPrompt,
  buildGenerateCodeSkillResourcePlanPrompt,
  buildGenerateCodeVisualDirectionPrompt,
} from "@uml-platform/prompts";
import { type ImageGenerationClient, type LlmTransport } from "../../llm.js";
import {
  ensureRequiredWebReactSkillResources,
  fallbackCodeSkillResourceDiscoveryPlan,
  fallbackCodeSkillResourcePlan,
  fallbackCodeVisualDirection,
  formatWebDesignSkillForPrompt,
  getCodeSkillRuntimeStatus,
  loadWebDesignSkill,
  resolveCodeSkillContext,
  resolveCodeSkillResourcePreviews,
  toWebDesignSkillSelection,
} from "../../code-skills.js";
import {
  parseCodeBusinessLogicResult,
  parseCodeSkillResourcePlanResult,
  parseCodeUiBlueprintResult,
} from "../../normalizers/code/code-blueprint-normalizer.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";
import { z } from "zod";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { attachEvidencePackage } from "../evidence/evidence-package.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import { collectStructuredResult } from "./shared/structured-output.js";
import { appendCodeTrace } from "./shared/trace-events.js";
import {
  getGenerateCodeAgentPlanResponseFormat,
  getGenerateCodeAppBlueprintResponseFormat,
  getGenerateCodeBusinessLogicResponseFormat,
  getGenerateCodeFilePlanResponseFormat,
  getGenerateCodeSkillResourceDiscoveryResponseFormat,
  getGenerateCodeSkillResourcePlanResponseFormat,
  getGenerateCodeVisualDirectionResponseFormat,
} from "../../adapters/llm/response-formats/index.js";
import { addCodeDiagnostic, recordCodeQualityDiagnostics } from "./code/code-run-diagnostics.js";
import { applyCodeOperation, emitCodeFileChanged } from "./code/code-file-mutations.js";
import { generateCodeFileOperationsWithRepair } from "./code/code-file-operations.js";
import {
  buildCodeContext,
  createStableCodeScaffold,
  hashCodeContext,
} from "./code/code-context.js";
import {
  analyzeCodeUiMockup,
  generateCodeUiIr,
  generateCodeUiMockup,
  verifyCodeUiFidelity,
} from "./code/code-ui-generation.js";
import {
  appendCodeQualityIssue,
  auditCodePrototypeQuality,
  buildCodeGenerationSpecFromBusinessLogic,
  ensureRequiredPrototypeFiles,
  upsertBusinessContextMarkdown,
  validatePrototypeFileContents,
  verifyRenderedPreviewStructure,
} from "./code/code-quality-audit.js";
import { buildCodeBusinessAssertionResults } from "./code/code-business-assertions.js";
import {
  assertRequirementBaselineAllowsDownstream,
  buildRequirementBaseline,
} from "../baselines/requirement-baseline.js";
import {
  assertTrustedChainAllowsCompletion,
  buildCodeStageTrustedChain,
} from "../traceability/trusted-chain-traceability.js";

const MAX_UI_FIDELITY_REPAIR_ROUNDS = 2;
const MAX_BUSINESS_LOGIC_PARSE_ATTEMPTS = 3;

// route -> pipeline -> record store contract: routes enqueue a record, this pipeline mutates its snapshot and emits run events.
export async function runCodeStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
) {
  const snapshot = record.snapshot as CodeRunSnapshot;
  throwIfRunCancelled(record);
  if (!snapshot.requirementBaseline && snapshot.rules.length > 0) {
    snapshot.requirementBaseline = buildRequirementBaseline({
      runId: snapshot.runId,
      requirementText: snapshot.requirementText,
      rules: snapshot.rules,
    });
  }
  assertRequirementBaselineAllowsDownstream(snapshot.requirementBaseline);

  const updateStage = (stage: RunStage, message?: string) => {
    throwIfRunCancelled(record);
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  const dependencies = {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.487.0",
    "@radix-ui/react-checkbox": "^1.1.4",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slot": "^1.1.2",
    "@radix-ui/react-switch": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.3",
    "class-variance-authority": "^0.7.1",
    clsx: "^2.1.1",
    "tailwind-merge": "^3.2.0",
    ...snapshot.dependencies,
  };
  snapshot.dependencies = dependencies;
  snapshot.entryFile = snapshot.entryFile ?? "/src/App.tsx";

  let codeContext = buildCodeContext(snapshot);
  const codeContextHash = hashCodeContext(codeContext);
  snapshot.codeContextHash = codeContextHash;

  updateStage("analyze_code_business_logic", "正在从需求、设计模型和 PlantUML 提取业务逻辑");
  const businessLogicMessages = createMessages(
    buildAnalyzeCodeBusinessLogicPrompt(
      snapshot.requirementText,
      snapshot.rules,
      snapshot.designModels,
      snapshot.designPlantUml,
    ),
  );
  let businessLogicResult: ReturnType<typeof parseCodeBusinessLogicResult> | null = null;
  let businessLogicError: unknown = null;
  for (let attempt = 1; attempt <= MAX_BUSINESS_LOGIC_PARSE_ATTEMPTS; attempt += 1) {
    try {
      businessLogicResult = await collectStructuredResult(
        llmTransport,
        providerSettings,
        businessLogicMessages,
        "analyze_code_business_logic",
        (chunk) => {
          emitEvent(
            record,
            llmChunkRunEventSchema.parse({
              type: "llm_chunk",
              stage: "analyze_code_business_logic",
              chunk,
            }),
          );
        },
        parseCodeBusinessLogicResult,
        getGenerateCodeBusinessLogicResponseFormat(providerSettings.model),
        attempt,
      );
      businessLogicError = null;
      break;
    } catch (error) {
      throwIfRunCancelled(record);
      businessLogicError = error;
      if (attempt >= MAX_BUSINESS_LOGIC_PARSE_ATTEMPTS) break;
      addCodeDiagnostic(
        snapshot,
        "analyze_code_business_logic",
        `业务逻辑结构化输出解析失败，正在重试（${attempt}/${MAX_BUSINESS_LOGIC_PARSE_ATTEMPTS}）：${formatParseError(error)}`,
      );
      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "analyze_code_business_logic",
          progress: stageProgressValue("analyze_code_business_logic"),
          message: `业务逻辑结构化输出解析失败，正在重试（${attempt}/${MAX_BUSINESS_LOGIC_PARSE_ATTEMPTS}）`,
        }),
      );
    }
  }
  if (!businessLogicResult) {
    throw businessLogicError ?? new Error("Code business logic structured output could not be parsed");
  }
  throwIfRunCancelled(record);
  const businessLogic = businessLogicResult.businessLogic;
  snapshot.businessLogic = businessLogic;
  addCodeDiagnostic(
    snapshot,
    "analyze_code_business_logic",
    `已抽取 ${businessLogic.pageFlows.length} 个页面流程和 ${businessLogic.frontendOperations.length} 个前端操作`,
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "analyze_code_business_logic",
      artifactKind: "businessLogic",
      businessLogic,
    }),
  );

  codeContext = buildCodeContext(snapshot);
  updateStage("plan_code_ui", "正在规划界面方案");
  const loadedSkillResult = loadWebDesignSkill();
  const loadedCodeSkill = loadedCodeSkillSchema.parse(loadedSkillResult.skill);
  snapshot.loadedCodeSkill = loadedCodeSkill;
  snapshot.selectedCodeSkills = [toWebDesignSkillSelection(loadedCodeSkill)];
  snapshot.skillDiagnostics = loadedSkillResult.diagnostics.map((diagnostic) =>
    codeSkillDiagnosticsSchema.parse(diagnostic),
  );
  addCodeDiagnostic(
    snapshot,
    "plan_code_ui",
    `已加载前端设计执行器，发现 ${loadedCodeSkill.fileManifest.length} 个可用资源文件`,
  );
  let visualDirection: CodeVisualDirection;
  try {
    const visualDirectionResult = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMessages(buildGenerateCodeVisualDirectionPrompt(businessLogic, loadedCodeSkill)),
      "plan_code_ui",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "plan_code_ui",
            chunk,
          }),
        );
      },
      (text) => codeVisualDirectionResultSchema.parse(parseJson(text)),
      getGenerateCodeVisualDirectionResponseFormat(providerSettings.model),
    );
    throwIfRunCancelled(record);
    visualDirection = visualDirectionResult.visualDirection;
  } catch (error) {
    throwIfRunCancelled(record);
    visualDirection = fallbackCodeVisualDirection(businessLogic);
    snapshot.skillDiagnostics.push(
      codeSkillDiagnosticsSchema.parse({
        level: "warning",
        source: loadedCodeSkill.location,
        message: `visualDirection 生成失败，已使用默认视觉方向：${formatParseError(error)}`,
      }),
    );
  }
  snapshot.visualDirection = visualDirection;
  addCodeDiagnostic(
    snapshot,
    "plan_code_ui",
    `已形成视觉方向：${visualDirection.promptBrief}`,
  );

  let skillResourceDiscoveryPlan: CodeSkillResourceDiscoveryPlan;
  try {
    const discoveryResult = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMessages(
        buildGenerateCodeSkillResourceDiscoveryPrompt(
          businessLogic,
          loadedCodeSkill,
          visualDirection,
        ),
      ),
      "plan_code_ui",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "plan_code_ui",
            chunk,
          }),
        );
      },
      (text) =>
        z
          .object({ skillResourceDiscoveryPlan: codeSkillResourceDiscoveryPlanSchema })
          .parse(parseJson(text)),
      getGenerateCodeSkillResourceDiscoveryResponseFormat(providerSettings.model),
    );
    throwIfRunCancelled(record);
    skillResourceDiscoveryPlan = codeSkillResourceDiscoveryPlanSchema.parse(
      discoveryResult.skillResourceDiscoveryPlan,
    );
  } catch (error) {
    throwIfRunCancelled(record);
    skillResourceDiscoveryPlan = fallbackCodeSkillResourceDiscoveryPlan(loadedCodeSkill);
    snapshot.skillDiagnostics.push(
      codeSkillDiagnosticsSchema.parse({
        level: "warning",
        source: loadedCodeSkill.location,
        message: `skillResourceDiscoveryPlan 生成失败，已使用默认资源预览计划：${formatParseError(error)}`,
      }),
    );
  }
  snapshot.skillResourceDiscoveryPlan = skillResourceDiscoveryPlan;
  const skillResourcePreviews = codeSkillResourcePreviewResultSchema.parse(
    resolveCodeSkillResourcePreviews(
      loadedCodeSkill,
      skillResourceDiscoveryPlan,
      visualDirection.promptBrief,
    ),
  );
  snapshot.skillResourcePreviews = skillResourcePreviews;
  snapshot.skillDiagnostics = [
    ...snapshot.skillDiagnostics,
    ...skillResourcePreviews.diagnostics.map((diagnostic) =>
      codeSkillDiagnosticsSchema.parse(diagnostic),
    ),
  ];
  addCodeDiagnostic(
    snapshot,
    "plan_code_ui",
    `已预览 ${skillResourcePreviews.previews.length} 个设计资源，后续将基于表头和样例行选择正式查询`,
  );

  let skillResourcePlan: CodeSkillResourcePlan;
  try {
    const skillResourcePlanResult = await collectStructuredResult(
      llmTransport,
      providerSettings,
      createMessages(
        buildGenerateCodeSkillResourcePlanPrompt(
          businessLogic,
          loadedCodeSkill,
          visualDirection,
          skillResourcePreviews,
        ),
      ),
      "plan_code_ui",
      (chunk) => {
        emitEvent(
          record,
          llmChunkRunEventSchema.parse({
            type: "llm_chunk",
            stage: "plan_code_ui",
            chunk,
          }),
        );
      },
      parseCodeSkillResourcePlanResult,
      getGenerateCodeSkillResourcePlanResponseFormat(providerSettings.model),
    );
    throwIfRunCancelled(record);
    skillResourcePlan = codeSkillResourcePlanSchema.parse(
      skillResourcePlanResult.skillResourcePlan,
    );
  } catch (error) {
    throwIfRunCancelled(record);
    skillResourcePlan = fallbackCodeSkillResourcePlan(loadedCodeSkill, businessLogic);
    snapshot.skillDiagnostics.push(
      codeSkillDiagnosticsSchema.parse({
        level: "warning",
        source: loadedCodeSkill.location,
        message: `skillResourcePlan 生成失败，已使用最小默认计划：${formatParseError(error)}`,
      }),
    );
  }
  skillResourcePlan = ensureRequiredWebReactSkillResources(
    loadedCodeSkill,
    businessLogic,
    skillResourcePlan,
  );
  snapshot.skillResourcePlan = skillResourcePlan;
  addCodeDiagnostic(
    snapshot,
    "plan_code_ui",
    `前端设计执行器声明 ${skillResourcePlan.requests.length} 个设计资源查询`,
  );
  const skillContext = codeSkillContextSchema.parse(
    await resolveCodeSkillContext(loadedCodeSkill, skillResourcePlan),
  );
  throwIfRunCancelled(record);
  snapshot.codeSkillContext = skillContext;
  snapshot.skillDiagnostics = [
    ...snapshot.skillDiagnostics,
    ...skillContext.diagnostics.map((diagnostic) =>
      codeSkillDiagnosticsSchema.parse(diagnostic),
    ),
  ];
  const codeSkillInstructions = formatWebDesignSkillForPrompt(
    loadedCodeSkill,
    skillResourcePlan,
    skillContext,
  );
  addCodeDiagnostic(
    snapshot,
    "plan_code_ui",
    `前端设计执行器已接管界面主题、布局、组件和视觉方案规划，已执行 ${skillContext.actionResults.length} 个资源查询`,
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "plan_code_ui",
      artifactKind: "codeSkills",
      codeSkills: snapshot.selectedCodeSkills,
      skillDiagnostics: snapshot.skillDiagnostics,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "plan_code_ui",
      artifactKind: "visualDirection",
      visualDirection,
      skillDiagnostics: snapshot.skillDiagnostics,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "plan_code_ui",
      artifactKind: "skillResourceDiscoveryPlan",
      skillResourceDiscoveryPlan,
      skillDiagnostics: snapshot.skillDiagnostics,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "plan_code_ui",
      artifactKind: "skillResourcePreviews",
      skillResourcePreviews,
      skillDiagnostics: snapshot.skillDiagnostics,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "plan_code_ui",
      artifactKind: "skillResourcePlan",
      skillResourcePlan,
      skillDiagnostics: snapshot.skillDiagnostics,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "plan_code_ui",
      artifactKind: "codeSkillContext",
      codeSkillContext: skillContext,
      skillDiagnostics: snapshot.skillDiagnostics,
    }),
  );

  codeContext = buildCodeContext(snapshot);
  snapshot.uiBlueprint = null;
  snapshot.spec = buildCodeGenerationSpecFromBusinessLogic(businessLogic, null);
  addCodeDiagnostic(
    snapshot,
    "plan_code_ui",
    "已形成业务逻辑驱动的代码生成规格，界面方案由前端设计执行器在代码生成阶段推导",
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "plan_code_ui",
      artifactKind: "codeSpec",
    }),
  );

  updateStage("generate_code_files", "正在写入可运行骨架文件");
  const scaffold = createStableCodeScaffold();
  for (const [path, content] of Object.entries(scaffold)) {
    if (!snapshot.files[path]) {
      emitCodeFileChanged(record, snapshot, path, content, "写入稳定 Sandpack 骨架");
    }
  }

  codeContext = buildCodeContext(snapshot);
  updateStage("generate_code_files", "正在生成前端原型代码");
  const operationsResult = await generateCodeFileOperationsWithRepair(
    record,
    providerSettings,
    llmTransport,
    codeContext,
    snapshot.files,
    {
      businessLogic,
      uiBlueprint: null,
      loadedCodeSkill,
      visualDirection,
      skillResourceDiscoveryPlan,
      skillResourcePreviews,
      skillResourcePlan,
      codeSkillContext: skillContext,
      selectedCodeSkills: snapshot.selectedCodeSkills,
      codeSkillInstructions,
    },
    "generate_code_files",
  );
  throwIfRunCancelled(record);

  let generatedFileChangeCount = 0;
  for (const operation of operationsResult.operations) {
    throwIfRunCancelled(record);
    if (applyCodeOperation(record, snapshot, operation)) {
      generatedFileChangeCount += 1;
    }
  }
  upsertBusinessContextMarkdown(record, snapshot);

  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_code_files",
      artifactKind: "codeFiles",
    }),
  );

  updateStage("audit_code_quality", "正在检查页面数量、文件结构和实现质量");
  let qualityDiagnostic = auditCodePrototypeQuality(snapshot);
  if (generatedFileChangeCount === 0) {
    qualityDiagnostic = appendCodeQualityIssue(qualityDiagnostic, {
      severity: "error",
      message: "前端设计执行器没有产生任何实质文件变更，不能将稳定骨架视为生成成功",
    });
  }
  recordCodeQualityDiagnostics(snapshot, qualityDiagnostic);
  if (!qualityDiagnostic.passed) {
    updateStage("repair_code_files", "正在根据质量问题补齐原型代码");
    const repairIssues = qualityDiagnostic.issues.map((issue) =>
      `${issue.path ? `${issue.path}：` : ""}${issue.message}`,
    );
    const repairOperations = await generateCodeFileOperationsWithRepair(
      record,
      providerSettings,
      llmTransport,
      buildCodeContext(snapshot),
      snapshot.files,
      {
        businessLogic,
        uiBlueprint: null,
        loadedCodeSkill,
        visualDirection,
        skillResourceDiscoveryPlan,
        skillResourcePreviews,
        skillResourcePlan,
        codeSkillContext: skillContext,
        qualityIssues: repairIssues,
        selectedCodeSkills: snapshot.selectedCodeSkills,
        codeSkillInstructions,
      },
      "repair_code_files",
    );
    throwIfRunCancelled(record);
    for (const operation of repairOperations.operations) {
      throwIfRunCancelled(record);
      applyCodeOperation(record, snapshot, operation);
    }
    upsertBusinessContextMarkdown(record, snapshot);
    updateStage("audit_code_quality", "正在复查修复后的原型质量");
    qualityDiagnostic = auditCodePrototypeQuality(snapshot);
    recordCodeQualityDiagnostics(snapshot, qualityDiagnostic);
  }

  updateStage("verify_code_ui_fidelity", "正在检查原型是否覆盖业务逻辑和界面方案");
  let fidelityReport = await verifyCodeUiFidelity(
    record,
    snapshot,
    providerSettings,
    llmTransport,
  );
  throwIfRunCancelled(record);
  let repairRoundsRun = 0;
  let repairStopReason = fidelityReport.passed
    ? "还原度检查已通过"
    : "还原度检查未通过且没有可执行修复建议";
  for (
    let repairRound = 1;
    repairRound <= MAX_UI_FIDELITY_REPAIR_ROUNDS &&
    !fidelityReport.passed &&
    fidelityReport.repairSuggestions.length > 0;
    repairRound += 1
  ) {
    updateStage(
      "repair_code_files",
      `正在根据业务/界面覆盖检查修复原型（第 ${repairRound}/${MAX_UI_FIDELITY_REPAIR_ROUNDS} 轮）`,
    );
    const changedBeforeRepair = snapshot.changedFileCount;
    const repairOperations = await generateCodeFileOperationsWithRepair(
      record,
      providerSettings,
      llmTransport,
      buildCodeContext(snapshot),
      snapshot.files,
      {
        businessLogic,
        uiBlueprint: null,
        loadedCodeSkill,
        visualDirection,
        skillResourceDiscoveryPlan,
        skillResourcePreviews,
        skillResourcePlan,
        codeSkillContext: skillContext,
        qualityIssues: [
          ...fidelityReport.repairSuggestions,
          ...qualityDiagnostic.issues.map((issue) =>
            `${issue.path ? `${issue.path}：` : ""}${issue.message}`,
          ),
        ],
        selectedCodeSkills: snapshot.selectedCodeSkills,
        codeSkillInstructions,
      },
      "repair_code_files",
    );
    throwIfRunCancelled(record);
    for (const operation of repairOperations.operations) {
      throwIfRunCancelled(record);
      applyCodeOperation(record, snapshot, operation);
    }
    upsertBusinessContextMarkdown(record, snapshot);
    repairRoundsRun = repairRound;

    if (snapshot.changedFileCount === changedBeforeRepair) {
      repairStopReason = "本轮还原度修复没有产生实质文件变化";
      break;
    }

    updateStage("audit_code_quality", "正在复查还原修复后的原型质量");
    qualityDiagnostic = auditCodePrototypeQuality(snapshot);
    recordCodeQualityDiagnostics(snapshot, qualityDiagnostic);
    if (!qualityDiagnostic.passed) {
      repairStopReason = "还原修复后仍存在阻塞性质量问题";
      break;
    }

    updateStage("verify_code_ui_fidelity", "正在复查原型是否覆盖业务逻辑和界面方案");
    fidelityReport = await verifyCodeUiFidelity(
      record,
      snapshot,
      providerSettings,
      llmTransport,
    );
    throwIfRunCancelled(record);
    repairStopReason = fidelityReport.passed
      ? "还原度检查已通过"
      : "达到还原修复轮次上限";
  }
  snapshot.repairLoopSummary = {
    maxRounds: MAX_UI_FIDELITY_REPAIR_ROUNDS,
    roundsRun: repairRoundsRun,
    stopReason: repairStopReason,
    repaired: repairRoundsRun > 0,
  };

  updateStage("verify_code_rendered_preview", "正在进行结构化预览验证");
  const visualDiffReport = verifyRenderedPreviewStructure(snapshot);
  snapshot.visualDiffReport = visualDiffReport;
  addCodeDiagnostic(snapshot, "verify_code_rendered_preview", visualDiffReport.summary);
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "verify_code_rendered_preview",
      artifactKind: "visualDiffReport",
      visualDiffReport,
    }),
  );

  updateStage("verify_code_preview", "正在检查预览入口和必要文件");
  ensureRequiredPrototypeFiles(record, snapshot, scaffold);
  validatePrototypeFileContents(snapshot);
  if (!snapshot.files[snapshot.entryFile ?? ""]) {
    snapshot.entryFile = "/src/App.tsx";
    addCodeDiagnostic(snapshot, "verify_code_preview", "入口文件已回退到 /src/App.tsx");
  }
  addCodeDiagnostic(
    snapshot,
    "verify_code_preview",
    "已生成 Sandpack 可预览文件，浏览器侧会继续编译并显示错误态",
  );
  if (snapshot.generationMode === "continue" && snapshot.changedFileCount === 0) {
    addCodeDiagnostic(snapshot, "verify_code_preview", "本次未产生文件变更");
  }

  updateStage("verify_code_business_assertions", "正在验证需求绑定的业务断言");
  const businessAssertionResults = buildCodeBusinessAssertionResults({
    runId: snapshot.runId,
    baseline: snapshot.requirementBaseline,
    businessLogic,
    files: snapshot.files,
  });
  snapshot.businessAssertionResults = businessAssertionResults;
  addCodeDiagnostic(
    snapshot,
    "verify_code_business_assertions",
    businessAssertionResults.passed
      ? `业务断言通过：${businessAssertionResults.assertions.length} 条需求绑定断言已验证`
      : `业务断言失败：${businessAssertionResults.blockingFailureIds.length} 条阻断性断言未通过`,
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "verify_code_business_assertions",
      artifactKind: "businessAssertionResults",
      businessAssertionResults,
    }),
  );

  const trustedChain = buildCodeStageTrustedChain({
    runId: snapshot.runId,
    baseline: snapshot.requirementBaseline,
    files: snapshot.files,
    businessAssertionResults,
  });
  snapshot.coverageMatrix = trustedChain.coverageMatrix;
  snapshot.traceabilityMatrix = trustedChain.traceabilityMatrix;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "verify_code_preview",
      artifactKind: "coverageMatrix",
      coverageMatrix: trustedChain.coverageMatrix,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "verify_code_preview",
      artifactKind: "traceabilityMatrix",
      traceabilityMatrix: trustedChain.traceabilityMatrix,
    }),
  );
  assertTrustedChainAllowsCompletion(trustedChain);

  throwIfRunCancelled(record);
  const evidencePackage = attachEvidencePackage(snapshot);
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "verify_code_preview",
      artifactKind: "evidencePackage",
      evidencePackage,
    }),
  );
  snapshot.status = "completed";
  snapshot.error = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}
