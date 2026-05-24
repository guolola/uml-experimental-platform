// Verifies run-level coverage and traceability gates before downstream completion.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DesignDiagramModelSpec,
  DesignModelTraceabilityEntry,
  DiagramModelSpec,
  RequirementModelTraceabilityEntry,
} from "@uml-platform/contracts";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import {
  assertTrustedChainAllowsCompletion,
  buildDesignStageTrustedChain,
  buildRequirementStageTrustedChain,
  buildCodeStageTrustedChain,
} from "./trusted-chain-traceability.js";

const loginRule = {
  id: "r1",
  category: "业务规则" as const,
  text: "用户必须登录后才能访问主要功能。",
  relatedDiagrams: ["usecase" as const],
};

const refundRule = {
  id: "r2",
  category: "业务规则" as const,
  text: "管理员必须审批退款。",
  relatedDiagrams: ["usecase" as const],
};

const useCaseModel: DiagramModelSpec = {
  diagramKind: "usecase",
  title: "权限用例",
  summary: "登录后访问主要功能。",
  notes: [],
  actors: [
    {
      id: "actor-user",
      name: "用户",
      actorType: "human",
      responsibilities: ["登录后访问主要功能"],
    },
  ],
  useCases: [
    {
      id: "uc-login",
      name: "登录后访问主要功能",
      goal: "用户登录后访问主要功能",
      preconditions: ["用户已注册"],
      postconditions: ["系统允许访问主要功能"],
      supportingActorIds: [],
    },
  ],
  systemBoundaries: [],
  relationships: [],
};

const loginTrace: RequirementModelTraceabilityEntry[] = [
  {
    ruleId: "r1",
    target: {
      diagramKind: "usecase",
      elementId: "uc-login",
      elementKind: "usecase",
      label: "登录后访问主要功能",
    },
  },
];

test("buildRequirementStageTrustedChain marks accepted requirements as covered when traced", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-covered",
    requirementText: loginRule.text,
    rules: [loginRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const trustedChain = buildRequirementStageTrustedChain({
    runId: "run-covered",
    baseline,
    models: [useCaseModel],
    requirementModelTraceability: loginTrace,
  });

  assert.equal(trustedChain.coverageMatrix.rows[0]?.status, "covered");
  assert.equal(trustedChain.traceabilityMatrix.links.length >= 2, true);
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildRequirementStageTrustedChain blocks uncovered accepted requirements", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-uncovered",
    requirementText: `${loginRule.text}${refundRule.text}`,
    rules: [loginRule, refundRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const trustedChain = buildRequirementStageTrustedChain({
    runId: "run-uncovered",
    baseline,
    models: [useCaseModel],
    requirementModelTraceability: loginTrace,
  });

  assert.deepEqual(
    trustedChain.coverageMatrix.rows.map((row) => [row.requirementId, row.status]),
    [
      ["REQ-001", "covered"],
      ["REQ-002", "pending-review"],
    ],
  );
  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "uncovered-requirement",
    ),
    true,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildRequirementStageTrustedChain blocks orphan model artifacts", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-orphan-model",
    requirementText: loginRule.text,
    rules: [loginRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const modelWithOrphan: DiagramModelSpec = {
    ...useCaseModel,
    useCases: [
      ...useCaseModel.useCases,
      {
        id: "uc-orphan",
        name: "孤立功能",
        goal: "没有需求来源的功能",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      },
    ],
  };
  const trustedChain = buildRequirementStageTrustedChain({
    runId: "run-orphan-model",
    baseline,
    models: [modelWithOrphan],
    requirementModelTraceability: loginTrace,
  });

  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "orphan-artifact",
    ),
    true,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildRequirementStageTrustedChain blocks shallow placeholder traceability", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-shallow",
    requirementText: loginRule.text,
    rules: [loginRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const shallowModel: DiagramModelSpec = {
    ...useCaseModel,
    useCases: [
      {
        id: "uc-placeholder",
        name: "Placeholder",
        goal: "Placeholder",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      },
    ],
  };
  const trustedChain = buildRequirementStageTrustedChain({
    runId: "run-shallow",
    baseline,
    models: [shallowModel],
    requirementModelTraceability: [
      {
        ruleId: "r1",
        target: {
          diagramKind: "usecase",
          elementId: "uc-placeholder",
          elementKind: "usecase",
          label: "Placeholder",
        },
      },
    ],
  });

  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "shallow-trace",
    ),
    true,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildRequirementStageTrustedChain blocks semantically mismatched use case coverage", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-semantic-usecase-gap",
    requirementText: loginRule.text,
    rules: [loginRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const mismatchedModel: DiagramModelSpec = {
    ...useCaseModel,
    useCases: [
      {
        id: "uc-generate",
        name: "生成模型",
        goal: "根据需求生成 UML 模型",
        preconditions: ["已输入需求文本"],
        postconditions: ["系统返回结构化模型与图"],
        supportingActorIds: [],
      },
    ],
  };
  const trustedChain = buildRequirementStageTrustedChain({
    runId: "run-semantic-usecase-gap",
    baseline,
    models: [mismatchedModel],
    requirementModelTraceability: [
      {
        ruleId: "r1",
        target: {
          diagramKind: "usecase",
          elementId: "uc-generate",
          elementKind: "usecase",
          label: "生成模型",
        },
      },
    ],
  });

  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "semantic-model-gap",
    ),
    true,
  );
  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.every(
      (diagnostic) =>
        diagnostic.code !== "semantic-model-gap" || !diagnostic.blocksCompletion,
    ),
    true,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildRequirementStageTrustedChain does not accept object-only word matches as semantic coverage", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-object-only-gap",
    requirementText: refundRule.text,
    rules: [refundRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const objectOnlyModel: DiagramModelSpec = {
    diagramKind: "usecase",
    title: "退款记录",
    summary: "只查看退款相关记录，没有审批动作。",
    notes: [],
    actors: [
      {
        id: "actor-admin",
        name: "管理员",
        actorType: "human",
        responsibilities: ["查看退款记录"],
      },
    ],
    useCases: [
      {
        id: "uc-view-refunds",
        name: "查看退款记录",
        goal: "管理员查看退款记录",
        preconditions: [],
        postconditions: ["系统显示退款列表"],
        supportingActorIds: [],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
  const trustedChain = buildRequirementStageTrustedChain({
    runId: "run-object-only-gap",
    baseline,
    models: [objectOnlyModel],
    requirementModelTraceability: [
      {
        ruleId: "r2",
        target: {
          diagramKind: "usecase",
          elementId: "uc-view-refunds",
          elementKind: "usecase",
          label: "查看退款记录",
        },
      },
    ],
  });

  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "semantic-model-gap",
    ),
    true,
  );
  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.every(
      (diagnostic) =>
        diagnostic.code !== "semantic-model-gap" || !diagnostic.blocksCompletion,
    ),
    true,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildRequirementStageTrustedChain accepts action and object slot evidence without exact sentence matching", () => {
  const generateRule = {
    id: "r3",
    category: "业务规则" as const,
    text: "研究人员可以根据文本需求生成 UML 模型。",
    relatedDiagrams: ["usecase" as const],
  };
  const baseline = buildRequirementBaseline({
    runId: "run-action-object-slots",
    requirementText: generateRule.text,
    rules: [generateRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const model: DiagramModelSpec = {
    diagramKind: "usecase",
    title: "模型生成",
    summary: "根据需求生成 UML 模型。",
    notes: [],
    actors: [
      {
        id: "actor-researcher",
        name: "研究人员",
        actorType: "human",
        responsibilities: ["提交文本需求"],
      },
    ],
    useCases: [
      {
        id: "uc-generate-model",
        name: "生成模型",
        goal: "根据需求生成 UML 模型",
        preconditions: ["已输入需求文本"],
        postconditions: ["系统返回结构化模型与图"],
        supportingActorIds: [],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
  const trustedChain = buildRequirementStageTrustedChain({
    runId: "run-action-object-slots",
    baseline,
    models: [model],
    requirementModelTraceability: [
      {
        ruleId: "r3",
        target: {
          diagramKind: "usecase",
          elementId: "uc-generate-model",
          elementKind: "usecase",
          label: "生成模型",
        },
      },
    ],
  });

  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "semantic-model-gap",
    ),
    false,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildDesignStageTrustedChain records sequence model explanation gaps as hints", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-sequence-semantic-gap",
    requirementText: loginRule.text,
    rules: [loginRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const sequenceOnlyParticipants: DesignDiagramModelSpec = {
    diagramKind: "sequence",
    modelId: "sequence:uc-login",
    sourceUseCaseId: "uc-login",
    sourceUseCaseName: "登录后访问主要功能",
    title: "登录后访问顺序图",
    summary: "只列出参与者，没有说明登录后访问流程。",
    notes: [],
    participants: [
      { id: "user", name: "用户", participantType: "actor" },
      { id: "system", name: "系统", participantType: "control" },
    ],
    messages: [],
    fragments: [],
  };
  const designTraceability: DesignModelTraceabilityEntry[] = [
    {
      source: {
        modelId: "sequence:uc-login",
        diagramKind: "sequence",
        elementId: "user",
        elementKind: "participant",
        label: "用户",
      },
      targets: [
        {
          diagramKind: "usecase",
          elementId: "uc-login",
          elementKind: "usecase",
          label: "登录后访问主要功能",
        },
      ],
    },
    {
      source: {
        modelId: "sequence:uc-login",
        diagramKind: "sequence",
        elementId: "system",
        elementKind: "participant",
        label: "系统",
      },
      targets: [
        {
          diagramKind: "usecase",
          elementId: "uc-login",
          elementKind: "usecase",
          label: "登录后访问主要功能",
        },
      ],
    },
  ];

  const trustedChain = buildDesignStageTrustedChain({
    runId: "run-sequence-semantic-gap",
    baseline,
    models: [useCaseModel],
    requirementModelTraceability: loginTrace,
    designModels: [sequenceOnlyParticipants],
    designModelTraceability: designTraceability,
  });

  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "semantic-model-gap",
    ),
    true,
  );
  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.every(
      (diagnostic) =>
        diagnostic.code !== "semantic-model-gap" || !diagnostic.blocksCompletion,
    ),
    true,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildDesignStageTrustedChain accepts workflow substeps when one design element explains the requirement", () => {
  const generateRule = {
    id: "r3",
    category: "业务规则" as const,
    text: "研究人员可以根据文本需求生成 UML 模型。",
    relatedDiagrams: ["usecase" as const],
  };
  const baseline = buildRequirementBaseline({
    runId: "run-design-grouped-semantics",
    requirementText: generateRule.text,
    rules: [generateRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const requirementModel: DiagramModelSpec = {
    diagramKind: "usecase",
    title: "模型生成",
    summary: "根据需求生成 UML 模型。",
    notes: [],
    actors: [],
    useCases: [
      {
        id: "uc-generate-model",
        name: "生成模型",
        goal: "根据需求生成 UML 模型",
        preconditions: ["已输入需求文本"],
        postconditions: ["系统返回 UML 模型"],
        supportingActorIds: [],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
  const designModel: DesignDiagramModelSpec = {
    diagramKind: "activity",
    modelId: "activity:generate-model",
    title: "生成模型活动",
    summary: "提交需求后生成 UML 模型。",
    notes: [],
    swimlanes: [],
    nodes: [
      { id: "submit", type: "activity", name: "提交需求", input: ["需求"], output: ["请求"] },
      { id: "generate", type: "activity", name: "生成 UML 模型", input: ["请求"], output: ["UML 模型"] },
    ],
    relationships: [],
  };
  const trustedChain = buildDesignStageTrustedChain({
    runId: "run-design-grouped-semantics",
    baseline,
    models: [requirementModel],
    requirementModelTraceability: [
      {
        ruleId: "r3",
        target: {
          diagramKind: "usecase",
          elementId: "uc-generate-model",
          elementKind: "usecase",
          label: "生成模型",
        },
      },
    ],
    designModels: [designModel],
    designModelTraceability: [
      {
        source: {
          modelId: "activity:generate-model",
          diagramKind: "activity",
          elementId: "submit",
          elementKind: "activity-node",
          label: "提交需求",
        },
        targets: [
          {
            diagramKind: "usecase",
            elementId: "uc-generate-model",
            elementKind: "usecase",
            label: "生成模型",
          },
        ],
      },
      {
        source: {
          modelId: "activity:generate-model",
          diagramKind: "activity",
          elementId: "generate",
          elementKind: "activity-node",
          label: "生成 UML 模型",
        },
        targets: [
          {
            diagramKind: "usecase",
            elementId: "uc-generate-model",
            elementKind: "usecase",
            label: "生成模型",
          },
        ],
      },
    ],
  });

  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "semantic-model-gap",
    ),
    false,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildRequirementStageTrustedChain preserves non-functional requirements as not modelable review paths", () => {
  const performanceRule = {
    id: "r3",
    category: "非功能需求" as const,
    text: "系统响应时间不超过2秒。",
    relatedDiagrams: ["deployment" as const],
  };
  const baseline = buildRequirementBaseline({
    runId: "run-nfr-not-modelable",
    requirementText: performanceRule.text,
    rules: [performanceRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const trustedChain = buildRequirementStageTrustedChain({
    runId: "run-nfr-not-modelable",
    baseline,
    models: [],
    requirementModelTraceability: [],
  });
  const row = trustedChain.coverageMatrix.rows[0];

  assert.equal(row?.status, "not-modelable");
  assert.match(row?.rationale ?? "", /alternative evidence|替代证据/i);
  assert.deepEqual(row?.reviewItems, ["alternative-evidence:REQ-001"]);
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildCodeStageTrustedChain blocks non-infrastructure code without requirement links", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-code-orphan",
    requirementText: loginRule.text,
    rules: [loginRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const trustedChain = buildCodeStageTrustedChain({
    runId: "run-code-orphan",
    baseline,
    files: {
      "/src/App.tsx": "export default function App(){ return <main>Dashboard</main>; }",
      "/src/docs/business-context.md": `# Business Context\n- ${loginRule.text}`,
    },
  });

  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "orphan-artifact",
    ),
    true,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildCodeStageTrustedChain blocks behavior requirements without passing business assertions", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-code-assertion-gap",
    requirementText: loginRule.text,
    rules: [loginRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const trustedChain = buildCodeStageTrustedChain({
    runId: "run-code-assertion-gap",
    baseline,
    files: {
      "/src/App.tsx": "export default function App(){ return <button>登录后访问主要功能</button>; }",
      "/BUSINESS_CONTEXT.md": `# Business Context\n- ${loginRule.text}`,
    },
    businessAssertionResults: {
      runId: "run-code-assertion-gap",
      generatedAt: "2026-05-24T00:00:00.000Z",
      passed: false,
      blockingFailureIds: ["CBA-001"],
      assertions: [
        {
          id: "CBA-001",
          requirementId: "REQ-001",
          category: "permission",
          description: "用户必须登录后才能访问主要功能。",
          expectedBehavior: "访问主要功能前必须校验登录状态。",
          verificationMethod: "static-code-scan",
          evidenceArtifacts: ["/src/App.tsx"],
          status: "failed",
          severity: "critical",
          message: "UI text mentions the requirement but no permission guard or behavior check was found.",
        },
      ],
    },
  });

  assert.equal(
    trustedChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "business-assertion-gap",
    ),
    true,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});

test("buildCodeStageTrustedChain links passing business assertions as requirement tests", () => {
  const baseline = buildRequirementBaseline({
    runId: "run-code-assertion-pass",
    requirementText: loginRule.text,
    rules: [loginRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const trustedChain = buildCodeStageTrustedChain({
    runId: "run-code-assertion-pass",
    baseline,
    files: {
      "/src/App.tsx":
        "const isLoggedIn = true; export default function App(){ return isLoggedIn ? <main>登录后访问主要功能</main> : <main>请先登录</main>; }",
      "/BUSINESS_CONTEXT.md": `# Business Context\n- ${loginRule.text}`,
    },
    businessAssertionResults: {
      runId: "run-code-assertion-pass",
      generatedAt: "2026-05-24T00:00:00.000Z",
      passed: true,
      blockingFailureIds: [],
      assertions: [
        {
          id: "CBA-001",
          requirementId: "REQ-001",
          category: "permission",
          description: "用户必须登录后才能访问主要功能。",
          expectedBehavior: "访问主要功能前必须校验登录状态。",
          verificationMethod: "static-code-scan",
          evidenceArtifacts: ["/src/App.tsx"],
          status: "passed",
          severity: "critical",
          message: "Found permission guard evidence.",
        },
      ],
    },
  });

  assert.deepEqual(trustedChain.coverageMatrix.rows[0]?.tests, ["test:CBA-001"]);
  assert.equal(
    trustedChain.traceabilityMatrix.links.some(
      (link) =>
        link.fromArtifactType === "requirement" &&
        link.toArtifactType === "test" &&
        link.toArtifactId === "CBA-001",
    ),
    true,
  );
  assert.doesNotThrow(() => assertTrustedChainAllowsCompletion(trustedChain));
});
