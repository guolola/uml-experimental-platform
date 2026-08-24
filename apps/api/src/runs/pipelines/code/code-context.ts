// Builds the compact, stable context object used by code generation prompts.

import { createHash } from "node:crypto";
import {
  type CodeRunSnapshot,
  type DesignDiagramModelSpec,
} from "@uml-platform/contracts";

export function createStableCodeScaffold() {
  return {
    "/index.html": [
      "<!doctype html>",
      "<html>",
      "  <head>",
      "    <meta charset=\"UTF-8\" />",
      "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
      "    <title>UML Prototype</title>",
      "  </head>",
      "  <body>",
      "    <div id=\"root\"></div>",
      "    <script type=\"module\" src=\"/src/main.tsx\"></script>",
      "  </body>",
      "</html>",
    ].join("\n"),
    "/src/main.tsx": [
      "import React from 'react';",
      "import { createRoot } from 'react-dom/client';",
      "import App from './App';",
      "import './styles.css';",
      "",
      "createRoot(document.getElementById('root')!).render(",
      "  <React.StrictMode>",
      "    <App />",
      "  </React.StrictMode>,",
      ");",
    ].join("\n"),
    "/src/styles.css": [
      ":root {",
      "  --bg: #f6f8fb;",
      "  --surface: #ffffff;",
      "  --text: #172033;",
      "  --muted: #64748b;",
      "  --primary: #2563eb;",
      "  --border: #dbe4f0;",
      "  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
      "  color: var(--text);",
      "  background: var(--bg);",
      "}",
      "[data-theme=\"dark\"] { --bg: #111827; --surface: #1f2937; --text: #f8fafc; --muted: #cbd5e1; --primary: #60a5fa; --border: #334155; }",
      "",
      "* { box-sizing: border-box; }",
      "body { margin: 0; min-width: 320px; min-height: 100vh; background: var(--bg); }",
      "button, input, select, textarea { font: inherit; }",
      ".prototype-shell { min-height: 100vh; padding: 24px; color: var(--text); background: var(--bg); }",
    ].join("\n"),
    "/src/domain/types.ts": [
      "export interface PrototypeRecord {",
      "  id: string;",
      "  name: string;",
      "  status: string;",
      "}",
    ].join("\n"),
    "/src/data/mock-data.ts": [
      "import type { PrototypeRecord } from '../domain/types';",
      "",
      "export const mockData: PrototypeRecord[] = [];",
    ].join("\n"),
    "/src/components/WorkspaceShell.tsx": [
      "export function WorkspaceShell() {",
      "  return (",
      "    <main className=\"prototype-shell\">",
      "      <p>正在读取设计模型并生成业务原型...</p>",
      "    </main>",
      "  );",
      "}",
    ].join("\n"),
    "/src/App.tsx": [
      "import { WorkspaceShell } from './components/WorkspaceShell';",
      "",
      "export default function App() {",
      "  return <WorkspaceShell />;",
      "}",
    ].join("\n"),
  };
}

export function summarizeDesignModelForCode(model: DesignDiagramModelSpec) {
  const source = model as Record<string, unknown>;
  const limitArray = (value: unknown, maxItems: number) =>
    Array.isArray(value) ? value.slice(0, maxItems) : value;
  const base = {
    diagramKind: model.diagramKind,
    title: source.title,
    summary: source.summary,
    notes: source.notes,
    itemCounts: Object.fromEntries(
      Object.entries(source)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, (value as unknown[]).length]),
    ),
  };

  switch (model.diagramKind) {
    case "class":
      return {
        ...base,
        classes: limitArray(source.classes, 12),
        interfaces: limitArray(source.interfaces, 8),
        enums: limitArray(source.enums, 6),
        relationships: limitArray(source.relationships, 18),
      };
    case "activity":
      return {
        ...base,
        nodes: limitArray(source.nodes, 24),
        relationships: limitArray(source.relationships, 28),
        swimlanes: limitArray(source.swimlanes, 8),
      };
    case "sequence":
      return {
        ...base,
        participants: limitArray(source.participants, 14),
        messages: limitArray(source.messages, 24),
        fragments: limitArray(source.fragments, 8),
      };
    case "table":
      return {
        ...base,
        tables: limitArray(source.tables, 12),
        relationships: limitArray(source.relationships, 18),
      };
    case "deployment":
      return {
        ...base,
        nodes: limitArray(source.nodes, 10),
        databases: limitArray(source.databases, 6),
        components: limitArray(source.components, 12),
        externalSystems: limitArray(source.externalSystems, 6),
        artifacts: limitArray(source.artifacts, 8),
        relationships: limitArray(source.relationships, 18),
      };
    case "architecture":
      return {
        ...base,
        packages: limitArray(source.packages, 12),
        components: limitArray(source.components, 18),
        relationships: limitArray(source.relationships, 24),
      };
    case "component":
      return {
        ...base,
        components: limitArray(source.components, 18),
        interfaces: limitArray(source.interfaces, 12),
        relationships: limitArray(source.relationships, 24),
      };
    default:
      return base;
  }
}

export function buildCodeContext(snapshot: CodeRunSnapshot) {
  return {
    authority:
      "Design models define structure; accepted requirement baseline facts constrain executable behavior and must not be weakened.",
    acceptedRequirements:
      snapshot.requirementBaseline?.requirements
        .filter((requirement) => requirement.status === "accepted")
        .map((requirement) => ({
          id: requirement.id,
          sourceRuleId: requirement.sourceRuleId,
          actor: requirement.actor,
          action: requirement.action,
          condition: requirement.condition,
          outcome: requirement.outcome,
          sourceFragment: requirement.sourceFragment,
          acceptanceCriteria: requirement.acceptanceCriteria,
        })) ?? [],
    designModels: snapshot.designModels.map(summarizeDesignModelForCode),
    designPlantUml: snapshot.designPlantUml.map((artifact) => ({
      diagramKind: artifact.diagramKind,
      sourceLength: artifact.source.length,
    })),
    designToCodeMapping: snapshot.designToCodeMapping,
    designModelCoverageReport: snapshot.designModelCoverageReport,
    businessLogic: snapshot.businessLogic,
    loadedCodeSkill: snapshot.loadedCodeSkill
      ? {
          alias: snapshot.loadedCodeSkill.alias,
          name: snapshot.loadedCodeSkill.name,
          description: snapshot.loadedCodeSkill.description,
          source: snapshot.loadedCodeSkill.source,
          location: snapshot.loadedCodeSkill.location,
          baseDir: snapshot.loadedCodeSkill.baseDir,
          fileManifest: snapshot.loadedCodeSkill.fileManifest.map((file) => ({
            relativePath: file.relativePath,
            kind: file.kind,
            size: file.size,
          })),
      }
      : null,
    visualDirection: snapshot.visualDirection,
    skillResourceDiscoveryPlan: snapshot.skillResourceDiscoveryPlan
      ? {
          skillName: snapshot.skillResourceDiscoveryPlan.skillName,
          alias: snapshot.skillResourceDiscoveryPlan.alias,
          requests: snapshot.skillResourceDiscoveryPlan.requests.map((request) => ({
            path: request.path,
            reason: request.reason,
            expectedUse: request.expectedUse,
          })),
          diagnostics: snapshot.skillResourceDiscoveryPlan.diagnostics,
        }
      : null,
    skillResourcePreviews: snapshot.skillResourcePreviews
      ? {
          skillName: snapshot.skillResourcePreviews.skillName,
          alias: snapshot.skillResourcePreviews.alias,
          previews: snapshot.skillResourcePreviews.previews.map((preview) => ({
            path: preview.path,
            rowCount: preview.rowCount,
            headers: preview.headers,
            sampleRows: preview.sampleRows.slice(0, 3),
            matchedHints: preview.matchedHints,
            status: preview.status,
            errorMessage: preview.errorMessage,
          })),
          diagnostics: snapshot.skillResourcePreviews.diagnostics,
        }
      : null,
    skillResourcePlan: snapshot.skillResourcePlan
      ? {
          skillName: snapshot.skillResourcePlan.skillName,
          alias: snapshot.skillResourcePlan.alias,
          query: snapshot.skillResourcePlan.query,
          requests: snapshot.skillResourcePlan.requests.map((request) => ({
            resourceType: request.resourceType,
            name: request.name,
            csvPath: request.csvPath,
            stack: request.stack,
            domain: request.domain,
            actionName: request.actionName,
            maxResults: request.maxResults,
            reason: request.reason,
          })),
          diagnostics: snapshot.skillResourcePlan.diagnostics,
        }
      : null,
    codeSkillContext: snapshot.codeSkillContext
      ? {
          skillName: snapshot.codeSkillContext.skillName,
          alias: snapshot.codeSkillContext.alias,
          query: snapshot.codeSkillContext.query,
          actionResults: snapshot.codeSkillContext.actionResults.map((result) => ({
            name: result.name,
            status: result.status,
            outputFormat: result.outputFormat,
            exitCode: result.exitCode,
            stdoutLength: result.stdout.length,
            stderr: result.stderr,
            errorMessage: result.errorMessage,
          })),
          diagnostics: snapshot.codeSkillContext.diagnostics,
        }
      : null,
    appBlueprint: snapshot.appBlueprint,
    uiBlueprint: snapshot.uiBlueprint,
    uiMockup: snapshot.uiMockup
      ? {
          status: snapshot.uiMockup.status,
          model: snapshot.uiMockup.model,
          summary: snapshot.uiMockup.summary,
          imageUrl: snapshot.uiMockup.imageUrl,
          hasImageData: Boolean(snapshot.uiMockup.imageDataUrl),
          errorMessage: snapshot.uiMockup.errorMessage,
      }
      : null,
    uiReferenceSpec: snapshot.uiReferenceSpec,
    uiFidelityReport: snapshot.uiFidelityReport,
    designTokens: snapshot.designTokens,
    componentRegistry: snapshot.componentRegistry,
    uiIr: snapshot.uiIr,
    visualDiffReport: snapshot.visualDiffReport,
    repairLoopSummary: snapshot.repairLoopSummary,
    selectedCodeSkills: snapshot.selectedCodeSkills,
    skillDiagnostics: snapshot.skillDiagnostics,
    filePlan: snapshot.filePlan,
    constraints: {
      target: "React 18 + TypeScript + Sandpack front-end prototype",
      themePolicy:
        "Infer the business prototype theme from designModels, designPlantUml, and designToCodeMapping. Do not copy the UML platform workbench style unless the design model business domain calls for it.",
      requiredFiles: [
        "/src/App.tsx",
        "/src/components/WorkspaceShell.tsx",
        "/src/domain/types.ts",
        "/src/data/mock-data.ts",
        "/src/styles.css",
      ],
      fileStructurePolicy:
        "Generate 2-6 page files under /src/pages and at least 3 reusable components under /src/components. Keep App.tsx thin and avoid single-file prototypes.",
    },
  };
}

export function hashCodeContext(codeContext: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(codeContext))
    .digest("hex")
    .slice(0, 20);
}
