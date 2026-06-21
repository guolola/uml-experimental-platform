// Wraps run start, repair, render, and provider-test endpoints for workspace repositories.
import type {
  DesignDiagramModelSpec,
  DiagramModelSpec,
  RepairRequirementRuleRequest,
  RepairRequirementRuleResponse,
  RepairRequirementRulesRequest,
  RepairRequirementRulesResponse,
  RenderStructuredModelResponse,
  RenderSvgResponse,
} from "@uml-platform/contracts";
import type { DiagramType } from "../../entities/diagram/model";
import type { ModelCapability } from "../../shared/lib/model-catalog";
import { postJson } from "../api-client";
import { projectHeaders, requireProjectScope, withProjectHeaders } from "./project-scope";
import { runPayloadWithoutUnmanagedProviderSettings } from "./run-payload";
import type {
  ProviderSettingsInput,
  StartCodeRunInput,
  StartDesignRunInput,
  StartDocumentRunInput,
  StartRunInput,
} from "./start-inputs";

export async function repairRequirementRuleRequest(
  input: RepairRequirementRuleRequest,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<RepairRequirementRuleResponse>(
    "/api/runs/requirement-rule-repair",
    runPayloadWithoutUnmanagedProviderSettings({
      ...input,
      projectId: scopedProjectId,
    }),
    {
      errorMessage: "智能修复失败",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function repairRequirementRulesRequest(
  input: RepairRequirementRulesRequest,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<RepairRequirementRulesResponse>(
    "/api/runs/requirement-rule-repairs",
    runPayloadWithoutUnmanagedProviderSettings({
      ...input,
      projectId: scopedProjectId,
    }),
    {
      errorMessage: "批量智能修复失败",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function startRequirementRunRequest(
  input: StartRunInput,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<{ runId: string }>(
    "/api/runs",
    runPayloadWithoutUnmanagedProviderSettings({
      projectId: scopedProjectId,
      selectedDiagrams: input.selectedDiagrams,
      requestedDiagrams: input.requestedDiagrams,
      dependencyDiagrams: input.dependencyDiagrams,
      analysisTargetUseCaseIds: input.analysisTargetUseCaseIds ?? [],
      providerSettings: input.providerSettings,
    }),
    {
      errorMessage: "启动生成失败",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function startDesignRunRequest(
  input: StartDesignRunInput,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<{ runId: string }>(
    "/api/design-runs",
    runPayloadWithoutUnmanagedProviderSettings({
      projectId: scopedProjectId,
      selectedDiagrams: input.selectedDiagrams,
      requestedDiagrams: input.requestedDiagrams,
      providerSettings: input.providerSettings,
    }),
    {
      errorMessage: "启动设计生成失败",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function startCodeRunRequest(
  input: StartCodeRunInput,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<{ runId: string }>(
    "/api/code-runs",
    runPayloadWithoutUnmanagedProviderSettings({
      projectId: scopedProjectId,
      generationMode: input.generationMode,
      providerSettings: input.providerSettings,
    }),
    {
      errorMessage: "启动代码生成失败",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function startDocumentRunRequest(
  input: StartDocumentRunInput,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<{ runId: string }>(
    "/api/document-runs",
    runPayloadWithoutUnmanagedProviderSettings({
      projectId: scopedProjectId,
      documentKind: input.documentKind,
      providerSettings: input.providerSettings,
      useAiText: input.useAiText,
      documentStyle: input.documentStyle,
    }),
    withProjectHeaders(scopedProjectId, {
      errorMessage: "启动说明书生成失败",
    }),
  );
}

export async function renderPlantUmlRequest(
  diagramKind: DiagramType,
  plantUmlSource: string,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<RenderSvgResponse>(
    "/api/render/svg",
    {
      diagramKind,
      plantUmlSource,
    },
    {
      errorMessage: "渲染 PlantUML 失败",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function renderStructuredModelRequest(
  model: DiagramModelSpec | DesignDiagramModelSpec,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<RenderStructuredModelResponse>(
    "/api/render/model",
    { model },
    {
      errorMessage: "重绘结构化模型失败",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function testProviderSettingsRequest(
  providerSettings: ProviderSettingsInput,
) {
  const payload = await postJson<{
    ok?: boolean;
    message?: string;
    capability?: ModelCapability;
  }>("/api/provider/test", providerSettings, {
    errorMessage: "连接测试失败",
  });
  if (!payload.ok || !payload.capability) {
    throw new Error(payload.message ?? "连接测试失败");
  }
  return {
    ok: true,
    message: payload.message ?? "Provider connection ok",
    capability: payload.capability,
  };
}
