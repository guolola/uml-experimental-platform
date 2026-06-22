// Owns PlantUML SVG rendering with LLM-assisted source repair.
import {
  llmChunkRunEventSchema,
  repairPlantUmlResultSchema,
  renderSvgResponseSchema,
  stageProgressRunEventSchema,
  type DesignDiagramModelSpec,
  type DesignSvgArtifact,
  type DiagramModelSpec,
  type ProviderSettings,
  type RepairPlantUmlResult,
  type SvgArtifact,
} from "@uml-platform/contracts";
import { JSON_ONLY_SYSTEM_PROMPT, buildRepairPlantUmlPrompt } from "@uml-platform/prompts";
import { type ChatMessage, type LlmTransport } from "../../../llm.js";
import { getRepairPlantUmlResponseFormat } from "../../../adapters/llm/response-formats/index.js";
import { type AnyPlantUmlArtifact, type RenderClient } from "../../../adapters/render/render-client.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { formatParseError, parseJson } from "../../../normalizers/json/parse-json.js";
import { stageProgressValue } from "../shared/pipeline-events.js";
import { collectTextResult, logFailedStructuredOutput } from "../shared/structured-output.js";
import {
  appendDesignTrace,
  appendRequirementTrace,
  designDiagramKindFromArtifact,
  requirementDiagramKindFromArtifact,
} from "../shared/trace-events.js";

const MAX_PLANTUML_REPAIR_ATTEMPTS = 2;
type AnyDiagramModelSpec = DiagramModelSpec | DesignDiagramModelSpec;
type AnySvgArtifact = SvgArtifact | DesignSvgArtifact;

function createMessages(prompt: string): ChatMessage[] {
  return [
    { role: "system", content: JSON_ONLY_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isPlaceholderSvg(svg: string) {
  return /Welcome to PlantUML!/i.test(svg);
}

function stripPlantUmlTextSizingAttributes(svg: string) {
  return svg.replace(/\s(?:textLength|lengthAdjust)=(?:"[^"]*"|'[^']*')/g, "");
}

// PlantUML render repair retries failed renders with an LLM patch while preserving trace events.
export async function renderArtifactWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
  model: AnyDiagramModelSpec,
  artifact: AnyPlantUmlArtifact,
): Promise<
  | {
      status: "success";
      artifact: AnyPlantUmlArtifact;
      svgArtifact: AnySvgArtifact;
    }
  | {
      status: "failed";
      artifact: AnyPlantUmlArtifact;
      errorMessage: string;
    }
> {
  let currentArtifact = artifact;
  let lastErrorMessage = "";
  const responseFormat = getRepairPlantUmlResponseFormat(providerSettings);

  for (let attempt = 0; attempt <= MAX_PLANTUML_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      const rendered = renderSvgResponseSchema.parse(await renderClient(currentArtifact));

      if (isPlaceholderSvg(rendered.svg)) {
        throw new Error("PlantUML returned placeholder SVG, source may be invalid");
      }
      const normalizedSvg = stripPlantUmlTextSizingAttributes(rendered.svg);

      return {
        status: "success",
        artifact: currentArtifact,
        svgArtifact: {
          modelId: "modelId" in currentArtifact ? currentArtifact.modelId : undefined,
          diagramKind: currentArtifact.diagramKind,
          svg: normalizedSvg,
          renderMeta: rendered.renderMeta,
        } as AnySvgArtifact,
      };
    } catch (error) {
      lastErrorMessage = getErrorMessage(error);
      appendDesignTrace(record, {
        stage: "render_svg",
        attempt: attempt + 1,
        kind: "render_error",
        diagramKind: designDiagramKindFromArtifact(currentArtifact),
        plantUmlSource: currentArtifact.source,
        errorMessage: lastErrorMessage,
      });
      appendRequirementTrace(record, {
        stage: "render_svg",
        attempt: attempt + 1,
        kind: "render_error",
        diagramKind: requirementDiagramKindFromArtifact(currentArtifact),
        plantUmlSource: currentArtifact.source,
        errorMessage: lastErrorMessage,
      });

      if (attempt === MAX_PLANTUML_REPAIR_ATTEMPTS) {
        return {
          status: "failed",
          artifact: currentArtifact,
          errorMessage: `PlantUML repair failed for ${currentArtifact.diagramKind}: ${lastErrorMessage}`,
        };
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "render_svg",
          progress: stageProgressValue("render_svg"),
          message: `PlantUML 编译失败，正在尝试修复（${attempt + 1}/${MAX_PLANTUML_REPAIR_ATTEMPTS}）`,
          diagramKind: currentArtifact.diagramKind,
          modelId:
            "modelId" in currentArtifact ? currentArtifact.modelId : undefined,
          subtaskId:
            "modelId" in currentArtifact
              ? currentArtifact.modelId ?? currentArtifact.diagramKind
              : currentArtifact.diagramKind,
          subtaskStatus: "repairing",
        }),
      );

      const repairOutput = await collectTextResult(
        llmTransport,
        providerSettings,
        createMessages(
          buildRepairPlantUmlPrompt(
            currentArtifact.diagramKind,
            model,
            currentArtifact.source,
            lastErrorMessage,
          ),
        ),
        (chunk) => {
          emitEvent(
            record,
            llmChunkRunEventSchema.parse({
              type: "llm_chunk",
              stage: "render_svg",
              chunk,
            }),
          );
        },
        responseFormat,
      );
      appendDesignTrace(record, {
        stage: "render_svg",
        attempt: attempt + 1,
        kind: "repair_output",
        diagramKind: designDiagramKindFromArtifact(currentArtifact),
        rawOutput: repairOutput,
      });
      appendRequirementTrace(record, {
        stage: "render_svg",
        attempt: attempt + 1,
        kind: "repair_output",
        diagramKind: requirementDiagramKindFromArtifact(currentArtifact),
        rawOutput: repairOutput,
      });

      let repairResult: RepairPlantUmlResult;
      try {
        repairResult = repairPlantUmlResultSchema.parse(parseJson(repairOutput));
      } catch (repairError) {
        logFailedStructuredOutput(
          "render_svg",
          providerSettings.model,
          repairError,
          repairOutput,
          attempt + 1,
        );
        appendDesignTrace(record, {
          stage: "render_svg",
          attempt: attempt + 1,
          kind: "parse_error",
          diagramKind: designDiagramKindFromArtifact(currentArtifact),
          rawOutput: repairOutput,
          errorMessage: formatParseError(repairError),
        });
        appendRequirementTrace(record, {
          stage: "render_svg",
          attempt: attempt + 1,
          kind: "parse_error",
          diagramKind: requirementDiagramKindFromArtifact(currentArtifact),
          rawOutput: repairOutput,
          errorMessage: formatParseError(repairError),
        });
        throw repairError;
      }

      currentArtifact = {
        ...currentArtifact,
        source: repairResult.source,
      };
      appendDesignTrace(record, {
        stage: "render_svg",
        attempt: attempt + 1,
        kind: "repaired_plantuml",
        diagramKind: designDiagramKindFromArtifact(currentArtifact),
        plantUmlSource: currentArtifact.source,
      });
      appendRequirementTrace(record, {
        stage: "render_svg",
        attempt: attempt + 1,
        kind: "repaired_plantuml",
        diagramKind: requirementDiagramKindFromArtifact(currentArtifact),
        plantUmlSource: currentArtifact.source,
      });
    }
  }

  return {
    status: "failed",
    artifact: currentArtifact,
    errorMessage: `PlantUML repair failed for ${artifact.diagramKind}: ${lastErrorMessage}`,
  };
}
