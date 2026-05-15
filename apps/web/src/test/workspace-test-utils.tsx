import type { ReactNode } from "react";
import { ThemeProvider } from "../app/providers/theme-provider";
import type { RunSnapshot } from "@uml-platform/contracts";
import type { RequirementRule } from "../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../entities/workspace/model";
import { WorkspaceShellProvider } from "../features/workspace-shell/state";
import { WorkspaceSessionProvider } from "../features/workspace-session/state";
import { WorkspaceRepositoryProvider } from "../services/workspace-repository";
import type { WorkspaceRepository } from "../services/workspace-repository";
import type { DiagramType } from "../entities/diagram/model";
import { USER_SETTINGS_STORAGE_KEY } from "../shared/lib/user-settings";

export function createWorkspaceRecord(
  overrides: Partial<WorkspaceRecord> = {},
): WorkspaceRecord {
  return {
    id: "workspace-test",
    name: "Test Workspace",
    requirementText: "",
    selectedDiagramTypes: [],
    rules: [],
    models: {},
    generatedDiagramTypes: [],
    plantUml: {},
    svgArtifacts: {},
    diagramErrors: {},
    selectedDesignDiagramTypes: [],
    designModels: {},
    generatedDesignDiagramTypes: [],
    designPlantUml: {},
    designSvgArtifacts: {},
    designDiagramErrors: {},
    codeSpec: null,
    codeFiles: {},
    codeEntryFile: null,
    codeDependencies: {},
    codeUiMockup: null,
    codeAgentPlan: [],
    codeDiagnostics: [],
    rulesVersion: 0,
    rulesBasedOnTextVersion: null,
    diagramVersions: {},
    currentStage: null,
    runStatus: "idle",
    runProgress: 0,
    runMessage: null,
    errorMessage: null,
    ...overrides,
  };
}

export function createRule(
  overrides: Partial<RequirementRule> = {},
): RequirementRule {
  return {
    id: "r1",
    category: "业务规则",
    text: "用户必须登录后才能访问主要功能。",
    relatedDiagrams: ["usecase"],
    ...overrides,
  };
}

export function createRunSnapshot(
  overrides: Partial<RunSnapshot> = {},
): RunSnapshot {
  return {
    runId: "run-test",
    requirementText: "",
    selectedDiagrams: [],
    rules: [],
    models: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    currentStage: "render_svg",
    status: "completed",
    errorMessage: null,
    ...overrides,
  };
}

export function withWorkspaceProviders(
  children: ReactNode,
  repository?: WorkspaceRepository,
) {
  if (!localStorage.getItem(USER_SETTINGS_STORAGE_KEY)) {
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        apiBaseUrl: "https://your-model-provider.example.com",
        apiKey: "test-api-key",
        defaultModel: "gpt-5.5",
        fontSize: "md",
        autoGenerate: false,
        showStaleBanner: true,
      }),
    );
  }

  return (
    <ThemeProvider>
      <WorkspaceShellProvider>
        <WorkspaceRepositoryProvider repository={repository}>
          <WorkspaceSessionProvider>{children}</WorkspaceSessionProvider>
        </WorkspaceRepositoryProvider>
      </WorkspaceShellProvider>
    </ThemeProvider>
  );
}

export function createDiagramVersions(
  entries: Array<[DiagramType, number]>,
): Partial<Record<DiagramType, number>> {
  return Object.fromEntries(entries) as Partial<Record<DiagramType, number>>;
}
