// Normalizes higher-level code blueprint artifacts returned by LLM stages.
import { z } from "zod";
import {
  codeBusinessLogicResultSchema,
  codeSkillResourcePlanSchema,
  codeUiBlueprintResultSchema,
  type CodeUiBlueprint,
} from "@uml-platform/contracts";
import { isPlainRecord, parseJson } from "../json/parse-json.js";

function normalizeStringListCandidate(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeStringListCandidate(item))
      .filter((item, index, array) => item.trim().length > 0 && array.indexOf(item) === index);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|[;；]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeRequiredStringCandidate(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeRequiredStringListCandidate(value: unknown, fallback: string[]) {
  const normalized = normalizeStringListCandidate(value)
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function stringifyStructuredPromptValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyStructuredPromptValue(item))
      .filter(Boolean)
      .join("，");
  }
  if (isPlainRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, item]) => {
        const text = stringifyStructuredPromptValue(item);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean);
    return entries.join("；");
  }
  return "";
}

function normalizeCodeThemeCandidate(
  value: unknown,
  fallback: CodeUiBlueprint["theme"],
): CodeUiBlueprint["theme"] {
  if (!isPlainRecord(value)) {
    return fallback;
  }

  const record = value;
  return {
    name: normalizeRequiredStringCandidate(record.name, fallback.name),
    primaryColor: normalizeRequiredStringCandidate(
      record.primaryColor,
      fallback.primaryColor,
    ),
    backgroundColor: normalizeRequiredStringCandidate(
      record.backgroundColor,
      fallback.backgroundColor,
    ),
    surfaceColor: normalizeRequiredStringCandidate(
      record.surfaceColor,
      fallback.surfaceColor,
    ),
    textColor: normalizeRequiredStringCandidate(record.textColor, fallback.textColor),
    accentColor: normalizeRequiredStringCandidate(
      record.accentColor,
      fallback.accentColor,
    ),
    density:
      record.density === "compact" || record.density === "comfortable"
        ? record.density
        : fallback.density,
    tone: normalizeRequiredStringCandidate(record.tone, fallback.tone),
  };
}

function normalizeBusinessLogicStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeBusinessLogicStringArray(item))
      .filter((item) => item.trim().length > 0);
  }
  const text = stringifyStructuredPromptValue(value).trim();
  return text ? [text] : [];
}

export function parseCodeBusinessLogicResult(text: string) {
  const parsed = parseJson<unknown>(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return codeBusinessLogicResultSchema.parse(parsed);
  }

  const object = parsed as Record<string, unknown>;
  const businessLogic = object.businessLogic;
  if (isPlainRecord(businessLogic)) {
    const normalized = businessLogic as Record<string, unknown>;
    normalized.appName = normalizeRequiredStringCandidate(
      normalized.appName,
      "业务原型",
    );
    normalized.domainSummary = normalizeRequiredStringCandidate(
      normalized.domainSummary,
      "根据 UML 设计生成的业务应用原型。",
    );
    normalized.coreWorkflow = normalizeRequiredStringCandidate(
      normalized.coreWorkflow,
      typeof normalized.domainSummary === "string"
        ? normalized.domainSummary
        : "根据核心业务规则完成主要工作流。",
    );
    if (Array.isArray(normalized.businessEntities)) {
      normalized.businessEntities = normalized.businessEntities.map((entity) => {
        if (!isPlainRecord(entity)) return entity;
        const next = { ...entity };
        next.fields = normalizeBusinessLogicStringArray(next.fields);
        next.relationships = normalizeBusinessLogicStringArray(next.relationships);
        return next;
      });
    }
    if (Array.isArray(normalized.stateMachines)) {
      normalized.stateMachines = normalized.stateMachines.map((stateMachine) => {
        if (!isPlainRecord(stateMachine)) return stateMachine;
        const next = { ...stateMachine };
        next.states = normalizeBusinessLogicStringArray(next.states);
        next.transitions = normalizeBusinessLogicStringArray(next.transitions);
        return next;
      });
    }
    normalized.edgeCases = normalizeBusinessLogicStringArray(normalized.edgeCases);
    normalized.frontendOperations = normalizeBusinessLogicStringArray(
      normalized.frontendOperations,
    );
    normalized.plantUmlTraceability = normalizeBusinessLogicStringArray(
      normalized.plantUmlTraceability,
    );
    return codeBusinessLogicResultSchema.parse({
      ...object,
      businessLogic: normalized,
    });
  }
  return codeBusinessLogicResultSchema.parse(parsed);
}

export function parseCodeSkillResourcePlanResult(text: string) {
  const parsed = parseJson<unknown>(text);
  return z.object({
    skillResourcePlan: codeSkillResourcePlanSchema,
  }).parse(parsed);
}

export function parseCodeUiBlueprintResult(
  text: string,
  fallback: CodeUiBlueprint,
) {
  const parsed = parseJson<unknown>(text);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return codeUiBlueprintResultSchema.parse(parsed);
  }

  const object = parsed as Record<string, unknown>;
  const uiBlueprint = object.uiBlueprint;
  if (isPlainRecord(uiBlueprint)) {
    const normalized = uiBlueprint as Record<string, unknown>;
    normalized.theme = normalizeCodeThemeCandidate(normalized.theme, fallback.theme);
    normalized.visualLanguage = normalizeRequiredStringCandidate(
      normalized.visualLanguage,
      fallback.visualLanguage,
    );
    normalized.navigationModel = normalizeRequiredStringCandidate(
      normalized.navigationModel,
      fallback.navigationModel,
    );
    normalized.layoutPrinciples = normalizeRequiredStringListCandidate(
      normalized.layoutPrinciples,
      fallback.layoutPrinciples,
    );
    normalized.componentGuidelines = normalizeRequiredStringListCandidate(
      normalized.componentGuidelines,
      fallback.componentGuidelines,
    );
    normalized.stateGuidelines = normalizeRequiredStringListCandidate(
      normalized.stateGuidelines,
      fallback.stateGuidelines,
    );
    return codeUiBlueprintResultSchema.parse({
      ...object,
      uiBlueprint: normalized,
    });
  }

  return codeUiBlueprintResultSchema.parse(parsed);
}
