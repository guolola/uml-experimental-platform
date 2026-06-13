// Keeps the latest generation inputs available to async run callbacks.
import { useEffect, useRef } from "react";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

interface LatestGenerationInput {
  codeEditVersion: number;
  codeFiles: Record<string, string>;
  designModelTraceability: WorkspaceRecord["designModelTraceability"];
  designModels: WorkspaceRecord["designModels"];
  models: WorkspaceRecord["models"];
  requirementModelTraceability: WorkspaceRecord["requirementModelTraceability"];
  requirementText: string;
  rules: RequirementRule[];
}

export function useLatestGenerationInputRef(input: LatestGenerationInput) {
  const latestInputRef = useRef(input);
  const {
    codeEditVersion,
    codeFiles,
    designModelTraceability,
    designModels,
    models,
    requirementModelTraceability,
    requirementText,
    rules,
  } = input;

  useEffect(() => {
    latestInputRef.current = {
      codeEditVersion,
      codeFiles,
      designModelTraceability,
      designModels,
      models,
      requirementModelTraceability,
      requirementText,
      rules,
    };
  }, [
    codeEditVersion,
    codeFiles,
    designModelTraceability,
    designModels,
    models,
    requirementModelTraceability,
    requirementText,
    rules,
  ]);

  return latestInputRef;
}
