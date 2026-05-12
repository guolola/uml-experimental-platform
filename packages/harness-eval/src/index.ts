import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import type { DiagramKind, RunSnapshot } from "@uml-platform/contracts";

export interface EvalFixture {
  id: string;
  requirementText: string;
  selectedDiagrams: DiagramKind[];
}

export interface EvalCaseResult {
  fixtureId: string;
  status: RunSnapshot["status"] | "configuration_error";
  rulesCount: number;
  modelsCount: number;
  svgSuccessCount: number;
  diagramErrorCount: number;
  durationMs: number;
  errorMessage: string | null;
}

export interface EvalReport {
  generatedAt: string;
  mode: "mock" | "api";
  model: string;
  totals: {
    cases: number;
    completed: number;
    failed: number;
    svgSuccessCount: number;
    diagramErrorCount: number;
    durationMs: number;
  };
  results: EvalCaseResult[];
}

const DEFAULT_DIAGRAMS: DiagramKind[] = [
  "usecase",
  "class",
  "activity",
  "deployment",
];

function fixtureDir() {
  return fileURLToPath(new URL("../fixtures", import.meta.url));
}

export async function loadFixtures(): Promise<EvalFixture[]> {
  const dir = fixtureDir();
  const names = (await readdir(dir)).filter((name) => name.endsWith(".txt")).sort();
  return Promise.all(
    names.map(async (name) => ({
      id: basename(name, ".txt"),
      requirementText: (await readFile(join(dir, name), "utf8")).trim(),
      selectedDiagrams: DEFAULT_DIAGRAMS,
    })),
  );
}

export function assertProviderConfig(env: NodeJS.ProcessEnv) {
  if (env.UML_EVAL_MOCK === "1") return;
  const missing = [
    ["UML_EVAL_PROVIDER_API_BASE_URL", env.UML_EVAL_PROVIDER_API_BASE_URL],
    ["UML_EVAL_API_KEY", env.UML_EVAL_API_KEY],
    ["UML_EVAL_MODEL", env.UML_EVAL_MODEL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`缺少评测配置：${missing.join(", ")}`);
  }
}

function createMockSnapshot(fixture: EvalFixture): RunSnapshot {
  return {
    runId: `mock-${fixture.id}`,
    requirementText: fixture.requirementText,
    selectedDiagrams: fixture.selectedDiagrams,
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "系统应支持核心业务流程。",
        relatedDiagrams: ["usecase", "activity"],
      },
      {
        id: "r2",
        category: "数据需求",
        text: "系统应维护关键领域数据。",
        relatedDiagrams: ["class"],
      },
    ],
    models: [],
    plantUml: [],
    svgArtifacts: fixture.selectedDiagrams.map((diagramKind) => ({
      diagramKind,
      svg: `<svg><text>${diagramKind}</text></svg>`,
      renderMeta: {
        engine: "mock",
        generatedAt: new Date().toISOString(),
        sourceLength: 24,
        durationMs: 1,
      },
    })),
    diagramErrors: {},
    currentStage: "render_svg",
    status: "completed",
    errorMessage: null,
  };
}

async function runViaApi(fixture: EvalFixture, env: NodeJS.ProcessEnv) {
  const apiBaseUrl = env.UML_EVAL_API_BASE_URL ?? "http://127.0.0.1:4101";
  const start = await fetch(`${apiBaseUrl}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requirementText: fixture.requirementText,
      selectedDiagrams: fixture.selectedDiagrams,
      providerSettings: {
        apiBaseUrl: env.UML_EVAL_PROVIDER_API_BASE_URL,
        apiKey: env.UML_EVAL_API_KEY,
        model: env.UML_EVAL_MODEL,
      },
    }),
  });
  if (!start.ok) {
    throw new Error(`启动评测运行失败：HTTP ${start.status} ${await start.text()}`);
  }
  const { runId } = (await start.json()) as { runId: string };
  const deadline = Date.now() + Number(env.UML_EVAL_TIMEOUT_MS ?? 180000);

  while (Date.now() < deadline) {
    const response = await fetch(`${apiBaseUrl}/api/runs/${runId}`);
    if (!response.ok) {
      throw new Error(`读取评测运行失败：HTTP ${response.status}`);
    }
    const snapshot = (await response.json()) as RunSnapshot;
    if (snapshot.status === "completed" || snapshot.status === "failed") {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`评测运行超时：${runId}`);
}

function summarizeSnapshot(
  fixture: EvalFixture,
  snapshot: RunSnapshot,
  durationMs: number,
): EvalCaseResult {
  return {
    fixtureId: fixture.id,
    status: snapshot.status,
    rulesCount: snapshot.rules.length,
    modelsCount: snapshot.models.length,
    svgSuccessCount: snapshot.svgArtifacts.length,
    diagramErrorCount: Object.keys(snapshot.diagramErrors).length,
    durationMs,
    errorMessage: snapshot.errorMessage,
  };
}

export async function runEval(env: NodeJS.ProcessEnv = process.env): Promise<EvalReport> {
  assertProviderConfig(env);
  const fixtures = await loadFixtures();
  const mode = env.UML_EVAL_MOCK === "1" ? "mock" : "api";
  const results: EvalCaseResult[] = [];
  const startedAt = Date.now();

  for (const fixture of fixtures) {
    const caseStartedAt = Date.now();
    try {
      const snapshot =
        mode === "mock" ? createMockSnapshot(fixture) : await runViaApi(fixture, env);
      results.push(
        summarizeSnapshot(fixture, snapshot, Date.now() - caseStartedAt),
      );
    } catch (error) {
      results.push({
        fixtureId: fixture.id,
        status: "configuration_error",
        rulesCount: 0,
        modelsCount: 0,
        svgSuccessCount: 0,
        diagramErrorCount: 0,
        durationMs: Date.now() - caseStartedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    mode,
    model: env.UML_EVAL_MODEL ?? "mock",
    totals: {
      cases: results.length,
      completed: results.filter((item) => item.status === "completed").length,
      failed: results.filter((item) => item.status !== "completed").length,
      svgSuccessCount: results.reduce((sum, item) => sum + item.svgSuccessCount, 0),
      diagramErrorCount: results.reduce((sum, item) => sum + item.diagramErrorCount, 0),
      durationMs: Date.now() - startedAt,
    },
    results,
  };
}

export function renderMarkdownReport(report: EvalReport) {
  const lines: string[] = [];
  lines.push("# UML 生成质量评测报告", "");
  lines.push(`- 生成时间: ${report.generatedAt}`);
  lines.push(`- 模式: ${report.mode}`);
  lines.push(`- 模型: ${report.model}`);
  lines.push(`- 用例数: ${report.totals.cases}`);
  lines.push(`- 成功: ${report.totals.completed}`);
  lines.push(`- 失败: ${report.totals.failed}`);
  lines.push(`- SVG 成功数: ${report.totals.svgSuccessCount}`);
  lines.push(`- 单图失败数: ${report.totals.diagramErrorCount}`);
  lines.push("");
  lines.push("| Fixture | Status | Rules | Models | SVG | Diagram Errors | Duration | Error |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const result of report.results) {
    lines.push(
      [
        result.fixtureId,
        result.status,
        result.rulesCount,
        result.modelsCount,
        result.svgSuccessCount,
        result.diagramErrorCount,
        `${result.durationMs}ms`,
        result.errorMessage?.replace(/\|/g, "\\|") ?? "",
      ].join(" | "),
    );
  }
  return lines.join("\n");
}

async function writeReports(report: EvalReport, outputDir: string) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "eval-report.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(join(outputDir, "eval-report.md"), renderMarkdownReport(report), "utf8");
}

async function main() {
  const report = await runEval();
  const outputDir = process.env.UML_EVAL_OUTPUT_DIR;
  if (outputDir) {
    await writeReports(report, outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.totals.failed > 0) {
    process.exitCode = 1;
  }
}

const entrypoint = fileURLToPath(import.meta.url);
if (process.argv[1] && entrypoint === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
